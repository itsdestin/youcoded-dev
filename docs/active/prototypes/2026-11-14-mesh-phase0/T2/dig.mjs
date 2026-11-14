// T2 follow-up scan over CC main transcripts: explains the anomalies static-scan counted.
// READ-ONLY. Prints structure only (line numbers, types, lengths), never text.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs'; import crypto from 'node:crypto';
import { classifyCC } from './reply-end.mjs';
const root = path.join(os.homedir(), '.claude/projects');
const mains = []; (function w(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) { if (e.name==='subagents') continue; w(p);} else if (e.name.endsWith('.jsonl')) mains.push(p);} })(root);
const A = { bad: [], dup: { n: 0, adjacent: 0, byTypePair: {}, far: 0, sameBytes: 0, filesDetail: {} }, boundary: [], parentAbs: [], afterEnd: {}, tsTypes: {}, tsTurnInv: { files: 0, lines: 0, max: 0 } };
const h = (s) => crypto.createHash('md5').update(s).digest('hex');
const absentTargets = new Map(); // uuid -> [file id, line]
for (const p of mains) {
  const fid = path.basename(p, '.jsonl').slice(0, 8); let ln = 0;
  const seen = new Map(); const bounds = []; const parents = []; let prevKind = null, prevStop = null, prevLn = 0, prevTs = 0, lastLineWasEnd = null;
  let maxTurnTs = -Infinity, turnInvInFile = 0;
  let totalLines = 0; const badHere = [];
    const lines = [];
  for await (const l of linesOf(p)) {
    ln++; if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { badHere.push({ ln, len: l.length, startsBrace: l[0] === '{', endsBrace: l[l.length - 1] === '}', fused: (l.match(/\}\{"/g) || []).length, trunc: l[0] === '{' && l[l.length - 1] !== '}' }); continue; }
    if (typeof o.uuid === 'string') {
      const d = seen.get(o.uuid);
      if (d) {
        A.dup.n++; if (ln - d.ln <= 3) A.dup.adjacent++; else A.dup.far++;
        const k = d.type + '->' + o.type; A.dup.byTypePair[k] = (A.dup.byTypePair[k] || 0) + 1;
        if (d.h === h(l)) A.dup.sameBytes++;
        const f = (A.dup.filesDetail[fid] ||= { n: 0, minGap: 1e12, maxGap: 0, types: {}, diffStop: 0 });
        f.n++; f.minGap = Math.min(f.minGap, ln - d.ln); f.maxGap = Math.max(f.maxGap, ln - d.ln); f.types[o.type] = (f.types[o.type] || 0) + 1;
        if (o.type === 'assistant' && d.stop !== (o.message?.stop_reason ?? null)) f.diffStop++;
      } else seen.set(o.uuid, { ln, type: o.type, h: h(l), stop: o.message?.stop_reason ?? null });
    }
    if (typeof o.parentUuid === 'string') parents.push([o.parentUuid, ln, o.type]);
    if (o.type === 'system' && o.subtype === 'compact_boundary') bounds.push([ln, o.logicalParentUuid, o.compactMetadata ? Object.keys(o.compactMetadata).join(',') : '']);
    // timestamp inversions, split by type; and for turn lines only
    const ts = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      const isTurn = o.type === 'user' || o.type === 'assistant';
      if (isTurn) { if (ts < maxTurnTs) { turnInvInFile++; A.tsTurnInv.lines++; A.tsTurnInv.max = Math.max(A.tsTurnInv.max, maxTurnTs - ts); } else maxTurnTs = ts; }
      if (ts < prevTs) A.tsTypes[o.type + (o.subtype ? ':' + o.subtype : '')] = (A.tsTypes[o.type + (o.subtype ? ':' + o.subtype : '')] || 0) + 1;
      if (ts > prevTs) prevTs = ts; // track max of all
    }
    // reply end followed by continuation
    const c = classifyCC(o);
    if (c.kind !== 'other' && c.kind !== 'meta') {
      if (prevKind === 'reply-end' && ['assistant-partial', 'tool-use', 'tool-result'].includes(c.kind)) {
        const key = `${prevStop} then ${c.kind}` + (lines.length ? '' : ''); const e = (A.afterEnd[key] ||= { n: 0, files: new Set(), sameUuidAsEnd: 0, gapLines: [] });
        e.n++; e.files.add(fid); if (o.uuid === lines.endUuid) e.sameUuidAsEnd++; e.gapLines.push(ln - prevLn);
      }
      prevKind = c.kind === 'interrupt' ? 'reply-end' : c.kind; prevStop = c.kind === 'reply-end' ? c.stop + (c.synthetic ? '+syn' : '') : (c.kind === 'interrupt' ? 'interrupt' : prevStop); prevLn = ln;
      if (prevKind === 'reply-end') lines.endUuid = o.uuid;
    }
  }
  for (const [lnb, par, keys] of bounds) { const s = seen.get(par); A.boundary.push({ fid, ln: lnb, parentLn: s ? s.ln : null, parentType: s?.type ?? null, keys }); }
  for (const [par, lnp, t] of parents) if (!seen.has(par)) { A.parentAbs.push({ fid, ln: lnp, t }); absentTargets.set(par, fid); }
  if (badHere.length) A.bad.push({ fid, total: ln, bad: badHere.slice(0, 8), n: badHere.length });
  if (turnInvInFile) A.tsTurnInv.files++;
}
// where do the absent parent targets live? look in ALL cc files (incl. subagents) with a regex on the uuid field
let foundElsewhere = 0; const all = []; (function w(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) w(p); else if (e.name.endsWith('.jsonl')) all.push(p);} })(root);
const want = new Set(absentTargets.keys()); const found = new Map();
if (want.size) for (const p of all) { for await (const l of linesOf(p)) { const m = /"uuid":"([0-9a-f-]{36})"/.exec(l); if (m && want.has(m[1]) && !found.has(m[1])) found.set(m[1], path.basename(p, '.jsonl').slice(0, 8) + (p.includes('/subagents/') ? ' (sub)' : '')); } }
const ser = (o) => JSON.stringify(o, (k, v) => v instanceof Set ? [...v].length : v);
console.log('bad lines', JSON.stringify(A.bad));
console.log('dup', ser({ n: A.dup.n, adjacent: A.dup.adjacent, far: A.dup.far, sameBytes: A.dup.sameBytes, byTypePair: A.dup.byTypePair, filesDetail: A.dup.filesDetail }));
console.log('boundaries total', A.boundary.length, 'parent missing', A.boundary.filter(b => b.parentLn === null).length, 'parent after boundary', A.boundary.filter(b => b.parentLn !== null && b.parentLn > b.ln).length);
console.log('boundary odd cases', ser(A.boundary.filter(b => b.parentLn === null || b.parentLn > b.ln)));
console.log('metadata keys seen', [...new Set(A.boundary.map(b => b.keys))]);
console.log('parentUuid absent', ser(A.parentAbs), 'targets', want.size, 'found in another file', found.size, [...found.values()].slice(0, 20));
console.log('after-end continuation', ser(Object.fromEntries(Object.entries(A.afterEnd).map(([k, v]) => [k, { n: v.n, files: v.files.size, sameUuidAsEnd: v.sameUuidAsEnd, gapLinesMin: Math.min(...v.gapLines), gapLinesMax: Math.max(...v.gapLines) }]))));
console.log('ts inversions by line type', ser(A.tsTypes), 'turn-lines only', ser(A.tsTurnInv));
