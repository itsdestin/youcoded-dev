#!/usr/bin/env node
// Self-verifying screenshot driver for plan-based UI reviews.
//
// Drives the REAL renderer over raw Chrome DevTools Protocol. The page and the
// browser both come from scripts/shoot/engine.mjs: a plan that targets the
// practice app (its `base`/shot `url` names the workbench's hardcoded
// 127.0.0.1:5233) gets it built once (cached until source changes) and served
// on a free port; a plan that already names a real server (a static test page,
// a URL some other tool served) is left untouched — same as today's
// `WB_PORT`-unset no-op, just automatic instead of an env var. No puppeteer/
// playwright dependency, no fixed CDP port, no attaching to a live Electron
// instance (that capability moved to `explore --dev`, scripts/shoot/explore.mjs).
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
//   WORKTREE=<name|branch|path>   which checkout to build+serve when the plan
//                                 needs the practice app (default: the checkout
//                                 next to this script, same rule shoot.mjs uses)
//   UI_REVIEW_COLLECT=<file>     see COLLECT below
//   UI_REVIEW_RUN=<id>           stamped on every entry as `run` (coverage.mjs merges by it)
//
// <outDir> must already END IN shots-<plan> if a review deck is going to read
// these — site-assets.sh passes "$OUT/shots-$plan" and a deck's crops resolve
// <run>/shots-<plan>/<theme>/<shot>.png. Called with a bare directory the shots
// land one level too high, and the deck reports every crop "not captured"
// rather than failing (2026-09-10).
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
//   {"hover": "<css or js:>"}                              move the mouse there
//   {"keyDown": "Shift"} / {"keyUp": "Shift"} / {"key": "Escape", "modifiers": 2}
//   {"type": "text"}                                      insert text at the focus
//   {"eval": "js"}                                        run JS in the page
//   {"dispatch": {"name": "buddy:attach-file", "detail": {...}}}  window CustomEvent
//   {"scrollDialog": "bottom"|"top"|<px>}                 scroll the open dialog's body
//   {"wait": 500}                                         pause (ms); every action accepts "settle"
//   shot-level: "measure": ["<css or js:>", {"text": "Label", "tag": "button"}]
//     → entry.measures[key] = {x,y,w,h} in window pixels (key = the css string or "text:<Label>");
//       a missing element is recorded as null AND fails the shot, because a review deck asked for it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selExpr, textExpr, rectOfExpr, CONTRAST_PROBE } from './cdp-helpers.mjs';
import { ensureBuild, openPool, poolSize, resolveCheckout, runQueue, serve } from '../shoot/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');

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
const THEMES = (themeArg ?? 'midnight').split(',');
const W = plan.width ?? 1440, H = plan.height ?? 900;
const SAME_THRESHOLD = plan.sameThreshold ?? 0.006; // RMSE (0..1) below which two shots count as identical
// Class collector (see where it runs, below): page-side source for a Set of class names, or null.
const COLLECT = process.env.UI_REVIEW_COLLECT ? `new Set(${JSON.stringify(JSON.parse(readFileSync(process.env.UI_REVIEW_COLLECT, 'utf8')))})` : null;
mkdirSync(outDir, { recursive: true });
const log = (m) => console.error(`[shot] ${m}`);

// This checkout by default: the same rule shoot.mjs's sibling (scripts/shoot/shoot.mjs)
// and build.mjs use — inside a session worktree that is <worktree>/youcoded, else the
// main checkout.
function defaultCheckout() {
  const local = join(WORKSPACE, 'youcoded');
  return existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
}

// Only build+serve the photo-only copy when this plan actually names the workbench's
// hardcoded port — a plan that already points at a real server (shot-measure.test.mjs's
// static test page; a future plan filming something else entirely) is used as-is, no
// engine involved. Cheap and correct: the literal appears in every plan that needs it
// (site-gallery.json's `base` and its connect4 shot's `url` override both do).
const NEEDS_APP = JSON.stringify(plan).includes('127.0.0.1:5233');
let server = null;
if (NEEDS_APP) {
  const checkout = process.env.WORKTREE ? resolveCheckout(process.env.WORKTREE) : defaultCheckout();
  const dist = await ensureBuild(checkout, log);
  server = await serve(dist);
}
// Plans hardcode the workbench default (127.0.0.1:5233); WB_PORT used to point them at
// the server run-review.sh had already started — now it's whatever free port the engine
// served THIS run's build on.
const wb = (u) => (server && u ? u.replace('127.0.0.1:5233', `127.0.0.1:${server.port}`) : u);

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

// A pool tab only collects Runtime.exceptionThrown itself (engine.mjs); this plan runner
// also wants console.error, so each tab gets one extra listener, drained per shot below.
function attachConsoleErrors(tab) {
  tab._consoleErrors = [];
  tab.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      tab._consoleErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  });
}
// Fix: a pool tab is reused across many shots, so errors left un-drained by a shot that
// threw before reaching its own drain point would otherwise be misattributed to the NEXT
// shot queued onto the same tab — a risk the old one-target-per-shot design never had.
function takeAllErrors(tab) {
  const c = tab._consoleErrors ?? []; tab._consoleErrors = [];
  return [...new Set([...tab.takeErrors(), ...c])].slice(0, 5);
}

const rectOf = (tab, expr) => tab.evaluate(rectOfExpr(expr));
async function mouse(tab, x, y, button) {
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (!button) return;
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Runs actions; returns the list of failures (a non-empty list = unverified).
async function runActions(tab, actions) {
  const fails = [];
  for (const a of actions ?? []) {
    try {
      if (a.wait) { await sleep(a.wait); continue; }
      if (a.eval) { await tab.evaluate(a.eval); }
      else if (a.dispatch) { await tab.evaluate(`window.dispatchEvent(new CustomEvent(${JSON.stringify(a.dispatch.name)}, { detail: ${JSON.stringify(a.dispatch.detail ?? null)} }))`); }
      else if (a.scrollDialog !== undefined) {
        const ok = await tab.evaluate(`(() => { const root = document.querySelector('[role=dialog]') || document.body; const s = [...root.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a,b) => b.scrollHeight - a.scrollHeight)[0]; if (!s) return false; const v = ${JSON.stringify(a.scrollDialog)}; s.scrollTop = v === 'bottom' ? s.scrollHeight : v === 'top' ? 0 : Number(v); return true; })()`);
        if (!ok) fails.push(`scrollDialog: no scrollable region`);
      }
      else if (a.click || a.clickText || a.hover || a.rightClick) {
        const expr = a.click ? selExpr(a.click) : a.hover ? selExpr(a.hover) : a.rightClick ? selExpr(a.rightClick) : textExpr(a.clickText, a.tag);
        const r = await rectOf(tab, expr);
        if (!r) { fails.push(`MISSING ${JSON.stringify(a.click ?? a.hover ?? a.rightClick ?? a.clickText)}`); continue; }
        await mouse(tab, r.x, r.y, a.hover ? null : a.rightClick ? 'right' : 'left');
      }
      else if (a.keyDown || a.keyUp) { const k = a.keyDown ?? a.keyUp; await tab.send('Input.dispatchKeyEvent', { type: a.keyDown ? 'keyDown' : 'keyUp', ...keyParams(k, a.modifiers ?? (k === 'Shift' ? 8 : 0)) }); }
      else if (a.key) { const p = keyParams(a.key, a.modifiers ?? 0); await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); }
      else if (a.type) { await tab.send('Input.insertText', { text: a.type }); }
      else if (a.dump) { const d = await tab.evaluate(`[...document.querySelectorAll('button,[role=button],[role=tab],[role=menuitem],a,select,input,textarea')].filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return [e.tagName.toLowerCase(), e.getAttribute('aria-label')||'', e.getAttribute('title')||'', e.textContent.trim().slice(0,40), Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)].join(' | ')}).join('\\n')`); fails.push('DUMP\n' + d); }
      await sleep(a.settle ?? 400);
    } catch (e) { fails.push(`ERR ${JSON.stringify(a).slice(0, 80)}: ${e.message}`); }
  }
  return fails;
}

async function shootOne(tab, { theme, s }) {
  const t0 = Date.now();
  const tdir = join(outDir, theme);
  const entry = { theme, name: s.name, run: process.env.UI_REVIEW_RUN ?? null, verified: false, reasons: [], errors: [], contrastFails: [] };
  takeAllErrors(tab); // drop anything left over from a previous shot queued onto this tab
  try {
    await tab.prepare({ theme, width: W, height: H });
    await tab.navigate(wb(s.url ?? plan.base));
    // Readiness poll BEFORE the fixed boot wait: with many Chromes loading at once the
    // renderer can take longer than the boot wait just to paint its first frame, and a
    // fixed wait then produces honest-but-useless misses ("MISSING [title=Settings]" in
    // 7 surfaces × 6 themes on the first full sharded sweep, 2026-08-25). The poll
    // waits for the app to have painted real text, then the plan's boot wait still
    // applies on top for data fetches and animations.
    const READY = plan.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
    for (const t1 = Date.now(); Date.now() - t1 < (plan.readyMax ?? 30000);) {
      if (await tab.evaluate(`!!(${READY})`).catch(() => false)) break;
      await sleep(250);
    }
    await sleep(s.boot ?? plan.boot ?? 3500);
    const preFails = await runActions(tab, plan.pre);
    const baseline = join(tdir, `_baseline-${s.name}.png`);
    writeFileSync(baseline, await tab.png());
    const fails = [...preFails.filter((f) => !f.startsWith('DUMP')), ...(await runActions(tab, s.actions))];
    const dumps = fails.filter((f) => f.startsWith('DUMP')); const realFails = fails.filter((f) => !f.startsWith('DUMP'));
    await sleep(s.settle ?? 500);
    const file = join(tdir, `${s.name}.png`);
    writeFileSync(file, await tab.png());
    // Measure named elements for the review deck (spec §4.2): same DOM the screenshot shows.
    if (Array.isArray(s.measure)) {
      entry.measures = {};
      for (const m of s.measure) {
        const key = typeof m === 'string' ? m : `text:${m.text}`;
        const expr = typeof m === 'string' ? selExpr(m) : textExpr(m.text, m.tag);
        entry.measures[key] = await tab.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`).catch(() => null);
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
      entry.collectedEls = await tab.evaluate(`(() => {
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
      const ok = await tab.evaluate(`!!(${selExpr(s.expect)})`).catch(() => false);
      if (!ok) entry.reasons.push(`expect failed: ${s.expect}`);
    }
    const diff = rmse(baseline, file);
    entry.rmseVsBaseline = diff;
    if ((s.actions?.length ?? 0) > 0 && !s.sameAsBaseline && diff !== null && diff < SAME_THRESHOLD) entry.reasons.push(`identical to baseline (rmse ${diff})`);
    entry.verified = entry.reasons.length === 0;
    entry.dump = dumps.map((d) => d.slice(5));
    if (s.probe !== false && entry.verified) { try { entry.contrastFails = JSON.parse(await tab.evaluate(PROBE)); } catch (e) { entry.reasons.push('probe failed: ' + e.message); } }
    entry.errors = takeAllErrors(tab);
    if (!entry.verified) { const dest = join(tdir, '_unverified', `${s.name}.png`); renameSync(file, dest); entry.file = dest; }
    else { entry.file = file; }
    try { rmSync(baseline); } catch { /* keep going */ }
    console.log(`${entry.verified ? 'ok  ' : 'MISS'} ${theme}/${s.name}${entry.verified ? ` (${entry.contrastFails.length} contrast fails)` : ' — ' + entry.reasons.join('; ').slice(0, 160)}${entry.errors.length ? ` | ${entry.errors.length} js errors` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    entry.reasons.push('FAILED ' + e.message);
    console.log(`FAIL ${theme}/${s.name}: ${e.message}`);
  }
  return entry;
}

let pool = null;
process.on('exit', () => { try { pool?.close(); } catch { /* best effort */ } try { server?.close(); } catch { /* best effort */ } });

for (const theme of THEMES) mkdirSync(join(outDir, theme, '_unverified'), { recursive: true });
const jobs = THEMES.flatMap((theme) => plan.shots.map((s) => ({ theme, s })));
const size = poolSize(jobs.length);
log(`${plan.shots.length} shot(s) × ${THEMES.length} theme(s) = ${jobs.length} picture(s), ${size.browsers} browser(s) × ${Math.ceil(size.tabs / size.browsers)} tab(s)`);
pool = await openPool({ ...size, width: W, height: H });
for (const tab of pool.tabs) attachConsoleErrors(tab);
const t0all = Date.now();
const manifest = await runQueue(pool, jobs, (tab, job) => shootOne(tab, job));
log(`pictures taken in ${((Date.now() - t0all) / 1000).toFixed(1)}s`);

const summary = { verified: manifest.filter((e) => e.verified).length, unverified: manifest.filter((e) => !e.verified).map((e) => `${e.theme}/${e.name}: ${e.reasons.join('; ')}`) };
// Unique per run (plan + themes + time) so a targeted re-run never clobbers an
// earlier manifest — coverage.mjs merges them oldest-first.
const mf = join(outDir, `manifest-${planPath.split('/').pop().replace(/\.json$/, '')}-${THEMES.join('-')}-${Date.now()}.json`);
writeFileSync(mf, JSON.stringify(manifest, null, 2));
console.log(`\n${summary.verified}/${manifest.length} shots verified. Manifest: ${mf}`);
if (summary.unverified.length) { console.log('Unverified (moved to _unverified/):'); for (const u of summary.unverified) console.log('  ' + u); }
process.exit(0);
