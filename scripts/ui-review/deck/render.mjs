#!/usr/bin/env node
// scripts/ui-review/deck/render.mjs
// The review deck, opened headless in Chrome and written out as pictures.
//
// WHY this file exists: four sessions in one day served Destin a deck carrying a visible
// header defect, because nothing turned a built deck into images a session could actually
// look at before handing over the link. `review-cards.py preview` drives this; the render
// test drives the same `cdp()` driver, so the tool and its test cannot drift apart.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// One headless Chrome at one window size, driven over raw CDP. Returns the things every
// caller here needs: `send` (a CDP method), `evaluate` (JS in the page), `errors` (console
// errors and uncaught exceptions, appended as they happen, each stamped with whatever `label`
// currently is), `label` (a mutable field the caller sets to say which page is on screen right
// now) and `close`.
export async function cdp(port, w, h) {
  // The per-launch Chrome profile: deleted in `close()` and on the failure path below, so a
  // run that never gets as far as returning still cleans up after itself.
  const profileDir = mkdtempSync(join(tmpdir(), 'deck-render-'));
  const chrome = spawn('google-chrome-stable', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--window-size=${w},${h}`, '--force-device-scale-factor=1', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
  // Fix: everything that can fail after spawning Chrome is wrapped here so a `cdp()` that
  // throws (Chrome never answers the readiness poll, the CDP handshake errors, …) still kills
  // the child and deletes its profile dir instead of leaking both on every failed launch.
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const errors = [];
    // Fix: a mutable label the caller stamps onto the connection right before each navigate, so
    // an error is tagged with whichever page it actually arrived under rather than by which
    // index slice of `errors` happened to be open when renderDeck went looking for it.
    let label = '(no page labeled yet)';
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = ev => { const m = JSON.parse(ev.data.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(`${label}: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`${label}: console.error ` + m.params.args.map(a => a.value ?? a.description).join(' ')); };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
    return {
      send, evaluate, errors,
      get label() { return label; },
      set label(v) { label = v; },
      close: () => {
        ws.close(); chrome.kill();
        // Fix: this temp profile dir was left behind in the OS temp dir on every run. Best
        // effort — a Chrome that is slow to exit must not turn tidy-up into a crash.
        try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
      },
    };
  } catch (err) {
    chrome.kill();
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

// Every page of a served deck, at every size, in every theme, as one PNG each.
// `pages` is a count: page numbers are 1-based and match the deck's own `?step=` (which is
// the PAGE number on a words-only deck and the step number otherwise).
// Returns { files, errors } — one `errors` line per shot that logged one, naming the shot, so
// a session reading the JSON knows WHICH picture is untrustworthy rather than just that one is.
export async function renderDeck({ url, out, sizes, themes, pages, settle = 400 }) {
  mkdirSync(out, { recursive: true });
  const files = [], errors = [];
  for (const size of sizes) {
    const [w, h] = String(size).split('x').map(Number);
    // One Chrome per size (the window size is fixed at launch), reused across pages and themes.
    const c = await cdp(await freePort(), w, h);
    try {
      for (let n = 1; n <= pages; n++) {
        for (const theme of themes) {
          const label = `p${n} ${theme} ${w}x${h}`;
          // Fix: label the connection BEFORE navigating (not after screenshotting), so any
          // console error or exception the page throws is stamped with the page it actually
          // came from — collected below by matching this exact label rather than by an index
          // slice of `c.errors`, which a late-arriving message could land in one page late.
          c.label = label;
          await c.send('Page.navigate', { url: `${url}?step=${n}&theme=${theme}` });
          let ready = false;
          for (let i = 0; i < 40 && !ready; i++) {
            ready = await c.evaluate('!!window.__deckReady').catch(() => false);
            if (!ready) await sleep(250);
          }
          if (!ready) {
            // Fix: a page that never sets __deckReady used to be screenshotted silently,
            // producing a clean-looking contact sheet for a page that never actually finished
            // laying out. Report it instead of hiding it.
            errors.push(`${label}: the page never finished laying out (window.__deckReady was never set)`);
          }
          // Fix: a page holding a RECORDING used to be shot after a longer fixed wait, guessing
          // how long Chrome's native video controls take to stop showing their own loading
          // spinner over a video that has not yet decoded and painted a frame — that spinner
          // sits at a different angle in every shot, which `selfie` then boxed as a change
          // (measured 2026-09-05). `readyState` does not track this: a small local recording
          // reaches HAVE_ENOUGH_DATA almost immediately while the spinner keeps turning for
          // roughly another second regardless (verified 2026-09-05: readyState 4 at frame one,
          // spinner still on screen at 500ms) — and forcing a decode by playing then pausing
          // the video moves the problem rather than solving it: that promotes the video to its
          // own compositor layer and occasionally nudges the containing card's rounded-corner
          // antialiasing by a pixel (measured — a handful of pixels at the card's corners,
          // never the video itself). The actual event to wait for is the one `selfie` cares
          // about: the PICTURE has stopped changing. Poll screenshots until two consecutive
          // captures, 250ms apart, come back byte-identical — once the spinner is gone the
          // page is static, so this converges on the same steady frame every time — bounded so
          // a recording that genuinely never settles is reported instead of hung on forever.
          const hasVideo = await c.evaluate("document.querySelectorAll('video').length > 0").catch(() => false);
          if (hasVideo) {
            let prev = null, stable = false;
            for (let i = 0; i < 20 && !stable; i++) {
              const shot = await c.send('Page.captureScreenshot', { format: 'png' });
              stable = prev === shot.data;
              prev = shot.data;
              if (!stable) await sleep(250);
            }
            if (!stable) {
              errors.push(`${label}: the recording never stopped changing between two checks 250ms apart`);
            }
          }
          // The page sets __deckReady once it has CHOSEN a layout; images, fonts and the
          // transition into it still need a beat, and a shot taken mid-transition is a
          // picture of a defect that isn't there. Any video on the page has already decoded
          // its first frame by now, so this is back to being the ordinary post-layout beat —
          // not a stand-in for waiting on the video.
          await sleep(settle);
          const shot = await c.send('Page.captureScreenshot', { format: 'png' });
          const file = join(out, `p${n}-${theme}-${w}x${h}.png`);
          writeFileSync(file, Buffer.from(shot.data, 'base64'));
          files.push(file);
          for (const e of c.errors) if (e.startsWith(label + ': ')) errors.push(e);
        }
      }
    } finally { c.close(); }
  }
  return { files, errors };
}

// CLI form, so preview.py can call this as a plain subprocess:
//   node deck/render.mjs --url U --out DIR --sizes 1440x900,1280x800 --themes midnight,light --pages 3 [--settle 400]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  const result = await renderDeck({
    url: args.url,
    out: args.out,
    sizes: (args.sizes || '1440x900').split(','),
    themes: (args.themes || 'midnight').split(','),
    pages: Number(args.pages || 1),
    settle: Number(args.settle || 400),
  });
  console.log(JSON.stringify(result));
  process.exit(result.errors.length ? 1 : 0);
}
