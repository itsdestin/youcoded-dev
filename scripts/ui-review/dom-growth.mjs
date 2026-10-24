// Controller-only, opt-in diagnostic for ONE source-registered desktop list.
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readBoundedText } from '../perf-lab/lifecycle-evidence.mjs';
import { readCounters } from '../perf-lab/layout-cost.mjs';
import { settleAndCount } from './dom-settle.mjs';

export const GROWTH_SCREEN = 'projects/conversations';
export const GROWTH_DESCRIPTOR = Object.freeze({ revision: 1, lane: 'workbench-dom-growth-diagnostic', screen: GROWTH_SCREEN,
  standardAcceptanceCoverage: false, runtimeValidated: false, declaredMechanism: 'chunked-reveal-retains-rows-not-virtualized',
  effectiveRows: 2000, maxScrollCheckpoints: 60, maxMs: 600000, initialNodeBudget: 8000,
  deadlineScope: 'per-surface preparation and diagnostic operations; existing engine build and registry discovery retain their own timeouts',
  resetScope: 'Conversations tab unmounted by opening registered projects/files, then reopened by name in the same document/project',
  counterScope: 'CDP target renderer-wide, not per-component CPU or layout attribution',
  gaps: ['Only projects/conversations at desktop width is supported; not all app lists.', 'No hidden-window, queue, process RAM, DOM-memory or physical presentation measurement.',
    'Geometry and DOM-count reads are boundary observer work; counter intervals include settling and instrumentation, not isolated scroll CPU cost.',
    'The checkpoint cap (60) is sized for the 2000-row list at 50 rows per reveal (about 40 scrolls); a run that still exhausts it is incomplete, not a successful saturation test.',
    'Source hashes identify selected inspected source files; engine build path is not a content attestation of served assets.', 'No runtime validation or observer-overhead calibration performed.'] });
const COUNTERS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'];
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const sourceEqual = (a, b) => a && b && ['checkout', 'build', 'sha256'].every(k => typeof a[k] === 'string' && a[k] && a[k] === b[k]) && /^[a-f0-9]{64}$/.test(a.sha256);

export function makeGrowthBound({ maxMs = GROWTH_DESCRIPTOR.maxMs, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!Number.isInteger(maxMs) || maxMs < 1 || maxMs > GROWTH_DESCRIPTOR.maxMs) throw Error('invalid growth deadline');
  const end = now() + maxMs;
  return async (operation, label, cap = 20000) => {
    const ms = Math.min(cap, end - now());
    if (ms <= 0) throw Error(`growth deadline at ${label}`);
    let timer;
    // WHY: lazy operations cannot start after the external deadline. A timed-out
    // operation is not canceled; the CLI owns and closes its exact private pool.
    try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimer(() => reject(Error(`growth timeout at ${label}`)), ms); })]); }
    finally { clearTimer(timer); }
  };
}

function target(snapshot, previous) {
  if (!snapshot?.shown || snapshot.screen !== GROWTH_SCREEN || snapshot.markCount !== 1 || snapshot.scrollerCount !== 1 || !snapshot.project || !snapshot.targetKey || !snapshot.epoch
    || snapshot.scenario !== 'stress' || snapshot.effectiveRows !== 2000 || snapshot.rows !== 2000 || snapshot.width < 640
    || !['scrollTop', 'clientHeight', 'scrollHeight', 'renderedRows', 'firstIndex', 'lastIndex'].every(k => finite(snapshot[k]))
    || !Number.isInteger(snapshot.renderedRows) || !Number.isInteger(snapshot.firstIndex) || !Number.isInteger(snapshot.lastIndex) || typeof snapshot.hasMore !== 'boolean'
    || snapshot.firstIndex > snapshot.lastIndex || snapshot.lastIndex >= 2000 || snapshot.clientHeight <= 0 || snapshot.renderedRows <= 0 || snapshot.renderedRows > 2000) throw Error('growth target/mark/scroller/effective workload proof failed');
  if (previous && ['epoch', 'project', 'targetKey'].some(k => snapshot[k] !== previous[k])) throw Error('growth target identity changed');
}
const reached = s => s.scrollTop + s.clientHeight >= s.scrollHeight - 1 && s.hasMore === false && s.lastIndex === 1999;
function delta(before, after) {
  const gaps = [], values = {};
  for (const key of COUNTERS) {
    const a = before?.values?.[key], b = after?.values?.[key];
    if (!finite(a) || !finite(b) || b < a) { values[key] = null; gaps.push(`missing/nonfinite/reset ${key}`); }
    else values[key] = b - a;
  }
  return { status: gaps.length ? 'unmeasured' : 'measured', values, gaps, scope: GROWTH_DESCRIPTOR.counterScope };
}

// WHY 60 (was 10): ten 50-row reveals only ever reached 550 of the 2000 rows, so every run ended 'incomplete' at the cap. 2000 rows need 40
// scrolls; 60 leaves headroom while staying bounded by the same 600 s deadline, the per-step timeouts and the no-progress check below.
export async function runDomGrowth(driver, { maxCheckpoints = GROWTH_DESCRIPTOR.maxScrollCheckpoints, now = () => performance.now(), bound = makeGrowthBound({ now }) } = {}) {
  if (!Number.isInteger(maxCheckpoints) || maxCheckpoints < 1 || maxCheckpoints > GROWTH_DESCRIPTOR.maxScrollCheckpoints) throw Error(`growth checkpoints must be 1..${GROWTH_DESCRIPTOR.maxScrollCheckpoints}`);
  const report = { descriptor: GROWTH_DESCRIPTOR, status: 'incomplete', reason: null, checkpoints: [], initial: null, closed: null, reopened: null, reachedEnd: false };
  let source, initialSnapshot;
  const observe = async phase => {
    const startedAt = now();
    const currentSource = await bound(() => driver.source(), `${phase} source`);
    if (!sourceEqual(source, currentSource)) throw Error('growth source identity missing or changed');
    const settled = await bound(() => driver.settle(), `${phase} settle`);
    if (settled?.status !== 'measured' || !Number.isSafeInteger(settled.nodes) || settled.nodes < 0) throw Error(`growth settle incomplete: ${settled?.reason ?? 'count unavailable'}`);
    const snapshot = await bound(() => driver.inspect(), `${phase} target`);
    target(snapshot, phase === 'reopened' ? null : initialSnapshot);
    if (initialSnapshot && ['epoch', 'project'].some(k => snapshot[k] !== initialSnapshot[k])) throw Error('growth reopened target document/project mismatch');
    const counters = await bound(() => driver.counters(), `${phase} counters`);
    const sourceAfter = await bound(() => driver.source(), `${phase} source recheck`);
    if (!sourceEqual(source, sourceAfter)) throw Error('growth source identity changed during checkpoint');
    const endedAt = now();
    return { phase, nodes: settled.nodes, settle: settled, snapshot, counters, startedAt, endedAt, observerMs: endedAt - startedAt };
  };
  try {
    source = await bound(() => driver.source(), 'initial source');
    report.source = source;
    report.initial = await observe('initial'); initialSnapshot = report.initial.snapshot;
    report.initialBudget = { budget: 8000, nodes: report.initial.nodes, pass: report.initial.nodes <= 8000, scope: 'initial document only' };
    if (!report.initialBudget.pass) throw Error('growth initial 8000-node gate exceeded');
    if (initialSnapshot.scrollTop > 1 || initialSnapshot.firstIndex !== 0) throw Error('growth initial scroll/reset proof failed');
    let previous = report.initial;
    report.reachedEnd = reached(previous.snapshot);
    for (let index = 1; index <= maxCheckpoints && !report.reachedEnd; index++) {
      const actionAt = now();
      const action = await bound(() => driver.scroll(), `scroll ${index}`);
      if (action?.applied !== true) throw Error('growth scroll target not applied');
      const actionReturnedAt = now();
      const row = await observe(`scroll-${index}`);
      row.action = { ...action, controllerMs: actionReturnedAt - actionAt };
      row.delta = delta(previous.counters, row.counters);
      report.checkpoints.push(row);
      if (row.snapshot.scrollTop <= previous.snapshot.scrollTop && row.snapshot.lastIndex <= previous.snapshot.lastIndex) throw Error('growth scroll made no verified progress');
      report.reachedEnd = reached(row.snapshot);
      previous = row;
    }
    const last = report.checkpoints.at(-1) ?? report.initial;
    report.growth = { documentNodes: last.nodes - report.initial.nodes, renderedRows: last.snapshot.renderedRows - initialSnapshot.renderedRows, scope: 'whole-document nodes; selected-list rendered rows' };
    report.observedShape = report.growth.documentNodes > 0 ? 'retained-node-growth' : last.snapshot.firstIndex > initialSnapshot.firstIndex ? 'stable-node-count-with-range-progress' : 'no-node-growth-observed';
    if (!report.reachedEnd) throw Error('growth checkpoint cap exhausted before proven end/saturation');
  } catch (error) { report.reason = error.message; }
  finally {
    // Attempt reset even after cap exhaustion so partial growth retains release
    // evidence. External deadline exhaustion still fails closed; pool teardown is
    // the final cancellation boundary, never an action on a production window.
    try {
      const closed = await bound(() => driver.close(), 'close conversations');
      if (closed?.ok !== true) throw Error('growth close failed');
      report.closed = await bound(() => driver.closedProof(), 'closed target proof');
      if (report.closed?.absent !== true || report.closed?.unmounted !== true || report.closed?.filesShown !== true || report.closed?.settle?.status !== 'measured') throw Error('growth closed target still mounted or Files mark missing');
      const reopened = await bound(() => driver.reopen(), 'reopen conversations');
      if (reopened?.ok !== true) throw Error('growth reopen failed');
      report.reopened = await observe('reopened');
      if (!initialSnapshot || report.reopened.snapshot.scrollTop > 1 || report.reopened.snapshot.firstIndex !== 0
        || report.reopened.snapshot.renderedRows >= 2000 || report.reopened.snapshot.hasMore !== true) throw Error('growth reopen reset not established');
      const grown = report.checkpoints.at(-1)?.snapshot;
      if (grown && grown.renderedRows > initialSnapshot.renderedRows && report.reopened.snapshot.renderedRows >= grown.renderedRows) throw Error('growth reopen retained revealed rows; reset not established');
      // Count equality is NOT restoration proof: compare actual list state and
      // identity. Retain any changed reopened node count as a cost observation.
      report.reset = { proven: true, nodeChangeFromInitial: report.reopened.nodes - report.initial.nodes, renderedRows: report.reopened.snapshot.renderedRows,
        counterDelta: delta(report.checkpoints.at(-1)?.counters ?? report.initial.counters, report.reopened.counters) };
    } catch (error) { report.reason = [report.reason, error.message].filter(Boolean).join('; '); }
  }
  const observations = [report.initial, ...report.checkpoints, report.reopened].filter(Boolean);
  report.counterCoverage = { scope: GROWTH_DESCRIPTOR.counterScope, status: observations.length && observations.every(row => row.counters?.status === 'measured') ? 'available' : 'unavailable-or-partial',
    checkpoints: observations.map(row => ({ phase: row.phase, status: row.counters?.status ?? 'unmeasured' })) };
  report.status = report.reason ? 'incomplete' : 'measured';
  return report;
}

const SOURCE_FILES = ['dev/workbench/screens/projects.ts', 'dev/workbench/scenarios.ts', 'dev/workbench/mock-shim.ts', 'components/project-view/ProjectView.tsx',
  'components/project-view/tabs/ConversationsTab.tsx', 'hooks/use-chunked-reveal.ts'];
export function growthSourceIdentity(checkout, build) {
  const hash = createHash('sha256');
  for (const file of SOURCE_FILES) hash.update(file).update('\0').update(readBoundedText(join(checkout, 'desktop/src/renderer', file))).update('\0');
  return { checkout: resolve(checkout), build: resolve(build), sha256: hash.digest('hex') };
}

// Source-proven desktop path: ScreenMark is a sibling of ConversationsTab;
// that tab's .scroll-mask--wide owns direct row buttons and the hasMore sentinel.
// Geometry is read only at checkpoints or BEFORE setting scrollTop, never per frame.
const LOCATE = `const marks = [...document.querySelectorAll('[data-screen="projects/conversations"]')];
  const panel = marks[0]?.parentElement;
  const scrollers = panel ? [...panel.querySelectorAll('.scroll-mask--wide.overflow-auto')].filter(e => !e.closest('.hidden,[hidden],[aria-hidden="true"]')) : [];
  const scroller = scrollers[0];`;
export const GROWTH_INSPECT = `(() => { ${LOCATE}
  const view = marks[0]?.closest('.screen-view');
  const tab = view?.querySelector('button[aria-label="Conversations"][aria-current="page"]');
  const headings = panel ? [...panel.querySelectorAll('h2')].filter(e => e.textContent.trim() === 'Recent conversations') : [];
  const cards = scroller ? [...scroller.children].filter(e => e.tagName === 'BUTTON') : [];
  const index = e => { const t = e?.getAttribute('title') ?? ''; const m = /^(?:session (\\d+)|refactor the transcript watcher byte-offset reader and its eight downstream consumers \\((\\d+)\\))$/.exec(t); return m ? Number(m[1] ?? m[2]) : null; };
  const q = new URLSearchParams(location.search);
  const box = scroller?.getBoundingClientRect();
  return { screen: '${GROWTH_SCREEN}', markCount: marks.length, scrollerCount: scrollers.length,
    shown: !!tab && headings.length === 1 && !!box && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight,
    epoch: String(performance.timeOrigin), project: view?.querySelector('[data-guide-anchor="project-hero"] button[title="Open in File Explorer"]')?.textContent.trim() ?? null,
    targetKey: '.scroll-mask--wide.overflow-auto', width: innerWidth, rows: tab ? Number(tab.lastElementChild?.textContent.trim()) : null,
    scenario: q.get('scenario'), effectiveRows: Number(q.get('stressRows')), renderedRows: cards.length, firstIndex: index(cards[0]), lastIndex: index(cards.at(-1)),
    hasMore: !!scroller?.querySelector(':scope > div[aria-hidden]'), scrollTop: scroller?.scrollTop ?? null, scrollHeight: scroller?.scrollHeight ?? null, clientHeight: scroller?.clientHeight ?? null };
})()`;

export function makeDomGrowthDriver(tab, { checkout, build, markCheck }) {
  return {
    source: async () => growthSourceIdentity(checkout, build),
    settle: () => settleAndCount(tab),
    inspect: async () => { const proof = await tab.evaluate(markCheck(GROWTH_SCREEN), 5000); const row = await tab.evaluate(GROWTH_INSPECT, 5000); return { ...row, shown: row?.shown === true && proof?.shown === true }; },
    counters: async () => {
      try {
        const response = await tab.send('Performance.getMetrics', {}, 5000);
        const by = Object.fromEntries((response.metrics ?? []).map(m => [m.name, m.value]));
        const layout = await readCounters({ send: async () => response });
        const values = Object.fromEntries(COUNTERS.map(k => [k, finite(by[k]) ? by[k] : null]));
        return { status: COUNTERS.every(k => finite(values[k])) ? 'measured' : 'unmeasured', values, layout, scope: GROWTH_DESCRIPTOR.counterScope };
      } catch (error) { return { status: 'unmeasured', values: {}, reason: error.message }; }
    },
    scroll: () => tab.evaluate(`(() => { ${LOCATE} if(marks.length !== 1 || scrollers.length !== 1) return {applied:false}; const before = scroller.scrollTop; const to = scroller.scrollHeight - scroller.clientHeight; scroller.scrollTop = to; return {applied:true, plannedFrom:before, plannedTo:to}; })()`, 5000),
    close: () => tab.evaluate(`window.__youcodedScreens.open('projects/files')`, 10000),
    closedProof: async () => {
      const settle = await settleAndCount(tab);
      const proof = await tab.evaluate(markCheck('projects/files'), 5000);
      const state = await tab.evaluate(`(() => { const marks = [...document.querySelectorAll('[data-screen="projects/files"]')]; const panel = marks[0]?.parentElement; return { absent: document.querySelectorAll('[data-screen="projects/conversations"]').length === 0, unmounted: marks.length === 1 && !!panel && ![...panel.querySelectorAll('h2')].some(e => e.textContent.trim() === 'Recent conversations') }; })()`, 5000);
      return { ...state, settle, filesShown: proof?.shown === true };
    },
    reopen: () => tab.evaluate(`window.__youcodedScreens.open('${GROWTH_SCREEN}')`, 10000),
  };
}
