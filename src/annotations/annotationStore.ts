import type {
  AnnotationStroke,
  SlideAnnotationMap,
  AnnotationHistoryAction,
  CrowShowProjectData
} from '../types/annotation';

export class AnnotationStore {
  private static instance: AnnotationStore | null = null;
  private annotations: SlideAnnotationMap = {};
  private undoStack: AnnotationHistoryAction[] = [];
  private redoStack: AnnotationHistoryAction[] = [];
  private currentDocId: string = 'default';
  private listeners: Set<() => void> = new Set();

  public static getInstance(): AnnotationStore {
    if (!AnnotationStore.instance) {
      AnnotationStore.instance = new AnnotationStore();
    }
    return AnnotationStore.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
    this.autoSave();
  }

  public setDocument(docId: string): void {
    this.currentDocId = docId;
    this.undoStack = [];
    this.redoStack = [];
    this.loadFromStorage(docId);
    this.notify();
  }

  public getStrokesForSlide(slideNumber: number): AnnotationStroke[] {
    return this.annotations[slideNumber] || [];
  }

  public getAllAnnotations(): SlideAnnotationMap {
    return { ...this.annotations };
  }

  public setAllAnnotations(annotations: SlideAnnotationMap): void {
    this.annotations = { ...annotations };
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public addStroke(stroke: AnnotationStroke): void {
    const slideNumber = stroke.slideNumber;
    if (!this.annotations[slideNumber]) {
      this.annotations[slideNumber] = [];
    }
    this.annotations[slideNumber] = [...this.annotations[slideNumber], stroke];

    // Push to undo stack
    this.undoStack.push({
      type: 'add',
      slideNumber,
      strokes: [stroke],
    });
    this.redoStack = []; // Clear redo
    this.notify();
  }

  public removeStrokes(slideNumber: number, strokesToRemove: AnnotationStroke[]): void {
    if (strokesToRemove.length === 0) return;
    const current = this.annotations[slideNumber] || [];
    const removeIds = new Set(strokesToRemove.map((s) => s.id));

    this.annotations[slideNumber] = current.filter((s) => !removeIds.has(s.id));

    this.undoStack.push({
      type: 'remove',
      slideNumber,
      strokes: strokesToRemove,
    });
    this.redoStack = [];
    this.notify();
  }

  public updateStroke(slideNumber: number, updatedStroke: AnnotationStroke): void {
    const current = this.annotations[slideNumber] || [];
    const index = current.findIndex((s) => s.id === updatedStroke.id);
    if (index !== -1) {
      const copy = [...current];
      copy[index] = updatedStroke;
      this.annotations[slideNumber] = copy;
      this.notify();
    }
  }

  public clearSlide(slideNumber: number): void {
    const current = this.annotations[slideNumber] || [];
    if (current.length === 0) return;

    this.annotations[slideNumber] = [];

    this.undoStack.push({
      type: 'clear',
      slideNumber,
      strokes: current,
    });
    this.redoStack = [];
    this.notify();
  }

  public clearAllSlides(): void {
    this.annotations = {};
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;

    const { type, slideNumber, strokes } = action;
    const current = this.annotations[slideNumber] || [];

    if (type === 'add') {
      // Revert add -> remove the added stroke
      const ids = new Set(strokes.map((s) => s.id));
      this.annotations[slideNumber] = current.filter((s) => !ids.has(s.id));
      this.redoStack.push(action);
    } else if (type === 'remove' || type === 'clear') {
      // Revert remove/clear -> restore the strokes
      this.annotations[slideNumber] = [...current, ...strokes];
      this.redoStack.push(action);
    }

    this.notify();
    return true;
  }

  public redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;

    const { type, slideNumber, strokes } = action;
    const current = this.annotations[slideNumber] || [];

    if (type === 'add') {
      // Re-add stroke
      this.annotations[slideNumber] = [...current, ...strokes];
      this.undoStack.push(action);
    } else if (type === 'remove') {
      // Re-remove stroke
      const ids = new Set(strokes.map((s) => s.id));
      this.annotations[slideNumber] = current.filter((s) => !ids.has(s.id));
      this.undoStack.push(action);
    } else if (type === 'clear') {
      // Re-clear
      this.annotations[slideNumber] = [];
      this.undoStack.push(action);
    }

    this.notify();
    return true;
  }

  /**
   * Save annotations to localStorage
   */
  private autoSave(): void {
    if (!this.currentDocId) return;
    try {
      const key = `crowshow_annotations_${this.currentDocId}`;
      localStorage.setItem(key, JSON.stringify(this.annotations));
    } catch (err) {
      console.warn('Auto-save annotations warning:', err);
    }
  }

  /**
   * Load annotations from localStorage
   */
  private loadFromStorage(docId: string): void {
    try {
      const key = `crowshow_annotations_${docId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        this.annotations = JSON.parse(saved);
      } else {
        this.annotations = {};
      }
    } catch (err) {
      console.warn('Load annotations warning:', err);
      this.annotations = {};
    }
  }

  /**
   * Export as Project Data (.crowshow / JSON)
   */
  public exportProjectData(
    documentName: string,
    totalSlides: number,
    transitionType: string,
    transitionDuration: number,
    slideTransitions: Record<number, string> = {},
    speakerNotes: Record<number, string> = {}
  ): CrowShowProjectData {
    return {
      version: '1.0.0',
      documentName,
      totalSlides,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        transitionType,
        transitionDuration,
      },
      annotations: this.annotations,
      slideTransitions,
      speakerNotes,
    };
  }
}
