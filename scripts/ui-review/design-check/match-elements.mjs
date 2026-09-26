// Matches design-check warnings to the ELEMENTS they style in a screenshot sweep, and
// reports, per shot, which warnings are visible where. Used to pick and crop deck slides.
//   node match-elements.mjs <runDir> <items.json> <checkoutRoot> <theme> [fixes-log.json]
// A warning names one class on one source line; that class alone is ambiguous (px-2 is
// everywhere), so an element matches only if it carries EVERY static class of the class
// string the flagged class sits in on that line.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [runDir, dataPath, root, theme = 'meadow-mist', fixesPath] = process.argv.slice(2);
const { items } = JSON.parse(readFileSync(dataPath, 'utf8'));
const fixes = fixesPath ? JSON.parse(readFileSync(fixesPath, 'utf8')).applied : [];
const fixAt = new Map(fixes.map((f) => [`${f.file}:${f.line}:${f.from}`, f]));

const cache = new Map();
const lineOf = (file, line) => {
  if (!cache.has(file)) cache.set(file, readFileSync(join(root, 'desktop/src/renderer', file), 'utf8').split('\n'));
  return cache.get(file)[line - 1] ?? '';
};
function signature(file, line, cls) {
  const strings = [...lineOf(file, line).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  let best = null;
  for (const s of strings) {
    const toks = s.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean);
    if (!toks.includes(cls)) continue;
    if (!best || toks.length > best.length) best = toks;
  }
  return best ?? [cls];
}

const shots = [];
// A `shoot --collect` run: one manifest.json at the top; a screen name (`settings/sync`)
// stands where the old sweep's plan/shot pair stood.
if (existsSync(join(runDir, 'manifest.json'))) {
  for (const e of JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8')))
    if (e.theme === theme && e.ok && e.collectedEls) shots.push({ plan: e.name.split('/')[0], name: e.name, els: e.collectedEls.map((x) => ({ set: new Set(x.c.split(/\s+/)), r: x.r })) });
}
for (const d of readdirSync(runDir).filter((n) => n.startsWith('shots-'))) {
  const plan = d.slice(6); const seen = new Map();
  for (const mf of readdirSync(join(runDir, d)).filter((n) => n.startsWith('manifest-')).sort())
    for (const e of JSON.parse(readFileSync(join(runDir, d, mf), 'utf8'))) if (e.theme === theme) seen.set(e.name, e);
  for (const e of seen.values()) if (e.verified && e.collectedEls) shots.push({ plan, name: e.name, els: e.collectedEls.map((x) => ({ set: new Set(x.c.split(/\s+/)), r: x.r })) });
}

const DISTINCT = /\[|-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;
const out = [];
items.forEach(([rule, file, line, cls], idx) => {
  const sig = signature(file, line, cls);
  if (sig.length < 3 && !DISTINCT.test(cls)) return;
  for (const s of shots) {
    const m = s.els.filter((e) => sig.every((t) => e.set.has(t)));
    if (!m.length || m.length > 6) continue;
    const f = fixAt.get(`${file}:${line}:${cls}`);
    out.push({ shot: `${s.plan}/${s.name}`, rule, where: `${file}:${line}`, cls, to: f?.to ?? null, rects: m.map((e) => e.r) });
  }
});
console.log(JSON.stringify({ theme, shots: shots.length, hits: out }, null, 1));
