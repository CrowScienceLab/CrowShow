const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}) {const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n]);return exports;}
const {ShapeEngine}=load('src/annotations/shapeEngine.ts');
function context(){const calls=[];return new Proxy({calls},{get:(o,k)=>k in o?o[k]:(...a)=>calls.push([k,...a]),set:(o,k,v)=>{o[k]=v;return true;}});}
let ctx=context();ShapeEngine.renderShape(ctx,'arrow',[{x:0,y:0},{x:1,y:0}],'#000',4,false,300,200);
const triangle=ctx.calls.slice(ctx.calls.findLastIndex(c=>c[0]==='beginPath'));const tip=triangle.find(c=>c[0]==='moveTo'),edges=triangle.filter(c=>c[0]==='lineTo');assert.equal((tip[1]-edges[0][1])/Math.abs(edges[0][2]-edges[1][2]),3);
ctx=context();ShapeEngine.renderShape(ctx,'dashed-line',[{x:0,y:0},{x:1,y:1}],'#000',4,false,300,200);assert.deepEqual(ctx.calls.find(c=>c[0]==='setLineDash')[1],[12,8]);
const media=load('src/annotations/media.ts');assert.equal(media.safeLink('https://example.com/a'),'https://example.com/a');for(const url of ['javascript:alert(1)','file:///C:/a','https://name:pass@example.com','bad'])assert.equal(media.safeLink(url),null);
const {StrokeEngine}=load('src/annotations/strokeEngine.ts',{'./media':media,'./shapeEngine':{ShapeEngine}});
function dot(pressure,tiltX=0){const c=context();StrokeEngine.renderSingleStroke(c,{tool:'pen',points:[{x:.1,y:.1,pressure,tiltX}],width:10,color:'#000',opacity:1},800,600);return c.calls.find(c=>c[0]==='arc')[3];}
assert.ok(dot(.9)>dot(.1));assert.ok(dot(.5,60)>dot(.5,0));assert.equal(dot(.5),5);
const validation=load('src/utils/projectValidation.ts');const image={id:'image',tool:'image',color:'#000',width:1,points:[{x:0,y:0},{x:1,y:1}],imageData:'data:image/png;base64,AAAA'};assert.equal(validation.validateAnnotations({1:[image]}),true);assert.equal(validation.validateAnnotations({1:[{...image,imageData:'file:///private'}]}),false);
const project={documentName:'demo.pdf',totalSlides:1,annotations:{},notebook:{pages:[{id:'p',title:'note',paper:'spring',color:'#fffaf0'}],annotations:{1:[image]},view:{spread:2,zoom:1.25}}};assert.deepEqual(validation.readProject(JSON.stringify(project)).notebook,project.notebook);
console.log('PASS slender 1:3 arrow, dashed line, pressure and tilt width, safe links, image and spring-note project roundtrip');
