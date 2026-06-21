import { PDFDocument } from "pdf-lib";
import { cleanupJob, listPdfParts } from "@/lib/pdfJobStore";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { jobId } = await params;
  let filename = "merged.pdf";

  try {
    const body = (await request.json().catch(() => ({}))) as { filename?: string };
    if (typeof body.filename === "string" && body.filename.trim()) {
      filename = body.filename.trim().replace(/["\r\n]/g, "_");
    }
  } catch {
    // Ignore invalid JSON and fall back to the default filename.
  }

  try {
    const partFiles = await listPdfParts(jobId);
    if (!partFiles.length) {
      return new Response("No PDF parts were stored for this job", { status: 400 });
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
