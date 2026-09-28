import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
  AnnotationStroke,
  NormalizedPoint,
  ToolType,
  ShapeType,
  LaserPointerState,
  SpotlightState,
} from '../types/annotation';
import { StrokeEngine } from './strokeEngine';
import { EraserEngine } from './eraserEngine';
import { AnnotationStore } from './annotationStore';
import { Check, X, Edit3, Trash2 } from 'lucide-react';

interface TextEditorState {
  x: number;
  y: number;
  text: string;
  strokeId?: string; // If editing an existing text stroke
  fontSize?: number;
  color?: string;
}

interface AnnotationCanvasProps {
  slideNumber: number;
  width: number;
  height: number;
  activeTool: ToolType;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  laserColor: string;
  spotlightRadius: number;
  shapeType?: ShapeType;
  shapeFill?: boolean;
  enableStylusPressure?: boolean;
  laserTrailEnabled?: boolean;
  readOnly?: boolean;
  onRequestSelectTool?: () => void;
  onLaserChange: (state: LaserPointerState) => void;
  onSpotlightChange: (state: SpotlightState) => void;
}

type DragMode = 'none' | 'move' | 'rotate' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  slideNumber,
  width,
  height,
  activeTool,
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  laserColor,
  spotlightRadius,
  shapeType = 'rectangle',
  shapeFill = false,
  enableStylusPressure = true,
  laserTrailEnabled = true,
  readOnly = false,
  onRequestSelectTool,
  onLaserChange,
  onSpotlightChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<NormalizedPoint[]>([]);
  const laserTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const isLaserFiringRef = useRef(false);
  const annotationStore = AnnotationStore.getInstance();

  // Selection & Transformation states
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const dragModeRef = useRef<DragMode>('none');
  const dragStartPointRef = useRef<NormalizedPoint | null>(null);
  const originalStrokeRef = useRef<AnnotationStroke | null>(null);

  // In-line Text Annotation state
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Guarantee focus into text input whenever editor opens
  useEffect(() => {
    if (textEditor) {
      const timer = setTimeout(() => {
        textInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [textEditor]);

  // Helper to get bounding box of stroke in pixel coordinates
  const getStrokeBounds = useCallback((stroke: AnnotationStroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 };
    let minX = pts[0].x * width;
    let maxX = pts[0].x * width;
    let minY = pts[0].y * height;
    let maxY = pts[0].y * height;

    for (let i = 1; i < pts.length; i++) {
      const px = pts[i].x * width;
      const py = pts[i].y * height;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    if (stroke.tool === 'text') {
      const fontSize = stroke.fontSize || 22;
      const lines = (stroke.text || '').split('\n');
      const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
      maxX = Math.max(maxX, minX + maxLineLen * fontSize * 0.68);
      maxY = Math.max(maxY, minY + lines.length * fontSize * 1.35);
    }

    const padding = 6;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    return {
      minX,
      maxX,
      minY,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: maxX - minX,
      h: maxY - minY,
    };
  }, [width, height]);

  // Redraw all saved strokes, selection adorners, and live in-progress drawing
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    const strokes = annotationStore.getStrokesForSlide(slideNumber);
    StrokeEngine.renderStrokes(ctx, strokes, width, height);

    // Render Selection Adorners (Bounding Box, 4 Corner Resize Handles, Rotation Handle)
    if (activeTool === 'select' && selectedStrokeId) {
      const stroke = strokes.find((s) => s.id === selectedStrokeId);
      if (stroke) {
        const bounds = getStrokeBounds(stroke);
        const { minX, maxX, minY, maxY, cx, cy } = bounds;
        const rot = stroke.rotation || 0;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.translate(-cx, -cy);

        // Dashed bounding rectangle
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(minX, minY, bounds.w, bounds.h);
        ctx.setLineDash([]);

        // Rotation stem and handle
        const rotHandleY = minY - 24;
        ctx.beginPath();
        ctx.moveTo(cx, minY);
        ctx.lineTo(cx, rotHandleY);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Rotation knob ⭮
        ctx.beginPath();
        ctx.arc(cx, rotHandleY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 4 Corner resize handles
        const handleRadius = 5;
        const corners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: minX, y: maxY },
          { x: maxX, y: maxY },
        ];

        corners.forEach((c) => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, handleRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        ctx.restore();
      }
    }

    // If currently drawing, render live stroke or shape preview
    if (isDrawingRef.current && currentPointsRef.current.length > 0) {
      if (activeTool === 'pen') {
        StrokeEngine.renderLiveStroke(
          ctx,
          currentPointsRef.current,
          'pen',
          penColor,
          penWidth,
          width,
          height
        );
      } else if (activeTool === 'highlighter') {
        StrokeEngine.renderLiveStroke(
          ctx,
          currentPointsRef.current,
          'highlighter',
          highlighterColor,
          highlighterWidth,
          width,
          height
        );
      } else if (activeTool === 'shape' && currentPointsRef.current.length >= 2) {
        StrokeEngine.renderLiveStroke(
          ctx,
          currentPointsRef.current,
          'shape',
          penColor,
          penWidth,
          width,
          height,
          shapeType,
          shapeFill
        );
      }
    }
  }, [
    slideNumber,
    width,
    height,
    activeTool,
    selectedStrokeId,
    penColor,
    penWidth,
    highlighterColor,
    highlighterWidth,
    shapeType,
    shapeFill,
    annotationStore,
    getStrokeBounds,
  ]);

  // Subscribe to annotationStore changes and IMMEDIATELY redraw
  useEffect(() => {
    const unsubscribe = annotationStore.subscribe(() => {
      redraw();
    });
    return unsubscribe;
  }, [annotationStore, redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Handle Delete / Backspace key to delete selected stroke
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'select' && selectedStrokeId) {
        // Only if not typing in text area
        if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
        const strokes = annotationStore.getStrokesForSlide(slideNumber);
        const stroke = strokes.find((s) => s.id === selectedStrokeId);
        if (stroke) {
          annotationStore.removeStrokes(slideNumber, [stroke]);
          setSelectedStrokeId(null);
          redraw();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, selectedStrokeId, slideNumber, annotationStore, redraw]);

  // Pointer/Mouse coordinate calculation normalized to [0, 1]
  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ): NormalizedPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const pressure = enableStylusPressure && 'pressure' in e && e.pressure > 0 ? e.pressure : 0.5;

    return {
      x: Math.max(0, Math.min(1, clientX / width)),
      y: Math.max(0, Math.min(1, clientY / height)),
      pressure,
      time: Date.now(),
    };
  };

  // Check hit test for resize/rotate handles of selected stroke
  const checkHandleHit = (pt: NormalizedPoint, stroke: AnnotationStroke): DragMode => {
    const px = pt.x * width;
    const py = pt.y * height;
    const bounds = getStrokeBounds(stroke);
    const { minX, maxX, minY, maxY, cx, cy } = bounds;
    const rot = stroke.rotation || 0;

    // Transform click point to unrotated coordinate space
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const dx = px - cx;
    const dy = py - cy;
    const localX = cx + dx * cos - dy * sin;
    const localY = cy + dx * sin + dy * cos;

    const hitDist = 14;

    // 1. Rotation knob check
    const rotY = minY - 24;
    if (Math.hypot(localX - cx, localY - rotY) <= hitDist) {
      return 'rotate';
    }

    // 2. Corner handles check
    if (Math.hypot(localX - minX, localY - minY) <= hitDist) return 'resize-tl';
    if (Math.hypot(localX - maxX, localY - minY) <= hitDist) return 'resize-tr';
    if (Math.hypot(localX - minX, localY - maxY) <= hitDist) return 'resize-bl';
    if (Math.hypot(localX - maxX, localY - maxY) <= hitDist) return 'resize-br';

    // 3. Inside bounding box check (Move)
    if (localX >= minX && localX <= maxX && localY >= minY && localY <= maxY) {
      return 'move';
    }

    return 'none';
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Only capture pointer for drawing tools, NEVER for text tool so text input receives focus
    if (activeTool !== 'text') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
    const pt = getNormalizedPoint(e);

    // 1. SELECT TOOL (Selection, Resize, Rotate, Move)
    if (activeTool === 'select') {
      const strokes = annotationStore.getStrokesForSlide(slideNumber);

      // If already a stroke selected, check if clicked its handles
      if (selectedStrokeId) {
        const stroke = strokes.find((s) => s.id === selectedStrokeId);
        if (stroke) {
          const hit = checkHandleHit(pt, stroke);
          if (hit !== 'none') {
            dragModeRef.current = hit;
            dragStartPointRef.current = pt;
            originalStrokeRef.current = JSON.parse(JSON.stringify(stroke));
            return;
          }
        }
      }

      // Hit-test all strokes backwards (top to bottom)
      let found: AnnotationStroke | null = null;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (EraserEngine.hitTestStroke(pt, s, width, height, 16)) {
          found = s;
          break;
        }
      }

      if (found) {
        setSelectedStrokeId(found.id);
        dragModeRef.current = 'move';
        dragStartPointRef.current = pt;
        originalStrokeRef.current = JSON.parse(JSON.stringify(found));
      } else {
        setSelectedStrokeId(null);
      }
      redraw();
      return;
    }

    // 2. TEXT TOOL: Open text editor at clicked position or edit clicked text stroke
    if (activeTool === 'text') {
      if (textEditor && textEditor.text.trim()) {
        handleSaveTextAnnotation(false);
      }
      const strokes = annotationStore.getStrokesForSlide(slideNumber);
      const hitText = strokes
        .slice()
        .reverse()
        .find((s) => s.tool === 'text' && EraserEngine.hitTestStroke(pt, s, width, height, 20));

      if (hitText) {
        const bounds = getStrokeBounds(hitText);
        setSelectedStrokeId(hitText.id);
        setTextEditor({
          x: Math.max(10, Math.min(width - 470, bounds.minX)),
          y: Math.max(10, Math.min(height - 170, bounds.minY)),
          text: hitText.text || '',
          strokeId: hitText.id,
          fontSize: hitText.fontSize,
          color: hitText.color,
        });
        return;
      }

      setTextEditor({
        x: Math.max(10, Math.min(width - 470, pt.x * width)),
        y: Math.max(10, Math.min(height - 270, pt.y * height)),
        text: '',
      });
      return;
    }

    // 3. PEN & HIGHLIGHTER
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      isDrawingRef.current = true;
      currentPointsRef.current = [pt];
      redraw();
    } else if (activeTool === 'shape') {
      isDrawingRef.current = true;
      currentPointsRef.current = [pt, pt];
      redraw();
    } else if (activeTool === 'eraser') {
      isDrawingRef.current = true;
      const strokes = annotationStore.getStrokesForSlide(slideNumber);
      const { removed } = EraserEngine.eraseAt(pt, strokes, width, height);
      if (removed.length > 0) {
        annotationStore.removeStrokes(slideNumber, removed);
        redraw();
      }
    } else if (activeTool === 'laser') {
      // REQUIREMENT: Left button pressed down -> Turn laser OFF!
      laserTrailRef.current = [];
      onLaserChange({
        x: pt.x,
        y: pt.y,
        active: false,
        color: laserColor,
        trail: [],
      });
    } else if (activeTool === 'spotlight') {
      onSpotlightChange({
        x: pt.x,
        y: pt.y,
        active: true,
        radius: spotlightRadius,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);

    // SELECT TOOL: Rotate, Resize, Move dragging
    if (activeTool === 'select' && dragModeRef.current !== 'none' && originalStrokeRef.current) {
      const orig = originalStrokeRef.current;
      const startPt = dragStartPointRef.current;
      if (!startPt) return;

      const current = annotationStore.getStrokesForSlide(slideNumber).find((s) => s.id === orig.id);
      if (!current) return;

      const bounds = getStrokeBounds(orig);
      const { cx, cy } = bounds;

      if (dragModeRef.current === 'rotate') {
        // Calculate angle from center to current mouse position
        const angle = Math.atan2(pt.y * height - cy, pt.x * width - cx) + Math.PI / 2;
        const updated = { ...current, rotation: angle };
        annotationStore.updateStroke(slideNumber, updated);
        redraw();
        return;
      }

      if (dragModeRef.current === 'move') {
        const dx = pt.x - startPt.x;
        const dy = pt.y - startPt.y;
        const updatedPts = orig.points.map((p) => ({
          ...p,
          x: Math.max(0, Math.min(1, p.x + dx)),
          y: Math.max(0, Math.min(1, p.y + dy)),
        }));
        const updated = { ...current, points: updatedPts };
        annotationStore.updateStroke(slideNumber, updated);
        redraw();
        return;
      }

      if (dragModeRef.current.startsWith('resize-')) {
        if (orig.tool === 'text') {
          const origBounds = getStrokeBounds(orig);
          const origFontSize = orig.fontSize || 22;
          let scale = 1;

          if (dragModeRef.current === 'resize-br' || dragModeRef.current === 'resize-tr') {
            const currentW = Math.max(20, pt.x * width - origBounds.minX);
            scale = currentW / Math.max(20, origBounds.w);
          } else {
            const currentW = Math.max(20, origBounds.maxX - pt.x * width);
            scale = currentW / Math.max(20, origBounds.w);
          }

          const newFontSize = Math.max(12, Math.min(140, Math.round(origFontSize * scale)));
          const updated = { ...current, fontSize: newFontSize };
          annotationStore.updateStroke(slideNumber, updated);
          redraw();
          return;
        }

        const origP0 = orig.points[0];
        const origP1 = orig.points[orig.points.length - 1];
        if (!origP0 || !origP1) return;

        let newP0 = { ...origP0 };
        let newP1 = { ...origP1 };

        if (dragModeRef.current === 'resize-br') {
          newP1 = { ...newP1, x: pt.x, y: pt.y };
        } else if (dragModeRef.current === 'resize-tl') {
          newP0 = { ...newP0, x: pt.x, y: pt.y };
        } else if (dragModeRef.current === 'resize-tr') {
          newP0 = { ...newP0, y: pt.y };
          newP1 = { ...newP1, x: pt.x };
        } else if (dragModeRef.current === 'resize-bl') {
          newP0 = { ...newP0, x: pt.x };
          newP1 = { ...newP1, y: pt.y };
        }

        const updated = { ...current, points: [newP0, newP1] };
        annotationStore.updateStroke(slideNumber, updated);
        redraw();
        return;
      }
    }

    // LASER POINTER: Default ON when moving; Turn OFF when left mouse button is pressed
    if (activeTool === 'laser') {
      const isLeftPressed = (e.buttons & 1) === 1;
      if (isLeftPressed) {
        // Left button held down -> Turn laser OFF!
        laserTrailRef.current = [];
        onLaserChange({
          x: pt.x,
          y: pt.y,
          active: false,
          color: laserColor,
          trail: [],
        });
      } else {
        // Not clicking -> Laser is ON with glowing trail!
        const now = Date.now();
        const recent = laserTrailEnabled
          ? laserTrailRef.current.filter((p) => now - p.time < 750)
          : [];
        laserTrailRef.current = laserTrailEnabled ? [...recent, { x: pt.x, y: pt.y, time: now }] : [];
        onLaserChange({
          x: pt.x,
          y: pt.y,
          active: true,
          color: laserColor,
          trail: laserTrailEnabled ? [...laserTrailRef.current] : [],
        });
      }
      return;
    }

    if (activeTool === 'spotlight') {
      onSpotlightChange({
        x: pt.x,
        y: pt.y,
        active: true,
        radius: spotlightRadius,
      });
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      currentPointsRef.current.push(pt);
      redraw();
    } else if (activeTool === 'shape') {
      const startPt = currentPointsRef.current[0];
      if (startPt) {
        let endPt = pt;
        // Shift key constraint for 1:1 aspect ratio
        if (e.shiftKey && (shapeType === 'rectangle' || shapeType === 'circle' || shapeType === 'star')) {
          const dx = (pt.x - startPt.x) * width;
          const dy = (pt.y - startPt.y) * height;
          const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
          const signX = Math.sign(dx) || 1;
          const signY = Math.sign(dy) || 1;
          endPt = {
            x: Math.max(0, Math.min(1, startPt.x + (signX * maxDim) / width)),
            y: Math.max(0, Math.min(1, startPt.y + (signY * maxDim) / height)),
            time: Date.now(),
          };
        }
        currentPointsRef.current = [startPt, endPt];
        redraw();
      }
    } else if (activeTool === 'eraser') {
      const strokes = annotationStore.getStrokesForSlide(slideNumber);
      const { removed } = EraserEngine.eraseAt(pt, strokes, width, height);
      if (removed.length > 0) {
        annotationStore.removeStrokes(slideNumber, removed);
        redraw();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Reset selection dragging
    if (activeTool === 'select') {
      dragModeRef.current = 'none';
      dragStartPointRef.current = null;
      originalStrokeRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
      return;
    }

    // LASER POINTER: Button released -> Turn laser back ON!
    if (activeTool === 'laser') {
      const pt = getNormalizedPoint(e);
      const now = Date.now();
      laserTrailRef.current = laserTrailEnabled ? [{ x: pt.x, y: pt.y, time: now }] : [];
      onLaserChange({
        x: pt.x,
        y: pt.y,
        active: true,
        color: laserColor,
        trail: laserTrailEnabled ? [...laserTrailRef.current] : [],
      });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const points = currentPointsRef.current;
      if (points.length > 0) {
        const stroke: AnnotationStroke = {
          id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          tool: activeTool,
          color: activeTool === 'pen' ? penColor : highlighterColor,
          width: activeTool === 'pen' ? penWidth : highlighterWidth,
          opacity: 1.0,
          points,
          slideNumber,
          createdAt: Date.now(),
        };
        annotationStore.addStroke(stroke);
      }
      currentPointsRef.current = [];
      redraw();
    } else if (activeTool === 'shape') {
      const points = currentPointsRef.current;
      if (points.length >= 2) {
        const distPx = Math.hypot(
          (points[1].x - points[0].x) * width,
          (points[1].y - points[0].y) * height
        );
        if (distPx >= 4) {
          const stroke: AnnotationStroke = {
            id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            tool: 'shape',
            shapeType,
            shapeFill,
            color: penColor,
            width: penWidth,
            opacity: 1.0,
            points,
            rotation: 0,
            slideNumber,
            createdAt: Date.now(),
          };
          annotationStore.addStroke(stroke);
        }
      }
      currentPointsRef.current = [];
      redraw();
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handlePointerLeave = () => {
    if (activeTool === 'laser') {
      isLaserFiringRef.current = false;
      laserTrailRef.current = [];
      onLaserChange({
        x: 0.5,
        y: 0.5,
        active: false,
        color: laserColor,
        trail: [],
      });
    } else if (activeTool === 'spotlight') {
      onSpotlightChange({
        x: 0.5,
        y: 0.5,
        active: false,
        radius: spotlightRadius,
      });
    }

    if (isDrawingRef.current) {
      handlePointerUp({ currentTarget: canvasRef.current } as unknown as React.PointerEvent<HTMLCanvasElement>);
    }
  };

  // Complete inline text annotation (create new or update existing text stroke)
  const handleSaveTextAnnotation = (switchToSelect = true) => {
    if (textEditor && textEditor.text.trim()) {
      if (textEditor.strokeId) {
        // Update existing text stroke
        const current = annotationStore
          .getStrokesForSlide(slideNumber)
          .find((s) => s.id === textEditor.strokeId);
        if (current) {
          const updated: AnnotationStroke = {
            ...current,
            text: textEditor.text.trim(),
            color: textEditor.color || penColor,
            fontSize: textEditor.fontSize || current.fontSize || Math.max(18, penWidth * 5),
          };
          annotationStore.updateStroke(slideNumber, updated);
          setSelectedStrokeId(current.id);
        }
      } else {
        // Create new text stroke
        const normPt: NormalizedPoint = {
          x: textEditor.x / width,
          y: textEditor.y / height,
          time: Date.now(),
        };

        const newId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const stroke: AnnotationStroke = {
          id: newId,
          tool: 'text',
          color: penColor,
          width: penWidth,
          opacity: 1.0,
          points: [normPt],
          text: textEditor.text.trim(),
          fontSize: Math.max(18, penWidth * 5),
          fontFamily: 'system-ui, sans-serif',
          rotation: 0,
          slideNumber,
          createdAt: Date.now(),
        };
        annotationStore.addStroke(stroke);
        setSelectedStrokeId(newId);
      }
    }
    setTextEditor(null);
    if (switchToSelect) {
      onRequestSelectTool?.();
    }
    redraw();
  };

  // Cursor style based on tool
  const getCursorStyle = (): string => {
    switch (activeTool) {
      case 'select':
        return 'default';
      case 'text':
        return 'text';
      case 'pen':
      case 'shape':
        return 'crosshair';
      case 'highlighter':
        return 'cell';
      case 'eraser':
        return 'pointer';
      case 'laser':
        return 'crosshair';
      case 'spotlight':
        return 'none';
      default:
        return 'default';
    }
  };

  // Double-click to edit text object directly
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    const strokes = annotationStore.getStrokesForSlide(slideNumber);
    const hitText = strokes
      .slice()
      .reverse()
      .find((s) => s.tool === 'text' && EraserEngine.hitTestStroke(pt, s, width, height, 20));

    if (hitText) {
      const bounds = getStrokeBounds(hitText);
      setSelectedStrokeId(hitText.id);
      setTextEditor({
        x: Math.max(10, Math.min(width - 470, bounds.minX)),
        y: Math.max(10, Math.min(height - 170, bounds.minY)),
        text: hitText.text || '',
        strokeId: hitText.id,
        fontSize: hitText.fontSize,
        color: hitText.color,
      });
    }
  };

  const currentStrokes = annotationStore.getStrokesForSlide(slideNumber);
  const selectedStroke = selectedStrokeId
    ? currentStrokes.find((s) => s.id === selectedStrokeId) || null
    : null;
  const selectedBounds = selectedStroke ? getStrokeBounds(selectedStroke) : null;
  const selectedActionTop = selectedBounds
    ? selectedBounds.minY >= 50
      ? selectedBounds.minY - 46
      : selectedBounds.maxY + 10
    : 6;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: `${width}px`, height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          cursor: getCursorStyle(),
          pointerEvents: readOnly ? 'none' : 'auto',
          touchAction: 'none',
          zIndex: 10,
        }}
      />

      {/* Floating Action Bar for Selected Text or Shape Object */}
      {activeTool === 'select' && selectedStroke && selectedBounds && !textEditor && (
        <div
          style={{
            position: 'absolute',
            top: `${selectedActionTop}px`,
            left: `${selectedBounds.cx}px`,
            transform: 'translateX(-50%)',
            zIndex: 45,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            padding: '3px 6px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {selectedStroke.tool === 'text' && (
            <button
              type="button"
              onClick={() => {
                setTextEditor({
                  x: Math.max(10, Math.min(width - 470, selectedBounds.minX)),
                  y: Math.max(10, Math.min(height - 170, selectedBounds.minY)),
                  text: selectedStroke.text || '',
                  strokeId: selectedStroke.id,
                  fontSize: selectedStroke.fontSize,
                  color: selectedStroke.color,
                });
              }}
              title="텍스트 문장 내용 수정 (더블 클릭으로도 가능)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#2563eb',
                border: 'none',
                borderRadius: '4px',
                color: '#ffffff',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Edit3 size={13} />
              <span>문장 수정</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              annotationStore.removeStrokes(slideNumber, [selectedStroke]);
              setSelectedStrokeId(null);
              redraw();
            }}
            title="객체 삭제 (Delete)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '4px',
              color: '#fca5a5',
              padding: '4px 7px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            <span>삭제</span>
          </button>
        </div>
      )}

      {/* Inline text annotation input using the system font */}
      {textEditor && (
        <div
          style={{
            position: 'absolute',
            top: `${textEditor.y}px`,
            left: `${textEditor.x}px`,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            width: 'min(460px, calc(100% - 20px))',
            background: 'rgba(248, 250, 252, 0.98)',
            border: `1.5px solid ${textEditor.color || penColor}`,
            borderRadius: '8px',
            padding: '8px 10px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.65), 0 0 10px rgba(59, 130, 246, 0.3)',
            backdropFilter: 'blur(16px)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.4px' }}>
              기본 글꼴 텍스트
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => handleSaveTextAnnotation()}
                title="완료 (Enter)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Check size={13} />
                <span>완료</span>
              </button>
              <button
                type="button"
                onClick={() => setTextEditor(null)}
                title="취소 (Esc)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#cbd5e1',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <textarea
            ref={textInputRef}
            rows={2}
            value={textEditor.text}
            placeholder="텍스트 입력 (Enter 완료 · Shift+Enter 줄바꿈)"
            onChange={(e) => setTextEditor({ ...textEditor, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveTextAnnotation();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTextEditor(null);
              }
            }}
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '13px',
              fontWeight: 400,
              color: textEditor.color || penColor,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '5px',
              padding: '8px 10px',
              outline: 'none',
              width: '100%',
              minHeight: '66px',
              boxSizing: 'border-box',
              resize: 'both',
            }}
          />
        </div>
      )}
    </div>
  );
};
