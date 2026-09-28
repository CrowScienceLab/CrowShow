import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRenderer } from '../pdf/pdfRenderer';
import { PresentationTimer } from './presentationTimer';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Clock,
  Sparkles,
  FileText,
  MonitorUp
} from 'lucide-react';

interface PresenterModeViewProps {
  pdfDoc: PDFDocumentProxy;
  currentSlide: number;
  totalSlides: number;
  onNavigate: (slideNumber: number) => void;
  onClose: () => void;
  onEnterFullscreen: () => void;
  speakerNote: string;
  onSpeakerNoteChange: (note: string) => void;
  onOpenAudienceWindow: () => void;
}

export const PresenterModeView: React.FC<PresenterModeViewProps> = ({
  pdfDoc,
  currentSlide,
  totalSlides,
  onNavigate,
  onClose,
  onEnterFullscreen,
  speakerNote,
  onSpeakerNoteChange,
  onOpenAudienceWindow,
}) => {
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRendererRef = useRef(new PdfRenderer());

  const [timer] = useState(() => new PresentationTimer());
  const [elapsed, setElapsed] = useState('00:00');
  const [isRunning, setIsRunning] = useState(false);
  const [clockTime, setClockTime] = useState('');

  // Auto-start timer on presenter mode mount
  useEffect(() => {
    timer.start();
    const unsub = timer.subscribe((_, running) => {
      setElapsed(timer.formatTime());
      setIsRunning(running);
    });

    const clockInterval = setInterval(() => {
      const now = new Date();
      setClockTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);

    return () => {
      unsub();
      clearInterval(clockInterval);
      timer.pause();
    };
  }, [timer]);

  // Render current slide
  useEffect(() => {
    const canvas = currentCanvasRef.current;
    if (!canvas || !pdfDoc) return;
    pdfRendererRef.current.renderSlide(pdfDoc, currentSlide, canvas, 640, 360, 1.0);
  }, [pdfDoc, currentSlide]);

  // Render next slide
  useEffect(() => {
    const canvas = nextCanvasRef.current;
    if (!canvas || !pdfDoc) return;
    if (currentSlide < totalSlides) {
      pdfRendererRef.current.renderSlide(pdfDoc, currentSlide + 1, canvas, 380, 214, 1.0);
    } else {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('마지막 슬라이드입니다 (End of Deck)', canvas.width / 2, canvas.height / 2);
      }
    }
  }, [pdfDoc, currentSlide, totalSlides]);

  return (
    <div className="presenter-mode-container">
      {/* Top Header */}
      <header className="presenter-header">
        <div className="presenter-title">
          <Sparkles size={20} className="text-accent" />
          <span>발표자 뷰 (Presenter Studio)</span>
          <span className="presenter-badge">듀얼 디스플레이 / 스피커 모드</span>
        </div>

        <div className="presenter-clocks">
          <div className="clock-item">
            <Clock size={16} />
            <span>현재 시각: {clockTime}</span>
          </div>
          <div className="clock-item timer-badge">
            <span>발표 시간: {elapsed}</span>
            <button
              className="icon-btn-sm"
              onClick={() => timer.toggle()}
              title={isRunning ? '타이머 일시정지' : '타이머 시작'}
            >
              {isRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              className="icon-btn-sm"
              onClick={() => timer.reset()}
              title="타이머 초기화"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div className="presenter-actions">
          <button className="btn-secondary" onClick={onOpenAudienceWindow} title="두 번째 모니터에 청중 화면 열기">
            <MonitorUp size={16} />
            <span>청중 화면</span>
          </button>
          <button className="btn-secondary" onClick={onEnterFullscreen} title="전체화면 슬라이드쇼">
            <Maximize2 size={16} />
            <span>슬라이드 쇼</span>
          </button>
          <button className="icon-btn" onClick={onClose} title="발표자 모드 닫기">
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Dual Stage */}
      <div className="presenter-body">
        {/* Left: Current Slide (Audience View) */}
        <div className="presenter-main-slide">
          <div className="slide-box-header">
            <span className="label">현재 청중에게 보이는 슬라이드</span>
            <span className="slide-num-pill">{currentSlide} / {totalSlides}</span>
          </div>
          <div className="presenter-canvas-wrapper">
            <canvas ref={currentCanvasRef} className="presenter-canvas" />
          </div>
        </div>

        {/* Right: Next Slide & Notes */}
        <div className="presenter-sidebar">
          {/* Next Slide Preview */}
          <div className="next-slide-box">
            <div className="slide-box-header">
              <span className="label">다음 슬라이드 미리보기</span>
              <span className="slide-num-pill">{currentSlide < totalSlides ? currentSlide + 1 : '—'} / {totalSlides}</span>
            </div>
            <div className="next-canvas-wrapper">
              <canvas ref={nextCanvasRef} className="presenter-canvas next" />
            </div>
          </div>

          {/* Speaker Notes */}
          <div className="speaker-notes-box">
            <div className="notes-header">
              <FileText size={16} />
              <span>발표자 메모 & 키노트</span>
            </div>
            <textarea
              className="speaker-notes-input"
              placeholder="이 슬라이드에서 설명할 핵심 내용, 질문 유도 사항, 발표 요점을 자유롭게 메모하세요..."
              value={speakerNote}
              onChange={(e) => onSpeakerNoteChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Bottom Navigation Control Bar */}
      <footer className="presenter-footer">
        <button
          className="btn-nav"
          disabled={currentSlide <= 1}
          onClick={() => onNavigate(currentSlide - 1)}
        >
          <ChevronLeft size={20} />
          <span>이전 슬라이드</span>
        </button>

        <div className="footer-slide-counter">
          <span>슬라이드 {currentSlide} / {totalSlides}</span>
          <input
            type="range"
            min={1}
            max={totalSlides}
            value={currentSlide}
            onChange={(e) => onNavigate(Number(e.target.value))}
            className="footer-slide-slider"
          />
        </div>

        <button
          className="btn-nav"
          disabled={currentSlide >= totalSlides}
          onClick={() => onNavigate(currentSlide + 1)}
        >
          <span>다음 슬라이드</span>
          <ChevronRight size={20} />
        </button>
      </footer>
    </div>
  );
};
