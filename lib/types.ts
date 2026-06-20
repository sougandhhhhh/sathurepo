export type PageSize = "a4" | "letter" | "fit";
export type Orientation = "portrait" | "landscape";
export type CompressionPreset = "smallest" | "balanced" | "best" | "custom";

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  url: string;
  isHeic: boolean;
}

export interface PdfSettings {
  pageSize: PageSize;
  orientation: Orientation;
  quality: number;
  margin: number;
  filename: string;
  watermark: boolean;
  pageNumbers: boolean;
  compressionPreset: CompressionPreset;
}

export interface ConversionProgress {
  current: number;
  total: number;
  step: string;
  preview?: ProcessedPreview;
}

export interface ProcessedPreview {
  id: string;
  name: string;
  dataUrl: string;
}
