import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { prepareImages } from '../annotations/media';
import { StrokeEngine } from '../annotations/strokeEngine';
import type { SlideAnnotationMap } from '../types/annotation';
import { parsePageRange } from '../utils/printRange';
export function PrintDialog({pdf,annotations,onClose}:{pdf:PDFDocumentProxy;annotations:SlideAnnotationMap;onClose:()=>void}) {
  const [range,setRange]=useState(''),[perSheet,setPerSheet]=useState(1),[ink,setInk]=useState(true),[landscape,setLandscape]=useState(false);
  const [html,setHtml]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();}};
    window.addEventListener('keydown',onKey,true);
    return()=>window.removeEventListener('keydown',onKey,true);
  },[onClose]);
  useEffect(()=>{
    let cancelled=false;
    // Prepare the external PDF render job whenever print settings change.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusy(true);setError('');setHtml('');
    void (async()=>{
      try {
        const pages=parsePageRange(range,pdf.numPages), images:string[]=[];
        for(const n of pages) {
          if(cancelled) return;
          const page=await pdf.getPage(n);const base=page.getViewport({scale:1});
          const scale=Math.min(2,2200/Math.max(base.width,base.height));const viewport=page.getViewport({scale});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d')!;await page.render({canvas,canvasContext:ctx,viewport}).promise;
          if(ink)await prepareImages(annotations[n]||[]);
          if(ink) StrokeEngine.renderStrokes(ctx,annotations[n]||[],canvas.width,canvas.height);
          images.push(`<figure><img src="${canvas.toDataURL('image/png')}"/><figcaption>${n}</figcaption></figure>`);
          canvas.width=canvas.height=0;
        }
        const columns=perSheet===1?1:perSheet===2?(landscape?2:1):perSheet===9?3:2;
        const rows=Math.ceil(perSheet/columns);
        const sheets=[];for(let i=0;i<images.length;i+=perSheet) sheets.push(`<section>${images.slice(i,i+perSheet).join('')}</section>`);
        if(!cancelled) setHtml(`<!doctype html><html><head><style>@page{size:A4 ${landscape?'landscape':'portrait'};margin:8mm}*{box-sizing:border-box}body{margin:0;background:#ddd}section{background:white;width:${landscape?281:194}mm;height:${landscape?194:281}mm;padding:2mm;margin:8px auto;display:grid;grid-template-columns:repeat(${columns},1fr);grid-template-rows:repeat(${rows},1fr);gap:4mm;break-after:page}section:last-child{break-after:auto}figure{margin:0;min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center}img{display:block;max-width:100%;max-height:calc(100% - 5mm);object-fit:contain}figcaption{height:5mm;font:10px sans-serif;color:#555}@media print{body{background:white}section{margin:0}}</style></head><body>${sheets.join('')}</body></html>`);
      }catch(e){if(!cancelled)setError(String(e));}finally{if(!cancelled)setBusy(false);}
    })(); return ()=>{cancelled=true;};
  },[pdf,annotations,range,perSheet,ink,landscape]);
  return <div className="modal-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="print-dialog" role="dialog" aria-modal="true" aria-label="인쇄 미리보기"><header><h2>인쇄 미리보기</h2><button className="icon-btn-sm" aria-label="인쇄 미리보기 닫기" title="닫기 (Esc)" onClick={onClose}><X size={18}/></button></header>
    <div className="print-layout"><div className="print-options"><label>페이지 <input aria-label="인쇄 페이지 범위" value={range} placeholder="전체 · 예: 1-3, 5" onChange={e=>setRange(e.target.value)}/></label>
    <label>한 면에 <select aria-label="한 면의 슬라이드 수" value={perSheet} onChange={e=>setPerSheet(Number(e.target.value))}>{[1,2,4,6,9].map(n=><option key={n} value={n}>{n}장</option>)}</select></label>
    <label><input type="checkbox" checked={ink} onChange={e=>setInk(e.target.checked)}/>필기 포함</label><label><input type="checkbox" checked={landscape} onChange={e=>setLandscape(e.target.checked)}/>가로 용지</label>
    <button className="primary" disabled={busy||!html} onClick={()=>{frame.current?.contentWindow?.focus();frame.current?.contentWindow?.print();}}>인쇄 / PDF로 저장</button></div>
    <div className="print-preview">{busy?<p role="status">인쇄할 페이지를 준비하는 중…</p>:error?<p role="alert">{error}</p>:<iframe ref={frame} title="인쇄 용지 미리보기" srcDoc={html}/>}</div></div>
  </section></div>;
}
