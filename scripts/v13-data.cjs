const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const {PDFDocument}=require('pdf-lib');
function load(file,deps={}) {
 const exports={};const memory=new Map();
 new Function('exports','require','localStorage','crypto',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n],{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},webcrypto);
 return exports;
}
(async()=>{
 const {stepZoom,ZOOM_STEPS}=load('src/pdf/pdfViewport.ts');
 for(const zoom of ZOOM_STEPS.slice(1,-1)){assert.equal(stepZoom(stepZoom(zoom,1),-1),zoom);assert.equal(stepZoom(stepZoom(zoom,-1),1),zoom);}
 assert.equal(stepZoom(.97,1),1);assert.equal(stepZoom(1.04,-1),1);
 const editing=load('src/utils/pdfEditing.ts',{'pdf-lib':require('pdf-lib')});
 const base=await PDFDocument.create();base.addPage([600,300]);base.addPage([300,900]);base.addPage([400,400]);const bytes=new Uint8Array(await base.save());
 const widths=async data=>(await PDFDocument.load(data)).getPages().map(p=>p.getWidth());
 let out=await editing.editPdf(bytes,{type:'move',page:1,to:3});assert.deepEqual(await widths(out.bytes),[300,400,600]);
 const data={1:[{id:'a',tool:'pen',slideNumber:1,width:4,referenceWidth:600,points:[{x:.2,y:.3}]}],2:[{id:'b',tool:'text',slideNumber:2,width:4,points:[{x:.2,y:.3}],text:'한글',bold:true,underline:true}]};
 let mapped=editing.remapAnnotations(data,out.mapping);assert.equal(mapped[3][0].slideNumber,3);assert.equal(mapped[3][0].tool,'pen');assert.equal(mapped[1][0].text,'한글');
 out=await editing.editPdf(bytes,{type:'duplicate',page:1});assert.deepEqual(await widths(out.bytes),[600,600,300,400]);mapped=editing.remapAnnotations(data,out.mapping);assert.notEqual(mapped[1][0].id,mapped[2][0].id);
 out=await editing.editPdf(bytes,{type:'rotate',page:1});assert.equal((await PDFDocument.load(out.bytes)).getPage(0).getRotation().angle,90);mapped=editing.remapAnnotations(data,out.mapping,1,out.aspect);assert.equal(mapped[1][0].points[0].x,.7);assert.equal(mapped[1][0].points[0].y,.2);assert.equal(mapped[1][0].referenceWidth,300);
 out=await editing.editPdf(bytes,{type:'insert',page:2,bytes});assert.equal((await PDFDocument.load(out.bytes)).getPageCount(),6);assert.equal(out.mapping[2],null);
 out=await editing.editPdf(bytes,{type:'blank',page:1});assert.equal((await PDFDocument.load(out.bytes)).getPageCount(),4);assert.equal(out.mapping[1],null);
 out=await editing.editPdf(bytes,{type:'delete',page:2});assert.deepEqual(await widths(out.bytes),[600,400]);
 const one=await PDFDocument.create();one.addPage();await assert.rejects(editing.editPdf(new Uint8Array(await one.save()),{type:'delete',page:1}));
 const validation=load('src/utils/projectValidation.ts');
 const {AnnotationStore}=load('src/annotations/annotationStore.ts',{'../utils/projectValidation':validation});const store=new AnnotationStore();store.setDocument('test');
 const first={...data[1][0],id:'first',color:'#ef4444'};store.addStroke(first);store.beginTransaction();for(let i=0;i<50;i++)store.updateStroke(1,{...first,color:String(i)});store.endTransaction();store.undo();assert.equal(store.getStrokesForSlide(1)[0].color,'#ef4444');store.redo();assert.equal(store.getStrokesForSlide(1)[0].color,'49');store.clearAllSlides();assert.equal(store.getStrokesForSlide(1).length,0);store.undo();assert.equal(store.getStrokesForSlide(1).length,1);
 const {parsePageRange}=load('src/utils/printRange.ts');assert.equal(parsePageRange('1-3, 5, 3',8).join(','),'1,2,3,5');assert.throws(()=>parsePageRange('0-2',8));assert.throws(()=>parsePageRange('8-2',8));assert.throws(()=>parsePageRange('1,xyz',8));
 assert.throws(()=>validation.readProject(JSON.stringify({documentName:'bad.pdf',totalSlides:1,annotations:{1:[{tool:'pen'}]}})));
 console.log('PASS zoom stops, actual PDF edit/save/order/rotation, annotation remapping, transaction undo/redo, print range validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
