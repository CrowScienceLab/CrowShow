export type ShortcutAction =
  | 'nextSlide'
  | 'prevSlide'
  | 'firstSlide'
  | 'lastSlide'
  | 'startPresentation'
  | 'exitPresentation'
  | 'togglePresenterMode'
  | 'blackScreen'
  | 'whiteScreen'
  | 'goToSlide'
  | 'undo'
  | 'redo'
  | 'clearSlide'
  | 'toolSelect'
  | 'toolPen'
  | 'toolHighlighter'
  | 'toolEraser'
  | 'toolLaser'
  | 'toolSpotlight'
  | 'toolText'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

export type ShortcutHandler = (action: ShortcutAction, event: KeyboardEvent) => void;

export class KeyboardShortcutManager {
  private handlers: Set<ShortcutHandler> = new Set();
  private enabled: boolean = true;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  public registerHandler(handler: ShortcutHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore if typing in text input or textarea
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') {
        target.blur();
      }
      return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = e.key;

    // F5: Start Presentation
    if (key === 'F5') {
      e.preventDefault();
      this.dispatch('startPresentation', e);
      return;
    }

    // Escape: Exit Presentation or modals
    if (key === 'Escape') {
      e.preventDefault();
      this.dispatch('exitPresentation', e);
      return;
    }

    // Ctrl + Z: Undo
    if (isCtrl && !isShift && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      this.dispatch('undo', e);
      return;
    }

    // Ctrl + Y or Ctrl + Shift + Z: Redo
    if ((isCtrl && (key === 'y' || key === 'Y')) || (isCtrl && isShift && (key === 'z' || key === 'Z'))) {
      e.preventDefault();
      this.dispatch('redo', e);
      return;
    }

    // Ctrl + G: Go to slide
    if (isCtrl && (key === 'g' || key === 'G')) {
      e.preventDefault();
      this.dispatch('goToSlide', e);
      return;
    }

    // Slide navigation: Next
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(key) && !isCtrl) {
      e.preventDefault();
      this.dispatch('nextSlide', e);
      return;
    }

    // Slide navigation: Prev
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key) && !isCtrl) {
      e.preventDefault();
      this.dispatch('prevSlide', e);
      return;
    }

    // Slide navigation: First / Last
    if (key === 'Home') {
      e.preventDefault();
      this.dispatch('firstSlide', e);
      return;
    }
    if (key === 'End') {
      e.preventDefault();
      this.dispatch('lastSlide', e);
      return;
    }

    // Presentation Curtains
    if (key === 'b' || key === 'B') {
      e.preventDefault();
      this.dispatch('blackScreen', e);
      return;
    }
    if (key === 'w' || key === 'W') {
      e.preventDefault();
      this.dispatch('whiteScreen', e);
      return;
    }

    // Single-key Tool shortcuts (only if no Ctrl)
    if (!isCtrl) {
      if (key === 'p' || key === 'P') {
        this.dispatch('toolPen', e);
        return;
      }
      if (key === 'h' || key === 'H') {
        this.dispatch('toolHighlighter', e);
        return;
      }
      if (key === 'e' || key === 'E') {
        this.dispatch('toolEraser', e);
        return;
      }
      if (key === 'l' || key === 'L') {
        this.dispatch('toolLaser', e);
        return;
      }
      if (key === 's' || key === 'S') {
        this.dispatch('toolSpotlight', e);
        return;
      }
      if (key === 'v' || key === 'V') {
        this.dispatch('toolSelect', e);
        return;
      }
      if (key === 't' || key === 'T') {
        this.dispatch('toolText', e);
        return;
      }
      if (key === '+' || key === '=') {
        this.dispatch('zoomIn', e);
        return;
      }
      if (key === '-' || key === '_') {
        this.dispatch('zoomOut', e);
        return;
      }
      if (key === '0') {
        this.dispatch('zoomReset', e);
        return;
      }
    }
  }

  private dispatch(action: ShortcutAction, event: KeyboardEvent): void {
    for (const handler of this.handlers) {
      handler(action, event);
    }
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.handlers.clear();
  }
}
