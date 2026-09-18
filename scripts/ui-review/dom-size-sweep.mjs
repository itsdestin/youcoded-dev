#!/usr/bin/env node
// DOM-size sweep — how many elements each list-heavy surface builds at scale.
//
// WHY THIS EXISTS (render-cost plan, docs/archive/investigations/2026-09-18-list-render-cost-sweep.md):
// the Conversations-tab freeze came from drawing every row of a long list at once.
// The node count of an open surface is the behaviour that proves a list is bounded —
// a source-text scanner was tried and missed 6 of 11 offenders (plan §"Revised" #2).
// This opens each surface in the UI Workbench's `stress` scenario with a big sample
// and fails any surface whose element count is over NODE_BUDGET.
//
// A surface that could not be PROVEN open is a FAIL, never skipped — the same stance
// as coverage.md ("a surface not proven open is unreviewed, not fine"). Proof the guard
// can see an unbounded list: before the fixes it was red on Conversations (17,546),
// Files search (11,242), Marketplace (58,706) and model search (24,679); after them all
// seven surfaces sit between ~900 and ~3,300 (investigation doc §1, "after" table).
//
// WHERE IT RUNS: as the last step of scripts/ui-review/run-review.sh, which already
// serves a workbench and runs without a human; over budget fails that run. It is NOT
// in scripts/verify.sh ON PURPOSE: verify.sh has no browser and no workbench, and this
// guard measures what a real renderer draws. Do not move it there — the per-surface
// stress pins (vitest) are verify.sh's half of this guard.
//
// HOW IT OPENS SURFACES: the same way the review sweep does (shot.mjs + plans/*.json):
// a throw-away headless Chrome from cdp-helpers.mjs, the app URL with `child=1`, and
// the plans' own click paths (plans/main.json, marketplace.json, model-brand.json,
// conversation-previews.json). `child=1` loads the app page itself rather than the
// workbench frame, so `document` IS the app document. The count expression still
// looks inside an <iframe> first, in case this is ever pointed at the framed URL —
// the frame page on its own counts a few dozen nodes (ui-probe.mjs header, the
// 2026-09-10 trap), which would pass everything.
//
// Usage (a workbench must be serving this worktree — bash scripts/run-workbench.sh):
//   node scripts/ui-review/dom-size-sweep.mjs [--port 5233] [--rows 2000] [--only a,b] [--dump]
//   CDP_PORT=9979 overrides the throw-away Chrome's debugging port.
// Exit: 0 all PASS · 1 any FAIL (over budget or not proven open) · 2 setup error.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr } from './cdp-helpers.mjs';

const NODE_BUDGET = 8000; // WHY: the Resume browser at 1,642 rows is 1,585 nodes bounded and 37,920 unbounded (f8ca631b) — 8,000 sits far above any bounded screen plus app chrome and far below any unbounded one

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const PORT = Number(flag('port', process.env.WB_PORT ?? 5233));
const ROWS = Number(flag('rows', 2000));
const ONLY = flag('only', null)?.split(',');
const DUMP = argv.includes('--dump');
// WHY derive the Chrome port from the workbench port: two sessions sweeping at once
// on the default port attach to each other's Chrome (docs/local-dev.md, 2026-08-25).
const CDP_PORT = Number(process.env.CDP_PORT ?? 10000 + (PORT - 5173));
const W = 1440, H = 900;
const BASE = `http://127.0.0.1:${PORT}/?mode=workbench&child=1&latency=0&scenario=stress&stressRows=${ROWS}`;

// Elements inside the app document (see header for why the iframe branch exists).
const COUNT_EXPR = `(() => { const f = document.querySelector('iframe'); const d = f && f.contentDocument ? f.contentDocument : document; return d.querySelectorAll('*').length; })()`;
const vis = (e) => `(${e})&&(${e}).offsetParent!==null`;
const btnText = (re) => `js:[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&${re}.test(b.textContent))`;
// Stress rows are named "session N" or "refactor the transcript watcher … (N)" (scenarios.ts stressPast).
const STRESS_ROW = '/^\\s*(session \\d+|refactor the transcript watcher)/';
// Stress files are named "stress-file-e-N.md" (mock-shim.ts stressFiles, fix round 1) —
// review finding: the Files surface's old expect only checked the search box's VALUE,
// which proves nothing about what's on screen. This proves flat-result cards/rows
// actually rendered, the same way every other surface's expect proves its list is open.
// Not anchored to the start: the card's ArtifactThumbnail (a "MD" placeholder badge)
// renders BEFORE the filename in DOM order, so a card's own textContent is "MD" +
// filename + folder, not the filename first (found via debug probe, fix round 1).
const STRESS_FILE = '/stress-file-e-\\d+\\.md/';

const openProjects = [{ click: '[title=Projects]', settle: 900 }];
const openConversations = [...openProjects, { click: '[aria-label=Conversations]', settle: 600 }];
const openMarketplace = [{ click: "[title='Browse skills']", settle: 800 }, { click: "[title='Open marketplace']", settle: 600 }];

// Each surface: the plan-style actions that open it, and `expect` — JS that is only
// true once the surface AND its big list are on screen. The count is read after
// `expect` holds and the node count has stopped changing.
const SURFACES = [
  {
    name: 'Resume browser',
    actions: [{ click: "[placeholder^='Message']", settle: 200 }, { type: '/resume' }, { key: 'Enter', settle: 600 }],
    expect: `js:!!document.querySelector("[placeholder^='Search sessions']") && !!${btnText(STRESS_ROW).slice(3)}`,
  },
  {
    name: 'Projects → Conversations',
    actions: openConversations,
    expect: `js:!!document.querySelector("[aria-label=Conversations]") && [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&${STRESS_ROW}.test(b.textContent)).length >= 10`,
  },
  {
    name: 'Projects → Files, search "e"',
    actions: [...openProjects, { click: "input[placeholder^='Search files']", settle: 200 }, { type: 'e', settle: 800 }],
    // Proves the flat search RESULTS are on screen, not just that the box holds
    // 'e' (review finding, fix round 1) — at least 20 rendered result cards/rows
    // whose filename matches the stress fixture naming (mock-shim.ts stressFiles).
    expect: `js:(document.querySelector("input[placeholder^='Search files']")||{}).value==='e' && [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&${STRESS_FILE}.test(b.textContent)).length >= 20`,
  },
  {
    name: 'Marketplace',
    actions: openMarketplace,
    expect: `js:${vis(textExpr('Explore everything'))} && /Commit message \\d+/.test(document.body.textContent)`,
  },
  {
    name: 'Model picker, search "a"',
    // The model chip only shows on a native session — model-brand.json's model-list
    // shot picks the "claude via openrouter" session first for the same reason.
    actions: [
      { click: "js:[...document.querySelectorAll('button')].find(b=>b.textContent.includes('claude via openrouter'))", settle: 1000 },
      { click: "[title$='click to change model'], [title^='Click to change model']", settle: 800 },
      { click: "input[placeholder^='Search all models']", settle: 200 },
      { type: 'a', settle: 800 },
    ],
    expect: `js:(document.querySelector("input[placeholder^='Search all models']")||{}).value==='a' && document.querySelectorAll('[data-model-picker-portal] [aria-pressed], [role=dialog] [aria-pressed]').length >= 20`,
  },
  {
    // Opened from the Resume browser (conversation-previews.json's
    // resume-preview-selected path), NOT from Projects → Conversations: there the
    // unbounded list behind the preview is counted too, and the number would say
    // nothing about the preview itself.
    name: 'Conversation preview (from Resume)',
    actions: [
      { click: "[placeholder^='Message']", settle: 200 }, { type: '/resume' }, { key: 'Enter', settle: 1500 },
      { click: "js:[...document.querySelectorAll('button[aria-expanded][aria-label]')].filter(b=>!b.hasAttribute('aria-haspopup'))[0]", settle: 1600 },
    ],
    expect: "js:[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Resume Session')",
  },
  {
    name: 'Side drawer (Session Files)',
    actions: [{ click: "[title='Session Files']", settle: 900 }],
    expect: "[title='Close drawer'], [data-hint='Close drawer']",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYCODES = { Enter: 13, Escape: 27 };

async function openTab() {
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
  const close = async () => { try { ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`); } catch { /* gone */ } };
  return { send, evaluate, close };
}

// The action vocabulary is a subset of shot.mjs's (click / type / key / wait / eval),
// so a click path can be copied between a plan and this file unchanged.
async function run(tab, actions) {
  const fails = [];
  for (const a of actions) {
    try {
      if (a.wait) { await sleep(a.wait); continue; }
      if (a.eval) await tab.evaluate(a.eval);
      else if (a.click) {
        const r = await tab.evaluate(rectOfExpr(selExpr(a.click)));
        if (!r) { fails.push(`MISSING ${a.click}`); break; }
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await tab.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
      } else if (a.type) await tab.send('Input.insertText', { text: a.type });
      else if (a.key) {
        const p = { key: a.key, code: a.key, windowsVirtualKeyCode: KEYCODES[a.key] ?? 0, ...(a.key === 'Enter' ? { text: '\r' } : {}) };
        await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
      }
      await sleep(a.settle ?? 400);
    } catch (e) { fails.push(`ERR ${JSON.stringify(a).slice(0, 80)}: ${e.message}`); break; }
  }
  return fails;
}

// Poll until `expect` holds, then until the node count is unchanged for 1.5 s —
// a list still mounting would otherwise be read half-built and look cheap.
async function settleAndCount(tab, expect, timeoutMs = 45000) {
  const t0 = Date.now();
  const expr = selExpr(expect);
  while (!(await tab.evaluate(`!!(${expr})`).catch(() => false))) {
    if (Date.now() - t0 > timeoutMs) return { proven: false };
    await sleep(300);
  }
  let last = -1, stableSince = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const n = await tab.evaluate(COUNT_EXPR);
    if (n !== last) { last = n; stableSince = Date.now(); } else if (Date.now() - stableSince >= 1500) break;
    await sleep(250);
  }
  return { proven: true, nodes: last };
}

// ---- main ----------------------------------------------------------------------
try {
  const r = await fetch(`http://127.0.0.1:${PORT}/`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.error(`dom-size-sweep: no workbench on 127.0.0.1:${PORT} (${e.message}). Start one: bash scripts/run-workbench.sh <worktree>`);
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), 'dom-size-sweep-'));
const chrome = spawn('google-chrome-stable', CHROME_FLAGS(W, H, CDP_PORT, profile), { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } });
await waitForCdp(CDP_PORT);

const rows = [];
for (const s of SURFACES.filter((x) => !ONLY || ONLY.some((o) => x.name.toLowerCase().includes(o.toLowerCase())))) {
  const tab = await openTab();
  let row;
  try {
    await tab.send('Page.navigate', { url: BASE });
    // Boot: the composer is on screen once the app has mounted in the stress scenario.
    const booted = await settleAndCount(tab, "[placeholder^='Message']", 30000);
    if (!booted.proven) throw new Error('app never booted (no composer)');
    const fails = await run(tab, s.actions);
    const res = fails.length ? { proven: false } : await settleAndCount(tab, s.expect);
    row = { surface: s.name, nodes: res.proven ? res.nodes : null, why: fails.join('; ') || (res.proven ? '' : 'not proven open') };
    if (DUMP) console.error(`[${s.name}] ` + await tab.evaluate(`[...document.querySelectorAll('button,input,[role=dialog]')].filter(e=>e.offsetParent!==null).slice(0,60).map(e=>e.tagName+'|'+(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')+'|'+e.textContent.trim().slice(0,30)).join('\\n')`));
  } catch (e) {
    row = { surface: s.name, nodes: null, why: e.message };
  } finally { await tab.close(); }
  row.pass = row.nodes !== null && row.nodes <= NODE_BUDGET;
  rows.push(row);
  console.error(`  ${row.pass ? 'PASS' : 'FAIL'}  ${row.surface}  ${row.nodes ?? '—'}${row.why ? '  (' + row.why + ')' : ''}`);
}

console.log(`\nDOM-size sweep — scenario=stress, stressRows=${ROWS}, budget ${NODE_BUDGET} elements\n`);
console.log('| surface | nodes | budget | result |');
console.log('|---|---:|---:|---|');
for (const r of rows) console.log(`| ${r.surface} | ${r.nodes ?? '— (' + r.why + ')'} | ${NODE_BUDGET} | ${r.pass ? 'PASS' : 'FAIL'} |`);
const failed = rows.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAIL: ${failed.map((r) => r.surface).join(', ')}` : '\nall PASS');
process.exit(failed.length ? 1 : 0);
