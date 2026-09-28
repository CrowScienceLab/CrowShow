import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AnnotationStore } from '../annotations/annotationStore';
import { StrokeEngine } from '../annotations/strokeEngine';

export async function exportAnnotatedPdf(pdfDoc: PDFDocumentProxy, fileName: string): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  const store = AnnotationStore.getInstance();

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    const sourcePage = await pdfDoc.getPage(pageNumber);
    const viewport = sourcePage.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');

    await sourcePage.render({ canvas, canvasContext: ctx, viewport }).promise;
    StrokeEngine.renderStrokes(
      ctx,
      store.getStrokesForSlide(pageNumber),
      canvas.width,
      canvas.height
    );

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG conversion failed.'))), 'image/png');
    });
    const pngBytes = await pngBlob.arrayBuffer();
    const png = await output.embedPng(pngBytes);
    const page = output.addPage([viewport.width / 2, viewport.height / 2]);
    page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  const bytes = await output.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/\.pdf$/i, '')}-annotated.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
