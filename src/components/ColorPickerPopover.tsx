import React, { useState } from 'react';

export interface ColorPickerPopoverProps {
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  laserColor: string;
  placement?: 'bottom' | 'top';
  initialTab?: 'pen' | 'highlighter' | 'laser';
  onPenColorChange: (color: string) => void;
  onPenWidthChange: (width: number) => void;
  onHighlighterColorChange: (color: string) => void;
  onHighlighterWidthChange: (width: number) => void;
  onLaserColorChange: (color: string) => void;
  onClose: () => void;
}

// 24종 다채로운 펜 컬러 팔레트
const PEN_PALETTE = [
  // 원색 & 주요색
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
  // 파스텔 & 소프트
  '#fca5a5', '#fdba74', '#fde047', '#86efac', '#93c5fd', '#c4b5fd',
  // 딥 & 모노톤
  '#991b1b', '#1e3a8a', '#166534', '#78350f', '#0f172a', '#ffffff',
];

// 12종 밝고 선명한 형광펜 팔레트
const HIGHLIGHTER_PALETTE = [
  '#facc15', '#a3e635', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8',
  '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#fdba74', '#fef08a',
];

// 10종 빛나는 레이저 포인터 컬러 팔레트
const LASER_PALETTE = [
  '#ef4444', // Red
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#ec4899', // Hot Pink
  '#facc15', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
  '#10b981', // Emerald
  '#ffffff', // White
];

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  laserColor,
  placement = 'bottom',
  initialTab = 'pen',
  onPenColorChange,
  onPenWidthChange,
  onHighlighterColorChange,
  onHighlighterWidthChange,
  onLaserColorChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'pen' | 'highlighter' | 'laser'>(initialTab);

  const currentColor =
    activeTab === 'pen'
      ? penColor
      : activeTab === 'highlighter'
      ? highlighterColor
      : laserColor;

  const currentWidth = activeTab === 'pen' ? penWidth : highlighterWidth;

  const handleColorSelect = (color: string) => {
    if (activeTab === 'pen') {
      onPenColorChange(color);
    } else if (activeTab === 'highlighter') {
      onHighlighterColorChange(color);
    } else {
      onLaserColorChange(color);
    }
  };

  const handleWidthChange = (val: number) => {
    if (activeTab === 'pen') {
      onPenWidthChange(val);
    } else if (activeTab === 'highlighter') {
      onHighlighterWidthChange(val);
    }
  };

  const palette =
    activeTab === 'pen'
      ? PEN_PALETTE
      : activeTab === 'highlighter'
      ? HIGHLIGHTER_PALETTE
      : LASER_PALETTE;

  return (
    <div className={`color-popover-card placement-${placement}`} onClick={(e) => e.stopPropagation()}>
      {/* Tab Navigation */}
      <div className="popover-tabs">
        <button
          className={`popover-tab-btn ${activeTab === 'pen' ? 'active' : ''}`}
          onClick={() => setActiveTab('pen')}
        >
          펜
        </button>
        <button
          className={`popover-tab-btn ${activeTab === 'highlighter' ? 'active' : ''}`}
          onClick={() => setActiveTab('highlighter')}
        >
          형광펜
        </button>
        <button
          className={`popover-tab-btn ${activeTab === 'laser' ? 'active' : ''}`}
          onClick={() => setActiveTab('laser')}
        >
          레이저
        </button>
      </div>

      {/* Palette Title & Custom Color Picker */}
      <div className="popover-header-row">
        <span className="popover-section-title">
          {activeTab === 'pen'
            ? '펜 색상표'
            : activeTab === 'highlighter'
            ? '형광펜 색상표'
            : '레이저 색상표'}
        </span>
        <label className="custom-color-label" title="직접 색상 선택 (커스텀)">
          <span>직접선택</span>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => handleColorSelect(e.target.value)}
            className="hidden-color-input"
          />
          <span className="custom-color-preview" style={{ backgroundColor: currentColor }} />
        </label>
      </div>

      {/* Swatches Grid */}
      <div className={`color-grid ${activeTab === 'pen' ? 'grid-pen' : ''}`}>
        {palette.map((c) => (
          <button
            key={c}
            className={`color-swatch ${currentColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => handleColorSelect(c)}
            title={c}
          />
        ))}
      </div>

      {/* Thickness Slider (Pen & Highlighter only) */}
      {activeTab !== 'laser' && (
        <>
          <div className="popover-section-title" style={{ marginTop: '14px' }}>
            선 굵기: {currentWidth}px
          </div>
          <div className="width-slider-row">
            <input
              type="range"
              min={activeTab === 'highlighter' ? 10 : 1}
              max={activeTab === 'highlighter' ? 48 : 24}
              value={currentWidth}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
              className="fluent-slider"
            />
            <div
              className="width-preview-dot"
              style={{
                width: `${Math.min(24, Math.max(4, currentWidth))}px`,
                height: `${Math.min(24, Math.max(4, currentWidth))}px`,
                backgroundColor: currentColor,
                opacity: activeTab === 'highlighter' ? 0.45 : 1.0,
              }}
            />
          </div>
        </>
      )}

      {/* Laser Glow Preview (Laser only) */}
      {activeTab === 'laser' && (
        <div className="laser-preview-row">
          <span className="popover-section-title">발광 프리뷰:</span>
          <div className="laser-preview-box">
            <div
              className="laser-preview-dot"
              style={{
                backgroundColor: currentColor,
                boxShadow: `0 0 12px 3px ${currentColor}`,
              }}
            />
          </div>
        </div>
      )}

      <div className="popover-footer">
        <button className="btn-text-sm" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
};
