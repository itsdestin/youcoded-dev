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
  // Oldest first so a later re-run of a fixed shot supersedes the earlier miss.
  const files = readdirSync(d).filter(f => /^manifest.*\.json$/.test(f)).sort((a, b) => statSync(`${d}/${a}`).mtimeMs - statSync(`${d}/${b}`).mtimeMs);
  for (const f of files) {
    for (const e of JSON.parse(readFileSync(`${d}/${f}`, 'utf8'))) {
      const key = `${d.replace(/\/$/, '').split('/').pop()}/${e.name}`;
      const s = bySurface.get(key) ?? { themes: new Map() };
      // Later manifests win (a re-run of a fixed shot supersedes the miss).
      s.themes.set(e.theme, e);
      bySurface.set(key, s);
    }
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
