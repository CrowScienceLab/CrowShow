import type { RecentPdfDocument } from '../types/pdf';

const DB_NAME = 'crowshow_documents';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

interface StoredPdfRecord extends RecentPdfDocument {
  bytes: ArrayBuffer;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfDocument(record: StoredPdfRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPdfDocument(id: string): Promise<StoredPdfRecord | null> {
  const db = await openDatabase();
  const result = await new Promise<StoredPdfRecord | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as StoredPdfRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}
