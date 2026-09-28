import React, { useState } from 'react';
import {
  FileUp,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { RecentPdfDocument } from '../types/pdf';

interface StartScreenProps {
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  recentFiles: RecentPdfDocument[];
  onOpenRecent: (id: string) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onOpenFile,
  onOpenSample,
  recentFiles,
  onOpenRecent,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      onOpenFile(file);
    } else {
      alert('PDF 파일(.pdf)만 열 수 있습니다.');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenFile(file);
    }
  };

  return (
    <div className="start-screen-container">
      {/* Background ambient lighting */}
      <div className="start-ambient-glow" />

      <div className="start-content-card">
        {/* Header */}
        <div className="start-header">
          <div className="start-logo-pill">
            <img src="/favicon.svg" alt="Crow Show Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
            <span className="logo-title">Crow Show</span>
          </div>
          <h1 className="start-headline">
            PDF & AI 슬라이드를 위한 다이내믹 프레젠테이션 플레이어 <br />
            <span className="gradient-text">Crow Show</span>
          </h1>
          <p className="start-subtext">
            PowerPoint급 슬라이드 쇼, 부드러운 전환 효과, 인라인 텍스트 및 벡터 도형, 1.5배 확대경 스포트라이트와 펜 필기를 지원합니다.
          </p>
        </div>

        {/* Drag & Drop Hero Box */}
        <div
          className={`dropzone-card ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="dropzone-icon-bubble">
            <FileUp size={36} className="text-accent" />
          </div>

          <h3>PDF 슬라이드를 이곳에 드래그하거나 파일을 선택하세요</h3>
          <p className="dropzone-desc">
            NotebookLM, Canva, Keynote, PPTX에서 내보낸 모든 표준 PDF를 지원합니다
          </p>

          <label className="btn-primary btn-lg file-upload-btn">
            <span>내 컴퓨터에서 PDF 열기</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </label>

          <div className="sample-quick-trigger">
            <span>또는 테스트용 샘플 슬라이드로 바로 시작하기:</span>
            <button className="btn-sample-slide" onClick={onOpenSample}>
              <Sparkles size={16} />
              <span>체험용 5-슬라이드 바로 열기</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="features-badge-row">
          <div className="feature-pill">
            <CheckCircle2 size={16} className="text-accent" />
            <span>PDF 원본 100% 무손실 보존</span>
          </div>
          <div className="feature-pill">
            <Zap size={16} className="text-accent" />
            <span>주변 슬라이드 사전 렌더링 (0ms 딜레이)</span>
          </div>
          <div className="feature-pill">
            <ShieldCheck size={16} className="text-accent" />
            <span>PowerPoint급 펜 필기 & 레이저 포인터</span>
          </div>
        </div>

        {/* Recent Files Section */}
        {recentFiles && recentFiles.length > 0 && (
          <div className="recent-files-card">
            <div className="recent-title">
              <Clock size={16} />
              <span>최근 발표 파일</span>
            </div>
            <div className="recent-list">
              {recentFiles.map((rf, idx) => (
                <div key={idx} className="recent-item">
                  <div className="recent-info">
                    <span className="recent-name">{rf.name}</span>
                    <span className="recent-meta">
                      {rf.slideCount} 슬라이드 • {rf.date}
                    </span>
                  </div>
                  <button className="btn-text-sm" onClick={() => onOpenRecent(rf.id)}>
                    열기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
