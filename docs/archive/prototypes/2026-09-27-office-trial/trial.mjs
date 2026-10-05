// Trial: open each sample in the embedded editor, time it, screenshot it,
// make one small edit, save it back through the embed API, and write the
// saved bytes to out/ so a separate script can compare them to the original.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad';
const require = createRequire(path.join(S, 'document/package.json'));
const { chromium } = require('@playwright/test');

const HOST = 'http://127.0.0.1:4718/host.html';
const OUT = path.join(S, 'rig/out');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const samples = fs.readdirSync(path.join(S, 'samples')).filter((f) => !only.length || only.includes(f));
const size = (process.env.SIZE || '1440x900').split('x').map(Number);

function chromeRssMB(pid) {
  // Sum resident memory of the whole browser process tree we launched.
  try {
    const out = execSync(`ps -o rss= --ppid ${pid}; ps -o rss= -p ${pid}`).toString();
    const kids = execSync(`pgrep -P ${pid} || true`).toString().split(/\s+/).filter(Boolean);
    let kb = out.split(/\s+/).filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
    for (const k of kids) {
      const g = execSync(`pgrep -P ${k} || true`).toString().split(/\s+/).filter(Boolean);
      for (const gg of g) kb += Number(execSync(`ps -o rss= -p ${gg} || echo 0`).toString().trim() || 0);
    }
    return Math.round(kb / 1024);
  } catch { return null; }
}

const results = [];
for (const name of samples) {
  const browser = await chromium.launch({ executablePath: '/home/destin/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--enable-precise-memory-info'] });
  const pid = browser.process?.()?.pid;
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const r = { name, errors };
  const t0 = Date.now();
  await page.goto(HOST);
  await page.waitForFunction(() => window.__events.some((e) => e.type === 'document:ready'), null, { timeout: 120000 });
  r.readyMs = Date.now() - t0;
  const bytes = fs.readFileSync(path.join(S, 'samples', name));
  const t1 = Date.now();
  const opened = await page.evaluate(async ({ b64, name }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await window.send('document:open-buffer', { fileName: name, buffer: bin.buffer, readonly: false });
  }, { b64: bytes.toString('base64'), name });
  r.openReply = opened.type + (opened.payload?.message ? `: ${opened.payload.message}` : '');
  r.openMs = Date.now() - t1;
  // "opened" fires when the editor accepts the file; give the canvas time to paint.
  await page.waitForTimeout(6000);
  r.rssMB = Math.round(Number(execSync(`ps -eo rss,args | grep -F chromium-1243 | grep -v grep | awk '{s+=$1} END {print s}'`).toString().trim()) / 1024);
  await page.screenshot({ path: path.join(OUT, `${name}.open.png`) });

  // One small edit: click into the document canvas and type a marker.
  const frame = page.frames().find((f) => f.url().includes('/editor'));
  try {
    await page.mouse.click(size[0] / 2, size[1] / 2);
    await page.keyboard.type('YCTRIAL', { delay: 20 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${name}.edited.png`) });
  } catch (e) { r.editErr = String(e).slice(0, 200); }

  const t2 = Date.now();
  const saved = await page.evaluate(async () => {
    const d = await window.send('document:save', {});
    if (d.type !== 'document:saved') return { type: d.type, message: d.payload?.message };
    const f = d.payload.file;
    const buf = new Uint8Array(await f.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { type: d.type, fileName: f.name, b64: btoa(s) };
  });
  r.saveMs = Date.now() - t2;
  if (saved.b64) {
    fs.writeFileSync(path.join(OUT, `saved-${name}`), Buffer.from(saved.b64, 'base64'));
    r.savedBytes = Buffer.from(saved.b64, 'base64').length;
    r.origBytes = bytes.length;
  } else r.saveReply = `${saved.type}: ${saved.message}`;
  r.frameFound = !!frame;
  results.push(r);
  console.log(JSON.stringify(r));
  await browser.close();
}
fs.writeFileSync(path.join(OUT, `results-${size.join('x')}.json`), JSON.stringify(results, null, 2));
