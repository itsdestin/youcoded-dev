#!/usr/bin/env node
// Shoots the landing page's demo stills: the picture that sits in the demo
// window until the real app has loaded behind it.
//
// WHY THIS EXISTS (2026-09-14): the desktop still was one hand-taken Midnight
// shot from 2026-08-28. The page never wears Midnight -- it rests on Cotton Candy
// Sky -- so every desktop visitor saw a grey, differently-shaped app sitting in
// the window for ~3 seconds (the demo waits for the intro since 2026-09-11) and
// then the real, themed one "popped in" over it. Destin: "this feels like it's
// broken." The phone stills were per-theme but shot by hand, with nothing to
// regenerate them. This makes both from the BUILT embed the site serves, in
// every theme the page can wear before the demo starts, at the demo box's own
// shape, so the still and the live app are the same picture.
//
// Everything it needs is read off the page itself -- which themes (POSTER_THEMES),
// the box's size at a desktop and a phone width (.embed-stage), the embed's URL
// (the iframe's data-src) and the phone-only stylesheet (PHONE_EMBED_CSS) -- so
// the page and its stills cannot disagree about any of them.
//
// Usage: node scripts/ui-review/embed-posters.mjs <path/to/youcoded/docs>
//   Writes <docs>/media/embed-desktop-<theme>.webp and embed-phone-<theme>.webp.
//   Run AFTER `npm run build:site` (site-assets.sh does). Writes nothing unless
//   every still proved the app had painted in its theme.
//   CDP_PORT=10390 to move the throw-away Chrome off its default port.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize } from 'node:path';
import { CHROME_FLAGS, waitForCdp } from './cdp-helpers.mjs';

const DOCS = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(DOCS, 'index.html')) || !existsSync(join(DOCS, 'site', 'index.html'))) {
  console.error('usage: node embed-posters.mjs <youcoded/docs>  (needs index.html and a built site/index.html)');
  process.exit(2);
}
const CDP_PORT = Number(process.env.CDP_PORT ?? 10390);
// The two layouts that pick a still: setEmbedPoster() uses the phone still at
// <=760px and the desktop one above. Measured at a common size of each.
const LAYOUTS = [{ name: 'desktop', page: [1440, 900] }, { name: 'phone', page: [390, 844] }];
const SCALE = 2;          // retina-sharp; the phone stills were already 2x
const READY_MAX = 30000;
const SETTLE = 1500;      // entrance animations and moving backgrounds come to rest

// ── a static server for docs/, on a free port ────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jsonl': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webm': 'video/webm', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(DOCS, p);
  if (!file.startsWith(DOCS)) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), 'embed-posters-'));
const staging = mkdtempSync(join(tmpdir(), 'embed-posters-out-'));
const chrome = spawn('google-chrome-stable', CHROME_FLAGS(1440, 900, CDP_PORT, profile), { stdio: 'ignore' });
const cleanup = () => {
  chrome.kill(); server.close();
  for (const d of [profile, staging]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
};
process.on('exit', cleanup);
await waitForCdp(CDP_PORT);

async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const waitUntil = async (expr, what) => {
    for (const t0 = Date.now(); Date.now() - t0 < READY_MAX;) {
      if (await evaluate(`!!(${expr})`).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const close = async () => { try { ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`); } catch { /* gone */ } };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, evaluate, waitUntil, close };
}

// The app has painted, in the theme we asked for, with its wallpaper decoded.
// Same bar the page's whenEmbedPainted() holds the live swap to, plus the
// seeded conversation, which the still must show.
const PAINTED = (theme) => `(async () => {
  if (localStorage.getItem('youcoded-theme') !== ${JSON.stringify(theme)}) return false;
  if (!document.querySelector('.input-bar-container')) return false;
  if (document.body.innerText.trim().length < 200) return false;
  if (document.fonts.status !== 'loaded') return false;
  const bg = document.getElementById('theme-bg');
  const m = bg && /url\\("?([^")]+)"?\\)/.exec(getComputedStyle(bg).backgroundImage);
  if (m) { const im = new Image(); im.src = m[1]; try { await im.decode(); } catch { return false; } }
  return true;
})()`;

let failed = 0;
const written = [];
for (const layout of LAYOUTS) {
  const [pw, ph] = layout.page;
  const page = await tab();
  await page.send('Emulation.setDeviceMetricsOverride', { width: pw, height: ph, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `${ORIGIN}/index.html` });
  await page.waitUntil(`document.readyState === 'complete' && typeof POSTER_THEMES !== 'undefined' && document.querySelector('.embed-stage')`, 'the landing page');
  const info = await page.evaluate(`(() => {
    const r = document.querySelector('.embed-stage').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), themes: POSTER_THEMES,
             src: new URL(document.querySelector('.embed-iframe').dataset.src, location.href).href,
             css: ${layout.name === 'phone' ? 'PHONE_EMBED_CSS' : "''"} };
  })()`);
  await page.close();
  console.log(`[embed-posters] ${layout.name}: box ${info.w}x${info.h} at a ${pw}x${ph} page; themes ${info.themes.join(', ')}`);

  for (const theme of info.themes) {
    const name = `embed-${layout.name}-${theme}`;
    const t = await tab();
    try {
      await t.send('Emulation.setDeviceMetricsOverride', { width: info.w, height: info.h, deviceScaleFactor: SCALE, mobile: false });
      await t.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(theme)});}catch{}` });
      await t.send('Page.navigate', { url: info.src });
      await t.waitUntil(`document.readyState === 'complete'`, 'the embed to load');
      // The page injects this into the phone embed on load (stripEmbedChrome); the still does the same.
      if (info.css) await t.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(info.css)}; document.head.appendChild(s); })()`);
      await t.waitUntil(PAINTED(theme), `${theme} to paint`);
      await new Promise((r) => setTimeout(r, SETTLE));
      const shot = await t.send('Page.captureScreenshot', { format: 'png' });
      const png = join(staging, `${name}.png`);
      writeFileSync(png, Buffer.from(shot.data, 'base64'));
      const conv = spawnSync('magick', [png, '-quality', '82', join(staging, `${name}.webp`)], { encoding: 'utf8' });
      if (conv.status !== 0) throw new Error(`magick: ${conv.stderr.trim()}`);
      written.push(name);
      console.log(`ok   ${name} (${info.w * SCALE}x${info.h * SCALE})`);
    } catch (e) {
      failed += 1;
      console.log(`MISS ${name}: ${e.message}`);
    } finally { await t.close(); }
  }
}

if (failed) {
  console.error(`[embed-posters] ${failed} still(s) did not prove the app had painted -- wrote nothing; the previous stills are untouched.`);
  process.exit(1);
}
// copy, not rename: the scratch dir is often a different filesystem (tmpfs), and rename across one throws EXDEV.
for (const name of written) copyFileSync(join(staging, `${name}.webp`), join(DOCS, 'media', `${name}.webp`));
console.log(`[embed-posters] wrote ${written.length} stills to ${join(DOCS, 'media')}`);
process.exit(0);
