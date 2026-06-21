import { writeJobImage } from "@/lib/pdfJobStore";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
    imageIndex: string;
  }>;
};

function guessExt(filename: string | null, contentType: string | null) {
  const fileExt = filename?.split(".").pop()?.toLowerCase();
  if (fileExt && fileExt.length <= 5) return fileExt;

  if (contentType) {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
      "image/gif": "gif",
      "image/bmp": "bmp",
    };
    return map[contentType.toLowerCase()] ?? "bin";
  }

  return "bin";
}

export async function POST(request: Request, { params }: RouteContext) {
  const { jobId, imageIndex } = await params;
  const index = Number(imageIndex);

  if (!Number.isInteger(index) || index < 1) {
    return new Response("Invalid image index", { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response("Empty image upload", { status: 400 });
  }

  const filename = request.headers.get("x-file-name");
  const contentType = request.headers.get("content-type");
  const ext = guessExt(filename, contentType);

  try {
    await writeJobImage(jobId, index, bytes, ext);
  } catch (err) {
    return new Response((err as Error).message || "Failed to store image", { status: 400 });
  }

  return new Response(null, { status: 204 });
}
