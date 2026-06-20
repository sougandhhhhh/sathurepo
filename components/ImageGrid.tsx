"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ImageItem } from "@/lib/types";
import { ImageCard } from "@/components/ImageCard";

interface ImageGridProps {
  items: ImageItem[];
  onRemove: (id: string) => void;
  lockedImageId: string | null;
  onLockClick: (id: string) => void;
}

export function ImageGrid({ items, onRemove, lockedImageId, onLockClick }: ImageGridProps) {
  return (
    <motion.div
      layout
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
    >
      <AnimatePresence>
        {items.map((item, index) => (
          <ImageCard 
            key={item.id} 
            item={item} 
            index={index} 
            onRemove={onRemove}
            isLocked={item.id === lockedImageId}
            onLockClick={onLockClick}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

