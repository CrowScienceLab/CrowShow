import React from 'react';
import type { ShapeType } from '../types/annotation';
import {
  Square,
  Circle,
  Minus,
  Star,
  Heart,
  MessageSquare,
  Hand,
  Feather,
} from 'lucide-react';

interface ShapePickerPopoverProps {
  currentShape: ShapeType;
  isFilled: boolean;
  onSelectShape: (shape: ShapeType) => void;
  onToggleFill: (filled: boolean) => void;
  onClose: () => void;
  placement?: 'bottom' | 'top';
}

const SHAPES: { type: ShapeType; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { type: 'rectangle', label: '사각형', icon: Square },
  { type: 'circle', label: '원 / 타원', icon: Circle },
  { type: 'line', label: '직선', icon: Minus },
  { type: 'star', label: '별', icon: Star },
  { type: 'heart', label: '하트', icon: Heart },
  { type: 'speech-bubble', label: '말풍선', icon: MessageSquare },
  { type: 'pointing-finger', label: '검지 손가락', icon: Hand },
  { type: 'crow', label: '까마귀 (Crow)', icon: Feather },
];

export const ShapePickerPopover: React.FC<ShapePickerPopoverProps> = ({
  currentShape,
  isFilled,
  onSelectShape,
  onToggleFill,
  onClose,
  placement = 'bottom',
}) => {
  return (
    <div className={`shape-popover-card placement-${placement}`} onClick={(e) => e.stopPropagation()}>
      <div className="popover-header-row">
        <span className="popover-section-title">도형 선택</span>
        {/* Fill / Outline Toggle */}
        <div className="fill-toggle-group">
          <button
            className={`btn-fill-toggle ${!isFilled ? 'active' : ''}`}
            onClick={() => onToggleFill(false)}
            title="테두리만 그리기"
          >
            테두리
          </button>
          <button
            className={`btn-fill-toggle ${isFilled ? 'active' : ''}`}
            onClick={() => onToggleFill(true)}
            title="면 채우기"
          >
            채우기
          </button>
        </div>
      </div>

      {/* Shapes Grid */}
      <div className="shape-grid">
        {SHAPES.map((item) => {
          const Icon = item.icon;
          const isSelected = currentShape === item.type;
          return (
            <button
              key={item.type}
              className={`shape-select-item ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectShape(item.type)}
              title={`${item.label} (드래그하여 그리기, Shift: 정비율)`}
            >
              <Icon size={20} className="shape-item-icon" />
              <span className="shape-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="shape-popover-hint">
        💡 드래그하여 슬라이드에 그리고, Shift를 누르면 1:1 정비율로 고정됩니다.
      </div>

      <div className="popover-footer">
        <button className="btn-text-sm" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
};
