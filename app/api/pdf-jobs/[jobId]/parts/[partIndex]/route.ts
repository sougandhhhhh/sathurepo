import { writePdfPart } from "@/lib/pdfJobStore";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
    partIndex: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { jobId, partIndex } = await params;
  const index = Number(partIndex);

  if (!Number.isInteger(index) || index < 1) {
    return new Response("Invalid part index", { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response("Empty PDF part", { status: 400 });
  }

  try {
    await writePdfPart(jobId, index, bytes);
  } catch (err) {
    return new Response((err as Error).message || "Failed to store PDF part", { status: 400 });
  }

  return new Response(null, { status: 204 });
}
