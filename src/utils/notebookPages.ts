import type { NotePage } from '../types/notebook';
import type { SlideAnnotationMap } from '../types/annotation';
export function deleteNotebookPage(pages:NotePage[],ink:SlideAnnotationMap,index:number) {
 if(pages.length===1)return {pages:[{...pages[0],id:crypto.randomUUID(),backgroundImage:undefined}],annotations:{1:[]},index:0};
 const next=pages.filter((_,i)=>i!==index),annotations:SlideAnnotationMap={};
 next.forEach((_,i)=>{annotations[i+1]=(ink[(i<index?i:i+1)+1]||[]).map(s=>({...s,slideNumber:i+1}))});
 return {pages:next,annotations,index:Math.max(0,index-1)};
}
