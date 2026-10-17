// Scroll sweep: record what the HERO does at a ladder of scroll positions.
//
// Built 2026-08-31 for the download-pill / hero-dissolve work, because the bugs
// there were all invisible in a screenshot and obvious in a column of numbers:
// the pill docked at scrollY=5 on a 1080-tall window, and the demo's dissolve
// started healing on the first wheel notch. Screenshots showed neither.
//
//   node scrollprobe.mjs <url> [from] [to] [step]
//   VS_W / VS_H set the viewport (default 1728x1080), CDP_PORT the debug port.
//
// Prints one TSV row per position: the pill's on-screen top/left/height, whether
// it is docked or hidden, the hero's bottom edge, the live --fade-stop, and the
// embed's top/height. Diff two runs to prove a change did what you say it did.
import { spawn } from 'node:child_process';
const url = process.argv[2];
if (!url) { console.error('usage: node scrollprobe.mjs <url> [from] [to] [step]'); process.exit(1); }
const from = Number(process.argv[3] || 0), to = Number(process.argv[4] || 1200), step = Number(process.argv[5] || 25);
const W = Number(process.env.VS_W || 1728), H = Number(process.env.VS_H || 1080);
const PORT = Number(process.env.CDP_PORT || 9971);
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=/tmp/claude-1000/chrome-scrollprobe-${PORT}`, `--window-size=${W},${H}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const sock = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = new Map();
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(8000);   // the embed boots a whole app; settle before measuring
console.log('scrollY\tpillTop\tpillLeft\tpillH\tdocked\thidden\theroBottom\tfadeStop\tembedTop\tembedH');
for (let y = from; y <= to; y += step) {
  // instant, never smooth: html{scroll-behavior:smooth} animates a scrollTo and
  // a sample taken too early measures a position the page was never at.
  await ev(`scrollTo({top:${y},behavior:'instant'})`);
  await sleep(90);
  console.log(await ev(`(()=>{
    const p=document.querySelector('.dlfloat'); if(!p) return scrollY+'\\tno .dlfloat';
    const r=p.getBoundingClientRect();
    const ha=document.querySelector('.hero-app').getBoundingClientRect();
    const em=document.querySelector('.embed'), er=em.getBoundingClientRect();
    return [scrollY, Math.round(r.top), Math.round(r.left), Math.round(r.height),
      p.classList.contains('docked')?1:0, p.classList.contains('hidden')?1:0,
      Math.round(ha.bottom), em.style.getPropertyValue('--fade-stop')||'-',
      Math.round(er.top), Math.round(er.height)].join('\\t');
  })()`));
}
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
