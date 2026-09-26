#!/usr/bin/env node
// DOM-size sweep — how many elements each screen builds under the workbench's `stress`
// scenario. Fails any surface whose element count is over NODE_BUDGET.
//
// WHY THIS EXISTS (render-cost plan, docs/archive/investigations/2026-09-18-list-render-cost-sweep.md):
// the Conversations-tab freeze came from drawing every row of a long list at once.
// The node count of an open surface is the behaviour that proves a list is bounded —
// a source-text scanner was tried and missed 6 of 11 offenders (plan §"Revised" #2).
//
// A surface that could not be PROVEN open is a FAIL, never skipped — the same stance
// as coverage.md ("a surface not proven open is unreviewed, not fine"). Proof the guard
// can see an unbounded list: before the fixes it was red on Conversations (17,546),
// Files search (11,242), Marketplace (58,706) and model search (24,679); after them all
// seven surfaces sit between ~900 and ~3,300 (investigation doc §1, "after" table).
//
// WHERE IT RUNS: on request (it was the old sweep's last step until that sweep was
// retired, 2026-09-26); over budget exits 1. Not in scripts/verify.sh: at ~30 s with
// 2,000 rows per list it would nearly double that check's browser time for a guard the
// per-surface stress pins (vitest, in verify.sh) already cover list by list.
//
// HOW IT OPENS SURFACES (rewritten onto the `shoot`/`explore` engine,
// docs/active/specs/2026-09-24-shoot-and-explore.md): it builds and serves its own
// photo-only copy of the app (scripts/shoot/engine.mjs — a free port, no cdp-ports.sh,
// no run-workbench.sh), reads the app's own screen list
// (desktop/src/renderer/dev/workbench/screens/*.ts via `window.__youcodedScreens.list()`),
// and opens each one BY NAME (`window.__youcodedScreens.open(name)`) — the same names
// `shoot --list` prints, and the same MARK_CHECK proof-of-showing shoot.mjs uses. No
// clicking, so a renamed button or moved menu can never make this sweep miss a surface.
//
// WHICH SCREENS: every entry whose OWN scenario is `default` (unset), forced into
// `stress` instead — that generalises the old fixed 7-surface list to "every screen,
// at scale" without hand-picking click paths again. An entry that already needs its
// own scenario (`empty`, the `#stress` states, `statusbar-*`, `site`, `welcome-back`…)
// is SKIPPED and reported with why: forcing `stress` onto a screen that is itself a
// specific different state would stop proving that state and start proving nothing.
// `?stressRows=N` is the same override scenarios.ts has always read (default 2000
// here, matching this sweep's old default; the practice app's own default is 220).
//
// Usage (no serving workbench needed — this builds and serves its own copy):
//   node scripts/ui-review/dom-size-sweep.mjs [--worktree <name|branch|path>] [--rows 2000]
//     [--only settings/*,projects/conversations] [--budget 8000] [--width 1440] [--height 900] [--dump]
// Exit: 0 all PASS · 1 any FAIL (over budget or not proven open) · 2 setup error.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, openPool, poolSize, resolveCheckout, runQueue, serve } from '../shoot/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');

// WHY: the Resume browser at 1,642 rows is 1,585 nodes bounded and 37,920 unbounded
// (f8ca631b) — 8,000 sits far above any bounded screen plus app chrome and far below
// any unbounded one. Kept as this exact literal: .claude/rules/renderer-lists.md
// anchors on `NODE_BUDGET = 8000` in this file.
const NODE_BUDGET = 8000;

const argv = process.argv.slice(2);
const opt = { worktree: null, rows: 2000, only: null, budget: NODE_BUDGET, width: 1440, height: 900, theme: 'light', dump: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]; const next = () => { const v = argv[++i]; if (v === undefined) die(`${a} needs a value`); return v; };
  if (a === '--worktree') opt.worktree = next();
  else if (a === '--rows') opt.rows = Number(next());
  else if (a === '--only') opt.only = next();
  else if (a === '--budget') opt.budget = Number(next());
  else if (a === '--width') opt.width = Number(next());
  else if (a === '--height') opt.height = Number(next());
  else if (a === '--theme') opt.theme = next();
  else if (a === '--dump') opt.dump = true;
  else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  else die(`unknown option ${a} (see --help)`);
}
function die(msg) { console.error(`dom-size-sweep: ${msg}`); process.exit(2); }
function printHelp() {
  console.log(`node scripts/ui-review/dom-size-sweep.mjs [--worktree <name|branch|path>] [--rows 2000]
  [--only settings/*,projects/conversations] [--budget 8000] [--width 1440] [--height 900] [--dump]

Sweeps every screen whose OWN scenario is 'default', opened by name under a forced
'stress' scenario with ?stressRows=<rows>. A screen that needs its own scenario is
skipped and reported with why. Exit: 0 all PASS, 1 any FAIL, 2 setup error.`);
}
const log = (m) => console.error(`[dom-size-sweep] ${m}`);

// This checkout by default: inside a session worktree that is <worktree>/youcoded — same
// resolution shoot.mjs uses, so the two tools always mean the same checkout by default.
function defaultCheckout() {
  const local = join(WORKSPACE, 'youcoded');
  return existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
}

const DEFAULT_SCENARIO = (s) => !s.scenario || s.scenario === 'default';

// Same matcher shoot.mjs's picker uses (exact / `area/*` prefix / `*` glob), over the
// WHOLE screen list — so a name that exists but needs its own scenario is reported as
// "skipped", never silently treated as unknown.
function matchNames(names, screens) {
  const unknown = [];
  const hit = names.flatMap((n) => {
    const found = n.endsWith('/*')
      ? screens.filter((s) => s.name === n.slice(0, -2) || s.name.startsWith(n.slice(0, -1)))
      : n.includes('*')
        ? screens.filter((s) => new RegExp('^' + n.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(s.name))
        : screens.filter((s) => s.name === n);
    if (!found.length) unknown.push(n);
    return found;
  });
  if (unknown.length) die(`no screen named ${unknown.join(', ')} — node scripts/shoot/shoot.mjs --list shows every name`);
  const seen = new Set();
  return hit.filter((s) => !seen.has(s.name) && seen.add(s.name));
}

async function waitFor(tab, expr, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 50))) {
    const v = await tab.evaluate(`(() => { try { return ${expr}; } catch { return null; } })()`, 5000).catch(() => null);
    if (v) return v;
  }
  return null;
}

// Is the screen's mark on screen and not covered? Copied from scripts/shoot/shoot.mjs's
// MARK_CHECK (kept in lockstep by eye — both read the same `<ScreenMark>`/`data-screen`
// contract, shoot-screens.test.ts pins the contract itself). Only the boolean/reason
// matters here; the panel box (which shoot.mjs draws highlights from) is unused.
const MARK_CHECK = (name) => `(() => {
  const marks = [...document.querySelectorAll('[data-screen="${name.replace(/"/g, '')}"]')];
  if (!marks.length) return 'its mark is not on the page';
  const check = (m) => {
    const own = m.parentElement;
    if (own) { own.scrollIntoView({ block: 'nearest' }); const o = own.getBoundingClientRect(); if (o.width < 2 || o.height < 2) return 'its own section has no size'; }
    const s = m.closest('[role=dialog], .layer-surface, .settings-drawer') || m.parentElement;
    const r = s.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'its panel has no size';
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return 'its panel is off screen';
    for (let e = s; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return 'its panel is hidden'; }
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 60), 1), innerHeight - 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !s.contains(hit)) return 'its panel is covered by ' + (hit ? hit.tagName.toLowerCase() : 'nothing');
    return { shown: true };
  };
  const results = marks.map(check);
  return results.find((x) => x && x.shown) || results[0];
})()`;

const COUNT_EXPR = `document.querySelectorAll('*').length`;

// Poll until the node count has stopped changing for 1.5s — a list still mounting
// (fixture fetch, image decode) would otherwise be read half-built and look cheap.
async function settleAndCount(tab, capMs = 20000) {
  const t0 = Date.now();
  await tab.still(3000);
  let last = -1; let stableSince = Date.now();
  while (Date.now() - t0 < capMs) {
    const n = await tab.evaluate(COUNT_EXPR, 5000).catch(() => -1);
    if (n !== last) { last = n; stableSince = Date.now(); } else if (Date.now() - stableSince >= 1500) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

async function sweepOne(tab, base, screen, rows, width, height) {
  const t0 = Date.now();
  const w = screen.viewport?.width ?? width, h = screen.viewport?.height ?? height;
  const row = { surface: screen.name, nodes: null, why: '', ms: 0 };
  try {
    await tab.prepare({ theme: opt.theme, width: w, height: h });
    const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: '0', scenario: 'stress', ...(screen.params ?? {}), stressRows: String(rows) });
    await tab.navigate(`${base}?${q}`);
    if (!(await waitFor(tab, "window.__youcodedScreens && document.body.innerText.trim().length > 20", 20_000))) throw new Error('the app did not start within 20 s');
    await tab.still(3000);
    let why = '';
    for (let attempt = 0; attempt < 3 && !why?.shown; attempt++) {
      const opened = await tab.evaluate(`window.__youcodedScreens.open(${JSON.stringify(screen.name)})`, 20_000);
      if (!opened?.ok) throw new Error(opened?.reason ?? 'open failed');
      for (const t1 = Date.now(); Date.now() - t1 < 2500;) {
        await tab.still(1500);
        why = await tab.evaluate(MARK_CHECK(screen.name.split('#')[0]), 5000); // a #state is marked as its plain screen
        if (why?.shown) break;
      }
    }
    if (!why?.shown) throw new Error(`not showing: ${why}`);
    row.nodes = await settleAndCount(tab);
    if (opt.dump) console.error(`[${screen.name}] ` + await tab.evaluate(`[...document.querySelectorAll('button,input,[role=dialog]')].filter(e=>e.offsetParent!==null).slice(0,60).map(e=>e.tagName+'|'+(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')+'|'+e.textContent.trim().slice(0,30)).join('\\n')`, 10_000).catch(() => '(dump failed)'));
  } catch (e) { row.why = e.message; }
  row.pass = row.nodes !== null && row.nodes <= opt.budget;
  row.ms = Date.now() - t0;
  console.error(`  ${row.pass ? 'PASS' : 'FAIL'}  ${row.surface}  ${row.nodes ?? '—'}${row.why ? '  (' + row.why + ')' : ''}  (${(row.ms / 1000).toFixed(1)}s)`);
  return row;
}

// ---- main ----------------------------------------------------------------------
try {
  const checkout = opt.worktree ? resolveCheckout(opt.worktree) : defaultCheckout();
  const dist = await ensureBuild(checkout, log);
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.port}/index.html`;
  try {
    // One tab reads the screen list from the app itself, so this tool never keeps a copy.
    const probe = await openPool({ tabs: 1, browsers: 1 });
    let screens;
    try {
      const t = probe.tabs[0];
      await t.prepare({ theme: 'light', width: 1440, height: 900 });
      await t.navigate(`${base}?mode=workbench&child=1&latency=0`);
      screens = await waitFor(t, 'window.__youcodedScreens && window.__youcodedScreens.list()', 20_000);
    } finally { probe.close(); }
    if (!screens) die(`${checkout} has no screen list (it predates shoot phase 1)`);

    const skipped = [];
    let chosen;
    if (opt.only) {
      const names = opt.only.split(',').map((s) => s.trim()).filter(Boolean);
      const matched = matchNames(names, screens);
      chosen = matched.filter(DEFAULT_SCENARIO);
      for (const s of matched.filter((s) => !DEFAULT_SCENARIO(s))) skipped.push({ name: s.name, why: `needs its own scenario '${s.scenario}' — requested, but forcing stress onto it would stop proving that state` });
    } else {
      chosen = screens.filter(DEFAULT_SCENARIO);
      for (const s of screens.filter((s) => !DEFAULT_SCENARIO(s))) skipped.push({ name: s.name, why: `needs its own scenario '${s.scenario}'` });
    }
    if (!chosen.length) die('nothing matched (nothing has scenario "default" — check --only)');

    log(`${chosen.length} screen(s), stress scenario, ?stressRows=${opt.rows}`);
    const size = poolSize(chosen.length);
    log(`${size.browsers} browser(s) × ${Math.ceil(size.tabs / size.browsers)} tab(s)`);
    const pool = await openPool({ ...size, width: opt.width, height: opt.height });
    const t0 = Date.now();
    let rows;
    try { rows = await runQueue(pool, chosen, (tab, job) => sweepOne(tab, base, job, opt.rows, opt.width, opt.height)); }
    finally { pool.close(); }
    const elapsed = (Date.now() - t0) / 1000;

    console.log(`\nDOM-size sweep — scenario=stress, stressRows=${opt.rows}, budget ${opt.budget} elements\n`);
    console.log('| surface | nodes | budget | result |');
    console.log('|---|---:|---:|---|');
    for (const r of rows) console.log(`| ${r.surface} | ${r.nodes ?? '— (' + r.why + ')'} | ${opt.budget} | ${r.pass ? 'PASS' : 'FAIL'} |`);
    const failed = rows.filter((r) => !r.pass);
    console.log(failed.length ? `\n${failed.length} FAIL: ${failed.map((r) => r.surface).join(', ')}` : '\nall PASS');
    console.log(`swept ${rows.length} screen(s) in ${elapsed.toFixed(1)}s`);
    if (skipped.length) {
      console.log(`\n${skipped.length} screen(s) skipped (need their own scenario, not swept under stress):`);
      for (const s of skipped) console.log(`  - ${s.name} — ${s.why}`);
    }
    process.exit(failed.length ? 1 : 0);
  } finally { server.close(); }
} catch (e) {
  console.error(`dom-size-sweep: ${e.message}`);
  process.exit(2);
}
