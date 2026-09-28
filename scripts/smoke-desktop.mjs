import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executable = path.resolve('release', 'win-unpacked', 'CrowShow.exe');
const profile = await mkdtemp(path.join(os.tmpdir(), 'crowshow-smoke-'));
const port = 19338;
const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
  stdio: 'ignore',
  windowsHide: true,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getDebugTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'));
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // The debug endpoint is not ready yet.
    }
    await delay(250);
  }
  throw new Error('CrowShow renderer did not expose a debug target.');
}

async function evaluate(webSocketUrl, expression) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP evaluation timed out.')), 5000);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      resolve(message);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true },
    }));
  });
  socket.close();
  return result.result?.result?.value;
}

try {
  const target = await getDebugTarget();
  const result = await evaluate(target.webSocketDebuggerUrl, `({
    readyState: document.readyState,
    text: document.body.innerText,
    hasDesktopBridge: Boolean(window.crowShowDesktop),
    scriptCount: document.scripts.length,
  })`);
  if (result?.readyState !== 'complete') throw new Error(`Unexpected ready state: ${result?.readyState}`);
  if (!result?.hasDesktopBridge) throw new Error('Desktop preload bridge is missing.');
  if (!result?.text?.includes('체험용 5-슬라이드 바로 열기')) throw new Error('CrowShow start screen was not rendered.');
  if (!result?.scriptCount) throw new Error('Renderer scripts were not loaded.');
  process.stdout.write(JSON.stringify({ ok: true, ...result, text: 'CrowShow start screen rendered' }, null, 2));
} finally {
  child.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true });
}
