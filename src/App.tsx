import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocumentInfo, RecentPdfDocument } from './types/pdf';
import type { ToolType, ShapeType, CrowShowProjectData } from './types/annotation';
import type { ViewMode, ScreenCurtain, TransitionType, SlideTransitionConfig } from './types/presentation';
import type { AppSettings } from './types/settings';
import { DEFAULT_SETTINGS } from './types/settings';

import { PdfLoader } from './pdf/pdfLoader';
import { PdfCache } from './pdf/pdfCache';
import { AnnotationStore } from './annotations/annotationStore';
import { PresentationTimer } from './presentation/presentationTimer';
import { KeyboardShortcutManager, type ShortcutAction } from './presentation/keyboardShortcutManager';
import { SoundEngine } from './utils/soundEngine';
import { savePdfDocument, loadPdfDocument } from './utils/documentStore';
import { exportAnnotatedPdf } from './utils/exportAnnotatedPdf';
import {
  checkForDesktopUpdates,
  getInitialDesktopPdf,
  isDesktopApp,
  onDesktopOpenPdf,
  openPdfDefaultApps,
  type DesktopPdfPayload,
} from './utils/desktopBridge';

import { StartScreen } from './components/StartScreen';
import { HeaderToolbar } from './components/HeaderToolbar';
import { SlideThumbnailList } from './components/SlideThumbnailList';
import { BottomStatusBar } from './components/BottomStatusBar';
import { ToolDock } from './components/ToolDock';
import { FloatingToolbar } from './components/FloatingToolbar';
import { TransitionContainer } from './transitions/transitionContainer';
import { SlideNavButtons } from './components/SlideNavButtons';
import { PresenterModeView } from './presentation/presenterModeView';
import { GoToSlideModal } from './components/GoToSlideModal';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmModal } from './components/ConfirmModal';

import './styles/fluent.css';

export const App: React.FC = () => {
  // --- SOUND ENGINE ---
  const soundEngine = SoundEngine.getInstance();
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => soundEngine.isEnabled());

  const handleToggleSound = useCallback(() => {
    const newState = soundEngine.toggle();
    setIsSoundEnabled(newState);
  }, [soundEngine]);

  // --- SETTINGS & THEME ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('crowshow_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.setAttribute('data-theme', resolvedTheme);
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    try {
      localStorage.setItem('crowshow_settings', JSON.stringify(settings));
    } catch {
      // Ignored
    }
    return () => media.removeEventListener('change', applyTheme);
  }, [settings]);

  // --- DOCUMENT STATE ---
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [docInfo, setDocInfo] = useState<PdfDocumentInfo | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentPdfDocument[]>(() => {
    try {
      const saved = localStorage.getItem('crowshow_recent');
      return saved ? JSON.parse(saved).filter((item: RecentPdfDocument) => item.id) : [];
    } catch {
      return [];
    }
  });

  // --- PRESENTATION STATE ---
  const [currentSlide, setCurrentSlide] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [screenCurtain, setScreenCurtain] = useState<ScreenCurtain>('none');
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [slideTransitions, setSlideTransitions] = useState<Record<number, TransitionType>>({});
  const [speakerNotes, setSpeakerNotes] = useState<Record<number, string>>({});
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [transitionConfig, setTransitionConfig] = useState<SlideTransitionConfig>({
    type: settings.defaultTransition,
    durationMs: settings.transitionDurationMs,
    easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
  });

  // --- ANNOTATION STATE ---
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [penColor, setPenColor] = useState<string>(settings.penColor);
  const [penWidth, setPenWidth] = useState<number>(settings.penWidth);
  const [highlighterColor, setHighlighterColor] = useState<string>(settings.highlighterColor);
  const [highlighterWidth, setHighlighterWidth] = useState<number>(settings.highlighterWidth);
  const [laserColor, setLaserColor] = useState<string>(settings.laserColor);
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
  const [shapeFill, setShapeFill] = useState<boolean>(false);

  // --- UI TOGGLES & MODALS ---
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [showGoToModal, setShowGoToModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // --- REFS & SINGLETONS ---
  const [presentationTimer] = useState(() => new PresentationTimer());
  const annotationStore = AnnotationStore.getInstance();
  const pdfCache = PdfCache.getInstance();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const audienceWindowRef = useRef<Window | null>(null);
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastWheelNavigationRef = useRef(0);
  const pdfLoadRequestRef = useRef(0);

  // Container dimensions for responsive slide fitting
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 960,
    height: 540,
  });

  // ResizeObserver for responsive canvas scaling
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, isSidebarOpen, pdfDoc]);

  // Load PDF helper
  const loadPdfData = useCallback(async (
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    size?: number,
    saveToLibrary = true
  ) => {
    const request = ++pdfLoadRequestRef.current;
    try {
      const sourceBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const loader = PdfLoader.getInstance();
      const info = await loader.loadFromBuffer(sourceBytes, fileName, size);
      if (request !== pdfLoadRequestRef.current) return;
      const pdf = loader.getPdfDocument();

      if (!pdf) throw new Error('Failed to parse PDF');

      pdfCache.clear();
      setPdfDoc(pdf);
      setDocInfo(info);
      setPdfBytes(sourceBytes);
      setCurrentSlide(1);
      setZoomFactor(1);
      setPan({ x: 0, y: 0 });
      setScreenCurtain('none');
      setIsAutoPlaying(false);
      annotationStore.setDocument(info.id);
      try {
        setSpeakerNotes(JSON.parse(localStorage.getItem(`crowshow_notes_${info.id}`) || '{}'));
        setSlideTransitions(JSON.parse(localStorage.getItem(`crowshow_transitions_${info.id}`) || '{}'));
      } catch {
        setSpeakerNotes({});
        setSlideTransitions({});
      }

      if (saveToLibrary) {
        const recent: RecentPdfDocument = {
          id: info.id,
          name: fileName,
          date: new Date().toLocaleDateString(),
          slideCount: info.totalSlides,
          fileSize: sourceBytes.byteLength,
        };
        try {
          const storedBytes = sourceBytes.byteOffset === 0 && sourceBytes.byteLength === sourceBytes.buffer.byteLength
            ? sourceBytes.buffer as ArrayBuffer : sourceBytes.slice().buffer;
          await savePdfDocument({ ...recent, bytes: storedBytes });
          setRecentFiles((curr) => {
            const updated = [recent, ...curr.filter((f) => f.id !== info.id)].slice(0, 8);
            try { localStorage.setItem('crowshow_recent', JSON.stringify(updated)); }
            catch (error) { console.warn('Recent list storage warning:', error); }
            return updated;
          });
        } catch (storageError) {
          console.warn('Recent PDF storage warning:', storageError);
          alert('PDF는 열렸지만 파일이 커서 최근 파일 보관함에는 저장하지 못했습니다.');
        }
      }
    } catch (err) {
      if (request !== pdfLoadRequestRef.current) return;
      console.error('PDF Load Error:', err);
      alert('PDF 파일을 불러오는 중 오류가 발생했습니다.');
    }
  }, [annotationStore, pdfCache]);

  // Windows desktop integration: open PDFs passed by file association or a
  // second Explorer launch. The bridge is absent in the normal browser build.
  useEffect(() => {
    if (!isDesktopApp()) return;
    let unsubscribe = () => {};
    let disposed = false;

    const openPayload = (payload: DesktopPdfPayload | null) => {
      if (!payload) return;
      void loadPdfData(new Uint8Array(payload.bytes), payload.name, payload.size);
    };

    void getInitialDesktopPdf().then(openPayload).catch((error) => {
      console.error('Windows PDF open error:', error);
    });
    void onDesktopOpenPdf(openPayload).then((stop) => {
      if (disposed) stop();
      else unsubscribe = stop;
    });
    const updateTimer = window.setTimeout(() => void checkForDesktopUpdates(false), 1800);
    return () => {
      disposed = true;
      unsubscribe();
      window.clearTimeout(updateTimer);
    };
  }, [loadPdfData]);

  useEffect(() => {
    if (!docInfo) return;
    try {
      localStorage.setItem(`crowshow_notes_${docInfo.id}`, JSON.stringify(speakerNotes));
    } catch (error) { console.warn('Speaker notes storage warning:', error); }
  }, [docInfo, speakerNotes]);

  useEffect(() => {
    if (!docInfo) return;
    try {
      localStorage.setItem(`crowshow_transitions_${docInfo.id}`, JSON.stringify(slideTransitions));
    } catch (error) { console.warn('Transition storage warning:', error); }
  }, [docInfo, slideTransitions]);

  useEffect(() => {
    if (!isAutoPlaying || viewMode !== 'presentation' || !docInfo) return;
    const interval = window.setInterval(() => {
      setCurrentSlide((slide) => {
        if (slide < docInfo.totalSlides) return slide + 1;
        if (settings.autoPlayLoop) return 1;
        setIsAutoPlaying(false);
        return slide;
      });
    }, settings.autoPlayIntervalSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [isAutoPlaying, viewMode, docInfo, settings.autoPlayIntervalSeconds, settings.autoPlayLoop]);

  const sendAudienceState = useCallback((type: 'initialize' | 'navigate' = 'navigate') => {
    const target = audienceWindowRef.current;
    if (!target || target.closed || !docInfo) return;
    target.postMessage({
      source: 'crowshow-presenter',
      type,
      bytes: type === 'initialize' ? pdfBytes?.slice() : undefined,
      fileName: docInfo.name,
      currentSlide,
      transitionType: slideTransitions[currentSlide] ?? settings.defaultTransition,
      annotations: annotationStore.exportProjectData(
        docInfo.name,
        docInfo.totalSlides,
        settings.defaultTransition,
        settings.transitionDurationMs
      ).annotations,
    }, window.location.origin);
  }, [annotationStore, currentSlide, docInfo, pdfBytes, settings.defaultTransition, settings.transitionDurationMs, slideTransitions]);

  useEffect(() => {
    sendAudienceState('navigate');
  }, [sendAudienceState]);

  useEffect(() => annotationStore.subscribe(() => sendAudienceState('navigate')), [annotationStore, sendAudienceState]);

  useEffect(() => {
    const onAudienceReady = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.source === 'crowshow-audience') {
        sendAudienceState('initialize');
      }
    };
    window.addEventListener('message', onAudienceReady);
    return () => window.removeEventListener('message', onAudienceReady);
  }, [sendAudienceState]);

  const handleOpenAudienceWindow = useCallback(() => {
    const audienceUrl = new URL(window.location.href);
    audienceUrl.searchParams.set('audience', '1');
    const audience = window.open(audienceUrl.toString(), 'crowshow-audience', 'popup,width=1280,height=720');
    if (!audience) {
      alert('청중 화면 팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
      return;
    }
    audienceWindowRef.current = audience;
  }, []);

  // Preload nearby slides whenever currentSlide changes
  useEffect(() => {
    if (!pdfDoc) return;
    pdfCache.preloadNearbySlides(pdfDoc, currentSlide, settings.preloadSlideDistance);
  }, [pdfDoc, currentSlide, settings.preloadSlideDistance, pdfCache]);

  // Navigation handlers with sound effect
  const handleNavigate = useCallback(
    (slideNumber: number) => {
      if (!docInfo) return;
      const target = Math.max(1, Math.min(docInfo.totalSlides, slideNumber));
      if (target !== currentSlide) {
        soundEngine.playSlideSwitch(settings.transitionSound);
        setCurrentSlide(target);
        setScreenCurtain('none');
        setPan({ x: 0, y: 0 });
      }
    },
    [docInfo, currentSlide, soundEngine, settings.transitionSound]
  );

  // Tool selection with audio feedback
  const handleSelectTool = useCallback(
    (tool: ToolType) => {
      soundEngine.playToolSelect();
      setActiveTool(tool);
    },
    [soundEngine]
  );

  // Fullscreen presentation handlers
  const handleStartPresentation = useCallback(() => {
    soundEngine.playBeep();
    setViewMode('presentation');
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Ignored
    }
  }, [soundEngine]);

  const handleExitPresentation = useCallback(() => {
    soundEngine.playClick();
    setViewMode('normal');
    setScreenCurtain('none');
    setIsAutoPlaying(false);
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Ignored
    }
  }, [soundEngine]);

  // Listen for fullscreen change
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && viewMode === 'presentation') {
        setViewMode('normal');
        setScreenCurtain('none');
        setIsAutoPlaying(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [viewMode]);

  // Centralized keyboard shortcuts
  useEffect(() => {
    const shortcutManager = new KeyboardShortcutManager();

    const handleShortcut = (action: ShortcutAction) => {
      switch (action) {
        case 'nextSlide':
          handleNavigate(currentSlide + 1);
          break;
        case 'prevSlide':
          handleNavigate(currentSlide - 1);
          break;
        case 'firstSlide':
          handleNavigate(1);
          break;
        case 'lastSlide':
          if (docInfo) handleNavigate(docInfo.totalSlides);
          break;
        case 'startPresentation':
          handleStartPresentation();
          break;
        case 'exitPresentation':
          if (showGoToModal) setShowGoToModal(false);
          else if (showSettingsModal) setShowSettingsModal(false);
          else if (viewMode === 'presentation' || viewMode === 'presenter') handleExitPresentation();
          break;
        case 'blackScreen':
          soundEngine.playCurtain();
          setScreenCurtain((c) => (c === 'black' ? 'none' : 'black'));
          break;
        case 'whiteScreen':
          soundEngine.playCurtain();
          setScreenCurtain((c) => (c === 'white' ? 'none' : 'white'));
          break;
        case 'goToSlide':
          soundEngine.playClick();
          setShowGoToModal(true);
          break;
        case 'undo':
          soundEngine.playClick();
          annotationStore.undo();
          break;
        case 'redo':
          soundEngine.playClick();
          annotationStore.redo();
          break;
        case 'toolSelect':
          handleSelectTool('select');
          break;
        case 'toolPen':
          handleSelectTool('pen');
          break;
        case 'toolHighlighter':
          handleSelectTool('highlighter');
          break;
        case 'toolEraser':
          handleSelectTool('eraser');
          break;
        case 'toolLaser':
          handleSelectTool('laser');
          break;
        case 'toolSpotlight':
          handleSelectTool('spotlight');
          break;
        case 'toolText':
          handleSelectTool('text');
          break;
        case 'zoomIn':
          soundEngine.playClick();
          setZoomFactor((z) => Math.min(3.0, z + 0.15));
          break;
        case 'zoomOut':
          soundEngine.playClick();
          setZoomFactor((z) => Math.max(0.5, z - 0.15));
          break;
        case 'zoomReset':
          soundEngine.playClick();
          setZoomFactor(1.0);
          setPan({ x: 0, y: 0 });
          break;
      }
    };

    const cleanup = shortcutManager.registerHandler(handleShortcut);
    return () => {
      cleanup();
      shortcutManager.destroy();
    };
  }, [
    currentSlide,
    docInfo,
    viewMode,
    showGoToModal,
    showSettingsModal,
    handleNavigate,
    handleStartPresentation,
    handleExitPresentation,
    handleSelectTool,
    annotationStore,
    soundEngine,
  ]);

  const handleOpenFile = (file: File) => {
    soundEngine.playClick();
    void file.arrayBuffer().then((buf) => loadPdfData(buf, file.name, file.size)).catch(() => {
      alert('PDF 파일을 읽을 수 없습니다. 파일 위치와 접근 권한을 확인해 주세요.');
    });
  };

  const handleExportAnnotatedPdf = async () => {
    try {
      await exportAnnotatedPdf(pdfDoc!, docInfo!.name);
    } catch (error) {
      console.error(error);
      alert('필기 포함 PDF를 만드는 중 오류가 발생했습니다.');
    }
  };

  const handleExportProject = () => {
    if (!docInfo) return;
    const project = annotationStore.exportProjectData(
      docInfo.name,
      docInfo.totalSlides,
      settings.defaultTransition,
      settings.transitionDurationMs,
      slideTransitions,
      speakerNotes
    );
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docInfo.name.replace(/\.pdf$/i, '')}.crowshow`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportProjectFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(String(event.target?.result ?? '')) as CrowShowProjectData;
        if (!project?.annotations) throw new Error('Missing annotations');
        annotationStore.setAllAnnotations(project.annotations);
        setSlideTransitions((project.slideTransitions ?? {}) as Record<number, TransitionType>);
        setSpeakerNotes(project.speakerNotes ?? {});
        if (project.settings?.transitionType) {
          const type = project.settings.transitionType as TransitionType;
          const durationMs = project.settings.transitionDuration || 400;
          setSettings((current) => ({ ...current, defaultTransition: type, transitionDurationMs: durationMs }));
          setTransitionConfig((current) => ({ ...current, type, durationMs }));
        }
        alert('프로젝트 필기 및 발표 설정을 성공적으로 불러왔습니다.');
      } catch (error) {
        console.error(error);
        alert('올바르지 않은 프로젝트 파일 형식입니다.');
      } finally {
        if (projectInputRef.current) projectInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleOpenRecent = async (id: string) => {
    try {
      soundEngine.playClick();
      const stored = await loadPdfDocument(id);
      if (!stored) throw new Error('Stored PDF was not found.');
      await loadPdfData(stored.bytes, stored.name, stored.fileSize, false);
    } catch (error) {
      console.error(error);
      alert('저장된 PDF를 다시 열 수 없습니다. 원본 파일을 다시 선택해 주세요.');
    }
  };

  useEffect(() => {
    const allowDrop = (event: DragEvent) => event.preventDefault();
    const openDroppedPdf = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('PDF 파일(.pdf)만 열 수 있습니다.');
        return;
      }
      soundEngine.playClick();
      void file.arrayBuffer().then((buffer) => loadPdfData(buffer, file.name, file.size)).catch(() => {
        alert('PDF 파일을 읽을 수 없습니다.');
      });
    };
    window.addEventListener('dragover', allowDrop);
    window.addEventListener('drop', openDroppedPdf);
    return () => {
      window.removeEventListener('dragover', allowDrop);
      window.removeEventListener('drop', openDroppedPdf);
    };
  }, [loadPdfData, soundEngine]);

  // If loading or no PDF (brief fallback)
  if (!pdfDoc || !docInfo) {
    return (
      <div className="app-container">
        <StartScreen
          onOpenFile={handleOpenFile}
          recentFiles={recentFiles}
          onOpenRecent={handleOpenRecent}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handleOpenFile(f);
          }}
        />
      </div>
    );
  }

  // PRESENTER VIEW (DUAL STUDIO)
  if (viewMode === 'presenter') {
    return (
      <PresenterModeView
        pdfDoc={pdfDoc}
        currentSlide={currentSlide}
        totalSlides={docInfo.totalSlides}
        onNavigate={handleNavigate}
        onClose={() => setViewMode('normal')}
        onEnterFullscreen={handleStartPresentation}
        speakerNote={speakerNotes[currentSlide] ?? ''}
        onSpeakerNoteChange={(note) => setSpeakerNotes((notes) => ({ ...notes, [currentSlide]: note }))}
        onOpenAudienceWindow={handleOpenAudienceWindow}
      />
    );
  }

  const currentSlideAspect = docInfo.pageAspectRatios[currentSlide - 1] || 16 / 9;
  const effectiveTransitionType = slideTransitions[currentSlide] ?? settings.defaultTransition;
  const effectiveTransitionConfig: SlideTransitionConfig = {
    ...transitionConfig,
    type: effectiveTransitionType,
    durationMs: settings.transitionDurationMs,
  };

  return (
    <div className={`app-container ${viewMode === 'presentation' ? 'presentation-fullscreen' : ''}`}>
      {/* Hidden File Input for Open File Button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) handleOpenFile(f);
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".crowshow,.json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleImportProjectFile(file);
        }}
      />

      {viewMode === 'normal' && (
        <HeaderToolbar
          transitionType={effectiveTransitionType}
          transitionSound={settings.transitionSound}
          canUndo={annotationStore.canUndo()}
          canRedo={annotationStore.canRedo()}
          onOpenFile={() => fileInputRef.current?.click()}
          onStartPresentation={handleStartPresentation}
          onOpenPresenterMode={() => { soundEngine.playClick(); setViewMode('presenter'); }}
          onTransitionChange={(trans: TransitionType) => { soundEngine.playClick(); setTransitionConfig((prev) => ({ ...prev, type: trans })); setSlideTransitions((transitions) => ({ ...transitions, [currentSlide]: trans })); }}
          onTransitionSoundChange={(transitionSound) => {
            soundEngine.setEnabled(transitionSound !== 'none');
            setIsSoundEnabled(transitionSound !== 'none');
            setSettings((current) => ({ ...current, transitionSound }));
          }}
          onUndo={() => { soundEngine.playClick(); annotationStore.undo(); }}
          onRedo={() => { soundEngine.playClick(); annotationStore.redo(); }}
          onClearSlide={() => { soundEngine.playClick(); annotationStore.clearSlide(currentSlide); }}
          onClearAll={() => { soundEngine.playClick(); setShowClearConfirm(true); }}
          onExportAnnotatedPdf={() => void handleExportAnnotatedPdf()}
          onExportProject={handleExportProject}
          onImportProject={() => projectInputRef.current?.click()}
          onOpenSettings={() => { soundEngine.playClick(); setShowSettingsModal(true); }}
        />
      )}

      {/* MAIN WORKSPACE BODY */}
      <div className="presentation-stage-wrapper">
        {/* Left: Thumbnail Sidebar (Normal mode only) */}
        {viewMode === 'normal' && (
          <SlideThumbnailList
            pdfDoc={pdfDoc}
            totalSlides={docInfo.totalSlides}
            currentSlide={currentSlide}
            isOpen={isSidebarOpen}
            onToggleOpen={() => {
              soundEngine.playClick();
              setIsSidebarOpen(!isSidebarOpen);
            }}
            onSelectSlide={handleNavigate}
          />
        )}

        {/* Center: Slide Presentation Canvas Viewport */}
        <div
          ref={stageRef}
          className="slide-center-stage"
          onWheel={(event) => {
            event.preventDefault();
            if (event.ctrlKey) {
              setZoomFactor((zoom) => Math.max(0.5, Math.min(3, zoom - event.deltaY * 0.0015)));
              return;
            }
            if (Math.abs(event.deltaY) < 8) return;
            const now = performance.now();
            if (now - lastWheelNavigationRef.current < 420) return;
            lastWheelNavigationRef.current = now;
            handleNavigate(currentSlide + (event.deltaY > 0 ? 1 : -1));
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDownCapture={(event) => {
            if (zoomFactor <= 1 || !(event.button === 1 || (event.button === 0 && event.shiftKey))) return;
            panDragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMove={(event) => {
            const drag = panDragRef.current;
            if (!drag) return;
            setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
          }}
          onPointerUp={(event) => {
            if (!panDragRef.current) return;
            panDragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onDoubleClick={() => setPan({ x: 0, y: 0 })}
        >
          <TransitionContainer
            key={docInfo.id}
            pdfDoc={pdfDoc}
            currentSlide={currentSlide}
            slideAspect={currentSlideAspect}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
            zoomFactor={zoomFactor}
            pan={pan}
            activeTool={activeTool}
            penColor={penColor}
            penWidth={penWidth}
            highlighterColor={highlighterColor}
            highlighterWidth={highlighterWidth}
            laserColor={laserColor}
            spotlightRadius={settings.spotlightRadius}
            shapeType={shapeType}
            shapeFill={shapeFill}
            screenCurtain={screenCurtain}
            transitionConfig={effectiveTransitionConfig}
            enableStylusPressure={settings.enableStylusPressure}
            laserTrailEnabled={settings.laserTrailEnabled}
            onRequestSelectTool={() => handleSelectTool('select')}
          />

          {/* Slide Navigation Buttons (< > on slide sides) */}
          <SlideNavButtons
            currentSlide={currentSlide}
            totalSlides={docInfo.totalSlides}
            onPrev={() => handleNavigate(currentSlide - 1)}
            onNext={() => handleNavigate(currentSlide + 1)}
          />
        </div>
      </div>

      {/* BOTTOM STATUS AND TOOL BAR (Normal mode only) */}
      {viewMode === 'normal' && (
          <BottomStatusBar
          documentName={docInfo.name}
          tools={<ToolDock activeTool={activeTool} penColor={penColor} penWidth={penWidth} highlighterColor={highlighterColor} highlighterWidth={highlighterWidth} laserColor={laserColor} shapeType={shapeType} shapeFill={shapeFill} onSelectTool={handleSelectTool} onPenColorChange={setPenColor} onPenWidthChange={setPenWidth} onHighlighterColorChange={setHighlighterColor} onHighlighterWidthChange={setHighlighterWidth} onLaserColorChange={setLaserColor} onShapeTypeChange={setShapeType} onShapeFillChange={setShapeFill} />}
          currentSlide={currentSlide}
          totalSlides={docInfo.totalSlides}
          zoomFactor={zoomFactor}
          timer={presentationTimer}
          onNavigate={handleNavigate}
          onZoomIn={() => {
            soundEngine.playClick();
            setZoomFactor((z) => Math.min(3.0, z + 0.15));
          }}
          onZoomOut={() => {
            soundEngine.playClick();
            setZoomFactor((z) => Math.max(0.5, z - 0.15));
          }}
          onZoomReset={() => {
            soundEngine.playClick();
            setZoomFactor(1.0);
            setPan({ x: 0, y: 0 });
          }}
          onStartPresentation={handleStartPresentation}
          onGoToSlide={() => {
            soundEngine.playClick();
            setShowGoToModal(true);
          }}
          />
      )}

      {/* FLOATING TOOLBAR (Presentation mode only) */}
      {viewMode === 'presentation' && (
        <FloatingToolbar
          currentSlide={currentSlide}
          totalSlides={docInfo.totalSlides}
          activeTool={activeTool}
          penColor={penColor}
          penWidth={penWidth}
          highlighterColor={highlighterColor}
          highlighterWidth={highlighterWidth}
          laserColor={laserColor}
          shapeType={shapeType}
          shapeFill={shapeFill}
          screenCurtain={screenCurtain}
          canUndo={annotationStore.canUndo()}
          canRedo={annotationStore.canRedo()}
          isSoundEnabled={isSoundEnabled}
          onToggleSound={handleToggleSound}
          onSelectTool={handleSelectTool}
          onPenColorChange={setPenColor}
          onPenWidthChange={setPenWidth}
          onHighlighterColorChange={setHighlighterColor}
          onHighlighterWidthChange={setHighlighterWidth}
          onLaserColorChange={setLaserColor}
          onShapeTypeChange={setShapeType}
          onShapeFillChange={setShapeFill}
          onNavigate={handleNavigate}
          onToggleCurtain={(curtain) => {
            soundEngine.playCurtain();
            setScreenCurtain((c) => (c === curtain ? 'none' : curtain));
          }}
          onUndo={() => {
            soundEngine.playClick();
            annotationStore.undo();
          }}
          onRedo={() => {
            soundEngine.playClick();
            annotationStore.redo();
          }}
          onClearSlide={() => {
            soundEngine.playClick();
            annotationStore.clearSlide(currentSlide);
          }}
          onExitFullscreen={handleExitPresentation}
          onGoToSlide={() => {
            soundEngine.playClick();
            setShowGoToModal(true);
          }}
          autoHideDelayMs={settings.autoHideToolbarDelayMs}
          isAutoPlaying={isAutoPlaying}
          onToggleAutoPlay={() => setIsAutoPlaying((playing) => !playing)}
        />
      )}

      {/* MODALS */}
      {showGoToModal && (
        <GoToSlideModal
          currentSlide={currentSlide}
          totalSlides={docInfo.totalSlides}
          onGoTo={handleNavigate}
          onClose={() => setShowGoToModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          desktopAvailable={isDesktopApp()}
          onCheckUpdates={() => void checkForDesktopUpdates(true)}
          onOpenPdfDefaults={() => void openPdfDefaultApps()}
          onUpdateSettings={(newSet) => {
            soundEngine.playClick();
            if (newSet.laserColor) setLaserColor(newSet.laserColor);
            setSettings((curr) => {
              const updated = { ...curr, ...newSet };
              if (newSet.defaultTransition) {
                setTransitionConfig((prev) => ({ ...prev, type: newSet.defaultTransition! }));
              }
              if (newSet.transitionDurationMs) {
                setTransitionConfig((prev) => ({
                  ...prev,
                  durationMs: newSet.transitionDurationMs!,
                }));
              }
              return updated;
            });
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showClearConfirm && (
        <ConfirmModal
          title="전체 슬라이드 필기 삭제"
          message="현재 문서의 모든 슬라이드에 작성된 펜과 형광펜 필기 데이터가 모두 삭제됩니다. 계속하시겠습니까?"
          confirmLabel="전체 삭제"
          onConfirm={() => {
            soundEngine.playClick();
            annotationStore.clearAllSlides();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
};

export default App;
