import type { AnnotationStroke, NormalizedPoint, ShapeType } from '../types/annotation';
import { imageFor } from './media';
import { strokeBounds } from './geometry';
import { ShapeEngine } from './shapeEngine';

export class StrokeEngine {
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

    const factor = canvasWidth / (stroke.referenceWidth || canvasWidth);
    stroke = { ...stroke, width: stroke.width * factor, fontSize: stroke.fontSize ? stroke.fontSize * factor : undefined };

    ctx.save();

    if(stroke.rotation||stroke.flipX||stroke.flipY) {
      const box=strokeBounds({...stroke,rotation:0,flipX:false,flipY:false},canvasWidth,canvasHeight);
      ctx.translate(box.cx,box.cy);ctx.rotate(stroke.rotation||0);ctx.scale(stroke.flipX?-1:1,stroke.flipY?-1:1);ctx.translate(-box.cx,-box.cy);
    }
    ctx.globalAlpha=stroke.opacity??1;
    if(stroke.tool==='image'&&stroke.imageData&&stroke.points.length>=2) {
      const image=imageFor(stroke.imageData),a=stroke.points[0],b=stroke.points[stroke.points.length-1];
      if(image.complete&&image.naturalWidth)ctx.drawImage(image,Math.min(a.x,b.x)*canvasWidth,Math.min(a.y,b.y)*canvasHeight,Math.abs(b.x-a.x)*canvasWidth,Math.abs(b.y-a.y)*canvasHeight);
      ctx.restore();return;
    }
    // Use the operating system's default UI font; no web font is bundled.
    if ((stroke.tool === 'text'||stroke.tool==='link') && stroke.text) {
      const p = stroke.points[0];
      const x = p.x * canvasWidth;
      const y = p.y * canvasHeight;
      const size = stroke.fontSize || Math.max(18, stroke.width * 5);
      const font = stroke.fontFamily || "system-ui, sans-serif";
      ctx.font = `${stroke.italic ? 'italic ' : ''}${stroke.bold === undefined ? 600 : stroke.bold ? 700 : 400} ${size}px ${font}`;
      ctx.fillStyle = stroke.color;
      ctx.textBaseline = 'top';
      const lines = stroke.text.split('\n');
      const lineHeight = size * 1.35;
      lines.forEach((line, idx) => {
        if(stroke.textOutline){ctx.strokeStyle=stroke.color;ctx.lineWidth=Math.max(1,size/28);ctx.strokeText(line,x,y+idx*lineHeight);}
        else ctx.fillText(line, x, y + idx * lineHeight);
        if (stroke.underline||stroke.tool==='link') {
          ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineWidth = Math.max(1, size / 18);
          ctx.moveTo(x, y + idx * lineHeight + size * 1.08);
          ctx.lineTo(x + ctx.measureText(line).width, y + idx * lineHeight + size * 1.08); ctx.stroke();
        }
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
        canvasHeight, stroke.shapeFillColor, stroke.shapeBorder!==false
      );
      ctx.restore();
      return;
    }

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.34;
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      const tilt=stroke.points.reduce((n,p)=>n+Math.min(90,Math.hypot(p.tiltX||0,p.tiltY||0)),0)/stroke.points.length;
      ctx.lineWidth = stroke.width*(1+tilt/180);
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
      stroke.tool === 'pen' ? stroke.width * Math.max(.2,Math.min(1.7,Math.pow((point.pressure??.5)/.5,.65))) * (1+Math.min(90,Math.hypot(point.tiltX||0,point.tiltY||0))/180) : stroke.width;

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
    shapeFill?: boolean,shapeFillColor?:string,shapeBorder=true,shapeOpacity=1
  ): void {
    if (points.length === 0) return;

    const stroke: AnnotationStroke = {
      id: 'live',
      tool,
      shapeType,
      shapeFill,shapeFillColor,shapeBorder,
      color,
      width,
      opacity: shapeOpacity,
      points,
      slideNumber: 0,
      createdAt: Date.now(),
    };

    this.renderSingleStroke(ctx, stroke, canvasWidth, canvasHeight);
  }
}
