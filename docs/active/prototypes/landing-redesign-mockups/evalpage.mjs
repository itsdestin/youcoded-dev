// One-shot: load a page, run setup JS, wait, then print the values of expressions.
import { spawn } from 'node:child_process';
const [url, setup, waitMs, ...exprs] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || 9953;
const chrome = spawn('google-chrome-stable', ['--headless=new', `--remote-debugging-port=${PORT}`, `--window-size=${process.env.VS_W || 1440},${process.env.VS_H || 900}`, '--no-first-run', '--user-data-dir=/tmp/claude-1000/chrome-eval-' + PORT, url], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {} await sleep(250); }
const tgt = list.find(t => t.type === 'page') || list[0]; console.log('[target]', tgt.type, tgt.url); const sock = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pending = {};
sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } else if (m.method === 'Runtime.consoleAPICalled') console.log('[console]', m.params.args.map(a => a.value ?? a.description).join(' ')); else if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.text, m.params.exceptionDetails.exception?.description); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await sleep(5000);
await send('Runtime.evaluate', { expression: setup });
await sleep(+waitMs);
for (const ex of exprs) { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); console.log(ex, '=>', JSON.stringify(r.result?.value ?? r.result?.description ?? r.exceptionDetails?.text)); }
sock.close(); chrome.kill('SIGKILL'); process.exit(0);
