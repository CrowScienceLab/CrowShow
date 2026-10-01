import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfDocumentInfo } from '../types/pdf';

const RANGE_CHUNK_SIZE = 256 * 1024;

/** Feed the worker requested chunks instead of transferring an entire large PDF. */
class BufferRangeTransport extends pdfjsLib.PDFDataRangeTransport {
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    super(bytes.byteLength, bytes.slice(0, Math.min(RANGE_CHUNK_SIZE, bytes.byteLength)), true);
    this.bytes = bytes;
  }

  override requestDataRange(begin: number, end: number): void {
    // Deliver asynchronously: the worker must have registered its range reader first.
    queueMicrotask(() => this.onDataRange(begin, this.bytes.slice(begin, end)));
  }
}

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
    const resourceBase = new URL('./pdfjs/', document.baseURI).href;
    const loadingTask = pdfjsLib.getDocument({
      ...(sourceBytes.byteLength > RANGE_CHUNK_SIZE
        ? { range: new BufferRangeTransport(sourceBytes), rangeChunkSize: RANGE_CHUNK_SIZE,
            disableAutoFetch: true, disableStream: true }
        : { data: sourceBytes.slice() }),
      cMapUrl: `${resourceBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${resourceBase}standard_fonts/`,
      wasmUrl: `${resourceBase}wasm/`,
      iccUrl: `${resourceBase}iccs/`,
      useSystemFonts: true,
    });

    try {
      const pdf = await loadingTask.promise;
      const totalSlides = pdf.numPages;
      // Preserve existing annotation IDs while hashing concurrently with first-page loading.
      // No up-front walk over hundreds of pages: other sizes are resolved on navigation.
      const [page, digest] = await Promise.all([
        pdf.getPage(1),
        crypto.subtle.digest('SHA-256', sourceBytes as Uint8Array<ArrayBuffer>),
      ]);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageAspectRatios: number[] = [viewport.width / viewport.height];
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
