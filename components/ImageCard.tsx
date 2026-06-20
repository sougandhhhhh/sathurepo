"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { ImageItem } from "@/lib/types";

interface ImageCardProps {
  item: ImageItem;
  index: number;
  onRemove: (id: string) => void;
}

export function ImageCard({ item, index, onRemove }: ImageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.article
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={[
        "group relative overflow-hidden rounded-2xl border border-white/8 bg-[var(--bg-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.24)]",
        isDragging ? "z-20 shadow-[0_0_40px_rgba(232,99,122,0.32)] ring-1 ring-[#e8637a88]" : "",
      ].join(" ")}
    >
      <div className="relative aspect-square">
        <Image src={item.url} alt={item.name} fill unoptimized className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/10 opacity-0 transition group-hover:opacity-100" />

        <div className="absolute inset-0 flex items-start justify-between p-3 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/90 backdrop-blur"
            aria-label={`Remove ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          {...attributes}
          {...listeners}
          className="absolute left-1/2 top-1/2 inline-flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur transition hover:scale-105 hover:bg-black/60 touch-none cursor-grab active:cursor-grabbing sm:h-[5rem] sm:w-[5rem]"
          aria-label={`Drag ${item.name}`}
        >
          <GripVertical className="h-7 w-7 sm:h-8 sm:w-8 text-white/90" />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-5 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.05em] text-white/70 select-none">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[10px] text-white/95 truncate font-normal tracking-wide" title={item.name}>
              {item.name}
            </span>
          </div>
          {item.isHeic && (
            <span className="rounded bg-[#d4a574]/20 border border-[#d4a574]/30 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.05em] text-[#d4a574] shrink-0">
              HEIC
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
