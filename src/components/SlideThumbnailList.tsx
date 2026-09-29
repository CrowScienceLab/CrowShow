import React, { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRenderer } from '../pdf/pdfRenderer';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SlideThumbnailListProps {
  pdfDoc: PDFDocumentProxy;
  totalSlides: number;
  currentSlide: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectSlide: (slideNumber: number) => void;
}

interface ThumbnailItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  onSelect: () => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  pdfDoc,
  pageNumber,
  isActive,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const itemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDoc) return;

    const renderer = new PdfRenderer();
    renderer
      .renderThumbnail(pdfDoc, pageNumber, canvas, 180)
      .catch((err) => {
        console.warn(`Thumbnail render page ${pageNumber} error:`, err);
      });
  }, [pdfDoc, pageNumber]);

  return (
    <div
      ref={itemRef}
      className={`thumbnail-card ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      title={`슬라이드 ${pageNumber}`}
    >
      <div className="thumbnail-num-badge">{pageNumber}</div>
      <div className="thumbnail-canvas-container">
        <canvas ref={canvasRef} className="thumbnail-canvas" />
      </div>
    </div>
  );
};

export const SlideThumbnailList: React.FC<SlideThumbnailListProps> = ({
  pdfDoc,
  totalSlides,
  currentSlide,
  isOpen,
  onToggleOpen,
  onSelectSlide,
}) => {
  if (!isOpen) {
    return (
      <button
        className="thumbnail-collapsed-toggle"
        onClick={onToggleOpen}
        title="슬라이드 썸네일 패널 펼치기"
      >
        <PanelLeftOpen size={18} />
      </button>
    );
  }

  const slides = Array.from({ length: totalSlides }, (_, i) => i + 1);

  return (
    <aside className="thumbnail-sidebar">
      <div className="thumbnail-sidebar-header">
        <span className="sidebar-title">슬라이드 ({totalSlides})</span>
        <button
          className="icon-btn-sm"
          onClick={onToggleOpen}
          title="썸네일 패널 접기"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="thumbnail-scroll-area">
        {slides.map((pageNumber) => (
          <ThumbnailItem
            key={pageNumber}
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            isActive={currentSlide === pageNumber}
            onSelect={() => onSelectSlide(pageNumber)}
          />
        ))}
      </div>
    </aside>
  );
};
