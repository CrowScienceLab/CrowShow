import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface CacheEntry {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
  width: number;
  height: number;
  lastUsed: number;
}

export class PdfCache {
  private static instance: PdfCache | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number = 16;
  private activeRenderTasks: Map<number, RenderTask> = new Map();

  public static getInstance(): PdfCache {
    if (!PdfCache.instance) {
      PdfCache.instance = new PdfCache();
    }
    return PdfCache.instance;
  }

  private getCacheKey(pageNumber: number, scale: number): string {
    return `${pageNumber}_${Math.round(scale * 100)}`;
  }

  /**
   * Get cached canvas if available
   */
  public get(pageNumber: number, scale: number): CacheEntry | undefined {
    const key = this.getCacheKey(pageNumber, scale);
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
    }
    return entry;
  }

  /**
   * Put rendered canvas in cache with LRU eviction
   */
  public set(pageNumber: number, scale: number, canvas: HTMLCanvasElement, width: number, height: number): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    const key = this.getCacheKey(pageNumber, scale);
    this.cache.set(key, {
      pageNumber,
      canvas,
      scale,
      width,
      height,
      lastUsed: Date.now(),
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Preload nearby slides around the current slide
   */
  public async preloadNearbySlides(
    pdf: PDFDocumentProxy,
    currentSlide: number,
    distance: number = 2,
    scale: number = 1.5
  ): Promise<void> {
    const totalPages = pdf.numPages;
    const start = Math.max(1, currentSlide - distance);
    const end = Math.min(totalPages, currentSlide + distance);

    for (let p = start; p <= end; p++) {
      if (p === currentSlide) continue; // Current slide is handled directly
      const key = this.getCacheKey(p, scale);
      if (!this.cache.has(key) && !this.activeRenderTasks.has(p)) {
        this.renderOffscreen(pdf, p, scale).catch((err) => {
          // Ignore cancelled tasks
          if (err?.name !== 'RenderingCancelledException') {
            console.warn(`Preload slide ${p} warning:`, err);
          }
        });
      }
    }
  }

  /**
   * Render slide to an offscreen canvas
   */
  public async renderOffscreen(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    scale: number
  ): Promise<HTMLCanvasElement> {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2d context for offscreen canvas');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    });

    this.activeRenderTasks.set(pageNumber, renderTask);

    try {
      await renderTask.promise;
      this.set(pageNumber, scale, canvas, canvas.width, canvas.height);
      return canvas;
    } finally {
      this.activeRenderTasks.delete(pageNumber);
    }
  }

  /**
   * Cancel ongoing render task for a page
   */
  public cancelPageRender(pageNumber: number): void {
    const task = this.activeRenderTasks.get(pageNumber);
    if (task) {
      try {
        task.cancel();
      } catch {
        // Ignore cancellation error
      }
      this.activeRenderTasks.delete(pageNumber);
    }
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    for (const task of this.activeRenderTasks.values()) {
      try {
        task.cancel();
      } catch {
        // Ignore
      }
    }
    this.activeRenderTasks.clear();
    this.cache.clear();
  }
}
