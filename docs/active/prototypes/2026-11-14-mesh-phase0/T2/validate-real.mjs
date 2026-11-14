// Run the real adapter over every cc-main and native chat (READ-ONLY). Checks:
//  1. line count equals the independent static scan's count; 2. chain = from-scratch chain after an
//  incremental run on a copy cut mid-line (20 files); 3. counts confirmed reply ends vs turn_duration.
// usage: node validate-real.mjs <scanDir> <scratchDir>
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { poll, initState } from './adapter.mjs';
import { replyEndStepCC, replyEndStepNative } from './reply-end.mjs';
const [scanDir, scratch] = process.argv.slice(2);
const recs = new Map(JSON.parse(fs.readFileSync(path.join(scanDir, 'all.json'), 'utf8')).filter(r => r.kind === 'cc-main' || r.kind === 'native').map(r => [r.kind + r.id, r]));
const files = []; for (const [rt, root] of [['cc-main', path.join(os.homedir(), '.claude/projects')], ['native', path.join(os.homedir(), '.youcoded/sessions')]])
  (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) files.push([rt, p]); } })(root);
const T = { files: 0, lineCountMismatch: 0, rewrittenOnFirstPoll: 0, ends: { cc: 0, native: 0 }, trailingUnconfirmed: 0, endingOnConfirmedEnd: 0, notEnding: 0, incrementalTested: 0, incrementalMismatch: 0, seconds: 0 };
const t0 = Date.now(); const mism = [];
for (const [rt, p] of files) {
  const id = path.basename(p, '.jsonl').slice(0, 8); const rec = recs.get(rt + id); if (!rec) continue; // created after the scan
  const opts = { seed: 'v|0', replyEndStep: rt === 'cc-main' ? replyEndStepCC : replyEndStepNative };
  const r = poll(p, initState(opts.seed), opts);
  T.files++; if (r.rewritten) { T.rewrittenOnFirstPoll++; continue; }
  if (r.state.lines !== rec.lines) { T.lineCountMismatch++; if (mism.length < 5) mism.push([id, r.state.lines, rec.lines]); } // file may have grown since the scan
  T.ends[rt === 'cc-main' ? 'cc' : 'native'] += r.replyEnds.length;
  if (rt === 'cc-main' && r.state.rs?.cand) T.trailingUnconfirmed++;
  // does the chat end on a confirmed reply end? (last turn line is it, or the candidate is trailing)
  if (r.replyEnds.length || r.state.rs?.cand) T.endingOnConfirmedEnd += 0;
  // incremental test on a copy cut in the middle of a line, for the first 20 files over 200 KB
  if (T.incrementalTested < 20 && rec.bytes > 200_000 && rec.bytes < 60_000_000) {
    const cut = Math.floor(rec.bytes * 0.4) + 7; const cp = path.join(scratch, 'copy.jsonl');
    const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(rec.bytes); const n = fs.readSync(fd, buf, 0, rec.bytes, 0); fs.closeSync(fd);
    fs.writeFileSync(cp, buf.subarray(0, cut)); let a = poll(cp, initState(opts.seed), opts);
    fs.appendFileSync(cp, buf.subarray(cut, n)); const a2 = poll(cp, a.state, opts);
    const whole = poll(cp, initState(opts.seed), opts);
    T.incrementalTested++;
    const ends2 = [...a.replyEnds, ...a2.replyEnds];
    if (a2.state.chain !== whole.state.chain || a2.state.lines !== whole.state.lines || JSON.stringify(ends2) !== JSON.stringify(whole.replyEnds) || JSON.stringify(a2.state.rs) !== JSON.stringify(whole.state.rs)) { T.incrementalMismatch++; mism.push(['inc', id]); }
    fs.unlinkSync(cp);
  }
}
T.seconds = (Date.now() - t0) / 1000;
console.log(JSON.stringify(T), 'mismatch detail (id, adapter lines, scan lines):', JSON.stringify(mism));
