import React, { useState } from 'react';
import { Clock, FileUp, FolderOpen, Maximize2, MonitorPlay, Play, Settings } from 'lucide-react';
import type { RecentPdfDocument } from '../types/pdf';

interface StartScreenProps { onOpenFile: (file: File) => void; recentFiles: RecentPdfDocument[]; onOpenRecent: (id: string) => void; }

export const StartScreen: React.FC<StartScreenProps> = ({ onOpenFile, recentFiles, onOpenRecent }) => {
  const [isDragging, setIsDragging] = useState(false);
  const accept = (file?: File) => {
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) onOpenFile(file);
    else alert('PDF 파일(.pdf)만 열 수 있습니다.');
  };
  return <div className="start-player-shell" onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); accept(e.dataTransfer.files?.[0]); }}>
    <div className="start-command-preview">
      <div className="command-brand"><img src="./yellow-billed-crow.png" alt="노란부리까마귀" /><span>CrowShow</span><small>v1.2</small></div>
      <span className="preview-command"><FolderOpen size={16} /> 열기</span><span className="preview-command primary"><Play size={15} /> 슬라이드쇼</span><span className="preview-command"><MonitorPlay size={16} /> 발표자</span><span className="preview-command muted">전환: 페이드</span><span className="preview-spacer" /><Settings size={18} />
    </div>
    <div className="empty-slide-workspace"><div className="empty-slide-paper"><img src="./yellow-billed-crow.png" alt="" /><span>PDF 프레젠테이션 영역</span></div></div>
    <div className="start-status-preview"><span>슬라이드 0 / 0</span><span>PDF 파일을 열어 시작하세요</span><span>00:00</span><span className="preview-tool-dots">↖　✎　▱　T　◇　⌕</span><span>100%</span><Maximize2 size={15} /></div>

    <div className={`start-open-panel ${isDragging ? 'dragging' : ''}`}>
      <div className="start-panel-heading"><img src="./yellow-billed-crow.png" alt="" /><div><strong>CrowShow</strong><span>오프라인 PDF 프레젠테이션</span></div></div>
      <div className="compact-dropzone"><FileUp size={25} /><strong>PDF를 여기에 놓으세요</strong><span>또는 아래 버튼으로 파일을 선택하세요</span></div>
      <label className="btn-primary file-upload-btn"><FolderOpen size={17} /><span>PDF 열기</span><input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => accept(e.target.files?.[0])} /></label>
      {recentFiles.length > 0 && <div className="compact-recent"><div className="compact-recent-title"><Clock size={14} /> 최근 파일</div>{recentFiles.slice(0, 3).map((file) => <button key={file.id} onClick={() => onOpenRecent(file.id)} title={file.name}><span>{file.name}</span><small>{file.slideCount}장</small></button>)}</div>}
      <p>파일은 이 컴퓨터 안에서만 처리됩니다.</p>
    </div>
  </div>;
};
