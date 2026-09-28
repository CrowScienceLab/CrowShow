import type { AnnotationStroke, NormalizedPoint } from '../types/annotation';

export class EraserEngine {
  /**
   * Distance from point P to line segment AB
   */
  private static distToSegment(
    p: NormalizedPoint,
    a: NormalizedPoint,
    b: NormalizedPoint,
    aspectRatio: number
  ): number {
    // Correct for aspect ratio so circular hit radius isn't distorted
    const px = p.x;
    const py = p.y * aspectRatio;
    const ax = a.x;
    const ay = a.y * aspectRatio;
    const bx = b.x;
    const by = b.y * aspectRatio;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(px - ax, py - ay);
    }

    // Projection parameter t
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;

    return Math.hypot(px - projX, py - projY);
  }

  /**
   * Check if a point hits a stroke
   */
  public static hitTestStroke(
    point: NormalizedPoint,
    stroke: AnnotationStroke,
    canvasWidth: number,
    canvasHeight: number,
    tolerancePixels: number = 14
  ): boolean {
    const pts = stroke.points;
    if (pts.length === 0) return false;

    const aspectRatio = canvasHeight / canvasWidth;
    // Normalized threshold
    const normTolerance = (tolerancePixels + stroke.width / 2) / canvasWidth;

    // Fast bounding box check
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

    if (stroke.tool === 'text') {
      const fontSize = stroke.fontSize || 22;
      const lines = (stroke.text || '').split('\n');
      const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
      const textWidthNorm = (maxLineLen * fontSize * 0.65) / canvasWidth;
      const textHeightNorm = (lines.length * fontSize * 1.35) / canvasHeight;
      maxX = Math.max(maxX, minX + textWidthNorm);
      maxY = Math.max(maxY, minY + textHeightNorm);
    }

    if (
      point.x < minX - normTolerance ||
      point.x > maxX + normTolerance ||
      point.y < minY - normTolerance ||
      point.y > maxY + normTolerance
    ) {
      return false;
    }

    // Text is represented by a single anchor point, but it must behave like a
    // regular rectangular object. Once the pointer is inside its calculated
    // bounds, treat the whole text box as a hit instead of falling through to
    // the single-point stroke test below.
    if (stroke.tool === 'text') {
      return true;
    }

    // Shape hit testing
    if (stroke.tool === 'shape') {
      // If filled shape, hitting inside the bounding box erases it
      if (stroke.shapeFill) {
        return (
          point.x >= minX - normTolerance &&
          point.x <= maxX + normTolerance &&
          point.y >= minY - normTolerance &&
          point.y <= maxY + normTolerance
        );
      }
      // If outlined shape or line, check proximity to edges or line
      if (stroke.shapeType === 'line' && pts.length >= 2) {
        const dist = this.distToSegment(point, pts[0], pts[pts.length - 1], aspectRatio);
        return dist <= normTolerance;
      }
      // Outlined shapes: proximity to bounding box perimeter or center
      const nearLeft = Math.abs(point.x - minX) <= normTolerance;
      const nearRight = Math.abs(point.x - maxX) <= normTolerance;
      const nearTop = Math.abs(point.y - minY) <= normTolerance;
      const nearBottom = Math.abs(point.y - maxY) <= normTolerance;
      if (nearLeft || nearRight || nearTop || nearBottom) return true;
      // Or general touch within box for smaller shapes
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      if (boxW < 0.15 && boxH < 0.15) {
        return true;
      }
    }

    // Segment distance check
    if (pts.length === 1) {
      const d = Math.hypot(point.x - pts[0].x, (point.y - pts[0].y) * aspectRatio);
      return d <= normTolerance;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const dist = this.distToSegment(point, pts[i], pts[i + 1], aspectRatio);
      if (dist <= normTolerance) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find and remove strokes hit by the eraser point.
   * Returns surviving strokes and removed strokes.
   */
  public static eraseAt(
    point: NormalizedPoint,
    strokes: AnnotationStroke[],
    canvasWidth: number,
    canvasHeight: number,
    tolerancePixels: number = 16
  ): { surviving: AnnotationStroke[]; removed: AnnotationStroke[] } {
    const surviving: AnnotationStroke[] = [];
    const removed: AnnotationStroke[] = [];

    for (const stroke of strokes) {
      if (this.hitTestStroke(point, stroke, canvasWidth, canvasHeight, tolerancePixels)) {
        removed.push(stroke);
      } else {
        surviving.push(stroke);
      }
    }

    return { surviving, removed };
  }
}
