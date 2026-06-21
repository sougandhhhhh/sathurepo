export function isHeicFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif" ||
    // iOS Safari sometimes reports HEIC files with no MIME type at all
    (type === "" && (name.endsWith(".heic") || name.endsWith(".heif")))
  );
}

/**
 * Sniffs the first 12 bytes of a file to detect HEIC by magic bytes.
 * Useful for iOS files that may have wrong/missing MIME types.
 * HEIC files start with ftyp box: bytes 4-11 contain "ftyp" + brand (heic/heix/hevc/mif1/msf1)
 */
export async function isHeicByMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 12);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Check for "ftyp" at offset 4
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftyp !== "ftyp") return false;
    // Check brand identifier at bytes 8-11
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some((b) =>
      brand.toLowerCase().startsWith(b)
    );
  } catch {
    return false;
  }
}

export function fileToObjectUrl(file: File) {
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url: string) {
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function getFileExt(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}

