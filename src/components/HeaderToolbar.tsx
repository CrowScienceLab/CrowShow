import React, { useEffect, useRef, useState } from 'react';
import type { ToolType, ShapeType } from '../types/annotation';
import type { TransitionType } from '../types/presentation';
import { ColorPickerPopover } from './ColorPickerPopover';
import { ShapePickerPopover } from './ShapePickerPopover';
import {
  FolderOpen,
  Play,
  MonitorPlay,
  MousePointer,
  PenTool,
  Highlighter,
  Eraser,
  Dot,
  Search,
  Undo2,
  Redo2,
  Trash2,
  Settings,
  Palette,
  Layers,
  Volume2,
  VolumeX,
  Shapes,
  Type,
  Save,
  ChevronDown,
  FileDown,
  Download,
  Upload,
} from 'lucide-react';

interface HeaderToolbarProps {
  documentName: string;
  activeTool: ToolType;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  laserColor: string;
  shapeType: ShapeType;
  shapeFill: boolean;
  transitionType: TransitionType;
  canUndo: boolean;
  canRedo: boolean;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  onOpenFile: () => void;
  onStartPresentation: () => void;
  onOpenPresenterMode: () => void;
  onSelectTool: (tool: ToolType) => void;
  onPenColorChange: (color: string) => void;
  onPenWidthChange: (width: number) => void;
  onHighlighterColorChange: (color: string) => void;
  onHighlighterWidthChange: (width: number) => void;
  onLaserColorChange: (color: string) => void;
  onShapeTypeChange: (shape: ShapeType) => void;
  onShapeFillChange: (fill: boolean) => void;
  onTransitionChange: (trans: TransitionType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearSlide: () => void;
  onClearAll: () => void;
  onExportAnnotatedPdf: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onOpenSettings: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  documentName,
  activeTool,
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  laserColor,
  shapeType,
  shapeFill,
  transitionType,
  canUndo,
  canRedo,
  isSoundEnabled,
  onToggleSound,
  onOpenFile,
  onStartPresentation,
  onOpenPresenterMode,
  onSelectTool,
  onPenColorChange,
  onPenWidthChange,
  onHighlighterColorChange,
  onHighlighterWidthChange,
  onLaserColorChange,
  onShapeTypeChange,
  onShapeFillChange,
  onTransitionChange,
  onUndo,
  onRedo,
  onClearSlide,
  onClearAll,
  onExportAnnotatedPdf,
  onExportProject,
  onImportProject,
  onOpenSettings,
}) => {
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showShapePopover, setShowShapePopover] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const shapeButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeSaveMenu = (event: PointerEvent) => {
      if (!saveMenuRef.current?.contains(event.target as Node)) setShowSaveMenu(false);
    };
    document.addEventListener('pointerdown', closeSaveMenu);
    return () => document.removeEventListener('pointerdown', closeSaveMenu);
  }, []);

  const initialColorTab =
    activeTool === 'highlighter'
      ? 'highlighter'
      : activeTool === 'laser'
      ? 'laser'
      : 'pen';

  return (
    <div className="fluent-bottom-toolbar" aria-label="CrowShow 작업 도구">
      <div className="toolbar-left-section">
        <div className="brand-badge" title="CrowShow 1.0 · Crow Science Lab">
          <img src="./favicon.svg" alt="CrowShow" style={{ width: '22px', height: '22px', borderRadius: '4px' }} />
          <span>CrowShow <small>v1.0</small></span>
        </div>
        <button className="btn-fluent-action" onClick={onOpenFile} title="새 PDF 파일 열기">
          <FolderOpen size={16} />
          <span>열기</span>
        </button>

        <div className="doc-name-badge" title={documentName}>
          <span className="doc-icon">PDF</span>
          <span className="doc-text">{documentName}</span>
        </div>
      </div>

      <div className="toolbar-center-section">
        <button
          className="btn-slideshow-primary"
          onClick={onStartPresentation}
          title="전체화면 슬라이드 쇼 시작 (F5)"
        >
          <Play size={16} fill="currentColor" />
          <span>슬라이드 쇼</span>
        </button>

        <button
          className="btn-fluent-action"
          onClick={onOpenPresenterMode}
          title="발표자 모드 (Presenter Studio)"
        >
          <MonitorPlay size={16} />
          <span>발표자</span>
        </button>

        <div className="toolbar-separator" />

        <div className="tool-button-group">
          <button
            className={`btn-tool ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('select');
              setShowShapePopover(false);
            }}
            title="선택 / 회전 / 크기조절 / 삭제 (V)"
          >
            <MousePointer size={16} />
          </button>

          <button
            className={`btn-tool ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('pen');
              setShowShapePopover(false);
            }}
            title="펜 필기 (P)"
          >
            <PenTool size={16} />
            <span className="color-dot-indicator" style={{ backgroundColor: penColor }} />
          </button>

          <button
            className={`btn-tool ${activeTool === 'highlighter' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('highlighter');
              setShowShapePopover(false);
            }}
            title="형광펜 (H)"
          >
            <Highlighter size={16} />
            <span className="color-dot-indicator" style={{ backgroundColor: highlighterColor }} />
          </button>

          <button
            className={`btn-tool ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('text');
              setShowShapePopover(false);
            }}
            title="텍스트 입력 - 시스템 기본 글꼴 (T)"
          >
            <Type size={16} />
            <span className="color-dot-indicator" style={{ backgroundColor: penColor }} />
          </button>

          <div className="popover-anchor">
            <button
              ref={shapeButtonRef}
              className={`btn-tool ${activeTool === 'shape' ? 'active' : ''}`}
              onClick={() => {
                onSelectTool('shape');
                setShowShapePopover(!showShapePopover);
                setShowColorPopover(false);
              }}
              title="도형 그리기 (원, 사각형, 직선, 별, 하트, 말풍선, 손가락, 까마귀)"
            >
              <Shapes size={16} />
              <span
                className="color-dot-indicator"
                style={{ backgroundColor: penColor, borderRadius: shapeFill ? '2px' : '50%' }}
              />
            </button>

            {showShapePopover && (
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
            )}
          </div>

          <button
            className={`btn-tool ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('eraser');
              setShowShapePopover(false);
            }}
            title="획 단위 지우개 (E)"
          >
            <Eraser size={16} />
          </button>

          <button
            className={`btn-tool ${activeTool === 'laser' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('laser');
              setShowShapePopover(false);
            }}
            title="레이저 포인터 (L) - 잔상 지원"
          >
            <Dot size={24} style={{ color: laserColor }} />
          </button>

          <button
            className={`btn-tool ${activeTool === 'spotlight' ? 'active' : ''}`}
            onClick={() => {
              onSelectTool('spotlight');
              setShowShapePopover(false);
            }}
            title="스포트라이트 (S)"
          >
            <Search size={16} />
          </button>

          <div className="popover-anchor">
            <button
              ref={colorButtonRef}
              className={`btn-tool ${showColorPopover ? 'active' : ''}`}
              onClick={() => {
                setShowColorPopover(!showColorPopover);
                setShowShapePopover(false);
              }}
              title="색상표 및 선 굵기 조절 (펜, 형광펜, 레이저)"
            >
              <Palette size={16} />
            </button>

            {showColorPopover && (
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
            )}
          </div>
        </div>

        <div className="toolbar-separator" />

        <div className="transition-select-group">
          <Layers size={14} className="text-muted" />
          <select
            className="fluent-header-select"
            value={transitionType}
            onChange={(e) => onTransitionChange(e.target.value as TransitionType)}
            title="슬라이드 전환 효과 설정"
          >
            <option value="none">전환: 없음</option>
            <option value="fade">전환: 페이드 (Fade In/Out)</option>
            <option value="dissolve">전환: 디졸브 (Dissolve)</option>
            <option value="chalkboard">전환: 칠판 지우개 (Chalkboard)</option>
            <option value="slide-left">전환: 슬라이드 좌</option>
            <option value="slide-right">전환: 슬라이드 우</option>
            <option value="slide-up">전환: 슬라이드 상</option>
            <option value="slide-down">전환: 슬라이드 하</option>
            <option value="zoom">전환: 줌 (Zoom)</option>
          </select>
        </div>
      </div>

      <div className="toolbar-right-section">
        <button
          className={`btn-sound-toggle ${isSoundEnabled ? 'active' : ''}`}
          onClick={onToggleSound}
          title={isSoundEnabled ? '이벤트 효과음 켜짐 (클릭하여 끄기)' : '이벤트 효과음 음소거됨 (클릭하여 켜기)'}
        >
          {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        <div className="toolbar-separator" />

        <div className="history-button-group">
          <button
            className="btn-icon-subtle"
            disabled={!canUndo}
            onClick={onUndo}
            title="실행 취소 (Ctrl + Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn-icon-subtle"
            disabled={!canRedo}
            onClick={onRedo}
            title="다시 실행 (Ctrl + Y)"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-separator" />

        <button
          className="btn-icon-subtle"
          onClick={onClearSlide}
          title="현재 슬라이드 필기 지우기"
        >
          <Trash2 size={16} />
        </button>
        <button
          className="btn-icon-subtle"
          onClick={onClearAll}
          title="모든 슬라이드 필기 일괄 삭제"
        >
          <span style={{ fontSize: '11px', fontWeight: 600 }}>All</span>
        </button>

        <div className="popover-anchor" ref={saveMenuRef}>
          <button
            className={`btn-save-menu ${showSaveMenu ? 'active' : ''}`}
            onClick={() => setShowSaveMenu((open) => !open)}
            title="저장 및 프로젝트 가져오기"
            aria-haspopup="menu"
            aria-expanded={showSaveMenu}
          >
            <Save size={16} />
            <span>저장</span>
            <ChevronDown size={13} />
          </button>
          {showSaveMenu && (
            <div className="save-menu-popover" role="menu">
              <button onClick={() => { setShowSaveMenu(false); onExportAnnotatedPdf(); }}>
                <FileDown size={16} />
                <span><strong>필기 포함 PDF</strong><small>필기와 도형을 PDF에 합칩니다</small></span>
              </button>
              <button onClick={() => { setShowSaveMenu(false); onExportProject(); }}>
                <Download size={16} />
                <span><strong>내보내기</strong><small>.crowshow 프로젝트로 저장합니다</small></span>
              </button>
              <button onClick={() => { setShowSaveMenu(false); onImportProject(); }}>
                <Upload size={16} />
                <span><strong>가져오기</strong><small>.crowshow 프로젝트를 불러옵니다</small></span>
              </button>
            </div>
          )}
        </div>

        <button className="btn-icon-subtle" onClick={onOpenSettings} title="환경 설정">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
};
