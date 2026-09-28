export type ToolType = 'select' | 'pen' | 'highlighter' | 'eraser' | 'laser' | 'spotlight' | 'shape' | 'text';

export type ShapeType =
  | 'circle'
  | 'rectangle'
  | 'line'
  | 'star'
  | 'heart'
  | 'speech-bubble'
  | 'pointing-finger'
  | 'crow';

export interface NormalizedPoint {
  x: number; // 0.0 to 1.0 relative to slide width
  y: number; // 0.0 to 1.0 relative to slide height
  pressure?: number; // 0.0 to 1.0 for stylus
  time?: number;
}

export interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'shape' | 'text';
  shapeType?: ShapeType;
  shapeFill?: boolean;
  color: string;
  width: number; // relative or standard pixel base
  opacity: number;
  points: NormalizedPoint[];
  rotation?: number; // In radians (0 to 2*PI)
  text?: string; // Text content if tool === 'text'
  fontSize?: number; // Font size in pixels
  fontFamily?: string;
  slideNumber: number;
  createdAt: number;
}

export interface SlideAnnotationMap {
  [slideNumber: number]: AnnotationStroke[];
}

export interface LaserPointerState {
  x: number; // normalized
  y: number; // normalized
  active: boolean;
  color: string; // Hex color (e.g., #ef4444, #22c55e, #3b82f6)
  trail: { x: number; y: number; time: number }[];
}

export interface SpotlightState {
  x: number; // normalized
  y: number; // normalized
  active: boolean;
  radius: number; // in pixels
}

export interface AnnotationHistoryAction {
  type: 'add' | 'remove' | 'clear';
  slideNumber: number;
  strokes: AnnotationStroke[];
}

export interface CrowShowProjectData {
  version: string;
  documentName: string;
  documentFingerprint?: string;
  totalSlides: number;
  createdAt: string;
  updatedAt: string;
  settings: {
    transitionType: string;
    transitionDuration: number;
  };
  annotations: SlideAnnotationMap;
  slideTransitions?: Record<number, string>;
  speakerNotes?: Record<number, string>;
}
