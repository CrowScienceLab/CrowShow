import type { CrowShowProjectData, SlideAnnotationMap } from '../types/annotation';
export function validateAnnotations(value:unknown):value is SlideAnnotationMap {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  return Object.entries(value).every(([page,strokes])=>Number.isInteger(Number(page))&&Number(page)>0&&Array.isArray(strokes)&&strokes.every(s=>
    s&&typeof s.id==='string'&&['pen','highlighter','shape','text','image','link'].includes(s.tool)&&typeof s.color==='string'&&Number.isFinite(s.width)&&s.width>0&&
    Array.isArray(s.points)&&s.points.length>0&&s.points.every((p:{x:number;y:number})=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))&&
    (s.referenceWidth===undefined||(Number.isFinite(s.referenceWidth)&&s.referenceWidth>0))&&
    (s.fontSize===undefined||(Number.isFinite(s.fontSize)&&s.fontSize>0))&&
    (s.rotation===undefined||Number.isFinite(s.rotation))&&
    (s.tool!=='image'||(typeof s.imageData==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(s.imageData)))&&
    (s.tool!=='link'||(typeof s.url==='string'&&/^https?:\/\//i.test(s.url)))));
}
export function readProject(text:string):CrowShowProjectData {
  const value=JSON.parse(text);
  if(!value||typeof value.documentName!=='string'||!Number.isInteger(value.totalSlides)||value.totalSlides<1||!validateAnnotations(value.annotations))throw new Error('프로젝트 필기 형식이 올바르지 않습니다.');
  if(value.pdfBase64!==undefined&&typeof value.pdfBase64!=='string')throw new Error('PDF 데이터 형식이 올바르지 않습니다.');
  if(value.notebook){
    const validPage=(p:{id:string;title:string;paper:string;color:string;backgroundImage?:string})=>p&&typeof p.id==='string'&&typeof p.title==='string'&&['blank','lined','grid','dots','cornell','spring'].includes(p.paper)&&/^#[0-9a-f]{6}$/i.test(p.color)&&(p.backgroundImage===undefined||/^data:image\/(png|jpeg|webp);base64,/.test(p.backgroundImage));
    const validBook=(b:{id?:string;title?:string;pages:unknown[];annotations:unknown;view?:{spread:number;zoom:number;mode?:string}})=>b&&Array.isArray(b.pages)&&b.pages.length>0&&b.pages.every(p=>validPage(p as Parameters<typeof validPage>[0]))&&validateAnnotations(b.annotations)&&(!b.view||([1,2].includes(b.view.spread)&&Number.isFinite(b.view.zoom)&&b.view.zoom>=.1&&b.view.zoom<=5&&(!b.view.mode||['fit-width','fit-page','custom'].includes(b.view.mode))));
    if(!validBook(value.notebook)||(value.notebook.books&&(!Array.isArray(value.notebook.books)||!value.notebook.books.length||!value.notebook.books.every((b:Parameters<typeof validBook>[0])=>typeof b.id==='string'&&typeof b.title==='string'&&validBook(b)))))throw new Error('Notebook 형식이 올바르지 않습니다.');
  }
  return value;
}
