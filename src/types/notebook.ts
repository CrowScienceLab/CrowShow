import type { SlideAnnotationMap } from './annotation';
import type { PdfZoomMode } from '../pdf/pdfViewport';
export type PaperType = 'blank' | 'lined' | 'grid' | 'dots' | 'cornell' | 'spring';
export interface NotePage { id:string; title:string; paper:PaperType; color:string; backgroundImage?:string; }
export interface NoteView {spread:1|2;zoom:number;mode?:PdfZoomMode;}
export interface NotebookBook {id:string;title:string;pages:NotePage[];annotations:SlideAnnotationMap;view?:NoteView;}
// Active-book fields retain compatibility with Review1/2 project files.
export interface NotebookData {pages:NotePage[];annotations:SlideAnnotationMap;view?:NoteView;books?:NotebookBook[];activeBookId?:string;}
