/**
 * Remote document fetcher for CrowShow Web App.
 *
 * Supports opening documents directly from curriculum.html and other CrowScienceLab boards:
 * - `?fileId=<google-drive-id>&title=<filename>&type=<PDF|HWP|HWPX>`
 * - `?url=<same-origin-or-cors-url>&title=<filename>`
 * - `?mode=notebook` (opens standalone Notebook directly)
 */

const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycby7GR8v_MuDVyscujEMlF8ACrEUOZn-gfPEKpgXyNaBGaG54-wcPGkQBYC7qC6nE_Zm/exec';

export interface RemoteDocumentQuery {
  fileId?: string;
  url?: string;
  title?: string;
  type?: string;
  mode?: 'notebook';
}

export interface RemoteDocumentPayload {
  bytes: Uint8Array;
  fileName: string;
}

export function extractDriveFileId(input?: string | null): string {
  if (!input) return '';
  const str = String(input).trim();
  const matchD = str.match(/\/d\/([a-zA-Z0-9_-]{20,45})/);
  if (matchD) return matchD[1];
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]{20,45})/);
  if (matchId) return matchId[1];
  if (/^[a-zA-Z0-9_-]{20,45}$/.test(str)) return str;
  return '';
}

export function getRemoteQueryFromUrl(): RemoteDocumentQuery | null {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  const rawFileId = params.get('fileId') || params.get('id') || '';
  const rawUrl = params.get('url') || params.get('pdf') || '';
  const title = params.get('title') || params.get('name') || '';
  const type = params.get('type') || '';

  const extractedFromUrl = extractDriveFileId(rawUrl);
  const fileId = extractDriveFileId(rawFileId) || extractedFromUrl;
  const url = extractedFromUrl && !rawUrl.startsWith('/') && !rawUrl.startsWith('./') ? '' : rawUrl;

  if (modeParam === 'notebook') {
    return { mode: 'notebook', fileId: fileId || undefined, url: url || undefined, title: title || undefined, type: type || undefined };
  }
  if (!fileId && !url) return null;
  return {
    fileId: fileId || undefined,
    url: url || undefined,
    title: title || undefined,
    type: type || undefined,
  };
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binStr = atob(cleaned.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function ensureExtension(title: string, fallbackType?: string): string {
  const trimmed = (title || '교과자료.pdf').trim();
  if (/\.(pdf|hwp|hwpx)$/i.test(trimmed)) return trimmed;
  const ext = (fallbackType || 'PDF').toLowerCase();
  if (ext === 'hwp' || ext === 'hwpx' || ext === 'pdf') return `${trimmed}.${ext}`;
  return `${trimmed}.pdf`;
}

async function fetchDriveFileViaGas(fileId: string, gasUrl: string): Promise<{ base64: string; fileName?: string }> {
  const endpoint = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=getFileBase64&fileId=${encodeURIComponent(fileId)}`;

  // 1) Try standard CORS GET
  try {
    const res = await fetch(endpoint, { method: 'GET', mode: 'cors' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.base64) {
        return { base64: json.base64, fileName: json.fileName };
      }
      if (json && json.error) {
        throw new Error(json.error);
      }
    }
  } catch {
    // Proceed to JSONP fallback
  }

  // 2) JSONP fallback for Apps Script redirects
  return new Promise((resolve, reject) => {
    const callbackName = 'crowshow_gas_cb_' + Math.round(1000000 * Math.random());
    const script = document.createElement('script');
    const win = window as unknown as Record<string, unknown>;
    const timer = window.setTimeout(() => {
      if (win[callbackName]) {
        delete win[callbackName];
        script.remove();
        reject(new Error('Google Drive 원격 로딩 시간이 초과되었습니다.'));
      }
    }, 15000);

    win[callbackName] = (data: { success?: boolean; base64?: string; fileName?: string; error?: string }) => {
      window.clearTimeout(timer);
      delete win[callbackName];
      script.remove();
      if (data && data.success && data.base64) {
        resolve({ base64: data.base64, fileName: data.fileName });
      } else {
        reject(new Error(data?.error || 'Google Apps Script에서 파일 데이터를 반환하지 않았습니다.'));
      }
    };

    script.src = `${endpoint}&callback=${callbackName}`;
    script.onerror = () => {
      window.clearTimeout(timer);
      delete win[callbackName];
      script.remove();
      reject(new Error('Google Drive 브리지 연결에 실패했습니다.'));
    };
    document.body.appendChild(script);
  });
}

export async function fetchRemoteDocument(query: RemoteDocumentQuery): Promise<RemoteDocumentPayload> {
  const preferredName = ensureExtension(query.title || '수업자료', query.type);

  // 1. Direct URL (same-origin or CORS-enabled URL)
  if (query.url) {
    const res = await fetch(query.url);
    if (!res.ok) throw new Error(`문서를 불러올 수 없습니다 (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const urlName = query.url.split('/').pop()?.split('?')[0] || preferredName;
    return {
      bytes: new Uint8Array(buf),
      fileName: query.title ? preferredName : ensureExtension(decodeURIComponent(urlName), query.type),
    };
  }

  // 2. Google Drive fileId
  if (query.fileId) {
    let gasUrl = DEFAULT_GAS_URL;
    try {
      const savedGas = localStorage.getItem('CROW_GAS_URL');
      if (savedGas && savedGas.startsWith('https://')) gasUrl = savedGas;
    } catch {
      // Use default
    }

    const { base64, fileName } = await fetchDriveFileViaGas(query.fileId, gasUrl);
    return {
      bytes: decodeBase64ToBytes(base64),
      fileName: ensureExtension(query.title || fileName || preferredName, query.type),
    };
  }

  throw new Error('불러올 문서의 URL 또는 파일 ID가 지정되지 않았습니다.');
}

export function buildDriveUrls(fileId?: string, url?: string): { previewUrl: string; downloadUrl: string } {
  if (fileId) {
    return {
      previewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    };
  }
  return {
    previewUrl: url || '#',
    downloadUrl: url || '#',
  };
}
