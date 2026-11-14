// For final messages written as 2 lines: which content block types are on line 1 and line 2? (types only)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs';
const mains = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) mains.push(p); } })(path.join(os.homedir(), '.claude/projects'));
const c = {}; let pairs = 0, between = {};
for (const p of mains) { let prev = null;
  for await (const l of linesOf(p)) { if (!l.includes('"type":"assistant"')) continue; let o; try { o = JSON.parse(l); } catch { continue; } if (o.type !== 'assistant') continue;
    const sr = o.message?.stop_reason; const id = o.message?.id; const bt = (o.message?.content || []).map(b => b.type).join('+'); const end = sr && sr !== 'tool_use';
    if (end && prev && prev.id === id) { pairs++; const k = prev.bt + ' -> ' + bt; c[k] = (c[k] || 0) + 1; }
    prev = end ? { id, bt } : null; } }
console.log(pairs, Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8));
