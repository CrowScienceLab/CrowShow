import type { NotebookBook } from '../types/notebook';
import { readProject } from './projectValidation';
export const NOTEBOOK_FILE_EXTENSION='.crownotebook';
export function encodeNotebookFile(book:NotebookBook):string {
 return JSON.stringify({format:'crowshow-notebook',version:1,savedAt:new Date().toISOString(),book},null,2);
}
export function decodeNotebookFile(text:string):NotebookBook {
 const value=JSON.parse(text);
 if(value?.format!=='crowshow-notebook'||value.version!==1||typeof value.book?.id!=='string'||typeof value.book.title!=='string')throw new Error('CrowShow Notebook 파일 형식이 올바르지 않습니다.');
 readProject(JSON.stringify({documentName:'Notebook',totalSlides:1,annotations:{},notebook:{...value.book,books:[value.book]}}));
 return structuredClone(value.book);
}
