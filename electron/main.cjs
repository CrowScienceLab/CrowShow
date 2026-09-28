const { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } = require('electron');
const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const APP_NAME = 'CrowShow';
const REPOSITORY = 'CrowScienceLab/CrowShow';
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const MAX_INSTALLER_BYTES = 350 * 1024 * 1024;

let mainWindow = null;
let pendingPdfPath = null;
let updateCheckRunning = false;

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split('-')[0];
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
  const b = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length, 3); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
}

function findPdfPath(args) {
  return args.find((arg) => typeof arg === 'string' && /\.pdf$/i.test(arg) && existsSync(arg)) || null;
}

async function readPdfPayload(filePath) {
  if (!filePath || !/\.pdf$/i.test(filePath) || !existsSync(filePath)) return null;
  const bytes = await readFile(filePath);
  return { name: path.basename(filePath), size: bytes.byteLength, bytes };
}

function isOfficialReleaseAsset(asset) {
  if (!asset?.browser_download_url || !asset?.name) return false;
  try {
    const url = new URL(asset.browser_download_url);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith(`/${REPOSITORY}/releases/download/`);
  } catch {
    return false;
  }
}

async function fetchLatestRelease() {
  const response = await net.fetch(RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${APP_NAME}/${app.getVersion()}`,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 응답 오류 (${response.status})`);
  return response.json();
}

async function downloadAsset(asset, destination) {
  if (!isOfficialReleaseAsset(asset)) throw new Error('공식 CrowShow 릴리스 주소가 아닙니다.');
  if (Number(asset.size) > MAX_INSTALLER_BYTES) throw new Error('업데이트 파일 크기가 허용 범위를 초과했습니다.');
  const response = await net.fetch(asset.browser_download_url, {
    headers: { 'User-Agent': `${APP_NAME}/${app.getVersion()}` },
  });
  if (!response.ok) throw new Error(`다운로드 오류 (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > MAX_INSTALLER_BYTES || (asset.size && data.byteLength !== Number(asset.size))) {
    throw new Error('다운로드 파일 크기가 GitHub 정보와 일치하지 않습니다.');
  }
  await writeFile(destination, data);
  return data;
}

async function checkForUpdates({ manual = false } = {}) {
  if (updateCheckRunning) return { status: 'busy' };
  updateCheckRunning = true;
  try {
    const release = await fetchLatestRelease();
    if (!release) {
      if (manual) await dialog.showMessageBox(mainWindow, { type: 'info', title: 'CrowShow 업데이트', message: '게시된 정식 릴리스가 아직 없습니다.' });
      return { status: 'no-release' };
    }

    const latestVersion = normalizeVersion(release.tag_name);
    if (compareVersions(latestVersion, app.getVersion()) <= 0) {
      if (manual) await dialog.showMessageBox(mainWindow, { type: 'info', title: 'CrowShow 업데이트', message: `CrowShow ${app.getVersion()}은 최신 버전입니다.` });
      return { status: 'current', version: latestVersion };
    }

    const installerName = `CrowShow-v${latestVersion}-Setup-x64.exe`;
    const installer = release.assets?.find((asset) => asset.name === installerName);
    const checksums = release.assets?.find((asset) => asset.name === 'SHA256SUMS.txt');
    if (!installer || !checksums) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'CrowShow 업데이트',
        message: `CrowShow ${latestVersion} 버전이 있지만 검증 가능한 설치 파일이 없습니다.`,
        detail: '공식 GitHub 릴리스 페이지를 확인하시겠습니까?',
        buttons: ['취소', 'GitHub 열기'],
        defaultId: 1,
        cancelId: 0,
      });
      if (result.response === 1) await shell.openExternal(release.html_url || RELEASES_URL);
      return { status: 'missing-assets', version: latestVersion };
    }

    const consent = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'CrowShow 업데이트',
      message: `CrowShow ${latestVersion} 버전을 사용할 수 있습니다.`,
      detail: '공식 GitHub 설치 파일을 다운로드하고 SHA-256을 검증한 뒤 업데이트하시겠습니까?',
      buttons: ['나중에', '다운로드'],
      defaultId: 1,
      cancelId: 0,
    });
    if (consent.response !== 1) return { status: 'declined', version: latestVersion };

    const updateDir = path.join(app.getPath('temp'), 'CrowShow-updates', latestVersion);
    await mkdir(updateDir, { recursive: true });
    const installerPath = path.join(updateDir, installerName);
    const checksumPath = path.join(updateDir, 'SHA256SUMS.txt');
    const checksumBytes = await downloadAsset(checksums, checksumPath);
    await downloadAsset(installer, installerPath);

    const checksumText = checksumBytes.toString('utf8');
    const escapedName = installerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expected = checksumText.match(new RegExp(`^([a-f0-9]{64})\\s+[*]?${escapedName}$`, 'im'))?.[1]?.toLowerCase();
    if (!expected) throw new Error('SHA256SUMS.txt에서 설치 파일 해시를 찾을 수 없습니다.');
    const actual = createHash('sha256').update(await readFile(installerPath)).digest('hex');
    if (actual !== expected) throw new Error('설치 파일 SHA-256 검증에 실패했습니다.');

    const installConsent = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'CrowShow 업데이트 준비 완료',
      message: `CrowShow ${latestVersion} 설치 파일을 안전하게 확인했습니다.`,
      detail: '설치 프로그램을 실행하면 CrowShow가 종료됩니다.',
      buttons: ['취소', '설치 실행'],
      defaultId: 1,
      cancelId: 0,
    });
    if (installConsent.response !== 1) return { status: 'downloaded', version: latestVersion, installerPath };

    const openError = await shell.openPath(installerPath);
    if (openError) throw new Error(openError);
    app.quit();
    return { status: 'installing', version: latestVersion };
  } catch (error) {
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: '업데이트 확인 실패',
        message: 'CrowShow 업데이트를 확인하거나 설치할 수 없습니다.',
        detail: String(error?.message || error),
      });
    }
    return { status: 'error', error: String(error?.message || error) };
  } finally {
    updateCheckRunning = false;
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'CrowShow',
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:') && url.includes('audience=1')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 720, autoHideMenuBar: true } };
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    console.error('CrowShow renderer load failure:', code, description, validatedUrl);
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingPdfPath) mainWindow.webContents.send('desktop:open-pdf', pendingPdfPath);
    if (app.isPackaged) setTimeout(() => checkForUpdates({ manual: false }), 1800);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const pdfPath = findPdfPath(argv);
    if (pdfPath && mainWindow) mainWindow.webContents.send('desktop:open-pdf', pdfPath);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('CrowScienceLab.CrowShow');
    pendingPdfPath = findPdfPath(process.argv);
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());

ipcMain.handle('desktop:get-initial-pdf', async () => {
  const selected = pendingPdfPath;
  pendingPdfPath = null;
  return readPdfPayload(selected);
});
ipcMain.handle('desktop:read-pdf', (_event, filePath) => readPdfPayload(filePath));
ipcMain.handle('desktop:check-update', () => checkForUpdates({ manual: true }));
ipcMain.handle('desktop:open-pdf-defaults', () => shell.openExternal('ms-settings:defaultapps?registeredAppUser=CrowShow'));
ipcMain.handle('desktop:get-info', () => ({
  name: APP_NAME,
  version: app.getVersion(),
  publisher: 'Crow Science Lab',
  releasesUrl: RELEASES_URL,
}));
