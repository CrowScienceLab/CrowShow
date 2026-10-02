export type PdfZoomMode = 'fit-page' | 'fit-width' | 'custom';

// PDF points are 1/72 inch; CSS pixels are 1/96 inch.
export const PDF_TO_CSS = 96 / 72;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const PAGE_PADDING = 24;

export function getPdfLayout(pageWidth: number, pageHeight: number,
  viewportWidth: number, viewportHeight: number, mode: PdfZoomMode, zoom: number) {
  const nativeWidth = pageWidth * PDF_TO_CSS;
  const nativeHeight = pageHeight * PDF_TO_CSS;
  const availableWidth = Math.max(100, viewportWidth - PAGE_PADDING);
  const availableHeight = Math.max(100, viewportHeight - PAGE_PADDING);
  const scale = mode === 'fit-page' ? Math.min(availableWidth / nativeWidth, availableHeight / nativeHeight)
    : mode === 'fit-width' ? availableWidth / nativeWidth : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  return { width: Math.round(nativeWidth * scale), height: Math.round(nativeHeight * scale), zoom: scale };
}

/** Keep the same document point under the cursor/viewport centre after zooming. */
export function getZoomScroll(oldWidth: number, oldHeight: number, newWidth: number, newHeight: number,
  viewportWidth: number, viewportHeight: number, left: number, top: number, x: number, y: number) {
  const pageLeft = (Math.max(viewportWidth, oldWidth + PAGE_PADDING) - oldWidth) / 2;
  const pageTop = (Math.max(viewportHeight, oldHeight + PAGE_PADDING) - oldHeight) / 2;
  const u = Math.max(0, Math.min(1, (left + x - pageLeft) / oldWidth));
  const v = Math.max(0, Math.min(1, (top + y - pageTop) / oldHeight));
  const contentWidth = Math.max(viewportWidth, newWidth + PAGE_PADDING);
  const contentHeight = Math.max(viewportHeight, newHeight + PAGE_PADDING);
  return {
    left: Math.max(0, Math.min(contentWidth - viewportWidth, (contentWidth - newWidth) / 2 + u * newWidth - x)),
    top: Math.max(0, Math.min(contentHeight - viewportHeight, (contentHeight - newHeight) / 2 + v * newHeight - y)),
  };
}

/** Supersample at normal sizes, with a bounded pixel budget for large zooms. */
export function getRenderDensity(width: number, height: number, devicePixelRatio: number): number {
  return Math.min(Math.max(2, devicePixelRatio || 1), 3, 16384 / Math.max(1, width),
    16384 / Math.max(1, height), Math.sqrt(16_000_000 / Math.max(1, width * height)));
}
