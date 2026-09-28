import type { ShapeType, NormalizedPoint } from '../types/annotation';

export class ShapeEngine {
  /**
   * Render a shape on the given canvas context
   */
  public static renderShape(
    ctx: CanvasRenderingContext2D,
    shapeType: ShapeType,
    points: NormalizedPoint[],
    color: string,
    width: number,
    filled: boolean,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (points.length < 2) return;

    const p0 = points[0];
    const p1 = points[points.length - 1];

    const x0 = p0.x * canvasWidth;
    const y0 = p0.y * canvasHeight;
    const x1 = p1.x * canvasWidth;
    const y1 = p1.y * canvasHeight;

    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const w = Math.max(2, Math.abs(x1 - x0));
    const h = Math.max(2, Math.abs(y1 - y0));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shapeType) {
      case 'line':
        this.drawLine(ctx, x0, y0, x1, y1);
        break;

      case 'rectangle':
        this.drawRectangle(ctx, left, top, w, h, filled);
        break;

      case 'circle':
        this.drawCircle(ctx, left, top, w, h, filled);
        break;

      case 'star':
        this.drawStar(ctx, left, top, w, h, filled);
        break;

      case 'heart':
        this.drawHeart(ctx, left, top, w, h, filled);
        break;

      case 'speech-bubble':
        this.drawSpeechBubble(ctx, left, top, w, h, filled);
        break;

      case 'pointing-finger':
        this.drawPointingFinger(ctx, left, top, w, h, filled, x1 >= x0);
        break;

      case 'crow':
        this.drawCrow(ctx, left, top, w, h, filled, x1 >= x0);
        break;
    }

    ctx.restore();
  }

  // 1. 직선
  private static drawLine(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // 2. 사각형
  private static drawRectangle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean
  ): void {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (filled) {
      ctx.fill();
    }
    ctx.stroke();
  }

  // 3. 원 / 타원
  private static drawCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean
  ): void {
    ctx.beginPath();
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (filled) {
      ctx.fill();
    }
    ctx.stroke();
  }

  // 4. 별 (5각 별)
  private static drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean
  ): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.42;
    const spikes = 5;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);

    for (let i = 0; i < spikes; i++) {
      let px = cx + Math.cos(rot) * outerR;
      let py = cy + Math.sin(rot) * outerR;
      ctx.lineTo(px, py);
      rot += step;

      px = cx + Math.cos(rot) * innerR;
      py = cy + Math.sin(rot) * innerR;
      ctx.lineTo(px, py);
      rot += step;
    }
    ctx.closePath();

    if (filled) {
      ctx.fill();
    }
    ctx.stroke();
  }

  // 5. 하트
  private static drawHeart(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean
  ): void {
    ctx.beginPath();
    const topCurveHeight = h * 0.3;
    ctx.moveTo(x + w / 2, y + topCurveHeight);
    
    // Top left curve
    ctx.bezierCurveTo(
      x + w / 2, y,
      x, y,
      x, y + topCurveHeight
    );

    // Bottom left curve
    ctx.bezierCurveTo(
      x, y + (h + topCurveHeight) / 2,
      x + w / 2, y + (h + topCurveHeight) / 2,
      x + w / 2, y + h
    );

    // Bottom right curve
    ctx.bezierCurveTo(
      x + w / 2, y + (h + topCurveHeight) / 2,
      x + w, y + (h + topCurveHeight) / 2,
      x + w, y + topCurveHeight
    );

    // Top right curve
    ctx.bezierCurveTo(
      x + w, y,
      x + w / 2, y,
      x + w / 2, y + topCurveHeight
    );

    ctx.closePath();
    if (filled) {
      ctx.fill();
    }
    ctx.stroke();
  }

  // 6. 말풍선 (Speech Bubble)
  private static drawSpeechBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean
  ): void {
    const bubbleH = h * 0.78;
    const tailH = h - bubbleH;
    const r = Math.min(16, bubbleH / 4, w / 4);

    ctx.beginPath();
    // Rounded rect body
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + bubbleH - r);
    ctx.quadraticCurveTo(x + w, y + bubbleH, x + w - r, y + bubbleH);

    // Bottom with speech tail
    const tailX = x + Math.min(w * 0.35, 40);
    const tailW = Math.min(w * 0.25, 30);
    ctx.lineTo(tailX + tailW, y + bubbleH);
    ctx.lineTo(tailX, y + bubbleH + tailH); // Pointer tip
    ctx.lineTo(tailX + tailW * 0.3, y + bubbleH);

    ctx.lineTo(x + r, y + bubbleH);
    ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (filled) {
      ctx.fill();
    }
    ctx.stroke();
  }

  // Google Material Icons "touch_app" (Apache-2.0), rotated to point left/right.
  // Source notice: THIRD_PARTY_NOTICES.md
  private static drawPointingFinger(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean,
    pointRight: boolean = true
  ): void {
    const touchHalo = new Path2D(
      'M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74z'
    );
    const hand = new Path2D(
      'M18.84 15.87l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z'
    );

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(pointRight ? Math.PI / 2 : -Math.PI / 2);
    ctx.scale(h / 24, w / 24);
    ctx.translate(-12, -12);
    ctx.lineWidth = Math.max(0.8, ctx.lineWidth * (24 / Math.max(w, h)));

    if (filled) {
      ctx.fill(touchHalo);
      ctx.fill(hand);
    } else {
      ctx.stroke(touchHalo);
      ctx.stroke(hand);
    }
    ctx.restore();
  }

  // 8. 까마귀 아이콘 (Crow Icon) 🦅 - 날개깃과 부리, 깃털 결이 살아있는 고급 실루엣
  private static drawCrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    filled: boolean,
    facingRight: boolean = true
  ): void {
    ctx.save();
    if (!facingRight) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(x, y);
    }

    const sx = w / 100;
    const sy = h / 80;

    ctx.beginPath();
    // Sharp curved beak tip
    ctx.moveTo(98 * sx, 28 * sy);
    // Beak upper curve to forehead
    ctx.bezierCurveTo(90 * sx, 24 * sy, 82 * sx, 22 * sy, 78 * sx, 20 * sy);
    // Head crown to neck
    ctx.bezierCurveTo(72 * sx, 14 * sy, 62 * sx, 14 * sy, 55 * sx, 19 * sy);
    // Soaring wing top contour
    ctx.bezierCurveTo(48 * sx, 9 * sy, 38 * sx, 3 * sy, 26 * sx, 1 * sy);

    // Primary flight feathers (7 individual smooth feather tips)
    ctx.lineTo(28 * sx, 10 * sy);
    ctx.bezierCurveTo(23 * sx, 8 * sy, 19 * sx, 6 * sy, 15 * sx, 8 * sy);
    ctx.lineTo(19 * sx, 16 * sy);
    ctx.bezierCurveTo(14 * sx, 15 * sy, 10 * sx, 15 * sy, 7 * sx, 18 * sy);
    ctx.lineTo(13 * sx, 24 * sy);
    ctx.bezierCurveTo(8 * sx, 25 * sy, 5 * sx, 28 * sy, 3 * sx, 32 * sy);
    ctx.lineTo(11 * sx, 36 * sy);
    ctx.bezierCurveTo(7 * sx, 39 * sy, 5 * sx, 43 * sy, 4 * sx, 47 * sy);
    ctx.lineTo(15 * sx, 47 * sy);

    // Lower wing back to rump
    ctx.bezierCurveTo(18 * sx, 52 * sy, 24 * sx, 56 * sy, 30 * sx, 56 * sy);
    // Fan tail feathers
    ctx.lineTo(8 * sx, 76 * sy);
    ctx.lineTo(17 * sx, 73 * sy);
    ctx.lineTo(15 * sx, 79 * sy);
    ctx.lineTo(25 * sx, 73 * sy);
    ctx.lineTo(26 * sx, 78 * sy);
    ctx.lineTo(34 * sx, 70 * sy);

    // Underbelly & talons contour
    ctx.bezierCurveTo(44 * sx, 68 * sy, 50 * sx, 62 * sy, 56 * sx, 53 * sy);
    // Broad chest to throat
    ctx.bezierCurveTo(68 * sx, 52 * sy, 76 * sx, 43 * sy, 81 * sx, 34 * sy);
    // Lower beak line back to tip
    ctx.bezierCurveTo(86 * sx, 32 * sy, 92 * sx, 30 * sy, 98 * sx, 28 * sy);
    ctx.closePath();

    if (filled) {
      ctx.fill();
    }
    ctx.stroke();

    // Intelligent crow eye with shine
    ctx.beginPath();
    ctx.arc(73 * sx, 23 * sy, Math.max(1.8, 3.2 * sx), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(74 * sx, 22.2 * sy, Math.max(0.8, 1.2 * sx), 0, Math.PI * 2);
    ctx.fillStyle = '#0e1015';
    ctx.fill();

    // Distinct Golden Yellow Beak (Crow Show signature yellow beak)
    ctx.beginPath();
    ctx.moveTo(98 * sx, 28 * sy);
    ctx.bezierCurveTo(92 * sx, 25 * sy, 85 * sx, 23 * sy, 80 * sx, 22 * sy);
    ctx.lineTo(81.5 * sx, 33 * sy);
    ctx.bezierCurveTo(88 * sx, 31 * sy, 94 * sx, 29.5 * sy, 98 * sx, 28 * sy);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = Math.max(1, 0.8 * sx);
    ctx.stroke();

    // Beak separation cut line
    ctx.beginPath();
    ctx.moveTo(98 * sx, 28 * sy);
    ctx.lineTo(80 * sx, 27.5 * sy);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(1, 0.8 * sx);
    ctx.stroke();

    ctx.restore();
  }
}
