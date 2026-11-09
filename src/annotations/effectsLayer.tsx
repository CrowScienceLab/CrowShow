import { useEffect, useRef } from 'react';
import type { LaserPointerState } from '../types/annotation';
import { getRenderDensity } from '../pdf/pdfViewport';
import type { ScreenCurtain } from '../types/presentation';
import { renderLaser } from './laserRenderer';
interface Props {width:number;height:number;laserState:LaserPointerState;screenCurtain:ScreenCurtain;}
export function EffectsLayer({width,height,laserState,screenCurtain}:Props) {
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;let id=0;const render=()=>{const ratio=Math.min(1,getRenderDensity(width,height,1));ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);if(screenCurtain!=='none'){ctx.fillStyle=screenCurtain==='black'?'#000':'#fff';ctx.fillRect(0,0,width,height);return;}if(renderLaser(ctx,laserState,width,height))id=requestAnimationFrame(render);};render();return()=>cancelAnimationFrame(id);},[width,height,laserState,screenCurtain]);
 const ratio=Math.min(1,getRenderDensity(width,height,1));
 return <canvas ref={canvas} width={Math.floor(width*ratio)} height={Math.floor(height*ratio)} style={{position:'absolute',inset:0,width,height,pointerEvents:'none',zIndex:20}}/>;
}
