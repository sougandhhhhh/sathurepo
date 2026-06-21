import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const filename = formData.get("filename");
  const parts = formData.getAll("parts").filter((part): part is File => part instanceof File);

  if (!parts.length) {
    return new Response("No PDF parts were provided", { status: 400 });
  }

  const mergedPdf = await PDFDocument.create();

  for (const part of parts) {
    const bytes = await part.arrayBuffer();
    const sourcePdf = await PDFDocument.load(bytes);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  const safeName =
    typeof filename === "string" && filename.trim()
      ? filename.trim().replace(/["\r\n]/g, "_")
      : "merged.pdf";

  return new Response(Buffer.from(mergedBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
