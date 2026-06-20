import jsPDF from "jspdf";
import type { ConversionProgress, ImageItem, PdfSettings, ProcessedPreview } from "./types";
import { getFileExt, isHeicFile } from "./imageUtils";

interface PageDims {
  w: number;
  h: number;
}

const PAGE_SIZES: Record<"a4" | "letter", PageDims> = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
};

export async function convertImagesToPDF(
  items: ImageItem[],
  settings: PdfSettings,
  signal: AbortSignal,
  onProgress?: (progress: ConversionProgress) => void,
) {
  let pdf: jsPDF | null = null;
  const total = items.length;

  for (let index = 0; index < items.length; index += 1) {
    if (signal.aborted) {
      throw new Error("Cancelled");
    }

    const item = items[index];
    const processed = await processFile(item.file, settings.quality / 100, item.name, index, total);
    onProgress?.({
      current: index + 1,
      total,
      step: getStep(index, total),
      preview: processed.preview,
    });

    const pageDims = getPageDims(settings.pageSize, settings.orientation, processed.width, processed.height);
    const pdfW = pageDims.w;
    const pdfH = pageDims.h;
    const marginMm = settings.margin * 0.264583;

    if (!pdf) {
      pdf = new jsPDF({
        orientation: settings.orientation === "landscape" ? "l" : "p",
        unit: "mm",
        format: settings.pageSize === "fit" ? [pdfW, pdfH] : settings.pageSize,
      });
    } else {
      pdf.addPage([pageDims.w, pageDims.h]);
    }

    const availW = pdfW - marginMm * 2;
    const availH = pdfH - marginMm * 2;
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
        pdf.text(`Page ${pageIndex} of ${total}`, pdfW - marginMm, pdfH - 6, { align: "right" });
      }

      if (settings.watermark) {
        pdf.setFontSize(12);
        pdf.setTextColor(212, 165, 116);
        pdf.text("Made with Sathuuty", marginMm, pdfH - 6);
      }
    }

    if ((index + 1) % 5 === 0) {
      await yieldToBrowser();
    }
  }

  if (!pdf) throw new Error("No images provided");
  return pdf.output("blob");
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

async function processFile(file: File, quality: number, name: string, index: number, total: number) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const MAX = 4096;
  let { naturalWidth: width, naturalHeight: height } = image;

  if (width > MAX || height > MAX) {
    const ratio = Math.min(MAX / width, MAX / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.drawImage(image, 0, 0, width, height);
  const optimized = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);

  return {
    dataUrl: optimized,
    width,
    height,
    preview: {
      id: `${index}-${total}`,
      name,
      dataUrl: optimized,
    } satisfies ProcessedPreview,
  };
}

async function fileToDataUrl(file: File) {
  if (isHeicFile(file)) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return blobToDataUrl(blob);
  }

  return blobToDataUrl(file);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = src;
  });
}

function getPdfImageFormat(file: File) {
  const ext = getFileExt(file.name);
  if (file.type === "image/png" || ext === "png") return "PNG";
  return "JPEG";
}

function getStep(index: number, total: number) {
  const pct = (index + 1) / total;
  if (pct < 0.2) return "Decoding HEIC files...";
  if (pct < 0.6) return "Rendering to canvas...";
  if (pct < 0.9) return "Stitching pages together...";
  return "Adding the final touches...";
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
