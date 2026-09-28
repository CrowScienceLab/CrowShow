interface CrowShowPdfPayload {
  name: string;
  size: number;
  bytes: Uint8Array;
}

interface CrowShowDesktopBridge {
  getInitialPdf(): Promise<CrowShowPdfPayload | null>;
  readPdf(filePath: string): Promise<CrowShowPdfPayload | null>;
  onOpenPdf(callback: (payload: CrowShowPdfPayload | null) => void): () => void;
  checkForUpdates(): Promise<{ status: string; version?: string; error?: string }>;
  openPdfDefaults(): Promise<void>;
  getInfo(): Promise<{ name: string; version: string; publisher: string; releasesUrl: string }>;
}

interface Window {
  crowShowDesktop?: CrowShowDesktopBridge;
}
