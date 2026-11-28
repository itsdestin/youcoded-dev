#!/usr/bin/env node
// aggregate.mjs — rolls file-level edges up to parts, then to (system x layer) cells, and writes
// scratch/command-center/grid.json. With --audit it instead scores the "doubtful" parts' placement.
// WHY: the command-center grid needs one honest picture of what connects to what, computed from data
// (edges.json + parts.rules.json), so flags such as "no tests" or "hidden coupling" are never hand-written.
// Usage: node scripts/command-center/aggregate.mjs [--audit]   (run from anywhere)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const app = path.join(root, 'youcoded');
const scratch = path.join(root, 'scratch/command-center');
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'parts.rules.json'), 'utf8'));
const edgesDoc = JSON.parse(fs.readFileSync(path.join(scratch, 'edges.json'), 'utf8'));
const placed = JSON.parse(execFileSync('node', [path.join(here, 'parts-check.mjs'), '--json'], { cwd: root, maxBuffer: 1 << 28 }).toString());

export const SYSTEMS = ['chat-agents', 'pages', 'marketplace', 'social', 'projects-files', 'sync-devices', 'foundations', 'workshop'];
export const LAYERS = ['screens', 'shared', 'backend', 'android', 'devtools'];

const fileMap = new Map(); // path -> {part, system, layer, lines}
for (const f of placed.files) fileMap.set(f.path, f);
const partInfo = (p) => cfg.parts[p] || {};
const sysOf = (part) => partInfo(part).system;

// Pair-keyed accumulator helper
const bump = (m, key, type, w) => { const o = m.get(key) || { byType: {}, total: 0 }; o.byType[type] = (o.byType[type] || 0) + w; o.total += w; m.set(key, o); };

// ---- edges -> part level (directional) -------------------------------------------------
const partDir = new Map(); // "A\tB" -> {byType,total}  (self + test + doc excluded)
const testTouch = new Map(); // part -> test-edge count
const rawExt = []; // {a, b, type, w} between different parts, any type except doc (audit uses it)
for (const e of edgesDoc.edges) {
  if (e.type === 'doc') continue;
  const a = fileMap.get(e.from), b = fileMap.get(e.to);
  if (e.type === 'test') {
    for (const f of [a, b]) if (f) testTouch.set(f.part, (testTouch.get(f.part) || 0) + 1);
    continue;
  }
  if (!a || !b || a.part === b.part) continue;
  const type = e.type === 'android-channel' ? 'channel' : e.type; // same request-name idea; keep one colour
  bump(partDir, a.part + '\t' + b.part, type, e.weight || 1);
  rawExt.push({ a: a.part, b: b.part, type, w: e.weight || 1 });
}

if (process.argv.includes('--audit')) { audit(); process.exit(0); }

// ---- cells ------------------------------------------------------------------------------
const cells = {};
for (const s of SYSTEMS) for (const l of LAYERS) cells[`${s}/${l}`] = { parts: [], files: 0, lines: 0 };
const partTotals = {};
for (const f of placed.files) {
  const t = (partTotals[f.part] ||= { files: 0, lines: 0 });
  t.files++; t.lines += f.lines || 0;
}
for (const [part, t] of Object.entries(partTotals)) {
  const info = partInfo(part);
  // A part may span layers (e.g. renderer + main); place one entry per (system, layer) it has files in.
  const byLayer = {};
  for (const f of placed.files) if (f.part === part) { const o = (byLayer[f.layer] ||= { files: 0, lines: 0 }); o.files++; o.lines += f.lines || 0; }
  for (const [layer, o] of Object.entries(byLayer)) {
    const c = cells[`${info.system}/${layer}`] ||= { parts: [], files: 0, lines: 0 };
    // WHY also: a part may serve a second system (GitHub sign-in: sync AND marketplace); the
    // map draws it in both places instead of forcing one column (Destin, 2026-10-08).
    c.parts.push({ part, files: o.files, lines: o.lines, purpose: info.purpose || '', also: info.also || [], alsoWhy: info.alsoWhy || '' });
    c.files += o.files; c.lines += o.lines;
  }
}
for (const c of Object.values(cells)) c.parts.sort((x, y) => y.lines - x.lines);

// The cell a part-edge endpoint lands in: use the part's dominant layer.
const domLayer = {};
for (const [part] of Object.entries(partTotals)) {
  const cnt = {}; for (const f of placed.files) if (f.part === part) cnt[f.layer] = (cnt[f.layer] || 0) + (f.lines || 1);
  domLayer[part] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
}
const cellOf = (part) => `${sysOf(part)}/${domLayer[part]}`;

const partEdges = [...partDir].map(([k, v]) => { const [from, to] = k.split('\t'); return { from, to, byType: v.byType, total: v.total }; })
  .sort((a, b) => b.total - a.total);
const cellDir = new Map();
for (const e of partEdges) {
  const ca = cellOf(e.from), cb = cellOf(e.to);
  if (ca === cb) continue;
  for (const [t, w] of Object.entries(e.byType)) bump(cellDir, ca + '\t' + cb, t, w);
}
// Undirected cell pairs for display and the hot-seam test.
const cellUnd = new Map();
for (const [k, v] of cellDir) {
  const [a, b] = k.split('\t'); const key = a < b ? a + '\t' + b : b + '\t' + a;
  for (const [t, w] of Object.entries(v.byType)) bump(cellUnd, key, t, w);
}
const cellEdges = [...cellUnd].map(([k, v]) => { const [from, to] = k.split('\t'); return { from, to, byType: v.byType, total: v.total }; })
  .sort((a, b) => b.total - a.total);

// ---- branches ---------------------------------------------------------------------------
const git = (...a) => execFileSync('git', ['-C', app, ...a], { maxBuffer: 1 << 28 }).toString().trim();
const refs = new Map();
for (const r of git('for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin').split('\n')) {
  const name = r.replace(/^refs\/(heads|remotes\/origin)\//, '');
  if (!name || name === 'HEAD' || name === 'master' || name.startsWith('backup/') || name.startsWith('dependabot/')) continue;
  if (!refs.has(name) || r.startsWith('refs/remotes')) refs.set(name, r); // prefer the pushed copy
}
const branches = [];
for (const [name, ref] of refs) {
  let ahead = 0; try { ahead = +git('rev-list', '--count', `origin/master..${ref}`); } catch { continue; }
  if (!ahead) continue;
  let files = []; try { files = git('diff', '--name-only', `origin/master...${ref}`).split('\n').filter(Boolean); } catch { continue; }
  const pt = {}; let unmapped = 0;
  for (const f of files) { const m = fileMap.get(f); if (m) pt[m.part] = (pt[m.part] || 0) + 1; else unmapped++; }
  const partsTouched = Object.entries(pt).map(([part, n]) => ({ part, files: n })).sort((a, b) => b.files - a.files);
  const cs = [...new Set(partsTouched.map((p) => cellOf(p.part)))];
  branches.push({ branch: name, ahead, lastCommit: git('log', '-1', '--format=%cs', ref), commitTime: +git('log', '-1', '--format=%ct', ref), partsTouched, cells: cs, filesChanged: files.length, unmappedFiles: unmapped, _files: files });
}
branches.sort((a, b) => b.commitTime - a.commitTime);
// WHY: stacked or competing attempts at one piece of work (the perf-* branches) carry near-identical
// changes; counting each as a separate branch overstates collisions. Group by file-set overlap (Jaccard >= 0.8).
const jac = (x, y) => { const A = new Set(x), B = new Set(y); let i = 0; for (const f of A) if (B.has(f)) i++; const u = A.size + B.size - i; return u ? i / u : 0; };
const uf = branches.map((_, i) => i); const find = (i) => (uf[i] === i ? i : (uf[i] = find(uf[i])));
for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) {
  if (branches[i]._files.length && branches[j]._files.length && jac(branches[i]._files, branches[j]._files) >= 0.8) uf[find(j)] = find(i);
}
const gmap = new Map(); branches.forEach((b, i) => { const r = find(i); (gmap.get(r) || gmap.set(r, []).get(r)).push(b); });
const groups = [...gmap.values()].map((ms) => {
  ms.sort((a, b) => b.commitTime - a.commitTime); // newest first names the group
  const files = [...new Set(ms.flatMap((m) => m._files))];
  const pt = {}; let unm = 0;
  for (const f of files) { const m = fileMap.get(f); if (m) pt[m.part] = (pt[m.part] || 0) + 1; else unm++; }
  const partsTouched = Object.entries(pt).map(([part, n]) => ({ part, files: n })).sort((a, b) => b.files - a.files);
  return { branch: ms[0].branch, members: ms.map((m) => m.branch), memberCount: ms.length, ahead: Math.max(...ms.map((m) => m.ahead)), lastCommit: ms[0].lastCommit,
    partsTouched, cells: [...new Set(partsTouched.map((p) => cellOf(p.part)))], filesChanged: files.length, unmappedFiles: unm };
}).sort((a, b) => (a.lastCommit < b.lastCommit ? 1 : a.lastCommit > b.lastCommit ? -1 : b.ahead - a.ahead));
const branchesRaw = branches.map(({ _files, ...r }) => r);


// ---- flags ------------------------------------------------------------------------------
const flags = [];
for (const part of Object.keys(partTotals)) {
  if (partTotals[part].files > 0 && !testTouch.get(part)) flags.push({ kind: 'no-tests', part, evidence: `${partTotals[part].files} files, no test edges` });
}
const touchCount = {};
for (const b of groups) for (const p of b.partsTouched) (touchCount[p.part] ||= []).push(b.branch);
for (const [part, bs] of Object.entries(touchCount)) if (bs.length >= 3) flags.push({ kind: 'collision', part, evidence: `${bs.length} in-flight efforts: ${bs.slice(0, 6).join(', ')}${bs.length > 6 ? ', ...' : ''}` });
const imp = (a, b) => partDir.get(a + '\t' + b)?.byType.import || 0;
for (const [k] of partDir) {
  const [a, b] = k.split('\t'); if (a >= b) continue;
  if (imp(a, b) >= 5 && imp(b, a) >= 5) flags.push({ kind: 'cycle', part: `${a} <-> ${b}`, evidence: `${a}->${b} ${imp(a, b)} imports, ${b}->${a} ${imp(b, a)} imports` });
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const cellMedian = med(cellEdges.map((e) => e.total));
// Top 12 seams over 3x the median, each with its dominant connection type.
const hotSeams = cellEdges.filter((e) => e.total > 3 * cellMedian).slice(0, 12)
  .map((e) => ({ from: e.from, to: e.to, total: e.total, dominant: Object.entries(e.byType).sort((a, b) => b[1] - a[1])[0][0], byType: e.byType }));
for (const e of hotSeams) flags.push({ kind: 'hot-seam', seam: `${e.from} <-> ${e.to}`, evidence: `weight ${e.total} vs median ${cellMedian}; mostly ${e.dominant}` });
const und = new Map();
for (const e of partEdges) { const key = e.from < e.to ? e.from + '\t' + e.to : e.to + '\t' + e.from; for (const [t, w] of Object.entries(e.byType)) bump(und, key, t, w); }
for (const [k, v] of und) {
  const c = v.byType.cochange || 0; const hard = (v.byType.import || 0) + (v.byType.channel || 0) + (v.byType.event || 0);
  const [a, b] = k.split('\t');
  if (c >= 10 && !hard) flags.push({ kind: 'hidden-coupling', seam: `${a} <-> ${b}`, evidence: `${c} shared edits, no import/channel/event link` });
}

const out = {
  generatedAt: new Date().toISOString(), commit: edgesDoc.commit, systems: SYSTEMS, layers: LAYERS,
  cells, partEdges, cellEdges, cellMedian, hotSeams, branches: groups, branchesRaw, flags,
};
fs.writeFileSync(path.join(scratch, 'grid.json'), JSON.stringify(out));
const kinds = {}; for (const f of flags) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
console.log('grid.json written:', Object.keys(cells).length, 'cells,', partEdges.length, 'part edges,', cellEdges.length, 'cell pairs,', groups.length, 'groups from', branches.length, 'branches, flags', JSON.stringify(kinds));

// ---- placement audit ---------------------------------------------------------------------
function audit() {
  const md = fs.readFileSync(path.join(root, 'docs/active/investigations/2026-10-08-parts-placement.md'), 'utf8');
  const doubtful = [...new Set([...md.matchAll(/^### \d+\. (\S+) \(now:/gm)].map((m) => m[1]))].filter((p) => cfg.parts[p]);
  const res = [];
  for (const p of doubtful) {
    const by = {}; let totalAll = 0;
    for (const e of rawExt) {
      if (!['import', 'channel', 'event', 'cochange'].includes(e.type)) continue;
      let other = null; if (e.a === p) other = e.b; else if (e.b === p) other = e.a; else continue;
      const s = sysOf(other); if (!s) continue; by[s] = (by[s] || 0) + e.w; totalAll += e.w;
    }
    const nonF = totalAll - (by.foundations || 0);
    const pct = (s, d) => (d ? Math.round((100 * (by[s] || 0)) / d) : 0);
    const rankNo = Object.keys(by).filter((s) => s !== 'foundations').sort((x, y) => by[y] - by[x]);
    const rankAll = Object.keys(by).sort((x, y) => by[y] - by[x]);
    const own = sysOf(p);
    const ownPct = pct(own, nonF);
    let decision, target = null, tp = 0;
    // WHY the foundations clause: chat-agents holds roughly half the code, so shared infrastructure
    // always "points at" chat; moving app-shell or the bridge into chat would be wrong. A part already
    // in foundations therefore stays unless the evidence is overwhelming and non-trivial (>=80% of >=15).
    let note = '';
    const top = rankNo[0], second = rankNo[1];
    const topPct = pct(top, nonF), secPct = second ? pct(second, nonF) : 0;
    if (!totalAll || nonF === 0) { decision = 'settled'; note = 'no connections found'; }
    else if (rankAll[0] === 'foundations' && (by.foundations / totalAll) >= 0.5) { decision = 'settled'; note = 'mostly leans on foundations'; }
    else if (own === 'foundations') {
      if (topPct >= 80 && nonF >= 15) { decision = 'move'; target = top; tp = topPct; }
      else { decision = 'settled'; note = topPct >= 60 ? `kept in foundations (infrastructure; leans ${top} ${topPct}%)` : 'foundations part shared by several systems'; }
    }
    else if (top === own && topPct >= 60) decision = 'settled';
    else if (top === own && topPct - secPct >= 15) { decision = 'settled'; note = 'own system is the largest by 15+ points (under 60%)'; }
    else if (topPct >= 60) { decision = 'move'; target = top; tp = topPct; }
    else decision = 'owner';
    res.push({ part: p, system: own, files: partTotals0(p), totalAll, nonFoundations: nonF, foundationsPct: pct('foundations', totalAll),
      top2NoF: rankNo.slice(0, 2).map((s) => ({ system: s, pct: pct(s, nonF) })),
      top2All: rankAll.slice(0, 2).map((s) => ({ system: s, pct: pct(s, totalAll) })), ownPct, decision, note, target, targetPct: tp });
  }
  fs.writeFileSync(path.join(scratch, 'audit.json'), JSON.stringify(res, null, 1));
  const c = {}; for (const r of res) c[r.decision] = (c[r.decision] || 0) + 1;
  console.log('audit.json written', JSON.stringify(c), 'of', res.length);
  function partTotals0(p) { return placed.files.filter((f) => f.part === p).length; }
}
