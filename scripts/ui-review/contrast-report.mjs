// Aggregate contrast probe results across manifests -> markdown table grouped by theme
import { readFileSync, existsSync } from 'node:fs';
const dirs = process.argv.slice(2);
const rows = [];
// WHY these counters: an EMPTY contrast.md used to mean two opposite things —
// "every surface was checked and passed" and "no surface was ever checked".
// A plan that sets `probe: false` on its shots (several do, and the value gets
// copied when a new plan is started from an old one) produces the second while
// looking exactly like the first. On 2026-09-05 that cost a session four extra
// six-theme sweeps and two hand-rolled pixel scripts to measure a text-contrast
// failure this report exists to hand over for free. Silence is never a verdict.
let probed = 0;
const skipped = { unverified: 0, notProbed: new Set() };
import { readdirSync, statSync } from 'node:fs';
// NEWEST MANIFEST WINS, per (dir, theme, surface).
//
// WHY: an output directory ACCUMULATES manifests across runs — re-shooting one
// plan leaves the previous run's manifest beside the new one. Without this the
// report unioned every run it could find and listed failures that had already
// been fixed. Measured 2026-08-31: the chess board's coordinate labels were
// lifted from fg-faint to fg-muted, the pixels proved it, and contrast.md went
// on reporting the OLD colour from a manifest 5 minutes older — which reads as
// "your fix did not work". The deck's crop resolver already picks the newest
// entry (deck/crops.py, newest_manifest_entry); this had no such filter.
for (const d of dirs) {
  if (!existsSync(d)) continue;
  const latest = new Map();   // `${theme}|${name}` -> { mtime, entry }
  const files = readdirSync(d).filter(f => /^manifest.*\.json$/.test(f));
  for (const f of files) {
    const mtime = statSync(`${d}/${f}`).mtimeMs;
    for (const e of JSON.parse(readFileSync(`${d}/${f}`, 'utf8'))) {
      const k = `${e.theme}|${e.name}`;
      const prev = latest.get(k);
      if (!prev || mtime > prev.mtime) latest.set(k, { mtime, entry: e });
    }
  }
  for (const { entry: e } of latest.values()) {
    // A shot with `probe: false` in its plan carries no contrastFails at all
    // (shot.mjs:240). Count the two cases apart — see the header below.
    if (e.verified === false) skipped.unverified++;
    else if (e.contrastFails === undefined) skipped.notProbed.add(d.replace(/.*shots-/, ''));
    else probed++;
    for (const f of (e.contrastFails ?? [])) rows.push({ theme: e.theme, surface: e.name, ...f });
  }
}
// dedupe identical text+path+theme, keep list of surfaces
const key = r => `${r.theme}|${r.text}|${r.path}|${r.fg}|${r.bg}`;
const m = new Map();
for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, { ...r, surfaces: new Set() }); m.get(k).surfaces.add(r.surface); }
const list = [...m.values()].sort((a,b) => a.theme.localeCompare(b.theme) || a.ratio - b.ratio);
const byTheme = {};
for (const r of list) (byTheme[r.theme] ??= []).push(r);

console.log('# Painted-pixel contrast');
if (probed === 0) {
  console.log(`\n**NOTHING WAS CHECKED.** 0 surfaces probed — this report is empty because the`
    + ` probe did not run, NOT because the colours passed.`);
} else {
  console.log(`\n${probed} surface/theme shot(s) probed · ${list.length} distinct failing text element(s).`);
}
if (skipped.notProbed.size) {
  console.log(`\nNot probed (their plan sets \`probe: false\`): ${[...skipped.notProbed].sort().join(', ')}.`
    + ` Drop that key from the plan to have those surfaces checked.`);
}
if (skipped.unverified) console.log(`\n${skipped.unverified} shot(s) skipped — capture was unverified (see coverage.md).`);
for (const [t, rs] of Object.entries(byTheme)) {
  console.log(`\n## ${t} — ${rs.length} distinct failing text elements (${rs.filter(r=>r.ratio<3).length} below 3:1)`);
  console.log('| ratio | need | text | fg on bg | element | surfaces |\n|---|---|---|---|---|---|');
  for (const r of rs.slice(0, 60)) console.log(`| ${r.ratio} | ${r.need} | ${r.text.replace(/\|/g,'\\|').slice(0,40)} | ${r.fg} on ${r.bg} | ${r.path.replace(/\|/g,'\\|').slice(-70)} | ${[...r.surfaces].slice(0,4).join(', ')}${r.surfaces.size>4?' +'+(r.surfaces.size-4):''} |`);
}
