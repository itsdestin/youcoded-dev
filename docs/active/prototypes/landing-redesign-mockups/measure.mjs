import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
const PORT = Number(process.env.CDP_PORT || 9997);
const profile = mkdtempSync(join(tmpdir(), 'ms-'));
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = []; for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const sock = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const p = new Map();
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } });
const send = (m, q = {}) => new Promise(r => { const i = ++id; p.set(i, r); sock.send(JSON.stringify({ id: i, method: m, params: q })); });
await send('Page.enable'); await send('Runtime.enable');
for (const url of process.argv.slice(2)) {
  await send('Page.navigate', { url }); await sleep(5000);
  const { result } = await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{
    const d=document.querySelector('#demo'); const m=d&&d.querySelector('video,.row-media,.tile .m,.stage');
    return JSON.stringify({page:document.documentElement.scrollHeight,
      demo:d?Math.round(d.getBoundingClientRect().height):0,
      biggestMedia:Math.round(Math.max(...[...document.querySelectorAll('#demo video,#demo .stage')].map(e=>e.getBoundingClientRect().width)))});})()` });
  console.log(url.split('/').pop().padEnd(26), result.value);
}
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
