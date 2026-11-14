// Resolve the two leftover "missing parent" cases anywhere in ~/.claude/projects. Structure only.
import path from 'node:path'; import os from 'node:os'; import { execSync } from 'node:child_process'; import { linesOf } from './lines.mjs';
const root = path.join(os.homedir(), '.claude/projects');
const find = (fid) => execSync(`find ${root} -name '${fid}*.jsonl' -not -path '*/subagents/*'`).toString().trim();
const targets = new Map(); // uuid -> label
for (const [fid, ln, label] of [['24c3d97e', 3765, 'boundary logicalParent'], ['6c1bd6e6', 0, 'parentUuid'], ['c314c6e8', 0, 'parentUuid']]) {
  let n = 0; const seen = new Set(); const refs = [];
  for await (const l of linesOf(find(fid))) { n++; const m = /"uuid":"([0-9a-f-]{36})"/.exec(l); if (m && !(/^\{"parentUuid/.test(l) === false && false)) seen.add(m[1]);
    let o; try { o = JSON.parse(l); } catch { const pm = /"uuid":"([0-9a-f-]{36})"/.exec(l); continue; }
    if (fid === '24c3d97e' && n === ln) targets.set(o.logicalParentUuid, `${fid}:${ln} boundary.logicalParentUuid (preTokens ${o.compactMetadata?.preTokens})`);
    else if (fid !== '24c3d97e' && typeof o.parentUuid === 'string') refs.push([o.parentUuid, n]); }
  if (fid !== '24c3d97e') for (const [u, line] of refs) if (!seen.has(u)) targets.set(u, `${fid}:${line} parentUuid (target not even a raw "uuid" in same file)`);
}
console.log('targets', [...targets.values()]);
const all = execSync(`find ${root} -name '*.jsonl'`).toString().trim().split('\n'); const want = new Set(targets.keys()); const hits = [];
for (const p of all) for await (const l of linesOf(p)) { for (const u of want) if (l.includes(u)) hits.push([u.slice(0, 8), path.basename(p).slice(0, 12), p.includes('/subagents/') ? 'sub' : 'main', /"uuid":"/.test(l) && l.includes(`"uuid":"${u}"`) ? 'as-uuid' : 'as-reference']); }
console.log(JSON.stringify([...new Set(hits.map(h => h.join(' ')))]));
