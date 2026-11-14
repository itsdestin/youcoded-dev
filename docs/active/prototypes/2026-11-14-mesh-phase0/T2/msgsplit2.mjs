// Per-turn accounting of end markers in cc-main files (structure only).
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs';
const mains = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) mains.push(p); } })(path.join(os.homedir(), '.claude/projects'));
const T = { endLines: 0, distinctEndMsgIds: 0, turnDuration: 0, stopHookSummary: 0, filesWithEnd: 0, filesWithEndNoTurnDuration: 0, blocksPerEndMsg: {}, gapBetweenBlocksOtherLines: 0, endMsgFinalLineFollowedByTD: 0, tdNotPrecededByEnd: 0, tdFollowsLastEndLine: 0 };
for (const p of mains) { let hasEnd = false, hasTD = false; const endIds = new Map(); let lastEnd = null; let lastWasEndMsg = null;
  for await (const l of linesOf(p)) {
    if (!(l.includes('"stop_reason"') || l.includes('turn_duration'))) { continue; }
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type === 'system' && o.subtype === 'turn_duration') { T.turnDuration++; hasTD = true; if (lastEnd) { T.tdFollowsLastEndLine++; lastEnd = null; } else T.tdNotPrecededByEnd++; continue; }
    if (o.type === 'system' && o.subtype === 'stop_hook_summary') { T.stopHookSummary++; continue; }
    if (o.type === 'assistant') { const sr = o.message?.stop_reason; if (sr && sr !== 'tool_use') { T.endLines++; hasEnd = true; const id = o.message.id; endIds.set(id, (endIds.get(id) || 0) + 1); lastEnd = id; } }
  }
  T.distinctEndMsgIds += endIds.size; for (const n of endIds.values()) T.blocksPerEndMsg[n] = (T.blocksPerEndMsg[n] || 0) + 1;
  if (hasEnd) { T.filesWithEnd++; if (!hasTD) T.filesWithEndNoTurnDuration++; }
}
console.log(JSON.stringify(T, null, 1));
