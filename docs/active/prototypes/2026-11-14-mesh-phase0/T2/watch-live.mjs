// T2(b): observe live transcripts with the S1 adapter. READ-ONLY (opens files 'r' only).
// usage: node watch-live.mjs <minutes> <logFile>
// Every pollMs: poll each tracked file (cheap check). Every scrubMs: full re-hash scrub of each
// tracked file (catches the one thing the cheap check cannot: a same-size edit mid-file).
// Logs one JSON line per EVENT (rewritten / scrub-fail / new / vanished) and a summary at the end.
// Never logs chat text: only ids (8 chars), sizes, line counts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { poll, initState, scrub } from './adapter.mjs';
import { isReplyEndCC, isReplyEndNative } from './reply-end.mjs';

const minutes = Number(process.argv[2] || 22);
const logFile = process.argv[3];
const pollMs = 2000, discoverMs = 15000, scrubMs = 180000, activeWindowMs = 10 * 60 * 1000;
const roots = [
  { rt: 'cc', dir: path.join(os.homedir(), '.claude/projects'), isReplyEnd: isReplyEndCC },
  { rt: 'native', dir: path.join(os.homedir(), '.youcoded/sessions'), isReplyEnd: isReplyEndNative },
];
const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
function* walk(d) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else if (e.name.endsWith('.jsonl')) yield p; }
}
const tracked = new Map(); // path -> {rt, state, seg, opts, lastScrub, sub, polls, lines, rewrites}
const totals = { polls: 0, lines: 0, bytesIngested: 0, rewritten: 0, scrubFail: 0, scrubs: 0, vanished: 0, newFiles: 0, replyEnds: 0 };
const stats = { maxPollMs: 0, sumPollMs: 0 };

function discover() {
  const now = Date.now();
  for (const root of roots) for (const p of walk(root.dir)) {
    if (tracked.has(p)) continue;
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (now - st.mtimeMs > activeWindowMs) continue;
    const sub = p.includes('/subagents/');
    const id = path.basename(p, '.jsonl').slice(0, 14);
    const e = { rt: root.rt, id, sub, seg: 0, opts: { seed: p + '|0', isReplyEnd: root.isReplyEnd }, state: null, lastScrub: Date.now(), polls: 0, lines: 0, rewrites: 0, startSize: st.size };
    e.state = initState(e.opts.seed);
    tracked.set(p, e); totals.newFiles++;
    log({ ev: 'tracking', id: e.id, rt: e.rt, sub, size: st.size });
  }
}

function pollOne(p, e) {
  const t = process.hrtime.bigint();
  const r = poll(p, e.state, e.opts);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  totals.polls++; e.polls++; stats.sumPollMs += ms; if (ms > stats.maxPollMs) stats.maxPollMs = ms;
  if (r.rewritten) {
    totals.rewritten++; e.rewrites++;
    let size = null; try { size = fs.statSync(p).size; } catch {}
    log({ ev: 'REWRITTEN', id: e.id, rt: e.rt, sub: e.sub, reason: r.rewritten, oldOffset: e.state.offset, oldLines: e.state.lines, newSize: size });
    // new segment: restart from line 1, as design 5.3 says
    e.seg++; e.opts = { ...e.opts, seed: p + '|' + e.seg }; e.state = initState(e.opts.seed);
    if (r.rewritten === 'missing') { totals.vanished++; tracked.delete(p); }
    return;
  }
  // the first poll of a file only establishes the baseline (existing content); count growth after it
  if (e.polls === 1) { e.state = r.state; e.baseLines = r.state.lines; return; }
  if (r.lines.length) { totals.lines += r.lines.length; e.lines += r.lines.length; totals.bytesIngested += r.state.offset - e.state.offset; totals.replyEnds += r.replyEnds.length; }
  e.state = r.state;
}

const end = Date.now() + minutes * 60000;
log({ ev: 'start', minutes, pollMs, scrubMs });
let nextDiscover = 0;
while (Date.now() < end) {
  const loopStart = Date.now();
  if (loopStart >= nextDiscover) { discover(); nextDiscover = loopStart + discoverMs; }
  for (const [p, e] of tracked) {
    pollOne(p, e);
    if (tracked.has(p) && Date.now() - e.lastScrub > scrubMs && e.state.offset > 0) {
      e.lastScrub = Date.now(); totals.scrubs++;
      let ok; try { ok = scrub(p, e.state, e.opts); } catch { ok = false; }
      if (!ok) { totals.scrubFail++; log({ ev: 'SCRUB-FAIL', id: e.id, rt: e.rt, offset: e.state.offset, lines: e.state.lines }); }
    }
  }
  await new Promise((r) => setTimeout(r, Math.max(0, pollMs - (Date.now() - loopStart))));
}
const perFile = [...tracked.values()].map((e) => ({ id: e.id, rt: e.rt, sub: e.sub, polls: e.polls, lines: e.lines, baseLines: e.baseLines, rewrites: e.rewrites, startSize: e.startSize }));
log({ ev: 'end', totals, avgPollMs: stats.sumPollMs / Math.max(1, totals.polls), maxPollMs: stats.maxPollMs, files: perFile.length, grewFiles: perFile.filter((f) => f.lines > 0).length });
log({ ev: 'perFile', perFile });
