import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { PdfCache } from './pdfCache';
import { getRenderDensity } from './pdfViewport';

export interface RenderResult {
  width: number;
  height: number;
  scale: number;
}

export class PdfRenderer {
  private static canvasTasks: WeakMap<HTMLCanvasElement, RenderTask> = new WeakMap();
  private static canvasGenerations: WeakMap<HTMLCanvasElement, number> = new WeakMap();
  private pdfCache: PdfCache = PdfCache.getInstance();

  public static cancel(canvas: HTMLCanvasElement): void {
    PdfRenderer.canvasGenerations.set(canvas, (PdfRenderer.canvasGenerations.get(canvas) ?? 0) + 1);
    PdfRenderer.canvasTasks.get(canvas)?.cancel();
  }

  /**
   * Cancel any pending render task on a canvas
   */
  private async cancelCanvasTask(canvas: HTMLCanvasElement): Promise<void> {
    const task = PdfRenderer.canvasTasks.get(canvas);
    if (task) {
      try {
        task.cancel();
        await task.promise.catch(() => undefined);
      } catch {
        // Ignored
      }
      PdfRenderer.canvasTasks.delete(canvas);
    }
  }

  /**
   * Render a specific page onto the destination canvas.
   * Dynamically adapts to devicePixelRatio for retina crispness.
   */
  public async renderSlide(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    containerWidth: number,
    containerHeight: number,
    zoomFactor: number = 1.0
  ): Promise<RenderResult> {
    const generation = (PdfRenderer.canvasGenerations.get(canvas) ?? 0) + 1;
    PdfRenderer.canvasGenerations.set(canvas, generation);
    await this.cancelCanvasTask(canvas);

    const page = await pdf.getPage(pageNumber);
    if (PdfRenderer.canvasGenerations.get(canvas) !== generation) {
      return { width: 0, height: 0, scale: 1 };
    }

    // Initial base viewport at scale 1.0
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const pageAspect = unscaledViewport.width / unscaledViewport.height;
    const containerAspect = containerWidth / containerHeight;

    // Calculate fit-to-screen dimensions
    let fitWidth: number;
    let fitHeight: number;

    if (containerAspect > pageAspect) {
      fitHeight = containerHeight;
      fitWidth = containerHeight * pageAspect;
    } else {
      fitWidth = containerWidth;
      fitHeight = containerWidth / pageAspect;
    }

    // Apply zoom
    fitWidth *= zoomFactor;
    fitHeight *= zoomFactor;

    const dpr = getRenderDensity(fitWidth, fitHeight, window.devicePixelRatio);
    const baseScale = fitWidth / unscaledViewport.width;
    const renderScale = baseScale * dpr;

    const viewport = page.getViewport({ scale: renderScale });

    // Set canvas dimensions
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${Math.round(fitWidth)}px`;
    canvas.style.height = `${Math.round(fitHeight)}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // Check if we have pre-rendered cached version from a separate offscreen canvas
    const cached = this.pdfCache.get(pdf, pageNumber, renderScale);
    if (cached && cached.canvas !== canvas && cached.width > 0 && cached.height > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cached.canvas, 0, 0, canvas.width, canvas.height);
      return { width: fitWidth, height: fitHeight, scale: baseScale };
    }

    // Render directly
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    });

    PdfRenderer.canvasTasks.set(canvas, renderTask);

    try {
      await renderTask.promise;
      // Cache an offscreen clone so the DOM canvas isn't shared/corrupted
      const clone = document.createElement('canvas');
      clone.width = canvas.width;
      clone.height = canvas.height;
      const cloneCtx = clone.getContext('2d');
      if (cloneCtx) {
        cloneCtx.drawImage(canvas, 0, 0);
        this.pdfCache.set(pdf, pageNumber, renderScale, clone, canvas.width, canvas.height);
      }
      return { width: fitWidth, height: fitHeight, scale: baseScale };
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error?.name === 'RenderingCancelledException') {
        return { width: fitWidth, height: fitHeight, scale: baseScale };
      }
      throw err;
    } finally {
      if (PdfRenderer.canvasTasks.get(canvas) === renderTask) {
        PdfRenderer.canvasTasks.delete(canvas);
      }
    }
  }

  /**
   * Render a mini thumbnail for the thumbnail bar
   */
  public async renderThumbnail(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    maxWidth: number = 220
  ): Promise<void> {
    const generation = (PdfRenderer.canvasGenerations.get(canvas) ?? 0) + 1;
    PdfRenderer.canvasGenerations.set(canvas, generation);
    await this.cancelCanvasTask(canvas);

    const page = await pdf.getPage(pageNumber);
    if (PdfRenderer.canvasGenerations.get(canvas) !== generation) return;
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const scale = maxWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    });

    PdfRenderer.canvasTasks.set(canvas, renderTask);

    try {
      await renderTask.promise;
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error?.name !== 'RenderingCancelledException') {
        console.warn(`Thumbnail page ${pageNumber} render warning:`, err);
      }
    } finally {
      if (PdfRenderer.canvasTasks.get(canvas) === renderTask) {
        PdfRenderer.canvasTasks.delete(canvas);
      }
    }
  }
}
