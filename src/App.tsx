import React, { useState, useEffect, useEffectEvent, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocumentInfo, RecentPdfDocument } from './types/pdf';
import type { ToolType, ShapeType } from './types/annotation';
import type { ViewMode, ScreenCurtain, TransitionType, SlideTransitionConfig } from './types/presentation';
import type { AppSettings } from './types/settings';
import { loadNotebook, saveNotebook } from './utils/notebookStorage';
import { readNotebookFile } from './utils/notebookFile';
import { flushInk } from './utils/inkStorage';
import { HelpDialog } from './components/HelpDialog';
import { DEFAULT_SETTINGS } from './types/settings';

import { PdfLoader } from './pdf/pdfLoader';
import { PdfCache } from './pdf/pdfCache';
import { MIN_ZOOM, MAX_ZOOM, stepZoom, type PdfZoomMode } from './pdf/pdfViewport';
import { AnnotationStore } from './annotations/annotationStore';
import { PresentationTimer } from './presentation/presentationTimer';
import { KeyboardShortcutManager, type ShortcutAction } from './presentation/keyboardShortcutManager';
import { SoundEngine } from './utils/soundEngine';
import { savePdfDocument, loadPdfDocument } from './utils/documentStore';
import { exportAnnotatedPdf } from './utils/exportAnnotatedPdf';
import {
  checkForDesktopUpdates,
  clearHwpConversionCache,
  convertKoreanDocument,
  getInitialDesktopPdf,
  isDesktopApp,
  koreanDocumentFormat,
  onDesktopOpenPdf,
  openExternalLink,
  openPdfDefaultApps,
  resizeWorkspaceWindow,
  supportsKoreanDocuments,
  type DesktopPdfPayload,
} from './utils/desktopBridge';
import {
  buildDriveUrls,
  fetchRemoteDocument,
  getRemoteQueryFromUrl,
  type RemoteDocumentQuery,
} from './utils/remoteDocumentLoader';

import { StartScreen } from './components/StartScreen';
import { HeaderToolbar } from './components/HeaderToolbar';
import { SlideThumbnailList } from './components/SlideThumbnailList';
import { BottomStatusBar } from './components/BottomStatusBar';
import { ToolDock } from './components/ToolDock';
import { NotebookPanel, type NotebookHandle, type NoteStatus } from './components/NotebookPanel';
import { PrintDialog } from './components/PrintDialog';
import type { NotebookData } from './types/notebook';
import type { SlideAnnotationMap, EraserMode } from './types/annotation';
import { editPdf, fitPdfToA4, remapAnnotations, remapPages, type PageEdit } from './utils/pdfEditing';
import { downloadBytes, encodePdf, decodePdf } from './utils/download';
import type { ToolDockProps } from './components/ToolDock';
import { readProject } from './utils/projectValidation';
interface DocumentSnapshot {bytes:Uint8Array;annotations:SlideAnnotationMap;notes:Record<number,string>;transitions:Record<number,TransitionType>;slide:number;notebook:NotebookData|null;}
const STANDALONE_NOTEBOOK_ID = 'standalone';

import { TransitionContainer } from './transitions/transitionContainer';
import { SlideNavButtons } from './components/SlideNavButtons';
import { PresenterModeView } from './presentation/presenterModeView';
import { GoToSlideModal } from './components/GoToSlideModal';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmModal } from './components/ConfirmModal';

import './styles/fluent.css';
import './styles/v13.css';
import './styles/workspace.css';
import './styles/v15.css';
import './styles/v16.css';

export const App: React.FC = () => {
  // --- SOUND ENGINE ---
  const soundEngine = SoundEngine.getInstance();
  // --- SETTINGS & THEME ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('crowshow_settings');
      const value=saved?{...DEFAULT_SETTINGS,...JSON.parse(saved)}:{...DEFAULT_SETTINGS};
      if(!['dark','light','pink','blue'].includes(value.theme))value.theme='dark';
      return value;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = ['dark','light','pink','blue'].includes(settings.theme) ? settings.theme : 'dark';
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
  const [displayZoom, setDisplayZoom] = useState(1);
  const [zoomMode, setZoomModeState] = useState<PdfZoomMode>('fit-width');
  const zoomModeRef=useRef<PdfZoomMode>('fit-width');
  const displayZoomRef=useRef(1);
  const setZoomMode=useCallback((mode:PdfZoomMode)=>{zoomModeRef.current=mode;setZoomModeState(mode);},[]);
  const resolveDisplayZoom=useCallback((zoom:number)=>{if(zoomModeRef.current!=='custom'){displayZoomRef.current=zoom;setDisplayZoom(zoom);}},[]);
  const changeZoom = useCallback((zoom: number) => {
    setZoomMode('custom');
    const next=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom));
    displayZoomRef.current=next;setDisplayZoom(next);setZoomFactor(next);
  }, [setZoomMode]);
  const stepDisplayZoom=useCallback((direction:number)=>changeZoom(stepZoom(displayZoomRef.current,direction)),[changeZoom]);
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
  const [shapeWidth,setShapeWidth]=useState(3),[shapeBorder,setShapeBorder]=useState(true),[shapeFillColor,setShapeFillColor]=useState('#facc15'),[shapeOpacity,setShapeOpacity]=useState(1);
  const [shapeFill, setShapeFill] = useState<boolean>(false);

  const [eraserMode,setEraserMode]=useState<EraserMode>('object');
  const [notebook,setNotebook]=useState<NotebookData|null>(null);
  const [standaloneNotebook, setStandaloneNotebook] = useState<NotebookData | null>(null);
  const [standaloneLoading, setStandaloneLoading] = useState(true);
  const [notebookRevision, setNotebookRevision] = useState(0);
  const standaloneLoad = useRef<Promise<NotebookData | null> | null>(null);
  const openStandalone = useCallback(() => {
    standaloneLoad.current ??= loadNotebook(STANDALONE_NOTEBOOK_ID).then(data => {
      setStandaloneNotebook(data);
      return data;
    }).catch(error => {
      standaloneLoad.current = null;
      throw error;
    }).finally(() => setStandaloneLoading(false));
    return standaloneLoad.current;
  }, []);
  useEffect(() => { void openStandalone().catch(error => console.warn('Notebook load:', error)); }, [openStandalone]);
  const [notesOpen,setNotesOpen]=useState(false);
  const toggleNotebook = useCallback(() => {
    if (docInfo || notesOpen) setNotesOpen(open => !open);
    else void openStandalone().then(() => setNotesOpen(true)).catch(() => alert('자동 저장 노트를 읽을 수 없습니다.'));
  }, [docInfo, notesOpen, openStandalone]);
  const [noteStore]=useState(()=>new AnnotationStore(false));
  const [printOpen,setPrintOpen]=useState(false);
  const [noteStorageError,setNoteStorageError]=useState(false);
  const notebookRef=useRef<NotebookHandle>(null);
  const originalDocumentRef=useRef<DocumentSnapshot|null>(null);
  const [noteStatus,setNoteStatus]=useState<NoteStatus>({page:1,total:1,zoom:1});
  const [eraserWidth,setEraserWidth]=useState(28);
  const [editBusy,setEditBusy]=useState(false);
  const editLock=useRef(false);
  const [docUndo,setDocUndo]=useState<DocumentSnapshot[]>([]),[docRedo,setDocRedo]=useState<DocumentSnapshot[]>([]);
  const insertInputRef=useRef<HTMLInputElement>(null);
  const [,setAnnotationRevision]=useState(0);
  // --- UI TOGGLES & MODALS ---
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [showGoToModal, setShowGoToModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // --- REFS & SINGLETONS ---
  const [presentationTimer] = useState(() => new PresentationTimer());
  const annotationStore = AnnotationStore.getInstance();
  const pdfCache = PdfCache.getInstance();
  const activeStore=notesOpen?noteStore:annotationStore;
  const notebookId = docInfo?.id ?? STANDALONE_NOTEBOOK_ID;
  const activeNotebook = docInfo ? notebook : standaloneNotebook;
  const changeNotebook = docInfo ? setNotebook : setStandaloneNotebook;
  const inWorkspace = Boolean(docInfo) || notesOpen;
  useEffect(() => {
    void resizeWorkspaceWindow(inWorkspace).catch(error => console.warn('Window resize:', error));
  }, [inWorkspace]);
  useEffect(()=>activeStore.subscribe(()=>{if(!activeStore.isEditing)setAnnotationRevision(n=>n+1);}),[activeStore]);
  // Synchronize the local notebook backup and report storage failures.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{if(!activeNotebook)return;let active=true;saveNotebook(notebookId,activeNotebook,error=>{if(active)setNoteStorageError(!!error)});return()=>{active=false}},[notebookId,activeNotebook]);
  useEffect(()=>{const flush=()=>{void flushInk()};document.addEventListener('visibilitychange',flush);window.addEventListener('pagehide',flush);let unlisten:(()=>void)|undefined;let disposed=false;if(isDesktopApp())void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{const stop=await getCurrentWindow().onCloseRequested(async event=>{event.preventDefault();try{await flushInk(true);await getCurrentWindow().destroy()}catch(error){alert(String(error))}});if(disposed)stop();else unlisten=stop;});return()=>{disposed=true;unlisten?.();document.removeEventListener('visibilitychange',flush);window.removeEventListener('pagehide',flush)}},[]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referencePdfInputRef = useRef<HTMLInputElement | null>(null);
  const hwpRefreshInputRef = useRef<HTMLInputElement | null>(null);
  const [convertingDocument, setConvertingDocument] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState<string | null>(() => {
    if (isDesktopApp()) return null;
    const query = getRemoteQueryFromUrl();
    if (!query || (query.mode === 'notebook' && !query.fileId && !query.url)) return null;
    return query.title || '원격 수업 자료';
  });
  const [remoteError, setRemoteError] = useState<{ query: RemoteDocumentQuery; message: string } | null>(null);
  const [pendingHwpPreview, setPendingHwpPreview] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    request: number;
    layout: 'overlap' | 'unavailable';
  } | null>(null);
  const conversionInProgress = useRef(false);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const audienceWindowRef = useRef<Window | null>(null);
  const audiencePdfRef = useRef<Uint8Array | null>(null);
  const lastWheelNavigationRef = useRef(0);
  const pdfLoadRequestRef = useRef(0);
  const activePdfIdRef = useRef(docInfo?.id);
  useEffect(() => { activePdfIdRef.current = docInfo?.id; }, [docInfo]);

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
    saveToLibrary = true,
    request = ++pdfLoadRequestRef.current
  ) => {
    if (request !== pdfLoadRequestRef.current) return;
    setPendingHwpPreview(null);
    try {
      const sourceBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const loader = PdfLoader.getInstance();
      const info = await loader.loadFromBuffer(sourceBytes, fileName, size);
      if (request !== pdfLoadRequestRef.current) return;
      const pdf = loader.getPdfDocument();

      if (!pdf) throw new Error('Failed to parse PDF');

      pdfCache.clear();
      setPdfDoc(pdf);
      setNotesOpen(false);
      setNotebook(null);
      setDocInfo(info);
      setPdfBytes(sourceBytes);
      setCurrentSlide(1);
      setZoomFactor(1);
      setZoomMode('fit-width');
      setScreenCurtain('none');
      setIsAutoPlaying(false);
      await annotationStore.setDocument(info.id);
      if(request!==pdfLoadRequestRef.current)return;
      setDocUndo([]);setDocRedo([]);setNotesOpen(false);
      const loadedNotebook=await loadNotebook(info.id);if(request!==pdfLoadRequestRef.current)return;setNotebook(loadedNotebook);

      try {
        setSpeakerNotes(JSON.parse(localStorage.getItem(`crowshow_notes_${info.id}`) || '{}'));
        setSlideTransitions(JSON.parse(localStorage.getItem(`crowshow_transitions_${info.id}`) || '{}'));
      } catch {
        setSpeakerNotes({});
        setSlideTransitions({});
      }

      try { originalDocumentRef.current={bytes:sourceBytes,annotations:annotationStore.getAllAnnotations(),notes:JSON.parse(localStorage.getItem(`crowshow_notes_${info.id}`)||'{}'),transitions:JSON.parse(localStorage.getItem(`crowshow_transitions_${info.id}`)||'{}'),slide:1,notebook:loadedNotebook}; }catch{ originalDocumentRef.current={bytes:sourceBytes,annotations:annotationStore.getAllAnnotations(),notes:{},transitions:{},slide:1,notebook:null}; }
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
      return request === pdfLoadRequestRef.current;
    } catch (err) {
      if (request !== pdfLoadRequestRef.current) return;
      console.error('PDF Load Error:', err);
      alert('PDF 파일을 불러오는 중 오류가 발생했습니다.');
    }
  }, [annotationStore, pdfCache, setZoomMode]);

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

  // Web query integration: open PDF/HWP/HWPX or Notebook requested from CrowScienceLab boards
  useEffect(() => {
    if (isDesktopApp()) return;
    const query = getRemoteQueryFromUrl();
    if (!query) return;

    if (query.mode === 'notebook' && !query.fileId && !query.url) {
      void openStandalone().then(() => setNotesOpen(true)).catch(() => {});
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { bytes, fileName } = await fetchRemoteDocument(query);
        if (cancelled) return;
        const format = koreanDocumentFormat(fileName);
        if (format) {
          setConvertingDocument(true);
          try {
            const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
            const file = new File([blob], fileName);
            const converted = await convertKoreanDocument(file, format, false);
            if (cancelled) return;
            await loadPdfData(converted.bytes, fileName, bytes.byteLength, true);
          } finally {
            setConvertingDocument(false);
          }
        } else {
          await loadPdfData(bytes, fileName, bytes.byteLength, true);
        }
        if (!cancelled && query.mode === 'notebook') {
          setNotesOpen(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('Remote document load fallback:', err);
        setRemoteError({
          query,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setRemoteLoading(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadPdfData, openStandalone]);

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

  useEffect(()=>{
    if(audiencePdfRef.current!==pdfBytes){audiencePdfRef.current=pdfBytes;sendAudienceState('initialize');}
  },[pdfBytes,sendAudienceState]);

  useEffect(() => annotationStore.subscribe(() => {if(!annotationStore.isEditing)sendAudienceState('navigate');}), [annotationStore, sendAudienceState]);

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
        setCurrentSlide(target);
        setScreenCurtain('none');
      }
    },
    [docInfo, currentSlide]
  );

  const previousSoundSlide=useRef<{document:string;page:number}|null>(null);
  useEffect(()=>{
    if(!docInfo)return;
    const previous=previousSoundSlide.current;
    previousSoundSlide.current={document:docInfo.id,page:currentSlide};
    if(previous?.document===docInfo.id&&previous.page!==currentSlide)soundEngine.playSlideSwitch(settings.transitionSound);
  },[docInfo,currentSlide,soundEngine,settings.transitionSound]);
  useEffect(()=>{soundEngine.setEnabled(settings.transitionSound!=='none');},[soundEngine,settings.transitionSound]);
  useEffect(()=>{const unlock=()=>soundEngine.unlock();document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);return()=>{document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);};},[soundEngine]);

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
      if((printOpen||notesOpen)&&action==='exitPresentation') {setPrintOpen(false);setNotesOpen(false);return;}
      if(printOpen||editBusy)return;
      if(notesOpen&&['nextSlide','prevSlide','firstSlide','lastSlide','startPresentation','print'].includes(action))return;
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
        case 'help':setShowHelp(true);break;
        case 'exitPresentation':
          if(showHelp)setShowHelp(false);
          else if (showGoToModal) setShowGoToModal(false);
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
          if (notesOpen) document.querySelector<HTMLSelectElement>('[aria-label="노트 페이지"]')?.focus();
          else if (docInfo) setShowGoToModal(true);
          break;
        case 'undo':
          soundEngine.playClick();
          activeStore.undo();
          break;
        case 'redo':
          soundEngine.playClick();
          activeStore.redo();
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
        case 'toolLasso':
          handleSelectTool('lasso');
          break;
        case 'toolText':
          handleSelectTool('text');
          break;
        case 'toggleNotes': toggleNotebook(); break;
        case 'print': if(viewMode==='normal' && pdfDoc)setPrintOpen(true); break;
        case 'zoomIn':
          soundEngine.playClick();
          if(notesOpen)notebookRef.current?.zoomStep(1);else stepDisplayZoom(1);
          break;
        case 'zoomOut':
          soundEngine.playClick();
          if(notesOpen)notebookRef.current?.zoomStep(-1);else stepDisplayZoom(-1);
          break;
        case 'zoomReset':
          soundEngine.playClick();
          if(notesOpen)notebookRef.current?.resetZoom();else changeZoom(1);
          break;
      }
    };

    const cleanup = shortcutManager.registerHandler(handleShortcut);
    return () => {
      cleanup();
      shortcutManager.destroy();
    };
  }, [
    changeZoom,
    stepDisplayZoom,
    setZoomMode,
    displayZoom,
    currentSlide,
    docInfo,
    viewMode,
    showGoToModal,
    showSettingsModal,showHelp,
    printOpen, notesOpen, editBusy, toggleNotebook, pdfDoc,
    handleNavigate,
    handleStartPresentation,
    handleExitPresentation,
    handleSelectTool,
    annotationStore,
    activeStore,
    soundEngine,
  ]);

  const handleOpenFile = async (file: File, refreshHwp = false) => {
    soundEngine.playClick();
    const format = koreanDocumentFormat(file.name);
    if (format && conversionInProgress.current) {
      alert('다른 한글 문서를 변환 중입니다. 끝난 뒤 다시 열어 주세요.');
      return;
    }
    const request = ++pdfLoadRequestRef.current;
    setPendingHwpPreview(null);
    if (format) {
      conversionInProgress.current = true;
      setConvertingDocument(true);
    }
    try {
      if (format) {
        const { bytes, layout } = await convertKoreanDocument(file, format, refreshHwp);
        if (request !== pdfLoadRequestRef.current) return;
        if (layout !== 'passed') {
          setPendingHwpPreview({ bytes, layout, name: file.name, size: file.size, request });
          return;
        }
        await loadPdfData(bytes, file.name, file.size, true, request);
      } else {
        await loadPdfData(await file.arrayBuffer(), file.name, file.size, true, request);
      }
    } catch (error) {
      if (request !== pdfLoadRequestRef.current) return;
      alert(format
        ? (error instanceof Error ? error.message : String(error))
        : 'PDF 파일을 읽을 수 없습니다. 파일 위치와 접근 권한을 확인해 주세요.');
    } finally {
      if (format) {
        conversionInProgress.current = false;
        setConvertingDocument(false);
      }
    }
  };

  const handleExportAnnotatedPdf = async () => {
    try {
      await exportAnnotatedPdf(pdfDoc!, docInfo!.name, pdfBytes!);
    } catch (error) {
      console.error(error);
      alert('필기 포함 PDF를 만드는 중 오류가 발생했습니다.');
    }
  };

  const handleExportA4 = async () => {
    if (!pdfBytes || !docInfo) return;
    try {
      const bytes = await fitPdfToA4(pdfBytes);
      downloadBytes(bytes, docInfo.name.replace(/\.(hwp|hwpx)$/i, '') + '-A4.pdf', 'application/pdf');
    } catch (error) {
      console.error(error);
      alert('A4 PDF를 저장하는 중 오류가 발생했습니다.');
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
    project.notebook = notebook ?? undefined;
    if(pdfBytes)project.pdfBase64=encodePdf(pdfBytes);
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docInfo.name.replace(/\.(pdf|hwp|hwpx)$/i, '')}.crowshow`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportProjectFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const project = readProject(String(event.target?.result ?? ''));
        if (!project?.annotations || typeof project.annotations!=='object') throw new Error('Missing annotations');
        if(project.pdfBase64) {
          if (!await loadPdfData(decodePdf(project.pdfBase64),project.documentName)) return;
        }
        else if (!docInfo) { alert('이 프로젝트의 원본 PDF를 먼저 여세요.'); return; }
        else if(docInfo&&(project.totalSlides!==docInfo.totalSlides||project.documentName!==docInfo.name)&&!window.confirm('현재 PDF와 다른 프로젝트입니다. 필기와 메모를 불러올까요?'))return;
        setNotebook(project.notebook??null);
        if(originalDocumentRef.current)originalDocumentRef.current={...originalDocumentRef.current,annotations:project.annotations,notes:project.speakerNotes||{},transitions:(project.slideTransitions||{}) as Record<number,TransitionType>,notebook:project.notebook||null};

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

  const snapshotDocument=():DocumentSnapshot=>({bytes:pdfBytes!,annotations:annotationStore.getAllAnnotations(),notes:speakerNotes,transitions:slideTransitions,slide:currentSlide,notebook});
  const restoreDocument=async(snapshot:DocumentSnapshot)=>{
    const loader=PdfLoader.getInstance();const info=await loader.loadFromBuffer(snapshot.bytes,docInfo!.name);
    const pdf=loader.getPdfDocument();if(!pdf)throw new Error('PDF를 열 수 없습니다.');
    pdfCache.clear();await annotationStore.setDocument(info.id);annotationStore.setAllAnnotations(snapshot.annotations);
    setPdfDoc(pdf);setDocInfo(info);setPdfBytes(snapshot.bytes);setCurrentSlide(Math.min(snapshot.slide,info.totalSlides));
    setSpeakerNotes(snapshot.notes);setSlideTransitions(snapshot.transitions);setNotebook(snapshot.notebook);
    setRecentFiles(items=>{const next=[{id:info.id,name:info.name,date:new Date().toLocaleDateString(),slideCount:info.totalSlides,fileSize:snapshot.bytes.byteLength},...items.filter(item=>item.id!==info.id)].slice(0,8);try{localStorage.setItem('crowshow_recent',JSON.stringify(next));}catch{}return next;});
    await savePdfDocument({id:info.id,name:info.name,date:new Date().toLocaleDateString(),slideCount:info.totalSlides,fileSize:snapshot.bytes.byteLength,bytes:snapshot.bytes.slice().buffer}).catch(()=>{});
  };
  const trimHistory=(items:DocumentSnapshot[])=>{
    let bytes=0;return items.slice(-5).reverse().filter(item=>{bytes+=item.bytes.byteLength;return bytes<=256*1024*1024;}).reverse();
  };
  const handlePageEdit=async(edit:PageEdit)=>{
    if(!pdfBytes||editLock.current)return;editLock.current=true;setEditBusy(true);
    const before=snapshotDocument();
    try{
      const result=await editPdf(pdfBytes,edit);
      const slide=edit.type==='delete'?Math.min(edit.page,result.mapping.length):edit.type==='move'?edit.to:edit.type==='rotate'?edit.page:edit.page+1;
      const next:DocumentSnapshot={...before,bytes:result.bytes,slide,annotations:remapAnnotations(before.annotations,result.mapping,edit.type==='rotate'?edit.page:undefined,result.aspect),notes:remapPages(before.notes,result.mapping),transitions:remapPages(before.transitions,result.mapping)};
      await restoreDocument(next);setDocUndo(history=>trimHistory([...history,before]));setDocRedo([]);setIsAutoPlaying(false);
    }catch(error){console.error(error);alert(`페이지 편집 실패: ${String(error)}`);}finally{editLock.current=false;setEditBusy(false);}
  };
  const travelDocument=async(redo=false)=>{
    const history=redo?docRedo:docUndo,last=history[history.length-1];if(!last||editLock.current)return;
    editLock.current=true;setEditBusy(true);const before=snapshotDocument();
    try{await restoreDocument(last);if(redo){setDocRedo(history.slice(0,-1));setDocUndo(items=>trimHistory([...items,before]));}else{setDocUndo(history.slice(0,-1));setDocRedo(items=>trimHistory([...items,before]));}}
    catch(error){alert(`복원 실패: ${String(error)}`);}finally{editLock.current=false;setEditBusy(false);}
  };

  const restoreOriginal=async()=>{
    if(!originalDocumentRef.current||editLock.current||!window.confirm('PDF를 열었을 때의 페이지와 필기로 복원합니다. 현재 상태는 페이지 편집 실행 취소로 되돌릴 수 있습니다.'))return;
    editLock.current=true;setEditBusy(true);const current=snapshotDocument();
    try{await restoreDocument({...originalDocumentRef.current,notebook});setDocUndo(history=>trimHistory([...history,current]));setDocRedo([]);}catch(error){alert(`복원 실패: ${String(error)}`);}finally{editLock.current=false;setEditBusy(false);}
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

  const openDroppedFile = useEffectEvent((event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.crowshow')) handleImportProjectFile(file);
    else if (name.endsWith('.crownotebook')) {
      const request = pdfLoadRequestRef.current;
      const pdfId = docInfo?.id;
      void (async () => {
        const book = { ...await readNotebookFile(file), id: crypto.randomUUID() };
        if (!pdfId) await openStandalone();
        if (request !== pdfLoadRequestRef.current || pdfId !== activePdfIdRef.current) return;
        const legacyId = crypto.randomUUID();
        changeNotebook(previous => {
          const existing = previous?.books?.length
            ? previous.books
            : previous?.pages.length ? [{ ...previous, id: legacyId, title: '나의 노트' }] : [];
          return { pages: book.pages, annotations: book.annotations, view: book.view, books: [...existing, book], activeBookId: book.id };
        });
        setNotebookRevision(value => value + 1);
        setViewMode(mode => mode === 'presenter' ? 'normal' : mode);
        setNotesOpen(true);
      })().catch(error => alert(`노트 불러오기 실패: ${String(error)}`));
    } else if (name.endsWith('.pdf') || file.type === 'application/pdf' || koreanDocumentFormat(name)) {
      void handleOpenFile(file);
    } else {
      alert(supportsKoreanDocuments()
        ? '.pdf, .hwp, .hwpx, .crowshow, .crownotebook 파일을 열 수 있습니다.'
        : '.pdf, .crowshow, .crownotebook 파일을 열 수 있습니다.');
    }
  });
  useEffect(() => {
    const allowDrop = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => openDroppedFile(event);
    window.addEventListener('dragover', allowDrop);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', allowDrop);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // PRESENTER VIEW (DUAL STUDIO)
  if (viewMode === 'presenter' && pdfDoc && docInfo) {
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

  const toolProps:ToolDockProps={activeTool,penColor,penWidth,highlighterColor,highlighterWidth,laserColor,shapeType,shapeFill,shapeWidth,shapeBorder,shapeFillColor,shapeOpacity,onShapeWidthChange:setShapeWidth,onShapeBorderChange:setShapeBorder,onShapeFillColorChange:setShapeFillColor,onShapeOpacityChange:setShapeOpacity,laserSize:settings.laserSize,laserTrailDurationMs:settings.laserTrailDurationMs,onLaserSizeChange:value=>setSettings(old=>({...old,laserSize:value})),onLaserDurationChange:value=>setSettings(old=>({...old,laserTrailDurationMs:value})),eraserMode,eraserWidth,enableStylusPressure:settings.enableStylusPressure,enableTilt:settings.enableTilt,onPressureChange:enabled=>setSettings(value=>({...value,enableStylusPressure:enabled})),onTiltChange:enabled=>setSettings(value=>({...value,enableTilt:enabled})),onEraserWidthChange:setEraserWidth,onSelectTool:handleSelectTool,onPenColorChange:setPenColor,onPenWidthChange:setPenWidth,onHighlighterColorChange:setHighlighterColor,onHighlighterWidthChange:setHighlighterWidth,onLaserColorChange:setLaserColor,onShapeTypeChange:setShapeType,onShapeFillChange:setShapeFill,onEraserModeChange:setEraserMode,onClearPage:()=>notesOpen?notebookRef.current?.clearPage():annotationStore.clearSlide(currentSlide),onClearDocument:()=>notesOpen?notebookRef.current?.clearAll():setShowClearConfirm(true)};
  const currentSlideAspect = docInfo?.pageAspectRatios[currentSlide - 1] || 16 / 9;
  const recentBook = standaloneNotebook?.books?.find(book => book.id === standaloneNotebook.activeBookId);
  const effectiveTransitionType = slideTransitions[currentSlide] ?? settings.defaultTransition;
  const effectiveTransitionConfig: SlideTransitionConfig = {
    ...transitionConfig,
    type: effectiveTransitionType,
    durationMs: settings.transitionDurationMs,
  };

  return (
    <div className={`app-container ${viewMode === 'presentation' ? 'presentation-fullscreen' : ''}`}>
      <input ref={insertInputRef} type="file" accept=".pdf,application/pdf" style={{display:'none'}} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void file.arrayBuffer().then(bytes=>handlePageEdit({type:'insert',page:currentSlide,bytes:new Uint8Array(bytes)})).catch(()=>alert('PDF 삽입 파일을 읽을 수 없습니다.'));}}/>
      {/* Hidden File Input for Open File Button */}
      <input
        ref={fileInputRef}
        type="file"
        accept={supportsKoreanDocuments() ? '.pdf,.hwp,.hwpx,application/pdf' : '.pdf,application/pdf'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleOpenFile(f);
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
      <input
        ref={referencePdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.pdf')) {
            alert('한컴 한글에서 저장한 PDF 파일을 선택해 주세요.');
            return;
          }
          void handleOpenFile(file);
        }}
      />

      <input
        ref={hwpRefreshInputRef}
        type="file"
        accept=".hwp,.hwpx"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (koreanDocumentFormat(file.name)) void handleOpenFile(file, true);
          else alert('HWP 또는 HWPX 문서를 선택해 주세요.');
        }}
      />

      {pendingHwpPreview && (
        <ConfirmModal
          title="한글 문서 조판 확인"
          message={pendingHwpPreview.layout === 'overlap'
            ? '변환본에서 글자나 표의 배치 문제가 감지됐습니다. 그림, 수식과 선택지도 원본과 대조하거나 한컴에서 저장한 PDF를 선택하세요.'
            : '변환본의 조판 검사를 마치지 못했습니다. 그림, 수식과 선택지를 원본과 대조하거나 한컴에서 저장한 PDF를 선택하세요.'}
          confirmLabel="한컴 PDF 선택"
          cancelLabel="변환본 열기"
          confirmStyle="primary"
          onConfirm={() => referencePdfInputRef.current?.click()}
          onCancel={() => setPendingHwpPreview(null)}
          onSecondaryAction={() => {
            const { bytes, name, size, request } = pendingHwpPreview;
            void loadPdfData(bytes, name, size, true, request);
          }}
        />
      )}

      {remoteError && (
        <ConfirmModal
          title="교과 자료실 문서 열기 안내"
          message={`[${remoteError.query.title || '선택한 자료'}] 원격 스트리밍 연결이 제한되었습니다 (${remoteError.message}). 원본 파일을 내려받아 이 화면에 끌어다 놓거나, Google Drive 미리보기로 열 수 있습니다.`}
          confirmLabel="원본 다운로드 후 열기"
          cancelLabel="Drive 미리보기 열기"
          confirmStyle="primary"
          onConfirm={() => {
            const { downloadUrl } = buildDriveUrls(remoteError.query.fileId, remoteError.query.url);
            void openExternalLink(downloadUrl);
            setRemoteError(null);
          }}
          onCancel={() => setRemoteError(null)}
          onSecondaryAction={() => {
            const { previewUrl } = buildDriveUrls(remoteError.query.fileId, remoteError.query.url);
            void openExternalLink(previewUrl);
            setRemoteError(null);
          }}
        />
      )}

      {!docInfo && !notesOpen ? (
        <StartScreen
          onOpenHelp={() => setShowHelp(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenPdf={() => fileInputRef.current?.click()}
          onOpenProject={() => projectInputRef.current?.click()}
          onStartNotebook={toggleNotebook}
          onOpenRecent={handleOpenRecent}
          recentFiles={recentFiles}
          recentNotebook={recentBook?.title ?? null}
          notebookLoading={standaloneLoading}
          supportsKoreanDocuments={supportsKoreanDocuments()}
        />
      ) : <>
        <HeaderToolbar
          hasPdf={Boolean(docInfo)}
          notesOpen={notesOpen} onToggleNotes={toggleNotebook}
          transitionType={effectiveTransitionType}
          transitionSound={settings.transitionSound}
          canUndo={activeStore.canUndo()}
          canRedo={activeStore.canRedo()}
          onOpenFile={() => fileInputRef.current?.click()}
          onStartPresentation={handleStartPresentation}
          onOpenPresenterMode={() => { soundEngine.playClick(); setViewMode('presenter'); }}
          onTransitionChange={(trans: TransitionType) => { soundEngine.playClick(); setTransitionConfig((prev) => ({ ...prev, type: trans })); setSlideTransitions((transitions) => ({ ...transitions, [currentSlide]: trans })); }}
          onTransitionSoundChange={(transitionSound) => {
            soundEngine.setEnabled(transitionSound !== 'none');
            setSettings((current) => ({ ...current, transitionSound }));
          }}
          onUndo={() => { soundEngine.playClick(); activeStore.undo(); }}
          onRedo={() => { soundEngine.playClick(); activeStore.redo(); }}
          onPrint={()=>setPrintOpen(true)}
          onExportPdf={()=>{if(pdfBytes && docInfo)downloadBytes(pdfBytes,docInfo.name.replace(/\.(pdf|hwp|hwpx)$/i,'')+'-edited.pdf','application/pdf');}}
          onExportA4={docInfo && koreanDocumentFormat(docInfo.name) ? () => void handleExportA4() : undefined}
          onExportAnnotatedPdf={() => void handleExportAnnotatedPdf()}
          onExportProject={handleExportProject}
          onImportProject={() => projectInputRef.current?.click()}
          onOpenSettings={() => { soundEngine.playClick(); setShowSettingsModal(true); }} onOpenHelp={()=>setShowHelp(true)}
        />

      {/* MAIN WORKSPACE BODY */}
      <div className="presentation-stage-wrapper">
        {/* Left: Thumbnail Sidebar (Normal mode only) */}
        {viewMode === 'normal' && pdfDoc && docInfo && (
          <SlideThumbnailList
            pdfDoc={pdfDoc}
            totalSlides={docInfo.totalSlides}
            currentSlide={currentSlide}
            isOpen={isSidebarOpen}
            onToggleOpen={() => {
              soundEngine.playClick();
              setIsSidebarOpen(!isSidebarOpen);
            }}
            onSelectSlide={page=>{setNotesOpen(false);handleNavigate(page);}}
            onRestore={()=>void restoreOriginal()} onSave={()=>{if(pdfBytes)downloadBytes(pdfBytes,docInfo.name.replace(/\.(pdf|hwp|hwpx)$/i,'')+'-edited.pdf','application/pdf');}} canRestore={docUndo.length>0}
            busy={editBusy} onEdit={(type,page,to)=>void handlePageEdit(type==='move'?{type,page,to:to!}:{type,page})}
            onInsert={()=>insertInputRef.current?.click()} onUndo={()=>void travelDocument()} onRedo={()=>void travelDocument(true)} canUndo={docUndo.length>0} canRedo={docRedo.length>0}
          />
        )}

        {/* Center: Slide Presentation Canvas Viewport */}
        <div
          ref={stageRef}
          className="slide-center-stage"
          onContextMenu={(event) => event.preventDefault()}
        >
          {notesOpen&&<NotebookPanel key={`${notebookId}/${notebookRevision}`} ref={notebookRef} docId={notebookId} data={activeNotebook} storageError={noteStorageError} store={noteStore} tools={toolProps} onChange={changeNotebook} onStatus={setNoteStatus} onClose={()=>setNotesOpen(false)}/>}
          {pdfDoc && docInfo && <div className="pdf-workspace-view" hidden={notesOpen}>
          <TransitionContainer
            key={docInfo.id}
            pdfDoc={pdfDoc}
            currentSlide={currentSlide}
            slideAspect={currentSlideAspect}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
            zoomFactor={zoomFactor}
            zoomMode={zoomMode}
            onZoomChange={changeZoom}
            onScaleChange={resolveDisplayZoom}
            onZoomStep={stepDisplayZoom}
            onWheelNavigate={(direction) => {
              const now = performance.now();
              if (now - lastWheelNavigationRef.current < 420) return;
              lastWheelNavigationRef.current = now;
              handleNavigate(currentSlide + direction);
            }}
            activeTool={activeTool}
            penColor={penColor}
            penWidth={penWidth}
            highlighterColor={highlighterColor}
            highlighterWidth={highlighterWidth}
            laserColor={laserColor}
            shapeType={shapeType}
            shapeFill={shapeFill} shapeWidth={shapeWidth} shapeBorder={shapeBorder} shapeFillColor={shapeFillColor} shapeOpacity={shapeOpacity} laserSize={settings.laserSize} laserTrailDurationMs={settings.laserTrailDurationMs}
            eraserMode={eraserMode}
            eraserWidth={eraserWidth}
            enableTilt={settings.enableTilt}
            readOnly={notesOpen||printOpen||editBusy}
            screenCurtain={screenCurtain}
            transitionConfig={effectiveTransitionConfig}
            enableStylusPressure={settings.enableStylusPressure}
            onRequestSelectTool={() => handleSelectTool('select')}
          />

          {/* Slide Navigation Buttons (< > on slide sides) */}
          <SlideNavButtons
            currentSlide={currentSlide}
            totalSlides={docInfo.totalSlides}
            onPrev={() => handleNavigate(currentSlide - 1)}
            onNext={() => handleNavigate(currentSlide + 1)}
          />
          </div>}
        </div>
      </div>

      {/* BOTTOM STATUS AND TOOL BAR (Normal mode only) */}
      {(
          <BottomStatusBar
          presentation={viewMode==='presentation'} onExitPresentation={handleExitPresentation}
          notebook={notesOpen}
          canPresent={Boolean(docInfo) && (!notesOpen || viewMode === 'presentation')}
          documentName={notesOpen ? (docInfo ? 'Notebook · '+docInfo.name : 'Notebook') : docInfo?.name ?? ''}
          tools={<ToolDock {...toolProps}/>}
          currentSlide={notesOpen?noteStatus.page:currentSlide}
          totalSlides={notesOpen?noteStatus.total:docInfo?.totalSlides ?? 0}
          zoomFactor={notesOpen?noteStatus.zoom:displayZoom}
          zoomMode={notesOpen?(noteStatus.mode||'fit-width'):zoomMode}
          timer={presentationTimer}
          onNavigate={page=>notesOpen?notebookRef.current?.navigate(page):handleNavigate(page)}
          onZoomIn={() => {
            soundEngine.playClick();
            if(notesOpen)notebookRef.current?.zoomStep(1);else stepDisplayZoom(1);
          }}
          onZoomOut={() => {
            soundEngine.playClick();
            if(notesOpen)notebookRef.current?.zoomStep(-1);else stepDisplayZoom(-1);
          }}
          onZoomReset={() => {
            soundEngine.playClick();
            if(notesOpen)notebookRef.current?.resetZoom();else changeZoom(1);
          }}
          onFitPage={() => notesOpen?notebookRef.current?.fitPage():setZoomMode('fit-page')}
          onFitWidth={() => notesOpen?notebookRef.current?.fitWidth():setZoomMode('fit-width')}
          onStartPresentation={handleStartPresentation}
          onGoToSlide={() => {
            soundEngine.playClick();
            if(notesOpen)document.querySelector<HTMLSelectElement>('[aria-label="노트 페이지"]')?.focus();else setShowGoToModal(true);
          }}
          />
      )}

      </>}
      {printOpen&&pdfDoc&&<PrintDialog pdf={pdfDoc} annotations={annotationStore.getAllAnnotations()} onClose={()=>setPrintOpen(false)}/>}
      {editBusy&&<div className="edit-progress" role="status">PDF 페이지 편집 중…</div>}
      {convertingDocument && <div className="edit-progress" role="status">한글 문서를 PDF로 변환 중…</div>}
      {remoteLoading && !convertingDocument && <div className="edit-progress" role="status">교과 자료실에서 [{remoteLoading}] 불러오는 중…</div>}

      {/* MODALS */}
      {showGoToModal && docInfo && (
        <GoToSlideModal
          currentSlide={currentSlide}
          totalSlides={docInfo.totalSlides}
          onGoTo={handleNavigate}
          onClose={() => setShowGoToModal(false)}
        />
      )}

      {showHelp&&<HelpDialog onClose={()=>setShowHelp(false)}/>}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          desktopAvailable={isDesktopApp()}
          onCheckUpdates={() => void checkForDesktopUpdates(true)}
          onOpenPdfDefaults={() => void openPdfDefaultApps()}
          onOpenHwpFresh={supportsKoreanDocuments() ? () => {
            hwpRefreshInputRef.current?.click();
            setShowSettingsModal(false);
          } : undefined}
          onClearHwpCache={supportsKoreanDocuments() ? () => {
            void clearHwpConversionCache().then(
              () => alert('한글 변환 캐시를 비웠습니다.'),
              error => alert(String(error)),
            );
          } : undefined}
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
