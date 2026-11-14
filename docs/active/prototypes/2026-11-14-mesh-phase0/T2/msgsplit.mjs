// Is a reply-end line ever followed by more lines of the SAME API message (same message.id)? Would make a cut after it unsafe.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs';
const mains = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) mains.push(p); } })(path.join(os.homedir(), '.claude/projects'));
let ends = 0, sameMsgAfter = 0, sameMsgBefore = 0, nullThenEnd = 0, filesAfter = new Set(), multiEndSameMsg = 0;
for (const p of mains) { const ids = new Map(); // message.id -> {lastStop, n}
  let pendingEnd = null;
  for await (const l of linesOf(p)) { if (!l.includes('"type":"assistant"')) continue; let o; try { o = JSON.parse(l); } catch { continue; } if (o.type !== 'assistant') continue;
    const id = o.message?.id; const sr = o.message?.stop_reason; const isEnd = sr && sr !== 'tool_use';
    if (pendingEnd && id && pendingEnd.id === id) { sameMsgAfter++; filesAfter.add(path.basename(p).slice(0, 8)); }
    const prev = ids.get(id); if (prev) { sameMsgBefore++; if (prev.end && isEnd) multiEndSameMsg++; if (!prev.end && isEnd) nullThenEnd++; }
    ids.set(id, { end: isEnd || prev?.end });
    if (isEnd) { ends++; pendingEnd = { id }; } else if (id && pendingEnd && pendingEnd.id !== id) pendingEnd = null; }
}
console.log({ replyEndLines: ends, laterLineSameMessageAfterAnEnd: sameMsgAfter, files: filesAfter.size, linesSharingMessageIdWithEarlierLine: sameMsgBefore, earlierNullStopThenEnd: nullThenEnd, twoEndsSameMessage: multiEndSameMsg });
