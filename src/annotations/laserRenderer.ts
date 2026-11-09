import type { LaserPointerState } from '../types/annotation';
export function renderLaser(ctx:CanvasRenderingContext2D,state:LaserPointerState,w:number,h:number,now=Date.now()) {
 const duration=state.durationMs??700,size=state.size??4,color=state.color||'#ef4444';let lingering=false;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(let i=1;i<state.trail.length;i++){const a=state.trail[i-1],b=state.trail[i],alpha=Math.max(0,1-(now-b.time)/duration);if(!alpha)continue;lingering=true;ctx.globalAlpha=alpha*.65;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,size*.55*alpha);ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.stroke();}
 if(state.active){const x=state.x*w,y=state.y*h;ctx.globalAlpha=1;ctx.shadowColor=color;ctx.shadowBlur=size*2;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(1,size*.55),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
 ctx.restore();return state.active||lingering;
}
