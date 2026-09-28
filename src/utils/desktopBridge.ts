export interface DesktopPdfPayload {
  name: string;
  size: number;
  bytes: number[] | Uint8Array;
}

interface UpdateCheckResult {
  status: 'current' | 'available' | 'no-release' | 'error';
  version?: string;
  assetName?: string;
  assetUrl?: string;
  checksumUrl?: string;
  releaseUrl?: string;
  error?: string;
}

const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

export const isDesktopApp = () => isTauri() || Boolean(window.crowShowDesktop);

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

export async function checkForDesktopUpdates(manual = true): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const update = await invoke<UpdateCheckResult>('check_for_updates');
      if (update.status === 'current') {
        if (manual) alert(`CrowShow v${update.version ?? '1.0'}은 최신 버전입니다.`);
        return;
      }
      if (update.status === 'no-release') {
        if (manual) alert('게시된 정식 릴리스가 아직 없습니다.');
        return;
      }
      if (update.status !== 'available') throw new Error(update.error || '업데이트 정보를 확인할 수 없습니다.');
      if (!confirm(`CrowShow v${update.version} 업데이트를 다운로드하고 설치하시겠습니까?`)) return;
      await invoke('download_and_install_update', {
        version: update.version,
        assetName: update.assetName,
        assetUrl: update.assetUrl,
        checksumUrl: update.checksumUrl,
      });
    } catch (error) {
      console.error(error);
      if (manual) alert(`업데이트 확인에 실패했습니다.\n${String(error)}`);
    }
    return;
  }
  await window.crowShowDesktop?.checkForUpdates();
}

export async function openPdfDefaultApps(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_pdf_defaults');
    return;
  }
  await window.crowShowDesktop?.openPdfDefaults();
}
