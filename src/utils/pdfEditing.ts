import type { SlideAnnotationMap, AnnotationStroke } from '../types/annotation';
export type PageEdit = { type:'delete'|'duplicate'|'rotate'|'blank'; page:number } | {type:'move';page:number;to:number} | {type:'insert';page:number;bytes:Uint8Array};
export async function editPdf(bytes:Uint8Array, edit:PageEdit) {
  const {PDFDocument,degrees}=await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  const count = pdf.getPageCount();
  const mapping: (number|null)[] = Array.from({length:count},(_,i)=>i+1);
  const index = edit.page-1;
  if (index<0 || index>=count) throw new Error('잘못된 페이지입니다.');
  const originalPage=pdf.getPage(index),size=originalPage.getSize();
  const aspect=originalPage.getRotation().angle%180===0?size.width/size.height:size.height/size.width;
  if(edit.type==='delete') {
    if(count===1) throw new Error('마지막 페이지는 삭제할 수 없습니다.');
    pdf.removePage(index); mapping.splice(index,1);
  } else if(edit.type==='duplicate') {
    const [page] = await pdf.copyPages(pdf,[index]);pdf.insertPage(index+1,page);mapping.splice(index+1,0,edit.page);
  } else if(edit.type==='rotate') {
    const page=pdf.getPage(index);page.setRotation(degrees((page.getRotation().angle+90)%360));
  } else if(edit.type==='move') {
    const to=Math.max(0,Math.min(count-1,edit.to-1));
    const [page]=await pdf.copyPages(pdf,[index]);pdf.removePage(index);pdf.insertPage(to,page);
    const [old]=mapping.splice(index,1);mapping.splice(to,0,old);
  } else if(edit.type==='blank') {
    const page=pdf.getPage(index); const size=page.getSize(); const rotated=page.getRotation().angle%180!==0;
    pdf.insertPage(index+1,rotated?[size.height,size.width]:[size.width,size.height]);mapping.splice(index+1,0,null);
  } else if(edit.type==='insert') {
    const source=await PDFDocument.load(edit.bytes);
    const pages=await pdf.copyPages(source,source.getPageIndices());
    pages.forEach((page,i)=>pdf.insertPage(index+1+i,page));mapping.splice(index+1,0,...pages.map(()=>null));
  }
  return {bytes:new Uint8Array(await pdf.save()),mapping,aspect};
}

export async function fitPdfToA4(bytes: Uint8Array): Promise<Uint8Array> {
  const {
    PDFContentStream, PDFDocument, clip, concatTransformationMatrix, endPath,
    popGraphicsState, pushGraphicsState, rectangle,
  } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  let changed = false;
  for (const page of pdf.getPages()) {
    const box = page.getCropBox();
    const [width, height] = box.width > box.height ? [841, 595] : [595, 841];
    if (box.width === width && box.height === height) continue;
    const scale = Math.min(width / box.width, height / box.height);
    const rotation = (page.getRotation().angle + 360) % 360;
    // Place the original visible rectangle at the top left, including rotated pages.
    const x = box.x * scale + (rotation >= 180 ? box.width * scale - width : 0);
    const y = box.y * scale + (rotation === 0 || rotation === 270 ? box.height * scale - height : 0);
    page.node.normalize();
    const start = PDFContentStream.of(pdf.context.obj({}), [
      pushGraphicsState(),
      concatTransformationMatrix(scale, 0, 0, scale, 0, 0),
      rectangle(box.x, box.y, box.width, box.height),
      clip(),
      endPath(),
    ]);
    const end = PDFContentStream.of(pdf.context.obj({}), [popGraphicsState()]);
    page.node.wrapContentStreams(pdf.context.register(start), pdf.context.register(end));
    page.scaleAnnotations(scale, scale);
    page.setMediaBox(x, y, width, height);
    page.setCropBox(x, y, width, height);
    page.setBleedBox(x, y, width, height);
    page.setTrimBox(x, y, width, height);
    page.setArtBox(x, y, width, height);
    changed = true;
  }
  return changed ? new Uint8Array(await pdf.save()) : bytes;
}

export function remapPages<T>(data:Record<number,T>,mapping:(number|null)[]):Record<number,T> {
  return Object.fromEntries(mapping.flatMap((old,i)=>old!==null&&data[old]!==undefined?[[i+1,structuredClone(data[old])]]:[]));
}
export function remapAnnotations(data:SlideAnnotationMap,mapping:(number|null)[],rotatedPage?:number,aspect=1):SlideAnnotationMap {
  const result=remapPages(data,mapping);
  for(const [page,strokes] of Object.entries(result)) result[Number(page)]=strokes.map(s=>({ ...s, id:crypto.randomUUID(),slideNumber:Number(page),
    ...(rotatedPage===Number(page)?rotateStroke(s,aspect):{}) }));
  return result;
}
function rotateStroke(s:AnnotationStroke,aspect:number):Partial<AnnotationStroke> {
  // Text has one anchor; rotate its orientation as well as its position.
  const referenceWidth=s.referenceWidth?s.referenceWidth/aspect:undefined;
  if(s.tool==='shape'&&s.points.length>=2) {
    const a=s.points[0],b=s.points[s.points.length-1],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    return {points:s.points.map(p=>({...p,x:1-cy+(p.x-cx)*aspect,y:cx+(p.y-cy)/aspect})),referenceWidth,rotation:(s.rotation||0)+Math.PI/2};
  }
  return {points:s.points.map(p=>({...p,x:1-p.y,y:p.x})),referenceWidth,rotation:(s.rotation||0)+(s.tool==='text'?Math.PI/2:0)};
}
