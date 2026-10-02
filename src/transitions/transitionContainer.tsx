import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ToolType, ShapeType, LaserPointerState, SpotlightState } from '../types/annotation';
import type { ScreenCurtain, SlideTransitionConfig } from '../types/presentation';
import { PdfRenderer } from '../pdf/pdfRenderer';
import { getPdfLayout, getZoomScroll, PAGE_PADDING, MIN_ZOOM, MAX_ZOOM, type PdfZoomMode } from '../pdf/pdfViewport';
import { AnnotationCanvas } from '../annotations/annotationCanvas';
import { EffectsLayer } from '../annotations/effectsLayer';
import { TransitionEngine } from './transitionEngine';
import './transitionStyles.css';

interface TransitionContainerProps {
  pdfDoc: PDFDocumentProxy;
  currentSlide: number;
  slideAspect?: number;
  containerWidth: number;
  containerHeight: number;
  zoomFactor: number;
  zoomMode?: PdfZoomMode;
  onZoomChange?: (zoom: number) => void;
  onScaleChange?: (zoom: number) => void;
  onWheelNavigate?: (direction: number) => void;
  activeTool: ToolType;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  laserColor: string;
  spotlightRadius: number;
  shapeType?: ShapeType;
  shapeFill?: boolean;
  screenCurtain: ScreenCurtain;
  transitionConfig: SlideTransitionConfig;
  enableStylusPressure?: boolean;
  laserTrailEnabled?: boolean;
  readOnly?: boolean;
  onRequestSelectTool?: () => void;
}

export const TransitionContainer: React.FC<TransitionContainerProps> = ({
  pdfDoc,
  currentSlide,
  slideAspect = 16 / 9,
  containerWidth,
  containerHeight,
  zoomFactor,
  zoomMode = 'fit-page',
  onZoomChange,
  onScaleChange,
  onWheelNavigate,
  activeTool,
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  laserColor,
  spotlightRadius,
  shapeType = 'rectangle',
  shapeFill = false,
  screenCurtain,
  transitionConfig,
  enableStylusPressure = true,
  laserTrailEnabled = true,
  readOnly = false,
  onRequestSelectTool,
}) => {
  // Canvases
  const primaryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const secondaryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRendererRef = useRef(new PdfRenderer());
  const transitionEngine = TransitionEngine.getInstance();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: containerWidth, height: containerHeight });
  const [pageSize, setPageSize] = useState<{ pdf: PDFDocumentProxy; page: number; width: number; height: number } | null>(null);
  const resolvedSize = pageSize?.pdf === pdfDoc && pageSize.page === currentSlide
    ? pageSize : { width: 960, height: 960 / slideAspect };
  const zoomAnchor = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const previousLayout = useRef<{ pdf: PDFDocumentProxy; page: number; width: number; height: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void pdfDoc.getPage(currentSlide).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      setPageSize({ pdf: pdfDoc, page: currentSlide, width: viewport.width, height: viewport.height });
    }).catch((error) => { if (!cancelled) console.warn('PDF page size warning:', error); });
    return () => { cancelled = true; };
  }, [pdfDoc, currentSlide]);

  // Transition state
  const prevSlideRef = useRef<number>(currentSlide);
  const [transitionState, setTransitionState] = useState<{
    isTransitioning: boolean;
    prevSlide: number | null;
    exitClass: string;
    enterClass: string;
  }>({
    isTransitioning: false,
    prevSlide: null,
    exitClass: '',
    enterClass: '',
  });

  // Laser & Spotlight states
  const [laserState, setLaserState] = useState<LaserPointerState>({
    x: 0.5,
    y: 0.5,
    active: false,
    color: laserColor,
    trail: [],
  });

  const [spotlightState, setSpotlightState] = useState<SpotlightState>({
    x: 0.5,
    y: 0.5,
    active: false,
    radius: spotlightRadius,
  });

  const layout = useMemo(() => getPdfLayout(resolvedSize.width, resolvedSize.height,
    viewportSize.width, viewportSize.height, zoomMode, zoomFactor),
  [resolvedSize.width, resolvedSize.height, viewportSize.width, viewportSize.height, zoomMode, zoomFactor]);
  const slideWidth = layout.width;
  const slideHeight = layout.height;

  useEffect(() => { onScaleChange?.(layout.zoom); }, [layout.zoom, onScaleChange]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const previous = previousLayout.current;
    if (previous?.pdf === pdfDoc && previous.page === currentSlide && zoomMode === 'custom') {
      const anchor = zoomAnchor.current;
      const position = getZoomScroll(previous.width, previous.height, slideWidth, slideHeight,
        element.clientWidth, element.clientHeight, anchor?.left ?? previous.left, anchor?.top ?? previous.top,
        anchor?.x ?? element.clientWidth / 2, anchor?.y ?? element.clientHeight / 2);
      element.scrollLeft = position.left;
      element.scrollTop = position.top;
    } else {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    }
    zoomAnchor.current = null;
    previousLayout.current = { pdf: pdfDoc, page: currentSlide, width: slideWidth, height: slideHeight,
      left: element.scrollLeft, top: element.scrollTop };
  }, [pdfDoc, currentSlide, slideWidth, slideHeight, zoomMode]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const deltaY = event.deltaY * deltaScale;
      if (event.ctrlKey) {
        const bounds = element.getBoundingClientRect();
        zoomAnchor.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top,
          left: element.scrollLeft, top: element.scrollTop };
        onZoomChange?.(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, layout.zoom * Math.exp(-deltaY * 0.0015))));
      } else if (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2) {
        element.scrollBy({ left: event.shiftKey ? deltaY : event.deltaX * deltaScale,
          top: event.shiftKey ? 0 : deltaY });
      } else if (Math.abs(deltaY) >= 8) {
        onWheelNavigate?.(deltaY > 0 ? 1 : -1);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [layout.zoom, onZoomChange, onWheelNavigate]);

  // Handle slide transitions
  useEffect(() => {
    if (prevSlideRef.current === currentSlide) return;

    const oldSlide = prevSlideRef.current;
    prevSlideRef.current = currentSlide;

    if (transitionConfig.type === 'none') {
      // This state intentionally cancels any active animation when transitions are disabled.
      // oxlint-disable-next-line react/set-state-in-effect
      setTransitionState({
        isTransitioning: false,
        prevSlide: null,
        exitClass: '',
        enterClass: '',
      });
      return;
    }

    const direction: 'next' | 'prev' | 'jump' =
      currentSlide > oldSlide ? 'next' : currentSlide < oldSlide ? 'prev' : 'jump';

    const { exitClass, enterClass } = transitionEngine.getAnimationClasses(
      transitionConfig.type,
      direction
    );

    setTransitionState({
      isTransitioning: true,
      prevSlide: oldSlide,
      exitClass,
      enterClass,
    });

    const timer = setTimeout(() => {
      setTransitionState({
        isTransitioning: false,
        prevSlide: null,
        exitClass: '',
        enterClass: '',
      });
    }, transitionConfig.durationMs);

    return () => clearTimeout(timer);
  }, [currentSlide, transitionConfig, transitionEngine]);

  // Render current slide
  useEffect(() => {
    if (!pdfDoc || containerWidth <= 0 || containerHeight <= 0) return;
    const canvas = primaryCanvasRef.current;
    if (!canvas) return;

    pdfRendererRef.current
      .renderSlide(
        pdfDoc,
        currentSlide,
        canvas,
        slideWidth,
        slideHeight,
        1
      )
      .catch((err) => {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Primary slide render warning:', err);
        }
      });
  }, [pdfDoc, currentSlide, containerWidth, containerHeight, slideWidth, slideHeight]);

  // Render previous slide during transition
  useEffect(() => {
    if (!pdfDoc || !transitionState.isTransitioning || !transitionState.prevSlide) return;
    const canvas = secondaryCanvasRef.current;
    if (!canvas) return;

    pdfRendererRef.current
      .renderSlide(
        pdfDoc,
        transitionState.prevSlide,
        canvas,
        slideWidth,
        slideHeight,
        1
      )
      .catch(() => {});
  }, [pdfDoc, transitionState, slideWidth, slideHeight]);

  return (
    <div
      ref={scrollRef}
      className="transition-viewport pdf-scroll-viewport"
      data-zoom-mode={zoomMode}
      onScroll={() => {
        const element = scrollRef.current;
        if (element && previousLayout.current) {
          previousLayout.current.left = element.scrollLeft;
          previousLayout.current.top = element.scrollTop;
        }
      }}
      onPointerDownCapture={(event) => {
        const element = scrollRef.current;
        if (!element || !(event.button === 1 || (event.button === 0 && event.shiftKey))
          || (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)) return;
        dragRef.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
        element.setPointerCapture(event.pointerId);
        event.preventDefault(); event.stopPropagation();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        const element = scrollRef.current;
        if (!drag || !element) return;
        element.scrollLeft = drag.left - (event.clientX - drag.x);
        element.scrollTop = drag.top - (event.clientY - drag.y);
      }}
      onPointerUp={(event) => {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { dragRef.current = null; }}
      style={
        {
          '--trans-duration': `${transitionConfig.durationMs}ms`,
          '--trans-easing': transitionConfig.easing,
        } as React.CSSProperties
      }
    >
      <div className="slide-scroll-content" style={{
        width: Math.max(viewportSize.width, slideWidth + PAGE_PADDING),
        height: Math.max(viewportSize.height, slideHeight + PAGE_PADDING),
      }}>
      {/* Exiting Slide Frame (only during transition) */}
      {transitionState.isTransitioning && transitionState.prevSlide && (
        <div
          className={`slide-frame ${transitionState.exitClass}`}
          style={{
            width: `${slideWidth}px`,
            height: `${slideHeight}px`,
          }}
        >
          <canvas ref={secondaryCanvasRef} className="pdf-canvas" />
        </div>
      )}

      {/* Active Slide Frame */}
      <div
        className={`slide-frame ${transitionState.isTransitioning ? transitionState.enterClass : ''}`}
        style={{
          width: `${slideWidth}px`,
          height: `${slideHeight}px`,
        }}
      >
        {/* PDF Background Canvas */}
        <canvas ref={primaryCanvasRef} className="pdf-canvas" />

        {/* Interactive Annotation Canvas */}
        <AnnotationCanvas
          slideNumber={currentSlide}
          width={slideWidth}
          height={slideHeight}
          activeTool={activeTool}
          penColor={penColor}
          penWidth={penWidth}
          highlighterColor={highlighterColor}
          highlighterWidth={highlighterWidth}
          laserColor={laserColor}
          spotlightRadius={spotlightRadius}
          shapeType={shapeType}
          shapeFill={shapeFill}
          enableStylusPressure={enableStylusPressure}
          laserTrailEnabled={laserTrailEnabled}
          readOnly={readOnly}
          onRequestSelectTool={onRequestSelectTool}
          onLaserChange={setLaserState}
          onSpotlightChange={setSpotlightState}
        />

        {/* Presentation Effects Layer (Laser, Spotlight with 1.5x magnifier, Curtains) */}
        <EffectsLayer
          width={slideWidth}
          height={slideHeight}
          laserState={laserState}
          spotlightState={spotlightState}
          screenCurtain={screenCurtain}
          sourceCanvasRef={primaryCanvasRef}
        />
      </div>
      </div>
    </div>
  );
};
