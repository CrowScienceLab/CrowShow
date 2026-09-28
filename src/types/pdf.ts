export interface PdfDocumentInfo {
  id: string;
  name: string;
  totalSlides: number;
  fileSize?: number;
  pageAspectRatios: number[]; // width / height for each slide
  loadedAt: Date;
}

export interface RenderSlideOptions {
  pageNumber: number;
  scale?: number;
  targetCanvas: HTMLCanvasElement;
  renderAnnotation?: boolean;
}

export interface SlideCacheEntry {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  renderedAt: number;
  scale: number;
}

export interface RecentPdfDocument {
  id: string;
  name: string;
  date: string;
  slideCount: number;
  fileSize: number;
}
