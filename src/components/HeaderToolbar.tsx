import React, { useEffect, useRef, useState } from 'react';
import type { TransitionType } from '../types/presentation';
import type { TransitionSound } from '../types/settings';
import { ChevronDown, Download, FileDown, FolderOpen, Layers, MonitorPlay, Play, Redo2, Save, Settings, Trash2, Undo2, Upload, Volume2 } from 'lucide-react';

interface HeaderToolbarProps {
  transitionType: TransitionType; transitionSound: TransitionSound; canUndo: boolean; canRedo: boolean;
  onOpenFile: () => void; onStartPresentation: () => void; onOpenPresenterMode: () => void;
  onTransitionChange: (trans: TransitionType) => void; onTransitionSoundChange: (sound: TransitionSound) => void;
  onUndo: () => void; onRedo: () => void; onClearSlide: () => void; onClearAll: () => void;
  onExportAnnotatedPdf: () => void; onExportProject: () => void; onImportProject: () => void; onOpenSettings: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({ transitionType, transitionSound, canUndo, canRedo, onOpenFile, onStartPresentation, onOpenPresenterMode, onTransitionChange, onTransitionSoundChange, onUndo, onRedo, onClearSlide, onClearAll, onExportAnnotatedPdf, onExportProject, onImportProject, onOpenSettings }) => {
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!saveMenuRef.current?.contains(event.target as Node)) setShowSaveMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <header className="fluent-command-bar" aria-label="CrowShow 명령 메뉴">
      <div className="command-brand" title="Crow Science Lab"><img src="./yellow-billed-crow.png" alt="노란부리까마귀" /><span>CrowShow</span><small>v1.1</small></div>
      <button className="command-button" onClick={onOpenFile} title="PDF 열기"><FolderOpen size={17} /><span>열기</span></button>
      <button className="command-button primary" onClick={onStartPresentation} title="슬라이드쇼 (F5)"><Play size={16} fill="currentColor" /><span>슬라이드쇼</span></button>
      <button className="command-button" onClick={onOpenPresenterMode} title="발표자 보기"><MonitorPlay size={17} /><span>발표자</span></button>
      <div className="command-select-wrap transition-command"><Layers size={15} /><select value={transitionType} onChange={(e) => onTransitionChange(e.target.value as TransitionType)}><option value="none">전환 없음</option><option value="fade">페이드</option><option value="dissolve">디졸브</option><option value="chalkboard">칠판 지우기</option><option value="slide-left">왼쪽 이동</option><option value="slide-right">오른쪽 이동</option><option value="slide-up">위로 이동</option><option value="slide-down">아래로 이동</option><option value="zoom">확대</option></select></div>
      <div className="command-select-wrap sound-command"><Volume2 size={15} /><select value={transitionSound} onChange={(e) => onTransitionSoundChange(e.target.value as TransitionSound)} title="화면 전환 소리"><option value="none">소리 없음</option><option value="soft">부드러운 넘김</option><option value="paper">종이 넘김</option><option value="click">짧은 클릭</option><option value="chime">차임</option></select></div>
      <div className="command-spacer" />
      <button className="command-icon" disabled={!canUndo} onClick={onUndo} title="실행 취소"><Undo2 size={17} /></button>
      <button className="command-icon" disabled={!canRedo} onClick={onRedo} title="다시 실행"><Redo2 size={17} /></button>
      <button className="command-icon" onClick={onClearSlide} title="현재 슬라이드 필기 버리기"><Trash2 size={17} /></button>
      <button className="command-icon all-command" onClick={onClearAll} title="모든 슬라이드 필기 버리기">All</button>
      <div className="popover-anchor" ref={saveMenuRef}>
        <button className={`command-button save ${showSaveMenu ? 'active' : ''}`} onClick={() => setShowSaveMenu((v) => !v)}><Save size={16} /><span>저장</span><ChevronDown size={13} /></button>
        {showSaveMenu && <div className="save-menu-popover top-command-menu" role="menu"><button onClick={() => { setShowSaveMenu(false); onExportAnnotatedPdf(); }}><FileDown size={16} /><span><strong>필기 포함 PDF</strong><small>필기와 도형을 PDF에 합칩니다</small></span></button><button onClick={() => { setShowSaveMenu(false); onExportProject(); }}><Download size={16} /><span><strong>내보내기</strong><small>.crowshow 프로젝트로 저장합니다</small></span></button><button onClick={() => { setShowSaveMenu(false); onImportProject(); }}><Upload size={16} /><span><strong>가져오기</strong><small>.crowshow 프로젝트를 불러옵니다</small></span></button></div>}
      </div>
      <button className="command-icon" onClick={onOpenSettings} title="환경 설정"><Settings size={18} /></button>
    </header>
  );
};
