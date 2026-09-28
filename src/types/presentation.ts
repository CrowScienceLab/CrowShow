export type ViewMode = 'normal' | 'presentation' | 'presenter';

export type ScreenCurtain = 'none' | 'black' | 'white';

export type TransitionType = 
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom'
  | 'dissolve'
  | 'chalkboard';

export interface SlideTransitionConfig {
  type: TransitionType;
  durationMs: number;
  easing: string;
}

export interface PresentationState {
  currentSlide: number; // 1-indexed
  totalSlides: number;
  viewMode: ViewMode;
  screenCurtain: ScreenCurtain;
  zoom: number; // 1.0 = fit
  pan: { x: number; y: number };
  isNavigating: boolean;
  slideAspect: number; // width / height
}

export interface SlideTransitionEvent {
  fromSlide: number;
  toSlide: number;
  direction: 'next' | 'prev' | 'jump';
  config: SlideTransitionConfig;
}
