import type { CSSProperties } from 'react';
import type { PaperType } from '../types/notebook';
export function noteLayout(viewportWidth:number,viewportHeight:number,spread:1|2,zoom:number,mode='custom') {
 const widthFit=Math.max(100,(viewportWidth-56-(spread-1)*24)/spread);
 const pageFit=Math.min(widthFit,Math.max(100,viewportHeight-56)*800/1131);
 const scale=mode==='fit-page'?pageFit/widthFit:mode==='fit-width'?1:zoom;
 const width=widthFit*scale;
 return {width,height:width*1131/800,zoom:scale};
}
export function paperStyle(paper:PaperType,color:string,width:number):CSSProperties {
 const step=28*width/800;
 const patterns:Partial<Record<PaperType,string>>={lined:'linear-gradient(transparent calc(100% - 1px),#b9c8d9 1px)',grid:'linear-gradient(to right,#b9c8d9 1px,transparent 1px),linear-gradient(to bottom,#b9c8d9 1px,transparent 1px)',dots:'radial-gradient(#9eafc2 1px,transparent 1px)',cornell:'linear-gradient(transparent calc(100% - 1px),#b9c8d9 1px)'};
 return {backgroundColor:color,backgroundImage:patterns[paper]||'none',backgroundSize:`${step}px ${step}px`,backgroundRepeat:'repeat'};
}
export function paintPaper(ctx:CanvasRenderingContext2D,paper:PaperType,color:string,w:number,h:number) {
 ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
 if(paper==='blank')return;
 if(paper==='spring'){const step=32*w/800;ctx.lineWidth=Math.max(1,w/800);for(let y=step/2;y<h;y+=step){ctx.strokeStyle='#526075';ctx.fillStyle='#dce1e7';ctx.beginPath();ctx.ellipse(w*.024,y,w*.019,step*.25,0,0,Math.PI*2);ctx.fill();ctx.stroke();}return;}
 ctx.strokeStyle='#b9c8d9';ctx.fillStyle='#9eafc2';ctx.lineWidth=Math.max(1,w/800);const step=28*w/800;
 if(paper==='dots'){for(let y=step;y<h;y+=step)for(let x=step;x<w;x+=step){ctx.beginPath();ctx.arc(x,y,1.5*w/800,0,Math.PI*2);ctx.fill();}return;}
 ctx.beginPath();for(let y=step;y<h;y+=step){ctx.moveTo(0,y);ctx.lineTo(w,y);}if(paper==='grid')for(let x=step;x<w;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,h);}if(paper==='cornell'){ctx.moveTo(w*.25,0);ctx.lineTo(w*.25,h);ctx.moveTo(0,h*.8);ctx.lineTo(w,h*.8);}ctx.stroke();
}
