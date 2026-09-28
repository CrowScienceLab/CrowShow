import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SlideNavButtonsProps {
  currentSlide: number;
  totalSlides: number;
  onPrev: () => void;
  onNext: () => void;
}

export const SlideNavButtons: React.FC<SlideNavButtonsProps> = ({
  currentSlide,
  totalSlides,
  onPrev,
  onNext,
}) => {
  const hasPrev = currentSlide > 1;
  const hasNext = currentSlide < totalSlides;

  return (
    <>
      {hasPrev && (
        <button
          className="stage-nav-arrow stage-nav-prev"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          title="이전 슬라이드 (←, PageUp)"
          aria-label="이전 슬라이드"
        >
          <ChevronLeft size={36} />
        </button>
      )}

      {hasNext && (
        <button
          className="stage-nav-arrow stage-nav-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          title="다음 슬라이드 (→, Space, 마우스 휠 아래)"
          aria-label="다음 슬라이드"
        >
          <ChevronRight size={36} />
        </button>
      )}
    </>
  );
};
