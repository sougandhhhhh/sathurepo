"use client";

import { motion } from "framer-motion";
import { Heart, Plus } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { iosLog } from "@/lib/imageUtils";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  fileCount: number;
  warning: string | null;
}

export function DropZone({ onFiles, fileCount, warning }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    // CRITICAL iOS FIX: Do NOT use the `accept` object filter here.
    // react-dropzone validates accept by checking file.type against the MIME
    // pattern. iOS Safari delivers HEIC files from the photo library with
    // file.type === "" in batch selections — these get silently rejected.
    // We use a custom validator that passes everything through and let
    // our own magic-byte detection in handleAddFiles do the real filtering.
    validator: (file) => {
      const name = file.name.toLowerCase();
      const type = file.type.toLowerCase();

      // Allow files with recognisable image MIME types
      if (type.startsWith("image/")) return null;

      // Allow files with no MIME type but an image extension (iOS batch HEIC)
      if (type === "") {
        const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp",
                           ".gif", ".heic", ".heif", ".tiff", ".tif"];
        if (imageExts.some((ext) => name.endsWith(ext))) {
          iosLog("warn", "DropZone", "Accepted file with empty MIME (iOS batch)", {
            name: file.name,
            size: file.size,
          });
          return null; // null = accepted
        }
      }

      // Reject everything else
      iosLog("warn", "DropZone", "Rejected file", {
        name: file.name,
        type: file.type,
      });
      return {
        code: "not-an-image",
        message: `${file.name} is not a supported image file`,
      };
    },
    multiple: true,
    noClick: false,
    onDrop: onFiles,
    onDropRejected: (rejections) => {
      rejections.forEach(({ file, errors }) => {
        iosLog("warn", "DropZone", "File rejected by dropzone", {
          name: file.name,
          type: file.type,
          size: file.size,
          reasons: errors.map((e) => e.message),
        });
      });
    },
  });

  return (
    <div className="relative">
      {fileCount > 0 ? (
        <div className="absolute right-4 top-4 z-10 rounded-full border border-[#e8637a33] bg-[#e8637a1f] px-4 py-2 text-xs text-[var(--text-primary)] shadow-[0_0_24px_rgba(232,99,122,0.18)]">
          ♥ {fileCount} image{fileCount === 1 ? "" : "s"} ready
        </div>
      ) : null}

      <div {...getRootProps()}>
        <motion.div
          animate={isDragActive ? { scale: 1.01 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={[
            "group relative overflow-hidden rounded-[2rem] border-2 border-dashed px-6 py-12 sm:px-10 sm:py-14",
            "bg-[linear-gradient(180deg,_rgba(34,22,32,0.85),_rgba(26,17,24,0.95))] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur",
            isDragActive ? "border-[var(--accent-rose)] bg-[#24141d]" : "border-[#e8637a55]",
            "transition duration-300",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,99,122,0.14),_transparent_30%),radial-gradient(circle_at_bottom,_rgba(212,165,116,0.08),_transparent_18%)] opacity-70" />
          <div className="relative z-10 flex min-h-[280px] flex-col items-center justify-center text-center">
            <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border border-[#e8637a55] bg-white/5 shadow-[0_0_50px_rgba(232,99,122,0.18)]">
              <motion.div
                className="relative"
                animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                transition={{ duration: 0.28 }}
              >
                <Heart className="h-12 w-12 text-[var(--accent-rose)]" strokeWidth={1.6} />
                <Plus
                  className="absolute left-1/2 top-1/2 h-4 w-4 text-[var(--accent-blush)]"
                  style={{ transform: "translate(-8px, -8px)" }}
                />
              </motion.div>
            </div>

            <h2 className="font-playfair text-3xl italic text-[var(--text-primary)] sm:text-4xl">
              {isDragActive ? "Drop images here" : "Drop/upload images"}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
              or click to browse · HEIC, JPG, PNG, WEBP, BMP and GIF supported
            </p>

            {warning ? <p className="mt-4 text-sm text-amber-200">{warning}</p> : null}
          </div>
        </motion.div>
      </div>

      {fileCount > 0 ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={open}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--accent-rose)] hover:bg-white/10"
          >
            + Add more photos
          </button>
        </div>
      ) : null}
    </div>
  );
}
