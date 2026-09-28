import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ToolType, ShapeType, LaserPointerState, SpotlightState } from '../types/annotation';
import type { ScreenCurtain, SlideTransitionConfig } from '../types/presentation';
import { PdfRenderer } from '../pdf/pdfRenderer';
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
  pan: { x: number; y: number };
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
  pan,
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

  // Calculate slide dimensions purely and synchronously (Zero state-loop!)
  const { slideWidth, slideHeight } = useMemo(() => {
    if (containerWidth <= 0 || containerHeight <= 0) {
      return { slideWidth: 800, slideHeight: 450 };
    }
    const padding = 24; // Subtle margin around slide for stage elegance
    const availW = Math.max(100, containerWidth - padding);
    const availH = Math.max(100, containerHeight - padding);

    const aspect = slideAspect > 0 ? slideAspect : 16 / 9;
    let w = availW;
    let h = availW / aspect;

    if (h > availH) {
      h = availH;
      w = availH * aspect;
    }

    w = Math.floor(w * zoomFactor);
    h = Math.floor(h * zoomFactor);

    return { slideWidth: w, slideHeight: h };
  }, [containerWidth, containerHeight, slideAspect, zoomFactor]);

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
        containerWidth,
        containerHeight,
        zoomFactor
      )
      .catch((err) => {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Primary slide render warning:', err);
        }
      });
  }, [pdfDoc, currentSlide, containerWidth, containerHeight, zoomFactor]);

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
        containerWidth,
        containerHeight,
        zoomFactor
      )
      .catch(() => {});
  }, [pdfDoc, transitionState, containerWidth, containerHeight, zoomFactor]);

  return (
    <div
      className="transition-viewport"
      style={
        {
          '--trans-duration': `${transitionConfig.durationMs}ms`,
          '--trans-easing': transitionConfig.easing,
        } as React.CSSProperties
      }
    >
      {/* Exiting Slide Frame (only during transition) */}
      {transitionState.isTransitioning && transitionState.prevSlide && (
        <div
          className={`slide-frame ${transitionState.exitClass}`}
          style={{
            width: `${slideWidth}px`,
            height: `${slideHeight}px`,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
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
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
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
  );
};
