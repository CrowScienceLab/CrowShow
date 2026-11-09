import type { AnnotationStroke, SlideAnnotationMap, CrowShowProjectData } from '../types/annotation';
import { validateAnnotations } from '../utils/projectValidation';
import { loadInk, queueInk } from '../utils/inkStorage';
export class AnnotationStore {
  private static instance: AnnotationStore | null = null;
  private annotations: SlideAnnotationMap = {};
  private undoStack: SlideAnnotationMap[] = [];
  private redoStack: SlideAnnotationMap[] = [];
  private currentDocId = '';
  private transaction: SlideAnnotationMap | null = null;
  private listeners = new Set<() => void>();
  public storageFailed = false;
  private persist:boolean;
  constructor(persist=true) {this.persist=persist;}
  public get isEditing() { return this.transaction !== null; }
  public static getInstance(): AnnotationStore { return this.instance ??= new AnnotationStore(); }
  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private snapshot() { return structuredClone(this.annotations); }
  private notify() {
    if(this.transaction) { this.listeners.forEach(listener=>listener()); return; }
    if(this.persist&&this.currentDocId&&typeof indexedDB!=='undefined')queueInk(`annotations/${this.currentDocId}`,this.annotations,error=>{this.storageFailed=!!error;});
    this.listeners.forEach(listener => listener());
  }
  private checkpoint() {
    if (this.transaction) return;
    this.undoStack.push(this.annotations); if (this.undoStack.length > 40) this.undoStack.shift(); this.redoStack = [];
  }
  public beginTransaction() { this.transaction ??= this.annotations; }
  public endTransaction() {
    if (this.transaction && this.transaction !== this.annotations) {
      this.undoStack.push(this.transaction); this.redoStack = [];
      if(this.undoStack.length>40)this.undoStack.shift();
    }
    this.transaction = null; this.notify();
  }
  public async setDocument(id: string) {
    this.currentDocId = id; this.undoStack = []; this.redoStack = []; this.transaction = null;
    this.annotations={};
    if(!this.persist)return;
    try { const data=typeof indexedDB==='undefined'?JSON.parse(localStorage.getItem(`crowshow_annotations_${id}`)||'{}'):await loadInk<SlideAnnotationMap>(`annotations/${id}`,`crowshow_annotations_${id}`); if(this.currentDocId!==id)return;this.annotations=data&&validateAnnotations(data)?data:{}; }
    catch { this.storageFailed=true;throw new Error('저장된 필기를 읽지 못했습니다. 원본 저장 자료는 유지됩니다.'); }
    this.notify();
  }
  public getStrokesForSlide(page: number): AnnotationStroke[] { return this.annotations[page] || []; }
  public getAllAnnotations(): SlideAnnotationMap { return this.snapshot(); }
  /** Immutable view for autosave; writers always replace page arrays/maps. */
  public getSnapshot(): SlideAnnotationMap { return this.annotations; }
  public setAllAnnotations(data: SlideAnnotationMap) { this.annotations = structuredClone(data); this.undoStack = []; this.redoStack = []; this.notify(); }
  public replaceSlide(page: number, strokes: AnnotationStroke[]) { this.checkpoint(); this.annotations = {...this.annotations,[page]:strokes}; this.notify(); }
  public addStroke(stroke: AnnotationStroke) { this.replaceSlide(stroke.slideNumber, [...this.getStrokesForSlide(stroke.slideNumber), stroke]); }
  public removeStrokes(page: number, strokes: AnnotationStroke[]) {
    if (!strokes.length) return; const ids = new Set(strokes.map(s => s.id));
    this.replaceSlide(page, this.getStrokesForSlide(page).filter(s => !ids.has(s.id)));
  }
  public updateStroke(page: number, stroke: AnnotationStroke) { this.replaceSlide(page, this.getStrokesForSlide(page).map(s => s.id === stroke.id ? stroke : s)); }
  public clearSlide(page: number) { if (this.getStrokesForSlide(page).length) this.replaceSlide(page, []); }
  public clearAllSlides() { this.checkpoint(); this.annotations = {}; this.notify(); }
  public canUndo() { return this.undoStack.length > 0; }
  public canRedo() { return this.redoStack.length > 0; }
  public undo() { const previous = this.undoStack.pop(); if (!previous) return false; this.redoStack.push(this.annotations); this.annotations = previous; this.notify(); return true; }
  public redo() { const next = this.redoStack.pop(); if (!next) return false; this.undoStack.push(this.annotations); this.annotations = next; this.notify(); return true; }
  public exportProjectData(documentName: string, totalSlides: number, transitionType: string, transitionDuration: number,
    slideTransitions: Record<number, string> = {}, speakerNotes: Record<number, string> = {}): CrowShowProjectData {
    return { version: '1.5.0', documentName, totalSlides, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      settings: {transitionType, transitionDuration}, annotations: this.getAllAnnotations(), slideTransitions, speakerNotes };
  }
}
