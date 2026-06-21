import jsPDF from "jspdf";
import type { ConversionProgress, ImageItem, PdfSettings, ProcessedPreview } from "./types";
import { getFileExt, iosLog, isHeicByMagicBytes, isHeicFile, yieldToMain } from "./imageUtils";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum canvas dimension WebKit reliably supports without OOM kill */
const MAX_CANVAS_SIDE = 4096;

/** iOS GPU memory budget per canvas is ~256 MB; keep well under that */
const MAX_CANVAS_PIXELS = 16_000_000; // ~4000×4000

/** ms to wait before declaring an image decode timed out */
const DECODE_TIMEOUT_MS = 30_000;

/** Number of retries on image decode failure */
const DECODE_RETRIES = 2;

/** Pause every N images to yield to the iOS watchdog timer */
const YIELD_EVERY = 3;

interface PageDims {
  w: number;
  h: number;
}

const PAGE_SIZES: Record<"a4" | "letter", PageDims> = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function convertImagesToPDF(
  items: ImageItem[],
  settings: PdfSettings,
  signal: AbortSignal,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<Blob> {
  let pdf: jsPDF | null = null;
  const total = items.length;

  for (let index = 0; index < items.length; index += 1) {
    if (signal.aborted) {
      throw new Error("Cancelled");
    }

    // Yield to the iOS watchdog every YIELD_EVERY images
    if (index > 0 && index % YIELD_EVERY === 0) {
      await yieldToMain();
    }

    const item = items[index];
    iosLog("info", "PDF", `Processing [${index + 1}/${total}]`, {
      name: item.name,
      type: item.file.type,
      size: item.file.size,
      isHeic: item.isHeic,
    });

    let processed: ProcessedResult;
    try {
      processed = await processFile(item, settings.quality / 100);
    } catch (err) {
      // Log and skip broken images rather than aborting the whole conversion
      iosLog("error", "PDF", `Skipping [${item.name}] — processFile failed`, {
        err: String(err),
      });
      onProgress?.({
        current: index + 1,
        total,
        step: getStep(index, total),
      });
      continue;
    }

    onProgress?.({
      current: index + 1,
      total,
      step: getStep(index, total),
      preview: processed.preview,
    });

    const pageDims = getPageDims(
      settings.pageSize,
      settings.orientation,
      processed.width,
      processed.height,
    );
    const marginMm = settings.margin * 0.264583;

    if (!pdf) {
      pdf = new jsPDF({
        orientation: settings.orientation === "landscape" ? "l" : "p",
        unit: "mm",
        format:
          settings.pageSize === "fit" ? [pageDims.w, pageDims.h] : settings.pageSize,
      });
    } else {
      pdf.addPage([pageDims.w, pageDims.h]);
    }

    const availW = pageDims.w - marginMm * 2;
    const availH = pageDims.h - marginMm * 2;
    const imageAspect = processed.width / processed.height;
    const pageAspect = availW / availH;

    let drawW = availW;
    let drawH = availH;
    if (imageAspect > pageAspect) {
      drawH = availW / imageAspect;
    } else {
      drawW = availH * imageAspect;
    }

    const x = marginMm + (availW - drawW) / 2;
    const y = marginMm + (availH - drawH) / 2;
    const format = getPdfImageFormat(item.file);

    pdf.addImage(processed.dataUrl, format, x, y, drawW, drawH, undefined, "FAST");

    if (settings.watermark || settings.pageNumbers) {
      const pageIndex = pdf.getNumberOfPages();
      pdf.setPage(pageIndex);
      pdf.setFontSize(10);
      pdf.setTextColor(160, 128, 144);

      if (settings.pageNumbers) {
        pdf.text(`Page ${pageIndex} of ${total}`, pageDims.w - marginMm, pageDims.h - 6, {
          align: "right",
        });
      }

      if (settings.watermark) {
        pdf.setFontSize(12);
        pdf.setTextColor(212, 165, 116);
        pdf.text("Made with Welcome, Sathu", marginMm, pageDims.h - 6);
      }
    }

    iosLog("info", "PDF", `Page ${index + 1} added`, {
      name: item.name,
      w: processed.width,
      h: processed.height,
    });
  }

  if (!pdf) throw new Error("No images could be processed");
  return pdf.output("blob");
}

// ─── Processing ───────────────────────────────────────────────────────────────

interface ProcessedResult {
  dataUrl: string;
  width: number;
  height: number;
  preview: ProcessedPreview;
}

async function processFile(
  item: ImageItem,
  quality: number,
): Promise<ProcessedResult> {
  // Step 1: Resolve whether this file is actually HEIC
  // (magic byte check catches iOS files reported as image/jpeg)
  const heic = item.isHeic || (await isActuallyHeic(item.file));

  // Step 2: Decode to a renderable data URL
  const dataUrl = await fileToDataUrlSafe(item.file, heic, item.name);

  // Step 3: Load as HTMLImageElement with retry + timeout
  const image = await loadImageWithRetry(dataUrl, item.name);

  // Step 4: Compute clamped output dimensions
  const { width, height } = clampDimensions(
    image.naturalWidth,
    image.naturalHeight,
  );

  // Step 5: Draw on canvas, extract JPEG data URL, then destroy canvas
  const optimized = await drawToCanvas(image, width, height, quality, item.file);

  iosLog("info", "processFile", "Success", {
    name: item.name,
    origW: image.naturalWidth,
    origH: image.naturalHeight,
    outW: width,
    outH: height,
    heic,
  });

  return {
    dataUrl: optimized,
    width,
    height,
    preview: {
      id: `${item.id}`,
      name: item.name,
      dataUrl: optimized,
    },
  };
}

/**
 * Returns true if the file needs HEIC conversion even when isHeic flag is false.
 * Handles iCloud-originated images and Live Photo exports that arrive as
 * image/jpeg but are secretly HEIC containers.
 */
async function isActuallyHeic(file: File): Promise<boolean> {
  if (isHeicFile(file)) return true;
  const safeMimes = ["image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];
  if (safeMimes.includes(file.type.toLowerCase())) return false;
  return isHeicByMagicBytes(file);
}

/**
 * Convert any file (including HEIC) to a browser-renderable data URL.
 * Falls back gracefully if heic2any fails.
 */
async function fileToDataUrlSafe(
  file: File,
  isHeic: boolean,
  name: string,
): Promise<string> {
  if (isHeic) {
    iosLog("info", "fileToDataUrl", "Converting HEIC via heic2any", { name });
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.92,
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      iosLog("info", "fileToDataUrl", "heic2any success", {
        name,
        outSize: blob.size,
      });
      return blobToDataUrl(blob);
    } catch (err) {
      iosLog("error", "fileToDataUrl", "heic2any failed, trying raw blob", {
        name,
        err: String(err),
      });
      // Last resort — try raw blob (works if Safari can natively render this HEIC)
      return blobToDataUrl(file);
    }
  }

  return blobToDataUrl(file);
}

/**
 * Load an HTMLImageElement from a data URL.
 * Uses img.decode() (Safari 15.4+) for proper async GPU decode.
 * Falls back to onload + onerror with a timeout watchdog.
 * Retries up to DECODE_RETRIES times on failure.
 */
async function loadImageWithRetry(
  src: string,
  name: string,
): Promise<HTMLImageElement> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 1 + DECODE_RETRIES; attempt++) {
    try {
      const img = await loadImageOnce(src, name);
      if (attempt > 1) {
        iosLog("info", "loadImage", `Succeeded on attempt ${attempt}`, { name });
      }
      return img;
    } catch (err) {
      lastError = err as Error;
      iosLog("warn", "loadImage", `Attempt ${attempt} failed`, {
        name,
        err: String(err),
      });
      if (attempt < 1 + DECODE_RETRIES) {
        // Small pause before retry — gives iOS memory pressure time to ease
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  throw lastError ?? new Error(`Failed to decode image: ${name}`);
}

function loadImageOnce(src: string, name: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(img);
    };

    const timer = setTimeout(() => {
      done(new Error(`Decode timeout after ${DECODE_TIMEOUT_MS}ms: ${name}`));
    }, DECODE_TIMEOUT_MS);

    img.onload = () => {
      // Prefer img.decode() — ensures the image is actually GPU-decoded
      // before we try to draw it to canvas. Without this, drawImage() on
      // iOS can silently produce a blank result.
      if (typeof img.decode === "function") {
        img
          .decode()
          .then(() => done())
          .catch(() => {
            // decode() can reject on iOS for large images under memory pressure.
            // Fall through to onload resolution which may still work.
            iosLog("warn", "loadImage", "img.decode() rejected, using onload", { name });
            done();
          });
      } else {
        done();
      }
    };

    img.onerror = () => done(new Error(`img.onerror fired for: ${name}`));
    img.src = src;
  });
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

/**
 * Draw image to a canvas and extract a JPEG data URL.
 * 
 * CRITICAL iOS rules:
 * 1. Canvas must be explicitly set to 0×0 after use — this releases the GPU
 *    texture immediately rather than waiting for GC.
 * 2. context must be explicitly lost via `canvas.getContext('2d')` reset trick.
 * 3. Never keep canvas references alive after this function returns.
 */
async function drawToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
  file: File,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    // Fallback: return the dataUrl as-is (already loaded)
    iosLog("warn", "canvas", "Failed to get 2d context, skipping canvas step");
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Canvas context unavailable");
  }

  // White background — prevents transparent PNGs becoming black in PDF
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  try {
    ctx.drawImage(img, 0, 0, width, height);
  } catch (err) {
    iosLog("error", "canvas", "drawImage failed", { err: String(err) });
    // Destroy canvas before throwing
    canvas.width = 0;
    canvas.height = 0;
    throw err;
  }

  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, mime === "image/jpeg" ? quality : undefined);

  // ← Explicit canvas destruction to release GPU memory on iOS
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

// ─── Dimension clamping ───────────────────────────────────────────────────────

function clampDimensions(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  let w = naturalWidth;
  let h = naturalHeight;

  // Clamp per-side
  if (w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE) {
    const ratio = Math.min(MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  // Clamp total pixel count to avoid GPU OOM on iOS
  const pixels = w * h;
  if (pixels > MAX_CANVAS_PIXELS) {
    const ratio = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  return { width: Math.max(1, w), height: Math.max(1, h) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function getPageDims(
  pageSize: PdfSettings["pageSize"],
  orientation: PdfSettings["orientation"],
  width: number,
  height: number,
): PageDims {
  if (pageSize === "fit") {
    const w = width * 0.264583;
    const h = height * 0.264583;
    return orientation === "landscape" ? { w: h, h: w } : { w, h };
  }
  const base = PAGE_SIZES[pageSize];
  return orientation === "landscape" ? { w: base.h, h: base.w } : base;
}

function getPdfImageFormat(file: File): string {
  const ext = getFileExt(file.name);
  if (file.type === "image/png" || ext === "png") return "PNG";
  return "JPEG";
}

function getStep(index: number, total: number): string {
  const pct = (index + 1) / total;
  if (pct < 0.2) return "Decoding HEIC files...";
  if (pct < 0.6) return "Rendering to canvas...";
  if (pct < 0.9) return "Stitching pages together...";
  return "Adding the final touches...";
}
