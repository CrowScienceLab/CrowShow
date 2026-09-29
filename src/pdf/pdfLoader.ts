import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfDocumentInfo } from '../types/pdf';

// Initialize PDF.js worker
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export class PdfLoader {
  private static instance: PdfLoader | null = null;
  private currentPdf: pdfjsLib.PDFDocumentProxy | null = null;
  private loadGeneration = 0;
  private currentTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  private documentInfo: PdfDocumentInfo | null = null;

  public static getInstance(): PdfLoader {
    if (!PdfLoader.instance) {
      PdfLoader.instance = new PdfLoader();
    }
    return PdfLoader.instance;
  }

  /**
   * Load PDF from an ArrayBuffer or Uint8Array
   */
  public async loadFromBuffer(
    data: ArrayBuffer | Uint8Array,
    fileName: string,
    fileSize?: number
  ): Promise<PdfDocumentInfo> {
    const generation = ++this.loadGeneration;

    const sourceBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const loadingTask = pdfjsLib.getDocument({ data: sourceBytes.slice() });

    const pdf = await loadingTask.promise;
    try {
      const totalSlides = pdf.numPages;
      const pageAspectRatios: number[] = [];

      // Pre-calculate page aspect ratios for seamless layout
      for (let i = 1; i <= totalSlides; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        pageAspectRatios.push(viewport.width / viewport.height);
      }

      const digest = await crypto.subtle.digest('SHA-256', sourceBytes.slice().buffer);
      const fingerprint = Array.from(new Uint8Array(digest).slice(0, 12))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const docId = `pdf_${fingerprint}`;
      if (generation !== this.loadGeneration) throw new Error("PDF load superseded");
      const previousTask = this.currentTask;
      this.currentTask = loadingTask;
      this.currentPdf = pdf;
      if (previousTask) void previousTask.destroy().catch(console.warn);
      this.documentInfo = {
        id: docId,
        name: fileName,
        totalSlides,
        fileSize: fileSize || (data instanceof ArrayBuffer ? data.byteLength : data.length),
        pageAspectRatios,
        loadedAt: new Date(),
      };

      return this.documentInfo;
    } catch (error) {
      await loadingTask.destroy();
      throw error;
    }
  }

  /**
   * Load PDF from a File object
   */
  public async loadFromFile(file: File): Promise<PdfDocumentInfo> {
    const arrayBuffer = await file.arrayBuffer();
    return this.loadFromBuffer(arrayBuffer, file.name, file.size);
  }

  /**
   * Get PDF.js document proxy
   */
  public getPdfDocument(): pdfjsLib.PDFDocumentProxy | null {
    return this.currentPdf;
  }

  /**
   * Get metadata
   */
  public getDocumentInfo(): PdfDocumentInfo | null {
    return this.documentInfo;
  }

  /**
   * Fetch a specific page proxy
   */
  public async getPage(pageNumber: number): Promise<pdfjsLib.PDFPageProxy> {
    if (!this.currentPdf) {
      throw new Error('No PDF document loaded');
    }
    if (pageNumber < 1 || pageNumber > this.currentPdf.numPages) {
      throw new Error(`Page index ${pageNumber} out of range (1..${this.currentPdf.numPages})`);
    }
    return this.currentPdf.getPage(pageNumber);
  }

  /**
   * Cleanup resources
   */
  public async destroy(): Promise<void> {
    ++this.loadGeneration;
    const task = this.currentTask;
    this.currentTask = null;
    this.currentPdf = null;
    this.documentInfo = null;
    if (task) {
      try {
        await task.destroy();
      } catch (err) {
        console.warn('PDF cleanup warning:', err);
      }

    }
  }
}
