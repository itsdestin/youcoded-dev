#!/usr/bin/env node
// Self-verifying screenshot driver for autonomous UI reviews.
//
// Drives the REAL renderer over raw Chrome DevTools Protocol — either the UI
// Workbench in a throw-away headless Chrome (default) or an already-running
// Electron dev instance (ATTACH_PORT=<port> after launching electron with
// --remote-debugging-port=<port>). No puppeteer/playwright dependency.
//
// WHY IT VERIFIES ITSELF: on 2026-08-25 the first version of this rig filed
// 40 screenshots of the plain chat window under labels like "context menu"
// because a click missed and nothing noticed. A screenshot is only evidence if
// the surface actually opened, so every shot now has to prove it did:
//   1. every action's target must exist (a MISSING selector fails the shot);
//   2. an optional `expect` selector/JS must be truthy after the actions;
//   3. the result must differ from the post-boot baseline (ImageMagick RMSE),
//      unless the shot says `sameAsBaseline: true` on purpose.
// Failed shots are written to <outDir>/<theme>/_unverified/ so the montage and
// gallery steps never see them, and the run ends with a coverage summary.
//
// Usage:
//   node shot.mjs <plan.json> <outDir> [themes,comma,list]
//
// <outDir> must already END IN shots-<plan> if a review deck is going to read
// these — run-review.sh passes "$OUT/shots-$plan" and a deck's crops resolve
// <run>/shots-<plan>/<theme>/<shot>.png. Called with a bare directory the shots
// land one level too high, and the deck reports every crop "not captured"
// rather than failing (2026-09-10).
//   CDP_PORT=9981    port for the throw-away Chrome (default 9978)
//   ATTACH_PORT=9299 attach to an Electron instance instead of spawning Chrome
//
// plan.json:
//   { "base": "<url>", "boot": 3500, "width": 1440, "height": 900,
//     "pre": [ ...actions run after every boot... ],
//     "shots": [ { "name": "x", "url": "<override>", "boot": 5000,
//                  "actions": [ ... ], "expect": "<selector or js:expr>",
//                  "sameAsBaseline": false, "probe": true } ] }
// actions:
//   {"click": "<css or js:expr returning an element>"}   real mouse click at its centre
//   {"clickText": "Exact label", "tag": "button"}         click the smallest element with that text
//   {"rightClick": "<css or js:>"}                        real right-button click
//   {"hover": "<css or js:>"}                             move the mouse there
//   {"keyDown": "Shift"} / {"keyUp": "Shift"} / {"key": "Escape", "modifiers": 2}
//   {"type": "text"}                                      insert text at the focus
//   {"eval": "js"}                                        run JS in the page
//   {"dispatch": {"name": "buddy:attach-file", "detail": {...}}}  window CustomEvent
//   {"scrollDialog": "bottom"|"top"|<px>}                 scroll the open dialog's body
//   {"wait": 500}                                         pause (ms); every action accepts "settle"
//   shot-level: "measure": ["<css or js:>", {"text": "Label", "tag": "button"}]
//     → entry.measures[key] = {x,y,w,h} in window pixels (key = the css string or "text:<Label>");
//       a missing element is recorded as null AND fails the shot, because a review deck asked for it.
//   UI_REVIEW_RUN=<id>  stamped on every entry as `run` (coverage.mjs merges by it — hand-off gap 6)
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr, CONTRAST_PROBE } from './cdp-helpers.mjs';

const [planPath, outDir, themeArg] = process.argv.slice(2);
// WHY this check: the args are POSITIONAL, and passing a flag instead (`--out <dir>`, the
// shape most scripts here take) put the literal "--out" in outDir. Every shot then rendered
// and self-verified correctly before the manifest write crashed with an ENOENT naming a path
// nobody typed — the run looked failed when the work was done. 2026-09-10.
for (const arg of [planPath, outDir, themeArg]) {
  if (arg?.startsWith('--')) {
    console.error(`shot.mjs takes POSITIONAL arguments, not flags: got "${arg}".`);
    console.error('Usage: node shot.mjs <plan.json> <outDir> [themes,comma,list]');
    process.exit(2);
  }
}
if (!planPath || !outDir) { console.error('usage: node shot.mjs <plan.json> <outDir> [themes]'); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
// SHARD=k/n runs every n-th shot starting at k, so run-review.sh can spread one plan
// over many Chrome processes: the sweep is wall-clock bound (each shot pays a fixed
// page-boot wait), not CPU bound — 18 processes left a 32-core box 85% idle.
const [SHARD_K, SHARD_N] = (process.env.SHARD ?? '0/1').split('/').map(Number);
plan.shots = plan.shots.filter((_, i) => i % SHARD_N === SHARD_K);
const THEMES = (themeArg ?? 'midnight').split(',');
const CDP_PORT = Number(process.env.CDP_PORT ?? 9978);
// Plans hardcode the workbench default (127.0.0.1:5233); WB_PORT points them at the
// server run-review.sh actually started for this worktree.
const WB_PORT = process.env.WB_PORT;
const wb = (u) => (WB_PORT && u ? u.replace('127.0.0.1:5233', `127.0.0.1:${WB_PORT}`) : u);
const ATTACH = process.env.ATTACH_PORT ? Number(process.env.ATTACH_PORT) : 0;
const PORT = ATTACH || CDP_PORT;
const W = plan.width ?? 1440, H = plan.height ?? 900;
const SAME_THRESHOLD = plan.sameThreshold ?? 0.006; // RMSE (0..1) below which two shots count as identical
// Class collector (see where it runs, below): page-side source for a Set of class names, or null.
const COLLECT = process.env.UI_REVIEW_COLLECT ? `new Set(${JSON.stringify(JSON.parse(readFileSync(process.env.UI_REVIEW_COLLECT, 'utf8')))})` : null;
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'ui-review-'));
const proc = ATTACH ? null : spawn('google-chrome-stable', CHROME_FLAGS(W, H, CDP_PORT, profile), { stdio: 'ignore' });
const cleanup = () => { if (proc) proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);

// RMSE between two PNGs via ImageMagick; null if compare is unavailable.
function rmse(a, b) {
  const r = spawnSync('compare', ['-metric', 'RMSE', a, b, 'null:'], { encoding: 'utf8' });
  const m = /\(([\d.]+)\)/.exec(r.stderr ?? '');
  return m ? Number(m[1]) : null;
}

// Painted-pixel contrast probe: shared with scripts/shoot/ (cdp-helpers.mjs).
const PROBE = CONTRAST_PROBE;

const KEYCODES = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Shift: 16, Control: 17, Alt: 18, ' ': 32 };
const keyParams = (k, modifiers = 0) => ({ key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : (k === 'Shift' ? 'ShiftLeft' : k), windowsVirtualKeyCode: KEYCODES[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0), modifiers });

async function session(theme) {
  let target;
  if (ATTACH) {
    const list = await (await fetch(`http://127.0.0.1:${ATTACH}/json/list`)).json();
    // Prefer the window that actually shows the app (served from the dev Vite on 127.0.0.1/localhost).
    // WHY: the app opens helper windows too (theme-preview generator, floater); on 2026-08-27 the first
    // 'page' target was one of those, and every shot died on its localStorage ('Access is denied').
    target = list.find(t => t.type === 'page' && /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(t.url) && !/devtools|buddy|preview/.test(t.url))
      ?? list.find(t => t.type === 'page' && !/devtools|buddy/.test(t.url)) ?? list[0];
    console.error(`attach: ${list.length} targets, using ${target?.url}`);
    if (!target) throw new Error('no page target on ' + ATTACH);
  } else {
    target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (!ATTACH) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(theme)});}catch{}` });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
  const rectOf = async (expr) => evaluate(rectOfExpr(expr));
  const mouse = async (x, y, button) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    if (!button) return;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // Runs actions; returns the list of failures (a non-empty list = unverified).
  const run = async (actions) => {
    const fails = [];
    for (const a of actions ?? []) {
      try {
        if (a.wait) { await sleep(a.wait); continue; }
        if (a.eval) { await evaluate(a.eval); }
        else if (a.dispatch) { await evaluate(`window.dispatchEvent(new CustomEvent(${JSON.stringify(a.dispatch.name)}, { detail: ${JSON.stringify(a.dispatch.detail ?? null)} }))`); }
        else if (a.scrollDialog !== undefined) {
          const ok = await evaluate(`(() => { const root = document.querySelector('[role=dialog]') || document.body; const s = [...root.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a,b) => b.scrollHeight - a.scrollHeight)[0]; if (!s) return false; const v = ${JSON.stringify(a.scrollDialog)}; s.scrollTop = v === 'bottom' ? s.scrollHeight : v === 'top' ? 0 : Number(v); return true; })()`);
          if (!ok) fails.push(`scrollDialog: no scrollable region`);
        }
        else if (a.click || a.clickText || a.hover || a.rightClick) {
          const expr = a.click ? selExpr(a.click) : a.hover ? selExpr(a.hover) : a.rightClick ? selExpr(a.rightClick) : textExpr(a.clickText, a.tag);
          const r = await rectOf(expr);
          if (!r) { fails.push(`MISSING ${JSON.stringify(a.click ?? a.hover ?? a.rightClick ?? a.clickText)}`); continue; }
          await mouse(r.x, r.y, a.hover ? null : a.rightClick ? 'right' : 'left');
        }
        else if (a.keyDown || a.keyUp) { const k = a.keyDown ?? a.keyUp; await send('Input.dispatchKeyEvent', { type: a.keyDown ? 'keyDown' : 'keyUp', ...keyParams(k, a.modifiers ?? (k === 'Shift' ? 8 : 0)) }); }
        else if (a.key) { const p = keyParams(a.key, a.modifiers ?? 0); await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); }
        else if (a.type) { await send('Input.insertText', { text: a.type }); }
        else if (a.dump) { const d = await evaluate(`[...document.querySelectorAll('button,[role=button],[role=tab],[role=menuitem],a,select,input,textarea')].filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return [e.tagName.toLowerCase(), e.getAttribute('aria-label')||'', e.getAttribute('title')||'', e.textContent.trim().slice(0,40), Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)].join(' | ')}).join('\\n')`); fails.push('DUMP\n' + d); }
        await sleep(a.settle ?? 400);
      } catch (e) { fails.push(`ERR ${JSON.stringify(a).slice(0, 80)}: ${e.message}`); }
    }
    return fails;
  };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
  const probe = async () => JSON.parse(await evaluate(PROBE));
  const close = async () => { try { ws.close(); if (!ATTACH) await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`); } catch { /* gone */ } };
  return { send, evaluate, run, shot, probe, errors, close, selExpr, textExpr };
}

await waitForCdp(PORT);
const manifest = [];
const summary = { verified: 0, unverified: [] };
for (const theme of THEMES) {
  const tdir = join(outDir, theme); mkdirSync(join(tdir, '_unverified'), { recursive: true });
  for (const s of plan.shots) {
    const sess = await session(theme);
    // run stamps UI_REVIEW_RUN on every entry so coverage.mjs can merge manifests from one sweep (hand-off gap 6).
    const entry = { theme, name: s.name, run: process.env.UI_REVIEW_RUN ?? null, verified: false, reasons: [], errors: [], contrastFails: [] };
    try {
      if (ATTACH) { await sess.evaluate(`localStorage.setItem('youcoded-theme', ${JSON.stringify(theme)})`); await sess.send('Page.reload'); }
      else await sess.send('Page.navigate', { url: wb(s.url ?? plan.base) });
      // Readiness poll BEFORE the fixed boot wait: with 24 Chromes loading at once the
      // renderer can take longer than the boot wait just to paint its first frame, and a
      // fixed wait then produces honest-but-useless misses ("MISSING [title=Settings]" in
      // 7 surfaces × 6 themes on the first full sharded sweep, 2026-08-25). The poll
      // waits for the app to have painted real text, then the plan's boot wait still
      // applies on top for data fetches and animations.
      const READY = plan.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
      for (const t0 = Date.now(); Date.now() - t0 < (plan.readyMax ?? 30000);) {
        if (await sess.evaluate(`!!(${READY})`).catch(() => false)) break;
        await new Promise(r => setTimeout(r, 250));
      }
      await new Promise(r => setTimeout(r, s.boot ?? plan.boot ?? 3500));
      const preFails = await sess.run(plan.pre);
      const baseline = join(tdir, `_baseline-${s.name}.png`);
      await sess.shot(baseline);
      const fails = [...preFails.filter(f => !f.startsWith('DUMP')), ...(await sess.run(s.actions))];
      const dumps = fails.filter(f => f.startsWith('DUMP')); const realFails = fails.filter(f => !f.startsWith('DUMP'));
      await new Promise(r => setTimeout(r, s.settle ?? 500));
      const file = join(tdir, `${s.name}.png`);
      await sess.shot(file);
      // Measure named elements for the review deck (spec §4.2): same DOM the screenshot shows.
      if (Array.isArray(s.measure)) {
        entry.measures = {};
        for (const m of s.measure) {
          const key = typeof m === 'string' ? m : `text:${m.text}`;
          const expr = typeof m === 'string' ? sess.selExpr(m) : sess.textExpr(m.text, m.tag);
          entry.measures[key] = await sess.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`).catch(() => null);
          if (!entry.measures[key]) entry.reasons.push(`measure missing: ${key}`);
        }
      }
      // Optional class collector: UI_REVIEW_COLLECT=<json file with a list of class names>
      // records every VISIBLE element carrying one of those classes: its full class list
      // and where it sits in this shot.
      // WHY: the design check (`npm run lint:design`) reports one class on one source line.
      // A single class like px-2 is everywhere, so a review deck matches a warning to its
      // element by the whole class combination on that line, then boxes that element —
      // no hand-written `measure` line per warning. Never fails a shot.
      if (COLLECT) {
        entry.collectedEls = await sess.evaluate(`(() => {
          const want = ${COLLECT}; const els = [];
          const vw = innerWidth, vh = innerHeight;
          for (const el of document.querySelectorAll('[class]')) {
            const cl = el.classList; if (!cl || !cl.length || els.length >= 2000) continue;
            if (![...cl].some((c) => want.has(c))) continue;
            const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            if (b.width < 1 || b.height < 1 || b.bottom <= 0 || b.right <= 0 || b.top >= vh || b.left >= vw || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
            els.push({ c: el.getAttribute('class'), r: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } });
          }
          return els;
        })()`).catch(() => null);
      }
      // --- verification ---
      entry.reasons.push(...realFails);
      if (s.expect) {
        const ok = await sess.evaluate(`!!(${sess.selExpr(s.expect)})`).catch(() => false);
        if (!ok) entry.reasons.push(`expect failed: ${s.expect}`);
      }
      const diff = rmse(baseline, file);
      entry.rmseVsBaseline = diff;
      if ((s.actions?.length ?? 0) > 0 && !s.sameAsBaseline && diff !== null && diff < SAME_THRESHOLD) entry.reasons.push(`identical to baseline (rmse ${diff})`);
      entry.verified = entry.reasons.length === 0;
      entry.dump = dumps.map(d => d.slice(5));
      if (s.probe !== false && entry.verified) { try { entry.contrastFails = await sess.probe(); } catch (e) { entry.reasons.push('probe failed: ' + e.message); } }
      entry.errors = [...new Set(sess.errors)].slice(0, 5);
      if (!entry.verified) { const dest = join(tdir, '_unverified', `${s.name}.png`); renameSync(file, dest); entry.file = dest; summary.unverified.push(`${theme}/${s.name}: ${entry.reasons.join('; ')}`); }
      else { entry.file = file; summary.verified += 1; }
      try { rmSync(baseline); } catch { /* keep going */ }
      console.log(`${entry.verified ? 'ok  ' : 'MISS'} ${theme}/${s.name}${entry.verified ? ` (${entry.contrastFails.length} contrast fails)` : ' — ' + entry.reasons.join('; ').slice(0, 160)}${entry.errors.length ? ` | ${entry.errors.length} js errors` : ''}`);
    } catch (e) {
      entry.reasons.push('FAILED ' + e.message); summary.unverified.push(`${theme}/${s.name}: ${e.message}`);
      console.log(`FAIL ${theme}/${s.name}: ${e.message}`);
    } finally { await sess.close(); manifest.push(entry); }
  }
}
// Unique per run (plan + themes + time) so a targeted re-run never clobbers an
// earlier manifest — coverage.mjs merges them oldest-first.
const mf = join(outDir, `manifest-${planPath.split('/').pop().replace(/\.json$/, '')}-${THEMES.join('-')}-s${SHARD_K}of${SHARD_N}-${Date.now()}.json`);
writeFileSync(mf, JSON.stringify(manifest, null, 2));
console.log(`\n${summary.verified}/${manifest.length} shots verified. Manifest: ${mf}`);
if (summary.unverified.length) { console.log('Unverified (moved to _unverified/):'); for (const u of summary.unverified) console.log('  ' + u); }
process.exit(0);
