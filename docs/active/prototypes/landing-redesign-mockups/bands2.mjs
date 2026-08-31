// Same idea as bands.mjs but at a REAL 1440x900 viewport: a full-page capture
// stretches the viewport, and the features section is laid out in vh units, so
// that measurement was meaningless. Scroll, flatten, shoot, repeat.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [url, prefix, ...offsets] = process.argv.slice(2);
const PORT = Number(process.env.CDP_PORT || 9992);
const profile = mkdtempSync(join(tmpdir(), 'b2-'));
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1440,900', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i=0;i<60;i++){ try{ list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if(list.length) break; }catch{} await sleep(250); }
const sock = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>sock.addEventListener('open',r));
let id=0; const pend=new Map();
sock.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method:m,params:p}));});
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url}); await sleep(9000);
await send('Runtime.evaluate',{expression:`
  document.querySelectorAll('.bd-layer,.bd-scrim').forEach(e=>e.style.display='none');
  document.getElementById('backdrop').style.background='#fff';
  document.body.style.background='#fff';
  document.querySelector('.nav').style.display='none';
  const c=document.getElementById('topcta'); if(c) c.style.display='none';
`});
for (const off of offsets) {
  await send('Runtime.evaluate',{expression:`scrollTo(0,${off})`});
  await sleep(500);
  const s = await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(`${prefix}-${off}.png`, Buffer.from(s.data,'base64'));
  console.log('wrote', `${prefix}-${off}.png`);
}
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
