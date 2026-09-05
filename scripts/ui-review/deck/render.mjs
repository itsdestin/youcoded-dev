#!/usr/bin/env node
// scripts/ui-review/deck/render.mjs
// The review deck, opened headless in Chrome and written out as pictures.
//
// WHY this file exists: four sessions in one day served Destin a deck carrying a visible
// header defect, because nothing turned a built deck into images a session could actually
// look at before handing over the link. `review-cards.py preview` drives this; the render
// test drives the same `cdp()` driver, so the tool and its test cannot drift apart.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// One headless Chrome at one window size, driven over raw CDP. Returns the four things every
// caller here needs: `send` (a CDP method), `evaluate` (JS in the page), `errors` (console
// errors and uncaught exceptions, appended as they happen) and `close`.
export async function cdp(port, w, h) {
  const chrome = spawn('google-chrome-stable', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--window-size=${w},${h}`, '--force-device-scale-factor=1', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'deck-render-'))}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const errors = [];
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
  return { send, evaluate, errors, close: () => { ws.close(); chrome.kill(); } };
}

// Every page of a served deck, at every size, in every theme, as one PNG each.
// `pages` is a count: page numbers are 1-based and match the deck's own `?step=` (which is
// the PAGE number on a words-only deck and the step number otherwise).
// Returns { files, errors } — one `errors` line per shot that logged one, naming the shot, so
// a session reading the JSON knows WHICH picture is untrustworthy rather than just that one is.
export async function renderDeck({ url, out, sizes, themes, pages }) {
  mkdirSync(out, { recursive: true });
  const files = [], errors = [];
  for (const size of sizes) {
    const [w, h] = String(size).split('x').map(Number);
    // One Chrome per size (the window size is fixed at launch), reused across pages and themes.
    const c = await cdp(await freePort(), w, h);
    try {
      for (let n = 1; n <= pages; n++) {
        for (const theme of themes) {
          const before = c.errors.length;
          await c.send('Page.navigate', { url: `${url}?step=${n}&theme=${theme}` });
          for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
          // The page sets __deckReady once it has CHOSEN a layout; images, fonts and the
          // transition into it still need a beat, and a shot taken mid-transition is a
          // picture of a defect that isn't there.
          await sleep(400);
          const shot = await c.send('Page.captureScreenshot', { format: 'png' });
          const file = join(out, `p${n}-${theme}-${w}x${h}.png`);
          writeFileSync(file, Buffer.from(shot.data, 'base64'));
          files.push(file);
          for (const e of c.errors.slice(before)) errors.push(`p${n} ${theme} ${w}x${h}: ${e}`);
        }
      }
    } finally { c.close(); }
  }
  return { files, errors };
}

// CLI form, so preview.py can call this as a plain subprocess:
//   node deck/render.mjs --url U --out DIR --sizes 1440x900,1280x800 --themes midnight,light --pages 3
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  const result = await renderDeck({
    url: args.url,
    out: args.out,
    sizes: (args.sizes || '1440x900').split(','),
    themes: (args.themes || 'midnight').split(','),
    pages: Number(args.pages || 1),
  });
  console.log(JSON.stringify(result));
  process.exit(result.errors.length ? 1 : 0);
}
