#!/usr/bin/env node
// Records a scripted scene in the real renderer (the shoot/explore engine's
// photo-only build, headless Chrome, raw CDP) and encodes a looping WebM + a
// WebP poster for the landing page. Sibling of shot.mjs — shares its selector
// helpers through cdp-helpers.mjs; the difference is Page.startScreencast
// instead of one captureScreenshot, an interpolated mouse, and per-key typing,
// because a recording of a cursor teleporting and text appearing all at once
// does not look like a person using the app.
//
// The page and the browser both come from scripts/shoot/engine.mjs: build the
// photo-only copy once (cached until source changes), serve it on a free port,
// one private-context tab. No fixed WB_PORT/CDP_PORT and no run-workbench.sh
// needed first. `?mode=workbench` behaves the same against the engine's build
// as it did against the dev server — isWorkbenchMode() is DEV || VITE_WORKBENCH
// === '1', and the engine's build sets VITE_WORKBENCH=1 — so every existing
// scene keeps working unchanged.
//
// Usage: node record.mjs <scene.json> <outBase>
//   WORKTREE=<name|branch|path>  which checkout to build+serve (default: the
//                                checkout next to this script, same rule
//                                shoot.mjs/build.mjs use)
//   BASE_URL=<origin>            record the same scene against another server
//                                entirely (a static page at two commits, a
//                                remote build) — the scene's path and query
//                                are kept, only the origin changes, and no
//                                build happens. Used by record-pair.sh for
//                                review-deck CLIP steps.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selExpr, textExpr, rectOfExpr } from './cdp-helpers.mjs';
import { runAutopilot, marksFile } from './autopilot.mjs';
import { ensureBuild, openBrowser, resolveCheckout, serve } from '../shoot/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
const [scenePath, outBase] = process.argv.slice(2);
if (!scenePath || !outBase) { console.error('usage: node record.mjs <scene.json> <outBase>'); process.exit(2); }
const scene = JSON.parse(readFileSync(scenePath, 'utf8').replaceAll('{{END_THEME}}', process.env.END_THEME || 'golden-sunbreak'));
const W = scene.width ?? 1440, H = scene.height ?? 900;
// `zoom` (default 1): film the page ZOOMED IN, the way Ctrl+= does in the app —
// the layout runs at W/zoom × H/zoom CSS px and Chrome paints it at `zoom`
// device pixels per CSS px, so the clip is still W×H but everything in it is
// `zoom` times bigger. Destin, 2026-09-04: "hit the + a bit so it's easier for
// viewers to track what's happening and what the messages say." Scene actions
// address elements by selector, so nothing else changes; mouse coordinates
// are CSS px and use the CSS size below.
const ZOOM = scene.zoom ?? 1;
const CW = Math.round(W / ZOOM), CH = Math.round(H / ZOOM);
// WHY `slow` (2026-11-18, campaign films): headless Chrome hands over only 12-15 screencast
// frames a second while something moves, at any size, so a take played back in steps. A scene
// with `"slow": 4` is filmed in slow motion and sped back up: the page's clocks, timers and
// CSS animations run at a quarter speed (SLOW_WORLD below), the recorder's own pauses, pointer
// moves and typing stretch to match, and every frame's time is divided by 4 at the encode. The
// same 12-15 frames a second of real time become 48-60 a second of film. Unset = 1 = unchanged.
const SLOW = scene.slow ?? 1;
let pace = 1; // becomes SLOW when the take starts; boot runs at normal speed
const rawSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleep = (ms) => rawSleep(ms * pace);
// Runs in every document before its own scripts. Virtual time is piecewise: `set(k)` re-bases,
// so time stays continuous when the factor changes from 1 to SLOW at the start of the take.
const SLOW_WORLD = (k0) => `(() => { if (window.__slowWorld) return;
  const RD = Date, rNow = RD.now.bind(RD), pNow = performance.now.bind(performance);
  let k = ${k0}, rB = rNow(), vB = rB, prB = pNow(), pvB = prB;
  const vDate = () => vB + (rNow() - rB) / k, vPerf = (t) => pvB + ((t ?? pNow()) - prB) / k;
  window.__slowWorld = { set(n) { const d = vDate(), q = vPerf(); rB = rNow(); vB = d; prB = pNow(); pvB = q; k = n; } };
  class VDate extends RD { constructor(...a) { if (a.length) super(...a); else super(vDate()); } static now() { return vDate(); } }
  window.Date = VDate; performance.now = () => vPerf();
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.setTimeout = (f, d, ...a) => st(f, (d || 0) * k, ...a);
  window.setInterval = (f, d, ...a) => si(f, (d || 0) * k, ...a);
  window.requestAnimationFrame = (cb) => raf((t) => cb(vPerf(t)));
})()`;
// WHY `screencast: "jpeg"` (2026-11-18, campaign films): Chrome encodes every screencast frame
// before sending it, and a PNG of a 2160-wide page takes ~80 ms, so a large take arrived at
// about 12 frames a second and moved in steps. JPEG at quality 95 encodes several times faster.
// Opt-in per scene; the default stays PNG, so the landing loops film exactly as before.
const SHOT_FORMAT = scene.screencast === 'jpeg' ? 'jpeg' : 'png';
const EXT = SHOT_FORMAT === 'jpeg' ? 'jpg' : 'png';

// This checkout by default: the same rule shoot.mjs/build.mjs use — inside a
// session worktree that is <worktree>/youcoded, else the main checkout.
function defaultCheckout() {
  const local = join(WORKSPACE, 'youcoded');
  return existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
}

// Scenes hardcode the workbench default (127.0.0.1:5473); swap it for whatever
// port the engine actually served this checkout on — same trick as shot.mjs's
// `wb()`, just against a port we picked instead of one run-workbench.sh picked.
// ONLY that port. WHY (2026-09-11): this used to rewrite ANY 127.0.0.1 port, so a
// scene filming a page on its own server (site-hero-cycler.json on :8765; a site
// scroll served on :8817) silently filmed Chrome's "refused to connect" page on
// :5473 and died as "only 1 frames" — four clips and ~10 calls before a kept
// frame showed the error page.
let url = scene.base;
let built = null; // the engine's static server for this checkout, when we built one
if (process.env.BASE_URL) {
  const b = new URL(process.env.BASE_URL), u = new URL(scene.base);
  url = b.origin + u.pathname + u.search + u.hash;
} else {
  const checkout = process.env.WORKTREE ? resolveCheckout(process.env.WORKTREE) : defaultCheckout();
  const dist = await ensureBuild(checkout, (m) => console.error(`[record] ${m}`));
  built = await serve(dist);
  url = scene.base.replace(/127\.0\.0\.1:5473\b/, `127.0.0.1:${built.port}`);
}

// One throw-away browser, one private tab: engine.mjs picks a free debugging
// port, sets the Chrome flags shot.mjs/explore.mjs also use, and sweeps a
// crashed run's leftover Chromes the next time anything here runs.
const browser = await openBrowser({ width: W, height: H });
const tab = await browser.newTab();
process.on('exit', () => { try { browser.close(); } catch { /* best effort */ } try { built?.close(); } catch { /* best effort */ } });
// `send`/`evaluate` alias the tab's CDP connection so everything below (selectors,
// humanised input, the recording loop) is unchanged from when this dialled raw CDP itself.
const send = (method, params = {}) => tab.send(method, params);
const evaluate = async (expression) => tab.evaluate(expression);

const frames = [];
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
// A scene that dies on a MISSING selector or a TIMEOUT keeps its LAST frame as <outBase>.fail.png:
// the screen the scene was looking at when the element it wanted was not there. WHY (2026-09-09):
// three promo scenes broke against app changes (a reworded tool line, a picker that lost its
// field, a title that became a Rename control) and each cost a hand-made probe scene to see
// what the app was showing instead — the frame was on disk the whole time and deleted on exit.
process.on('unhandledRejection', (err) => {
  try {
    if (frames.length) {
      const last = join(framesDir, `f${String(frames.at(-1).n).padStart(5, '0')}.${EXT}`);
      mkdirSync(dirname(outBase), { recursive: true }); copyFileSync(last, `${outBase}.fail.png`);
      console.error(`[record] failed — the last frame is at ${outBase}.fail.png`);
    }
  } catch { /* best effort */ }
  console.error(err); process.exit(1);
});
// Every screencast frame arrives as a Page.screencastFrame event on the tab's
// own CDP session — engine.mjs's `tab.on` forwards every protocol event for
// this tab, the same channel shoot.mjs would use for console errors.
tab.on((m) => {
  if (m.method !== 'Page.screencastFrame') return;
  if (frames.length === 0) firstFrameAt = Date.now();
  const n = frames.length;
  writeFileSync(join(framesDir, `f${String(n).padStart(5, '0')}.${EXT}`), Buffer.from(m.params.data, 'base64'));
  frames.push({ n, t: m.params.metadata.timestamp });
  send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
});

// ---- selectors (shared with shot.mjs) ----
const rectOf = async (expr, inFrame) => inFrame ? frameRectOf(expr) : evaluate(rectOfExpr(expr));
// WHY: Pages (Home, Finance) run in a sandboxed srcdoc iframe the outer document cannot read, so
// selectors never reach their buttons. An action with `"in": "page"` is evaluated inside that
// iframe through a CDP isolated world (which may read any frame's DOM), and its rect is shifted
// by the iframe's own position so the humanised cursor still lands on the right pixel.
async function frameRectOf(expr) {
  // The page iframe is a separate Chrome target (opaque origin): find its session once per take.
  // Auto-attach events arrive through the tab's listener; the child's commands go via the browser connection.
  if (!frameSession) {
    if (SLOW === 1) {
      tab.on((m) => { if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'iframe') frameSession = m.params.sessionId; });
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    } // a slow take attached to iframes at boot (below), so the page could be slowed before it ran
    for (let i = 0; i < 20 && !frameSession; i++) await sleep(100);
  }
  if (!frameSession) return null;
  const r = await tab.browser.send('Runtime.evaluate', { expression: rectOfExpr(expr), returnByValue: true }, frameSession).catch(() => null);
  const inner = r?.result?.value;
  if (!inner) return null;
  const off = await evaluate(`(() => { const f = document.querySelector('iframe[srcdoc]'); if (!f) return null; const b = f.getBoundingClientRect(); return {x:b.left,y:b.top}; })()`);
  if (!off) return null;
  return { ...inner, x: inner.x + off.x, y: inner.y + off.y };
}
let frameSession = null;

// ---- humanised input ----
let cur = { x: CW / 2, y: CH / 2 };
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
async function click(expr, inFrame) {
  const p = await rectOf(expr, inFrame);
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
  // Typing keeps time with the CLOCK, not with the page. WHY (2026-09-11): each letter used to
  // wait for both key events to round-trip and THEN sleep a full gap, so a theme with a moving
  // background (every event waits for its next frame) typed at a third of its setting — the games
  // loop was set to 18 a second and typed 6, while its neighbours typed 26 ("varies wildly and
  // crawls on some" — Destin). Now each letter has a due time and we sleep only what is left, and
  // keyUp is not awaited (CDP delivers messages in order, so it still lands before the next keyDown).
  const start = Date.now();
  let due = 0;
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
    send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    due += pace * 1000 / cps * (0.7 + Math.random() * 0.6);
    const left = start + due - Date.now();
    if (left > 0) await rawSleep(left);
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
await send('Emulation.setDeviceMetricsOverride', { width: CW, height: CH, deviceScaleFactor: ZOOM, mobile: false });
// `storage`: extra localStorage keys seeded BEFORE the first paint. Some panel
// geometry (the artifact drawer's width) is a stored preference, and a scene
// that clicks it wider mid-take gets a stale tile instead: the artifact preview
// is a sandboxed cross-origin iframe, and Chromium's screencast does not
// repaint one of those after a resize. Setting the width up front means it is
// laid out correctly from the first frame.
// WHY THEME: the landing page plays the clip matching the theme its visitor picked, so every
// scene is filmed once per site theme (Destin, 2026-10-21). THEME=<slug> overrides scene.theme so one
// scene file serves all four takes; END_THEME=<slug> fills the {{END_THEME}} token in action
// strings (the "yours" clip swaps to a different theme than it starts in). Both unset = old behaviour.
const START_THEME = process.env.THEME || scene.theme || 'midnight';
const seeded = { 'youcoded-theme': START_THEME, ...(scene.storage ?? {}) };
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{const s=${JSON.stringify(seeded)};for(const k in s)localStorage.setItem(k,String(s[k]));}catch{}` });
// A slow take: every document gets the slow world before its scripts run. A Page is its own
// Chrome target (sandboxed iframe), so it is held at start, given the same script, then released.
const slowSessions = [];
const animRate = (session, rate) => tab.browser.send('Animation.enable', {}, session).then(() => tab.browser.send('Animation.setPlaybackRate', { playbackRate: rate }, session)).catch(() => {});
if (SLOW !== 1) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SLOW_WORLD(1) });
  tab.on(async (m) => {
    if (m.method !== 'Target.attachedToTarget' || m.params.targetInfo.type !== 'iframe') return;
    const sid = m.params.sessionId; frameSession = sid; slowSessions.push(sid);
    await tab.browser.send('Page.enable', {}, sid).catch(() => {});
    await tab.browser.send('Page.addScriptToEvaluateOnNewDocument', { source: SLOW_WORLD(pace) }, sid).catch(() => {});
    await tab.browser.send('Runtime.evaluate', { expression: SLOW_WORLD(pace) }, sid).catch(() => {});
    if (pace !== 1) await animRate(sid, 1 / pace);
    await tab.browser.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
}
await send('Page.navigate', { url });
const READY = scene.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
for (let i = 0; i < 120; i++) { if (await evaluate(READY)) break; await sleep(250); }
await sleep(scene.boot ?? 3500);
// WHY pauseBackground (2026-10-21): a theme's moving background makes every pointer move wait on a
// frame, so takes in golden-sunbreak / halftone-dimension ran 25-40 s against ~15 s in a still theme.
// This is the same window-hidden pause row7-play and the film's scenes already use: the pattern stays
// on screen, it just stops drifting. Opt-in per scene; unset keeps the old behaviour.
if (scene.pauseBackground) await evaluate("(()=>{Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;document.documentElement.setAttribute('data-doc-hidden','0');return document.visibilityState})()");
await moveTo({ x: CW * 0.6, y: CH * 0.55 }, 1);

// ---- record ----
await send('Page.startScreencast', { format: SHOT_FORMAT, ...(SHOT_FORMAT === 'jpeg' ? { quality: 95 } : {}), everyNthFrame: 1, maxWidth: W, maxHeight: H });
if (SLOW !== 1) {
  pace = SLOW;
  await evaluate(`window.__slowWorld && window.__slowWorld.set(${SLOW})`);
  await send('Animation.enable'); await send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
  for (const sid of slowSessions) { await tab.browser.send('Runtime.evaluate', { expression: `window.__slowWorld && window.__slowWorld.set(${SLOW})` }, sid).catch(() => {}); await animRate(sid, 1 / SLOW); }
}
const t0 = Date.now();
// Fix: every action is stamped (wall-clock start/end) for the marks file, so a
// later editing pass can trim footage by label instead of a hand-measured frame.
// hold/wait still `continue` past `settle` (unchanged semantics, so existing
// landing-page scenes film identically) but now go through the stamp too — they
// are the marks a beat trims to most often.
const stamps = [];   // one per action: wall-clock start/end, for the marks file
for (const [i, a] of scene.actions.entries()) {
  const kind = Object.keys(a).find((k) => !['settle', 'mark', 'tag', 'ms', 'cps', 'to', 'timeout', 'modifiers', 'in', 'at', 'steps'].includes(k)) ?? 'noop';
  const start = Date.now();
  if (a.hold != null) await sleep(a.hold);
  else if (a.wait != null) await sleep(a.wait);
  else if (a.moveTo) { const p = await rectOf(selExpr(a.moveTo), a.in === 'page'); if (!p) throw new Error(`MISSING ${a.moveTo}`); await moveTo(p, a.ms ?? 400); }
  // WHY `wheel` (2026-11-18, campaign films): a smooth scroll that the film can show, made of real mouse-wheel
  // events eased over `ms` (film time) at the middle of `at` (or of the window), so it works inside a Page or the
  // Office editor too. {"wheel": 250, "ms": 1500, "at": "<selector>", "in": "page"}; dy is CSS pixels.
  else if (a.wheel != null) {
    const p = a.at ? await rectOf(selExpr(a.at), a.in === 'page') : { x: CW / 2, y: CH / 2 };
    if (!p) throw new Error(`MISSING ${a.at}`);
    const n = a.steps ?? Math.max(6, Math.round((a.ms ?? 1000) / 16)); let sent = 0; // `steps`: the Office editor scrolls a fixed amount per wheel event whatever its delta, so a distance there is set by the event count
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, want = a.wheel * e;
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: want - sent });
      sent = want; await sleep((a.ms ?? 1000) / n);
    }
  }
  else if (a.click) await click(selExpr(a.click), a.in === 'page');
  else if (a.drag) await drag(selExpr(a.drag), selExpr(a.to), a.ms);
  else if (a.clickText) await click(textExpr(a.clickText, a.tag), a.in === 'page');
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
    const deadline = Date.now() + (a.timeout ?? 20000) * pace;
    while (!(await rectOf(expr, a.in === 'page'))) { if (Date.now() > deadline) throw new Error(`TIMEOUT waiting for ${expr}`); await sleep(150); }
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
  // evalFile: the same as eval, but the JS comes from a file beside the scene.
  // A page-side autopilot is 2 KB of commented code; inlined in JSON it would
  // be one unreadable line with every comment stripped (the promo's Flappy
  // pilot, scenes/flappy-pilot.js, is the first). The file's own trailing
  // `;` is dropped so the source can be an expression as well as a statement.
  else if (a.evalFile) await evaluate(readFileSync(join(dirname(scenePath), a.evalFile), 'utf8').replace(/;\s*$/, ''));
  stamps.push({ i, kind, mark: a.mark ?? null, start, end: Date.now() });
  if (a.hold == null && a.wait == null) await sleep(a.settle ?? 400);
}
await send('Page.stopScreencast');
const stopAt = Date.now();
await sleep(300);
const duration = (Date.now() - t0) / 1000 / SLOW;
if (frames.length < 10) { console.error(`only ${frames.length} frames — did the page paint?`); process.exit(1); }

// ---- encode (frames are NOT evenly spaced: use a concat list with real durations) ----
const list = frames.map((f, i) => {
  // WHY (2026-11-18, campaign films): the screencast sends a frame only when the page changes, so a take that
  // ends on a still page lost its closing hold (the last frame was shown for a fixed 0.5 s). The last frame now
  // lasts until the moment the take stopped.
  const next = frames[i + 1]?.t ?? Math.max(f.t + 0.5 / SLOW, frames[0].t + (stopAt - firstFrameAt) / 1000);
  return `file '${join(framesDir, `f${String(f.n).padStart(5, '0')}.${EXT}`)}'\nduration ${Math.max(0.016 / SLOW, (next - f.t) / SLOW).toFixed(4)}`;
}).join('\n') + `\nfile '${join(framesDir, `f${String(frames.at(-1).n).padStart(5, '0')}.${EXT}`)}'\n`;
writeFileSync(join(framesDir, 'list.txt'), list);
mkdirSync(dirname(outBase), { recursive: true });
const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt'),
  // Fix: scene-level `fps` (default 24) sets the encode frame rate — the promo
  // films at 30 so no frame is doubled in a 30 fps edit.
  '-vf', `scale=${W}:-2,fps=${scene.fps ?? 24},format=yuv420p`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-an', `${outBase}.webm`]);
if (enc.status !== 0) { console.error(enc.stderr.toString()); process.exit(1); }
// WHY `master` (2026-11-18, campaign films): the landing loops are small on purpose (VP9 crf 33),
// which shows as soft text once a clip is scaled up inside a 1080p advert. A scene that sets
// `"master": true` also gets `<out>.mp4`, a near-lossless H.264 copy of the same frames, for
// editing. Opt-in, so every existing scene encodes exactly as before.
if (scene.master) {
  const m = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt'),
    '-vf', `scale=${W}:-2:flags=lanczos,fps=${scene.fps ?? 24},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-an', `${outBase}.mp4`]);
  if (m.status !== 0) { console.error(m.stderr.toString()); process.exit(1); }
}
// Poster = the LAST frame, not the first: a loop that starts in an empty chat
// (rows 1/2/6/7 since 2026-08-28) would otherwise show a blank window wherever
// the video isn't playing yet — before scroll, reduced-motion, slow networks.
// WHY `posterBefore` (Destin, 2026-11-13: "i see the theme a demo for just a
// split second as i scroll down"). The landing page's "yours" clip ENDS in a
// different theme from the one it starts in, so its last frame is another
// theme's picture: on the golden page the still was the purple app, shown for a
// moment before the clip started. A scene may name one of its marks; the still
// is then the last frame captured BEFORE that action began (for "yours": the
// finished conversation, just before the look swaps). Every other clip is unchanged.
let posterFrame = frames.at(-1);
if (scene.posterBefore) {
  const st = stamps.find((s) => s.mark === scene.posterBefore);
  if (!st) { console.error(`posterBefore: no action is marked "${scene.posterBefore}"`); process.exit(1); }
  const cut = frames[0].t + (st.start - firstFrameAt) / 1000;
  posterFrame = frames.filter((f) => f.t <= cut).at(-1) ?? frames[0];
}
spawnSync('magick', [join(framesDir, `f${String(posterFrame.n).padStart(5, '0')}.${EXT}`), '-quality', '82', `${outBase}.webp`]);
// framesDir cleanup now happens in the exit handler registered above (covers
// error exits too, not just this success path).
// Marks file: where every scene action landed in the finished clip, in video
// seconds, so a later edit pass trims by label instead of a hand-measured frame.
// 60 ms of screencast transport lag (see marksFile) — so a mark lands on the frame that shows it.
const CAPTURE_LAG_MS = 100;
// A slow take's stamps are in real milliseconds; the film runs SLOW times faster, so fold them
// back onto film time around the first frame before they become marks.
const filmStamps = SLOW === 1 ? stamps : stamps.map((st) => ({ ...st, start: firstFrameAt + (st.start - firstFrameAt) / SLOW, end: firstFrameAt + (st.end - firstFrameAt) / SLOW }));
const marks = marksFile({ fps: scene.fps ?? 24, width: W, height: H, duration, firstFrameAt, stamps: filmStamps, captureLagMs: CAPTURE_LAG_MS / SLOW });
writeFileSync(`${outBase}.marks.json`, JSON.stringify(marks, null, 1));
// WHY the file's own length, not `duration`: the frame-stamp count runs up to 1.6 s off the
// encoded clip (2026-09-11 — a review card said 18.0 s beside a player showing 17.6), and a
// quoted length is only useful if it matches what a viewer sees. `duration` still drives marks.
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${outBase}.webm`]);
const fileDuration = Number(probe.stdout?.toString().trim()) || duration;
console.log(`frames=${frames.length} duration=${fileDuration.toFixed(1)}s out=${outBase}.webm marks=${outBase}.marks.json`);
process.exit(0);
