#!/usr/bin/env node
// Records a scripted scene in the real renderer (UI Workbench, headless Chrome,
// raw CDP) and encodes a looping WebM + a WebP poster for the landing page.
// Sibling of shot.mjs — shares its Chrome flags and selector helpers through
// cdp-helpers.mjs; the difference is Page.startScreencast instead of one
// captureScreenshot, an interpolated mouse, and per-key typing, because a
// recording of a cursor teleporting and text appearing all at once does not
// look like a person using the app.
//
// Usage: WB_PORT=5473 CDP_PORT=10320 node record.mjs <scene.json> <outBase>
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr } from './cdp-helpers.mjs';
import { runAutopilot, marksFile } from './autopilot.mjs';

const [scenePath, outBase] = process.argv.slice(2);
if (!scenePath || !outBase) { console.error('usage: node record.mjs <scene.json> <outBase>'); process.exit(2); }
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const WB_PORT = process.env.WB_PORT ?? '5473';
const CDP_PORT = Number(process.env.CDP_PORT ?? 10320);
const W = scene.width ?? 1440, H = scene.height ?? 900;
// Scenes hardcode the workbench default (127.0.0.1:5473); swap it for whatever
// port this worktree's workbench actually started on, same trick as shot.mjs's `wb()`.
let url = scene.base.replace(/127\.0\.0\.1:\d+/, `127.0.0.1:${WB_PORT}`);
// BASE_URL=<origin>: record the same scene against another server entirely (a static
// page at two commits, a remote build) — the scene's path and query are kept, only the
// origin changes. Used by record-pair.sh for review-deck CLIP steps.
if (process.env.BASE_URL) { const b = new URL(process.env.BASE_URL), u = new URL(scene.base); url = b.origin + u.pathname + u.search + u.hash; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ui-record-'));
const chrome = spawn('google-chrome-stable', CHROME_FLAGS(W, H, CDP_PORT, profile), { stdio: 'ignore' });
// Fix: chrome.kill() is a signal, not a wait — Chrome can still be writing its
// own lock files in the profile dir when rmSync runs a moment later, and an
// uncaught ENOTEMPTY there would mask the real "frames=... out=..." success
// line already printed above it. Same guard shot.mjs uses for its profile dir.
process.on('exit', () => { chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } });
await waitForCdp(CDP_PORT);
// Fix: don't trust list[0] — on machines with force-installed extension
// policies, a background_page/service_worker target for some extension can
// come back BEFORE the real about:blank tab, and Page.navigate against a
// background page silently does nothing (found 2026-08-27: the recorder
// threw "MISSING [placeholder]" because it had been driving a Hangouts
// extension background page, not the app).
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const target = targets.find((t) => t.type === 'page') ?? targets[0];
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const frames = [];
// Fix: wall-clock of the FIRST screencast frame is the clip's time zero — every
// action's start/end (stamped in Date.now()) is converted to video seconds by
// subtracting this, in marksFile below.
let firstFrameAt = 0;
const framesDir = mkdtempSync(join(tmpdir(), 'ui-frames-'));
// Fix: this used to only get cleaned up on the success path at the bottom of
// the file — any early exit (a MISSING selector, a failed click) left hundreds
// of screencast PNGs behind in the temp dir. Register cleanup once, here, so
// every exit path (including process.exit(1) calls above) clears it.
// KEEP_FRAMES=1 keeps them — the ffmpeg-failure path below is undiagnosable otherwise.
process.on('exit', () => { if (process.env.KEEP_FRAMES === '1') { console.error(`frames kept: ${framesDir}`); return; } try { rmSync(framesDir, { recursive: true, force: true }); } catch { /* best effort */ } });
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Page.screencastFrame') {
    if (frames.length === 0) firstFrameAt = Date.now();
    const n = frames.length;
    writeFileSync(join(framesDir, `f${String(n).padStart(5, '0')}.png`), Buffer.from(d.params.data, 'base64'));
    frames.push({ n, t: d.params.metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
  }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

// ---- selectors (shared with shot.mjs) ----
const rectOf = async (expr) => evaluate(rectOfExpr(expr));

// ---- humanised input ----
let cur = { x: W / 2, y: H / 2 };
async function moveTo(p, ms = 400) {
  const steps = Math.max(6, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = 1 - Math.pow(1 - k, 3);          // ease-out
    const x = cur.x + (p.x - cur.x) * e, y = cur.y + (p.y - cur.y) * e;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(16);
  }
  cur = p;
}
async function click(expr) {
  const p = await rectOf(expr);
  if (!p) throw new Error(`MISSING ${expr}`);
  await moveTo(p, 300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
}
// Press, travel, release — the one gesture the click/moveTo pair cannot express.
// Chromium synthesises pointerdown/pointermove/pointerup from these raw mouse
// events, which is what SessionStrip listens to. `buttons: 1` on every move is
// load-bearing: without it Chromium treats the moves as a hover and the strip
// never sees a drag.
//
// Both endpoints are measured BEFORE the press, on purpose: the target pill
// steps aside during the drag, so re-measuring it mid-gesture would chase a
// moving target. The app hit-tests against its own frozen geometry too
// (SessionStrip's pillRectsRef), so the two agree.
async function drag(fromExpr, toExpr, ms = 800) {
  const a = await rectOf(fromExpr);
  if (!a) throw new Error(`MISSING ${fromExpr}`);
  const b = await rectOf(toExpr);
  if (!b) throw new Error(`MISSING ${toExpr}`);
  await moveTo(a, 300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(80);
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = 1 - Math.pow(1 - k, 3);
    const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(16);
  }
  await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
  cur = b;
}

async function typeSlow(text, cps = 18) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(1000 / cps * (0.7 + Math.random() * 0.6));
  }
}
// Space is the Flappy flap key. It needs `code: 'Space'` and a literal ' ' as
// both key and text — the app's handler checks e.key === ' ', and the generic
// fallback below would have sent key 'Space', which it ignores.
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
};
async function key(name, modifiers = 0) {
  const k = KEYS[name] ?? { key: name, code: `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...k });
}

// ---- boot ----
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// `storage`: extra localStorage keys seeded BEFORE the first paint. Some panel
// geometry (the artifact drawer's width) is a stored preference, and a scene
// that clicks it wider mid-take gets a stale tile instead: the artifact preview
// is a sandboxed cross-origin iframe, and Chromium's screencast does not
// repaint one of those after a resize. Setting the width up front means it is
// laid out correctly from the first frame.
const seeded = { 'youcoded-theme': scene.theme ?? 'midnight', ...(scene.storage ?? {}) };
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{const s=${JSON.stringify(seeded)};for(const k in s)localStorage.setItem(k,String(s[k]));}catch{}` });
await send('Page.navigate', { url });
const READY = scene.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
for (let i = 0; i < 120; i++) { if (await evaluate(READY)) break; await sleep(250); }
await sleep(scene.boot ?? 3500);
await moveTo({ x: W * 0.6, y: H * 0.55 }, 1);

// ---- record ----
await send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: H });
const t0 = Date.now();
// Fix: every action is stamped (wall-clock start/end) for the marks file, so a
// later editing pass can trim footage by label instead of a hand-measured frame.
// hold/wait still `continue` past `settle` (unchanged semantics, so existing
// landing-page scenes film identically) but now go through the stamp too — they
// are the marks a beat trims to most often.
const stamps = [];   // one per action: wall-clock start/end, for the marks file
for (const [i, a] of scene.actions.entries()) {
  const kind = Object.keys(a).find((k) => !['settle', 'mark', 'tag', 'ms', 'cps', 'to', 'timeout', 'modifiers'].includes(k)) ?? 'noop';
  const start = Date.now();
  if (a.hold != null) await sleep(a.hold);
  else if (a.wait != null) await sleep(a.wait);
  else if (a.moveTo) { const p = await rectOf(selExpr(a.moveTo)); if (!p) throw new Error(`MISSING ${a.moveTo}`); await moveTo(p, a.ms ?? 400); }
  else if (a.click) await click(selExpr(a.click));
  else if (a.drag) await drag(selExpr(a.drag), selExpr(a.to), a.ms);
  else if (a.clickText) await click(textExpr(a.clickText, a.tag));
  else if (a.typeSlow != null) await typeSlow(a.typeSlow, a.cps);
  else if (a.key) await key(a.key, a.modifiers ?? 0);
  // waitFor / waitForText: poll until the element is on screen (default 20 s),
  // recording the whole time. Scripted replies stream at their own pace, so a
  // fixed `settle` before a click on a permission card is a race — row2's first
  // "Yes" fired 2 s before the card existed on 2026-08-28. Wait for the thing,
  // not the clock; this is what makes a scene survive a copy or timing change.
  else if (a.waitFor || a.waitForText) {
    // waitForText is a CONTAINS match (textExpr is exact): a wait targets a
    // sentence that is still streaming in, so its full text is a moving target.
    const containsExpr = (text, tag) => `[...document.querySelectorAll(${JSON.stringify(tag ?? '*')})].filter(e => e.offsetParent !== null && e.textContent.includes(${JSON.stringify(text)})).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]`;
    const expr = a.waitFor ? selExpr(a.waitFor) : containsExpr(a.waitForText, a.tag);
    const deadline = Date.now() + (a.timeout ?? 20000);
    while (!(await rectOf(expr))) { if (Date.now() > deadline) throw new Error(`TIMEOUT waiting for ${expr}`); await sleep(150); }
  }
  // autopilot: poll a JS predicate in the page and press a key when it says so —
  // the recorder "plays" a game (Flappy) by reading its DOM instead of a fixed rhythm.
  else if (a.autopilot) {
    const r = await runAutopilot({
      evaluate, press: (k) => key(k), sleep, now: () => Date.now(),
      ms: a.autopilot.ms, every: a.autopilot.every, when: a.autopilot.when, key: a.autopilot.key, minGap: a.autopilot.minGap,
    });
    console.error(`autopilot: ${r.presses} presses over ${r.polls} polls`);
  }
  else if (a.eval) await evaluate(a.eval);
  stamps.push({ i, kind, mark: a.mark ?? null, start, end: Date.now() });
  if (a.hold == null && a.wait == null) await sleep(a.settle ?? 400);
}
await send('Page.stopScreencast');
await sleep(300);
const duration = (Date.now() - t0) / 1000;
if (frames.length < 10) { console.error(`only ${frames.length} frames — did the page paint?`); process.exit(1); }

// ---- encode (frames are NOT evenly spaced: use a concat list with real durations) ----
const list = frames.map((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  return `file '${join(framesDir, `f${String(f.n).padStart(5, '0')}.png`)}'\nduration ${Math.max(0.016, next - f.t).toFixed(4)}`;
}).join('\n') + `\nfile '${join(framesDir, `f${String(frames.at(-1).n).padStart(5, '0')}.png`)}'\n`;
writeFileSync(join(framesDir, 'list.txt'), list);
mkdirSync(dirname(outBase), { recursive: true });
const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt'),
  // Fix: scene-level `fps` (default 24) sets the encode frame rate — the promo
  // films at 30 so no frame is doubled in a 30 fps edit.
  '-vf', `scale=${W}:-2,fps=${scene.fps ?? 24},format=yuv420p`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-an', `${outBase}.webm`]);
if (enc.status !== 0) { console.error(enc.stderr.toString()); process.exit(1); }
// Poster = the LAST frame, not the first: a loop that starts in an empty chat
// (rows 1/2/6/7 since 2026-08-28) would otherwise show a blank window wherever
// the video isn't playing yet — before scroll, reduced-motion, slow networks.
spawnSync('magick', [join(framesDir, `f${String(frames.at(-1).n).padStart(5, '0')}.png`), '-quality', '82', `${outBase}.webp`]);
// framesDir cleanup now happens in the exit handler registered above (covers
// error exits too, not just this success path).
// Marks file: where every scene action landed in the finished clip, in video
// seconds, so a later edit pass trims by label instead of a hand-measured frame.
const marks = marksFile({ fps: scene.fps ?? 24, width: W, height: H, duration, firstFrameAt, stamps });
writeFileSync(`${outBase}.marks.json`, JSON.stringify(marks, null, 1));
console.log(`frames=${frames.length} duration=${duration.toFixed(1)}s out=${outBase}.webm marks=${outBase}.marks.json`);
process.exit(0);
