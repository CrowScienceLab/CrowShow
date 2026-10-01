import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep PDF.js resources local so Korean/CJK PDFs also work offline.
const destination = resolve('public/pdfjs');
mkdirSync(destination, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(resolve('node_modules/pdfjs-dist', directory), resolve(destination, directory), { recursive: true });
}
cpSync(resolve('node_modules/pdfjs-dist/LICENSE'), resolve(destination, 'LICENSE'));
