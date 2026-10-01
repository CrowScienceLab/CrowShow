const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');

function load(source, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => dependencies[name], crypto: webcrypto,
    console, Uint8Array, ArrayBuffer, Date, URL, queueMicrotask,
    document: { baseURI: 'http://localhost:5173/' },
  }, { filename: source });
  return exports;
}

async function main() {
  const { PdfCache } = load('src/pdf/pdfCache.ts');
  const cache = new PdfCache();
  const a = {}, b = {}, canvasA = {}, canvasB = {};
  cache.set(a, 1, 1, canvasA, 100, 100);
  assert.equal(cache.get(b, 1, 1), undefined, 'another PDF must not reuse the first PDF page');
  cache.set(b, 1, 1, canvasB, 100, 100);
  assert.equal(cache.get(a, 1, 1).canvas, canvasA);
  assert.equal(cache.get(b, 1, 1).canvas, canvasB);
  assert.equal(cache.get(a, 1, 1.001), undefined, 'different scales must not share rounded keys');
  for (let p = 2; p <= 15; p++) cache.set(a, p, 1, {}, 100, 100);
  cache.set(a, 15, 1, canvasA, 100, 100);
  assert.equal(cache.cache.size, 16, 'replacing an entry must not evict another page');
  cache.clear();
  assert.equal(cache.get(a, 1, 1), undefined);
  let releasePage;
  const delayedPage = new Promise(resolve => { releasePage = resolve; });
  const pendingRender = cache.renderOffscreen({ getPage: () => delayedPage }, 1, 1);
  cache.clear();
  releasePage({});
  await assert.rejects(pendingRender, { name: 'RenderingCancelledException' },
    'clearing the cache while a page is loading must prevent stale background renders');

  const tasks = [];
  const pagesRequested = [];
  const documentOptions = [];
  let releaseSlow;
  const slow = new Promise((resolve) => { releaseSlow = resolve; });
  const pdfjs = {
    GlobalWorkerOptions: {},
    PDFDataRangeTransport: class {
      constructor(length, initialData) { this.length = length; this.initialData = initialData; }
      onDataRange(begin, chunk) { this.delivered = { begin, chunk }; }
    },
    getDocument(options) {
      documentOptions.push(options);
      const data = options.data ?? options.range.bytes;
      assert.match(options.cMapUrl, /\/pdfjs\/cmaps\/$/);
      assert.equal(options.cMapPacked, true);
      assert.match(options.standardFontDataUrl, /\/pdfjs\/standard_fonts\/$/);
      assert.match(options.wasmUrl, /\/pdfjs\/wasm\/$/);
      assert.match(options.iccUrl, /\/pdfjs\/iccs\/$/);
      const task = {
        destroyed: false,
        async destroy() { this.destroyed = true; },
        promise: data[0] === 5 ? Promise.reject(new Error('invalid document header')) : Promise.resolve({ numPages: 500, async getPage(pageNumber) {
          pagesRequested.push(pageNumber);
          if (data[0] === 0) throw new Error('invalid PDF');
          if (data[0] === 3) await slow;
          return { getViewport: () => ({ width: 800, height: 600 }) };
        } }),
      };
      tasks.push(task);
      return task;
    },
  };
  const { PdfLoader } = load('src/pdf/pdfLoader.ts', {
    'pdfjs-dist': pdfjs, 'pdfjs-dist/build/pdf.worker.min.mjs?url': { default: 'mock-worker' },
  });
  const loader = new PdfLoader();
  await loader.loadFromBuffer(new Uint8Array([1]), 'first.pdf');
  assert.deepEqual(pagesRequested, [1], 'opening a 500-page PDF must only inspect its first page');
  const first = loader.getPdfDocument();
  await assert.rejects(loader.loadFromBuffer(new Uint8Array([0]), 'broken.pdf'));
  assert.equal(loader.getPdfDocument(), first, 'failed replacement must preserve the open document');
  assert.equal(tasks[1].destroyed, true, 'failed task must release its worker');
  await loader.loadFromBuffer(new Uint8Array([2]), 'second.pdf');
  assert.equal(tasks[0].destroyed, true, 'successful replacement must release the previous worker');
  const pending = loader.loadFromBuffer(new Uint8Array([3]), 'slow.pdf');
  await loader.loadFromBuffer(new Uint8Array([4]), 'latest.pdf');
  releaseSlow();
  await assert.rejects(pending, /superseded/);
  assert.equal(loader.getDocumentInfo().name, 'latest.pdf');
  assert.equal(tasks[3].destroyed, true);
  await loader.destroy();
  assert.equal(loader.getPdfDocument(), null);
  assert.equal(tasks[4].destroyed, true);
  await assert.rejects(loader.loadFromBuffer(new Uint8Array([5]), 'invalid-header.pdf'));
  assert.equal(tasks[5].destroyed, true, 'failure before document parsing must release its worker');
  const largeBytes = new Uint8Array(768 * 1024).fill(6);
  const largeInfo = await loader.loadFromBuffer(largeBytes, 'large.pdf');
  const options = documentOptions.at(-1);
  assert.equal(options.data, undefined, 'large PDFs must not transfer the entire buffer to the worker');
  assert.equal(options.range.initialData.byteLength, 256 * 1024);
  assert.equal(options.disableAutoFetch, true);
  assert.equal(options.disableStream, true);
  options.range.requestDataRange(256 * 1024, 512 * 1024);
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(options.range.delivered.begin, 256 * 1024);
  assert.equal(options.range.delivered.chunk.byteLength, 256 * 1024);
  const digest = await webcrypto.subtle.digest('SHA-256', largeBytes);
  const legacyId = `pdf_${Buffer.from(digest).subarray(0, 12).toString('hex')}`;
  assert.equal(largeInfo.id, legacyId, 'partial worker loading must preserve existing annotation IDs');
  assert.equal(largeBytes.byteLength, 768 * 1024, 'the original PDF bytes must remain available for export');
  await loader.destroy();
  console.log('PASS: document cache isolation, scale accuracy, LRU replacement, cache clear, failed PDF recovery, worker disposal, concurrent PDF loading.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
