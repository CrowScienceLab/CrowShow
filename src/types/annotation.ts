export type ToolType = 'select' | 'lasso' | 'pen' | 'highlighter' | 'eraser' | 'laser' | 'shape' | 'text';
export type EraserMode = 'object' | 'area';

export type ShapeType =
  | 'circle'
  | 'rectangle'
  | 'line' | 'dashed-line'
  | 'arrow' | 'double-arrow' | 'triangle' | 'diamond' | 'check' | 'cross'
  | 'star'
  | 'heart'
  | 'speech-bubble'
  | 'pointing-finger'
  | 'crow' | 'smile' | 'cosmos' | 'sticky-note';

export interface NormalizedPoint {
  x: number; // 0.0 to 1.0 relative to slide width
  y: number; // 0.0 to 1.0 relative to slide height
  pressure?: number; // 0.0 to 1.0 for stylus
  tiltX?:number; tiltY?:number; twist?:number;
  time?: number;
}

export interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'shape' | 'text' | 'image' | 'link';
  shapeType?: ShapeType;
  shapeFill?: boolean;
  shapeFillColor?:string; shapeBorder?:boolean;
  flipX?:boolean; flipY?:boolean;
  color: string;
  width: number; // relative or standard pixel base
  opacity: number;
  points: NormalizedPoint[];
  rotation?: number; // In radians (0 to 2*PI)
  imageData?:string; url?:string;
  text?: string; // Text content if tool === 'text'
  fontSize?: number; // Font size in pixels
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textOutline?:boolean;
  referenceWidth?: number;
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
  size?:number; durationMs?:number;
  trail: { x: number; y: number; time: number }[];
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
  notebook?: import('./notebook').NotebookData;
  pdfBase64?: string;
}
