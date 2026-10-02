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
  private maxBytes = 96 * 1024 * 1024;
  private activeRenderTasks: Map<string, RenderTask> = new Map();
  private documentIds = new WeakMap<PDFDocumentProxy, number>();
  private nextDocumentId = 0;
  private generation = 0;
  private preloadGeneration = 0;

  public static getInstance(): PdfCache {
    if (!PdfCache.instance) {
      PdfCache.instance = new PdfCache();
    }
    return PdfCache.instance;
  }

  private getCacheKey(pdf: PDFDocumentProxy, pageNumber: number, scale: number): string {
    if (!this.documentIds.has(pdf)) this.documentIds.set(pdf, ++this.nextDocumentId);
    return `${this.documentIds.get(pdf)}_${pageNumber}_${scale}`;
  }

  /**
   * Get cached canvas if available
   */
  public get(pdf: PDFDocumentProxy, pageNumber: number, scale: number): CacheEntry | undefined {
    const key = this.getCacheKey(pdf, pageNumber, scale);
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
    }
    return entry;
  }

  /**
   * Put rendered canvas in cache with LRU eviction
   */
  public set(pdf: PDFDocumentProxy, pageNumber: number, scale: number, canvas: HTMLCanvasElement, width: number, height: number): void {
    const key = this.getCacheKey(pdf, pageNumber, scale);
    const bytes = width * height * 4;
    if (bytes > this.maxBytes) return;
    const otherBytes = () => [...this.cache.entries()].reduce((sum, [entryKey, entry]) =>
      sum + (entryKey === key ? 0 : entry.width * entry.height * 4), 0);
    while (otherBytes() + bytes > this.maxBytes && this.cache.size > 0) this.evictOldest();
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
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
    const preloadGeneration = ++this.preloadGeneration;
    const totalPages = pdf.numPages;
    const start = Math.max(1, currentSlide - distance);
    const end = Math.min(totalPages, currentSlide + distance);

    for (let p = start; p <= end; p++) {
      if (preloadGeneration !== this.preloadGeneration) return;
      if (p === currentSlide) continue; // Current slide is handled directly
      const key = this.getCacheKey(pdf, p, scale);
      if (!this.cache.has(key) && !this.activeRenderTasks.has(key)) {
        await this.renderOffscreen(pdf, p, scale).catch((err) => {
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
    const generation = this.generation;
    const page = await pdf.getPage(pageNumber);
    if (generation !== this.generation) {
      const error = new Error('PDF cache cleared');
      error.name = 'RenderingCancelledException';
      throw error;
    }
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

    const key = this.getCacheKey(pdf, pageNumber, scale);
    this.activeRenderTasks.set(key, renderTask);

    try {
      await renderTask.promise;
      if (generation === this.generation) {
        this.set(pdf, pageNumber, scale, canvas, canvas.width, canvas.height);
      }
      return canvas;
    } finally {
      if (this.activeRenderTasks.get(key) === renderTask) this.activeRenderTasks.delete(key);
    }
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    ++this.generation;
    ++this.preloadGeneration;
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
