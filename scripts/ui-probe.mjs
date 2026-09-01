#!/usr/bin/env node
// scripts/ui-probe.mjs — ask a running web page a question, headlessly.
//
// WHY THIS EXISTS: on 2026-09-01 one session wrote FIFTEEN throwaway scripts to
// check a page, and all fifteen re-implemented the same twenty-five lines —
// launch headless Chrome on a debugging port, open a WebSocket to it, navigate,
// poll until the page says it is ready, evaluate an expression, screenshot,
// collect console errors. Each rewrite is a fresh chance to get the plumbing
// subtly wrong (two of them raced the page and read a half-rendered DOM; several
// hardcoded a debugging port and would have collided with a concurrent run).
//
// `cdp-eval.mjs` does NOT cover this and is not a duplicate of it: that one
// attaches to an ALREADY-RUNNING target by WebSocket URL (its job is the Android
// WebView). This one owns the browser — it launches, sizes, navigates, waits,
// screenshots, and reports what the console said.
//
// Usage:
//   node scripts/ui-probe.mjs <url> [options]
//
//   --size WxH          viewport; repeatable, and the whole probe runs once per size
//   --wait <js>         poll this expression until truthy before measuring (30s cap)
//   --settle <ms>       extra pause after --wait (default 400)
//   --eval <js>         evaluate and report; repeatable, reported in order
//   --shot <path>       PNG screenshot. With several --size, {size} in the path is
//                       replaced (foo-{size}.png -> foo-1574x820.png)
//   --json              machine-readable output instead of aligned lines
//   --fail-on-error     exit 1 if the page logged a console error or threw
//   --keep-going        do not exit 1 when a --wait times out (still reported)
//
// Examples:
//   node scripts/ui-probe.mjs http://127.0.0.1:8791/deck.html \
//     --wait 'window.__deckReady' --eval 'document.body.dataset.layout' --shot /tmp/deck.png
//
//   node scripts/ui-probe.mjs "file://$PWD/page.html" --size 1574x820 --size 400x760 \
//     --eval "document.querySelectorAll('.card').length" --shot /tmp/p-{size}.png
//
// Needs a Chrome/Chromium binary. It launches its own headless instance on a
// scratch profile and a FREE debugging port (never a hardcoded one — two probes
// sharing 9977 hung one of them for 40 minutes on 2026-08-25), and cleans up.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import net from 'node:net';

const HELP = /--help|^-h$/;
const argv = process.argv.slice(2);
if (!argv.length || argv.some((a) => HELP.test(a))) {
  console.log(String(await import('node:fs').then((fs) => fs.readFileSync(new URL(import.meta.url), 'utf8')))
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(argv.length ? 0 : 1);
}

// ── arguments ────────────────────────────────────────────────────────────────
const opts = { sizes: [], evals: [], wait: null, settle: 400, shot: null, json: false, failOnError: false, keepGoing: false };
let url = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[++i];
    if (v === undefined) { console.error(`ui-probe: ${a} needs a value`); process.exit(2); }
    return v;
  };
  if (a === '--size') opts.sizes.push(next());
  else if (a === '--eval') opts.evals.push(next());
  else if (a === '--wait') opts.wait = next();
  else if (a === '--settle') opts.settle = Number(next());
  else if (a === '--shot') opts.shot = next();
  else if (a === '--json') opts.json = true;
  else if (a === '--fail-on-error') opts.failOnError = true;
  else if (a === '--keep-going') opts.keepGoing = true;
  else if (a.startsWith('--')) { console.error(`ui-probe: unknown option ${a}`); process.exit(2); }
  else if (url === null) url = a;
  else { console.error(`ui-probe: unexpected argument ${a}`); process.exit(2); }
}
if (!url) { console.error('ui-probe: no url'); process.exit(2); }
if (!opts.sizes.length) opts.sizes.push('1440x900');
for (const s of opts.sizes) {
  if (!/^\d+x\d+$/.test(s)) { console.error(`ui-probe: --size wants WxH, got "${s}"`); process.exit(2); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
});

// ── the browser ──────────────────────────────────────────────────────────────
const CHROME = process.env.CHROME_BIN || 'google-chrome-stable';
const profile = mkdtempSync(join(tmpdir(), 'ui-probe-'));
const port = await freePort();
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  // file:// probes are a normal case here (a built deck is opened straight off disk).
  '--allow-file-access-from-files',
  '--force-device-scale-factor=1', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
chrome.on('error', (e) => { console.error(`ui-probe: could not launch ${CHROME} — ${e.message}`); process.exit(2); });

let ready = false;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; } } catch { /* not up */ }
  await sleep(250);
}
if (!ready) { chrome.kill(); rmSync(profile, { recursive: true, force: true }); console.error('ui-probe: Chrome never opened its debugging port'); process.exit(2); }

const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
let errors = [];
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data.toString());
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  }
  // Both shapes matter: a thrown exception AND a console.error. The second is how
  // React reports a render problem it recovered from, which a screenshot can hide.
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'exception');
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error ' + m.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

// ── one pass per size ────────────────────────────────────────────────────────
const results = [];
let timedOut = false;
for (const size of opts.sizes) {
  const [w, h] = size.split('x').map(Number);
  errors = [];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  let waited = null;
  if (opts.wait) {
    // Poll rather than trusting a load event: the page's own readiness flag is the
    // only thing that knows its async boot finished. 30s, then say so out loud.
    const deadline = Date.now() + 30000;
    waited = false;
    while (Date.now() < deadline) {
      if (await evaluate(opts.wait).catch(() => false)) { waited = true; break; }
      await sleep(200);
    }
    if (!waited) timedOut = true;
  }
  await sleep(opts.settle);

  const evals = [];
  for (const expr of opts.evals) {
    try { evals.push({ expr, value: await evaluate(expr) }); }
    catch (e) { evals.push({ expr, error: String(e.message || e) }); }
  }
  let shot = null;
  if (opts.shot) {
    shot = opts.shot.includes('{size}') ? opts.shot.replaceAll('{size}', size)
      : (opts.sizes.length > 1 ? opts.shot.replace(/(\.png)?$/i, `-${size}.png`) : opts.shot);
    mkdirSync(dirname(shot), { recursive: true });
    const d = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(shot, Buffer.from(d.data, 'base64'));
  }
  results.push({ size, waited, evals, errors: [...errors], shot });
}

ws.close();
chrome.kill();
// Chrome is still flushing its profile when kill() returns, so an immediate rmSync
// dies with ENOTEMPTY and the whole probe exits 1 having actually succeeded (caught
// by this script's own test). Wait for the process, then retry the delete.
await new Promise((res) => {
  const done = setTimeout(res, 3000);
  chrome.once('exit', () => { clearTimeout(done); res(); });
});
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

// ── report ───────────────────────────────────────────────────────────────────
if (opts.json) {
  console.log(JSON.stringify({ url, results }, null, 1));
} else {
  for (const r of results) {
    const head = opts.sizes.length > 1 ? `${r.size}  ` : '';
    if (r.waited === false) console.log(`${head}WAIT TIMED OUT after 30s: ${opts.wait}`);
    for (const e of r.evals) {
      console.log(`${head}${e.expr}  =>  ${'error' in e ? 'ERROR ' + e.error : JSON.stringify(e.value)}`);
    }
    if (r.shot) console.log(`${head}shot: ${r.shot}`);
    if (r.errors.length) for (const e of r.errors) console.log(`${head}console: ${e}`);
    else if (!opts.evals.length && !r.shot) console.log(`${head}no console errors`);
  }
}

const sawErrors = results.some((r) => r.errors.length);
if (opts.failOnError && sawErrors) process.exit(1);
if (timedOut && !opts.keepGoing) process.exit(1);
