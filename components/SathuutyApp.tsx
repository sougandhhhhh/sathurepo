"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { ChevronDown, ImageIcon, AlertTriangle } from "lucide-react";
import { HeartParticles } from "@/components/HeartParticles";
import { DropZone } from "@/components/DropZone";
import { ImageGrid } from "@/components/ImageGrid";
import { PDFSettings } from "@/components/PDFSettings";
import { ConvertButton } from "@/components/ConvertButton";
import { ProgressModal } from "@/components/ProgressModal";
import { SuccessModal } from "@/components/SuccessModal";
import { convertImagesToPDF } from "@/lib/convertToPdf";
import { fileToObjectUrl, formatBytes, isHeicFile, revokeObjectUrl } from "@/lib/imageUtils";
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  const handleAddFiles = (files: File[]) => {
    if (!files.length) return;

    const mapped = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      url: fileToObjectUrl(file),
      isHeic: isHeicFile(file),
    }));

    setImages((current) => {
      const remainingSlots = Math.max(MAX_UPLOADS - current.length, 0);
      const accepted = mapped.slice(0, remainingSlots);
      const nextImages = [...current, ...accepted];
      setWarning(buildUploadWarning(nextImages, mapped.length - accepted.length));
      return nextImages;
    });
    setError(null);
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

  const handleManualOrder = () => {
    setWarning("Use the drag handle on each image card to place photos in your preferred order.");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImages((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
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

    try {
      const blob = await convertImagesToPDF(
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
                  <button onClick={handleManualOrder} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]">
                    Manual order
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

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <ImageGrid items={images} onRemove={handleRemove} />
              </DndContext>

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
  const hasHeic = items.some((item) => item.isHeic);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

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

