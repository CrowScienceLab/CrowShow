import type { TransitionType } from './presentation';

export type AppTheme = 'light' | 'dark' | 'pink' | 'blue';
export type TransitionSound = 'none' | 'soft' | 'paper' | 'click' | 'chime';

export interface AppSettings {
  theme: AppTheme;
  defaultTransition: TransitionType;
  transitionDurationMs: number;
  laserColor: string;
  laserSize:number; laserTrailDurationMs:number;
  transitionSound: TransitionSound;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  enableStylusPressure: boolean;
  enableTilt:boolean;
  autoHideToolbarDelayMs: number;
  preloadSlideDistance: number; // e.g. 2 means load current - 2 to current + 2
  autoPlayIntervalSeconds: number;
  autoPlayLoop: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultTransition: 'fade',
  transitionDurationMs: 750,
  laserColor: '#ef4444',
  laserSize:4, laserTrailDurationMs:700,
  transitionSound: 'soft',
  penColor: '#ef4444',
  penWidth: 4,
  highlighterColor: '#facc15',
  highlighterWidth: 20,
  enableStylusPressure: true,
  enableTilt:true,
  autoHideToolbarDelayMs: 2500,
  preloadSlideDistance: 2,
  autoPlayIntervalSeconds: 5,
  autoPlayLoop: false,
};
