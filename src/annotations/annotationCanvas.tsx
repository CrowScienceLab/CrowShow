import { RotateCw, FlipHorizontal2, FlipVertical2, Copy, ClipboardPaste, Trash2, Bold, Italic, Underline, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationStroke, NormalizedPoint, ToolType, ShapeType, LaserPointerState, EraserMode } from '../types/annotation';
import { AnnotationStore } from './annotationStore';
import { StrokeEngine } from './strokeEngine';
import { EraserEngine } from './eraserEngine';
import { strokeBounds, inPolygon, selectInRectangle, selectionHandles, resizeSelection, type ResizeHandle } from './geometry';
import { openExternalLink } from '../utils/desktopBridge';
import { validateAnnotations } from '../utils/projectValidation';
import { getRenderDensity } from '../pdf/pdfViewport';
interface Props {
 slideNumber:number;width:number;height:number;activeTool:ToolType;penColor:string;penWidth:number;highlighterColor:string;highlighterWidth:number;laserColor:string;
 shapeWidth?:number;shapeBorder?:boolean;shapeFillColor?:string;shapeOpacity?:number;laserSize?:number;laserTrailDurationMs?:number;
 shapeType?:ShapeType;shapeFill?:boolean;enableStylusPressure?:boolean;readOnly?:boolean;store?:AnnotationStore;eraserMode?:EraserMode;penOnly?:boolean;enableTilt?:boolean;eraserWidth?:number;keyboardActive?:boolean;
 onRequestSelectTool?:()=>void;onLaserChange:(state:LaserPointerState)=>void;
}
let copied:AnnotationStroke[]=[];
type Editor={x:number;y:number;text:string;fontSize:number;fontFamily:string;bold:boolean;italic:boolean;underline:boolean;textOutline:boolean;id?:string;color:string};
type Gesture={mode:'ink'|'erase'|'area'|'lasso'|'box'|'move'|'resize'|'rotate';start:NormalizedPoint;points:NormalizedPoint[];original:AnnotationStroke[];selected:AnnotationStroke[];handle?:ResizeHandle};
const fonts=['system-ui, sans-serif','"Malgun Gothic", sans-serif','"Batang", serif','Arial, sans-serif','Georgia, serif','Consolas, monospace'];
export function AnnotationCanvas({slideNumber,width,height,activeTool,penColor,penWidth,highlighterColor,highlighterWidth,laserColor,shapeType='rectangle',shapeFill=false,shapeWidth=3,shapeBorder=true,shapeFillColor,shapeOpacity=1,laserSize=4,laserTrailDurationMs=700,enableStylusPressure=true,readOnly=false,store,eraserMode='object',penOnly=false,enableTilt=true,eraserWidth=28,keyboardActive=true,onRequestSelectTool,onLaserChange}:Props) {
 const annotationStore=store??AnnotationStore.getInstance();
 const canvas=useRef<HTMLCanvasElement>(null),gesture=useRef<Gesture|null>(null),trail=useRef<LaserPointerState['trail']>([]);
 const [selected,setSelected]=useState<string[]>([]),[revision,setRevision]=useState(0),[editor,setEditor]=useState<Editor|null>(null);
 const input=useRef<HTMLTextAreaElement>(null);
 const backing=useRef<{canvas:HTMLCanvasElement;strokes:AnnotationStroke[];width:number;height:number}|null>(null);
 const pendingFrame=useRef(0);
 useEffect(()=>()=>cancelAnimationFrame(pendingFrame.current),[]);
 const strokes=annotationStore.getStrokesForSlide(slideNumber), selection=strokes.filter(s=>selected.includes(s.id));
 const bounds=selection.length?selection.map(s=>strokeBounds(s,width,height)).reduce((a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom),width:0,height:0,cx:0,cy:0})):null;
 const redraw=useCallback(()=>{
   const ctx=canvas.current?.getContext('2d');if(!ctx)return;
   const ratio=canvas.current!.width/width;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
   const all=annotationStore.getStrokesForSlide(slideNumber);
   if(!backing.current||backing.current.strokes!==all||backing.current.width!==canvas.current!.width||backing.current.height!==canvas.current!.height){
     const image=backing.current?.canvas||document.createElement('canvas');image.width=canvas.current!.width;image.height=canvas.current!.height;const saved=image.getContext('2d')!;saved.setTransform(ratio,0,0,ratio,0,0);StrokeEngine.renderStrokes(saved,all,width,height);backing.current={canvas:image,strokes:all,width:image.width,height:image.height};
   }
   ctx.drawImage(backing.current.canvas,0,0,width,height);
   if(['select','lasso'].includes(activeTool)) for(const s of all.filter(s=>selected.includes(s.id))) {
     const b=strokeBounds(s,width,height);ctx.strokeStyle='#2682ff';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.strokeRect(b.x-5,b.y-5,b.width+10,b.height+10);ctx.setLineDash([]);
   }
   const chosen=all.filter(s=>selected.includes(s.id));
   if(chosen.length&&['select','lasso'].includes(activeTool)) {
     const bb=chosen.map(s=>strokeBounds(s,width,height));const x=Math.min(...bb.map(b=>b.x)),y=Math.min(...bb.map(b=>b.y)),r=Math.max(...bb.map(b=>b.right)),b=Math.max(...bb.map(b=>b.bottom));
     const handles=selectionHandles({x,y,right:r,bottom:b},height);ctx.fillStyle='#fff';ctx.strokeStyle='#2682ff';ctx.lineWidth=1.5;for(const [,hx,hy] of handles.resize){ctx.fillRect(hx-4,hy-4,8,8);ctx.strokeRect(hx-4,hy-4,8,8)}ctx.beginPath();ctx.moveTo((x+r)/2,y);ctx.lineTo(handles.rotate.x,handles.rotate.y);ctx.stroke();ctx.beginPath();ctx.arc(handles.rotate.x,handles.rotate.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
   }
   const g=gesture.current;if(!g)return;
   if(g.mode==='ink') StrokeEngine.renderLiveStroke(ctx,g.points,activeTool==='shape'?'shape':activeTool==='highlighter'?'highlighter':'pen',activeTool==='highlighter'?highlighterColor:penColor,activeTool==='highlighter'?highlighterWidth:activeTool==='shape'?shapeWidth:penWidth,width,height,shapeType,shapeFill,shapeFillColor,shapeBorder,activeTool==='shape'?shapeOpacity:1);
   if(g.mode==='area'||g.mode==='lasso'||g.mode==='box') {
     ctx.strokeStyle='#2682ff';ctx.fillStyle='#2682ff22';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();
     if(g.mode==='area'||g.mode==='box') {const a=g.start,b=g.points[g.points.length-1];ctx.rect(a.x*width,a.y*height,(b.x-a.x)*width,(b.y-a.y)*height);}
     else {g.points.forEach((p,i)=>i?ctx.lineTo(p.x*width,p.y*height):ctx.moveTo(p.x*width,p.y*height));ctx.closePath();}
     ctx.fill();ctx.stroke();ctx.setLineDash([]);
   }
 },[annotationStore,slideNumber,width,height,activeTool,selected,penColor,penWidth,highlighterColor,highlighterWidth,shapeType,shapeFill,shapeWidth,shapeBorder,shapeFillColor,shapeOpacity]);
 useEffect(()=>annotationStore.subscribe(()=>{if(!annotationStore.isEditing)setRevision(n=>n+1);}),[annotationStore]);
 useEffect(()=>{redraw();},[redraw,revision]);
 useEffect(()=>{const loaded=()=>{backing.current=null;redraw()};window.addEventListener('crowshow-image-ready',loaded);return()=>window.removeEventListener('crowshow-image-ready',loaded);},[redraw]);
 const editorOpen=editor!==null,editorId=editor?.id;
 useEffect(()=>{if(editorOpen)input.current?.focus();},[editorId,editorOpen]);
 const point=(e:{clientX:number;clientY:number;pressure?:number;pointerType?:string;tiltX?:number;tiltY?:number;twist?:number}):NormalizedPoint=>{const r=canvas.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),pressure:enableStylusPressure&&e.pointerType==='pen'?Math.max(.02,Math.min(1,e.pressure??.5)):.5,tiltX:enableTilt&&e.pointerType==='pen'?e.tiltX||0:0,tiltY:enableTilt&&e.pointerType==='pen'?e.tiltY||0:0,twist:enableTilt&&e.pointerType==='pen'?e.twist||0:0,time:Date.now()};};
 const openText=(s?:AnnotationStroke,p?:NormalizedPoint)=>{
   const anchor=s?.points[0]??p!;setEditor({x:Math.max(6,Math.min(width-330,anchor.x*width)),y:Math.max(6,Math.min(height-190,anchor.y*height)),text:s?.text||'',fontSize:s?(s.fontSize||22)*width/(s.referenceWidth||width):24,fontFamily:s?.fontFamily||fonts[0],bold:s?.bold??false,italic:s?.italic??false,underline:s?.underline??false,textOutline:s?.textOutline??false,id:s?.id,color:s?.color||penColor});
 };
 const paste=useCallback(()=>{if(!copied.length)return;annotationStore.beginTransaction();const ids:string[]=[];for(const s of copied){const id=crypto.randomUUID();ids.push(id);annotationStore.addStroke({...structuredClone(s),id,slideNumber,points:s.points.map(p=>({...p,x:Math.min(.95,p.x+.025),y:Math.min(.95,p.y+.025)}))});}annotationStore.endTransaction();setSelected(ids);onRequestSelectTool?.();},[annotationStore,slideNumber,onRequestSelectTool]);
 useEffect(()=>{
   if(readOnly||!keyboardActive)return;
   const key=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
     const chosen=annotationStore.getStrokesForSlide(slideNumber).filter(s=>selected.includes(s.id));
     if(e.key==='Delete'&&chosen.length){e.preventDefault();annotationStore.removeStrokes(slideNumber,chosen);setSelected([]);}
   };
   const editable=(e:Event)=>(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]');
   const copyInk=(e:ClipboardEvent)=>{if(editable(e))return;const chosen=annotationStore.getStrokesForSlide(slideNumber).filter(s=>selected.includes(s.id));if(!chosen.length)return;copied=structuredClone(chosen);e.preventDefault();e.clipboardData?.setData('application/x-crowshow-ink',JSON.stringify(chosen));e.clipboardData?.setData('text/plain','CrowShow 필기');};
   const pasteInk=(e:ClipboardEvent)=>{if(editable(e))return;if(Array.from(e.clipboardData?.items||[]).some(item=>item.type.startsWith('image/')))return;const ink=e.clipboardData?.getData('application/x-crowshow-ink');if(ink){try{const strokes=JSON.parse(ink);const candidate={[slideNumber]:strokes};if(!validateAnnotations(candidate))return;copied=candidate[slideNumber];}catch{return;}}else if(e.clipboardData?.getData('text/plain')!=='CrowShow 필기')return;e.preventDefault();paste();};
   window.addEventListener('keydown',key);window.addEventListener('copy',copyInk);window.addEventListener('paste',pasteInk);
   return()=>{window.removeEventListener('keydown',key);window.removeEventListener('copy',copyInk);window.removeEventListener('paste',pasteInk);};
 },[annotationStore,slideNumber,selected,readOnly,keyboardActive,paste]);
 const erase=(p:NormalizedPoint)=>{
   const current=annotationStore.getStrokesForSlide(slideNumber);
   const hit=current.filter(s=>{if(s.tool==='text'||s.tool==='shape'||s.tool==='image'||s.tool==='link'){const b=strokeBounds(s,width,height);return p.x*width>=b.x-6&&p.x*width<=b.right+6&&p.y*height>=b.y-6&&p.y*height<=b.bottom+6;}return EraserEngine.hitTestStroke(p,s,width,height,eraserWidth/2);});
   annotationStore.removeStrokes(slideNumber,hit);
 };
 const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{
   if(readOnly||e.button!==0||(penOnly&&e.pointerType==='touch'))return;
   canvas.current?.focus({preventScroll:true});
   const p=point(e),all=annotationStore.getStrokesForSlide(slideNumber);
   if(activeTool==='text'){const hit=[...all].reverse().find(s=>s.tool==='text'&&inBounds(p,s));openText(hit,p);return;}
   if(activeTool==='laser'){onLaserChange({x:p.x,y:p.y,active:false,color:laserColor,trail:[]});return;}
   e.currentTarget.setPointerCapture(e.pointerId);annotationStore.beginTransaction();
   let mode:Gesture['mode']='ink',chosen=selection;let handle:ResizeHandle|undefined;
   if(activeTool==='select'||activeTool==='lasso') {
     const handles=bounds?selectionHandles(bounds,height):null;handle=handles?.resize.find(([,x,y])=>Math.hypot(p.x*width-x,p.y*height-y)<11)?.[0];
     const rotate=handles&&Math.hypot(p.x*width-handles.rotate.x,p.y*height-handles.rotate.y)<12;
     if(rotate)mode='rotate';else if(handle)mode='resize';
     else if(selection.some(s=>inBounds(p,s)))mode='move';
     else {
       const hit=[...all].reverse().find(s=>inBounds(p,s));
       chosen=hit?[hit]:[];setSelected(chosen.map(s=>s.id));mode=hit?'move':activeTool==='select'?'box':'lasso';
     }
   } else if(activeTool==='eraser')mode=eraserMode==='area'?'area':'erase';
   gesture.current={mode,start:p,points:[p],original:all,selected:chosen,handle};
   if(mode==='erase')erase(p);redraw();
 };
 function inBounds(p:NormalizedPoint,s:AnnotationStroke){const b=strokeBounds(s,width,height);return p.x*width>=b.x-7&&p.x*width<=b.right+7&&p.y*height>=b.y-7&&p.y*height<=b.bottom+7;}
 const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{
   if(readOnly||(penOnly&&e.pointerType==='touch'))return;
   const p=point(e);
   if(activeTool==='laser') {
     const now=Date.now();trail.current=[...trail.current.filter(t=>now-t.time<laserTrailDurationMs),{...p,time:now}];
     onLaserChange({x:p.x,y:p.y,active:!(e.buttons&1),color:laserColor,size:laserSize,durationMs:laserTrailDurationMs,trail:trail.current});return;
   }
   const g=gesture.current;if(!g)return;
   if(g.mode==='ink') {
     if(activeTool==='shape') {let end=p;if(e.shiftKey&&['line','dashed-line','arrow','double-arrow'].includes(shapeType)){const dx=(p.x-g.start.x)*width,dy=(p.y-g.start.y)*height,a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4),d=Math.hypot(dx,dy);end={...p,x:g.start.x+Math.cos(a)*d/width,y:g.start.y+Math.sin(a)*d/height};}if(e.shiftKey&&shapeType!=='line'&&shapeType!=='dashed-line'&&shapeType!=='arrow'&&shapeType!=='double-arrow'){const d=Math.max(Math.abs(p.x-g.start.x)*width,Math.abs(p.y-g.start.y)*height);end={...p,x:g.start.x+Math.sign(p.x-g.start.x)*d/width,y:g.start.y+Math.sign(p.y-g.start.y)*d/height};}g.points=[g.start,end];}
     else for(const sample of e.nativeEvent.getCoalescedEvents?.()||[e.nativeEvent])g.points.push(point(sample));
   } else if(g.mode==='erase')erase(p);
   else if(g.mode==='lasso'||g.mode==='area'||g.mode==='box')g.points.push(p);
   else {
     const bs=g.selected.map(s=>strokeBounds(s,width,height));const x=Math.min(...bs.map(b=>b.x))/width,y=Math.min(...bs.map(b=>b.y))/height;
     const r=Math.max(...bs.map(b=>b.right))/width,b=Math.max(...bs.map(b=>b.bottom))/height;
     const dx=p.x-g.start.x,dy=p.y-g.start.y;
     const angle=Math.atan2((p.y-(y+b)/2)*height,(p.x-(x+r)/2)*width)-Math.atan2((g.start.y-(y+b)/2)*height,(g.start.x-(x+r)/2)*width);
     const resized=g.mode==='resize'?resizeSelection(g.selected,g.handle||'se',g.start,p,width,height,e.shiftKey):[];
     const ids=new Set(g.selected.map(s=>s.id));
     annotationStore.replaceSlide(slideNumber,g.original.map(s=>!ids.has(s.id)?s:g.mode==='resize'?resized.find(item=>item.id===s.id)!:{...s,
       points:s.points.map(pt=>g.mode==='move'?{...pt,x:pt.x+dx,y:pt.y+dy}:pt),
       ...(g.mode==='rotate'?{rotation:(s.rotation||0)+angle}:{})
     }));
   }if(!pendingFrame.current)pendingFrame.current=requestAnimationFrame(()=>{pendingFrame.current=0;redraw()});
 };
 const up=(e:React.PointerEvent<HTMLCanvasElement>)=>{
   if(e.button!==0)return;const g=gesture.current;if(!g)return;
   if(g.mode==='ink'&&g.points.length) {
     if(activeTool!=='shape'||g.points.length===2)annotationStore.addStroke({id:crypto.randomUUID(),slideNumber,tool:activeTool==='shape'?'shape':activeTool==='highlighter'?'highlighter':'pen',shapeType,shapeFill,shapeFillColor,shapeBorder,color:activeTool==='highlighter'?highlighterColor:penColor,width:activeTool==='highlighter'?highlighterWidth:activeTool==='shape'?shapeWidth:penWidth,opacity:activeTool==='shape'?shapeOpacity:1,points:g.points,createdAt:Date.now(),referenceWidth:width});
   } else if(g.mode==='box') {
     setSelected(selectInRectangle(g.original,g.start,g.points[g.points.length-1],width,height).map(s=>s.id));
   } else if(g.mode==='lasso') {
     setSelected(g.original.filter(s=>s.points.some(p=>inPolygon(p,g.points))||inPolygon({x:strokeBounds(s,width,height).cx/width,y:strokeBounds(s,width,height).cy/height},g.points)).map(s=>s.id));
   } else if(g.mode==='area') {
     const end=g.points[g.points.length-1],x=Math.min(g.start.x,end.x)*width,r=Math.max(g.start.x,end.x)*width,y=Math.min(g.start.y,end.y)*height,b=Math.max(g.start.y,end.y)*height;
     annotationStore.removeStrokes(slideNumber,g.original.filter(s=>{const box=strokeBounds(s,width,height);return box.right>=x&&box.x<=r&&box.bottom>=y&&box.y<=b;}));
   }
   gesture.current=null;annotationStore.endTransaction();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);redraw();
 };
 const transformSelected=(kind:'rotate'|'flipX'|'flipY')=>{annotationStore.beginTransaction();selection.forEach(s=>annotationStore.updateStroke(slideNumber,kind==='rotate'?{...s,rotation:(s.rotation||0)+Math.PI/2}:{...s,[kind]:!s[kind]}));annotationStore.endTransaction();};
 const saveText=()=>{
   if(!editor)return;const previous=strokes.find(s=>s.id===editor.id);
   if(editor.text.trim()) {
     const next:AnnotationStroke={...(previous||{}),id:editor.id||crypto.randomUUID(),slideNumber,tool:'text',color:editor.color,width:penWidth,opacity:1,points:previous?.points||[{x:editor.x/width,y:editor.y/height}],text:editor.text,fontSize:editor.fontSize,fontFamily:editor.fontFamily,bold:editor.bold,italic:editor.italic,underline:editor.underline,textOutline:editor.textOutline,referenceWidth:width,createdAt:previous?.createdAt||Date.now()};
     if(previous)annotationStore.updateStroke(slideNumber,next);else annotationStore.addStroke(next);setSelected([next.id]);
   }setEditor(null);onRequestSelectTool?.();
 };
 return <div className="annotation-layer" style={{position:'absolute',inset:0,width,height,pointerEvents:readOnly?'none':undefined}}>
   <canvas tabIndex={0} ref={canvas} width={Math.floor(width*getRenderDensity(width,height,window.devicePixelRatio))} height={Math.floor(height*getRenderDensity(width,height,window.devicePixelRatio))} style={{position:'absolute',inset:0,width,height,touchAction:'none',zIndex:10,cursor:activeTool==='text'?'text':activeTool==='select'?'default':'crosshair'}}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{const g=gesture.current;if(g)annotationStore.replaceSlide(slideNumber,g.original);gesture.current=null;annotationStore.endTransaction();redraw();}}
    onPointerLeave={()=>{if(activeTool==='laser')onLaserChange({x:0,y:0,active:false,color:laserColor,trail:[]});}}
    onDoubleClick={e=>{if(readOnly||e.button!==0)return;const p=point(e),s=[...strokes].reverse().find(s=>(s.tool==='text'||s.tool==='link')&&inBounds(p,s));if(s?.tool==='link'&&s.url)void openExternalLink(s.url);else if(s)openText(s);}}/>
   {!readOnly&&selection.length>0&&['select','lasso'].includes(activeTool)&&!editor&&<div className="selection-actions" style={{left:Math.max(5,Math.min(width-440,bounds!.x)),top:bounds!.y>100?bounds!.y-92:Math.min(height-75,bounds!.bottom+38)}}>
    <button title="복사" aria-label="선택 객체 복사" onClick={()=>{copied=structuredClone(selection);}}><Copy size={16}/></button><button title="붙여넣기" aria-label="선택 객체 붙여넣기" onClick={paste}><ClipboardPaste size={16}/></button>
    <input aria-label="선택 객체 색상" type="color" value={selection[0].color} onChange={e=>{annotationStore.beginTransaction();selection.forEach(s=>annotationStore.updateStroke(slideNumber,{...s,color:e.target.value}));annotationStore.endTransaction();}}/>
    {selection.length===1&&selection[0].tool==='link'&&<button onClick={()=>void openExternalLink(selection[0].url||'')}>링크 열기</button>}
    {selection.length===1&&selection[0].tool==='text'&&<button onClick={()=>openText(selection[0])}>문장 수정</button>}
    <button title="90도 회전 · 위 핸들 드래그로 자유 회전" aria-label="선택 객체 회전" onClick={()=>transformSelected('rotate')}><RotateCw size={16}/></button><button title="좌우 반전" aria-label="선택 객체 좌우 반전" onClick={()=>transformSelected('flipX')}><FlipHorizontal2 size={16}/></button><button title="상하 반전" aria-label="선택 객체 상하 반전" onClick={()=>transformSelected('flipY')}><FlipVertical2 size={16}/></button>
    <label className="selection-angle" title="회전 각도 직접 입력"><input type="number" aria-label="회전 각도" min={-360} max={360} step={1} value={Math.round((selection[0].rotation||0)*180/Math.PI)%360} onChange={e=>{const degrees=Number(e.target.value);if(!Number.isFinite(degrees))return;annotationStore.beginTransaction();selection.forEach(s=>annotationStore.updateStroke(slideNumber,{...s,rotation:degrees*Math.PI/180}));annotationStore.endTransaction();}}/>°</label>
    <button title="삭제" aria-label="선택 객체 삭제" onClick={()=>{annotationStore.removeStrokes(slideNumber,selection);setSelected([]);}}><Trash2 size={16}/></button>
   </div>}
   {editor&&<div className="text-editor-v13" style={{left:editor.x,top:editor.y}} onPointerDown={e=>e.stopPropagation()}>
     <div className="text-format"><select aria-label="텍스트 글꼴" value={editor.fontFamily} onChange={e=>setEditor({...editor,fontFamily:e.target.value})}>{fonts.map((font,i)=><option key={font} value={font}>{['기본 고딕','맑은 고딕','바탕','Arial','Georgia','Consolas'][i]}</option>)}</select>
     <input type="number" aria-label="텍스트 크기" min={8} max={160} value={Math.round(editor.fontSize)} onChange={e=>setEditor({...editor,fontSize:Math.max(8,Math.min(160,Number(e.target.value)))})}/>
     <button aria-label="굵게" aria-pressed={editor.bold} onClick={()=>setEditor({...editor,bold:!editor.bold})} title="볼드"><Bold size={14}/></button><button aria-label="기울임" aria-pressed={editor.italic} onClick={()=>setEditor({...editor,italic:!editor.italic})} title="이탤릭"><Italic size={14}/></button><button aria-label="밑줄" aria-pressed={editor.underline} onClick={()=>setEditor({...editor,underline:!editor.underline})} title="언더라인"><Underline size={14}/></button><button aria-label="텍스트 테두리" title="텍스트 테두리" aria-pressed={editor.textOutline} onClick={()=>setEditor({...editor,textOutline:!editor.textOutline})}><Square size={14}/></button></div>
     <textarea ref={input} aria-label="텍스트 내용" value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveText();}if(e.key==='Escape')setEditor(null);}} style={{fontFamily:editor.fontFamily,fontWeight:editor.bold?700:400,fontStyle:editor.italic?'italic':'normal',textDecoration:editor.underline?'underline':'none',color:editor.color,WebkitTextStroke:editor.textOutline?`0.7px ${editor.color}`:undefined,WebkitTextFillColor:editor.textOutline?'transparent':undefined}}/>
     <div><button onClick={saveText}>완료</button><button onClick={()=>setEditor(null)}>취소</button><small>Shift+Enter 줄바꿈</small></div>
   </div>}
 </div>;
}
