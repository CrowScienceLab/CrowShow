import type { TransitionType } from './presentation';

export type AppTheme = 'light' | 'dark' | 'system';
export type TransitionSound = 'none' | 'soft' | 'paper' | 'click' | 'chime';

export interface AppSettings {
  theme: AppTheme;
  defaultTransition: TransitionType;
  transitionDurationMs: number;
  laserColor: string;
  laserTrailEnabled: boolean;
  transitionSound: TransitionSound;
  spotlightRadius: number;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  enableStylusPressure: boolean;
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
  laserTrailEnabled: true,
  transitionSound: 'soft',
  spotlightRadius: 180,
  penColor: '#ef4444',
  penWidth: 4,
  highlighterColor: '#facc15',
  highlighterWidth: 20,
  enableStylusPressure: true,
  autoHideToolbarDelayMs: 2500,
  preloadSlideDistance: 2,
  autoPlayIntervalSeconds: 5,
  autoPlayLoop: false,
};
