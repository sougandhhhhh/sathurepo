"use client";

import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";

interface ConvertButtonProps {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  progress: number;
}

export function ConvertButton({ loading, disabled, onClick, progress }: ConvertButtonProps) {
  return (
    <div className="sticky bottom-4 z-20 mt-2 flex justify-center">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/8 bg-[#120b10cc] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.38)] backdrop-blur">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={[
            "btn-rose flex w-full items-center justify-center gap-3 rounded-[1.4rem] px-6 py-4 font-playfair text-xl italic text-white transition",
            disabled ? "cursor-not-allowed opacity-60" : "hover:shadow-[0_0_36px_rgba(232,99,122,0.48)]",
          ].join(" ")}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 animate-pulse" />}
          {loading ? "Processing..." : "Create PDF"}
          <span>→</span>
        </button>

        {loading ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: `${Math.max(progress * 100, 8)}%` }}
              className="h-full rounded-full bg-gradient-to-r from-[#e8637a] to-[#d4a574]"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

