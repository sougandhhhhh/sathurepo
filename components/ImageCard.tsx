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

        <div className="absolute inset-0 flex items-start justify-between p-3 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/90 backdrop-blur"
            aria-label={`Drag ${item.name}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e8637a55] bg-[#e8637a22] text-[var(--accent-rose)] backdrop-blur transition hover:bg-[#e8637a33]"
            aria-label={`Remove ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <span className="rounded-full bg-[#e8637a] px-2.5 py-1 text-[11px] font-semibold tracking-[0.2em] text-white">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="max-w-[70%] rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/85 opacity-0 backdrop-blur transition group-hover:opacity-100">
            {item.name}
          </div>
          {item.isHeic ? (
            <span className="rounded-full bg-[#d4a574] px-2.5 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#221620]">
              HEIC
            </span>
          ) : (
            <span />
          )}
        </div>
      </div>
    </motion.article>
  );
}

