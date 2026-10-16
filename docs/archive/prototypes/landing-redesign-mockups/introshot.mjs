// Screenshots at absolute times measured from Page.navigate — the hero intro
// is over in ~4s, so viewshots.mjs's 6s settle can never see it.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [url, prefix, ...times] = process.argv.slice(2);
const PORT = Number(process.env.CDP_PORT || 9944);
const profile = mkdtempSync(join(tmpdir(), 'is-'));
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, `--window-size=${process.env.VS_W||1440},${process.env.VS_H||900}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const sock = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = new Map();
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
// Warm the cache first, then reload — otherwise the first paint is dominated
// by font/wallpaper download and every early frame is blank.
await send('Page.navigate', { url }); await sleep(6000);
const t0 = Date.now();
await send('Page.navigate', { url });
for (const t of times.map(Number)) {
  const wait = t - (Date.now() - t0); if (wait > 0) await sleep(wait);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${prefix}-${t}.png`, Buffer.from(s.data, 'base64'));
  console.log('wrote', `${prefix}-${t}.png`);
}
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
