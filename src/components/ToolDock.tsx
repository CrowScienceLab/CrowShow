import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Highlighter, MousePointer, Palette, PenTool, Lasso, Shapes, Type, X, Square, Circle, Triangle, Minus, MoveUpRight, Star, Heart, FileX2, Files, SlidersHorizontal, PaintBucket, SquareDashed, PenLine, Hand, Smile, MessageSquare, Flower2, StickyNote } from 'lucide-react';
import { NumericDial } from './NumericDial';
import type { ShapeType, ToolType, EraserMode } from '../types/annotation';
export interface ToolDockProps {
  activeTool:ToolType; penColor:string; penWidth:number; highlighterColor:string; highlighterWidth:number; laserColor:string; shapeType:ShapeType; shapeFill:boolean;
  shapeWidth?:number;shapeBorder?:boolean;shapeFillColor?:string;shapeOpacity?:number;laserSize?:number;laserTrailDurationMs?:number;
  onShapeWidthChange?:(value:number)=>void;onShapeBorderChange?:(value:boolean)=>void;onShapeFillColorChange?:(value:string)=>void;onShapeOpacityChange?:(value:number)=>void;onLaserSizeChange?:(value:number)=>void;onLaserDurationChange?:(value:number)=>void;
  eraserMode?:EraserMode; eraserWidth?:number; enableStylusPressure?:boolean; enableTilt?:boolean;
  onSelectTool:(tool:ToolType)=>void; onPenColorChange:(color:string)=>void; onPenWidthChange:(width:number)=>void;
  onHighlighterColorChange:(color:string)=>void; onHighlighterWidthChange:(width:number)=>void; onLaserColorChange:(color:string)=>void;
  onShapeTypeChange:(shape:ShapeType)=>void; onShapeFillChange:(fill:boolean)=>void;
  onEraserModeChange?:(mode:EraserMode)=>void; onEraserWidthChange?:(width:number)=>void; onClearPage?:()=>void; onClearDocument?:()=>void;
  onPressureChange?:(enabled:boolean)=>void; onTiltChange?:(enabled:boolean)=>void;
}
const colors=['#111827','#475569','#ffffff','#ef4444','#f97316','#facc15','#22c55e','#06b6d4','#2563eb','#8b5cf6','#e879f9','#be123c'];
const shapes:{type:ShapeType;label:string;Icon:typeof Square}[]=[{type:'rectangle',label:'사각형',Icon:Square},{type:'circle',label:'원',Icon:Circle},{type:'triangle',label:'삼각형',Icon:Triangle},{type:'line',label:'직선',Icon:Minus},{type:'dashed-line',label:'점선',Icon:Minus},{type:'arrow',label:'화살표',Icon:MoveUpRight},{type:'star',label:'별',Icon:Star},{type:'heart',label:'하트',Icon:Heart},{type:'smile',label:'스마일',Icon:Smile},{type:'speech-bubble',label:'말풍선',Icon:MessageSquare},{type:'cosmos',label:'코스모스',Icon:Flower2},{type:'sticky-note',label:'포스트잇',Icon:StickyNote}];
type Panel='pen'|'highlighter'|'eraser'|'shape'|'palette'|'width'|'laser';
export function LaserIcon({size=19}:{size?:number}) {return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L18 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M5 19L15 9" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round"/><circle cx="19" cy="5" r="2.4" fill="#ef4444"/></svg>;}
export function ToolDock(p:ToolDockProps) {
  const root=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null);
  const [panel,setPanel]=useState<Panel|null>(null),[position,setPosition]=useState({left:0,bottom:0});
  const close=()=>setPanel(null);
  useEffect(()=>{
    if(!panel)return;
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))close();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',key,true);window.addEventListener('resize',close);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',close);};
  },[panel]);
  const open=(name:Panel,event:React.MouseEvent<HTMLButtonElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    setPosition({left:Math.max(8,Math.min(window.innerWidth-212,rect.left+rect.width/2-100)),bottom:window.innerHeight-rect.top+7});
    setPanel(current=>current===name?null:name);
  };
  const choose=(tool:ToolType,name:Panel|null,event:React.MouseEvent<HTMLButtonElement>)=>{p.onSelectTool(tool);if(name)open(name,event);else close();};
  const currentColor=p.activeTool==='highlighter'?p.highlighterColor:p.activeTool==='laser'?p.laserColor:p.penColor;
  const color=panel==='highlighter'?p.highlighterColor:panel==='pen'?p.penColor:panel==='laser'?p.laserColor:currentColor;
  const setColor=(value:string)=>{if(panel==='laser')p.onLaserColorChange(value);else if(panel==='highlighter'||(panel!=='pen'&&p.activeTool==='highlighter'))p.onHighlighterColorChange(value);else if(panel!=='pen'&&p.activeTool==='laser')p.onLaserColorChange(value);else p.onPenColorChange(value);};
  const marker=panel==='highlighter'||(panel!=='pen'&&p.activeTool==='highlighter');
  const currentWidth=marker?p.highlighterWidth:p.penWidth;
  const setWidth=(value:number)=>marker?p.onHighlighterWidthChange(value):p.onPenWidthChange(value);
  const button=(tool:ToolType,Icon:React.ComponentType<{size?:number}>,label:string,name:Panel|null=null)=><button type="button" className={`status-tool ${p.activeTool===tool?'active':''}`} aria-label={label} title={label} aria-pressed={p.activeTool===tool} aria-expanded={name?panel===name:undefined} onClick={e=>choose(tool,name,e)}><Icon size={19}/>{(tool==='pen'||tool==='highlighter')&&<i style={{background:tool==='pen'?p.penColor:p.highlighterColor}}/>}</button>;
  return <div ref={root} className="bottom-tool-dock unified-tools" role="toolbar" aria-label="공통 필기 도구">
    {button('select',MousePointer,'선택 (V)')}{button('lasso',Lasso,'올가미 (Q)')}{button('pen',PenTool,'펜 (P)','pen')}{button('highlighter',Highlighter,'형광펜 (H)','highlighter')}{button('text',Type,'텍스트 (T)')}{button('shape',Shapes,'도형','shape')}{button('eraser',Eraser,'지우개 (E)','eraser')}{button('laser',LaserIcon,'레이저 포인터 (L)','laser')}
    <span className="tool-divider"/>
    <button className="status-tool" aria-label="색상표" title="색상표" aria-expanded={panel==='palette'} onClick={e=>open('palette',e)}><Palette size={19}/><i style={{background:currentColor}}/></button>
    <button className="status-tool" aria-label="두께" title="두께" aria-expanded={panel==='width'} onClick={e=>open('width',e)}><SlidersHorizontal size={19}/></button>
    {panel&&createPortal(<div ref={popup} className="tool-popup" role="dialog" aria-label={`${{pen:'펜',highlighter:'형광펜',eraser:'지우개',shape:'도형',palette:'색상표',width:'두께',laser:'레이저 포인터'}[panel]} 설정`} style={{left:position.left,bottom:position.bottom}}>
      <div className="popup-topline"><span className="popup-tool-indicator">{panel==='eraser'?<Eraser size={15}/>:panel==='shape'?<Shapes size={15}/>:<PenLine size={15}/>}</span><button className="popup-icon close" aria-label="서브 메뉴 닫기" title="닫기 (Esc)" onClick={close}><X size={15}/></button></div>
      {['pen','highlighter','palette','laser'].includes(panel)&&<div className="compact-colors">{colors.map(c=><button key={c} className={`color-chip ${color===c?'chosen':''}`} aria-label={`색상 ${c}`} title={c} aria-pressed={color===c} style={{background:c}} onClick={()=>setColor(c)}/>)}<label className="custom-color" title="사용자 색상"><Palette size={15}/><input aria-label="사용자 색상" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label></div>}
      {['pen','highlighter','width'].includes(panel)&&<NumericDial label={marker?'형광펜 크기':'펜 크기'} value={currentWidth} min={1} max={marker?160:96} color={color} onChange={setWidth}/>}
      {panel==='laser'&&<><NumericDial label="레이저 크기" value={p.laserSize||4} min={1} max={20} color={p.laserColor} onChange={value=>p.onLaserSizeChange?.(value)}/><div className="laser-duration"><NumericDial label="레이저 잔상 시간" value={p.laserTrailDurationMs??700} min={100} max={5000} step={100} unit="ms" onChange={value=>p.onLaserDurationChange?.(value)}/></div></>}
      {(panel==='pen'||panel==='highlighter')&&<div className="compact-options"><button className="popup-icon" title="필압 반영" aria-label="필압 반영" aria-pressed={p.enableStylusPressure!==false} onClick={()=>p.onPressureChange?.(p.enableStylusPressure===false)}><PenLine size={16}/></button><button className="popup-icon" title="기울임 반영" aria-label="기울임 반영" aria-pressed={p.enableTilt!==false} onClick={()=>p.onTiltChange?.(p.enableTilt===false)}><Hand size={16}/></button></div>}
      {panel==='eraser'&&<div className="eraser-icons"><button className="popup-icon" title="객체 지우기" aria-label="객체 지우기" aria-pressed={p.eraserMode!=='area'} onClick={()=>p.onEraserModeChange?.('object')}><Eraser size={19}/></button><button className="popup-icon" title="영역 지우기" aria-label="영역 지우기" aria-pressed={p.eraserMode==='area'} onClick={()=>p.onEraserModeChange?.('area')}><SquareDashed size={19}/></button><span className="tool-divider"/><button className="popup-icon" title="페이지 필기 지우기" aria-label="페이지 필기 지우기" onClick={()=>{p.onClearPage?.();close();}}><FileX2 size={19}/></button><button className="popup-icon danger" title="문서 전체 필기 지우기" aria-label="문서 전체 필기 지우기" onClick={()=>{p.onClearDocument?.();close();}}><Files size={19}/></button></div>}
      {panel==='shape'&&<><div className="compact-shapes">{shapes.map(({type,label,Icon})=><button key={type} className={`popup-icon ${type==='dashed-line'?'dashed-icon':''}`} title={label} aria-label={label} aria-pressed={p.shapeType===type} onClick={()=>{p.onShapeTypeChange(type);close();}}><Icon size={18}/></button>)}</div><div className="shape-style-row"><button className="popup-icon" title="도형 테두리" aria-label="도형 테두리" aria-pressed={p.shapeBorder!==false} onClick={()=>p.onShapeBorderChange?.(p.shapeBorder===false)}><Square size={16}/></button><input type="color" aria-label="도형 테두리 색상" title="테두리 색상" value={p.penColor} onChange={e=>p.onPenColorChange(e.target.value)}/><NumericDial label="도형 테두리 두께" value={p.shapeWidth??3} min={1} max={40} onChange={value=>p.onShapeWidthChange?.(value)}/></div><div className="shape-style-row"><button className="popup-icon" title="도형 채우기" aria-label="도형 채우기" aria-pressed={p.shapeFill} onClick={()=>p.onShapeFillChange(!p.shapeFill)}><PaintBucket size={16}/></button><input type="color" aria-label="도형 채우기 색상" title="채우기 색상" value={p.shapeFillColor||p.penColor} onChange={e=>{p.onShapeFillColorChange?.(e.target.value);p.onShapeFillChange(true);}}/><NumericDial label="도형 투명도" value={Math.round((1-(p.shapeOpacity??1))*100)} min={0} max={100} unit="%" onChange={value=>p.onShapeOpacityChange?.(1-value/100)}/></div></>}
    </div>,document.querySelector('.app-container.presentation-fullscreen')||document.fullscreenElement||document.body)}
  </div>;
}
