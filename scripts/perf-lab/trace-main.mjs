// scripts/perf-lab/trace-main.mjs — where the renderer main thread's time goes, by browser activity.
//
// WHY (2026-10-04, fix 5): a V8 CPU profile lumps everything that is not JavaScript into "(program)"
// (20 s of a 62 s streaming run, ~3x the JavaScript). This takes a short Chrome trace of the same
// stream and folds it by event name — Layout, UpdateLayoutTree, PrePaint, Paint, Layerize, Commit,
// HitTest, FunctionCall... — as SELF time (an event's duration minus the events nested inside it),
// so the buckets add up to the busy time instead of double counting.
//
//   const t = await traceMain(cdp, 8000); summariseTrace(t)  → { busyMs, rows: [{ name, selfMs, count }] }
//   node scripts/perf-lab/trace-main.mjs <trace.json>        → prints the table for a saved trace
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'v8.execute'].join(',');

/** Record `ms` of trace from the page target behind `cdp`; resolves with the raw trace events. */
export async function traceMain(cdp, ms) {
  const events = [];
  cdp.on('Tracing.dataCollected', p => { for (const e of p.value) events.push(e); });
  const done = new Promise(ok => cdp.on('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATEGORIES.split(',') }, transferMode: 'ReportEvents' });
  await new Promise(r => setTimeout(r, ms));
  await cdp.send('Tracing.end');
  await done;
  return events;
}

/** Fold trace events into self time per event name on the busiest renderer thread (the main thread). */
export function summariseTrace(events) {
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    const k = `${e.pid}:${e.tid}`;
    if (!byThread.has(k)) byThread.set(k, []);
    byThread.get(k).push(e);
  }
  // The main thread is the one with the most RunTask time.
  let best = null, bestMs = -1;
  for (const [k, list] of byThread) {
    const ms = list.filter(e => e.name === 'RunTask').reduce((a, e) => a + e.dur, 0) / 1000;
    if (ms > bestMs) { best = k; bestMs = ms; }
  }
  const list = (byThread.get(best) ?? []).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map(), count = new Map();
  const stack = [];
  const close = (e, childMs) => { const s = Math.max(0, e.dur / 1000 - childMs); self.set(e.name, (self.get(e.name) ?? 0) + s); count.set(e.name, (count.get(e.name) ?? 0) + 1); };
  for (const e of list) {
    while (stack.length && stack.at(-1).e.ts + stack.at(-1).e.dur <= e.ts) { const t = stack.pop(); close(t.e, t.child); }
    if (stack.length) stack.at(-1).child += e.dur / 1000;
    stack.push({ e, child: 0 });
  }
  while (stack.length) { const t = stack.pop(); close(t.e, t.child); }
  const rows = [...self].map(([name, selfMs]) => ({ name, selfMs: Math.round(selfMs), count: count.get(name) })).sort((a, b) => b.selfMs - a.selfMs);
  const span = list.length ? (Math.max(...list.map(e => e.ts + e.dur)) - list[0].ts) / 1000 : 0;
  return { thread: best, busyMs: Math.round(bestMs), spanMs: Math.round(span), rows: rows.slice(0, 30) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/perf-lab/trace-main.mjs <trace.json>'); process.exit(2); }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const s = summariseTrace(Array.isArray(raw) ? raw : raw.traceEvents ?? raw);
  console.log(`main thread ${s.thread}: ${s.busyMs} ms in RunTask over ${s.spanMs} ms`);
  for (const r of s.rows) console.log(`${String(r.selfMs).padStart(7)} ms  ${String(r.count).padStart(7)}x  ${r.name}`);
}
