import type { TransitionType, SlideTransitionConfig } from '../types/presentation';

export interface TransitionAnimationClasses {
  exitClass: string;
  enterClass: string;
}

export class TransitionEngine {
  private static instance: TransitionEngine | null = null;
  private currentConfig: SlideTransitionConfig = {
    type: 'fade',
    durationMs: 750,
    easing: 'cubic-bezier(0.2, 0.0, 0.2, 1)',
  };

  public static getInstance(): TransitionEngine {
    if (!TransitionEngine.instance) {
      TransitionEngine.instance = new TransitionEngine();
    }
    return TransitionEngine.instance;
  }

  public setConfig(config: Partial<SlideTransitionConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
  }

  public getConfig(): SlideTransitionConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get CSS class names for exiting and entering slide elements
   */
  public getAnimationClasses(
    type: TransitionType,
    direction: 'next' | 'prev' | 'jump'
  ): TransitionAnimationClasses {
    if (type === 'none') {
      return { exitClass: '', enterClass: '' };
    }

    switch (type) {
      case 'fade':
        return {
          exitClass: 'trans-fade-exit',
          enterClass: 'trans-fade-enter',
        };

      case 'dissolve':
        return {
          exitClass: 'trans-dissolve-exit',
          enterClass: 'trans-dissolve-enter',
        };

      case 'chalkboard':
        return direction === 'prev'
          ? { exitClass: 'trans-chalkboard-prev-exit', enterClass: 'trans-chalkboard-prev-enter' }
          : { exitClass: 'trans-chalkboard-next-exit', enterClass: 'trans-chalkboard-next-enter' };

      case 'slide-left':
        return direction === 'prev'
          ? { exitClass: 'trans-slide-right-exit', enterClass: 'trans-slide-right-enter' }
          : { exitClass: 'trans-slide-left-exit', enterClass: 'trans-slide-left-enter' };

      case 'slide-right':
        return direction === 'prev'
          ? { exitClass: 'trans-slide-left-exit', enterClass: 'trans-slide-left-enter' }
          : { exitClass: 'trans-slide-right-exit', enterClass: 'trans-slide-right-enter' };

      case 'slide-up':
        return direction === 'prev'
          ? { exitClass: 'trans-slide-down-exit', enterClass: 'trans-slide-down-enter' }
          : { exitClass: 'trans-slide-up-exit', enterClass: 'trans-slide-up-enter' };

      case 'slide-down':
        return direction === 'prev'
          ? { exitClass: 'trans-slide-up-exit', enterClass: 'trans-slide-up-enter' }
          : { exitClass: 'trans-slide-down-exit', enterClass: 'trans-slide-down-enter' };

      case 'zoom':
        return direction === 'prev'
          ? { exitClass: 'trans-zoom-out-exit', enterClass: 'trans-zoom-out-enter' }
          : { exitClass: 'trans-zoom-in-exit', enterClass: 'trans-zoom-in-enter' };

      default:
        return { exitClass: 'trans-fade-exit', enterClass: 'trans-fade-enter' };
    }
  }
}
