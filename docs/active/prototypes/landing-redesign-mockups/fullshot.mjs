// Minimal CDP full-page screenshot: boots headless Chrome, forces every
// scroll-reveal element visible, and captures the whole document height.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const out = process.argv[3];
const W = Number(process.argv[4] || 1440);
const PORT = Number(process.env.CDP_PORT || 9971);
const profile = mkdtempSync(join(tmpdir(), 'shotprof-'));
const chrome = spawn('google-chrome-stable', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},1000`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets() { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); return r.json(); }
let list = [];
for (let i = 0; i < 60; i++) { try { list = await targets(); if (list.length) break; } catch {} await sleep(250); }
const ws = list.find(t => t.type === 'page').webSocketDebuggerUrl;

const sock = new WebSocket(ws);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = new Map();
sock.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(6000);
// Force every reveal-on-scroll element into its final state and freeze the hero cycler.
await send('Runtime.evaluate', { expression: `
  document.querySelectorAll('.reveal,.animate').forEach(el=>{el.classList.add('visible','in','revealed');el.style.opacity=1;el.style.transform='none';el.style.filter='none';});
  document.querySelectorAll('*').forEach(el=>{const s=getComputedStyle(el);if(s.opacity==='0'&&!el.hasAttribute('hidden')&&el.closest('section,header,footer')){el.style.opacity=1;el.style.transform='none';}});
` });
await sleep(1500);
const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify({h:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth})', returnByValue: true });
const dim = JSON.parse(result.value);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(dim.h, 30000), deviceScaleFactor: 1, mobile: false });
await sleep(1200);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('wrote', out, dim.h + 'px tall');
sock.close(); chrome.kill('SIGKILL');
process.exit(0);
