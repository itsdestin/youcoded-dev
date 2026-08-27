#!/usr/bin/env node
// Coverage report for a UI review run: which planned surfaces were actually
// captured (verified) in which themes, and why the rest were not.
//
// Usage: node coverage.mjs <shotsDir> [<shotsDir> ...]   → markdown on stdout
//
// Reads every manifest-*.json shot.mjs wrote. A surface counts as covered only
// when shot.mjs verified it (target existed, `expect` held, pixels changed);
// everything else is listed with its reason so a report can say "unreviewed"
// instead of silently passing it.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';

const dirs = process.argv.slice(2);
const bySurface = new Map(); // name -> { themes: Map<theme, entry> }
for (const d of dirs) {
  if (!existsSync(d)) continue;
  // Order every entry by (run id, file time) and let the later one win per surface × theme.
  // WHY run id first (hand-off gap 6): under load an EARLIER sweep's shard can write its manifest
  // AFTER a newer sweep's, and "newest file wins" then resurrected a stale MISSED row. The run id
  // (UI_REVIEW_RUN, stamped by run-review.sh) says which sweep an entry belongs to; file time only
  // breaks ties and orders manifests from before 2026-08-27, which carry no run id (-1).
  // Nothing is discarded: a surface only an older sweep captured stays listed — dropping
  // everything but the newest run would silently erase the surfaces of a shard that crashed.
  const files = readdirSync(d).filter(f => /^manifest.*\.json$/.test(f));
  const entries = files.flatMap(f => { const mtime = statSync(`${d}/${f}`).mtimeMs; return JSON.parse(readFileSync(`${d}/${f}`, 'utf8')).map(e => ({ e, run: /^\d+$/.test(String(e.run ?? '')) ? Number(e.run) : -1, mtime })); });
  entries.sort((a, b) => a.run - b.run || a.mtime - b.mtime);
  for (const { e } of entries) {
    const key = `${d.replace(/\/$/, '').split('/').pop()}/${e.name}`;
    const s = bySurface.get(key) ?? { themes: new Map() };
    s.themes.set(e.theme, e);   // later (by run id, then file time) wins
    bySurface.set(key, s);
  }
}
const themes = [...new Set([...bySurface.values()].flatMap(s => [...s.themes.keys()]))];
let covered = 0, partial = 0, missed = 0;
const rows = [];
for (const [name, s] of [...bySurface.entries()].sort()) {
  const ok = themes.filter(t => s.themes.get(t)?.verified);
  const bad = themes.filter(t => s.themes.has(t) && !s.themes.get(t).verified);
  const status = bad.length === 0 ? 'covered' : ok.length === 0 ? 'MISSED' : 'partial';
  if (status === 'covered') covered++; else if (status === 'partial') partial++; else missed++;
  const reasons = [...new Set(bad.map(t => (s.themes.get(t).reasons ?? []).join('; ').slice(0, 90)))].join(' / ');
  rows.push(`| ${name} | ${status} | ${ok.join(', ') || '—'} | ${bad.length ? bad.join(', ') + (reasons ? ' — ' + reasons.replace(/\|/g, '\\|') : '') : '—'} |`);
}
console.log(`# UI review coverage\n\n${covered} covered · ${partial} partial · ${missed} missed (of ${bySurface.size} planned surfaces; themes: ${themes.join(', ')})\n`);
console.log('| surface | status | verified in | not verified in — reason |\n|---|---|---|---|');
for (const r of rows) console.log(r);
