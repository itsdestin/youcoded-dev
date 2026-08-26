// Aggregate contrast probe results across manifests -> markdown table grouped by theme
import { readFileSync, existsSync } from 'node:fs';
const dirs = process.argv.slice(2);
const rows = [];
import { readdirSync } from 'node:fs';
for (const d of dirs) { if (!existsSync(d)) continue; for (const f of readdirSync(d).filter(f => /^manifest.*\.json$/.test(f))) for (const e of JSON.parse(readFileSync(`${d}/${f}`,'utf8'))) for (const f of (e.contrastFails ?? [])) rows.push({ theme: e.theme, surface: e.name, ...f }); }
// dedupe identical text+path+theme, keep list of surfaces
const key = r => `${r.theme}|${r.text}|${r.path}|${r.fg}|${r.bg}`;
const m = new Map();
for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, { ...r, surfaces: new Set() }); m.get(k).surfaces.add(r.surface); }
const list = [...m.values()].sort((a,b) => a.theme.localeCompare(b.theme) || a.ratio - b.ratio);
const byTheme = {};
for (const r of list) (byTheme[r.theme] ??= []).push(r);
for (const [t, rs] of Object.entries(byTheme)) {
  console.log(`\n## ${t} — ${rs.length} distinct failing text elements (${rs.filter(r=>r.ratio<3).length} below 3:1)`);
  console.log('| ratio | need | text | fg on bg | element | surfaces |\n|---|---|---|---|---|---|');
  for (const r of rs.slice(0, 60)) console.log(`| ${r.ratio} | ${r.need} | ${r.text.replace(/\|/g,'\\|').slice(0,40)} | ${r.fg} on ${r.bg} | ${r.path.replace(/\|/g,'\\|').slice(-70)} | ${[...r.surfaces].slice(0,4).join(', ')}${r.surfaces.size>4?' +'+(r.surfaces.size-4):''} |`);
}
