// scripts/perf-lab/screenshots.mjs — "the user must notice nothing" made mechanical.
// Pixel diff runs inside headless Chrome (canvas + getImageData) so the rig needs no PNG library.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './cdp.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIFF_PORT = 9556;
const DIFF_BINARY = 'google-chrome-stable';

/**
 * Pick a listenable port, preferring `preferred` (9556, the port this rig is documented to use)
 * and falling back to an OS-assigned one when that is taken.
 * WHY this exists: the first draft hardcoded port 9556 AND one shared profile directory
 * (/tmp/perf-lab-diff-profile). Two overlapping diffs then collided in the worst possible way —
 * Chrome refuses to start a second browser on a locked profile, so the second run silently
 * ATTACHED to the first run's browser, and when the first run finished it SIGKILLed the browser
 * out from under the second. `cdp.mjs` has no websocket-close handler, so its in-flight request
 * promise never settled and the second run HUNG FOREVER (verified: node exits 13, "unsettled
 * top-level await"). A silent hang is the one failure mode a measure/optimize loop must not have,
 * so every launch now gets its own port and its own throwaway profile and can never share.
 */
function freePort(preferred) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      const any = createServer();
      any.listen(0, '127.0.0.1', () => { const p = any.address().port; any.close(() => resolve(p)); });
    });
    probe.listen(preferred, '127.0.0.1', () => { probe.close(() => resolve(preferred)); });
  });
}

/**
 * Run `fn(cdp)` against a throwaway headless Chrome, then kill it.
 * Exported because the tests drive raw pages through it (freeze-style probe, failure path).
 * WHY the options bag: the tests need to point it at a binary that does not exist to prove
 * the failure message is useful. Production callers pass nothing.
 */
export async function withHeadlessChrome(fn, { binary = DIFF_BINARY, port, profile, timeoutMs = 15000 } = {}) {
  port ??= await freePort(DIFF_PORT);
  // A throwaway profile per launch guarantees Chrome starts its OWN browser rather than
  // handing us someone else's (see freePort above). Removed again in the finally.
  const ownProfile = profile === undefined;
  profile ??= mkdtempSync(join(tmpdir(), 'perf-lab-diff-'));
  const argv = ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'];
  const proc = spawn(binary, argv, { stdio: 'ignore' });
  // WHY: `spawn` reports a bad binary asynchronously via an 'error' event. With no listener
  // Node throws it as an uncaught exception and takes the whole rig down, so we capture it
  // and fold the REAL OS error (ENOENT, EACCES…) into the message below instead of guessing.
  let spawnError = null, exited = null;
  proc.on('error', (e) => { spawnError = e; });
  proc.on('exit', (code, signal) => { exited = { code, signal }; });
  try {
    let target = null, lastListError = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !target && !spawnError) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch (e) { lastListError = e; }
      if (!target) await sleep(250);
    }
    // WHY: the draft went straight to `target.webSocketDebuggerUrl`, so a Chrome that never
    // came up surfaced as "Cannot read properties of undefined" — true, but useless. Name the
    // binary, the port, the profile, and whatever actually went wrong.
    if (!target) {
      const detail = [
        spawnError && `spawn failed: ${spawnError.code || ''} ${spawnError.message}`.trim(),
        exited && `chrome exited early (code=${exited.code}, signal=${exited.signal})`,
        lastListError && `last /json/list error: ${lastListError.message}`,
      ].filter(Boolean).join('; ') || 'no error reported — Chrome started but never opened a page target';
      throw new Error(
        `perf-lab: headless Chrome exposed no CDP page target on 127.0.0.1:${port} within ${timeoutMs}ms. ` +
        `binary=${binary} profile=${profile} args=${argv.join(' ')} — ${detail}`,
      );
    }
    const cdp = await connect(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable');
    try { return await fn(cdp); } finally { cdp.close(); }
  } finally {
    proc.kill('SIGKILL');
    if (ownProfile) await removeProfile(proc, profile);
  }
}

/**
 * Delete a throwaway profile once Chrome has really gone.
 * WHY the wait + retry: SIGKILL is asynchronous, and Chrome's utility processes keep writing
 * during teardown. Deleting immediately "succeeded" and then the dying browser recreated
 * Default/Cache under it — 55 orphaned profile dirs piled up in /tmp during this task's own
 * test runs before this was caught.
 */
async function removeProfile(proc, profile) {
  await new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(done, 2000);          // never block the rig on a wedged Chrome
    proc.once('exit', done);
    proc.once('error', done);
  });
  for (let i = 0; i < 4; i++) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* still being written */ }
    if (!existsSync(profile)) return;
    await sleep(120);
  }
  // Best effort — a stray 8 KB dir in the OS temp dir is not worth failing a measurement over.
}

const b64 = (p) => readFileSync(p).toString('base64');

// WHY the >16 per-channel tolerance: font anti-aliasing and GPU-vs-CPU rasterisation differ
// by a few levels between runs on identical UI. 16/255 is below anything a person can see as
// a change but above that noise floor.
// WHY alpha is compared too: both images are drawn onto a max(w) x max(h) canvas, so when the
// candidate changed SIZE the extra band is transparent (0,0,0,0) in one image. Comparing RGB
// alone would call that band "equal" to opaque black content and report 0% for a resized
// window. `sizeMatch` is returned so a caller can reject on the size change by itself.
const DIFF_EXPR = (aB64, bB64) => `(async () => {
    const load = (b) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b; });
    const [A, B] = await Promise.all([load(${JSON.stringify(aB64)}), load(${JSON.stringify(bB64)})]);
    const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const a = px(A), b = px(B); let differing = 0;
    for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i]-b[i]) > 16 || Math.abs(a[i+1]-b[i+1]) > 16 || Math.abs(a[i+2]-b[i+2]) > 16 || Math.abs(a[i+3]-b[i+3]) > 16) differing++; }
    const total = w * h;
    return { total, differing, pct: Math.round(differing / total * 10000) / 100,
             a: { width: A.width, height: A.height }, b: { width: B.width, height: B.height },
             sizeMatch: A.width === B.width && A.height === B.height };
  })()`;

/**
 * Compare two PNGs. Returns { total, differing, pct, a, b, sizeMatch }.
 * WHY pct is rounded to 2dp: the keep/reject gate is `pct <= 0.05`, so anything under
 * 0.005% (e.g. ONE pixel in a 1600x1000 shot = 0.0000625%) rounds to 0 and passes. That is
 * intended — the gate catches visible regressions, not single-pixel rasterisation luck — and
 * the raw `differing` count rides along so a "0%" pass can still be audited.
 */
export async function diffPngs(aPath, bPath) {
  return withHeadlessChrome((cdp) => cdp.evaluate(DIFF_EXPR(b64(aPath), b64(bPath))));
}

/** Test helper: render rectangles to a PNG (base64→Buffer) in headless Chrome. */
export async function renderTestPng(w, h, rects) {
  const b = await withHeadlessChrome((cdp) => cdp.evaluate(`(() => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d');
    for (const r of ${JSON.stringify(rects)}) { g.fillStyle = r.color; g.fillRect(r.x, r.y, r.w, r.h); } return c.toDataURL('image/png').split(',')[1]; })()`));
  return Buffer.from(b, 'base64');
}

// WHY freeze: a screenshot caught mid-animation, mid-transition or on a lit text caret differs
// from the same UI at rest, which would make the parity gate flap for no real reason.
// Exported so the tests can prove the style actually lands and actually comes back off.
export const FREEZE = `(() => { const s = document.createElement('style'); s.id = '__perf-freeze'; s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(s); return true; })()`;
export const UNFREEZE = `(() => { document.getElementById('__perf-freeze')?.remove(); return true; })()`;

/**
 * Screenshot ONE named screen of a running app into `outDir/<name>.png`.
 * The orchestrator drives the navigation and decides WHEN each screen is captured
 * (see SCREEN_NAMES); this module only knows HOW.
 */
export async function capture(app, outDir, name) {
  mkdirSync(outDir, { recursive: true });
  await app.cdp.evaluate(FREEZE); await sleep(300);
  let data;
  // WHY try/finally: the draft unfroze only on the happy path, so ONE failed screenshot left
  // `__perf-freeze` injected in the live app forever — every later capture and every timing
  // measurement in that run would then be taken against silently animation-disabled UI.
  try { ({ data } = await app.cdp.send('Page.captureScreenshot', { format: 'png' })); }
  finally { await app.cdp.evaluate(UNFREEZE); }
  const p = join(outDir, `${name}.png`); writeFileSync(p, Buffer.from(data, 'base64')); return p;
}

/** The named screens the parity gate covers. The orchestrator decides WHEN each is captured. */
export const SCREEN_NAMES = ['welcome', 'chat-medium', 'settings-open', 'native-chat', 'six-sessions'];

/**
 * All screens in ONE headless-Chrome session (spawning it per screen was 5× the cost).
 * `names` defaults to SCREEN_NAMES so the documented two-argument call works.
 */
export async function compareScreens(baselineDir, candidateDir, names = SCREEN_NAMES) {
  return withHeadlessChrome(async (cdp) => {
    const out = {};
    for (const n of names) {
      const r = await cdp.evaluate(DIFF_EXPR(b64(join(baselineDir, `${n}.png`)), b64(join(candidateDir, `${n}.png`))));
      out[n] = { ...r, pass: r.pct <= 0.05 };
    }
    return out;
  });
}
