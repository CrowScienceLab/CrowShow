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
    console, Uint8Array, ArrayBuffer, Date,
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

  const tasks = [];
  let releaseSlow;
  const slow = new Promise((resolve) => { releaseSlow = resolve; });
  const pdfjs = {
    GlobalWorkerOptions: {},
    getDocument({ data }) {
      const task = {
        destroyed: false,
        async destroy() { this.destroyed = true; },
        promise: Promise.resolve({ numPages: 1, async getPage() {
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
  console.log('PASS: document cache isolation, scale accuracy, LRU replacement, cache clear, failed PDF recovery, worker disposal, concurrent PDF loading.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
