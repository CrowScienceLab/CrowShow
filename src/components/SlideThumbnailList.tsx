import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRenderer } from '../pdf/pdfRenderer';
import { PanelLeftClose, PanelLeftOpen, RotateCw, Copy, Trash2, Plus, FilePlus, Undo2, Redo2 } from 'lucide-react';

interface SlideThumbnailListProps {
  pdfDoc: PDFDocumentProxy;
  totalSlides: number;
  currentSlide: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectSlide: (slideNumber: number) => void;
  onEdit:(type:'delete'|'duplicate'|'rotate'|'blank'|'move',page:number,to?:number)=>void;
  onInsert:()=>void;
  busy:boolean; onRestore:()=>void; onSave:()=>void; canRestore:boolean;
  onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;
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

    const item = itemRef.current;
    if (!item) return;
    let started = false;
    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return;
      started = true;
      observer.disconnect();
      new PdfRenderer().renderThumbnail(pdfDoc, pageNumber, canvas, 180)
        .catch((err) => console.warn(`Thumbnail render page ${pageNumber} error:`, err));
    }, { root: item.closest('.thumbnail-scroll-area'), rootMargin: '200px' });
    observer.observe(item);
    return () => {
      observer.disconnect();
      PdfRenderer.cancel(canvas);
    };
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
  onSelectSlide, onEdit, onInsert, busy, onRestore, onSave, canRestore, onUndo, onRedo, canUndo, canRedo,
}) => {
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
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

      <div className="page-edit-tools" aria-label="PDF 페이지 편집">
        <button title="현재 페이지 회전" disabled={busy} onClick={()=>onEdit('rotate',currentSlide)}><RotateCw size={15}/></button>
        <button title="현재 페이지 복사" disabled={busy} onClick={()=>onEdit('duplicate',currentSlide)}><Copy size={15}/></button>
        <button title="빈 페이지 삽입" disabled={busy} onClick={()=>onEdit('blank',currentSlide)}><Plus size={15}/></button>
        <button title="다른 PDF 삽입" disabled={busy} onClick={onInsert}><FilePlus size={15}/></button>
        <button title="현재 PDF 페이지 삭제" disabled={busy||totalSlides===1} onClick={()=>{if(window.confirm('현재 PDF 페이지를 삭제할까요? 페이지 편집 실행 취소로 복원할 수 있습니다.'))onEdit('delete',currentSlide);}}><Trash2 size={15}/></button>
        <button title="페이지 편집 실행 취소" disabled={busy||!canUndo} onClick={onUndo}><Undo2 size={15}/></button><button title="페이지 편집 다시 실행" disabled={busy||!canRedo} onClick={onRedo}><Redo2 size={15}/></button>
      </div><div className="page-file-actions"><button disabled={busy||!canRestore} title="PDF를 열었을 때의 페이지와 필기로 복원" onClick={onRestore}>수정전 복원</button><button disabled={busy} title="수정한 페이지를 PDF로 저장 · 필기 제외" onClick={onSave}>PDF 저장</button>      </div><div className="thumbnail-scroll-area">
        {slides.map((pageNumber) => (
          <div key={pageNumber} className={`thumbnail-drag-slot ${dragOverPage===pageNumber?'drag-over':''}`} draggable={!busy} onDragStart={e=>{e.dataTransfer.setData('application/crowshow-page',String(pageNumber));e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragOverPage(null)} onDragOver={e=>{if(e.dataTransfer.types.includes('application/crowshow-page')){e.preventDefault();e.dataTransfer.dropEffect='move';setDragOverPage(pageNumber);}}} onDragLeave={()=>{setDragOverPage(curr=>curr===pageNumber?null:curr);}} onDrop={e=>{const from=Number(e.dataTransfer.getData('application/crowshow-page'));setDragOverPage(null);if(from){e.preventDefault();e.stopPropagation();if(!busy&&from!==pageNumber)onEdit('move',from,pageNumber);}}}>
          <ThumbnailItem
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            isActive={currentSlide === pageNumber}
            onSelect={() => onSelectSlide(pageNumber)}
          /></div>
        ))}
      </div>
    </aside>
  );
};
