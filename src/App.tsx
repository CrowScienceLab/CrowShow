import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocumentInfo, RecentPdfDocument } from './types/pdf';
import type { ToolType, ShapeType, CrowShowProjectData } from './types/annotation';
import type { ViewMode, ScreenCurtain, TransitionType, SlideTransitionConfig } from './types/presentation';
import type { AppSettings } from './types/settings';
import { DEFAULT_SETTINGS } from './types/settings';

import { PdfLoader } from './pdf/pdfLoader';
import { PdfCache } from './pdf/pdfCache';
import { createSamplePdfBytes } from './pdf/samplePdf';
import { AnnotationStore } from './annotations/annotationStore';
import { PresentationTimer } from './presentation/presentationTimer';
import { KeyboardShortcutManager, type ShortcutAction } from './presentation/keyboardShortcutManager';
import { SoundEngine } from './utils/soundEngine';
import { savePdfDocument, loadPdfDocument } from './utils/documentStore';
import { exportAnnotatedPdf } from './utils/exportAnnotatedPdf';

import { StartScreen } from './components/StartScreen';
import { HeaderToolbar } from './components/HeaderToolbar';
import { SlideThumbnailList } from './components/SlideThumbnailList';
import { BottomStatusBar } from './components/BottomStatusBar';
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
  const audienceWindowRef = useRef<Window | null>(null);
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastWheelNavigationRef = useRef(0);

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
  }, [viewMode, isSidebarOpen]);

  // Load PDF helper
  const loadPdfData = useCallback(async (
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    size?: number,
    saveToLibrary = true
  ) => {
    try {
      const sourceBytes = buffer instanceof Uint8Array ? buffer.slice() : new Uint8Array(buffer.slice(0));
      const loader = PdfLoader.getInstance();
      const info = await loader.loadFromBuffer(sourceBytes.slice(), fileName, size);
      const pdf = loader.getPdfDocument();

      if (!pdf) throw new Error('Failed to parse PDF');

      setPdfDoc(pdf);
      setDocInfo(info);
      setPdfBytes(sourceBytes);
      setCurrentSlide(1);
      setZoomFactor(1);
      setPan({ x: 0, y: 0 });
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
          await savePdfDocument({ ...recent, bytes: sourceBytes.slice().buffer });
          setRecentFiles((curr) => {
            const updated = [recent, ...curr.filter((f) => f.id !== info.id)].slice(0, 8);
            localStorage.setItem('crowshow_recent', JSON.stringify(updated));
            return updated;
          });
        } catch (storageError) {
          console.warn('Recent PDF storage warning:', storageError);
          alert('PDF는 열렸지만 파일이 커서 최근 파일 보관함에는 저장하지 못했습니다.');
        }
      }
    } catch (err) {
      console.error('PDF Load Error:', err);
      alert('PDF 파일을 불러오는 중 오류가 발생했습니다.');
    }
  }, [annotationStore]);

  // Windows desktop integration: open PDFs passed by file association or a
  // second Explorer launch. The bridge is absent in the normal browser build.
  useEffect(() => {
    const desktop = window.crowShowDesktop;
    if (!desktop) return;

    const openPayload = (payload: CrowShowPdfPayload | null) => {
      if (!payload) return;
      void loadPdfData(new Uint8Array(payload.bytes), payload.name, payload.size);
    };

    void desktop.getInitialPdf().then(openPayload).catch((error) => {
      console.error('Windows PDF open error:', error);
    });
    return desktop.onOpenPdf(openPayload);
  }, [loadPdfData]);

  useEffect(() => {
    if (!docInfo) return;
    localStorage.setItem(`crowshow_notes_${docInfo.id}`, JSON.stringify(speakerNotes));
  }, [docInfo, speakerNotes]);

  useEffect(() => {
    if (!docInfo) return;
    localStorage.setItem(`crowshow_transitions_${docInfo.id}`, JSON.stringify(slideTransitions));
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
        soundEngine.playSlideSwitch();
        setCurrentSlide(target);
        setScreenCurtain('none');
        setPan({ x: 0, y: 0 });
      }
    },
    [docInfo, currentSlide, soundEngine]
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
    file.arrayBuffer().then((buf) => {
      loadPdfData(buf, file.name, file.size);
    });
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

  const handleOpenSamplePresentation = () => {
    soundEngine.playBeep();
    const bytes = createSamplePdfBytes();
    loadPdfData(bytes, 'NotebookLM_AI_Slide_Demo.pdf', bytes.length, false);
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
      file.arrayBuffer().then((buffer) => loadPdfData(buffer, file.name, file.size));
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
          onOpenSample={handleOpenSamplePresentation}
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
          if (f) handleOpenFile(f);
        }}
      />

      {/* TOP HEADER TOOLBAR (Hidden in presentation mode) */}
      {viewMode === 'normal' && (
        <HeaderToolbar
          documentName={docInfo.name}
          activeTool={activeTool}
          penColor={penColor}
          penWidth={penWidth}
          highlighterColor={highlighterColor}
          highlighterWidth={highlighterWidth}
          laserColor={laserColor}
          shapeType={shapeType}
          shapeFill={shapeFill}
          transitionType={effectiveTransitionType}
          canUndo={annotationStore.canUndo()}
          canRedo={annotationStore.canRedo()}
          isSoundEnabled={isSoundEnabled}
          onToggleSound={handleToggleSound}
          onOpenFile={() => fileInputRef.current?.click()}
          onStartPresentation={handleStartPresentation}
          onOpenPresenterMode={() => {
            soundEngine.playClick();
            setViewMode('presenter');
          }}
          onSelectTool={handleSelectTool}
          onPenColorChange={setPenColor}
          onPenWidthChange={setPenWidth}
          onHighlighterColorChange={setHighlighterColor}
          onHighlighterWidthChange={setHighlighterWidth}
          onLaserColorChange={setLaserColor}
          onShapeTypeChange={setShapeType}
          onShapeFillChange={setShapeFill}
          onTransitionChange={(trans: TransitionType) => {
            soundEngine.playClick();
            setTransitionConfig((prev) => ({ ...prev, type: trans }));
            setSlideTransitions((transitions) => ({ ...transitions, [currentSlide]: trans }));
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
          onClearAll={() => {
            soundEngine.playClick();
            setShowClearConfirm(true);
          }}
          onOpenSettings={() => {
            soundEngine.playClick();
            setShowSettingsModal(true);
          }}
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

      {/* BOTTOM STATUS BAR (Normal mode only) */}
      {viewMode === 'normal' && (
        <BottomStatusBar
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
          documentName={docInfo.name}
          totalSlides={docInfo.totalSlides}
          slideTransitions={slideTransitions}
          speakerNotes={speakerNotes}
          onImportProject={(project: CrowShowProjectData) => {
            setSlideTransitions((project.slideTransitions ?? {}) as Record<number, TransitionType>);
            setSpeakerNotes(project.speakerNotes ?? {});
          }}
          onExportAnnotatedPdf={async () => {
            try {
              await exportAnnotatedPdf(pdfDoc, docInfo.name);
            } catch (error) {
              console.error(error);
              alert('필기 포함 PDF를 만드는 중 오류가 발생했습니다.');
            }
          }}
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
