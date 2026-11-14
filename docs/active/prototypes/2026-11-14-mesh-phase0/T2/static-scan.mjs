// T2(a)+(d) static scan. READ-ONLY over ~/.claude/projects and ~/.youcoded/sessions.
// usage: node static-scan.mjs <outDir>      (writes per-file records + aggregate JSON; never chat text)
// Orchestrator forks 4 workers; each streams its shard line by line.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { linesOf } from './lines.mjs';
import { fork } from 'node:child_process';
import { classifyCC } from './reply-end.mjs';

const ROOTS = [
  { kind: 'cc', dir: path.join(os.homedir(), '.claude/projects') },
  { kind: 'native', dir: path.join(os.homedir(), '.youcoded/sessions') },
];
function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

if (process.argv[2] === '--worker') {
  const [, , , listFile, outFile] = process.argv;
  const files = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const out = fs.openSync(outFile, 'w');
  for (const f of files) {
    // WHY try/catch: other sessions create and delete throwaway transcripts while we scan
    let rec; try { rec = await scanFile(f); } catch (e) { rec = { kind: 'vanished', id: path.basename(f.p).slice(0, 8), err: e.code || String(e) }; }
    fs.writeSync(out, JSON.stringify(rec) + '\n');
  }
  fs.closeSync(out);
  process.exit(0);
}

async function scanFile({ kind, p }) {
  const isSub = kind === 'cc' && p.includes('/subagents/');
  const fileId = path.basename(p, '.jsonl');
  const r = {
    id: fileId.slice(0, 8), kind: kind === 'cc' ? (isSub ? 'cc-sub' : 'cc-main') : 'native',
    bytes: fs.statSync(p).size, lines: 0, bad: 0, empty: 0, crlf: 0, noTrailingNewline: false,
    firstType: null, firstSessionMismatch: false, firstIsSummary: false, otherSessionIds: 0, linesOtherSession: 0,
    uuidLines: 0, dupUuids: 0, dupSameLen: 0, dupDiffLen: 0, dupByType: {},
    tsInversions: 0, tsMaxInvMs: 0, tsInvOver1s: 0, tsInvOver60s: 0, tsInvLinesWithUuid: 0,
    parentRefs: 0, parentAbsent: 0, absentTargets: [], parentAbsentFirst50: 0,
    compactBoundaries: 0, compactSummaries: 0, boundaryParentPresentBefore: 0, boundaryParentAbsent: 0, boundaryParentLater: 0, boundaryNoParent: 0,
    contextClear: 0, nativeCompactSummary: 0, dropPart: 0, sidechainLines: 0, forkedFrom: 0, leafUuidLines: 0, summaryTypeLines: 0,
    replyEnds: 0, assistantNoStop: 0, stopCounts: {}, apiErrorLines: 0, interrupts: 0, interruptWithPromptId: 0,
    endAfterEndTurnContinues: 0, // a reply end followed by more turn content with no new user prompt between
    end: 'empty', endDetail: '', lastTurnLineNo: 0, lastReplyEndNo: 0, trailingMetaAfterEnd: 0,
    queueOps: 0, queuedCommandAttachments: 0,
  };
  const uuidLine = new Map(); // uuid -> [lineNo, len]
  const parentRefs = []; // [uuid]
  const boundaryParents = []; // [lineNo, parent]
  let maxTs = -Infinity; let first = true; let lineNo = 0; let lastKind = null;
  const otherIds = new Set();
  let nativeLast = null;
    for await (const l of linesOf(p)) {
    lineNo++; r.lines++;
    if (l.length === 0) { r.empty++; continue; }
    if (l.includes('\u2028') || l.includes('\u2029')) r.lsLines = (r.lsLines || 0) + 1; // raw U+2028/9 inside the line (readline would have cut it)
    if (l.charCodeAt(l.length - 1) === 13) r.crlf++;
    let o; try { o = JSON.parse(l); } catch { r.bad++; continue; }
    if (first) {
      first = false; r.firstType = o.type ?? (o.v ? 'native-header' : '?');
      if (o.sessionId && o.sessionId !== fileId) r.firstSessionMismatch = true;
      if (o.type === 'summary') r.firstIsSummary = true;
    }
    if (o.type === 'summary') r.summaryTypeLines++;
    if (o.forkedFrom) r.forkedFrom++;
    if (o.leafUuid) r.leafUuidLines++;
    if (o.isSidechain) r.sidechainLines++;
    if (o.sessionId && o.sessionId !== fileId && kind === 'cc') { r.linesOtherSession++; otherIds.add(o.sessionId); }
    // timestamps (CC: ISO string; native: epoch ms number)
    const tsRaw = o.timestamp; let ts = NaN;
    if (typeof tsRaw === 'string') ts = Date.parse(tsRaw); else if (typeof tsRaw === 'number') ts = tsRaw;
    if (!Number.isNaN(ts)) {
      if (ts < maxTs) { const d = maxTs - ts; r.tsInversions++; if (d > r.tsMaxInvMs) r.tsMaxInvMs = d; if (d > 1000) r.tsInvOver1s++; if (d > 60000) r.tsInvOver60s++; if (o.uuid) r.tsInvLinesWithUuid++; }
      else maxTs = ts;
    }
    // uuids
    if (typeof o.uuid === 'string') {
      r.uuidLines++;
      const prev = uuidLine.get(o.uuid);
      if (prev) { r.dupUuids++; if (prev[1] === l.length) r.dupSameLen++; else r.dupDiffLen++; const k = (o.type ?? '?'); r.dupByType[k] = (r.dupByType[k] || 0) + 1; }
      else uuidLine.set(o.uuid, [lineNo, l.length]);
    }
    if (typeof o.parentUuid === 'string') { r.parentRefs++; parentRefs.push([o.parentUuid, lineNo]); }
    if (kind === 'cc') {
      if (o.type === 'system' && o.subtype === 'compact_boundary') {
        r.compactBoundaries++;
        if (typeof o.logicalParentUuid === 'string') boundaryParents.push([lineNo, o.logicalParentUuid]); else r.boundaryNoParent++;
      }
      if (o.isCompactSummary) r.compactSummaries++;
      if (o.type === 'queue-operation') r.queueOps++;
      if (o.type === 'attachment' && o.attachment?.type === 'queued_command') r.queuedCommandAttachments++;
      const c = classifyCC(o);
      if (c.kind !== 'other' && c.kind !== 'meta') {
        // turn-content line
        if (lastKind === 'reply-end' && (c.kind === 'assistant-partial' || c.kind === 'tool-use' || c.kind === 'tool-result')) r.endAfterEndTurnContinues++;
        lastKind = (c.kind === 'interrupt') ? 'reply-end' : c.kind;
        r.lastTurnLineNo = lineNo;
        if (c.kind === 'reply-end') {
          r.replyEnds++; r.stopCounts[c.stop] = (r.stopCounts[c.stop] || 0) + 1; r.lastReplyEndNo = lineNo;
          if (c.apiError || c.synthetic) r.apiErrorLines++;
          r.end = 'reply-end'; r.endDetail = c.stop + (c.apiError ? '+apiError' : '') + (c.synthetic ? '+synthetic' : '');
        } else if (c.kind === 'interrupt') {
          r.replyEnds++; r.interrupts++; r.lastReplyEndNo = lineNo; if (o.promptId) r.interruptWithPromptId++;
          r.end = 'reply-end'; r.endDetail = 'interrupt';
        } else {
          if (c.kind === 'assistant-partial') r.assistantNoStop++;
          r.end = 'mid-reply'; r.endDetail = c.kind;
        }
      } else if (c.kind === 'meta' || c.kind === 'other') {
        if (r.end === 'reply-end' && lineNo > r.lastTurnLineNo) r.trailingMetaAfterEnd++;
      }
    } else {
      // native
      if (o.type === 'context-clear') r.contextClear++;
      if (o.type === 'compact-summary') r.nativeCompactSummary++;
      if (o.type === 'assistant-thinking' && o.data?.dropPart) r.dropPart++;
      const t = o.type;
      const isEnd = t === 'turn-complete' || t === 'user-interrupt';
      const content = new Set(['user-message', 'assistant-text', 'assistant-thinking', 'tool-use', 'tool-result']);
      if (isEnd) { r.replyEnds++; r.lastReplyEndNo = lineNo; r.end = 'reply-end'; r.endDetail = t; r.lastTurnLineNo = lineNo; if (t === 'user-interrupt') r.interrupts++; }
      else if (content.has(t)) { r.end = 'mid-reply'; r.endDetail = t; r.lastTurnLineNo = lineNo; }
      nativeLast = t;
    }
  }
  // end-of-file: partial trailing line? (readline cannot tell; stat the last byte)
  if (r.bytes > 0) { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, r.bytes - 1); fs.closeSync(fd); r.noTrailingNewline = b[0] !== 0x0a; }
  r.otherSessionIds = otherIds.size;
  // parent chain: refs whose target uuid is not in this file
  const absent = new Set();
  for (const [u, ln] of parentRefs) if (!uuidLine.has(u)) { r.parentAbsent++; absent.add(u); if (ln <= 50) r.parentAbsentFirst50++; }
  r.absentTargets = [...absent].slice(0, 200);
  r.absentTargetCount = absent.size;
  for (const [ln, par] of boundaryParents) {
    const hit = uuidLine.get(par);
    if (!hit) r.boundaryParentAbsent++; else if (hit[0] < ln) r.boundaryParentPresentBefore++; else r.boundaryParentLater++;
  }
  return r;
}

// ---------------- orchestrator ----------------
const outDir = process.argv[2];
if (!outDir) { console.error('usage: node static-scan.mjs <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const all = [];
for (const root of ROOTS) if (fs.existsSync(root.dir)) for (const p of walk(root.dir)) all.push({ kind: root.kind, p });
// biggest first, dealt round-robin so shards balance
all.sort((a, b) => fs.statSync(b.p).size - fs.statSync(a.p).size);
const W = 4; const shards = Array.from({ length: W }, () => []);
all.forEach((f, i) => shards[i % W].push(f));
console.log(`files: ${all.length}`);
const t0 = Date.now();
await Promise.all(shards.map((s, i) => new Promise((res, rej) => {
  const lf = path.join(outDir, `shard${i}.list.json`); fs.writeFileSync(lf, JSON.stringify(s));
  const c = fork(new URL(import.meta.url).pathname, ['--worker', lf, path.join(outDir, `shard${i}.jsonl`)]);
  c.on('exit', (code) => (code === 0 ? res() : rej(new Error('worker ' + i + ' exit ' + code))));
})));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
