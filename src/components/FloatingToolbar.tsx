import React, { useEffect, useState, useRef } from 'react';
import type { ToolType, ShapeType } from '../types/annotation';
import type { ScreenCurtain } from '../types/presentation';
import { ColorPickerPopover } from './ColorPickerPopover';
import { ShapePickerPopover } from './ShapePickerPopover';
import {
  MousePointer,
  PenTool,
  Highlighter,
  Eraser,
  Dot,
  Search,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Trash2,
  Square,
  Volume2,
  VolumeX,
  Shapes,
  Palette,
  Type,
  Play,
  Pause,
} from 'lucide-react';

interface FloatingToolbarProps {
  currentSlide: number;
  totalSlides: number;
  activeTool: ToolType;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  laserColor: string;
  shapeType: ShapeType;
  shapeFill: boolean;
  screenCurtain: ScreenCurtain;
  canUndo: boolean;
  canRedo: boolean;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
  onSelectTool: (tool: ToolType) => void;
  onPenColorChange: (color: string) => void;
  onPenWidthChange: (width: number) => void;
  onHighlighterColorChange: (color: string) => void;
  onHighlighterWidthChange: (width: number) => void;
  onLaserColorChange: (color: string) => void;
  onShapeTypeChange: (shape: ShapeType) => void;
  onShapeFillChange: (fill: boolean) => void;
  onNavigate: (slideNumber: number) => void;
  onToggleCurtain: (curtain: 'black' | 'white') => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearSlide: () => void;
  onExitFullscreen: () => void;
  onGoToSlide: () => void;
  autoHideDelayMs?: number;
  isAutoPlaying?: boolean;
  onToggleAutoPlay?: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  currentSlide,
  totalSlides,
  activeTool,
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  laserColor,
  shapeType,
  shapeFill,
  screenCurtain,
  canUndo,
  canRedo,
  isSoundEnabled,
  onToggleSound,
  onSelectTool,
  onPenColorChange,
  onPenWidthChange,
  onHighlighterColorChange,
  onHighlighterWidthChange,
  onLaserColorChange,
  onShapeTypeChange,
  onShapeFillChange,
  onNavigate,
  onToggleCurtain,
  onUndo,
  onRedo,
  onClearSlide,
  onExitFullscreen,
  onGoToSlide,
  autoHideDelayMs = 2500,
  isAutoPlaying = false,
  onToggleAutoPlay,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showShapePopover, setShowShapePopover] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Mouse movement listener to auto-hide / auto-show (don't auto-hide when popover is open)
  useEffect(() => {
    const handleMouseMove = () => {
      setIsVisible(true);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
      if (!showColorPopover && !showShapePopover) {
        hideTimerRef.current = window.setTimeout(() => {
          setIsVisible(false);
        }, autoHideDelayMs);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    if (!showColorPopover && !showShapePopover) {
      hideTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelayMs);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [autoHideDelayMs, showColorPopover, showShapePopover]);

  const initialColorTab =
    activeTool === 'highlighter'
      ? 'highlighter'
      : activeTool === 'laser'
      ? 'laser'
      : 'pen';

  return (
    <div
      className={`floating-toolbar-wrapper ${isVisible ? 'visible' : 'hidden'}`}
      onMouseEnter={() => {
        setIsVisible(true);
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      }}
      onMouseLeave={() => {
        if (!showColorPopover && !showShapePopover) {
          hideTimerRef.current = window.setTimeout(() => {
            setIsVisible(false);
          }, 1500);
        }
      }}
    >
      <div className="floating-toolbar-pill">
        {/* Navigation */}
        <div className="float-nav-group">
          <button
            className="float-btn"
            disabled={currentSlide <= 1}
            onClick={() => onNavigate(currentSlide - 1)}
            title="이전 슬라이드 (←, PageUp)"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            className="float-slide-counter-btn"
            onClick={onGoToSlide}
            title="특정 슬라이드로 직접 이동 (Ctrl + G)"
          >
            <span className="current">{currentSlide}</span>
            <span className="sep">/</span>
            <span className="total">{totalSlides}</span>
          </button>

          <button
            className="float-btn"
            disabled={currentSlide >= totalSlides}
            onClick={() => onNavigate(currentSlide + 1)}
            title="다음 슬라이드 (→, Space, 마우스 휠 아래)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="float-divider" />

        {/* Tools */}
        <div className="float-tools-group">
          <button
            className={`float-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('select');
              setShowShapePopover(false);
              setShowColorPopover(false);
            }}
            title="선택 / 일반 포인터 (V)"
          >
            <MousePointer size={17} />
          </button>

          <button
            className={`float-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('pen');
              setShowShapePopover(false);
            }}
            title="펜 필기 (P)"
          >
            <PenTool size={17} />
            <span className="tool-indicator-dot" style={{ backgroundColor: penColor }} />
          </button>

          <button
            className={`float-btn ${activeTool === 'highlighter' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('highlighter');
              setShowShapePopover(false);
            }}
            title="형광펜 (H)"
          >
            <Highlighter size={17} />
            <span className="tool-indicator-dot" style={{ backgroundColor: highlighterColor }} />
          </button>

          {/* Text Annotation Tool */}
          <button
            className={`float-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('text');
              setShowShapePopover(false);
            }}
            title="텍스트 입력 - 시스템 기본 글꼴 (T)"
          >
            <Type size={17} />
            <span className="tool-indicator-dot" style={{ backgroundColor: penColor }} />
          </button>

          {/* Shape Tool Button */}
          <div className="popover-anchor" style={{ position: 'relative' }}>
            <button
              className={`float-btn ${activeTool === 'shape' ? 'active' : ''}`}
              onClick={() => {
                onSelectTool('shape');
                setShowShapePopover(!showShapePopover);
                setShowColorPopover(false);
              }}
              title="도형 그리기 (원, 사각, 직선, 별, 하트, 말풍선, 손가락, 까마귀)"
            >
              <Shapes size={17} />
              <span
                className="tool-indicator-dot"
                style={{ backgroundColor: penColor, borderRadius: shapeFill ? '2px' : '50%' }}
              />
            </button>

            {showShapePopover && (
              <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)' }}>
                <ShapePickerPopover
                  currentShape={shapeType}
                  isFilled={shapeFill}
                  placement="top"
                  onSelectShape={(s) => {
                    onShapeTypeChange(s);
                    onSelectTool('shape');
                  }}
                  onToggleFill={onShapeFillChange}
                  onClose={() => setShowShapePopover(false)}
                />
              </div>
            )}
          </div>

          <button
            className={`float-btn ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('eraser');
              setShowShapePopover(false);
            }}
            title="획 단위 지우개 (E)"
          >
            <Eraser size={17} />
          </button>

          <button
            className={`float-btn ${activeTool === 'laser' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('laser');
              setShowShapePopover(false);
            }}
            title="레이저 포인터 (L) - 잔상 궤적"
          >
            <Dot size={24} style={{ color: laserColor }} />
          </button>

          <button
            className={`float-btn ${activeTool === 'spotlight' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('spotlight');
              setShowShapePopover(false);
            }}
            title="스포트라이트 조명 (S)"
          >
            <Search size={17} />
          </button>

          {/* Color Popover Button */}
          <div className="popover-anchor" style={{ position: 'relative' }}>
            <button
              className={`float-btn ${showColorPopover ? 'active' : ''}`}
              onClick={() => {
                setShowColorPopover(!showColorPopover);
                setShowShapePopover(false);
              }}
              title="색상표 및 선 굵기 조절"
            >
              <Palette size={17} />
            </button>

            {showColorPopover && (
              <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)' }}>
                <ColorPickerPopover
                  penColor={penColor}
                  penWidth={penWidth}
                  highlighterColor={highlighterColor}
                  highlighterWidth={highlighterWidth}
                  laserColor={laserColor}
                  initialTab={initialColorTab}
                  onPenColorChange={onPenColorChange}
                  onPenWidthChange={onPenWidthChange}
                  onHighlighterColorChange={onHighlighterColorChange}
                  onHighlighterWidthChange={onHighlighterWidthChange}
                  onLaserColorChange={onLaserColorChange}
                  placement="top"
                  onClose={() => setShowColorPopover(false)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="float-divider" />

        {/* Undo / Redo & Clear */}
        <div className="float-actions-group">
          <button
            className="float-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>

          <button
            className="float-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>

          <button
            className="float-btn"
            onClick={onClearSlide}
            title="현재 슬라이드 필기 지우기"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="float-divider" />

        {/* Sound & Curtains & Fullscreen Toggle */}
        <div className="float-misc-group">
          {onToggleAutoPlay && (
            <button
              className={`float-btn ${isAutoPlaying ? 'active' : ''}`}
              onClick={onToggleAutoPlay}
              title={isAutoPlaying ? '자동 재생 일시정지' : '자동 재생 시작'}
            >
              {isAutoPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          {onToggleSound && (
            <button
              className={`float-btn ${isSoundEnabled ? 'active' : ''}`}
              onClick={onToggleSound}
              title={isSoundEnabled ? '효과음 끄기' : '효과음 켜기'}
            >
              {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}

          <button
            className={`float-btn ${screenCurtain === 'black' ? 'active' : ''}`}
            onClick={() => onToggleCurtain('black')}
            title="블랙 스크린 토글 (B)"
          >
            <Square size={16} fill="currentColor" />
          </button>

          <button
            className="float-btn exit-btn"
            onClick={onExitFullscreen}
            title="슬라이드 쇼 종료 (ESC)"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
