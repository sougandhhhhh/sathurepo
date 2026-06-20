"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ConversionProgress, ProcessedPreview } from "@/lib/types";

const QUOTES = [
  "every picture tells a story ✧",
  "moments worth keeping forever",
  "made with love, just for you",
];

interface ProgressModalProps {
  progress: ConversionProgress;
  previews: ProcessedPreview[];
  onCancel: () => void;
}

export function ProgressModal({ progress, previews, onCancel }: ProgressModalProps) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQuoteIndex((value) => (value + 1) % QUOTES.length);
    }, 2300);
    return () => window.clearInterval(timer);
  }, []);

  const percent = progress.total > 0 ? Math.min(progress.current / progress.total, 1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        className="w-full max-w-lg rounded-[2.2rem] border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
      >
        <div className="flex flex-col items-center text-center">
          <HeartProgress percent={percent} />

          <p className="mt-6 text-base text-[var(--text-primary)]">
            Processing image {progress.current} of {progress.total}...
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{progress.step}</p>

          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#e8637a] via-[#f4a7b5] to-[#d4a574] transition-all duration-300"
              style={{ width: `${percent * 100}%` }}
            />
          </div>

          {previews.length > 0 ? (
            <div className="mt-6 w-full">
              <p className="mb-3 text-left text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
                recent previews
              </p>
              <div className="grid grid-cols-3 gap-2">
                {previews.map((preview) => (
                  <div key={preview.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <div className="relative aspect-square">
                      <Image src={preview.dataUrl} alt={preview.name} fill unoptimized className="object-cover" />
                    </div>
                    <div className="truncate px-2 py-1 text-left text-[10px] text-[var(--text-muted)]">
                      {preview.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-[var(--accent-blush)]">
            <AnimatePresence mode="wait">
              <motion.span
                key={quoteIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="font-dancing text-lg"
              >
                {QUOTES[quoteIndex]}
              </motion.span>
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--accent-rose)]"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function HeartProgress({ percent }: { percent: number }) {
  const strokeDasharray = 265;
  const strokeDashoffset = strokeDasharray * (1 - percent);

  return (
    <svg viewBox="0 0 128 128" className="h-28 w-28 drop-shadow-[0_0_24px_rgba(232,99,122,0.35)]">
      <defs>
        <linearGradient id="roseHeart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8637a" />
          <stop offset="100%" stopColor="#d4a574" />
        </linearGradient>
      </defs>
      <path
        d="M64 110s-34-20.6-45.2-39.1C9 56.8 14.6 36 34.4 32.7c10.8-1.8 20.3 3.5 26 12 5.7-8.5 15.2-13.8 26-12 19.8 3.3 25.4 24.1 15.6 38.2C98 89.4 64 110 64 110z"
        fill="rgba(232,99,122,0.08)"
        stroke="rgba(232,99,122,0.25)"
        strokeWidth="2"
      />
      <path
        d="M64 110s-34-20.6-45.2-39.1C9 56.8 14.6 36 34.4 32.7c10.8-1.8 20.3 3.5 26 12 5.7-8.5 15.2-13.8 26-12 19.8 3.3 25.4 24.1 15.6 38.2C98 89.4 64 110 64 110z"
        fill="none"
        stroke="url(#roseHeart)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
        className="transition-all duration-300"
      />
      <circle cx="64" cy="63" r="24" fill="url(#roseHeart)" opacity={0.22} />
      <circle cx="64" cy="63" r="10" fill="url(#roseHeart)" opacity={0.45} />
    </svg>
  );
}

