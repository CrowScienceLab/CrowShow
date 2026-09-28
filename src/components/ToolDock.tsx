import React, { useState } from 'react';
import type { ShapeType, ToolType } from '../types/annotation';
import { Dot, Eraser, Highlighter, MousePointer, Palette, PenTool, Search, Shapes, Type } from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';
import { ShapePickerPopover } from './ShapePickerPopover';

interface ToolDockProps { activeTool: ToolType; penColor: string; penWidth: number; highlighterColor: string; highlighterWidth: number; laserColor: string; shapeType: ShapeType; shapeFill: boolean; onSelectTool: (tool: ToolType) => void; onPenColorChange: (color: string) => void; onPenWidthChange: (width: number) => void; onHighlighterColorChange: (color: string) => void; onHighlighterWidthChange: (width: number) => void; onLaserColorChange: (color: string) => void; onShapeTypeChange: (shape: ShapeType) => void; onShapeFillChange: (fill: boolean) => void; }

export const ToolDock: React.FC<ToolDockProps> = (props) => {
  const [colors, setColors] = useState(false); const [shapes, setShapes] = useState(false);
  const choose = (tool: ToolType) => { props.onSelectTool(tool); if (tool !== 'shape') setShapes(false); };
  const button = (tool: ToolType, icon: React.ReactNode, title: string) => <button className={`status-tool ${props.activeTool === tool ? 'active' : ''}`} onClick={() => choose(tool)} title={title}>{icon}</button>;
  return <div className="bottom-tool-dock" aria-label="도구 모음">
    {button('select', <MousePointer size={16} />, '선택 (V)')}
    {button('pen', <><PenTool size={16} /><i style={{ background: props.penColor }} /></>, '펜 (P)')}
    {button('highlighter', <><Highlighter size={16} /><i style={{ background: props.highlighterColor }} /></>, '형광펜 (H)')}
    {button('text', <Type size={16} />, '텍스트 (T)')}
    <div className="popover-anchor"><button className={`status-tool ${props.activeTool === 'shape' ? 'active' : ''}`} onClick={() => { choose('shape'); setShapes(!shapes); setColors(false); }} title="도형"><Shapes size={16} /></button>{shapes && <ShapePickerPopover currentShape={props.shapeType} isFilled={props.shapeFill} placement="top" onSelectShape={(s) => { props.onShapeTypeChange(s); props.onSelectTool('shape'); }} onToggleFill={props.onShapeFillChange} onClose={() => setShapes(false)} />}</div>
    {button('eraser', <Eraser size={16} />, '지우개 (E)')}{button('laser', <Dot size={23} style={{ color: props.laserColor }} />, '레이저 (L)')}{button('spotlight', <Search size={16} />, '스포트라이트 (S)')}
    <div className="popover-anchor"><button className={`status-tool ${colors ? 'active' : ''}`} onClick={() => { setColors(!colors); setShapes(false); }} title="색상과 굵기"><Palette size={16} /></button>{colors && <ColorPickerPopover penColor={props.penColor} penWidth={props.penWidth} highlighterColor={props.highlighterColor} highlighterWidth={props.highlighterWidth} laserColor={props.laserColor} initialTab={props.activeTool === 'highlighter' ? 'highlighter' : props.activeTool === 'laser' ? 'laser' : 'pen'} onPenColorChange={props.onPenColorChange} onPenWidthChange={props.onPenWidthChange} onHighlighterColorChange={props.onHighlighterColorChange} onHighlighterWidthChange={props.onHighlighterWidthChange} onLaserColorChange={props.onLaserColorChange} placement="top" onClose={() => setColors(false)} />}</div>
  </div>;
};
