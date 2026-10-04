const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
 const target=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'index.html');
 const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png'};
 res.writeHead(200,{'Content-Type':type[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(5182,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5182/');
  await page.locator('input[type=file]').first().setInputFiles(path.join(__dirname,'assets/CrowShow-demo.pdf'));
  await page.waitForFunction(()=>{const c=document.querySelector('.pdf-canvas');return c&&c.width>1000;});
  await page.waitForTimeout(1400);
  await page.screenshot({path:path.join(__dirname,'screenshots/01-pdf-presentation.png')});
  await page.keyboard.press('p');
  const frame=await page.locator('.slide-frame').last().boundingBox();
  await page.mouse.move(frame.x+frame.width*.075,frame.y+frame.height*.49);await page.mouse.down();
  await page.mouse.move(frame.x+frame.width*.44,frame.y+frame.height*.49,{steps:24});await page.mouse.up();
  await page.mouse.move(frame.x+frame.width*.59,frame.y+frame.height*.50);await page.mouse.down();
  await page.mouse.move(frame.x+frame.width*.64,frame.y+frame.height*.62,{steps:12});
  await page.mouse.move(frame.x+frame.width*.80,frame.y+frame.height*.70,{steps:24});await page.mouse.up();
  await page.keyboard.press('v');await page.waitForTimeout(400);
  await page.screenshot({path:path.join(__dirname,'screenshots/02-annotation-tools.png')});
  await page.locator('.btn-status-nav').last().click();await page.waitForTimeout(1200);
  await page.getByLabel('PDF 화면 맞춤').selectOption('fit-width');await page.getByLabel('PDF 화면 맞춤').blur();
  await page.waitForTimeout(1000);await page.screenshot({path:path.join(__dirname,'screenshots/03-document-scroll.png')});
  console.log('Saved three actual app screenshots at 1920x1080.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
