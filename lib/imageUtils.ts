// ─── Logging ────────────────────────────────────────────────────────────────
export function iosLog(
  level: "info" | "warn" | "error",
  tag: string,
  msg: string,
  extra?: Record<string, unknown>,
) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}][${tag}]`;
  const out = extra ? `${msg} ${JSON.stringify(extra)}` : msg;
  if (level === "error") console.error(prefix, out);
  else if (level === "warn") console.warn(prefix, out);
  else console.log(prefix, out);
}

// ─── HEIC Detection ─────────────────────────────────────────────────────────

/**
 * Fast HEIC check via name + MIME type.
 * Covers the majority of cases including iOS sending empty MIME types.
 */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif" ||
    // iOS Safari reports HEIC with no MIME in batch selections
    (type === "" && (name.endsWith(".heic") || name.endsWith(".heif")))
  );
}

/**
 * Deep HEIC detection via magic bytes.
 *
 * The ISO Base Media File Format (ISOBMFF) structure means the `ftyp` box
 * is NOT always at offset 4. It is the FIRST box, but preceding boxes (e.g.
 * a `skip` or `mdat` box inserted by some encoders, or a Live Photo header)
 * can push `ftyp` forward. We scan the first 64 bytes to be safe.
 *
 * HEIC brands: heic, heix, hevc, hevx, mif1, msf1, MiHE, MiHB
 */
export async function isHeicByMagicBytes(file: File): Promise<boolean> {
  try {
    // Read enough to catch any preamble before ftyp
    const slice = file.slice(0, 64);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Search for "ftyp" within the first 60 bytes
    for (let i = 0; i <= bytes.length - 12; i++) {
      if (
        bytes[i] === 0x66 && // f
        bytes[i + 1] === 0x74 && // t
        bytes[i + 2] === 0x79 && // y
        bytes[i + 3] === 0x70 // p
      ) {
        // Major brand is at i+4 to i+7
        const brand = String.fromCharCode(
          bytes[i + 4],
          bytes[i + 5],
          bytes[i + 6],
          bytes[i + 7],
        ).toLowerCase();

        const heicBrands = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "mihe", "mihb"];
        const isHeic = heicBrands.some((b) => brand.startsWith(b));

        iosLog("info", "MagicBytes", `ftyp found at offset ${i}`, {
          brand,
          file: file.name,
          isHeic,
        });

        return isHeic;
      }
    }
    return false;
  } catch (err) {
    iosLog("warn", "MagicBytes", "Magic byte read failed", {
      file: file.name,
      err: String(err),
    });
    return false;
  }
}

// ─── Sequential Queue ────────────────────────────────────────────────────────

/**
 * Run an array of async tasks with bounded concurrency.
 * On iOS, running >3 HEIC decoders simultaneously causes silent failures.
 * Use concurrency=1 for HEIC on mobile, concurrency=3 for desktop.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Object URL helpers ──────────────────────────────────────────────────────

export function fileToObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url: string): void {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
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

export function getFileExt(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}

/** Yield to the browser event loop — critical for iOS watchdog timer. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    // requestAnimationFrame is more reliable than setTimeout(0) on iOS
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}
