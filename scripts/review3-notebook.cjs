const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('assert/strict');
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const ex={};cache.set(file,ex);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',source)(ex,n=>{if(!n.startsWith('.'))return require(n);let target=path.resolve(path.dirname(file),n);for(const ext of ['.ts','.tsx','.js'])if(fs.existsSync(target+ext))return load(target+ext);return require(target);});return ex;}
global.window={devicePixelRatio:1};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {NotebookPanel}=load('src/components/NotebookPanel.tsx'),{AnnotationStore}=load('src/annotations/annotationStore.ts');
const tools={activeTool:'pen',penColor:'#000000',penWidth:4,highlighterColor:'#ffff00',highlighterWidth:20,laserColor:'#ff0000',shapeType:'rectangle',shapeFill:false,onSelectTool:()=>{}};
const data={pages:[{id:'p1',title:'page',paper:'blank',color:'#ffffff'}],annotations:{},view:{spread:1,zoom:1}};
const html=renderToStaticMarkup(React.createElement(NotebookPanel,{docId:'regression',data,store:new AnnotationStore(),tools,onChange:()=>{},onClose:()=>{},onStatus:()=>{},storageError:false}));
const paper=html.match(/aria-label="노트 필기 페이지 1"[^>]*style="([^"]+)"/);assert.ok(paper,'page rendered');const width=Number(paper[1].match(/width:([\d.]+)px/)[1]);
assert.ok(width>=840,`100% must fill available width (~844px at 900px viewport), actual ${width}px`);
console.log('PASS notebook 100% width fit at component render seam');
const {noteLayout,paperStyle,paintPaper}=load('src/utils/notebookLayout.ts');
assert.ok(noteLayout(900,650,1,1,'fit-width').height>650);
assert.ok(noteLayout(900,650,1,1,'fit-page').height<650);
assert.equal(noteLayout(900,650,1,3,'fit-width').width,844);
const spread=noteLayout(1200,650,2,1,'fit-width');assert.equal(spread.width*2+24,1144);
assert.equal(paperStyle('blank','#ffffff',844).backgroundImage,'none');assert.equal(paperStyle('blank','#ffffff',844).backgroundColor,'#ffffff');assert.equal(paperStyle('spring','#00ff00',844).backgroundImage,'none');
function context(){const calls=[];return new Proxy({calls},{get:(o,k)=>k in o?o[k]:k==='measureText'?()=>({width:120}):(...a)=>calls.push([k,...a]),set:(o,k,v)=>{o[k]=v;calls.push(['set',k,v]);return true;}});}
let c=context();paintPaper(c,'blank','#ffffff',800,1131);assert.deepEqual(c.calls,[['set','fillStyle','#ffffff'],['fillRect',0,0,800,1131]]);
c=context();paintPaper(c,'spring','#00ff00',800,1131);assert.equal(c.calls[0][2],'#00ff00');assert.equal(c.calls.some(c=>c[0]==='drawImage'),false);
const {selectInRectangle}=load('src/annotations/geometry.ts');const ink={id:'a',tool:'pen',color:'#000',width:4,opacity:1,points:[{x:.2,y:.2},{x:.3,y:.3}]};assert.equal(selectInRectangle([ink],{x:.1,y:.1},{x:.4,y:.4},800,600).length,1);assert.equal(selectInRectangle([ink],{x:.5,y:.5},{x:.6,y:.6},800,600).length,0);
const {StrokeEngine}=load('src/annotations/strokeEngine.ts');
c=context();StrokeEngine.renderSingleStroke(c,{...ink,flipX:true,rotation:Math.PI/2},800,600);assert.deepEqual(c.calls.find(c=>c[0]==='scale'),['scale',-1,1]);assert.equal(c.calls.find(c=>c[0]==='rotate')[1],Math.PI/2);
c=context();StrokeEngine.renderSingleStroke(c,{...ink,tool:'text',text:'한글',fontSize:22,bold:true,italic:true,underline:true,textOutline:true,points:[{x:.2,y:.2}]},800,600);assert.ok(c.calls.some(c=>c[0]==='strokeText'));assert.ok(c.calls.some(c=>c[0]==='set'&&c[1]==='font'&&c[2].includes('italic 700')));
const {ShapeEngine}=load('src/annotations/shapeEngine.ts');for(const type of ['smile','cosmos','sticky-note','speech-bubble']){c=context();ShapeEngine.renderShape(c,type,[{x:.1,y:.1},{x:.5,y:.5}],'#000',3,true,800,600,'#ffff00');assert.ok(c.calls.some(c=>c[0]==='fill'),type);}
const {renderLaser}=load('src/annotations/laserRenderer.ts');c=context();assert.equal(renderLaser(c,{x:.5,y:.5,active:false,color:'#f00',durationMs:2000,size:4,trail:[{x:.1,y:.1,time:1000},{x:.2,y:.2,time:1100}]},800,600,2000),true);c=context();assert.equal(renderLaser(c,{x:.5,y:.5,active:false,color:'#f00',durationMs:100,size:4,trail:[{x:.1,y:.1,time:1000},{x:.2,y:.2,time:1100}]},800,600,2000),false);
const {readProject}=load('src/utils/projectValidation.ts');const book={id:'book',title:'물리',pages:data.pages,annotations:{1:[{...ink,slideNumber:1,flipY:true}]},view:{spread:2,zoom:1,mode:'fit-width'}};const project={documentName:'demo.pdf',totalSlides:1,annotations:{},notebook:{...data,books:[book],activeBookId:'book'}};assert.equal(readProject(JSON.stringify(project)).notebook.books[0].title,'물리');
console.log('PASS distinct fit modes, blank/spring colors, equal spread, rectangle selection, mirror/rotation, outlined text, new shapes, laser fade, multi-notebook project');

