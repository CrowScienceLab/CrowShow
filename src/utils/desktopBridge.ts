import { encodeNotebookFile } from './notebookFile';
import { downloadBytes } from './download';
import { safeLink } from '../annotations/media';
import { flushInk } from './inkStorage';
import { convertHwpToPdfInBrowser } from './browserHwpConverter';
export interface DesktopPdfPayload {
  name: string;
  size: number;
  bytes: number[] | Uint8Array;
}

interface UpdateCheckResult {
  status: 'current' | 'available' | 'no-release' | 'error' | 'store';
  version?: string;
  error?: string;
}

const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

export const isDesktopApp = () => isTauri() || Boolean(window.crowShowDesktop);

export const supportsKoreanDocuments = () => true;

export function koreanDocumentFormat(name: string): 'hwp' | 'hwpx' | undefined {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (name.includes('.') && (extension === 'hwp' || extension === 'hwpx')) return extension;
}

export async function convertKoreanDocument(file: File, format: 'hwp' | 'hwpx', refresh = false) {
  if (file.size > 64 * 1024 * 1024) throw new Error('한글 문서는 64 MB까지 열 수 있습니다.');
  if (!isTauri()) {
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    return convertHwpToPdfInBrowser(sourceBytes, format);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const response = await invoke<ArrayBuffer>('convert_hwp_to_pdf', await file.arrayBuffer(), {
    headers: {
      'x-crowshow-document-format': format,
      'x-crowshow-refresh': refresh ? '1' : '0',
    },
  });
  const [status] = new Uint8Array(response, 0, 1);
  const bytes = new Uint8Array(response, 1);
  if (status === 0) return { bytes, layout: 'passed' as const };
  return { bytes, layout: status === 1 ? 'overlap' as const : 'unavailable' as const };
}

export async function clearHwpConversionCache(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clear_hwp_conversion_cache');
}

export async function resizeWorkspaceWindow(workspace: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('resize_workspace_window', { workspace });
}

export async function getInitialDesktopPdf(): Promise<DesktopPdfPayload | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<DesktopPdfPayload | null>('get_initial_pdf');
  }
  return window.crowShowDesktop?.getInitialPdf() ?? null;
}

export async function onDesktopOpenPdf(
  callback: (payload: DesktopPdfPayload | null) => void
): Promise<() => void> {
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen<DesktopPdfPayload>('open-pdf', (event) => callback(event.payload));
  }
  return window.crowShowDesktop?.onOpenPdf(callback) ?? (() => {});
}

let updateCheckRunning=false;
export async function checkForDesktopUpdates(manual = true): Promise<void> {
 if(updateCheckRunning)return;updateCheckRunning=true;
 try {
  if (isTauri()) {
    let installing = false;
    let storeSource=false;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const update = await invoke<UpdateCheckResult>('check_for_updates');
      if (update.status === 'store') {
        storeSource=true;
        const store=await invoke<{available:boolean;completed:boolean}>('store_package_update',{install:false});
        if(!store.available){if(manual)alert('Microsoft Store의 최신 버전입니다.');return;}
        if(!confirm('Microsoft Store에 CrowShow 새 버전이 있습니다. 지금 다운로드·설치하시겠습니까? 업데이트 중 앱이 종료될 수 있습니다.'))return;
        installing=true;await flushInk(true);
        const result=await invoke<{available:boolean;completed:boolean}>('store_package_update',{install:true});
        if(result.completed)alert('Store 업데이트를 완료했습니다. 앱을 다시 시작하세요.');
        return;
      }
      if (update.status === 'current') {
        if (manual) alert(`CrowShow v${update.version ?? '1.0'}은 최신 버전입니다.`);
        return;
      }
      if (update.status === 'no-release') {
        if (manual) alert('게시된 정식 릴리스가 아직 없습니다.');
        return;
      }
      if (update.status !== 'available' || !update.version) throw new Error(update.error || '업데이트 정보를 확인할 수 없습니다.');
      if (!confirm(`CrowShow v${update.version} 업데이트를 다운로드하고 설치하시겠습니까?`)) return;
      installing = true;
      await flushInk(true);
      await invoke('download_and_install_update', { version: update.version });
    } catch (error) {
      console.error(error);
      if (manual || installing) alert(`업데이트 ${installing ? '다운로드·설치' : '확인'}에 실패했습니다.\n${String(error)}\n${storeSource?'Microsoft Store 라이브러리에서 다시 확인하세요.':'공식 릴리스: https://github.com/CrowScienceLab/CrowShow/releases/latest'}`);
    }
    return;
  }
  await window.crowShowDesktop?.checkForUpdates();
 } finally {updateCheckRunning=false;}
}

export async function openPdfDefaultApps(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_pdf_defaults');
    return;
  }
  await window.crowShowDesktop?.openPdfDefaults();
}

export async function openExternalLink(value:string):Promise<void> {
  const url=safeLink(value);if(!url)return;
  if(isDesktopApp()){const {invoke}=await import('@tauri-apps/api/core');await invoke('open_external_url',{url});}
  else window.open(url,'_blank','noopener,noreferrer');
}
export interface NotebookStorageStatus {filePath:string|null;driveFolder:string|null;driveFile:string|null;}
export async function getNotebookStorageStatus(bookId:string):Promise<NotebookStorageStatus> {
 if(!isDesktopApp())return {filePath:null,driveFolder:null,driveFile:null};
 const {invoke}=await import('@tauri-apps/api/core');return invoke('notebook_storage_status',{bookId});
}
export async function saveNotebookFile(book:import('../types/notebook').NotebookBook,saveAs=false,drive=false):Promise<string|null> {
 const content=encodeNotebookFile(book);
 if(!isDesktopApp()){if(drive)throw new Error('Drive 폴더 연결은 PC용 CrowShow에서 사용할 수 있습니다.');downloadBytes(content,book.title.replace(/[<>:"/\\|?*]/g,'_')+'.crownotebook','application/json');return 'Notebook 파일 다운로드';}
 const {invoke}=await import('@tauri-apps/api/core');return invoke('save_notebook_file',{bookId:book.id,title:book.title,content,saveAs,drive});
}
export async function openNotebookFile(bookId:string,drive=false):Promise<{content:string;path:string}|null> {
 const {invoke}=await import('@tauri-apps/api/core');return invoke('open_notebook_file',{bookId,drive});
}
export async function chooseNotebookDriveFolder(clear=false):Promise<string|null> {
 const {invoke}=await import('@tauri-apps/api/core');return invoke('choose_notebook_drive_folder',{clear});
}
