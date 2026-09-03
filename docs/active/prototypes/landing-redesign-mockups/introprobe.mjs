// One TSV row per animation frame from the moment the page starts, for the
// first N ms: where the download pill actually is, how opaque it is, and what
// it is positioned against. scrollprobe.mjs answers the same shape of question
// for SCROLL; this one answers it for the INTRO, which is over before any
// post-load tool (evalpage's 5s settle, viewshots' 6s) can look at it.
//
//   node introprobe.mjs http://localhost:8901/mockup-landing.html [ms]
//
// VS_W / VS_H set the viewport, as everywhere else in this prototype.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [url, msArg] = process.argv.slice(2);
const MS = Number(msArg || 4200);
const PORT = Number(process.env.CDP_PORT || 9946);
const profile = mkdtempSync(join(tmpdir(), 'ip-'));
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, `--window-size=${process.env.VS_W || 1440},${process.env.VS_H || 900}`,
  '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const sock = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = new Map();
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');

// Installed BEFORE the document runs, so frame 1 is the first paint and not
// whatever the page had already settled into by the time we attached.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__rows = [];
  (function tick(){
    requestAnimationFrame(tick);
    var p = document.querySelector('.dlfloat'); if (!p) return;
    var r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    // The effective opacity is the product of every ancestor's, because the
    // intro fades .hero-app — an ancestor — and not the pill itself.
    var op = 1, n = p;
    while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    var ha = document.querySelector('.hero-app');
    window.__rows.push([Math.round(performance.now()), Math.round(r.top), Math.round(r.height),
      op.toFixed(3), cs.position, (ha ? getComputedStyle(ha).transform : '-').replace(/matrix.*, /, 'ty='),
      document.body.classList.contains('intro-mode') ? 1 : 0]);
  })();
` });
await send('Page.navigate', { url });
await sleep(MS);
const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__rows)', returnByValue: true });
const rows = JSON.parse(r.result.value || '[]');
console.log(['t', 'pillTop', 'pillH', 'opacity', 'position', 'heroAppTransform', 'introMode'].join('\t'));
// Only the frames where something CHANGED — 250 identical rows hide the jump.
let prev = null;
for (const row of rows) {
  const key = row.slice(1).join('|');
  if (key !== prev) { console.log(row.join('\t')); prev = key; }
}
console.log('# frames sampled:', rows.length, '· viewport height:', process.env.VS_H || 900);
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
