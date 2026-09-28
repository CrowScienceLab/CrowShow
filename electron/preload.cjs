const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crowShowDesktop', {
  getInitialPdf: () => ipcRenderer.invoke('desktop:get-initial-pdf'),
  readPdf: (filePath) => ipcRenderer.invoke('desktop:read-pdf', filePath),
  onOpenPdf: (callback) => {
    const listener = async (_event, filePath) => callback(await ipcRenderer.invoke('desktop:read-pdf', filePath));
    ipcRenderer.on('desktop:open-pdf', listener);
    return () => ipcRenderer.removeListener('desktop:open-pdf', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-update'),
  openPdfDefaults: () => ipcRenderer.invoke('desktop:open-pdf-defaults'),
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
});
