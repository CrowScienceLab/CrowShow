import type { AnnotationStroke, NormalizedPoint } from '../types/annotation';
export function strokeBounds(s:AnnotationStroke,w:number,h:number) {
  const xs=s.points.map(p=>p.x*w),ys=s.points.map(p=>p.y*h);
  let x=Math.min(...xs),y=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
  if((s.tool==='text'||s.tool==='link')) {
    const size=(s.fontSize||22)*w/(s.referenceWidth||w);
    right=x+Math.max(...(s.text||'').split('\n').map(l=>Array.from(l).reduce((n,c)=>n+((c.codePointAt(0)||0)<256?0.65:1),0)),1)*size;
    bottom=y+(s.text||'').split('\n').length*size*1.35;
  }
  const cx=(x+right)/2,cy=(y+bottom)/2;
  if(s.rotation) {
    const corners=[[x,y],[right,y],[x,bottom],[right,bottom]].map(([px,py])=>{
      const ox=cx,oy=cy;
      return [ox+(px-ox)*Math.cos(s.rotation!)-(py-oy)*Math.sin(s.rotation!),oy+(px-ox)*Math.sin(s.rotation!)+(py-oy)*Math.cos(s.rotation!)];
    });
    x=Math.min(...corners.map(c=>c[0]));right=Math.max(...corners.map(c=>c[0]));y=Math.min(...corners.map(c=>c[1]));bottom=Math.max(...corners.map(c=>c[1]));
  }
  return {x,y,right,bottom,width:right-x,height:bottom-y,cx:(x+right)/2,cy:(y+bottom)/2};
}
export function inPolygon(p:NormalizedPoint,polygon:NormalizedPoint[]) {
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }return inside;
}

export function selectInRectangle(strokes:AnnotationStroke[],a:NormalizedPoint,b:NormalizedPoint,w:number,h:number) {
 const x=Math.min(a.x,b.x)*w,right=Math.max(a.x,b.x)*w,y=Math.min(a.y,b.y)*h,bottom=Math.max(a.y,b.y)*h;
 return strokes.filter(s=>{const box=strokeBounds(s,w,h);return box.right>=x&&box.x<=right&&box.bottom>=y&&box.y<=bottom;});
}
export type ResizeHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export function selectionHandles(b:{x:number;y:number;right:number;bottom:number},height:number) {
 const cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
 return {resize:[['nw',b.x,b.y],['n',cx,b.y],['ne',b.right,b.y],['e',b.right,cy],['se',b.right,b.bottom],['s',cx,b.bottom],['sw',b.x,b.bottom],['w',b.x,cy]] as [ResizeHandle,number,number][],rotate:{x:cx,y:Math.max(12,Math.min(height-12,b.y-26))}};
}
export function resizeSelection(strokes:AnnotationStroke[],handle:ResizeHandle,start:NormalizedPoint,end:NormalizedPoint,w:number,h:number,uniform=false) {
 const boxes=strokes.map(s=>strokeBounds(s,w,h));const x=Math.min(...boxes.map(b=>b.x))/w,y=Math.min(...boxes.map(b=>b.y))/h,right=Math.max(...boxes.map(b=>b.right))/w,bottom=Math.max(...boxes.map(b=>b.bottom))/h;
 const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s');
 const anchorX=west?right:x,anchorY=north?bottom:y;
 let sx=west||east?Math.max(.02,Math.min(20,1+(end.x-start.x)/(Math.max(.001,right-x)*(west?-1:1)))):1;
 let sy=north||south?Math.max(.02,Math.min(20,1+(end.y-start.y)/(Math.max(.001,bottom-y)*(north?-1:1)))):1;
 if(uniform&&(west||east)&&(north||south))sx=sy=Math.max(sx,sy);
 return strokes.map(s=>({...s,points:s.points.map(p=>({...p,x:anchorX+(p.x-anchorX)*sx,y:anchorY+(p.y-anchorY)*sy})),...(s.fontSize?{fontSize:s.fontSize*Math.sqrt(sx*sy)}:{})}));
}
