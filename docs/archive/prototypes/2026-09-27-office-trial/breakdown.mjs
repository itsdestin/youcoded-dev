// Where does the memory and load time go? Opens one file and reports:
// JS heap per frame, WebAssembly (translator) memory per worker, and a timeline
// of every network fetch and console line during the open.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad';
const require = createRequire(path.join(S, 'document/package.json'));
const { chromium } = require('@playwright/test');
const EXE = fs.readdirSync(`${process.env.HOME}/.cache/ms-playwright/chromium-1243`).map((d) => `${process.env.HOME}/.cache/ms-playwright/chromium-1243/${d}/chrome`).find(fs.existsSync);
const name = process.argv[2];

const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto('http://127.0.0.1:4718/host.html');
await page.waitForFunction(() => window.__events.some((e) => e.type === 'document:ready'), null, { timeout: 120000 });
const t0 = Date.now();
const timeline = [];
page.on('request', (r) => { const u = r.url(); if (/x2t|sdk-all|app\.js|AllFonts|fonts\/|Editor\.bin|\.wasm/.test(u)) timeline.push([Date.now() - t0, 'fetch', u.replace(/.*127\.0\.0\.1:4717/, '').slice(0, 70)]); });
page.on('console', (m) => timeline.push([Date.now() - t0, 'log', m.text().slice(0, 110)]));
page.on('worker', (w) => timeline.push([Date.now() - t0, 'worker', w.url().replace(/.*4717/, '').slice(0, 70)]));
const bytes = fs.readFileSync(path.join(S, 'samples', name));
await page.evaluate(async ({ b64, name }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return window.send('document:open-buffer', { fileName: name, buffer: bin.buffer });
}, { b64: bytes.toString('base64'), name });
timeline.push([Date.now() - t0, 'opened-reply']);
// wait for visible
for (;;) {
  let ok = false;
  for (const f of page.frames()) {
    if (!/web-apps\/apps/.test(f.url())) continue;
    ok = await f.evaluate(() => ![...document.querySelectorAll('.asc-loadmask, .loadmask')].some((m) => m.offsetParent !== null) && !!document.querySelector('#editor_sdk, #ws-canvas-outer, #id_main_view')).catch(() => false);
    if (ok) break;
  }
  if (ok || Date.now() - t0 > 120000) break;
  await new Promise((r) => setTimeout(r, 100));
}
timeline.push([Date.now() - t0, 'VISIBLE']);
await page.waitForTimeout(2000);

const mem = [];
for (const f of page.frames()) {
  const m = await f.evaluate(() => ({ used: performance.memory?.usedJSHeapSize, total: performance.memory?.totalJSHeapSize })).catch(() => null);
  if (m) mem.push([f.url().replace(/.*127\.0\.0\.1:47\d\d/, '').slice(0, 60) || 'host', Math.round(m.used / 1048576) + ' MB JS used', Math.round(m.total / 1048576) + ' MB JS reserved']);
}
for (const w of page.workers()) {
  const m = await w.evaluate(() => {
    const seen = new Set(); let wasm = 0;
    for (const k of Object.getOwnPropertyNames(self)) {
      try { const v = self[k]; const mm = v && (v.wasmMemory || v.HEAP8 && v.HEAP8.buffer); const buf = mm && (mm.buffer || mm); if (buf && buf.byteLength && !seen.has(buf)) { seen.add(buf); wasm += buf.byteLength; } } catch {}
    }
    return { wasm, js: performance.memory?.usedJSHeapSize };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  mem.push(['worker ' + w.url().replace(/.*4717/, '').slice(0, 50), m.wasm != null ? Math.round(m.wasm / 1048576) + ' MB wasm' : m.err, m.js ? Math.round(m.js / 1048576) + ' MB JS' : '']);
}
// Whole-process view from the browser itself.
const pm = await cdp.send('Memory.getDOMCounters').catch(() => null);
console.log('TIMELINE'); for (const t of timeline) console.log('  ', t.join('  '));
console.log('MEMORY'); for (const m of mem) console.log('  ', m.join('  |  '));
if (pm) console.log('DOM', JSON.stringify(pm));
await browser.close();
