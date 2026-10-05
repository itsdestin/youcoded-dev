#!/usr/bin/env node
// scripts/perf-lab/realism-table.mjs — one table from realism.mjs result files.
//   node scripts/perf-lab/realism-table.mjs <dir|file...> [--run warm]
// One row per boot; boots of the same cell are listed together with their median and worst, so a cell whose max is > 2x its p95
// (a one-off spike) is visible. Columns: all clicks (pointerdown/up/click) click->paint p50 / p95 / max, slow (>= 104 ms) per minute,
// worst handler time and worst presentation delay (the owner's recorder's split), worst long frame, and whether the right pane arrived.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const med = a => { const s = a.filter(n => typeof n === 'number').sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

export function cellName(rep) { const f = rep.factors; return `${f.build}/${f.history}/${f.theme}/${f.display}/s${f.sessions}${rep.tag ? ' [' + rep.tag + ']' : ''}`; }

export function rowOf(rep, label) {
  const r = rep.runs?.[label]; if (!r) return null;
  const a = r.events.all;
  return { cell: cellName(rep), run: label, boot: rep.boot, clicks: a.n, p50: a.dur.p50, p95: a.dur.p95, max: a.dur.max, slowPerMin: a.slowPerMin, slowP95: a.slowDur.p95,
    procMax: a.proc.max, presMax: a.pres.max, loafMax: r.loaf.durMax, wrong: r.identity.wrong + r.identity.blank, judged: r.identity.judged, load: r.loadAvgStart, unusable: rep.unusable ? 'LOAD' : '' };
}

export function table(reps, label) {
  const rows = reps.map(r => rowOf(r, label)).filter(Boolean);
  const byCell = new Map();
  for (const r of rows) { if (!byCell.has(r.cell)) byCell.set(r.cell, []); byCell.get(r.cell).push(r); }
  const lines = [`| cell (build/history/theme/display/sessions) | run | boots | click->paint p95 (median of boots) | worst (max of boots) | slow>=104ms /min | worst handler | worst presentation | worst long frame | wrong pane |`, '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [cell, list] of byCell) {
    lines.push(`| ${cell} | ${label} | ${list.length}${list.some(r => r.unusable) ? ' (load>8)' : ''} | ${med(list.map(r => r.p95))} | ${Math.max(...list.map(r => r.max ?? 0))} | ${med(list.map(r => r.slowPerMin))} | ${Math.max(...list.map(r => r.procMax ?? 0))} | ${Math.max(...list.map(r => r.presMax ?? 0))} | ${Math.max(...list.map(r => r.loafMax ?? 0))} | ${list.reduce((s, r) => s + r.wrong, 0)}/${list.reduce((s, r) => s + r.judged, 0)} |`);
  }
  return lines.join('\n');
}

export function loadReports(paths) {
  const files = [];
  for (const p of paths) { if (!existsSync(p)) continue; if (statSync(p).isDirectory()) for (const f of readdirSync(p)) { if (f.endsWith('.json')) files.push(join(p, f)); } else files.push(p); }
  const out = [];
  for (const f of files) { try { const r = JSON.parse(readFileSync(f, 'utf8')); if (r.factors && r.runs) out.push(r); } catch { /* not a result */ } }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); let run = null; const paths = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === '--run') run = args[++i]; else paths.push(args[i]); }
  const reps = loadReports(paths);
  for (const label of run ? [run] : ['fresh', 'warm', 'soaked', 'busy']) { const t = table(reps, label); if (t.split('\n').length > 2) console.log(`\n${t}`); }
}
