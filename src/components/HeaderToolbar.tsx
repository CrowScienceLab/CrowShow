import React, { useEffect, useRef, useState } from 'react';
import crowTeacherIcon from '../assets/crow-teacher-toolbar.png';
import type { TransitionType } from '../types/presentation';
import type { TransitionSound } from '../types/settings';
import { ChevronDown, Download, FileDown, FolderOpen, Layers, MonitorPlay, Play, Redo2, Save, Settings, Printer, Undo2, Upload, Volume2, CircleHelp } from 'lucide-react';

import { NotebookIcon } from './WorkspaceIcons';

interface HeaderToolbarProps {
  hasPdf: boolean;
  onOpenHelp:()=>void;notesOpen:boolean; onToggleNotes:()=>void;
  transitionType: TransitionType; transitionSound: TransitionSound; canUndo: boolean; canRedo: boolean;
  onOpenFile: () => void; onStartPresentation: () => void; onOpenPresenterMode: () => void;
  onTransitionChange: (trans: TransitionType) => void; onTransitionSoundChange: (sound: TransitionSound) => void;
  onUndo: () => void; onRedo: () => void; onPrint: () => void; onExportPdf: () => void;
  onExportA4?: () => void;
  onExportAnnotatedPdf: () => void; onExportProject: () => void; onImportProject: () => void; onOpenSettings: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({ hasPdf, onOpenHelp,notesOpen,onToggleNotes,transitionType, transitionSound, canUndo, canRedo, onOpenFile, onStartPresentation, onOpenPresenterMode, onTransitionChange, onTransitionSoundChange, onUndo, onRedo, onPrint, onExportPdf, onExportA4, onExportAnnotatedPdf, onExportProject, onImportProject, onOpenSettings }) => {
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!saveMenuRef.current?.contains(event.target as Node)) setShowSaveMenu(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showSaveMenu) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowSaveMenu(false);
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [showSaveMenu]);
  return (
    <header className="fluent-command-bar" aria-label="CrowShow 명령 메뉴">
      <div className="command-brand" title="Crow Science Lab">
        <img src={crowTeacherIcon} alt="" />
        <span>CrowShow</span>
        <small>v2.0</small>
      </div>
      <button className="command-button" onClick={onOpenFile} title="문서 열기"><FolderOpen size={17} /><span>열기</span></button>
      {hasPdf && <button className="command-button primary" onClick={onStartPresentation} title="슬라이드쇼 (F5)"><Play size={16} fill="currentColor" /><span>슬라이드쇼</span></button>}
      <button className={`command-button note-command ${notesOpen?'active':''}`} onClick={onToggleNotes} aria-label="노트 (N)" title="노트 (N)" aria-pressed={notesOpen}><NotebookIcon size={18}/><span>노트</span></button>
      {hasPdf && <><button className="command-button" onClick={onOpenPresenterMode} title="발표자 보기"><MonitorPlay size={17} /><span>발표자</span></button>
      <div className="command-select-wrap transition-command" title="화면 전환 효과"><Layers size={15} /><select aria-label="화면 전환 효과" title="화면 전환 효과" value={transitionType} onChange={(e) => onTransitionChange(e.target.value as TransitionType)}><option value="none">전환 없음</option><option value="fade">페이드</option><option value="dissolve">디졸브</option><option value="chalkboard">칠판 지우기</option><option value="slide-left">왼쪽 이동</option><option value="slide-right">오른쪽 이동</option><option value="slide-up">위로 이동</option><option value="slide-down">아래로 이동</option><option value="zoom">확대</option></select></div>
      <div className="command-select-wrap sound-command" title="화면 전환 소리"><Volume2 size={15} /><select aria-label="화면 전환 소리" value={transitionSound} onChange={(e) => onTransitionSoundChange(e.target.value as TransitionSound)} title="화면 전환 소리"><option value="none">소리 없음</option><option value="soft">부드러운 넘김</option><option value="paper">종이 넘김</option><option value="click">짧은 클릭</option><option value="chime">차임</option></select></div></>}
      <div className="command-spacer" />
      <button className="command-icon" disabled={!canUndo} onClick={onUndo} title="실행 취소 (Ctrl+Z)" aria-label="실행 취소"><Undo2 size={17} /></button>
      <button className="command-icon" disabled={!canRedo} onClick={onRedo} title="다시 실행 (Ctrl+Y)" aria-label="다시 실행"><Redo2 size={17} /></button>
      {hasPdf && <><button className="command-icon" onClick={onPrint} title="인쇄 미리보기 (Ctrl+P)" aria-label="인쇄 미리보기"><Printer size={17}/></button>
      <div className="popover-anchor" ref={saveMenuRef}>
        <button className={`command-button save ${showSaveMenu ? 'active' : ''}`} aria-expanded={showSaveMenu} aria-haspopup="menu" onClick={() => setShowSaveMenu((v) => !v)}><Save size={16} /><span>저장</span><ChevronDown size={13} /></button>
        {showSaveMenu && <div className="save-menu-popover top-command-menu" role="menu"><button role="menuitem" onClick={()=>{setShowSaveMenu(false);onExportPdf();}}><FileDown size={16}/><span><strong>편집한 PDF 저장</strong><small>원본 품질 · 필기 제외</small></span></button>{onExportA4 && <button role="menuitem" onClick={() => { setShowSaveMenu(false); onExportA4(); }}><FileDown size={16}/><span><strong>A4에 맞춰 PDF 저장</strong><small>비율 유지 · 필기 제외</small></span></button>}<button role="menuitem" onClick={() => { setShowSaveMenu(false); onExportAnnotatedPdf(); }}><FileDown size={16} /><span><strong>필기 포함 PDF</strong><small>필기와 도형을 PDF에 합칩니다</small></span></button><button role="menuitem" onClick={() => { setShowSaveMenu(false); onExportProject(); }}><Download size={16} /><span><strong>내보내기</strong><small>.crowshow 프로젝트로 저장합니다</small></span></button><button role="menuitem" onClick={() => { setShowSaveMenu(false); onImportProject(); }}><Upload size={16} /><span><strong>가져오기</strong><small>.crowshow 프로젝트를 불러옵니다</small></span></button></div>}
      </div></>}
      <button className="command-icon" onClick={onOpenHelp} title="도움말 (F1)" aria-label="도움말 (F1)"><CircleHelp size={18}/></button>
      <button className="command-icon" onClick={onOpenSettings} title="환경 설정" aria-label="환경 설정"><Settings size={18} /></button>
    </header>
  );
};
