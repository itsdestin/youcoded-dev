// scripts/perf-lab/scenario-projects.mjs — the Projects view journey: open it
// over a project with ~1,600 files, type into the file search, flip to the flat
// type-filtered grid, scroll it, switch list view, switch projects, open the
// Conversations tab, close and reopen — with BOTH probes running over every step.
//
// WHY THIS SCENARIO EXISTS
// Destin (2026-09-09): "our app currently CHUGS sometimes when opening projects
// view". Nothing in the rig had ever opened Project View — the coverage table in
// README.md listed it as not covered — so the complaint was unmeasured and a
// regression in it uncatchable. The main-process half WAS measured outside the
// app that day (workspace docs/active/investigations/
// 2026-09-09-projects-view-and-file-pane-chug.md: ~0.65 s per open, worst
// freeze 85 ms), which left the renderer half as the open question. This
// scenario answers it.
//
// FOUR CODE-LEVEL SUSPECTS this journey separates (each re-read on master while
// writing this file):
//  1. No virtualization: FilesTab.tsx maps EVERY entry of the current folder
//     level (:759-760) and, in flat mode (any search text or type filter), EVERY
//     matching file in the project (:693). `filter.cardsFile` says how many cards
//     the flat grid mounted; `filter.codeMs` and `search.firstKeyMs` are what it
//     cost to mount them.
//  2. Per-card content previews: ArtifactThumbnail.tsx fetches each visible
//     card's content over IPC (artifacts:get / read-binary), renders Markdown
//     live and mounts an <iframe srcDoc> per HTML card, gated by an
//     IntersectionObserver with a 100 px margin. `scrollFlat` scrolls the flat
//     grid to the bottom so every card crosses the viewport; its long tasks and
//     `thumbs` (img/iframe counts) are that cost.
//  3. Per-keystroke re-filter/re-sort of the whole list (FilesTab.tsx:298-307,
//     :410-420) with no memo hit and no transition. `search.keystroke` is
//     keydown -> painted per key, `search.firstKeyMs` the flat flip.
//  4. Duplicate backend fan-out per open and per switch (ProjectView.tsx:303,
//     317, 368-410; FilesTab.tsx:262; the global session scan runs twice). Any
//     step whose `stall.verdict` is 'main' is a MAIN-PROCESS block; the IPC
//     probe's per-step totals are the backend's share of the wait.
//
// WHAT THIS SCENARIO IS BLIND TO — say it, do not let a number stand in for it:
//  - GPU cost. Every file card is `.layer-surface`, which wallpaper themes give
//    a `backdrop-filter: blur()` each. Under Xvfb/llvmpipe there is no GPU
//    compositor, so the blur is rasterised in software or skipped; its real
//    cost on Destin's display is NOT what this measures. MEASURES.blindTo says so.
//  - The default theme. The fixture boots the stock theme (no wallpaper), so
//    the per-card blur is not even applied. A wallpaper-theme leg is a
//    follow-up, not a default.
//  - Destin's actual project. The fixture tree is ~1,600 generated files in 40
//    folders (his youcoded-dev is 3,279 with discovery capped at 2,000);
//    sizes are chosen to sit UNDER the 2,000-file discovery cap so the count is
//    exact rather than truncated.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installProbe, readProbe, readProbeWindow, stopProbe, median, p95 } from './scenario-workload.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
// Pure helpers shared with the artifacts scenario: the same PRNG so the tree is
// byte-identical between a baseline and a candidate, the same content
// generators so card previews render real Markdown/HTML/code, the same stall
// attributor and key-event builder. Importing keeps one copy of each.
import { rng32, buildCodeArtifact, buildMarkdownArtifact, buildHtmlArtifact, attributeStall, keyEventsFor } from './scenario-artifacts.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

// ---------------------------------------------------------------------------
// Fixture: a deterministic project tree (unit-tested in tests/scenario-projects.test.mjs)
// ---------------------------------------------------------------------------

const WORDS = ['handler', 'session', 'artifact', 'buffer', 'token', 'render', 'commit',
  'watcher', 'payload', 'cursor', 'stream', 'index', 'record', 'viewer', 'draft'];
const AREAS = ['main', 'renderer', 'shared', 'docs', 'assets', 'tests', 'scripts', 'design'];

// A 1x1 transparent PNG. Real bytes, so the image thumbnail path (read-binary ->
// base64 -> per-byte atob -> Blob) runs end to end; content size is not the
// point of an image card, the per-card IPC + decode is.
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The file list for the big project, as data: every entry is
 * { rel, kind } with kind in ts | md | html | png | json. Deterministic for a
 * seed, so a baseline and a candidate walk an identical tree. The mix is
 * documented rather than tuned: 45 % code, 25 % markdown, 12 % html, 10 %
 * images, 8 % json — enough of each preview kind for its cost to show.
 *
 * `dirs` folders are laid out as <area>/<sub>, depth 2 under the root, so the
 * discovery walk (depth cap 6) and the folder view's nesting both engage.
 * `topLevel` files sit directly in the root so the FIRST folder-view screen
 * has file cards (and therefore previews) as well as folder cards.
 */
export function buildProjectTree({ files = 1600, dirs = 40, topLevel = 24, seed = 7 } = {}) {
  const r = rng32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const kindFor = (x) => (x < 0.45 ? 'ts' : x < 0.70 ? 'md' : x < 0.82 ? 'html' : x < 0.92 ? 'png' : 'json');
  const folders = [];
  const perArea = Math.max(1, Math.ceil(dirs / AREAS.length));
  for (const area of AREAS) {
    for (let s = 0; s < perArea && folders.length < dirs; s++) folders.push(`${area}/${pick(WORDS)}-${s}`);
  }
  const out = [];
  for (let i = 0; i < files; i++) {
    const kind = kindFor(r());
    const dir = i < topLevel ? '' : folders[i % folders.length];
    const name = `${pick(WORDS)}-${i}.${kind}`;
    out.push({ rel: dir ? `${dir}/${name}` : name, kind });
  }
  return { entries: out, folders };
}

/**
 * Writes the big project to disk under the fixture HOME and lists both fixture
 * projects in ~/.claude/youcoded-folders.json so Project View shows them
 * (the saved-folders file is a bare JSON array — saved-folders.ts:5,23).
 *
 * Called by run.mjs ONLY for the projects phase, after buildFixture: the
 * folders file changes what the welcome screen's folder picker lists, and the
 * startup phase's numbers must not move because a different phase gained a
 * fixture. Returns what the scenario needs to find its way around.
 */
export function seedProjectsFixture(fixture, { files = 1600, dirs = 40, topLevel = 24, seed = 7, name = 'gamma' } = {}) {
  const root = join(fixture.home, 'projects', name);
  const tree = buildProjectTree({ files, dirs, topLevel, seed });
  mkdirSync(root, { recursive: true });
  for (const f of tree.folders) mkdirSync(join(root, f), { recursive: true });
  let bytes = 0;
  let i = 0;
  for (const e of tree.entries) {
    const abs = join(root, e.rel);
    let body;
    switch (e.kind) {
      // Sizes are small on purpose (1–3 KB): this scenario measures cards and
      // lists, not big-document parsing — scenario-artifacts covers that. Per-file
      // seeds keep every file distinct so nothing dedupes or caches by content.
      case 'ts': body = buildCodeArtifact({ approxBytes: 1200 + (i % 7) * 300, seed: 100 + i }); break;
      case 'md': body = buildMarkdownArtifact({ approxBytes: 900 + (i % 5) * 300, seed: 200 + i }).text; break;
      case 'html': body = buildHtmlArtifact({ approxBytes: 1500, sections: 3, seed: 300 + i }).text; break;
      case 'png': body = PNG_1X1; break;
      default: body = JSON.stringify({ id: i, name: e.rel, tags: [WORDS[i % WORDS.length]], ok: true }, null, 2);
    }
    writeFileSync(abs, body);
    bytes += statSync(abs).size;
    i++;
  }
  const now = Date.now();
  const folders = [
    { path: root, nickname: name, addedAt: now },
    { path: fixture.projects.alpha, nickname: 'alpha', addedAt: now - 86400000 },
  ];
  mkdirSync(join(fixture.home, '.claude'), { recursive: true });
  writeFileSync(join(fixture.home, '.claude', 'youcoded-folders.json'), JSON.stringify(folders, null, 2));
  return { root, name, files: tree.entries.length, folders: tree.folders.length, bytes, small: { root: fixture.projects.alpha, name: 'alpha' } };
}

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

const mark = (cdp, label) =>
  cdp.evaluate(`(() => { if (window.__perfProbe) window.__perfProbe.mark(${JSON.stringify(label)}); return true; })()`);

/**
 * Installs `window.__perfProj`. Every selector below was read off master and is
 * cited; a helper that cannot find its target returns a REASON, never a bare
 * false, so a wrong selector reads as a failure and not as a fast zero.
 *
 *  - The header's Projects button is `aria-label="Open Projects"` (HeaderBar.tsx:245,
 *    wide layouts; the rig's 1600x1000 Xvfb is wide). Exit is `aria-label="Exit
 *    projects"` (ProjectView.tsx:716).
 *  - The Files tab is mounted when its grid/list radiogroup exists
 *    (`[role="radiogroup"][aria-label="File view"]`, FilesTab.tsx:593); while its
 *    data is in flight it shows a <p> starting "Loading files" (:624, noun :224).
 *  - A FILE card is `button.layer-surface.h-44` (FilesTab.tsx:445); a FOLDER card
 *    is `button.h-44` WITHOUT layer-surface (:775). Nothing else in Project View
 *    uses h-44.
 *  - Segment tabs carry `aria-label` = their label ("Files", "Conversations",
 *    ProjectView.tsx:824) and their count in the last <span> (:832).
 *  - Search input: `input[aria-label="Search files"]` (ProjectView.tsx:858 via
 *    SearchFilterPill.tsx:96); the filter button is the <button> beside it in the
 *    same pill (SearchFilterPill.tsx:110). The popover is
 *    `[role="dialog"][aria-label="File filters"]` (FileFilterPopover.tsx:108) and
 *    its type chips are buttons labelled by TYPE_OPTIONS (:21-25).
 *  - Switch project: `button[title="Switch project"]` in the hero
 *    (ProjectHero.tsx:337) opens `[role="dialog"][aria-label="Switch project"]`
 *    (ProjectSwitcher.tsx:114); rows are <button>s whose text holds the nickname.
 *  - The hero name is the text of that same "Switch project" button
 *    (ProjectHero.tsx:340); `aria-label="Project nickname"` is the rename field.
 */
export async function installProjectHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const $ = (sel, root) => (root || document).querySelector(sel);
    const all = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const txt = (el) => (el && el.textContent ? el.textContent.trim() : '');
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const pv = () => { const x = $('button[aria-label="Exit projects"]'); return x ? (x.closest('header') && x.closest('header').parentElement) || x.parentElement : null; };
    const filesMounted = () => !!$('[role="radiogroup"][aria-label="File view"]');
    const loading = () => { const p = pv(); return !!p && all('p', p).some((el) => txt(el).indexOf('Loading files') === 0); };
    const fileCards = () => all('button.layer-surface.h-44').length;
    const folderCards = () => all('button.h-44').filter((b) => !b.classList.contains('layer-surface')).length;
    const segCount = (label) => { const b = $('button[aria-label=' + JSON.stringify(label) + ']'); if (!b) return null; const spans = all('span', b); return spans.length ? txt(spans[spans.length - 1]) : null; };
    const nodes = () => { const p = pv(); return p ? p.querySelectorAll('*').length : 0; };
    const thumbs = () => { const p = pv(); return p ? { img: all('img', p).length, iframe: all('iframe', p).length } : { img: 0, iframe: 0 }; };
    // The hero's name IS the switcher trigger (ProjectHero.tsx:333-345): a
    // button titled "Switch project" whose first span holds the shown name.
    // (aria-label "Project nickname" is the RENAME field, mounted only while
    // renaming; matching on it would read null the whole scenario.)
    const heroName = () => { const b = $('button[title="Switch project"]'); if (!b) return null; const s = $('span', b); return s ? txt(s) : txt(b); };
    // The element that scrolls the files grid: walk up from the first card to
    // the first ancestor with a scrolling overflow.
    const scroller = () => {
      let el = $('button.h-44');
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
        el = el.parentElement;
      }
      return null;
    };
    const until = async (pred, timeoutMs) => {
      const t0 = performance.now();
      while (performance.now() - t0 < (timeoutMs || 30000)) {
        if (pred()) return true;
        await raf2();
      }
      return false;
    };
    /** Click, then time until \`done()\` holds and two more frames painted. */
    const timed = async (act, done, timeoutMs) => {
      const t0 = performance.now();
      const r = act();
      if (r && r.ok === false) return r;
      const ok = await until(done, timeoutMs);
      await raf2();
      return { ok, ms: Math.round((performance.now() - t0) * 10) / 10, reason: ok ? null : 'timed out waiting for the surface to settle' };
    };
    const clickAria = (label) => { const b = $('button[aria-label=' + JSON.stringify(label) + ']'); if (!b) return { ok: false, reason: 'no button[aria-label=' + JSON.stringify(label) + '] in the DOM' }; b.click(); return { ok: true }; };
    const clickTitle = (title) => { const b = $('button[title=' + JSON.stringify(title) + ']'); if (!b) return { ok: false, reason: 'no button[title=' + JSON.stringify(title) + '] in the DOM' }; b.click(); return { ok: true }; };
    const clickTextIn = (scopeSel, text) => {
      const root = $(scopeSel);
      if (!root) return { ok: false, reason: 'scope ' + scopeSel + ' is not in the DOM' };
      // Exact label first; else the first button whose text CONTAINS it — a
      // switcher row reads "g" (avatar) + "gamma" + its path (ProjectSwitcher.tsx:184-197),
      // so neither equality nor a prefix match would ever find it.
      const btns = all('button', root);
      const hit = btns.find((b) => txt(b) === text) || btns.find((b) => txt(b).indexOf(text) !== -1);
      if (!hit) return { ok: false, reason: 'no button reading ' + JSON.stringify(text) + ' under ' + scopeSel + '; present: ' + JSON.stringify(all('button', root).map(txt).filter(Boolean).slice(0, 25)) };
      hit.click();
      return { ok: true };
    };
    const state = () => ({ open: !!pv(), filesMounted: filesMounted(), loading: loading(), fileCards: fileCards(), folderCards: folderCards(), files: segCount('Files'), conversations: segCount('Conversations'), nodes: nodes(), thumbs: thumbs(), hero: heroName() });

    const helpers = {
      raf2, until, timed, state, pv, filesMounted, loading, fileCards, folderCards, segCount, nodes, thumbs, heroName, scroller,
      clickAria, clickTitle, clickTextIn,

      /** Open Projects and time to the first painted grid, then to the counts. */
      open: async () => {
        if (pv()) return { ok: false, reason: 'Project View is already open' };
        const t0 = performance.now();
        const c = clickAria('Open Projects');
        if (!c.ok) return c;
        const painted = await until(() => filesMounted() && !loading() && (fileCards() + folderCards()) > 0, 60000);
        await raf2();
        const openMs = Math.round((performance.now() - t0) * 10) / 10;
        const counted = await until(() => { const f = segCount('Files'); return f !== null && f !== '—' && f !== '' ; }, 60000);
        const countsMs = Math.round((performance.now() - t0) * 10) / 10;
        return { ok: painted, openMs: painted ? openMs : null, countsMs: counted ? countsMs : null, reason: painted ? null : 'the Files tab never showed a card', ...state() };
      },

      close: async () => {
        if (!pv()) return { ok: true, ms: 0 };
        return timed(() => clickAria('Exit projects'), () => !pv(), 20000);
      },

      /** Focus the search box. Returns the reason if it is absent. */
      focusSearch: () => { const el = $('input[aria-label="Search files"]'); if (!el) return { ok: false, reason: 'no input[aria-label="Search files"]' }; el.focus(); return { ok: true }; },
      /** Programmatic clear the way React expects (native setter + input event). */
      clearSearch: async () => {
        const el = $('input[aria-label="Search files"]');
        if (!el) return { ok: false, reason: 'no input[aria-label="Search files"]' };
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        return timed(() => { set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); return { ok: true }; }, () => folderCards() > 0 || fileCards() > 0, 20000);
      },
      searchValue: () => { const el = $('input[aria-label="Search files"]'); return el ? el.value : null; },

      /** Open the filter popover and click one type chip; time to the flat grid. */
      filterType: async (label) => {
        const input = $('input[aria-label="Search files"]');
        if (!input) return { ok: false, reason: 'no search pill to find the filter button beside' };
        // The sliders button is the only <button> inside the pill (SearchFilterPill.tsx:104-116).
        const pill = input.parentElement;
        const btn = pill ? $('button', pill) || (pill.parentElement && $('button', pill.parentElement)) : null;
        if (!btn) return { ok: false, reason: 'no filter button beside the search input' };
        btn.click();
        const popped = await until(() => !!$('[role="dialog"][aria-label="File filters"]'), 5000);
        if (!popped) return { ok: false, reason: 'the File filters popover never opened' };
        const before = fileCards();
        return timed(() => clickTextIn('[role="dialog"][aria-label="File filters"]', label), () => fileCards() !== before && !loading(), 60000);
      },
      clearFilters: async () => {
        const dlg = $('[role="dialog"][aria-label="File filters"]');
        if (!dlg) return { ok: false, reason: 'the File filters popover is not open' };
        const before = fileCards();
        return timed(() => clickTextIn('[role="dialog"][aria-label="File filters"]', 'Clear'), () => fileCards() !== before, 60000);
      },
      popoverOpen: () => !!$('[role="dialog"][aria-label="File filters"]'),

      /** Scroll the grid to the bottom a screen at a time; frames are the probe's job. */
      scrollToBottom: async (maxSteps) => {
        const el = scroller();
        if (!el) return { ok: false, reason: 'no scrolling ancestor above the first card (grid fits the viewport?)', steps: 0 };
        let steps = 0;
        const t0 = performance.now();
        while (steps < (maxSteps || 40) && el.scrollTop + el.clientHeight < el.scrollHeight - 2) {
          el.scrollTop = el.scrollTop + el.clientHeight;
          steps++;
          await raf2();
          await new Promise((r) => setTimeout(r, 120));
        }
        await raf2();
        return { ok: true, steps, ms: Math.round(performance.now() - t0), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, ...state() };
      },
      scrollToTop: async () => { const el = scroller(); if (el) { el.scrollTop = 0; await raf2(); } return { ok: !!el }; },

      setView: async (label) => {
        const before = nodes();
        return timed(() => clickAria(label), () => nodes() !== before, 30000);
      },

      /** Switch to the project whose row text holds \`name\`. */
      switchTo: async (name) => {
        const t = clickTitle('Switch project');
        if (!t.ok) return t;
        const popped = await until(() => !!$('[role="dialog"][aria-label="Switch project"]'), 5000);
        if (!popped) return { ok: false, reason: 'the Switch project palette never opened' };
        const r = await timed(
          () => clickTextIn('[role="dialog"][aria-label="Switch project"]', name),
          () => heroName() === name && filesMounted() && !loading() && !$('[role="dialog"][aria-label="Switch project"]'),
          60000,
        );
        return { ...r, ...state() };
      },

      tab: async (label) => {
        const before = nodes();
        return timed(() => clickAria(label), () => nodes() !== before, 30000);
      },
      conversationRows: () => { const p = pv(); return p ? all('button[title], li', p).length : 0; },

      // Keystroke meter: keydown -> painted, entirely in-page (see the artifacts
      // scenario's meter for why in-page). beforeinput fires for trusted key input
      // on <input> exactly as it does on contenteditable.
      keys: (() => {
        let el = null, handler = null, samples = [], pendingAt = null, dropped = 0;
        return {
          arm(sel) {
            this.disarm();
            el = $(sel);
            if (!el) return { ok: false, reason: 'no element matches ' + sel };
            samples = []; pendingAt = null; dropped = 0;
            handler = () => {
              if (pendingAt !== null) { dropped++; return; }
              pendingAt = performance.now();
              requestAnimationFrame(() => requestAnimationFrame(() => {
                samples.push(Math.round((performance.now() - pendingAt) * 10) / 10);
                pendingAt = null;
              }));
            };
            el.addEventListener('beforeinput', handler, true);
            return { ok: true };
          },
          read() { return { samples: samples.slice(), dropped }; },
          disarm() { if (el && handler) { try { el.removeEventListener('beforeinput', handler, true); } catch (e) { /* gone */ } } el = null; handler = null; },
        };
      })(),
    };
    try { if (window.__perfProj && window.__perfProj.keys) window.__perfProj.keys.disarm(); } catch (e) { /* first install */ }
    window.__perfProj = helpers;
    return true;
  })()`);
}

const call = (cdp, expr) => cdp.evaluate(`(async () => { const h = window.__perfProj; if (!h) throw new Error('window.__perfProj is not installed'); return await (${expr}); })()`);

// ---------------------------------------------------------------------------
// Step wrapper — both probes, per step (same contract as scenario-artifacts)
// ---------------------------------------------------------------------------

async function step(cdp, label, fn, { pingMs = 50 } = {}) {
  await mark(cdp, `${label}:start`);
  await installIpcStallProbe(cdp, { everyMs: pingMs });
  let result, thrown = null;
  try {
    result = await fn();
  } catch (err) {
    thrown = err;
    result = { ok: false, reason: err.message };
  }
  await mark(cdp, `${label}:end`);
  let ipc = null;
  try { ipc = await readIpcStallProbe(cdp); } catch (err) { ipc = { error: err.message }; }
  try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
  let probe = null;
  try { probe = await readProbeWindow(cdp, `${label}:start`, `${label}:end`); } catch (err) { probe = { error: err.message }; }
  const out = { ...result, probe, ipc, stall: attributeStall(ipc, probe) };
  if (thrown) out.threw = thrown.message;
  return out;
}

// ---------------------------------------------------------------------------
// Report contract
// ---------------------------------------------------------------------------

export const NUMERIC_PATHS = [
  // Suspects 1 + 4: what opening costs, to first cards and to counts.
  'open.openMs', 'open.countsMs', 'open.fileCards', 'open.folderCards', 'open.nodes',
  // Suspect 3: per-keystroke cost in the file search; first key flips to flat mode.
  'search.firstKeyMs', 'search.keystroke.medianMs', 'search.keystroke.p95Ms', 'search.fileCards',
  // Suspect 1: the flat grid — every matching file as a card.
  'filter.codeMs', 'filter.fileCards', 'filter.nodes',
  // Suspect 2: previews as every card crosses the viewport.
  'scrollFlat.steps', 'scrollFlat.longtaskTotalMs', 'scrollFlat.longtaskMaxMs', 'scrollFlat.frameGapMaxMs', 'scrollFlat.img', 'scrollFlat.iframe',
  'listView.ms',
  // Suspect 4: the per-switch fan-out, big -> small and back.
  'switch.smallMs', 'switch.bigMs',
  'conversations.ms',
  'reopen.openMs',
  // Renderer + main-process cost across the whole run.
  'probe.longtaskTotalMs', 'probe.longtaskMaxMs',
  'ipcSumOfSteps.totalStallMs', 'ipcSumOfSteps.maxMs', 'ipcSumOfSteps.over250ms',
];

const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** Median of each NUMERIC_PATH across runs, nested like a run (see scenario-artifacts.mjs). */
export function medianRun(runs) {
  const out = {};
  for (const path of NUMERIC_PATHS) {
    const vals = runs.map((r) => at(r, path)).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const keys = path.split('.');
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {});
    node[keys.at(-1)] = vals.length ? median(vals) : null;
  }
  return out;
}

export const MEASURES = {
  scenario: 'projects',
  question: 'What does the Projects view cost to open, search, filter, scroll and switch over a ~1,600-file project?',
  configuration: [
    'two saved projects: gamma (~1,600 generated files in 40 folders: 45% code, 25% markdown, 12% html, 10% png, 8% json) and alpha (the transcript fixture, 2 files)',
    'stock theme, no wallpaper — the per-card backdrop blur is NOT applied here',
    'seven letters typed into the file search at ~45 ms spacing; the type filter "Code & configs" flattens the grid',
  ],
  clocks: {
    'open.openMs': 'click the header Projects button -> the first file/folder cards painted',
    'open.countsMs': 'the same click -> the Files segment shows a count (the withCounts pass landed)',
    'search.keystroke': 'keydown -> painted, measured in-page via beforeinput; firstKeyMs is the flat-mode flip',
    'filter.codeMs': 'click the type chip -> the flat grid painted',
    'switch.*': 'click the palette row -> the other project\'s hero name and a settled Files tab',
  },
  blindTo: [
    'GPU cost: every file card is .layer-surface, which wallpaper themes give a backdrop-filter blur; under Xvfb/llvmpipe that is software-rasterised or skipped, so its real cost on a display is not measured',
    'the stock theme has no wallpaper, so the per-card blur is not applied at all in this configuration',
    'a project over the 2,000-file discovery cap (Destin\'s youcoded-dev is 3,279): the fixture sits under it so counts are exact',
    'a conversation-heavy project (746 rows): alpha has the three fixture transcripts',
  ],
};

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/**
 * @param {object} app      launch.mjs App — { cdp, … }
 * @param {object} fixture  fixture.mjs FixtureInfo, after seedProjectsFixture()
 * @param {object} seeded   what seedProjectsFixture returned
 * @param {object} [opts]
 * @param {string} [opts.typed='handler']  letters typed into the search box (a-z only)
 * @param {number} [opts.keyDelayMs=45]
 * @param {number} [opts.scrollSteps=40]
 */
export async function runProjectsScenario(app, fixture, seeded, { typed = 'handler', keyDelayMs = 45, scrollSteps = 40 } = {}) {
  const cdp = app.cdp;
  const warnings = [];
  const big = seeded.name;
  const small = seeded.small.name;

  try {
    await installProbe(cdp);
    await installProjectHelpers(cdp);

    // ── 1. Open ─────────────────────────────────────────────────────────
    const open = await step(cdp, 'projects:open', async () => {
      const r = await call(cdp, 'h.open()');
      if (!r.ok) throw new Error(`projects: open failed: ${r.reason}`);
      return r;
    });
    // Whichever project the view opened on, measure the rest over the big one.
    let onBig = open.hero === big;
    let switchToBig = null;
    if (!onBig) {
      switchToBig = await step(cdp, 'projects:switch-to-big', async () => {
        const r = await call(cdp, `h.switchTo(${JSON.stringify(big)})`);
        if (!r.ok) throw new Error(`projects: could not switch to ${big}: ${r.reason}`);
        return r;
      });
      onBig = switchToBig.ok;
    }
    if (!onBig) warnings.push(`the view never landed on ${big}; every later number is for ${open.hero ?? 'an unknown project'}`);

    // ── 2. Search typing ──────────────────────────────────────────────────
    const search = await step(cdp, 'projects:search', async () => {
      const f = await call(cdp, 'h.focusSearch()');
      if (!f.ok) throw new Error(`projects: ${f.reason}`);
      const armed = await call(cdp, 'h.keys.arm(\'input[aria-label="Search files"]\')');
      if (!armed.ok) throw new Error(`projects: ${armed.reason}`);
      // The first key flips the grid to flat mode; time it to paint separately.
      const before = await call(cdp, 'h.fileCards()');
      const t0 = Date.now();
      for (const ev of keyEventsFor(typed[0])) await cdp.send('Input.dispatchKeyEvent', ev);
      const flipped = await call(cdp, `h.until(() => h.fileCards() !== ${before}, 30000).then(async (ok) => { await h.raf2(); return ok; })`);
      const firstKeyMs = flipped ? Date.now() - t0 : null;
      if (!flipped) warnings.push('the first search keystroke never changed the card set — search may not be filtering');
      for (const ch of typed.slice(1)) {
        for (const ev of keyEventsFor(ch)) await cdp.send('Input.dispatchKeyEvent', ev);
        await sleep(keyDelayMs);
      }
      await sleep(300);
      const k = await call(cdp, 'h.keys.read()');
      await call(cdp, 'h.keys.disarm()');
      const st = await call(cdp, 'h.state()');
      const value = await call(cdp, 'h.searchValue()');
      if (value !== typed) warnings.push(`search box holds ${JSON.stringify(value)} after typing ${JSON.stringify(typed)} — some key events were not applied`);
      if (!k.samples.length) warnings.push('the keystroke meter recorded nothing — beforeinput never fired on the search input, so typing cost is UNKNOWN, not zero');
      return {
        ok: true, typed, firstKeyMs,
        keystroke: { samples: k.samples, dropped: k.dropped, medianMs: k.samples.length ? median(k.samples) : null, p95Ms: k.samples.length ? p95(k.samples) : null },
        fileCards: st.fileCards, nodes: st.nodes,
      };
    });
    const cleared = await step(cdp, 'projects:search-clear', () => call(cdp, 'h.clearSearch()'));
    if (!cleared.ok) warnings.push(`clearing the search failed: ${cleared.reason}`);

    // ── 3. Type filter -> flat grid of every code file ───────────────────
    const filter = await step(cdp, 'projects:filter-code', async () => {
      const r = await call(cdp, 'h.filterType("Code & configs")');
      if (!r.ok) throw new Error(`projects: type filter failed: ${r.reason}`);
      const st = await call(cdp, 'h.state()');
      return { ok: true, codeMs: r.ms, fileCards: st.fileCards, nodes: st.nodes, thumbs: st.thumbs };
    });
    // Leave the popover open for the clear below? No — it overlays the grid and
    // its own Esc handler pops it; press Escape so the scroll measures the grid.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(150);
    if (await call(cdp, 'h.popoverOpen()')) warnings.push('the File filters popover stayed open after Escape — the scroll step measured with it overlaid');
    if (!(await call(cdp, 'h.pv()')) ) throw new Error('projects: Escape closed the whole Project View instead of the filter popover');

    // ── 4. Scroll the flat grid to the bottom (previews as cards cross) ──
    const scrollFlat = await step(cdp, 'projects:scroll-flat', async () => {
      const r = await call(cdp, `h.scrollToBottom(${scrollSteps})`);
      if (!r.ok) { warnings.push(`scroll: ${r.reason}`); return r; }
      return { ok: true, steps: r.steps, ms: r.ms, scrollHeight: r.scrollHeight, clientHeight: r.clientHeight, img: r.thumbs.img, iframe: r.thumbs.iframe, nodes: r.nodes };
    });
    // The step's own probe window is the frame-gap/long-task record; lift the
    // two numbers a reader wants onto the step so NUMERIC_PATHS can name them.
    if (scrollFlat.probe && !scrollFlat.probe.error) {
      scrollFlat.longtaskTotalMs = scrollFlat.probe.longtaskTotalMs ?? null;
      scrollFlat.longtaskMaxMs = scrollFlat.probe.longtaskMaxMs ?? null;
      scrollFlat.frameGapMaxMs = scrollFlat.probe.frameGapMaxMs ?? null;
    }
    await call(cdp, 'h.scrollToTop()');

    // ── 5. List view over the same flat set ───────────────────────────────
    const listView = await step(cdp, 'projects:list-view', async () => {
      const r = await call(cdp, 'h.setView("List view")');
      if (!r.ok) throw new Error(`projects: list view: ${r.reason}`);
      const st = await call(cdp, 'h.state()');
      return { ok: true, ms: r.ms, nodes: st.nodes };
    });
    await call(cdp, 'h.setView("Grid view")');

    // Back to the folder view: reopen the popover and Clear.
    const filterClear = await step(cdp, 'projects:filter-clear', async () => {
      const opened = await call(cdp, 'h.filterType("Code & configs")');
      // Clicking the already-active chip toggles it OFF (multi-select set), which
      // is itself a clear; if the set did not change, use the Clear button.
      const st = await call(cdp, 'h.state()');
      let r = opened;
      if (!opened.ok || st.fileCards === filter.fileCards) r = await call(cdp, 'h.clearFilters()');
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await sleep(150);
      return { ...r, ...(await call(cdp, 'h.state()')) };
    });
    if (!filterClear.ok) warnings.push(`clearing the type filter failed: ${filterClear.reason}`);

    // ── 6. Switch to the small project, open Conversations, switch back ──
    const switchSmall = await step(cdp, 'projects:switch-small', async () => {
      const r = await call(cdp, `h.switchTo(${JSON.stringify(small)})`);
      if (!r.ok) throw new Error(`projects: switch to ${small}: ${r.reason}`);
      return r;
    });
    const conversations = await step(cdp, 'projects:conversations', async () => {
      const r = await call(cdp, 'h.tab("Conversations")');
      if (!r.ok) throw new Error(`projects: Conversations tab: ${r.reason}`);
      const rows = await call(cdp, 'h.conversationRows()');
      return { ok: true, ms: r.ms, rows };
    });
    await call(cdp, 'h.tab("Files")');
    const switchBig = await step(cdp, 'projects:switch-big', async () => {
      const r = await call(cdp, `h.switchTo(${JSON.stringify(big)})`);
      if (!r.ok) throw new Error(`projects: switch back to ${big}: ${r.reason}`);
      return r;
    });

    // ── 7. Close and reopen (warm caches) ────────────────────────────────
    const close = await step(cdp, 'projects:close', () => call(cdp, 'h.close()'));
    const reopen = await step(cdp, 'projects:reopen', async () => {
      const r = await call(cdp, 'h.open()');
      if (!r.ok) throw new Error(`projects: reopen failed: ${r.reason}`);
      return r;
    });
    await call(cdp, 'h.close()');

    // ── Totals ───────────────────────────────────────────────────────────
    const probe = await readProbe(cdp);
    const allSteps = [open, switchToBig, search, cleared, filter, scrollFlat, listView, filterClear, switchSmall, conversations, switchBig, close, reopen].filter(Boolean);
    const ipcTotals = allSteps.reduce((acc, s) => {
      const i = s?.ipc;
      if (!i || i.error) return acc;
      acc.pings += i.pings ?? 0;
      acc.totalStallMs += i.totalStallMs ?? 0;
      acc.over250ms += i.over250ms ?? 0;
      acc.over1000ms += i.over1000ms ?? 0;
      acc.maxMs = Math.max(acc.maxMs, i.maxMs ?? 0);
      return acc;
    }, { pings: 0, totalStallMs: 0, over250ms: 0, over1000ms: 0, maxMs: 0 });

    return {
      project: { name: big, files: seeded.files, folders: seeded.folders, bytes: seeded.bytes, openedOn: open.hero ?? null },
      open,
      switchToBig,
      search,
      searchClear: cleared,
      filter,
      scrollFlat,
      listView,
      filterClear,
      switch: { smallMs: switchSmall.ms ?? null, bigMs: switchBig.ms ?? null, small: switchSmall, big: switchBig },
      conversations,
      close,
      reopen,
      probe,
      ipcSumOfSteps: ipcTotals,
      warnings,
    };
  } finally {
    try { await cdp.evaluate(`window.__perfProj && window.__perfProj.keys.disarm()`); } catch { /* page gone */ }
    // Leave the view closed so a later scenario or screenshot starts from the chat.
    try { await cdp.evaluate(`window.__perfProj && window.__perfProj.close()`); } catch { /* page gone */ }
    try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
    try { await stopProbe(cdp); } catch { /* page gone */ }
  }
}
