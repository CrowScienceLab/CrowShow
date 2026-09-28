import React, { useEffect, useState } from 'react';
import { PresentationTimer } from '../presentation/presentationTimer';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Clock,
  Scan,
} from 'lucide-react';

interface BottomStatusBarProps {
  documentName: string;
  tools: React.ReactNode;
  currentSlide: number;
  totalSlides: number;
  zoomFactor: number;
  timer: PresentationTimer;
  onNavigate: (slideNumber: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onStartPresentation: () => void;
  onGoToSlide: () => void;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  documentName,
  tools,
  currentSlide,
  totalSlides,
  zoomFactor,
  timer,
  onNavigate,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onStartPresentation,
  onGoToSlide,
}) => {
  const [elapsed, setElapsed] = useState('00:00');
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const unsub = timer.subscribe((_, running) => {
      setElapsed(timer.formatTime());
      setIsRunning(running);
    });
    return unsub;
  }, [timer]);

  return (
    <footer className="fluent-status-bar">
      {/* Left: Slide Navigation */}
      <div className="status-section left">
        <button
          className="btn-status-nav"
          disabled={currentSlide <= 1}
          onClick={() => onNavigate(currentSlide - 1)}
          title="이전 슬라이드 (←, PageUp)"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          className="btn-slide-counter"
          onClick={onGoToSlide}
          title="슬라이드 직접 이동 (Ctrl+G)"
        >
          <span>슬라이드 {currentSlide} / {totalSlides}</span>
        </button>

        <button
          className="btn-status-nav"
          disabled={currentSlide >= totalSlides}
          onClick={() => onNavigate(currentSlide + 1)}
          title="다음 슬라이드 (→, Space, PageDown)"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="status-document-name" title={documentName}>
        <span className="doc-icon">PDF</span><span>{documentName}</span>
      </div>

      {/* Center: Presentation Timer */}
      <div className="status-section center">
        <div className="status-timer-box">
          <Clock size={14} className="text-muted" />
          <span className="timer-text">{elapsed}</span>
          <button
            className="icon-btn-xs"
            onClick={() => timer.toggle()}
            title={isRunning ? '타이머 일시정지' : '타이머 시작'}
          >
            {isRunning ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            className="icon-btn-xs"
            onClick={() => timer.reset()}
            title="타이머 초기화"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {tools}

      {/* Right: Zoom & Fullscreen */}
      <div className="status-section right">
        <div className="zoom-controls">
          <button
            className="icon-btn-xs"
            onClick={onZoomOut}
            disabled={zoomFactor <= 0.5}
            title="화면 축소 (-)"
          >
            <ZoomOut size={14} />
          </button>

          <button
            className="zoom-percentage-btn"
            onClick={onZoomReset}
            title="100% 화면 맞춤 (0)"
          >
            {Math.round(zoomFactor * 100)}%
          </button>

          <button
            className="icon-btn-xs"
            onClick={onZoomIn}
            disabled={zoomFactor >= 3.0}
            title="화면 확대 (+)"
          >
            <ZoomIn size={14} />
          </button>

          <button
            className="icon-btn-xs"
            onClick={onZoomReset}
            title="화면 맞춤 (Fit to View)"
          >
            <Scan size={14} />
          </button>
        </div>

        <div className="toolbar-separator-sm" />

        <button
          className="btn-fullscreen-trigger"
          onClick={onStartPresentation}
          title="전체화면 슬라이드 쇼 (F5)"
        >
          <Maximize2 size={15} />
          <span>전체화면</span>
        </button>
      </div>
    </footer>
  );
};
