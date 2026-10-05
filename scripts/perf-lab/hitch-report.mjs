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

const sec = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const bucket = (n) => (n <= 0 ? 'no sessions' : n === 1 ? '1 session' : n <= 3 ? '2-3 sessions' : n <= 7 ? '4-7 sessions' : '8 or more sessions');

/** Why a long frame was slow, in words. */
export function causeOfFrame(e) {
  const top = e.sc?.[0];
  if (e.sl >= e.d * 0.4 && (!top || top.d < e.d * 0.4)) return 'style & layout (the browser recomputing the page)';
  if (!top) return 'drawing / browser work (no script of ours was running)';
  if (top.fl >= top.d * 0.5 && top.fl >= 30) return `forced layout inside ${top.fn || top.iv || 'a function'} (${top.src})`;
  return `${top.fn || top.iv || top.it || 'unnamed code'} (${top.src || 'unknown file'})`;
}

export function analyse(rows) {
  const hitches = [];
  for (const r of rows) {
    if (r.kind === 'frame' || r.kind === 'task') hitches.push({ r, kind: 'freeze', ms: r.d, cause: r.kind === 'frame' ? causeOfFrame(r) : 'a long task (browser could not say which code)' });
    else if (r.kind === 'main-stall') hitches.push({ r, kind: 'stall', ms: r.ms, cause: `main process stall${r.lastIpc ? ` (last request it started: ${r.lastIpc}, ${sec(r.lastIpcAgoMs)} before it ended)` : ''}` });
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
    ts: r.ts, launch: r.launch, windowLoadedMs: r.loadedMs, appMountedMs: r.renderer?.marks?.['yc:app-mounted'] ?? null, firstPaintMs: r.renderer?.fcp ?? null,
    bootMarks: r.main,
  }));
  const loop = rows.filter((r) => r.kind === 'minute');
  return {
    window: rows.length ? { from: rows[0].ts, to: rows.at(-1).ts } : null,
    totals: {
      hitches: hitches.length, freezes: hitches.filter((h) => h.kind === 'freeze').length, stalls: hitches.filter((h) => h.kind === 'stall').length,
      slowInputs: hitches.filter((h) => h.kind === 'slow-input').length, frozenMs: freezeMs,
      mediumFrames: loop.reduce((a, r) => a + (r.rend?.frames ?? 0), 0), mediumFramesMs: loop.reduce((a, r) => a + (r.rend?.framesMs ?? 0), 0),
      droppedDetail: loop.reduce((a, r) => a + (r.rend?.over ?? 0) + (r.rend?.dropped ?? 0) + (r.lost ?? 0), 0),
      minutes: loop.length, launches: new Set(rows.map((r) => r.launch)).size,
    },
    worst: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 10).map((h) => ({ ts: h.r.ts, kind: h.kind, ms: h.ms, cause: h.cause, view: screenOf(h), sessions: h.r.sessions })),
    byCause: group((h) => h.cause).slice(0, 12),
    byScreen: group(screenOf).slice(0, 8),
    bySessions: group((h) => bucket(h.r.sessions ?? 0)),
    perHour: [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    memory: [...mem.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    startups,
  };
}

const mbs = (v) => (typeof v === 'number' ? `${Math.round(v)} MB` : '-');
export function render(a, bad) {
  const o = [];
  if (!a.window) return 'No recorded data in that range.\n';
  const t = a.totals;
  o.push(`HITCH REPORT   ${a.window.from}  to  ${a.window.to}`);
  o.push(`${t.launches} launch(es), ${t.minutes} minute(s) of records${bad ? `, ${bad} unreadable line(s) skipped` : ''}`);
  o.push('');
  o.push('THE SHORT VERSION');
  o.push(`  ${t.freezes} screen freezes of 0.1 s or longer, and ${t.stalls} time(s) the app's engine stopped answering. Together: ${sec(t.frozenMs)} frozen.`);
  o.push(`  ${t.slowInputs} key presses/clicks took over 0.1 s to show a result.`);
  o.push(`  Smaller hiccups (0.05-0.1 s): ${t.mediumFrames} of them, ${sec(t.mediumFramesMs)} in all.`);
  if (t.droppedDetail) o.push(`  (${t.droppedDetail} further hitches were counted but not written out in detail, by design.)`);
  o.push('');
  if (a.worst.length) {
    o.push('THE WORST ONES');
    for (const w of a.worst) o.push(`  ${w.ts.replace('T', ' ').slice(0, 19)}  ${sec(w.ms).padStart(7)}  ${w.kind === 'stall' ? 'engine stall' : w.kind === 'slow-input' ? 'slow input ' : 'freeze      '}  ${w.cause}  [${w.view}; ${w.sessions ?? '?'} session(s)]`);
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
    for (const s of a.startups) o.push(`  ${s.ts.replace('T', ' ').slice(0, 19)}  window loaded ${s.windowLoadedMs == null ? '?' : sec(s.windowLoadedMs)} after launch; app ready ${s.appMountedMs == null ? '?' : sec(s.appMountedMs)} after the page began; first paint ${s.firstPaintMs == null ? '?' : sec(s.firstPaintMs)}`);
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
