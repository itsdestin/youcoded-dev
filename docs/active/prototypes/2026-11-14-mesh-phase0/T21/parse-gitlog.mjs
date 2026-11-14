// T21: turn `git log --raw` output (blobs added/modified under Conversations/) into one row per (path, blob).
// Usage: node parse-gitlog.mjs gitlog.txt out.json
import fs from 'node:fs'; import readline from 'node:readline';
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
let cur = null; const rows = new Map(); // path|blob -> {path, blob, dev, t(first=oldest), commits}
for await (const line of rl) {
  if (line.startsWith('C ')) { const m = line.match(/^C (\w+) YouCoded Sync \((.*)\) (\d+)$/); cur = m ? { c: m[1], dev: m[2], t: +m[3] } : { c: line.split(' ')[1], dev: '?', t: 0 }; continue; }
  const m = line.match(/^:\d+ \d+ \w+ (\w+) [AM]\t(.*)$/);
  if (!m || !cur) continue;
  const p = m[2]; if (!/^Conversations\/(claude|native)\/transcripts\/.*\.jsonl$/.test(p)) continue;
  const k = p + '|' + m[1]; const r = rows.get(k);
  if (!r) rows.set(k, { path: p, blob: m[1], dev: cur.dev, t: cur.t, n: 1 });
  else { r.n++; if (cur.t < r.t) { r.t = cur.t; r.dev = cur.dev; } }  // keep OLDEST introducing commit
}
fs.writeFileSync(process.argv[3], JSON.stringify([...rows.values()]));
console.log('rows', rows.size);
