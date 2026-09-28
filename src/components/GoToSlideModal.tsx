import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';

interface GoToSlideModalProps {
  currentSlide: number;
  totalSlides: number;
  onGoTo: (slideNumber: number) => void;
  onClose: () => void;
}

export const GoToSlideModal: React.FC<GoToSlideModalProps> = ({
  currentSlide,
  totalSlides,
  onGoTo,
  onClose,
}) => {
  const [val, setVal] = useState<string>(String(currentSlide));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > totalSlides) {
      setError(`1부터 ${totalSlides} 사이의 숫자를 입력하세요.`);
      return;
    }
    onGoTo(num);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>슬라이드 이동 (Go to Slide)</h3>
          <button className="icon-btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <label htmlFor="slide-num-input" className="input-label">
            이동할 슬라이드 번호 (전체: {totalSlides}페이지)
          </label>
          <div className="input-with-button">
            <input
              id="slide-num-input"
              type="number"
              min={1}
              max={totalSlides}
              value={val}
              autoFocus
              onChange={(e) => {
                setVal(e.target.value);
                setError(null);
              }}
              className="fluent-input"
            />
            <button type="submit" className="btn-primary">
              <span>이동</span>
              <ArrowRight size={16} />
            </button>
          </div>
          {error && <div className="input-error-text">{error}</div>}
          <div className="shortcut-hint">단축키: Ctrl + G</div>
        </form>
      </div>
    </div>
  );
};
