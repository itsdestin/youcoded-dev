// scripts/perf-lab/lane-measure.mjs — turns the raw readings of ONE lane leg into the flat numbers the report compares.
//
// WHY separate and pure (2026-11-28): lane-run.mjs needs a real app and a screen; this file needs neither, so the reduction
// from raw readings to "what a person would feel" can be tested offline. Nothing here touches the app, the disk or the clock.
//
// A "leg" is one launch of one build running one scenario. Its raw readings:
//   R        the in-page recorder's rows (realism-page.mjs eventRecorder): Event Timing `ev`, long animation frames `loaf`
//   trace    Chrome trace events (viz/cc/devtools.timeline.frame) for the measured window
//   stallRows the app's own hitch-recorder rows (kind 'main-stall' = engine stalls), already limited to this leg
//   ipc      the IPC round-trip probe summary (probe-ipc.mjs readIpcStallProbe)
//   menus    per-open timings for the menu scenario
import { rhythmFor, RHYTHM_MIN_STALLS } from './hitch-report.mjs';
import { describe, summariseTrace } from './gpu-cost-parse.mjs';
import { splitEvent } from './realism-stats.mjs';

const r1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

/** Metric catalogue: label (plain words), unit, and the smallest difference worth calling real (absFloor). Lower is always better. */
export const METRICS = Object.freeze({
  keyOver16: { label: 'Key presses that took 16 ms or more to show', unit: 'keys', absFloor: 2 },
  keyP95Ms: { label: 'Key press to screen, slowest 1 in 20 keys', unit: 'ms', absFloor: 8 },
  keyMaxMs: { label: 'Key press to screen, worst', unit: 'ms', absFloor: 16 },
  loafOver50: { label: 'Long frames over 50 ms', unit: 'frames', absFloor: 2 },
  loafMaxMs: { label: 'Longest frame', unit: 'ms', absFloor: 16 },
  droppedFrames: { label: 'Frames that never reached the screen', unit: 'frames', absFloor: 3 },
  droppedPct: { label: 'Share of frames dropped', unit: '%', absFloor: 1 },
  stallCount: { label: 'App freezes (engine stalls)', unit: 'stalls', absFloor: 2 },
  stallMs: { label: 'Total time frozen', unit: 'ms', absFloor: 100 },
  stallMaxMs: { label: 'Longest freeze', unit: 'ms', absFloor: 50 },
  ipcOver100: { label: 'App replies slower than 0.1 s', unit: 'replies', absFloor: 2 },
  switchP50Ms: { label: 'Switch chat, typical click to settled', unit: 'ms', absFloor: 10 },
  switchP95Ms: { label: 'Switch chat, slowest 1 in 20', unit: 'ms', absFloor: 20 },
  switchWrongPane: { label: 'Clicks that showed the wrong chat or none', unit: 'clicks', absFloor: 1 },
  menuFirstMs: { label: 'Menus, first open (all four)', unit: 'ms', absFloor: 10 },
  menuRepeatMs: { label: 'Menus, repeat opens (all four)', unit: 'ms', absFloor: 10 },
  menuMissing: { label: 'Menus the script could not open', unit: 'menus', absFloor: 1 },
  cpuPct: { label: 'App CPU use (all its processes)', unit: '%', absFloor: 3 },
  rhythmPeriodS: { label: 'Repeating freeze period (0 = none)', unit: 's', absFloor: 0.5 },
  timeoutStalls: { label: 'Engine stalls in the idle window', unit: 'stalls', absFloor: 2 },
});

/** Which metrics each scenario reports (order = table order). */
export const SCENARIO_METRICS = Object.freeze({
  type: ['keyOver16', 'keyP95Ms', 'keyMaxMs', 'loafOver50', 'loafMaxMs', 'droppedFrames', 'droppedPct', 'stallCount', 'stallMs', 'ipcOver100'],
  menus: ['menuFirstMs', 'menuRepeatMs', 'menuMissing', 'loafOver50', 'loafMaxMs', 'droppedFrames', 'stallCount', 'stallMs'],
  switch: ['switchP50Ms', 'switchP95Ms', 'switchWrongPane', 'loafOver50', 'loafMaxMs', 'droppedFrames', 'stallCount', 'stallMs', 'ipcOver100'],
  idle: ['stallCount', 'stallMs', 'stallMaxMs', 'rhythmPeriodS', 'cpuPct', 'droppedFrames'],
});
export const SCENARIO_TITLES = Object.freeze({
  type: 'Typing while other chats stream',
  menus: 'Opening menus',
  switch: 'Switching chats',
  idle: 'Sitting idle with 16 chats open',
});

/** Key presses (and their echo) the browser measured, from the recorder's Event Timing rows. */
// WHY `typed`: the browser only reports events that took 16 ms or more, so the reported list is the slow tail. Percentiles over
// it alone would read "slow" on a build where only one key in a hundred was. When the number of keys typed is known, the
// unreported ones are counted at 8 ms (they are under the floor), so the percentile means "of ALL keys".
export function summariseKeys(rows, typed = null) {
  const keys = (rows ?? []).map(splitEvent).filter((e) => e.name === 'keydown');
  const dur = keys.map((e) => e.dur);
  if (Number.isFinite(typed) && typed > dur.length) for (let i = dur.length; i < typed; i++) dur.push(8);
  const d = describe(dur);
  return { n: keys.length, over16: keys.filter((e) => e.dur >= 16).length, over104: keys.filter((e) => e.dur >= 104).length, p95: d.p95, max: d.max };
}

/** Long animation frames: how many, how long, and which code the slowest ones ran (top script of each). */
export function summariseLoaf(loaf) {
  const rows = (loaf ?? []).map((l) => ({ dur: l[1], blocking: l[2], scripts: l[5] ?? [] }));
  const by = new Map();
  for (const l of rows.filter((x) => x.dur >= 50)) {
    const top = l.scripts[0];
    const key = top ? `${top[3] || top[0] || 'unnamed code'} (${top[4] || 'unknown file'})` : 'unattributed (no script timing recorded)';
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return {
    n: rows.length, over50: rows.filter((x) => x.dur >= 50).length, over100: rows.filter((x) => x.dur >= 100).length,
    max: rows.length ? Math.max(...rows.map((x) => x.dur)) : 0,
    topCauses: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cause, count]) => ({ cause, count })),
  };
}

/** The app's own freeze rows for this leg, with the rhythm check hitch-report uses (needs enough stalls to mean anything). */
export function summariseStalls(rows) {
  const stalls = (rows ?? []).filter((r) => r.kind === 'main-stall' && Number.isFinite(r.ms) && Number.isFinite(r.t)).map((r) => ({ start: r.t - r.ms, ms: r.ms }));
  const ms = stalls.map((s) => s.ms);
  const rhythm = stalls.length >= RHYTHM_MIN_STALLS ? rhythmFor(stalls) : [];
  return {
    count: stalls.length, totalMs: ms.reduce((a, b) => a + b, 0), maxMs: ms.length ? Math.max(...ms) : 0,
    rhythmTested: stalls.length >= RHYTHM_MIN_STALLS,
    rhythm: rhythm.map((h) => ({ periodS: h.periodS, share: r1(h.share), count: h.count })),
  };
}

/** Presented / dropped frames from a Chrome trace over the measured window. `null` trace = not captured (reported, never zero). */
export function summariseFrames(events, window = {}) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const t = summariseTrace(events, window);
  const shown = t.pipeline.presented + t.pipeline.dropped;
  return { presented: t.pipeline.presented, dropped: t.pipeline.dropped, noUpdate: t.pipeline.noUpdate, droppedPct: shown ? r1((t.pipeline.dropped / shown) * 100) : 0, longIntervals: t.longIntervals };
}

/** Per-menu open timings -> first-open and repeat-open medians over all menus that opened. */
export function summariseMenus(menus) {
  const per = {};
  const firsts = [], repeats = [];
  let missing = 0;
  for (const [name, m] of Object.entries(menus ?? {})) {
    if (!m || m.error || !Array.isArray(m.opens) || m.opens.length === 0) { missing++; per[name] = { error: m?.error ?? 'no opens measured' }; continue; }
    const [first, ...rest] = m.opens;
    firsts.push(first);
    repeats.push(...rest);
    per[name] = { firstMs: r1(first), repeats: describe(rest), n: m.opens.length };
  }
  const med = (a) => describe(a).median;
  return { per, firstMs: r1(med(firsts)), repeatMs: r1(med(repeats)), missing };
}

/** Click-to-settled timings of the switching run -> typical and slowest 1 in 20, plus clicks that showed the wrong chat. */
export function summariseSwitch(sw) {
  const d = describe(sw?.settleMs ?? []);
  return { n: d.n, p50: r1(d.median), p95: r1(d.p95), wrong: (sw?.wrong ?? 0) + (sw?.blank ?? 0) };
}

/**
 * One leg's flat numbers. Anything that could not be measured is left OUT (undefined), never zero: a missing reading must
 * read as "not measured" in the report, not as a clean result.
 */
export function legMetrics(scenario, raw) {
  const m = {};
  const put = (k, v) => { if (v !== undefined && v !== null && Number.isFinite(v)) m[k] = r1(v); };
  const loaf = raw.loaf ? summariseLoaf(raw.loaf) : null;
  const stalls = raw.stallRows ? summariseStalls(raw.stallRows) : null;
  const frames = raw.frames ?? null;
  if (loaf) { put('loafOver50', loaf.over50); put('loafMaxMs', loaf.max); }
  if (frames) { put('droppedFrames', frames.dropped); put('droppedPct', frames.droppedPct); }
  if (stalls) { put('stallCount', stalls.count); put('stallMs', stalls.totalMs); put('stallMaxMs', stalls.maxMs); put('timeoutStalls', stalls.count); put('rhythmPeriodS', stalls.rhythm[0]?.periodS ?? 0); }
  if (raw.ipc) put('ipcOver100', raw.ipc.over100ms);
  if (raw.cpuPct !== undefined) put('cpuPct', raw.cpuPct);
  if (scenario === 'type' && raw.ev) { const k = summariseKeys(raw.ev, raw.typed); put('keyOver16', k.over16); put('keyP95Ms', k.p95 ?? undefined); put('keyMaxMs', k.max ?? undefined); }
  if (scenario === 'menus' && raw.menus) { const s = summariseMenus(raw.menus); put('menuFirstMs', s.firstMs); put('menuRepeatMs', s.repeatMs); put('menuMissing', s.missing); }
  if (scenario === 'switch' && raw.switch) { const s = summariseSwitch(raw.switch); put('switchP50Ms', s.p50); put('switchP95Ms', s.p95); put('switchWrongPane', s.wrong); }
  const allowed = new Set(SCENARIO_METRICS[scenario] ?? []);
  return Object.fromEntries(Object.entries(m).filter(([k]) => allowed.has(k)));
}
