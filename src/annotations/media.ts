import type { AnnotationStroke } from '../types/annotation';
const cache=new Map<string,HTMLImageElement>();
export function imageFor(source:string):HTMLImageElement {
  let image=cache.get(source);
  if(!image){image=new Image();image.onload=()=>window.dispatchEvent(new Event('crowshow-image-ready'));image.src=source;cache.set(source,image);if(cache.size>32)cache.delete(cache.keys().next().value!);}
  return image;
}
export async function prepareImages(strokes:AnnotationStroke[]) {
  await Promise.all(strokes.filter(s=>s.tool==='image'&&s.imageData).map(s=>imageFor(s.imageData!).decode()));
}
export function safeLink(value:string):string|null {
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export async function importNoteImage(file:File) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('PNG·JPEG·WebP 이미지(20MB 이하)를 선택하세요.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    return {imageData:canvas.toDataURL('image/webp',.9),aspect:canvas.width/canvas.height};
  }finally{URL.revokeObjectURL(url);}
}
