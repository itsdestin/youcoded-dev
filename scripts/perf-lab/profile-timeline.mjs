#!/usr/bin/env node
// scripts/perf-lab/profile-timeline.mjs — read a V8 .cpuprofile as a TIMELINE instead of one big ranking.
//
//   node scripts/perf-lab/profile-timeline.mjs <file.cpuprofile> [--bucket 500] [--block 50] [--top 4] [--json out.json]
//
// WHY (2026-10-23, desktop quiet run, item 4): summarise-profile.mjs ranks functions over the whole profile, which hides
// WHEN a cost happened. The question was "what runs at the moment a very big code block crosses the highlight limit, and in the
// ~2.5 s periodic gaps". This prints, for every time bucket, how busy the page was and which functions held it (self time and the
// nearest app-level caller by inclusive time), then lists every unbroken busy block longer than --block ms (a block the page could
// not type or scroll through) with the functions that filled it.
//
// Time is measured from the profile's first sample (the profiler is started a moment before the message is sent).
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: profile-timeline.mjs <file.cpuprofile> [--bucket ms] [--block ms] [--top n] [--json out]'); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BUCKET = Number(opt('bucket', 500)), BLOCK = Number(opt('block', 50)), TOP = Number(opt('top', 4));

const prof = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = (n) => {
  const f = n.callFrame, u = (f.url || '').split('/').slice(-1)[0].split('?')[0];
  return `${f.functionName || '(anonymous)'}${u ? ` [${u}:${f.lineNumber + 1}]` : ''}`;
};
const isIdle = (n) => ['(idle)', '(program)'].includes(n.callFrame.functionName);
// Nearest ancestor that is app code (the bundled renderer chunks), to say WHO asked for a library function's work.
const appCaller = (id) => {
  for (let p = parent.get(id); p !== undefined; p = parent.get(p)) {
    const f = nodes.get(p).callFrame;
    if (/\/assets\/|index-|dist-/.test(f.url || '') && f.functionName) return label(nodes.get(p));
  }
  return '';
};

const t0 = prof.startTime;
const samples = [];
let t = 0;
for (let i = 0; i < prof.samples.length; i++) {
  t += prof.timeDeltas[i] / 1000;
  const n = nodes.get(prof.samples[i]);
  const dur = (prof.timeDeltas[i + 1] ?? prof.timeDeltas[i]) / 1000;
  samples.push({ t, dur, id: prof.samples[i], idle: isIdle(n) });
}
const wall = samples.length ? samples[samples.length - 1].t : 0;

const buckets = [];
for (const s of samples) {
  const b = Math.floor(s.t / BUCKET);
  (buckets[b] ??= { busy: 0, fn: new Map() });
  if (!s.idle) {
    buckets[b].busy += s.dur;
    const k = label(nodes.get(s.id));
    buckets[b].fn.set(k, (buckets[b].fn.get(k) ?? 0) + s.dur);
  }
}
const out = { file, wallMs: Math.round(wall), buckets: [], blocks: [], meta: prof.perfLab ?? null };
console.log(`${file}\n  ${Math.round(wall)} ms wall, ${samples.length} samples\n`);
console.log(`bucket(${BUCKET}ms)  busy%  top functions (self ms)`);
buckets.forEach((b, i) => {
  if (!b) return;
  const top = [...b.fn].sort((x, y) => y[1] - x[1]).slice(0, TOP).map(([k, v]) => `${Math.round(v)}ms ${k}`);
  out.buckets.push({ startMs: i * BUCKET, busyPct: Math.round(b.busy / BUCKET * 100), top });
  console.log(`${String(i * BUCKET).padStart(8)}  ${String(Math.round(b.busy / BUCKET * 100)).padStart(4)}%  ${top.join(' | ')}`);
});

// Unbroken busy blocks: idle gaps shorter than 5 ms do not split a block (the sampler can land on "(program)" between tasks).
let cur = null;
const blocks = [];
for (const s of samples) {
  if (!s.idle) { if (!cur) cur = { start: s.t - s.dur, end: s.t, fn: new Map(), callers: new Map() }; cur.end = s.t; const n = nodes.get(s.id); const k = label(n); cur.fn.set(k, (cur.fn.get(k) ?? 0) + s.dur); const c = appCaller(s.id); if (c) cur.callers.set(c, (cur.callers.get(c) ?? 0) + s.dur); }
  else if (cur && s.t - cur.end > 5) { blocks.push(cur); cur = null; }
}
if (cur) blocks.push(cur);
console.log(`\nunbroken busy blocks longer than ${BLOCK} ms:`);
for (const b of blocks.filter((x) => x.end - x.start >= BLOCK)) {
  const top = [...b.fn].sort((x, y) => y[1] - x[1]).slice(0, TOP).map(([k, v]) => `${Math.round(v)}ms ${k}`);
  const who = [...b.callers].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => `${Math.round(v)}ms under ${k}`);
  out.blocks.push({ startMs: Math.round(b.start), lenMs: Math.round(b.end - b.start), top, who });
  console.log(`  @${String(Math.round(b.start)).padStart(7)} ms  ${String(Math.round(b.end - b.start)).padStart(6)} ms  ${top.join(' | ')}${who.length ? `\n${' '.repeat(26)}asked for by: ${who.join(' | ')}` : ''}`);
}
const jo = opt('json', null);
if (jo) writeFileSync(jo, JSON.stringify(out, null, 1));
