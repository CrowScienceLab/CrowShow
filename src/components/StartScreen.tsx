import { useState } from 'react';
import { CircleHelp, FolderOpen, Settings } from 'lucide-react';
import type { RecentPdfDocument } from '../types/pdf';
import { NotebookIcon } from './WorkspaceIcons';
import { koreanDocumentFormat } from '../utils/desktopBridge';

interface StartScreenProps {
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenPdf: () => void;
  onOpenProject: () => void;
  onStartNotebook: () => void;
  onOpenRecent: (id: string) => void;
  recentFiles: RecentPdfDocument[];
  recentNotebook: string | null;
  notebookLoading: boolean;
  supportsKoreanDocuments: boolean;
}

export function StartScreen(props: StartScreenProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <main className="start-home">
      <section className="start-card" aria-label="CrowShow 시작">
        <header className="start-card-header">
          <div className="command-brand">
            <img src="./yellow-billed-crow.png" alt="" />
            <h1>CrowShow</h1><small>v2.0</small>
          </div>
          <div className="start-card-controls">
            <button type="button" className="command-icon" onClick={props.onOpenHelp} title="도움말 (F1)" aria-label="도움말"><CircleHelp size={18} /></button>
            <button type="button" className="command-icon" onClick={props.onOpenSettings} title="환경 설정" aria-label="환경 설정"><Settings size={18} /></button>
          </div>
        </header>

        <div
          className={`start-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={event => { if (event.dataTransfer.types.includes('Files')) setDragging(true); }}
          onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
          onDrop={() => setDragging(false)}
        >
          <strong>문서 또는 프로젝트·노트 파일을 놓으세요</strong>
          <span>{props.supportsKoreanDocuments ? '.pdf · .hwp · .hwpx' : '.pdf'} · .crowshow · .crownotebook</span>
        </div>

        <div className="start-card-actions">
          <button type="button" className="command-button primary" onClick={props.onOpenPdf}><FolderOpen size={18} />{props.supportsKoreanDocuments ? '문서 열기' : 'PDF 열기'}</button>
          <button type="button" className="command-button note-command" disabled={props.notebookLoading} onClick={props.onStartNotebook}><NotebookIcon size={18} />노트 시작</button>
        </div>

        <div className="start-recent">
          <div className="start-recent-heading">
            <span>{(props.recentFiles.length > 0 || props.recentNotebook) && '최근 항목'}</span>
            <button type="button" onClick={props.onOpenProject}>.crowshow 불러오기</button>
          </div>
          <div className="start-recent-items">
            {props.recentFiles.slice(0, 3).map(file => (
              <button type="button" key={file.id} title={file.name} onClick={() => props.onOpenRecent(file.id)}><b>{koreanDocumentFormat(file.name)?.toUpperCase() ?? 'PDF'}</b><span>{file.name}</span></button>
            ))}
            {props.recentNotebook && (
              <button type="button" onClick={props.onStartNotebook} title={props.recentNotebook}><b className="recent-note">노트</b><span>{props.recentNotebook} (자동 저장)</span></button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
