"use client";

import { motion, AnimatePresence } from "framer-motion";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import type { ImageItem } from "@/lib/types";
import { ImageCard } from "@/components/ImageCard";

interface ImageGridProps {
  items: ImageItem[];
  onRemove: (id: string) => void;
}

export function ImageGrid({ items, onRemove }: ImageGridProps) {
  return (
    <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
      <motion.div
        layout
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      >
        <AnimatePresence>
          {items.map((item, index) => (
            <ImageCard key={item.id} item={item} index={index} onRemove={onRemove} />
          ))}
        </AnimatePresence>
      </motion.div>
    </SortableContext>
  );
}

