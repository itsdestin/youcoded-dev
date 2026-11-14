// What sits between a reply end and a following turn line that is NOT a new typed prompt? (cc-main only; structure only)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs'; import { classifyCC } from './reply-end.mjs';
const mains = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) mains.push(p); } })(path.join(os.homedir(), '.claude/projects'));
const res = {}; let total = 0, withPromptBetween = 0, endsNoParentLink = 0;
for (const p of mains) { let inEnd = false, between = new Set(), endUuid = null, endStop = '';
  try { for await (const l of linesOf(p)) {
    if (!l.includes('"type"')) continue; let o; try { o = JSON.parse(l); } catch { continue; }
    const c = classifyCC(o); const tag = o.type + (o.subtype ? ':' + o.subtype : '') + (o.attachment?.type ? ':' + o.attachment.type + (o.attachment.commandMode ? '/' + o.attachment.commandMode : '') : '') + (o.operation ? ':' + o.operation : '') + (o.isMeta ? '(meta)' : '');
    if (c.kind === 'reply-end' || c.kind === 'interrupt') { inEnd = true; between = new Set(); endUuid = o.uuid; endStop = c.kind === 'interrupt' ? 'interrupt' : c.stop; continue; }
    if (!inEnd) continue;
    if (c.kind === 'prompt') { inEnd = false; continue; }
    if (['tool-use', 'assistant-partial', 'tool-result'].includes(c.kind)) { total++; const k = endStop + ' -> ' + c.kind + ' via ' + ([...between].sort().filter(t => !/^(last-prompt|ai-title|mode|permission-mode|atis-latch|file-history|api-request|cost-state|session-owner|tools-used|system:turn_duration|system:stop_hook_summary)/.test(t)).join('+') || '(only bookkeeping lines)'); res[k] = (res[k] || 0) + 1; if (o.parentUuid && o.parentUuid !== endUuid) endsNoParentLink++; inEnd = false; continue; }
    between.add(tag); } } catch {}
}
console.log('continuations after a reply end with no typed prompt:', total, ' whose parentUuid is not the reply-end line:', endsNoParentLink);
for (const [k, v] of Object.entries(res).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(v).padStart(5), k);
