import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Plus, Copy, Trash2, Undo2, Redo2, ImagePlus, Link, X, BookOpen, Square, ChevronLeft, ChevronRight, Save, FolderOpen, Ellipsis, Pencil, Palette, FileText, ChevronDown, CloudUpload, CloudDownload, FolderSync, Unplug } from 'lucide-react';
import type { NotebookData, NotebookBook, NotePage, PaperType } from '../types/notebook';
import { EffectsLayer } from '../annotations/effectsLayer';
import type { LaserPointerState } from '../types/annotation';
import { noteLayout, paperStyle, paintPaper } from '../utils/notebookLayout';
import type { PdfZoomMode } from '../pdf/pdfViewport';
import { AnnotationCanvas } from '../annotations/annotationCanvas';
import { AnnotationStore } from '../annotations/annotationStore';
import { StrokeEngine } from '../annotations/strokeEngine';
import type { ToolDockProps } from './ToolDock';
import { downloadBytes } from '../utils/download';
import { imageFor, importNoteImage, prepareImages, safeLink } from '../annotations/media';
import * as pdfjs from 'pdfjs-dist';
import { isDesktopApp, getNotebookStorageStatus, saveNotebookFile, openNotebookFile, chooseNotebookDriveFolder, type NotebookStorageStatus } from '../utils/desktopBridge';
import { decodeNotebookFile, readNotebookFile } from '../utils/notebookFile';
import { PdfExportIcon, PdfImportIcon } from './WorkspaceIcons';
import { stepZoom } from '../pdf/pdfViewport';
import { deleteNotebookPage } from '../utils/notebookPages';
export interface NotebookHandle { clearPage:()=>void; clearAll:()=>void; zoomStep:(direction:number)=>void; resetZoom:()=>void;fitPage:()=>void;fitWidth:()=>void; navigate:(page:number)=>void; savePdf:()=>void; }
export interface NoteStatus {page:number;total:number;zoom:number;mode?:PdfZoomMode;}
interface Props {docId:string;data:NotebookData|null;storageError:boolean;store:AnnotationStore;tools:ToolDockProps;onChange:(data:NotebookData)=>void;onClose:()=>void;onStatus:(value:NoteStatus)=>void;ref?:React.Ref<NotebookHandle>;}
const newPage=():NotePage=>({id:crypto.randomUUID(),title:'새 페이지',paper:'blank',color:'#ffffff'});
const paperLabels:Record<PaperType,string>={spring:'스프링 노트',blank:'무지',lined:'줄노트',grid:'모눈',dots:'점 노트',cornell:'코넬'};
const deskStyles = { theme: '테마 기본', wood: '웜 우드', felt: '펠트 매트', dots: '스튜디오 도트', sage: '세이지 숲', linen: '소프트 리넨' } as const;
type DeskStyle = keyof typeof deskStyles;
const DESK_STYLE_KEY = 'crowshow_notebook_desk';

function currentDeskStyle(): DeskStyle {
  try {
    const preference = localStorage.getItem(DESK_STYLE_KEY);
    if (preference && Object.hasOwn(deskStyles, preference)) return preference as DeskStyle;
  } catch { /* Theme defaults are available without local storage. */ }
  return 'theme';
}

type CapsuleIcon = React.ComponentType<{ size?: number }>;
function NoteIcon({title,Icon,onClick,disabled=false}:{title:string;Icon:CapsuleIcon;onClick:()=>void;disabled?:boolean}) {
  return <button type="button" className="note-icon" title={title} aria-label={title} onClick={onClick} disabled={disabled}><Icon size={16}/></button>;
}

function NotebookPopover({ label, Icon, children, align, showLabel, disabled }: {
  label: string;
  Icon: CapsuleIcon;
  children: React.ReactNode;
  align?: 'end';
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('keydown', onEscape, true);
    return () => { document.removeEventListener('pointerdown', onOutside); window.removeEventListener('keydown', onEscape, true); };
  }, [open, close]);
  return (
    <div ref={anchor} className={`note-popover ${align === 'end' ? 'align-end' : ''}`} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button type="button" ref={trigger} className={showLabel ? 'note-capsule-button' : 'note-icon'} title={label} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(value => !value)}>
        <Icon size={16}/>{showLabel && <><span>{label}</span><ChevronDown size={16}/></>}
      </button>
      {open && <div className="note-popover-panel" id={id} onClick={event => {
        if (event.target instanceof Element && event.target.closest("[data-close-popover]")) close();
      }} onSubmit={event => { event.preventDefault(); close(); }}>{children}</div>}
    </div>
  );
}
export function NotebookPanel(props:Props) {
 const {onChange}=props;
 const [books,setBooks]=useState<NotebookBook[]>(()=>props.data?.books?.length?props.data.books:[{id:crypto.randomUUID(),title:'나의 노트',pages:props.data?.pages.length?props.data.pages:[newPage()],annotations:props.data?.annotations||{},view:props.data?.view}]);
 const [activeId,setActiveId]=useState(()=>props.data?.activeBookId||books[0].id);
 const [fileBusy,setFileBusy]=useState(false),[notice,setNotice]=useState<{text:string;id:number}|null>(null);
 const [storage,setStorage]=useState<NotebookStorageStatus>({filePath:null,driveFolder:null,driveFile:null});
 const notebookInput=useRef<HTMLInputElement>(null);
 const active=books.find(book=>book.id===activeId)||books[0];
 useEffect(()=>onChange({pages:active.pages,annotations:active.annotations,view:active.view,books,activeBookId:active.id}),[books,active,onChange]);
 const update=useCallback((value:NotebookData)=>setBooks(items=>items.map(book=>book.id===active.id?{...book,pages:value.pages,annotations:value.annotations,view:value.view}:book)),[active.id]);
 const clearNotice=useCallback(()=>setNotice(null),[]);
 const addBook=()=>{const book:NotebookBook={id:crypto.randomUUID(),title:`노트 ${books.length+1}`,pages:[newPage()],annotations:{}};setBooks(items=>[...items,book]);setActiveId(book.id);};
 useEffect(()=>{let cancelled=false;void getNotebookStorageStatus(active.id).then(value=>{if(!cancelled)setStorage(value)}).catch(()=>{});return()=>{cancelled=true}},[active.id]);

 const report=(text:string)=>setNotice({text,id:Date.now()});
 const save=async(saveAs=false,drive=false)=>{setFileBusy(true);try{const path=await saveNotebookFile({...active,annotations:props.store.getSnapshot()},saveAs,drive);if(path){report(drive?`Drive 동기화 폴더에 저장했습니다. PC용 Drive에서 업로드 상태를 확인하세요. · ${path}`:`Notebook 파일 저장 완료 · ${path}`);setStorage(await getNotebookStorageStatus(active.id));}}catch(error){report(`저장 실패: ${String(error)}`)}finally{setFileBusy(false)}};
 const appendBook=(source:NotebookBook,id=crypto.randomUUID())=>{const book={...source,id};setBooks(items=>[...items,book]);setActiveId(book.id);report(`Notebook 불러오기 완료 · ${book.title}`)};
 const open=async(drive=false)=>{if(!isDesktopApp()){notebookInput.current?.click();return}setFileBusy(true);try{const id=crypto.randomUUID(),file=await openNotebookFile(id,drive);if(file)appendBook(decodeNotebookFile(file.content),id)}catch(error){report(`불러오기 실패: ${String(error)}`)}finally{setFileBusy(false)}};
 const connectDrive=async(clear=false)=>{setFileBusy(true);try{const folder=await chooseNotebookDriveFolder(clear);setStorage(await getNotebookStorageStatus(active.id));if(clear)report('Drive 폴더 연결을 해제했습니다. 저장한 파일은 유지합니다.');else if(folder)report(`Drive 동기화 폴더 연결 · ${folder}`)}catch(error){report(`Drive 폴더 연결 실패: ${String(error)}`)}finally{setFileBusy(false)}};
 const notebookControls = <>
   <select aria-label="노트 선택" value={active.id} onChange={event => setActiveId(event.target.value)}>
     {books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
   </select>
   <NoteIcon title="새 노트 만들기" Icon={Plus} onClick={addBook}/>
   <NotebookPopover label="노트 이름 변경" Icon={Pencil}>
     <form className="note-name-form">
       <label>노트 이름<input autoFocus aria-label="Notebook 이름" value={active.title} onChange={event => {
         const title = event.target.value;
         setBooks(items => items.map(book => book.id === active.id ? { ...book, title } : book));
       }}/></label>
       <button type="submit">완료</button>
     </form>
   </NotebookPopover>
 </>;
 const fileMenuItems = (<>
       <button type="button" data-close-popover onClick={() => void save()}><Save/>Notebook 파일 저장</button>
       <button type="button" data-close-popover onClick={() => void save(true)}><Save/>다른 이름으로 저장</button>
       <button type="button" data-close-popover onClick={() => void open()}><FolderOpen/>Notebook 불러오기</button>
       {isDesktopApp() && <>
         <hr/>
         <button type="button" data-close-popover onClick={() => void connectDrive()}><FolderSync/>{storage.driveFolder ? 'Drive 폴더 변경' : 'Drive 폴더 연결'}</button>
         <button type="button" data-close-popover onClick={() => void save(false, true)}><CloudUpload/>Drive에 저장</button>
         <button type="button" data-close-popover onClick={() => void open(true)}><CloudDownload/>Drive에서 불러오기</button>
         {storage.driveFolder && <button type="button" data-close-popover onClick={() => void connectDrive(true)}><Unplug/>Drive 연결 해제</button>}
         {storage.driveFolder && <small>동기화 폴더: {storage.driveFolder}</small>}
       </>}
       {storage.filePath && <small>현재 파일: {storage.filePath}</small>}
 </>);
 const loadBrowserFile = async (file: File) => {
   try {
     const book = await readNotebookFile(file);
     appendBook(book);
   } catch (error) {
     report(`불러오기 실패: ${String(error)}`);
   }
 };
 return <>
   <NotebookWorkspace key={active.id} {...props} docId={`${props.docId}_${active.id}`} data={active} onChange={update} notebookMenu={notebookControls} fileMenuItems={fileMenuItems} fileBusy={fileBusy} fileNotice={notice} onClearNotice={clearNotice}/>
   <input ref={notebookInput} type="file" accept=".crownotebook,application/json" hidden onChange={event => {
     const file = event.target.files?.[0];
     event.target.value = '';
     if (file) void loadBrowserFile(file);
   }}/>
 </>;
}
function NotebookWorkspace({docId,data,store,tools,onChange,onClose,storageError,onStatus,ref,notebookMenu,fileMenuItems,fileBusy,fileNotice,onClearNotice}:Props&{notebookMenu:React.ReactNode;fileMenuItems:React.ReactNode;fileBusy:boolean;fileNotice:{text:string;id:number}|null;onClearNotice:()=>void}) {
  const [pages,setPages]=useState<NotePage[]>(()=>data?.pages.length?data.pages:[newPage()]);
  const [index,setIndex]=useState(0),[spread,setSpread]=useState<1|2>(data?.view?.spread||1),[zoom,setZoom]=useState(data?.view?.zoom||1),[mode,setMode]=useState<PdfZoomMode>(data?.view?.mode||'fit-width'),[penOnly,setPenOnly]=useState(false);
  const [desk, setDesk] = useState(currentDeskStyle);
  const chooseDesk = (value: DeskStyle) => {
    setDesk(value);
    try { localStorage.setItem(DESK_STYLE_KEY, value); } catch { /* Still apply the choice for this session. */ }
  };
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[linkOpen,setLinkOpen]=useState(false),[linkError,setLinkError]=useState(''),[url,setUrl]=useState(''),[label,setLabel]=useState('');
  const [initialData]=useState(data);
  const pagesRef=useRef(pages),changeRef=useRef(onChange),viewRef=useRef({spread,zoom,mode}),activeIndex=useRef(index),mounted=useRef(true);
  const scroll=useRef<HTMLDivElement>(null),imageInput=useRef<HTMLInputElement>(null),pdfInput=useRef<HTMLInputElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const [viewport,setViewport]=useState({width:900,height:650});
  const [past,setPast]=useState<{data:NotebookData;index:number}[]>([]),[future,setFuture]=useState<{data:NotebookData;index:number}[]>([]);
  useEffect(()=>{pagesRef.current=pages;},[pages]);useEffect(()=>{changeRef.current=onChange;},[onChange]);useEffect(()=>{viewRef.current={spread,zoom,mode};},[spread,zoom,mode]);useEffect(()=>{activeIndex.current=index;},[index]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    store.setDocument(`notebook_${docId}`);if(initialData)store.setAllAnnotations(initialData.annotations);
    const persist=()=>{if(!store.isEditing)changeRef.current({pages:pagesRef.current,annotations:store.getSnapshot(),view:viewRef.current});};
    persist();return store.subscribe(persist);
  },[docId,store,initialData]);
  useEffect(()=>{onChange({pages,annotations:store.getSnapshot(),view:{spread,zoom,mode}});},[pages,spread,zoom,mode,store,onChange]);

  useEffect(()=>{const element=scroll.current;if(!element)return;const observer=new ResizeObserver(()=>{if(element.clientWidth&&element.clientHeight)setViewport({width:element.clientWidth,height:element.clientHeight});});observer.observe(element);return()=>observer.disconnect();},[]);
  const snapshot=()=>({data:{pages:structuredClone(pages),annotations:store.getSnapshot()},index});
  const checkpoint=()=>{const before=snapshot();setPast(history=>[...history,before].slice(-20));setFuture([]);};
  const travel=(redo=false)=>{const history=redo?future:past,last=history[history.length-1];if(!last)return;const current=snapshot();if(redo){setFuture(history.slice(0,-1));setPast(items=>[...items,current]);}else{setPast(history.slice(0,-1));setFuture(items=>[...items,current]);}pagesRef.current=last.data.pages;store.setAllAnnotations(last.data.annotations);setPages(last.data.pages);setIndex(last.index);};
  const insert=(duplicate=false)=>{
    checkpoint();const next=[...pages];next.splice(index+1,0,duplicate?{...pages[index],id:crypto.randomUUID(),title:pages[index].title+' 복사'}:newPage());
    const old=store.getSnapshot(),mapped:NotebookData['annotations']={};
    next.forEach((_,i)=>{const from=i<=index?i:i===index+1?(duplicate?index:-1):i-1;if(from>=0)mapped[i+1]=(old[from+1]||[]).map(s=>({...s,id:crypto.randomUUID(),slideNumber:i+1}));});
    pagesRef.current=next;store.setAllAnnotations(mapped);setPages(next);setIndex(index+1);
  };
  const remove=()=>{if(!window.confirm('이 노트 페이지를 삭제할까요? 페이지 실행 취소로 복원할 수 있습니다.'))return;checkpoint();const next=deleteNotebookPage(pages,store.getSnapshot(),index);pagesRef.current=next.pages;store.setAllAnnotations(next.annotations);setPages(next.pages);setIndex(next.index);};
  const addImage=useCallback(async(file:File)=>{
    const pageId=pagesRef.current[activeIndex.current].id;setBusy(true);setStatus('이미지 준비 중…');
    try{const media=await importNoteImage(file);if(!mounted.current)return;const target=pagesRef.current.findIndex(p=>p.id===pageId)+1;if(target<1)return;const w=Math.min(.65,.55*1131*media.aspect/800),h=w*800/(1131*media.aspect);store.addStroke({id:crypto.randomUUID(),tool:'image',imageData:media.imageData,points:[{x:.15,y:.15},{x:.15+w,y:.15+h}],color:'#172033',width:1,opacity:1,slideNumber:target,createdAt:Date.now(),referenceWidth:800});tools.onSelectTool('select');setStatus('이미지를 추가했습니다. 선택하여 이동·크기 조절할 수 있습니다.');}catch(e){if(mounted.current)setStatus(String(e));}finally{if(mounted.current)setBusy(false);}
  },[store,tools]);
  useEffect(()=>{const paste=(e:ClipboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]'))return;const file=Array.from(e.clipboardData?.files||[]).find(file=>file.type.startsWith('image/'));if(file){e.preventDefault();void addImage(file);}};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);},[addImage]);
  const addLink=()=>{
    const trimmed=url.trim();
    const candidate=/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)?trimmed:/^[^\s]+\.[^\s]+$/.test(trimmed)?`https://${trimmed}`:trimmed;
    const address=safeLink(candidate);
    if(!address){const message='올바른 웹 주소(http:// 또는 https://)를 입력하세요.';setLinkError(message);setStatus(message);return;}
    store.addStroke({id:crypto.randomUUID(),tool:'link',text:label.trim()||address,url:address,fontSize:22,fontFamily:'system-ui, sans-serif',underline:true,color:'#2563eb',width:1,opacity:1,points:[{x:.15,y:.2}],referenceWidth:800,slideNumber:index+1,createdAt:Date.now()});tools.onSelectTool('select');setLinkOpen(false);setLinkError('');setUrl('');setLabel('');setStatus('링크를 추가했습니다. 더블클릭하거나 선택 후 링크 열기를 누르세요.');
  };
  const savePdf=async()=>{setBusy(true);try{const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();for(let i=0;i<pages.length;i++){const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2262;const ctx=canvas.getContext('2d')!;paintPaper(ctx,pages[i].paper,pages[i].color,canvas.width,canvas.height);if(pages[i].backgroundImage){const image=imageFor(pages[i].backgroundImage!);await image.decode();ctx.drawImage(image,0,0,canvas.width,canvas.height);}const ink=store.getStrokesForSlide(i+1);await prepareImages(ink);StrokeEngine.renderStrokes(ctx,ink,canvas.width,canvas.height);const png=await pdf.embedPng(canvas.toDataURL('image/png'));const page=pdf.addPage([595.28,841.89]);page.drawImage(png,{x:0,y:0,width:595.28,height:841.89});canvas.width=canvas.height=0;}downloadBytes(new Uint8Array(await pdf.save()),'CrowShow-Notebook.pdf','application/pdf');setStatus('노트 PDF 저장 완료');}catch(e){setStatus(`저장 실패: ${String(e)}`);}finally{setBusy(false);}};
  const layout=noteLayout(viewport.width,viewport.height,spread,zoom,mode);
  const {width,height}=layout;
  useImperativeHandle(ref,()=>({clearPage:()=>store.clearSlide(index+1),clearAll:()=>{if(window.confirm('노트 전체 필기를 지울까요? 실행 취소로 복원할 수 있습니다.'))store.clearAllSlides();},zoomStep:direction=>{setZoom(stepZoom(layout.zoom,direction));setMode('custom');},resetZoom:()=>{setZoom(1);setMode('fit-width');},fitWidth:()=>{setZoom(1);setMode('fit-width');},fitPage:()=>setMode('fit-page'),navigate:page=>setIndex(Math.max(0,Math.min(pages.length-1,page-1))),savePdf:()=>void savePdf()}));
  const chooseSpread=(value:1|2)=>{if(value===2&&pages.length===1){checkpoint();setPages(current=>[...current,newPage()]);}setSpread(value);};
  const start=spread===2?Math.floor(index/2)*2:index;
  const indices=Array.from({length:spread},(_,i)=>start+i).filter(i=>i<pages.length);
  useEffect(()=>{onStatus({page:index+1,total:pages.length,zoom:layout.zoom,mode});},[index,pages.length,layout.zoom,mode,onStatus]);
  const importPdf=async(file:File)=>{
    setBusy(true);setStatus('PDF 불러오는 중…');
    const base=new URL('pdfjs/',document.baseURI).href;
    let pdf:Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>|undefined;let task:ReturnType<typeof pdfjs.getDocument>|undefined;
    try{task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/',useSystemFonts:true});pdf=await task.promise;
      const imported:NotePage[]=[];
      for(let i=1;i<=pdf.numPages;i++){if(!mounted.current)return;setStatus(`PDF ${i} / ${pdf.numPages} 페이지 준비 중…`);const page=await pdf.getPage(i),natural=page.getViewport({scale:1}),scale=Math.min(1600/natural.width,2262/natural.height),vp=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2262;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,2262);await page.render({canvasContext:ctx,canvas,viewport:vp,transform:[1,0,0,1,(1600-vp.width)/2,(2262-vp.height)/2]}).promise;imported.push({id:crypto.randomUUID(),title:`${file.name.replace(/\.pdf$/i,'')} ${i}`,paper:'blank',color:'#ffffff',backgroundImage:canvas.toDataURL('image/webp',.92)});canvas.width=canvas.height=0;page.cleanup();}
      if(!mounted.current)return;checkpoint();const next=[...pagesRef.current,...imported];pagesRef.current=next;setPages(next);setIndex(next.length-imported.length);setMode('fit-width');setZoom(1);setStatus(`PDF ${imported.length}페이지를 현재 노트 뒤에 추가했습니다.`);
    }catch(error){if(mounted.current)setStatus(`PDF 불러오기 실패: ${String(error)}`);}finally{await task?.destroy();if(mounted.current)setBusy(false);}
  };
  return <section className="notebook-workspace" data-desk={desk} onPointerDownCapture={onClearNotice} onKeyDownCapture={onClearNotice} role="region" aria-label="Notebook 필기장">
    <header className="note-capsule" aria-label="Notebook 작업 메뉴">
      <div className="note-capsule-group">{notebookMenu}</div>
      <div className="note-capsule-group">
        <select aria-label="노트 페이지" value={index} onChange={event => setIndex(Number(event.target.value))}>
          {pages.map((page, pageIndex) => <option key={page.id} value={pageIndex}>{pageIndex + 1}. {page.title}</option>)}
        </select>
        <NoteIcon title="노트 페이지 추가" Icon={Plus} onClick={() => insert()}/>
        <NotebookPopover label="페이지 편집" Icon={Ellipsis}>
            <form className="note-name-form">
              <label>페이지 이름<input autoFocus aria-label="노트 페이지 제목" value={pages[index].title} onChange={event => {
                const title = event.target.value;
                setPages(pages.map((page, pageIndex) => pageIndex === index ? { ...page, title } : page));
              }}/></label>
              <button type="submit">완료</button>
            </form>
            <div className="note-file-list">
              <button type="button" data-close-popover onClick={() => insert(true)}><Copy/>페이지 복제</button>
              <button type="button" data-close-popover onClick={remove}><Trash2/>페이지 삭제</button>
              <button type="button" disabled={!past.length} data-close-popover onClick={() => travel()}><Undo2/>페이지 편집 실행 취소</button>
              <button type="button" disabled={!future.length} data-close-popover onClick={() => travel(true)}><Redo2/>페이지 편집 다시 실행</button>
            </div>
            <label className="pen-only-toggle"><input type="checkbox" checked={penOnly} onChange={event => setPenOnly(event.target.checked)}/>펜 전용</label>
        </NotebookPopover>
      </div>
      <div className="note-capsule-group">
        <NotebookPopover label="용지" Icon={FileText} showLabel>
          <div className="note-paper-controls">
            <label>용지 무늬<select aria-label="노트 용지" value={pages[index].paper} onChange={event => {
              const paper = event.target.value as PaperType;
              setPages(pages.map((page, pageIndex) => pageIndex === index ? { ...page, paper } : page));
            }}>{Object.entries(paperLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label>용지 색상<input type="color" aria-label="노트 용지 색상" value={pages[index].color} onChange={event => {
              const color = event.target.value;
              setPages(pages.map((page, pageIndex) => pageIndex === index ? { ...page, color } : page));
            }}/></label>
          </div>
        </NotebookPopover>
        <NotebookPopover label="배경" Icon={Palette} showLabel align="end">
          <div className="note-desk-grid" aria-label="데스크 배경">
            {(Object.keys(deskStyles) as DeskStyle[]).map(value => <button key={value} type="button" aria-pressed={desk === value} data-close-popover onClick={() => chooseDesk(value)}>
              <span className="desk-swatch" data-desk={value}/>{deskStyles[value]}
            </button>)}
          </div>
        </NotebookPopover>
        <NoteIcon title="이미지 추가 · 캡처 이미지 Ctrl+V" Icon={ImagePlus} disabled={busy} onClick={() => imageInput.current?.click()}/>
        <NoteIcon title="하이퍼링크 추가" Icon={Link} onClick={() => { setLinkOpen(value => !value); setLinkError(''); }}/>
      </div>
      <div className="note-capsule-group">
        <button type="button" className="note-icon" title="한 화면에 1페이지" aria-label="한 화면에 1페이지" aria-pressed={spread === 1} onClick={() => chooseSpread(1)}><Square size={16}/></button>
        <button type="button" className="note-icon" title="한 화면에 2페이지" aria-label="한 화면에 2페이지" aria-pressed={spread === 2} onClick={() => chooseSpread(2)}><BookOpen size={16}/></button>
      </div>
      <div className="note-capsule-group">
        <NotebookPopover label="파일·PDF" Icon={Save} align="end" showLabel disabled={busy || fileBusy}>
          <div className="note-file-list" aria-label="Notebook 파일·Drive">
            {fileMenuItems}
            <hr/>
            <button type="button" data-close-popover onClick={() => void savePdf()}><PdfExportIcon/>노트 PDF 저장</button>
            <button type="button" data-close-popover onClick={() => pdfInput.current?.click()}><PdfImportIcon/>노트 PDF 불러오기</button>
          </div>
        </NotebookPopover>
        <NoteIcon title="노트 닫기" Icon={X} onClick={onClose}/>
      </div>
    </header>
    {linkOpen&&<form className="note-link-form" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setLinkOpen(false);setLinkError('');}}} onSubmit={e=>{e.preventDefault();addLink();}}><input aria-label="링크 표시 문구" placeholder="표시 문구 (선택)" value={label} onChange={e=>setLabel(e.target.value)}/><input aria-label="링크 주소" placeholder="https://example.com" value={url} onChange={e=>{setUrl(e.target.value);if(linkError)setLinkError('');}} autoFocus/><button type="submit">추가</button><button type="button" aria-label="링크 입력 닫기" title="닫기 (Esc)" onClick={()=>{setLinkOpen(false);setLinkError('');}}><X size={15}/></button>{linkError&&<span className="note-link-error" role="alert">{linkError}</span>}</form>}
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importPdf(file);}}/>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void addImage(file);}}/>
    <div ref={scroll} className="note-scroll" onContextMenu={e=>e.preventDefault()} onPointerDownCapture={e=>{if(e.button!==2)return;const el=scroll.current!;drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();}} onPointerMoveCapture={e=>{if(!drag.current)return;scroll.current!.scrollLeft=drag.current.left-e.clientX+drag.current.x;scroll.current!.scrollTop=drag.current.top-e.clientY+drag.current.y;e.stopPropagation();}} onPointerUpCapture={e=>{if(!drag.current)return;drag.current=null;e.stopPropagation();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
      <div className="note-spread" style={{minWidth:Math.max(viewport.width-40,indices.length*width+(indices.length-1)*24)}}>{indices.map(i=><div key={pages[i].id} className={`note-page-slot ${i===index?'current':''}`} onPointerDownCapture={()=>setIndex(i)}>
        <div className={`note-paper paper-${pages[i].paper}`} aria-label={`노트 필기 페이지 ${i+1}`} style={{width,height,...paperStyle(pages[i].paper,pages[i].color,width)}}>{pages[i].paper==='spring'&&<div className="spring-binding" aria-hidden="true">{Array.from({length:Math.ceil(1131/32)},(_,ring)=><i key={ring} style={{top:(ring*32+10)*width/800,width:30*width/800,height:12*width/800,borderWidth:Math.max(1,2*width/800)}}/>)}</div>}{pages[i].backgroundImage&&<img className="note-pdf-background" src={pages[i].backgroundImage} alt="불러온 PDF 페이지" draggable={false}/>}<NoteCanvas slideNumber={i+1} width={width} height={height} store={store} tools={tools} penOnly={penOnly} keyboardActive={i===index}/></div><small className="note-page-number">{i+1}</small>
      </div>)}</div>
    </div><div className="note-status-strip" role="status">{fileNotice?.text || status || (storageError || store.storageFailed ? '자동 저장 실패 · Notebook 파일로 백업하세요' : '로컬 자동 저장')}<span/><button title="이전 노트 페이지" aria-label="이전 노트 페이지" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-spread))}><ChevronLeft size={15}/></button><small>{index+1} / {pages.length}</small><button title="다음 노트 페이지" aria-label="다음 노트 페이지" disabled={index>=pages.length-1} onClick={()=>setIndex(i=>Math.min(pages.length-1,i+spread))}><ChevronRight size={15}/></button></div>
  </section>;
}
function NoteCanvas({tools,...props}:{tools:ToolDockProps;slideNumber:number;width:number;height:number;store:AnnotationStore;penOnly:boolean;keyboardActive:boolean}) {
 const [laser,setLaser]=useState<LaserPointerState>({x:0,y:0,active:false,color:tools.laserColor,trail:[]});
 return <><AnnotationCanvas {...props} {...tools} onRequestSelectTool={()=>tools.onSelectTool('select')} onLaserChange={setLaser}/><EffectsLayer width={props.width} height={props.height} laserState={tools.activeTool==='laser'?laser:{...laser,active:false,trail:[]}} screenCurtain="none"/></>;
}
