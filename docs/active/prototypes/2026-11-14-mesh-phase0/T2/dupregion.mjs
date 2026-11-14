// For files with duplicated uuids: where do the second occurrences sit relative to compact_boundary lines? Structure only.
import path from 'node:path'; import os from 'node:os'; import { execSync } from 'node:child_process'; import { linesOf } from './lines.mjs';
const root = path.join(os.homedir(), '.claude/projects');
for (const fid of ['cd92d617','4b342b9f','7dda2f77','5ef9d562','4470af12','69af054f','755b2e35','d64daa50','2bdba310','fb4c5ef0','c314c6e8']) {
  const p = execSync(`find ${root} -name '${fid}*.jsonl' -not -path '*/subagents/*'`).toString().trim();
  const first = new Map(); const dups = []; const bounds = []; let ln = 0, prevDupLn = -9, clusters = [], cur = null; const keyDiff = {};
  for await (const l of linesOf(p)) { ln++; let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type === 'system' && o.subtype === 'compact_boundary') bounds.push(ln);
    if (typeof o.uuid === 'string') { const f = first.get(o.uuid);
      if (f) { dups.push(ln); if (!cur || ln - cur.end > 40) { cur = { start: ln, end: ln, n: 0, srcStart: f.ln, srcEnd: f.ln }; clusters.push(cur); } cur.end = ln; cur.n++; cur.srcStart = Math.min(cur.srcStart, f.ln); cur.srcEnd = Math.max(cur.srcEnd, f.ln);
        // which top-level fields differ between first and second?
        const a = f.o; for (const k of new Set([...Object.keys(a), ...Object.keys(o)])) if (JSON.stringify(a[k]) !== JSON.stringify(o[k])) keyDiff[k] = (keyDiff[k] || 0) + 1; }
      else first.set(o.uuid, { ln, o: Object.assign({}, o, { message: undefined, attachment: undefined, content: undefined, toolUseResult: undefined }) }); } }
  console.log(fid, 'lines', ln, 'boundaries', bounds.join(','), '\n   dup clusters (second-copy lines start-end n | source range):', clusters.slice(0, 6).map(c => `${c.start}-${c.end} n${c.n} | src ${c.srcStart}-${c.srcEnd}`).join('; '), '\n   fields differing between copies', JSON.stringify(keyDiff));
}
