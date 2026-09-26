#!/usr/bin/env node
// shoot — photograph named screens of the practice app. No clicking: every screen
// opens directly by name (the screen list lives in the app,
// desktop/src/renderer/dev/workbench/screens/). Spec:
// docs/archive/specs/2026-09-24-shoot-and-explore.md.
//
//   shoot settings/*                                  every Settings screen, the default themes
//   shoot settings/sound settings/about --themes all  any names, every theme
//   shoot --tag dialog --width 390                    by tag, at phone width
//   shoot settings/* --before master --after <wt>     side by side, each side from its own checkout
//   shoot --list                                      every screen name, with tags
//   shoot --all                                       everything
//   shoot --check                                     open every screen once (one theme), press Escape once; exit 1 on any failure
//
// Options: --worktree <name|branch|path> (default: the checkout this script sits in, else
// the main one) · --themes a,b | all · --width N [--height N] · --contrast · --collect <classes.json> · --out <dir>
//
// A picture only counts when its screen proved it is showing (the <ScreenMark> inside its
// panel is on screen and not covered). Anything else is listed with a reason, never shown.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, openPool, poolSize, resolveCheckout, runQueue, serve } from './engine.mjs';
import { CONTRAST_PROBE } from '../ui-review/cdp-helpers.mjs';
import { inPage, listLayers } from './explore-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
// Destin, 2026-09-24: the two hardest themes (wallpaper, glass) are the default.
const DEFAULT_THEMES = ['meadow-mist', 'halftone-dimension'];
const ALL_THEMES = ['midnight', 'light', 'halftone-dimension', 'meadow-mist', 'creme', 'dark'];
const CHECK_THEME = 'light';
// Two pictures are "the same" when a 480-px-wide grey copy differs by under 0.01% on average (dim text on dark themes moves little).
// WHY this fine: states that differ by one line of text (OpenRouter's 'key expired' vs
// 'key not accepted') passed as identical at 96 px / 0.1%.
const LOOKALIKE = 0.0001;
const THUMB_W = 480;

// ─── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = { names: [], tags: [], themes: null, width: 1440, height: null, contrast: false, collect: null, out: null, worktree: null, before: null, after: null, list: false, all: false, check: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i]; const next = () => { const v = args[++i]; if (v === undefined) die(`${a} needs a value`); return v; };
  if (a === '--tag') opt.tags.push(next());
  else if (a === '--themes') opt.themes = next();
  else if (a === '--width') opt.width = Number(next());
  else if (a === '--height') opt.height = Number(next());
  else if (a === '--contrast') opt.contrast = true;
  else if (a === '--collect') opt.collect = JSON.parse(readFileSync(resolve(next()), 'utf8'));
  else if (a === '--out') opt.out = resolve(next());
  else if (a === '--worktree') opt.worktree = next();
  else if (a === '--before') opt.before = next();
  else if (a === '--after') opt.after = next();
  else if (a === '--list') opt.list = true;
  else if (a === '--all') opt.all = true;
  else if (a === '--check') opt.check = true;
  else if (a === '-h' || a === '--help') { console.log(readHelp()); process.exit(0); }
  else if (a.startsWith('--')) die(`unknown option ${a} (see shoot --help)`);
  else opt.names.push(a);
}
function die(msg) { console.error(`shoot: ${msg}`); process.exit(2); }
function readHelp() { return spawnSync('sed', ['-n', '2,17p', fileURLToPath(import.meta.url)], { encoding: 'utf8' }).stdout.replace(/^\/\/ ?/gm, ''); }

const themes = opt.check ? [CHECK_THEME] : opt.themes === 'all' ? ALL_THEMES : opt.themes ? opt.themes.split(',') : DEFAULT_THEMES;
const width = opt.width; const height = opt.height ?? (width < 640 ? 844 : 900);
const log = (m) => console.error(`[shoot] ${m}`);

// This checkout by default: inside a session worktree that is <worktree>/youcoded.
function defaultCheckout() {
  const local = join(WORKSPACE, 'youcoded');
  return existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
}

// ─── One side: build, serve, list, shoot ─────────────────────────────────────
async function side(checkout, outDir, pick) {
  const dist = await ensureBuild(checkout, log);
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.port}/index.html`;
  let pool;
  try {
    // One tab reads the screen list from the app itself, so the CLI never keeps a copy.
    const probe = await openPool({ tabs: 1, browsers: 1 });
    let screens;
    try {
      const t = probe.tabs[0];
      await t.prepare({ theme: 'light', width: 1440, height: 900 });
      await t.navigate(`${base}?mode=workbench&child=1&latency=0`);
      screens = await waitFor(t, 'window.__youcodedScreens && window.__youcodedScreens.list()', 20_000);
    } finally { probe.close(); }
    if (!screens) return { missingList: true, results: [], server };
    const chosen = pick(screens);
    if (opt.list) return { screens, results: [], server };
    if (!chosen.length) return { screens, results: [], server, empty: true };
    const jobs = chosen.flatMap((s) => themes.map((theme) => ({ screen: s, theme })));
    const size = poolSize(jobs.length);
    log(`${chosen.length} screen(s) × ${themes.length} theme(s) = ${jobs.length} picture(s), ${size.browsers} browser(s) × ${Math.ceil(size.tabs / size.browsers)} tab(s)`);
    pool = await openPool({ ...size, width, height });
    const t0 = Date.now();
    const results = await runQueue(pool, jobs, (tab, job) => shootOne(tab, base, job, outDir));
    log(`pictures taken in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { screens, results, server };
  } finally { pool?.close(); server.close(); }
}

async function waitFor(tab, expr, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 50))) {
    const v = await tab.evaluate(`(() => { try { return ${expr}; } catch { return null; } })()`, 5000).catch(() => null);
    if (v) return v;
  }
  return null;
}

// Is the screen's mark on screen? Its surface is the nearest dialog / layer / drawer around it.
// Returns the panel's box when it is, or the reason it is not.
// A screen can be mounted more than once (one chat per session), so every copy of the mark
// is tried: the first one that is showing wins, otherwise the first copy's reason is returned.
const MARK_CHECK = (name) => `(() => {
  const marks = [...document.querySelectorAll('[data-screen="${name.replace(/"/g, '')}"]')];
  if (!marks.length) return 'its mark is not on the page';
  const check = (m) => {
  // The mark's own section first: a screen inside a scrolling panel (an editor under a
  // list) is scrolled to, and must itself have size — the panel around it is not enough.
  const own = m.parentElement;
  if (own) { own.scrollIntoView({ block: 'nearest' }); const o = own.getBoundingClientRect(); if (o.width < 2 || o.height < 2) return 'its own section has no size'; }
  const s = m.closest('[role=dialog], .layer-surface, .settings-drawer') || m.parentElement;
  const r = s.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return 'its panel has no size';
  if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return 'its panel is off screen';
  for (let e = s; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return 'its panel is hidden'; }
  const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 60), 1), innerHeight - 2);
  const hit = document.elementFromPoint(x, y);
  if (!hit || !s.contains(hit)) return 'its panel is covered by ' + (hit ? hit.tagName.toLowerCase() + (hit.getAttribute('aria-label') ? ' "' + hit.getAttribute('aria-label') + '"' : '') : 'nothing');
  // The panel's box, clipped to the window: review decks draw their highlight from it.
  const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top);
  return { panel: { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.min(innerWidth, r.right) - x0), h: Math.round(Math.min(innerHeight, r.bottom) - y0) } };
  };
  const results = marks.map(check);
  return results.find((x) => x && x.panel) || results[0];
})()`;

const COLLECT = (classes) => `(() => {
  const want = new Set(${JSON.stringify(classes)}); const els = [];
  for (const el of document.querySelectorAll('[class]')) {
    const cl = el.classList; if (!cl || !cl.length || els.length >= 2000) continue;
    if (![...cl].some((c) => want.has(c))) continue;
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (b.width < 1 || b.height < 1 || b.bottom <= 0 || b.right <= 0 || b.top >= innerHeight || b.left >= innerWidth || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    els.push({ c: el.getAttribute('class'), r: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } });
  }
  return els;
})()`;

const THUMB = (b64) => `(async () => { const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode();
  const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data; const out = new Array(d.length / 4);
  for (let i = 0; i < d.length; i += 4) out[i / 4] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; return out; })()`;

async function shootOne(tab, base, { screen, theme }, outDir) {
  const t0 = Date.now();
  const r = { name: screen.name, theme, ok: false, reason: '', file: null, ms: 0, errors: [] };
  try {
    // An entry may carry its own window (a phone screen); --width/--height apply otherwise.
    const w = screen.viewport?.width ?? width, h = screen.viewport?.height ?? height;
    await tab.prepare({ theme, width: w, height: h });
    const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: '0', scenario: screen.scenario ?? 'default', ...(screen.params ?? {}) });
    await tab.navigate(`${base}?${q}`);
    if (!(await waitFor(tab, "window.__youcodedScreens && document.body.innerText.trim().length > 20", 20_000))) throw new Error('the app did not start within 20 s');
    await tab.still(3000);
    // Up to 3 presses of "open": a screen whose content arrives late (the first conversation
    // in a list that is still loading) has nothing to open on the first press. Openers are
    // idempotent, so a second press on an open screen changes nothing.
    let why = '';
    for (let attempt = 0; attempt < 3 && !why?.panel; attempt++) {
      const opened = await tab.evaluate(`window.__youcodedScreens.open(${JSON.stringify(screen.name)})`, 20_000);
      if (!opened?.ok) throw new Error(opened?.reason ?? 'open failed');
      for (const t1 = Date.now(); Date.now() - t1 < 2500;) {
        await tab.still(1500);
        why = await tab.evaluate(MARK_CHECK(screen.name.split('#')[0]), 5000);   // a #state is marked as its plain screen
        if (why?.panel) break;
      }
    }
    if (!why?.panel) throw new Error(`not showing: ${why}`);
    r.panel = why.panel;
    const png = await tab.png();
    const dir = join(outDir, ...screen.name.split('/')); mkdirSync(dir, { recursive: true });
    r.file = join(dir, `${theme}.png`); writeFileSync(r.file, png);
    const small = await tab.png({ clip: { x: 0, y: 0, width: w, height: h, scale: THUMB_W / w } });
    r.thumb = await tab.evaluate(THUMB(small.toString('base64')), 10_000).catch(() => null);
    if (opt.contrast) r.contrastFails = JSON.parse(await tab.evaluate(CONTRAST_PROBE, 15_000));
    // --collect <classes.json>: every visible element carrying one of those classes, with its
    // full class list and box — the design check (scripts/ui-review/design-check/) matches a
    // lint warning to its element by the whole class combination on the warned source line.
    if (opt.collect) r.collectedEls = await tab.evaluate(COLLECT(opt.collect), 15_000).catch(() => null);
    // --check also presses Escape once: exactly the top layer must close — not nothing, not
    // the panel under it, not two at once. WHY (2026-09-26): ten dialogs got this wrong
    // before the shell took it over, and nothing noticed until a sweep like this one.
    if (opt.check) {
      const layersNow = async () => (await tab.evaluate(inPage(listLayers), 10_000)).layers.filter((l) => l.kind !== 'tooltip').map((l) => `${l.kind} "${l.name}"`);
      const before = await layersNow();
      if (before.length) {
        await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await tab.still(2000);
        const after = await layersNow();
        const want = before.slice(1).join(' › ');
        if (after.join(' › ') !== want) throw new Error(`Escape should close ${before[0]} only; open before: ${before.join(' › ')} — after: ${after.join(' › ') || 'nothing'}`);
      }
    }
    r.ok = true;
  } catch (e) { r.reason = e.message; }
  r.errors = tab.takeErrors(); r.ms = Date.now() - t0;
  console.error(`${r.ok ? 'ok  ' : 'FAIL'} ${screen.name} · ${theme} (${(r.ms / 1000).toFixed(1)}s)${r.ok ? '' : ' — ' + r.reason}`);
  return r;
}

// ─── Picking screens ─────────────────────────────────────────────────────────
function picker(screens) {
  if (opt.all || opt.check) return screens;
  const unknown = [];
  const byName = opt.names.flatMap((n) => {
    const hit = n.endsWith('/*') ? screens.filter((s) => s.name === n.slice(0, -2) || s.name.startsWith(n.slice(0, -1))) : n.includes('*') ? screens.filter((s) => new RegExp('^' + n.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(s.name)) : screens.filter((s) => s.name === n);
    if (!hit.length) unknown.push(n);
    return hit;
  });
  if (unknown.length) die(`no screen named ${unknown.join(', ')} — shoot --list shows every name`);
  const byTag = opt.tags.length ? screens.filter((s) => opt.tags.every((t) => s.tags.includes(t))) : [];
  const seen = new Set();
  return [...byName, ...byTag].filter((s) => !seen.has(s.name) && seen.add(s.name));
}

// ─── Reports ─────────────────────────────────────────────────────────────────
function lookalikes(results, screens) {
  const same = new Map(screens.filter((s) => s.sameAs).map((s) => [s.name, s.sameAs.name]));
  const expected = (a, b) => same.get(a) === b || same.get(b) === a;
  const out = [];
  for (const theme of themes) {
    const got = results.filter((r) => r.ok && r.theme === theme && r.thumb);
    for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) {
      const a = got[i].thumb, b = got[j].thumb; if (a.length !== b.length) continue;
      let d = 0; for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
      if (d / a.length / 255 < LOOKALIKE && !expected(got[i].name, got[j].name)) out.push(`${got[i].name} = ${got[j].name} (${theme})`);
    }
  }
  return out;
}

function sheet(results, outDir) {
  if (spawnSync('magick', ['-version']).status !== 0) return [];
  const made = [];
  for (const theme of themes) {
    const ok = results.filter((r) => r.ok && r.theme === theme);
    if (ok.length < 2) continue;
    const file = join(outDir, `sheet-${theme}.jpg`);
    const argv = ['montage', ...ok.flatMap((r) => ['-label', r.name, r.file]), '-tile', '4x', '-geometry', '480x300+8+8', '-pointsize', '14', '-background', '#222', '-fill', '#eee', '-quality', '85', file];
    if (spawnSync('magick', argv).status === 0) made.push(file);
  }
  return made;
}

function summarize(label, { results, screens }, outDir) {
  const ok = results.filter((r) => r.ok); const bad = results.filter((r) => !r.ok);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${label}${ok.length}/${results.length} pictures${ms.length ? ` · median ${(ms[ms.length >> 1] / 1000).toFixed(1)}s each` : ''}`);
  for (const r of bad) console.log(`  NOT TAKEN  ${r.name} · ${r.theme} — ${r.reason}`);
  const same = lookalikes(results, screens);
  for (const s of same) console.log(`  LOOK-ALIKE ${s} — different screens, same picture. If that is expected, add sameAs to the screen list.`);
  const errs = ok.filter((r) => r.errors.length);
  for (const r of errs) console.log(`  PAGE ERROR ${r.name} · ${r.theme} — ${r.errors[0].split('\n')[0].slice(0, 160)}`);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(results.map(({ thumb, ...r }) => r), null, 2));
  // --contrast: the painted-pixel report beside the pictures (text too faint on its own
  // background, per theme). Same report the old sweep wrote; it reads this manifest.
  if (opt.contrast) {
    const rep = spawnSync(process.execPath, [join(WORKSPACE, 'scripts', 'ui-review', 'contrast-report.mjs'), outDir], { encoding: 'utf8' });
    writeFileSync(join(outDir, 'contrast.md'), rep.stdout || rep.stderr);
    log(`contrast report: ${join(outDir, 'contrast.md')}`);
  }
  return { bad: bad.length, same: same.length };
}

// ─── Before / after ─────────────────────────────────────────────────────────
function compare(before, after, outDir) {
  if (spawnSync('magick', ['-version']).status !== 0) { console.log('  (install ImageMagick for side-by-side pictures)'); return; }
  const dir = join(outDir, 'compare'); mkdirSync(dir, { recursive: true });
  const key = (r) => `${r.name}|${r.theme}`;
  const B = new Map(before.results.map((r) => [key(r), r])); const A = new Map(after.results.map((r) => [key(r), r]));
  const placeholder = (text) => ['-size', `${width}x${height}`, 'xc:#333', '-gravity', 'center', '-fill', '#ddd', '-pointsize', '36', '-annotate', '0', text];
  for (const k of new Set([...B.keys(), ...A.keys()])) {
    const [name, theme] = k.split('|'); const b = B.get(k); const a = A.get(k);
    const leftSrc = b?.ok ? [b.file] : placeholder(b ? `Before: not taken\n${b.reason.slice(0, 60)}` : 'Not on the before side');
    const rightSrc = a?.ok ? [a.file] : placeholder(a ? `After: not taken\n${a.reason.slice(0, 60)}` : 'Not on the after side');
    const file = join(dir, `${name.replace(/\//g, '__')}--${theme}.png`);
    spawnSync('magick', ['(', ...leftSrc, '-gravity', 'north', '-splice', '0x40', '-pointsize', '24', '-annotate', '+0+8', 'BEFORE', ')', '(', ...rightSrc, '-gravity', 'north', '-splice', '0x40', '-pointsize', '24', '-annotate', '+0+8', 'AFTER', ')', '+append', file]);
  }
  console.log(`  side by side: ${dir}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const outDir = opt.out ?? join(WORKSPACE, 'scratch', 'shoot', stamp);
if (!opt.list && !opt.all && !opt.check && !opt.names.length && !opt.tags.length) die('name some screens (shoot --list), or pass --all / --check');

const t0 = Date.now();
if (opt.before || opt.after) {
  if (!opt.before || !opt.after) die('--before and --after go together');
  const results = {};
  for (const which of ['before', 'after']) {
    const checkout = resolveCheckout(opt[which]);
    const out = join(outDir, which); mkdirSync(out, { recursive: true });
    const r = await side(checkout, out, picker);
    if (r.missingList) die(`the ${which} side (${checkout}) has no screen list yet — until phase 1 of shoot is merged there, compare with scripts/ui-review/record-pair.sh / montage-ab.sh`);
    results[which] = r;
  }
  summarize('before: ', results.before, join(outDir, 'before'));
  summarize('after:  ', results.after, join(outDir, 'after'));
  compare(results.before, results.after, outDir);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
  process.exit(0);
}

const checkout = opt.worktree ? resolveCheckout(opt.worktree) : defaultCheckout();
if (!opt.list) mkdirSync(outDir, { recursive: true });
const r = await side(checkout, outDir, picker);
if (r.missingList) die(`${checkout} has no screen list (it predates shoot phase 1)`);
if (opt.list) {
  for (const s of r.screens) console.log(`${s.name.padEnd(40)} ${s.tags.join(', ')}${s.scenario && s.scenario !== 'default' ? `  [scenario ${s.scenario}]` : ''}`);
  process.exit(0);
}
if (r.empty) die('nothing matched');
const { bad, same } = summarize('', r, outDir);
if (!opt.check) for (const f of sheet(r.results, outDir)) console.log(`  contact sheet: ${f}`);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
process.exit(opt.check && (bad > 0 || same > 0) ? 1 : 0);
