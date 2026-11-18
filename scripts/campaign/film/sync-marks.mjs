// Collects every clip's <name>.marks.json (written by scripts/ui-review/record.mjs) into
// src/marks.json, so the edit cuts to named moments ("enter", "page") rather than
// hand-measured seconds — a re-shot clip re-times the film automatically.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const dir = join(homedir(), 'Videos/youcoded-campaign/footage');
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.marks.json'))) {
  const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const marks = {};
  for (const a of m.actions) if (a.mark) marks[a.mark] = { start: a.start, end: a.end };
  out[f.replace('.marks.json', '')] = { duration: m.duration, width: m.width, height: m.height, marks };
}
writeFileSync(new URL('./src/marks.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${Object.keys(v.marks).join(', ')}`).join('\n'));
