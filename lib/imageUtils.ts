export function isHeicFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
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

