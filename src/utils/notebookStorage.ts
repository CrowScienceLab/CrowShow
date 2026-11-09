import type { NotebookData } from '../types/notebook';
import { loadInk, queueInk } from './inkStorage';
export async function loadNotebook(id:string):Promise<NotebookData|null> {
 const value=await loadInk<NotebookData>(`notebook/${id}`,`crowshow_notebook_${id}`);
 if(!value?.books?.length)return value;
 const active=value.books.find(b=>b.id===value.activeBookId)||value.books[0];return {...value,pages:active.pages,annotations:active.annotations,view:active.view};
}
export function saveNotebook(id:string,data:NotebookData,done:(error?:unknown)=>void) {
 // Active fields are reconstructed on load, avoiding a second copy of every point.
 const value=data.books?.length?{books:data.books,activeBookId:data.activeBookId}:data;
 queueInk(`notebook/${id}`,value,done);
}
