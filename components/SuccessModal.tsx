"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Repeat2, Share2, X } from "lucide-react";

interface SuccessModalProps {
  blobUrl: string;
  fileName: string;
  pages: number;
  bytes: string;
  seconds: number;
  onClose: () => void;
  onReset: () => void;
}

export function SuccessModal({ blobUrl, fileName, pages, bytes, seconds, onClose, onReset }: SuccessModalProps) {
  useEffect(() => {
    let active = true;

    (async () => {
      const confettiModule = await import("canvas-confetti");
      if (!active) return;
      const confetti = confettiModule.default;
      const colors = ["#e8637a", "#f4a7b5", "#d4a574", "#9b7dbd"];

      confetti({
        particleCount: 120,
        spread: 86,
        startVelocity: 38,
        origin: { y: 0.62 },
        colors,
        scalar: 1.1,
      });
      window.setTimeout(() => {
        if (!active) return;
        confetti({
          particleCount: 80,
          spread: 120,
          startVelocity: 28,
          origin: { y: 0.72 },
          colors,
        });
      }, 250);
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleShare = async () => {
    const canShare = typeof navigator !== "undefined" && "share" in navigator;
    if (!canShare) return;

    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: "application/pdf" });

    await navigator.share({
      title: "Welcome, Sathu PDF",
      text: "Your memories are ready.",
      files: [file],
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(34,22,32,0.98),_rgba(18,11,16,0.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[#e8637a33] bg-[#e8637a12] shadow-[0_0_40px_rgba(232,99,122,0.18)]">
            <CheckHeart />
          </div>

          <h2 className="mt-6 bg-gradient-to-r from-[#e8637a] via-[#f4a7b5] to-[#d4a574] bg-clip-text font-playfair text-4xl italic leading-tight text-transparent sm:text-5xl">
            Your memories are ready, <span className="shimmer-text">Welcome, Sathu</span> ✧
          </h2>

          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {pages} pages · {bytes} · {seconds} seconds
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={blobUrl}
              download={fileName}
              className="btn-rose inline-flex items-center justify-center gap-2 rounded-[1.3rem] px-6 py-4 font-playfair text-lg italic text-white"
            >
              <Download className="h-5 w-5" />
              Download PDF
            </a>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center justify-center gap-2 rounded-[1.3rem] border border-white/10 bg-white/5 px-6 py-4 text-sm text-[var(--text-primary)] transition hover:border-[var(--accent-rose)]"
            >
              <Repeat2 className="h-4 w-4" />
              Convert more photos
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center justify-center gap-2 rounded-[1.3rem] border border-white/10 bg-white/5 px-6 py-4 text-sm text-[var(--text-primary)] transition hover:border-[var(--accent-rose)]"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CheckHeart() {
  return (
    <svg viewBox="0 0 128 128" className="h-14 w-14">
      <defs>
        <linearGradient id="successGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8637a" />
          <stop offset="100%" stopColor="#d4a574" />
        </linearGradient>
      </defs>
      <path
        d="M34 67l18 18 42-44"
        fill="none"
        stroke="url(#successGlow)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M64 110s-34-20.6-45.2-39.1C9 56.8 14.6 36 34.4 32.7c10.8-1.8 20.3 3.5 26 12 5.7-8.5 15.2-13.8 26-12 19.8 3.3 25.4 24.1 15.6 38.2C98 89.4 64 110 64 110z"
        fill="rgba(232,99,122,0.12)"
        stroke="url(#successGlow)"
        strokeWidth="4"
      />
    </svg>
  );
}
