// Turns `oxlint -c .oxlintrc.design.json -f json` output into the item list the other
// scripts use: [rule, file (relative to src/renderer), line, flagged class, message].
//   node gen-data.mjs <design.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [inPath, outPath] = process.argv.slice(2);
const d = JSON.parse(readFileSync(inPath, 'utf8')).diagnostics;
const items = d.map((x) => [
  x.code.replace(/^shadcn\((.*)\)$/, '$1'),
  x.filename.replace(/^src\/renderer\//, ''),
  x.labels[0].span.line,
  (x.message.match(/"([^"]+)"/) || [])[1] || '',
  x.message,
]);
writeFileSync(outPath, JSON.stringify({ items }));
const by = {}; for (const [r] of items) by[r] = (by[r] || 0) + 1;
console.log(items.length, JSON.stringify(by));
