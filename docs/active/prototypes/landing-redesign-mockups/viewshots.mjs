// Viewport-sized captures at a list of scroll offsets. Needed for the sticky
// layout in mockup B, where a full-height viewport breaks every vh unit.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, prefix, ...rest] = process.argv.slice(2);
const W = Number(process.env.VS_W || 1440), H = Number(process.env.VS_H || 900);
const PORT = Number(process.env.CDP_PORT || 9989);
const profile = mkdtempSync(join(tmpdir(), 'vs-'));
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const sock = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = new Map();
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url }); await sleep(6000);
for (const spec of rest) {
  const eq = spec.indexOf('='); const name = spec.slice(0, eq), expr = spec.slice(eq + 1);
  // "@wait 7000" pauses (the live demo boots a whole app); "@hover <sel>" moves
  // the real mouse over an element so :hover styles show in the shot.
  if (expr.startsWith('@wait ')) { await sleep(+expr.slice(6)); }
  else if (expr.startsWith('@hover ')) {
    const r = await send('Runtime.evaluate', { expression: `(()=>{const b=document.querySelector(${JSON.stringify(expr.slice(7))}).getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2].join(',')})()`, returnByValue: true });
    const [x, y] = r.result.value.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(600);
  } else {
    await send('Runtime.evaluate', { expression: `(()=>{${expr}})()`, awaitPromise: false });
    await sleep(1400);
  }
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${prefix}-${name}.png`, Buffer.from(s.data, 'base64'));
  console.log('wrote', `${prefix}-${name}.png`);
}
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
