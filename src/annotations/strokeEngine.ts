import type { AnnotationStroke, NormalizedPoint, ShapeType } from '../types/annotation';
import { ShapeEngine } from './shapeEngine';

export class StrokeEngine {
  private static getContrastColor(color: string): string {
    const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
    if (!hex) return 'rgba(255, 255, 255, 0.88)';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.48 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.88)';
  }

  /**
   * Render a collection of strokes onto a 2D canvas context.
   */
  public static renderStrokes(
    ctx: CanvasRenderingContext2D,
    strokes: AnnotationStroke[],
    canvasWidth: number,
    canvasHeight: number
  ): void {
    ctx.save();

    for (const stroke of strokes) {
      this.renderSingleStroke(ctx, stroke, canvasWidth, canvasHeight);
    }

    ctx.restore();
  }

  /**
   * Render a single stroke with bezier curve smoothing and pressure sensitivity
   */
  public static renderSingleStroke(
    ctx: CanvasRenderingContext2D,
    stroke: AnnotationStroke,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (stroke.points.length === 0) return;

    ctx.save();

    // Apply rotation around bounding box center if specified
    if (stroke.rotation && stroke.points.length > 0) {
      const pts = stroke.points;
      let minX = pts[0].x;
      let maxX = pts[0].x;
      let minY = pts[0].y;
      let maxY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
      }
      const cx = ((minX + maxX) / 2) * canvasWidth;
      const cy = ((minY + maxY) / 2) * canvasHeight;
      ctx.translate(cx, cy);
      ctx.rotate(stroke.rotation);
      ctx.translate(-cx, -cy);
    }

    // Use the operating system's default UI font; no web font is bundled.
    if (stroke.tool === 'text' && stroke.text) {
      const p = stroke.points[0];
      const x = p.x * canvasWidth;
      const y = p.y * canvasHeight;
      const size = stroke.fontSize || Math.max(18, stroke.width * 5);
      const font = stroke.fontFamily || "system-ui, sans-serif";
      ctx.font = `600 ${size}px ${font}`;
      ctx.fillStyle = stroke.color;
      ctx.strokeStyle = this.getContrastColor(stroke.color);
      ctx.lineWidth = Math.max(1.25, size * 0.075);
      ctx.lineJoin = 'round';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(15, 23, 42, 0.72)';
      ctx.shadowBlur = Math.max(2, size * 0.12);
      ctx.shadowOffsetX = Math.max(1, size * 0.035);
      ctx.shadowOffsetY = Math.max(1, size * 0.07);
      const lines = stroke.text.split('\n');
      const lineHeight = size * 1.35;
      lines.forEach((line, idx) => {
        ctx.strokeText(line, x, y + idx * lineHeight);
        ctx.fillText(line, x, y + idx * lineHeight);
      });
      ctx.restore();
      return;
    }

    if (stroke.tool === 'shape' && stroke.shapeType) {
      ShapeEngine.renderShape(
        ctx,
        stroke.shapeType,
        stroke.points,
        stroke.color,
        stroke.width,
        !!stroke.shapeFill,
        canvasWidth,
        canvasHeight
      );
      ctx.restore();
      return;
    }

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.34;
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else {
      ctx.globalAlpha = stroke.opacity ?? 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    const pts = stroke.points;
    const pressureWidth = (point: NormalizedPoint): number =>
      stroke.tool === 'pen' ? stroke.width * (0.5 + (point.pressure ?? 0.5)) : stroke.width;

    // Single point (dot)
    if (pts.length === 1) {
      const p = pts[0];
      const cx = p.x * canvasWidth;
      const cy = p.y * canvasHeight;
      const r = Math.max(1, pressureWidth(p) / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Two points (simple line)
    if (pts.length === 2) {
      const p0 = pts[0];
      const p1 = pts[1];
      ctx.beginPath();
      ctx.lineWidth = (pressureWidth(p0) + pressureWidth(p1)) / 2;
      ctx.moveTo(p0.x * canvasWidth, p0.y * canvasHeight);
      ctx.lineTo(p1.x * canvasWidth, p1.y * canvasHeight);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // A highlighter stroke must be composited exactly once. Drawing every
    // segment separately makes adjacent segments overlap, producing dark
    // stripes and increasing opacity while the pointer remains stationary.
    if (stroke.tool === 'highlighter') {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * canvasWidth, pts[0].y * canvasHeight);
      for (let i = 1; i < pts.length - 1; i++) {
        const midpointX = ((pts[i].x + pts[i + 1].x) / 2) * canvasWidth;
        const midpointY = ((pts[i].y + pts[i + 1].y) / 2) * canvasHeight;
        ctx.quadraticCurveTo(
          pts[i].x * canvasWidth,
          pts[i].y * canvasHeight,
          midpointX,
          midpointY
        );
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * canvasWidth, last.y * canvasHeight);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Multiple points: render smoothed segments so stylus pressure can vary the width.
    let startX = pts[0].x * canvasWidth;
    let startY = pts[0].y * canvasHeight;
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = ((pts[i].x + pts[i + 1].x) / 2) * canvasWidth;
      const yc = ((pts[i].y + pts[i + 1].y) / 2) * canvasHeight;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineWidth = pressureWidth(pts[i]);
      ctx.quadraticCurveTo(pts[i].x * canvasWidth, pts[i].y * canvasHeight, xc, yc);
      ctx.stroke();
      startX = xc;
      startY = yc;
    }

    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = pressureWidth(last);
    ctx.lineTo(last.x * canvasWidth, last.y * canvasHeight);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw temporary active stroke during pointermove
   */
  public static renderLiveStroke(
    ctx: CanvasRenderingContext2D,
    points: NormalizedPoint[],
    tool: 'pen' | 'highlighter' | 'shape' | 'text',
    color: string,
    width: number,
    canvasWidth: number,
    canvasHeight: number,
    shapeType?: ShapeType,
    shapeFill?: boolean
  ): void {
    if (points.length === 0) return;

    const stroke: AnnotationStroke = {
      id: 'live',
      tool,
      shapeType,
      shapeFill,
      color,
      width,
      opacity: 1.0,
      points,
      slideNumber: 0,
      createdAt: Date.now(),
    };

    this.renderSingleStroke(ctx, stroke, canvasWidth, canvasHeight);
  }
}
