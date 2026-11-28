#!/usr/bin/env node
// Plain-language report on the app's hitch recorder file (<userData>/perf/hitches.jsonl).
//   node scripts/perf-lab/hitch-report.mjs <file|dir> [--since 24h] [--json]
// <dir> may be the perf folder, the app's userData folder (its perf/ is used), or a folder
// holding hitches.jsonl / hitches.1.jsonl. READ-ONLY: it opens the files for reading only
// (the app appends and closes on every flush, so this is safe against a running app), and a
// half-written last line is skipped, never an error. Format: youcoded/docs/ (hitch recorder).
import fs from 'node:fs';
import path from 'node:path';

export function parseSince(s) {
  if (!s) return 0;
  const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(s);
  if (!m) throw new Error(`--since wants a number plus m, h or d (e.g. 90m, 24h, 7d); got "${s}"`);
  return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
}

export function filesFor(t) {
  const st = fs.statSync(t);
  if (st.isFile()) return [t];
  const dir = fs.existsSync(path.join(t, 'perf')) ? path.join(t, 'perf') : t;
  // oldest generation first so lines stay in time order
  return ['hitches.1.jsonl', 'hitches.jsonl'].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
}

export function readLines(files, sinceMs, now = Date.now()) {
  const rows = [];
  let bad = 0;
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        const t = Date.parse(o.ts);
        if (!Number.isFinite(t)) { bad++; continue; }
        if (sinceMs && t < now - sinceMs) continue;
        o.t = t; rows.push(o);
      } catch { bad++; } // a line still being written, or damaged: skip it
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return { rows, bad };
}

const localTs = (iso) => { const d = new Date(iso); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
const sec = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const bucket = (n) => (n <= 0 ? 'no sessions' : n === 1 ? '1 session' : n <= 3 ? '2-3 sessions' : n <= 7 ? '4-7 sessions' : '8 or more sessions');

/** Why a long frame was slow, in words. */
export function causeOfFrame(e) {
  const top = e.sc?.[0];
  if (e.sl >= e.d * 0.4 && (!top || top.d < e.d * 0.4)) return 'style & layout (the browser recomputing the page)';
  // WHY: absent script attribution is not proof of GPU work or an idle JS thread.
  if (!top) return 'unattributed (no script timing recorded)';
  if (top.fl >= top.d * 0.5 && top.fl >= 30) return `forced layout inside ${top.fn || top.iv || 'a function'} (${top.src})`;
  return `${top.fn || top.iv || top.it || 'unnamed code'} (${top.src || 'unknown file'})`;
}

/** Nearest-rank percentile of a list of numbers (null for an empty list). */
export function pct(list, p) {
  if (!list.length) return null;
  const a = list.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}
const stats = (list) => ({ n: list.length, p50: pct(list, 50), p95: pct(list, 95), max: list.length ? Math.max(...list) : null });
const CAUSE_WORDS = { pill: 'tab click', menu: 'All Sessions menu', key: 'keyboard', drawer: 'drawer', auto: 'automatic (a session opened/closed)', other: 'other (e.g. from the buddy window)' };

/** "Switching sessions": every `switch` line, in numbers a person can read. A switch has two clocks: how long until the NEW session
 *  showed ("showed", ff) and how long until its content stopped changing ("settled", st; null when that is unknown). Switches that
 *  ended because the page hid or the last session closed carry no usable timing and are left out of the timings. */
export function analyseSwitches(rows, hitches) {
  const all = rows.filter((r) => r.kind === 'switch');
  if (!all.length) return null;
  const usable = all.filter((r) => r.end !== 'hidden' && r.end !== 'closed');
  const showed = (xs) => xs.filter((r) => r.ff != null).map((r) => r.ff);
  const settled = (xs) => xs.filter((r) => r.st != null).map((r) => r.st);
  const over = (xs, lim) => xs.filter((v) => v > lim).length;
  const split = (name, pred) => { const xs = usable.filter(pred); return { name, switches: xs.length, showed: stats(showed(xs)), settled: stats(settled(xs)) }; };
  const dur = (r) => Math.max(r.ff ?? 0, r.st ?? 0);
  // Freezes / stalls / slow inputs as time intervals (a stall's line is written when it ENDS; a frame's when it starts).
  const spans = hitches.map((h) => (h.kind === 'stall' ? { h, from: h.r.t - h.ms, to: h.r.t } : { h, from: h.r.t, to: h.r.t + h.ms }));
  const during = (from, to) => spans.filter((x) => x.from <= to && x.to >= from).map((x) => ({ kind: x.h.kind, ms: x.h.ms, cause: x.h.cause }));
  const worst = usable.slice().sort((a, b) => dur(b) - dur(a)).slice(0, 3).map((r) => ({
    ts: r.ts, cause: r.cause, view: r.vm, kind: r.dk, streaming: !!r.str, firstVisit: !!r.cold, openSessions: r.open,
    showedMs: r.ff, settledMs: r.st, endedBecause: r.end, entriesAtFirstFrame: r.e1, entriesAtSettle: r.e2, mutations: r.mut,
    layoutShifts: r.ls, longFrames: r.loaf, longFramesMs: r.loafMs, worstSlowInputMs: r.ind, msSincePrevious: r.gap, drainedChars: r.drain,
    overlapping: during(r.t, r.t + dur(r)),
  }));
  // After arrival: the 2 s after the new session first showed.
  const arrived = usable.filter((r) => r.ff != null);
  let freezesAfter = 0, freezeMsAfter = 0, withFreeze = 0;
  for (const r of arrived) {
    const hs = during(r.t + r.ff, r.t + r.ff + 2000).filter((x) => x.kind !== 'slow-input');
    if (hs.length) withFreeze++;
    freezesAfter += hs.length; freezeMsAfter += hs.reduce((a, x) => a + x.ms, 0);
  }
  const late = usable.filter((r) => r.st != null && r.ff != null && r.st - r.ff >= 50);
  return {
    total: all.length, counted: usable.length, interrupted: all.filter((r) => r.end === 'interrupted').length,
    hiddenOrClosed: all.length - usable.length,
    showed: stats(showed(usable)), settled: stats(settled(usable)),
    settledUnknown: usable.filter((r) => r.st == null && r.end !== 'interrupted').length,
    overShowed: { over100: over(showed(usable), 100), over200: over(showed(usable), 200), over400: over(showed(usable), 400) },
    overSettled: { over100: over(settled(usable), 100), over200: over(settled(usable), 200), over400: over(settled(usable), 400) },
    splits: {
      byView: [split('chat view', (r) => r.vm === 'chat'), split('terminal view', (r) => r.vm === 'terminal')],
      byVisit: [split('first visit', (r) => r.cold), split('revisit', (r) => !r.cold)],
      byDestination: [split('idle destination', (r) => !r.str), split('streaming destination', (r) => r.str)],
      byRhythm: [split('quick back-and-forth (< 0.5 s after the last switch)', (r) => r.gap != null && r.gap < 500), split('spaced', (r) => r.gap == null || r.gap >= 500)],
      byCause: Object.keys(CAUSE_WORDS).map((c) => split(CAUSE_WORDS[c], (r) => r.cause === c)).filter((x) => x.switches),
    },
    worst,
    afterArrival: {
      switches: arrived.length, keptChanging: late.length,
      medianExtraMs: late.length ? pct(late.map((r) => r.st - r.ff), 50) : null,
      mutations: arrived.reduce((a, r) => a + (r.mut ?? 0), 0), layoutShifts: arrived.reduce((a, r) => a + (r.ls ?? 0), 0),
      freezes: freezesAfter, freezeMs: freezeMsAfter, switchesWithAFreeze: withFreeze,
    },
  };
}

export function analyse(rows) {
  const hitches = [];
  for (const r of rows) {
    if (r.kind === 'frame' || r.kind === 'task') hitches.push({ r, kind: 'freeze', ms: r.d, cause: r.kind === 'frame' ? causeOfFrame(r) : 'a long task (browser could not say which code)' });
    else if (r.kind === 'main-stall') hitches.push({ r, kind: 'stall', ms: r.ms, cause: causeOfStall(r) });
    else if (r.kind === 'event') hitches.push({ r, kind: 'slow-input', ms: r.d, cause: `slow ${r.type} on ${r.tgt}` });
  }
  const group = (keyFn) => {
    const m = new Map();
    for (const h of hitches) { const k = keyFn(h); const g = m.get(k) ?? { key: k, count: 0, ms: 0, worst: 0 }; g.count++; g.ms += h.ms; g.worst = Math.max(g.worst, h.ms); m.set(k, g); }
    return [...m.values()].sort((a, b) => b.ms - a.ms);
  };
  const screenOf = (h) => { if (h.kind === 'stall') return 'engine (not tied to any one view)'; const c = h.r.ctx ?? {}; return `${c.vm ?? 'unknown view'}${c.scr ? ', full screen open' : ''}${c.dlg ? ', dialog open' : ''}${c.vis === 'hidden' ? ' (window hidden)' : ''}`; };
  const freezeMs = hitches.filter((h) => h.kind !== 'slow-input').reduce((a, h) => a + h.ms, 0);
  // per hour (local time)
  const hours = new Map();
  for (const h of hitches) {
    const d = new Date(h.r.t); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    const g = hours.get(k) ?? { hour: k, count: 0, ms: 0 }; g.count++; g.ms += h.kind === 'slow-input' ? 0 : h.ms; hours.set(k, g);
  }
  // memory by hour: first and last minute line of each hour, per launch
  const mem = new Map();
  for (const r of rows.filter((x) => x.kind === 'minute')) {
    const d = new Date(r.t); const hour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    const sample = {
      'main process': r.main?.rss, browser: r.procs?.browser?.ws, 'graphics (GPU)': r.procs?.gpu?.ws,
      'page(s) total': (r.procs?.renderer ?? []).reduce((a, p) => a + p.ws, 0) || undefined,
    };
    const k = `${r.launch}|${hour}`;
    const g = mem.get(k) ?? { launch: r.launch, hour, first: sample, last: sample, minutes: 0, peakLoop: 0, cpu: 0 };
    g.last = sample; g.minutes++; g.peakLoop = Math.max(g.peakLoop, r.loop?.max ?? 0);
    mem.set(k, g);
  }
  const startups = rows.filter((r) => r.kind === 'startup').map((r) => ({
    packaged: r.packaged,
    ts: r.ts, launch: r.launch, windowLoadedMs: r.loadedMs, appMountedMs: r.renderer?.marks?.['yc:app-mounted'] ?? null, firstPaintMs: r.renderer?.fcp ?? null,
    bootMarks: r.main,
  }));
  const loop = rows.filter((r) => r.kind === 'minute');
  const switching = analyseSwitches(rows, hitches);
  const rhythm = analyseRhythm(rows);
  return {
    switching,
    launches: launchSummaries(rows),
    rhythm,
    headline: rhythmHeadline(rhythm),
    window: rows.length ? { from: rows[0].ts, to: rows.at(-1).ts } : null,
    totals: {
      hitches: hitches.length, freezes: hitches.filter((h) => h.kind === 'freeze').length, stalls: hitches.filter((h) => h.kind === 'stall').length,
      slowInputs: hitches.filter((h) => h.kind === 'slow-input').length, frozenMs: freezeMs,
      mediumFrames: loop.reduce((a, r) => a + (r.rend?.frames ?? 0), 0), mediumFramesMs: loop.reduce((a, r) => a + (r.rend?.framesMs ?? 0), 0),
      droppedDetail: loop.reduce((a, r) => a + (r.rend?.over ?? 0) + (r.rend?.dropped ?? 0) + (r.lost ?? 0), 0),
      overflowMs: loop.reduce((a, r) => a + (r.rend?.overMs ?? 0), 0),
      minutes: loop.length, launches: new Set(rows.map((r) => r.launch)).size,
    },
    worst: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 10).map((h) => ({ ts: h.r.ts, kind: h.kind, ms: h.ms, cause: h.cause, view: screenOf(h), sessions: h.r.sessions })),
    byCause: group((h) => h.cause).slice(0, 12),
    byScreen: group(screenOf).slice(0, 8),
    bySessions: group((h) => bucket(h.r.sessions ?? 0)),
    perHour: [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    memory: [...mem.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    startups,
    build: buildKind(startups),
  };
}


/** Why an engine stall happened, in words. WHY terminal-ack is special: it is simply the most frequent request the app
 *  handles (every chunk of terminal output is acknowledged), so "the last request was terminal-ack" says nothing about
 *  cause (2026-11 hitch audit). It is labelled as "during terminal output", and still counted as its own group. */
export const UNINFORMATIVE_IPC = new Set(['session:terminal-ack']);
export function causeOfStall(r) {
  if (!r.lastIpc || !(r.lastIpcAgoMs <= r.ms)) return 'main process stall (no app request had started inside the stall: other work, or the whole computer was busy)';
  if (UNINFORMATIVE_IPC.has(r.lastIpc)) return 'main process stall (during terminal output, no specific request)';
  return `main process stall (the last request it started was ${r.lastIpc} — may be unrelated)`;
}

/** PER LAUNCH: one summary per launch id, oldest first, each compared with the one before it.
 *  Rates need a long enough span to mean anything, so launches shorter than MIN_COMPARE_MS are not compared. */
export const MIN_COMPARE_MS = 10 * 60_000;
export function launchSummaries(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.t)) continue; // readLines always sets t; hand-made rows may not
    const k = r.launch ?? 'unknown';
    const g = m.get(k) ?? { launch: k, from: r.t, to: r.t, stallMs: [], freezes: 0 };
    g.from = Math.min(g.from, r.t); g.to = Math.max(g.to, r.t);
    if (r.kind === 'main-stall' && Number.isFinite(r.ms)) g.stallMs.push(r.ms);
    else if (r.kind === 'frame') g.freezes++;
    m.set(k, g);
  }
  const out = [...m.values()].sort((a, b) => a.from - b.from).map((g) => {
    const durationMs = g.to - g.from;
    const hours = durationMs / 3_600_000;
    const stalledMs = g.stallMs.reduce((a, v) => a + v, 0);
    return {
      launch: g.launch, from: new Date(g.from).toISOString(), to: new Date(g.to).toISOString(), durationMs,
      stalls: g.stallMs.length, stallsPerHour: hours > 0 ? g.stallMs.length / hours : null,
      stalledMs, stalledMsPerHour: hours > 0 ? stalledMs / hours : null,
      medianStallMs: pct(g.stallMs, 50), p90StallMs: pct(g.stallMs, 90), freezes: g.freezes, vsPrevious: null,
    };
  });
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (a.durationMs < MIN_COMPARE_MS || b.durationMs < MIN_COMPARE_MS) { b.vsPrevious = { comparable: false }; continue; }
    // change in stalls per hour: negative = better
    const change = a.stallsPerHour > 0 ? (b.stallsPerHour - a.stallsPerHour) / a.stallsPerHour : (b.stallsPerHour > 0 ? Infinity : 0);
    const stalledChange = a.stalledMsPerHour > 0 ? (b.stalledMsPerHour - a.stalledMsPerHour) / a.stalledMsPerHour : (b.stalledMsPerHour > 0 ? Infinity : 0);
    b.vsPrevious = { comparable: true, previous: a.launch, stallsPerHourChange: change, stalledPerHourChange: stalledChange, verdict: Math.abs(change) < 0.1 ? 'about the same' : change < 0 ? 'better' : 'worse' };
  }
  return out;
}

/** RHYTHM: do engine stalls line up with a repeating timer? For each candidate period we fold every stall's START time
 *  (end time minus length) onto one cycle, cut the cycle into bins (1 s, or a tenth of the period when it is under 10 s),
 *  and find the busiest two adjacent bins. If stalls were random, those two bins would hold 2/bins of them ("uniform").
 *  A period is FLAGGED when they hold at least RHYTHM_MIN_RATIO times that AND at least RHYTHM_MIN_SHARE of all stalls.
 *  A flagged longer period that is a whole multiple of a flagged shorter one at the same phase is that timer's harmonic
 *  (a 10 s timer also looks periodic at 20 s and 30 s), so it is listed under the shorter one, not reported again. */
export const RHYTHM_PERIODS_S = [1, 2, 5, 10, 15, 20, 25, 30, 60];
export const RHYTHM_MIN_STALLS = 50, RHYTHM_MIN_RATIO = 2.5, RHYTHM_MIN_SHARE = 0.3;
export function rhythmFor(stalls, periodsS = RHYTHM_PERIODS_S) {
  const all = [];
  for (const P of periodsS) {
    const periodMs = P * 1000, binMs = Math.min(1000, periodMs / 10), nb = Math.round(periodMs / binMs);
    const binOf = (s) => Math.floor((((s.start % periodMs) + periodMs) % periodMs) / binMs);
    const counts = new Array(nb).fill(0);
    for (const s of stalls) counts[binOf(s)]++;
    let best = 0, bestI = 0;
    for (let i = 0; i < nb; i++) { const c = counts[i] + counts[(i + 1) % nb]; if (c > best) { best = c; bestI = i; } }
    const share = best / stalls.length, ratio = share / (2 / nb);
    const inWin = stalls.filter((s) => { const b = binOf(s); return b === bestI || b === (bestI + 1) % nb; });
    all.push({ periodS: P, periodMs, binMs, phaseStartMs: bestI * binMs, phaseEndMs: (bestI + 2) * binMs, share, ratio, count: best, medianMs: pct(inWin.map((s) => s.ms), 50), flagged: share >= RHYTHM_MIN_SHARE && ratio >= RHYTHM_MIN_RATIO, harmonics: [] });
  }
  // Group flagged periods into timers. A flagged period joins the family of a shorter flagged period it is a whole multiple of,
  // at the same phase. WHY the true period is the LONGEST unbroken strong multiple: a 10 s timer looks equally concentrated at
  // 5 s (stalls line up there too), but a 5 s timer looks only HALF as concentrated at 10 s (two peaks). So we move up to a
  // longer period only while its share stays within HARMONIC_KEEP of the family's base share, and every tested period in
  // between (that divides it) is also that strong; otherwise the longer period is just a harmonic and is listed under the timer.
  const HARMONIC_KEEP = 0.85;
  const families = [];
  for (const h of all.filter((x) => x.flagged)) {
    const fam = families.find((f) => h.periodMs % f.base.periodMs === 0 && circDist((h.phaseStartMs + h.phaseEndMs) / 2, (f.base.phaseStartMs + f.base.phaseEndMs) / 2, f.base.periodMs) <= 2 * Math.max(f.base.binMs, h.binMs));
    if (!fam) { families.push({ base: h, current: h, members: [h] }); continue; }
    fam.members.push(h);
    const strong = (x) => x.share >= HARMONIC_KEEP * fam.base.share;
    const between = all.filter((q) => q.periodMs > fam.current.periodMs && q.periodMs < h.periodMs && q.periodMs % fam.current.periodMs === 0 && h.periodMs % q.periodMs === 0);
    if (h.periodMs % fam.current.periodMs === 0 && strong(h) && between.every(strong)) fam.current = h;
  }
  return families.map((f) => ({ ...f.current, harmonics: f.members.filter((m) => m !== f.current).map((m) => m.periodS) }));
}
const circDist = (a, b, period) => { const d = Math.abs(((a % period) + period) % period - ((b % period) + period) % period); return Math.min(d, period - d); };

export function analyseRhythm(rows) {
  const by = new Map();
  for (const r of rows) if (r.kind === 'main-stall' && Number.isFinite(r.ms) && Number.isFinite(r.t)) { const k = r.launch ?? 'unknown'; (by.get(k) ?? by.set(k, []).get(k)).push({ start: r.t - r.ms, ms: r.ms }); }
  return [...by.entries()].map(([launch, stalls]) => ({ launch, stalls: stalls.length, tested: stalls.length >= RHYTHM_MIN_STALLS, repeating: stalls.length >= RHYTHM_MIN_STALLS ? rhythmFor(stalls) : [] }))
    .sort((a, b) => b.stalls - a.stalls);
}

/** One sentence naming the worst repeating stall across launches (most stalls explained by a timer), or null. */
export function rhythmHeadline(rhythm) {
  let best = null;
  for (const l of rhythm) for (const h of l.repeating) { const n = h.share * l.stalls; if (!best || n > best.n) best = { n, l, h }; }
  if (!best) return null;
  const { l, h } = best;
  return `${h.share >= 0.5 ? 'Most' : 'Many'} engine stalls repeat every ${h.periodS} s (${Math.round(h.share * 100)}% of them, launch ${l.launch}) — a timer, not real work.`;
}

const msOrDash = (v) => (v == null ? '-' : sec(v));
const trio = (s) => (s.n ? `typical ${sec(s.p50)}, slowest 1 in 20 ${sec(s.p95)}, worst ${sec(s.max)}` : 'none measured');
export function renderSwitching(w) {
  const o = [];
  o.push('SWITCHING SESSIONS');
  o.push(`  ${w.total} switch(es) between sessions recorded${w.interrupted ? `; ${w.interrupted} of them cut short because you switched again before the last one finished` : ''}${w.hiddenOrClosed ? `; ${w.hiddenOrClosed} left out of the times (the window was hidden or the last session closed)` : ''}.`);
  o.push(`  Until the new session SHOWED:    ${trio(w.showed)}   (${w.showed.n} measured)`);
  o.push(`  Until it stopped changing:       ${trio(w.settled)}   (${w.settled.n} measured${w.settledUnknown ? `; ${w.settledUnknown} never held still, e.g. a session that was busy answering` : ''})`);
  o.push(`  Took over 0.1 s / 0.2 s / 0.4 s to show:    ${w.overShowed.over100} / ${w.overShowed.over200} / ${w.overShowed.over400}`);
  o.push(`  Took over 0.1 s / 0.2 s / 0.4 s to settle:  ${w.overSettled.over100} / ${w.overSettled.over200} / ${w.overSettled.over400}`);
  const table = (title, rows) => {
    o.push(`  ${title}`);
    for (const x of rows) o.push(`    ${x.name.padEnd(54)} ${String(x.switches).padStart(4)}x  showed: ${x.showed.n ? `${sec(x.showed.p50)} typical, ${sec(x.showed.p95)} slow, ${sec(x.showed.max)} worst` : '-'}   settled: ${x.settled.n ? `${sec(x.settled.p50)} / ${sec(x.settled.p95)} / ${sec(x.settled.max)}` : '-'}`);
  };
  o.push('');
  table('Chat view or terminal view', w.splits.byView);
  table('First visit to a session, or coming back', w.splits.byVisit);
  table('Destination idle, or busy answering', w.splits.byDestination);
  table('Quick back-and-forth, or spaced out', w.splits.byRhythm);
  table('How the switch was asked for', w.splits.byCause);
  if (w.worst.length) {
    o.push('');
    o.push('  THE THREE WORST (counts only; nothing about what the sessions contained)');
    for (const x of w.worst) {
      o.push(`    ${localTs(x.ts)}  showed ${msOrDash(x.showedMs)}, settled ${x.settledMs == null ? `never (${x.endedBecause})` : sec(x.settledMs)}  [${x.view} view, ${x.kind} session, ${x.streaming ? 'busy answering' : 'idle'}, ${x.firstVisit ? 'first visit' : 'revisit'}, ${x.openSessions} open, via ${CAUSE_WORDS[x.cause] ?? x.cause}]`);
      o.push(`      ${x.entriesAtFirstFrame ?? '?'} messages at first sight, ${x.entriesAtSettle ?? '?'} at the end; ${x.mutations} page change${x.mutations === 1 ? '' : 's'}; ${x.layoutShifts} layout jump(s); ${x.longFrames} long frame(s)${x.longFrames ? ` (${sec(x.longFramesMs)})` : ''}${x.worstSlowInputMs != null ? `; a click waited ${sec(x.worstSlowInputMs)} to be noticed` : ''}${x.msSincePrevious != null ? `; ${sec(x.msSincePrevious)} after the previous switch` : ''}${x.drainedChars ? `; ${x.drainedChars} characters of waiting terminal output written on arrival` : ''}`);
      o.push(x.overlapping.length ? `      Freezes at the same time: ${x.overlapping.map((h) => `${h.kind === 'stall' ? 'engine stall' : h.kind === 'slow-input' ? 'slow input' : 'freeze'} ${sec(h.ms)}`).join(', ')}` : '      No freeze or stall recorded at the same time.');
    }
  }
  const aa = w.afterArrival;
  o.push('');
  o.push('  THE 2 SECONDS AFTER ARRIVAL');
  o.push(`    ${aa.keptChanging} of ${aa.switches} switches were still changing 0.05 s or more after the new session first showed${aa.medianExtraMs != null ? ` (typically ${sec(aa.medianExtraMs)} more)` : ''}; ${aa.mutations} page change${aa.mutations === 1 ? '' : 's'} and ${aa.layoutShifts} layout jump(s) in all.`);
  o.push(`    ${aa.freezes} freeze(s)/stall(s) of 0.1 s or longer began in that window (${sec(aa.freezeMs)}), touching ${aa.switchesWithAFreeze} of ${aa.switches} switches.`);
  return o;
}

const mbs = (v) => (typeof v === 'number' ? `${Math.round(v)} MB` : '-');
// WHY: a developer build switches sessions several times slower than the installed app (2026-10-05 realism lab), and
// the first real recording came from a dev window. The startup line's `packaged` flag (absent in older files) lets the
// report say which kind of build the numbers belong to instead of letting them be read as installed-app numbers.
export function buildKind(startups) {
  const dev = startups.filter((s) => s.packaged === false).length;
  const installed = startups.filter((s) => s.packaged === true).length;
  const unknown = startups.length - dev - installed;
  return { dev, installed, unknown, launches: startups.length };
}
export function buildWarning(b) {
  if (!b || (b.dev === 0 && b.unknown === 0 && b.installed > 0)) return null;
  if (b.dev > 0) return `WARNING: ${b.dev} of ${b.launches} launch(es) in this file ran a developer build (packaged=false) - switch times run several times slower than the installed app; don't compare to installed numbers.`;
  return b.launches === 0
    ? 'WARNING: this file has no startup line, so it cannot say whether it came from a developer build or the installed app. Developer builds run switch times several times slower than the installed app; don\'t compare to installed numbers unless you know which this is.'
    : `WARNING: ${b.unknown} of ${b.launches} launch(es) have no packaged flag (recorded before it existed), so this file may be from a developer build - those run switch times several times slower than the installed app; don't compare to installed numbers unless you know which this is.`;
}

export function renderLaunches(ls) {
  const o = ['PER LAUNCH (each time the app was started; the before/after view when a fix ships)'];
  const dur = (ms) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);
  for (const l of ls) {
    o.push(`  launch ${l.launch}  from ${localTs(l.from)}, ${dur(l.durationMs)} covered`);
    o.push(`    engine stalls: ${l.stalls}${l.stallsPerHour != null ? ` (${l.stallsPerHour.toFixed(1)} an hour)` : ''}; ${sec(l.stalledMs)} stalled in all${l.stalls ? `; typical ${sec(l.medianStallMs)}, slowest 1 in 10 ${sec(l.p90StallMs)}` : ''}; screen freezes: ${l.freezes}`);
    const v = l.vsPrevious;
    if (v?.comparable) {
      const word = (c) => (!Number.isFinite(c) ? 'newly appeared' : `${Math.round(Math.abs(c) * 100)}% ${c < 0 ? 'fewer' : 'more'}`);
      o.push(`    compared with launch ${v.previous}: ${v.verdict.toUpperCase()} — ${word(v.stallsPerHourChange)} stalls an hour, ${word(v.stalledPerHourChange).replace('fewer', 'less').replace('more', 'more')} stalled time an hour`);
    } else if (v) o.push('    compared with the previous launch: not comparable (one of the two covers under 10 minutes)');
  }
  return o;
}
export function renderRhythm(rs) {
  const o = [`REPEATING STALLS (do engine stalls line up with a timer? tested only for launches with ${RHYTHM_MIN_STALLS}+ stalls; flagged when 2.5x more than chance and 30%+ of the launch's stalls)`];
  for (const l of rs) {
    if (!l.tested) { o.push(`  launch ${l.launch}: ${l.stalls} stall(s), too few to test`); continue; }
    if (!l.repeating.length) { o.push(`  launch ${l.launch}: ${l.stalls} stalls, no repeating pattern found`); continue; }
    for (const h of l.repeating) {
      const ph = (ms) => (ms / 1000).toFixed(ms % 1000 ? 1 : 0);
      o.push(`  launch ${l.launch}: every ${h.periodS} s — ${Math.round(h.share * 100)}% of its ${l.stalls} stalls start ${ph(h.phaseStartMs)}-${ph(h.phaseEndMs)} s into each ${h.periodS} s cycle (chance would be ${Math.round(100 / h.ratio * h.share)}%); typical length ${sec(h.medianMs)}${h.harmonics.length ? `; also shows at ${h.harmonics.join(' s, ')} s, which is the same timer` : ''}`);
    }
  }
  return o;
}
export function render(a, bad) {
  const o = [];
  if (!a.window) return 'No recorded data in that range.\n';
  const t = a.totals;
  o.push(`HITCH REPORT   ${localTs(a.window.from)}  to  ${localTs(a.window.to)}   (this computer's local time)`);
  o.push(`${t.launches} launch(es), ${t.minutes} minute(s) of records${bad ? `, ${bad} unreadable line(s) skipped` : ''}`);
  o.push('');
  const bw = buildWarning(a.build);
  if (bw) { o.push(bw); o.push(''); }
  o.push('THE SHORT VERSION');
  if (a.headline) o.push(`  ${a.headline}`);
  o.push('  (engine-stall lengths are approximate; timer-only measurements are lower bounds)');
  o.push(`  ${t.freezes} screen freezes of 0.1 s or longer, and ${t.stalls} time(s) the app's engine stopped answering. Together: ${sec(t.frozenMs)} frozen.`);
  o.push(`  ${t.slowInputs} key presses/clicks took over 0.1 s to show a result.`);
  o.push(`  Smaller hiccups (0.05-0.1 s): ${t.mediumFrames} of them, ${sec(t.mediumFramesMs)} in all.`);
  if (t.droppedDetail) o.push(`  (${t.droppedDetail} further hitches${t.overflowMs ? `, ${sec(t.overflowMs)} frozen,` : ''} were counted but not written out in detail, by design: detail is rate-limited per window; newer recorders reserve five extra slots for severe hitches.)`);
  o.push('');
  if (a.worst.length) {
    o.push('THE WORST ONES');
    for (const w of a.worst) o.push(`  ${localTs(w.ts)}  ${sec(w.ms).padStart(7)}  ${w.kind === 'stall' ? 'engine stall' : w.kind === 'slow-input' ? 'slow input ' : 'freeze      '}  ${w.cause}  [${w.view}; ${w.sessions ?? '?'} session(s)]`);
    o.push('');
    o.push('WHAT CAUSED THEM (most frozen time first)');
    for (const g of a.byCause) o.push(`  ${sec(g.ms).padStart(7)} over ${String(g.count).padStart(3)}x (worst ${sec(g.worst)})  ${g.key}`);
    o.push('');
    o.push('WHERE IN THE APP');
    for (const g of a.byScreen) o.push(`  ${sec(g.ms).padStart(7)} over ${String(g.count).padStart(3)}x  ${g.key}`);
    o.push('');
    o.push('BY HOW MANY SESSIONS WERE OPEN');
    for (const g of a.bySessions) o.push(`  ${sec(g.ms).padStart(7)} over ${String(g.count).padStart(3)}x  ${g.key}`);
    o.push('');
    o.push('HOUR BY HOUR');
    for (const h of a.perHour) o.push(`  ${h.hour}  ${String(h.count).padStart(4)} hitch(es)  ${sec(h.ms).padStart(7)} frozen  ${'#'.repeat(Math.min(40, Math.ceil(h.ms / 500)))}`);
    o.push('');
  } else { o.push('No hitches recorded in this range.'); o.push(''); }
  if (a.launches.length) o.push(...renderLaunches(a.launches), '');
  if (a.rhythm.length) o.push(...renderRhythm(a.rhythm), '');
  if (a.switching) o.push(...renderSwitching(a.switching), '');
  if (a.memory.length) {
    o.push('MEMORY, HOUR BY HOUR (start of hour -> end of hour; a steady climb across hours is a leak)');
    for (const g of a.memory) {
      const parts = Object.keys(g.first).filter((k) => typeof g.last[k] === 'number').map((k) => `${k} ${mbs(g.first[k])} -> ${mbs(g.last[k])}`);
      o.push(`  ${g.hour} (launch ${g.launch}, ${g.minutes} min)  ${parts.join('; ')}${g.peakLoop >= 50 ? `  [engine delay peaked ${sec(g.peakLoop)}]` : ''}`);
    }
    o.push('');
  }
  if (a.startups.length) {
    o.push('STARTUP, PER LAUNCH');
    for (const s of a.startups) o.push(`  ${localTs(s.ts)}  [${s.packaged === true ? 'installed build' : s.packaged === false ? 'DEVELOPER build' : 'build unknown'}]  window loaded ${s.windowLoadedMs == null ? '?' : sec(s.windowLoadedMs)} after launch; app ready ${s.appMountedMs == null ? '?' : sec(s.appMountedMs)} after the page began; first paint ${s.firstPaintMs == null ? '?' : sec(s.firstPaintMs)}`);
    o.push('');
  }
  return o.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--since');
  if (!target) { console.error('usage: hitch-report.mjs <file|dir> [--since 24h] [--json]'); process.exit(2); }
  try {
    const files = filesFor(target);
    if (!files.length) { console.error(`No hitches.jsonl found in ${target}`); process.exit(1); }
    const { rows, bad } = readLines(files, parseSince(val('--since')));
    const a = analyse(rows);
    console.log(flag('--json') ? JSON.stringify({ ...a, unreadableLines: bad }, null, 2) : render(a, bad));
  } catch (e) { console.error(String(e.message ?? e)); process.exit(1); }
}
