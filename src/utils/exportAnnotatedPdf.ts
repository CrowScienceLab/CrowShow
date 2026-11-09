import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AnnotationStore } from '../annotations/annotationStore';
import { prepareImages } from '../annotations/media';
import { StrokeEngine } from '../annotations/strokeEngine';
import { downloadBytes } from './download';
export async function buildAnnotatedPdf(pdfDoc:PDFDocumentProxy, source:Uint8Array):Promise<Uint8Array> {
  const {PDFDocument,degrees}=await import('pdf-lib');
  const original=await PDFDocument.load(source); const output=await PDFDocument.create();
  const pages=await output.copyPages(original,original.getPageIndices());
  const store=AnnotationStore.getInstance();
  for(let i=0;i<pages.length;i++) {
    const target=output.addPage(pages[i]),strokes=store.getStrokesForSlide(i+1);
    if(!strokes.length) continue;
    const page=await pdfDoc.getPage(i+1),base=page.getViewport({scale:1});
    const scale=Math.min(2,4000/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await prepareImages(strokes);
    const ctx=canvas.getContext('2d')!;StrokeEngine.renderStrokes(ctx,strokes,canvas.width,canvas.height);
    const image=await output.embedPng(await (await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG failed')),'image/png'))).arrayBuffer());
    const a=((target.getRotation().angle%360)+360)%360,w=target.getWidth(),h=target.getHeight();
    target.drawImage(image,{x:a===90||a===180?w:0,y:a===180||a===270?h:0,width:base.width,height:base.height,rotate:degrees(a)});
    canvas.width=canvas.height=0;
  }
  return new Uint8Array(await output.save());
}
export async function exportAnnotatedPdf(pdfDoc:PDFDocumentProxy,fileName:string,source?:Uint8Array):Promise<void> {
  const bytes=await buildAnnotatedPdf(pdfDoc,source??await pdfDoc.getData());
  downloadBytes(bytes,`${fileName.replace(/\.pdf$/i,'')}-annotated.pdf`,'application/pdf');
}
