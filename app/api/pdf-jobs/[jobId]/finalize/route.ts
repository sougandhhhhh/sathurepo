import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { cleanupJob, listJobImages, listPdfParts } from "@/lib/pdfJobStore";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

type PdfSettings = {
  pageSize?: "a4" | "letter" | "fit";
  orientation?: "portrait" | "landscape";
  quality?: number;
  margin?: number;
  filename?: string;
  watermark?: boolean;
  pageNumbers?: boolean;
};

const MM_TO_PT = 72 / 25.4;
const PAGE_SIZES = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
} as const;
const MAX_CANVAS_SIDE = 4096;
const MAX_CANVAS_PIXELS = 16_000_000;

export async function POST(request: Request, { params }: RouteContext) {
  const { jobId } = await params;
  let filename = "merged.pdf";
  let settings: PdfSettings = {};

  try {
    const body = (await request.json().catch(() => ({}))) as { filename?: string; settings?: PdfSettings };
    if (typeof body.filename === "string" && body.filename.trim()) {
      filename = body.filename.trim().replace(/["\r\n]/g, "_");
    }
    if (body.settings && typeof body.settings === "object") {
      settings = body.settings;
    }
  } catch {
    // Ignore invalid JSON and fall back to the default filename.
  }

  try {
    const imageFiles = await listJobImages(jobId);
    const partFiles = await listPdfParts(jobId);
    if (imageFiles.length) {
      const pdfBytes = await renderImagesToPdf(imageFiles, settings);
      return new Response(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (!partFiles.length) {
      return new Response("No PDF parts or images were stored for this job", { status: 400 });
    }

    const mergedPdf = await PDFDocument.create();

    for (const filePath of partFiles) {
      const bytes = await readFile(filePath);
      const sourcePdf = await PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    return new Response(Buffer.from(mergedBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await cleanupJob(jobId);
  }
}

async function renderImagesToPdf(imageFiles: string[], settings: PdfSettings) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const quality = getServerQuality(settings.quality ?? 85);
  const pageSize = settings.pageSize ?? "a4";
  const orientation = settings.orientation ?? "portrait";
  const marginMm = settings.margin ?? 12;
  const marginPt = marginMm * MM_TO_PT;

  for (const filePath of imageFiles) {
    const input = await readFile(filePath);
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const naturalWidth = meta.width ?? 1;
    const naturalHeight = meta.height ?? 1;
    const { width, height } = clampDimensions(naturalWidth, naturalHeight);

    const jpeg = await sharp(input, { failOn: "none" })
      .rotate()
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality })
      .toBuffer();

    const embedded = await pdf.embedJpg(jpeg);
    const pageDims = getPageDimsPt(pageSize, orientation, width, height);
    const page = pdf.addPage([pageDims.w, pageDims.h]);

    const availW = pageDims.w - marginPt * 2;
    const availH = pageDims.h - marginPt * 2;
    const imageAspect = width / height;
    const pageAspect = availW / availH;

    let drawW = availW;
    let drawH = availH;
    if (imageAspect > pageAspect) {
      drawH = availW / imageAspect;
    } else {
      drawW = availH * imageAspect;
    }

    const x = marginPt + (availW - drawW) / 2;
    const y = marginPt + (availH - drawH) / 2;
    page.drawImage(embedded, { x, y, width: drawW, height: drawH });

    if (settings.pageNumbers) {
      page.drawText(`Page ${pdf.getPageCount()} of ${imageFiles.length}`, {
        x: pageDims.w - marginPt - 70,
        y: 10,
        size: 10,
        font,
        color: rgb(0.63, 0.5, 0.56),
      });
    }

    if (settings.watermark) {
      page.drawText("Made with Welcome, Sathu", {
        x: marginPt,
        y: 10,
        size: 12,
        font,
        color: rgb(0.83, 0.65, 0.45),
      });
    }
  }

  return pdf.save();
}

function getServerQuality(quality: number) {
  return Math.max(45, Math.min(quality, 88));
}

function clampDimensions(naturalWidth: number, naturalHeight: number) {
  let w = naturalWidth;
  let h = naturalHeight;

  if (w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE) {
    const ratio = Math.min(MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const pixels = w * h;
  if (pixels > MAX_CANVAS_PIXELS) {
    const ratio = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  return { width: Math.max(1, w), height: Math.max(1, h) };
}

function getPageDimsPt(
  pageSize: PdfSettings["pageSize"],
  orientation: PdfSettings["orientation"],
  widthPx: number,
  heightPx: number,
) {
  if (pageSize === "fit") {
    const w = widthPx * MM_TO_PT * 0.264583;
    const h = heightPx * MM_TO_PT * 0.264583;
    return orientation === "landscape" ? { w: h, h: w } : { w, h };
  }

  const base = PAGE_SIZES[pageSize ?? "a4"];
  const dims = orientation === "landscape" ? { w: base.h, h: base.w } : base;
  return { w: dims.w * MM_TO_PT, h: dims.h * MM_TO_PT };
}
