// Mirrors the override-merge step from wecoded-marketplace/scripts/sync.js
// without doing a full upstream re-sync. Use when sync.js can't run (e.g.
// GitHub rate limit) but you've edited overrides/*.json and want them
// reflected in index.json now. Re-run safe.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../wecoded-marketplace');
const OVERRIDES = path.join(ROOT, 'overrides');
const INDEX = path.join(ROOT, 'index.json');

const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
let merged = 0;
for (const f of fs.readdirSync(OVERRIDES)) {
  if (!f.endsWith('.json')) continue;
  const id = f.slice(0, -5);
  const ov = JSON.parse(fs.readFileSync(path.join(OVERRIDES, f), 'utf8'));
  const entry = idx.find(e => e.id === id);
  if (!entry) { console.warn(`SKIP ${id}: not in index`); continue; }
  Object.assign(entry, ov);
  merged++;
}
fs.writeFileSync(INDEX, JSON.stringify(idx, null, 2) + '\n', 'utf8');
console.log(`Merged ${merged} overrides into index.json`);
