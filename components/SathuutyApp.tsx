"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ImageIcon, AlertTriangle } from "lucide-react";
import { HeartParticles } from "@/components/HeartParticles";
import { DropZone } from "@/components/DropZone";
import { ImageGrid } from "@/components/ImageGrid";
import { PDFSettings } from "@/components/PDFSettings";
import { ConvertButton } from "@/components/ConvertButton";
import { ProgressModal } from "@/components/ProgressModal";
import { SuccessModal } from "@/components/SuccessModal";
import { convertImagesToPDF } from "@/lib/convertToPdf";
import {
  fileToObjectUrl,
  formatBytes,
  isHeicFile,
  isHeicByMagicBytes,
  iosLog,
  revokeObjectUrl,
  runWithConcurrency,
  yieldToMain,
} from "@/lib/imageUtils";
import type { ConversionProgress, ImageItem, PdfSettings, ProcessedPreview } from "@/lib/types";

const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: "a4",
  orientation: "portrait",
  quality: 100,
  margin: 12,
  filename: "welcome-sathu.pdf",
  watermark: false,
  pageNumbers: false,
  compressionPreset: "best",
};

const MAX_UPLOADS = 400;
const CHUNKED_MERGE_IMAGE_THRESHOLD = 30;

export function SathuutyApp() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState<ConversionProgress>({
    current: 0,
    total: 0,
    step: "Preparing...",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({ pages: 0, bytes: 0, seconds: 0 });
  const [processedPreviews, setProcessedPreviews] = useState<ProcessedPreview[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const imagesRef = useRef<ImageItem[]>([]);
  const pdfUrlRef = useRef<string | null>(null);

  const [lockedImageId, setLockedImageId] = useState<string | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => revokeObjectUrl(image.url));
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fileCountLabel = useMemo(() => {
    if (images.length === 0) return "No images loaded yet";
    return `${images.length} image${images.length === 1 ? "" : "s"} ready`;
  }, [images.length]);

  const handleAddFiles = async (files: File[]) => {
    if (!files.length) return;

    // ── Step 1: Sequential magic-byte HEIC detection ─────────────────────
    // Promise.all on 50 files causes iOS photo library I/O contention.
    // We run magic-byte reads sequentially instead.
    const heicFlags: boolean[] = [];
    const safeMimes = ["image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];

    for (const file of files) {
      if (isHeicFile(file)) {
        heicFlags.push(true);
        iosLog("info", "Upload", "HEIC detected by name/MIME", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
      } else if (safeMimes.includes(file.type.toLowerCase())) {
        heicFlags.push(false);
        iosLog("info", "Upload", "Safe MIME, skipping magic bytes", {
          name: file.name,
          type: file.type,
        });
      } else {
        // Potentially ambiguous (image/jpeg from iOS = might be HEIC)
        const magic = await isHeicByMagicBytes(file);
        heicFlags.push(magic);
        iosLog(magic ? "warn" : "info", "Upload",
          magic ? "HEIC detected via magic bytes" : "Not HEIC (magic bytes)",
          { name: file.name, type: file.type, size: file.size },
        );
      }
    }

    // ── Step 2: Build the image list and commit to state ─────────────────
    const mapped = files.map((file, i) => {
      const heic = heicFlags[i];
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        // HEIC files start with no url; thumbnail is generated below
        url: heic ? "" : fileToObjectUrl(file),
        isHeic: heic,
      };
    });

    setImages((current) => {
      const remainingSlots = Math.max(MAX_UPLOADS - current.length, 0);
      const accepted = mapped.slice(0, remainingSlots);
      const nextImages = [...current, ...accepted];
      setWarning(buildUploadWarning(nextImages, mapped.length - accepted.length));
      return nextImages;
    });
    setError(null);

    // ── Step 3: Generate HEIC thumbnails sequentially ─────────────────────
    // iOS WebKit has a single-threaded HEIC decoder. Running multiple
    // heic2any() calls in parallel causes silent failures — some return
    // blank blobs, others throw. Serialise to 1 at a time on mobile.
    const heicItems = mapped.filter((item) => item.isHeic);
    if (heicItems.length === 0) return;

    iosLog("info", "Upload", `Generating thumbnails for ${heicItems.length} HEIC files sequentially`);

    const isMobile = typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    const concurrency = isMobile ? 1 : 3;

    try {
      const { default: heic2any } = await import("heic2any");

      const tasks = heicItems.map((item) => async () => {
        iosLog("info", "Thumbnail", `Starting: ${item.name}`);
        try {
          const converted = await heic2any({
            blob: item.file,
            toType: "image/jpeg",
            // Low quality — thumbnails only, full quality is used at PDF time
            quality: 0.25,
          });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          const objectUrl = URL.createObjectURL(blob);

          setImages((current) =>
            current.map((img) =>
              img.id === item.id ? { ...img, url: objectUrl } : img
            )
          );

          iosLog("info", "Thumbnail", `Done: ${item.name}`, {
            outSize: blob.size,
          });
        } catch (err) {
          iosLog("error", "Thumbnail", `Failed: ${item.name}`, {
            err: String(err),
          });
          // Leave url as "" — ImageCard shows "Loading preview..." fallback
        }
      });

      await runWithConcurrency(tasks, concurrency);
      iosLog("info", "Thumbnail", "All HEIC thumbnails done");
    } catch (err) {
      iosLog("error", "Thumbnail", "heic2any import failed", { err: String(err) });
    }
  };

  const handleRemove = (id: string) => {
    setImages((current) => {
      const next = current.filter((item) => item.id !== id);
      const removed = current.find((item) => item.id === id);
      if (removed) revokeObjectUrl(removed.url);
      setWarning(buildUploadWarning(next));
      return next;
    });
  };

  const handleClearAll = () => {
    images.forEach((image) => revokeObjectUrl(image.url));
    setImages([]);
    setWarning(null);
    setError(null);
    setProcessedPreviews([]);
  };

  const handleSortAZ = () => {
    setImages((current) => [...current].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleSortZA = () => {
    setImages((current) => [...current].sort((a, b) => b.name.localeCompare(a.name)));
  };

  const handleReverse = () => {
    setImages((current) => [...current].reverse());
  };

  const handleImageLockClick = (clickedId: string) => {
    if (lockedImageId === null) {
      setLockedImageId(clickedId);
    } else if (lockedImageId === clickedId) {
      setLockedImageId(null);
    } else {
      setImages((current) => {
        const lockedIndex = current.findIndex((item) => item.id === lockedImageId);
        const clickedIndex = current.findIndex((item) => item.id === clickedId);

        if (lockedIndex === -1 || clickedIndex === -1) return current;

        const next = [...current];
        const [lockedItem] = next.splice(lockedIndex, 1);
        
        const insertIndex = next.findIndex((item) => item.id === clickedId);
        next.splice(insertIndex, 0, lockedItem);
        
        return next;
      });
      setLockedImageId(null);
    }
  };

  const handleConvert = async () => {
    if (!images.length || isProcessing) return;

    setError(null);
    setIsProcessing(true);
    setProcessedPreviews([]);
    setProgress({ current: 0, total: images.length, step: "Preparing memories..." });
    setSuccessOpen(false);

    const startedAt = performance.now();
    const controller = new AbortController();
    abortRef.current = controller;
    const totalBytes = images.reduce((sum, item) => sum + item.file.size, 0);

    try {
      const isMobile = isMobileDevice();
      const shouldUseMobileBackend = isMobile;
      const shouldUseChunkedMerge = !shouldUseMobileBackend && images.length > CHUNKED_MERGE_IMAGE_THRESHOLD;

      let blob: Blob;
      if (shouldUseMobileBackend) {
        try {
          blob = await convertImagesViaBackend(
            images,
            settings,
            controller.signal,
            (nextProgress) => {
              setProgress(nextProgress);
            },
          );
        } catch (backendErr) {
          if (controller.signal.aborted) {
            throw backendErr;
          }

          const safeToFallback = images.length <= CHUNKED_MERGE_IMAGE_THRESHOLD || totalBytes <= 25 * 1024 * 1024;
          if (!safeToFallback) {
            throw backendErr;
          }

          iosLog("warn", "PDF", "Backend conversion failed, retrying locally", {
            err: String(backendErr),
            totalImages: images.length,
            totalBytes,
          });
          setProgress({
            current: 0,
            total: images.length,
            step: "Backend retry failed. Switching to local conversion...",
          });
          blob = await convertImagesToPDF(
            images,
            settings,
            controller.signal,
            (nextProgress) => {
              setProgress(nextProgress);
              if (nextProgress.preview) {
                setProcessedPreviews((current) => [...current, nextProgress.preview!].slice(-3));
              }
            },
          );
        }
      } else if (shouldUseChunkedMerge) {
        blob = await convertImagesChunkedAndMerged(
          images,
          settings,
          controller.signal,
          (nextProgress) => {
            setProgress(nextProgress);
            if (nextProgress.preview) {
              setProcessedPreviews((current) => [...current, nextProgress.preview!].slice(-3));
            }
          },
        );
      } else {
        blob = await convertImagesToPDF(
          images,
          settings,
          controller.signal,
          (nextProgress) => {
            setProgress(nextProgress);
            if (nextProgress.preview) {
              setProcessedPreviews((current) => [...current, nextProgress.preview!].slice(-3));
            }
          },
        );
      }

      const url = URL.createObjectURL(blob);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);

      setPdfUrl(url);
      setStats({
        pages: images.length,
        bytes: blob.size,
        seconds: Number(((performance.now() - startedAt) / 1000).toFixed(1)),
      });
      setSuccessOpen(true);
    } catch (err) {
      if ((err as Error).message !== "Cancelled") {
        setError((err as Error).message || "Conversion failed");
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsProcessing(false);
  };

  const handleReset = () => {
    setSuccessOpen(false);
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    setPdfUrl(null);
    setStats({ pages: 0, bytes: 0, seconds: 0 });
    handleClearAll();
    setSettings(DEFAULT_SETTINGS);
    setShowSettings(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(232,99,122,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(212,165,116,0.12),_transparent_28%),linear-gradient(180deg,_#120b10_0%,_#0f0a0e_45%,_#0b070a_100%)]">
      <HeartParticles />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-0 pt-8 sm:px-6 lg:px-8">
        <section className="flex min-h-[72vh] flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative"
          >
            <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,_rgba(232,99,122,0.35),_transparent_68%)] blur-3xl" />
            <h1 className="font-playfair text-6xl italic leading-[1.08] tracking-tight sm:text-7xl lg:text-[88px]">
              <span className="inline-block bg-gradient-to-r from-[#e8637a] via-[#f4a7b5] to-[#d4a574] bg-clip-text pb-1 pr-2 text-transparent">
                Welcome, Sathu
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.55 }}
            className="mt-6 font-dancing text-2xl text-[var(--accent-blush)] sm:text-3xl"
          >
            turn images into pdf
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36, duration: 0.55 }}
            className="mx-auto mt-6 max-w-xl text-sm leading-7 text-[var(--text-muted)] sm:text-[15px]"
          >
            Upload your photos - HEIC, JPG, PNG and more. We&apos;ll stitch them into one beautiful PDF.
            No servers. No uploads. Just you and your memories.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.55 }}
            className="mt-10 inline-flex items-center gap-3 rounded-full border border-[#e8637a33] bg-[#1a1118b0] px-5 py-3 text-xs text-[var(--text-muted)] shadow-[0_0_40px_rgba(232,99,122,0.12)] backdrop-blur"
          >
            <ImageIcon className="h-4 w-4 text-[var(--accent-rose)]" />
            {fileCountLabel}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.68, duration: 0.45 }}
            className="mt-16 flex flex-col items-center gap-3 text-[var(--accent-rose)]"
          >
            <span className="text-[11px] uppercase tracking-[0.4em] text-[var(--text-muted)]">scroll down</span>
            <ChevronDown className="h-8 w-8 animate-bounce" />
          </motion.div>
        </section>

        <section className="space-y-6">
          <DropZone onFiles={handleAddFiles} fileCount={images.length} warning={warning} />

          {images.length > 0 ? (
            <>
              <div className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-[var(--bg-surface)]/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={handleSortAZ} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]">
                    Sort A-Z
                  </button>
                  <button onClick={handleSortZA} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]">
                    Sort Z-A
                  </button>
                  <button onClick={handleReverse} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]">
                    Reverse order
                  </button>
                  <button
                    onClick={() => setClearConfirmOpen(true)}
                    className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20 hover:border-rose-300/60"
                  >
                    Clear all images
                  </button>
                  <span className="ml-auto text-xs text-[var(--text-muted)]">{images.length} images</span>
                </div>

                {warning ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                    {warning}
                  </div>
                ) : null}
              </div>

              <ImageGrid items={images} onRemove={handleRemove} lockedImageId={lockedImageId} onLockClick={handleImageLockClick} />

              <PDFSettings
                settings={settings}
                expanded={showSettings}
                onToggle={() => setShowSettings((value) => !value)}
                onChange={setSettings}
              />

              {error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <ConvertButton
                disabled={isProcessing || images.length === 0}
                loading={isProcessing}
                onClick={handleConvert}
                progress={isProcessing ? progress.current / Math.max(progress.total, 1) : 0}
              />

              <div className="h-2" />
            </>
          ) : null}
        </section>

        <footer className="relative left-1/2 mt-16 w-screen -translate-x-1/2 overflow-hidden border-y border-white/10 bg-[var(--bg-surface)]/95 shadow-[0_-18px_60px_rgba(0,0,0,0.25)]">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#e8637a66] to-transparent" />
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-5 px-6 py-8 text-center sm:flex-row sm:text-left sm:px-8">
            <div className="flex items-center gap-3">
              <Image src="/icon.svg" alt="SathukuttyntePDF logo" width={44} height={44} className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 p-1.5" />
              <div>
                <p className="font-playfair text-2xl italic text-[var(--text-primary)]">SathukuttyntePDF</p>
                <p className="font-playfair text-base italic text-[var(--accent-blush)]">all rights reserved only for my vaavu &lt;3</p>
              </div>
            </div>

            <p className="font-playfair text-2xl italic text-[var(--text-primary)]">
              with love, your kannan.
            </p>
          </div>
        </footer>
      </main>

      <AnimatePresence>
        {isProcessing ? (
          <ProgressModal progress={progress} previews={processedPreviews} onCancel={handleCancel} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {successOpen && pdfUrl ? (
          <SuccessModal
            blobUrl={pdfUrl}
            fileName={settings.filename}
            pages={stats.pages}
            bytes={formatBytes(stats.bytes)}
            seconds={stats.seconds}
            onClose={() => setSuccessOpen(false)}
            onReset={handleReset}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {clearConfirmOpen ? (
          <ClearConfirmModal
            onCancel={() => setClearConfirmOpen(false)}
            onConfirm={() => {
              setClearConfirmOpen(false);
              handleClearAll();
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function buildUploadWarning(items: ImageItem[], rejectedCount = 0) {
  const total = items.length;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const hasHeic = items.some((item) => item.isHeic);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  if (totalBytes >= 700 * 1024 * 1024 || (total >= 150 && totalBytes >= 400 * 1024 * 1024)) {
    return `Huge batch detected (${formatBytes(totalBytes)}). The app will automatically split this into smaller PDFs and merge them for safety.`;
  }

  if (total > CHUNKED_MERGE_IMAGE_THRESHOLD) {
    return `Large batch detected. Files over ${CHUNKED_MERGE_IMAGE_THRESHOLD} photos will be split into smaller PDFs and merged automatically.`;
  }

  if (total >= MAX_UPLOADS) {
    if (rejectedCount > 0) {
      return `Upload cap reached at ${MAX_UPLOADS} images. ${rejectedCount} additional file${rejectedCount === 1 ? "" : "s"} were skipped.`;
    }

    return `Upload cap reached at ${MAX_UPLOADS} images.`;
  }

  if (rejectedCount > 0) {
    return `Only ${rejectedCount} file${rejectedCount === 1 ? "" : "s"} were skipped to respect the ${MAX_UPLOADS}-image cap.`;
  }

  if (total > 300 && hasHeic && isMobile) {
    return "Large HEIC batch detected on mobile. A desktop browser will handle this much better.";
  }

  if (total > 300) {
    return "Large batch detected. Conversion may take a few minutes.";
  }

  if (hasHeic && isMobile) {
    return "HEIC files on mobile can be slow. A desktop browser is recommended for best performance.";
  }

  return null;
}

function buildChunks(items: ImageItem[]) {
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const averageBytes = totalBytes / Math.max(items.length, 1);
  const maxChunkImages = isMobile ? 1 : getChunkImageLimit(averageBytes);
  const maxChunkBytes = isMobile ? 3 * 1024 * 1024 : 12 * 1024 * 1024;
  const chunks: Array<{ items: ImageItem[]; start: number; end: number; bytes: number }> = [];
  let current: ImageItem[] = [];
  let currentBytes = 0;
  let startIndex = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const wouldOverflow =
      current.length >= maxChunkImages || (currentBytes > 0 && currentBytes + item.file.size > maxChunkBytes);

    if (wouldOverflow && current.length > 0) {
      chunks.push({
        items: current,
        start: startIndex,
        end: index - 1,
        bytes: currentBytes,
      });
      current = [];
      currentBytes = 0;
      startIndex = index;
    }

    current.push(item);
    currentBytes += item.file.size;
  }

  if (current.length > 0) {
    chunks.push({
      items: current,
      start: startIndex,
      end: items.length - 1,
      bytes: currentBytes,
    });
  }

  return chunks;
}

function isMobileDevice() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

async function convertImagesViaBackend(
  images: ImageItem[],
  settings: PdfSettings,
  signal: AbortSignal,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<Blob> {
  const jobId = crypto.randomUUID();

  for (let index = 0; index < images.length; index += 1) {
    if (signal.aborted) throw new Error("Cancelled");

    const item = images[index];
    onProgress?.({
      current: index + 1,
      total: images.length,
      step: `Uploading image ${index + 1} of ${images.length}...`,
    });

    await uploadImagePart(jobId, index + 1, item.file, signal);
    await yieldToMain();
  }

  onProgress?.({
    current: images.length,
    total: images.length,
    step: "Rendering PDF on the backend...",
  });

  const response = await fetch(`/api/pdf-jobs/${jobId}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: settings.filename,
      settings,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text() || "Failed to generate PDF");
  }

  return response.blob();
}

async function uploadImagePart(
  jobId: string,
  imageIndex: number,
  file: File,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/pdf-jobs/${jobId}/images/${imageIndex}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": file.name,
    },
    body: file,
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text() || `Failed to upload image ${imageIndex}`);
  }
}

async function convertImagesChunkedAndMerged(
  images: ImageItem[],
  settings: PdfSettings,
  signal: AbortSignal,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<Blob> {
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const effectiveSettings = isMobile
    ? { ...settings, quality: Math.min(settings.quality, 72) }
    : settings;
  const chunks = buildChunks(images);
  const jobId = crypto.randomUUID();
  const chunkBlobs: Blob[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    if (signal.aborted) throw new Error("Cancelled");

    const chunk = chunks[chunkIndex];
    onProgress?.({
      current: chunk.start,
      total: images.length,
      step: `Preparing chunk ${chunkIndex + 1} of ${chunks.length}...`,
    });

    const chunkBlob = await convertImagesToPDF(
      chunk.items,
      effectiveSettings,
      signal,
      (nextProgress) => {
        onProgress?.({
          current: chunk.start + nextProgress.current,
          total: images.length,
          step: `Chunk ${chunkIndex + 1} of ${chunks.length} - ${nextProgress.step}`,
          preview: nextProgress.preview,
        });
      },
    );

    chunkBlobs.push(chunkBlob);
    await uploadChunkPart(jobId, chunkIndex + 1, chunkBlob, signal);
    onProgress?.({
      current: chunk.end + 1,
      total: images.length,
      step: `Chunk ${chunkIndex + 1} of ${chunks.length} uploaded (${Math.round(chunk.bytes / (1024 * 1024))} MB)`,
    });

    await yieldToMain();
  }

  onProgress?.({
    current: images.length,
    total: images.length,
    step: "Merging PDF parts on the backend...",
  });

  const response = await fetch(`/api/pdf-jobs/${jobId}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename: settings.filename }),
  });

  if (!response.ok) {
    const backendError = await response.text();
    iosLog("warn", "PDF", "Backend merge failed, retrying locally", {
      err: backendError || "Failed to merge PDF parts",
      chunks: chunkBlobs.length,
    });
    onProgress?.({
      current: images.length,
      total: images.length,
      step: "Backend merge failed. Merging locally instead...",
    });
    return mergePdfBlobsLocally(chunkBlobs);
  }

  return response.blob();
}

async function uploadChunkPart(
  jobId: string,
  partIndex: number,
  blob: Blob,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/pdf-jobs/${jobId}/parts/${partIndex}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
    },
    body: blob,
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text() || `Failed to upload chunk ${partIndex}`);
  }
}

async function mergePdfBlobsLocally(parts: Blob[]) {
  if (!parts.length) {
    throw new Error("No PDF parts were provided");
  }

  const { PDFDocument } = await import("pdf-lib");
  const mergedPdf = await PDFDocument.create();

  for (const part of parts) {
    const bytes = await part.arrayBuffer();
    const sourcePdf = await PDFDocument.load(bytes);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  return new Blob([mergedBytes], { type: "application/pdf" });
}

function getChunkImageLimit(averageBytes: number): number {
  if (averageBytes >= 3 * 1024 * 1024) return 1;
  if (averageBytes >= 1.5 * 1024 * 1024) return 2;
  return 4;
}

function ClearConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
      >
        <h3 className="font-playfair text-3xl italic text-[var(--text-primary)]">Clear all images?</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          This will remove every uploaded photo from the queue. You can add them again, but this action cannot be undone.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] transition hover:border-[var(--accent-rose)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full border border-rose-400/40 bg-rose-400/15 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/25"
          >
            Clear all images
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

