// What is wrong with the lines JSON.parse rejects? Prints only error class + byte-level facts, no text.
import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs';
const root = path.join(os.homedir(), '.claude/projects');
for (const [fid, lns] of [['6c1bd6e6', [3728,4015,4061,4062]], ['c314c6e8', [989,1011,1023]]]) {
  const p = (await import('node:child_process')).execSync(`find ${root} -name '${fid}*.jsonl' -not -path '*/subagents/*'`).toString().trim();
  let ln = 0;
  for await (const l of linesOf(p)) { ln++; if (!lns.includes(ln)) continue;
    let msg = ''; try { JSON.parse(l); } catch (e) { msg = e.message.replace(/"[^"]{0,40}"/g, '"…"'); }
    const m = /position (\d+)/.exec(msg); const pos = m ? Number(m[1]) : -1;
    const ctrl = (l.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
    const lone = (l.match(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g) || []).length;
    const repl = (l.match(/�/g) || []).length;
    console.log(fid, ln, 'len', l.length, 'err:', msg.slice(0, 90), '| ctrlChars', ctrl, 'loneSurrogates', lone, 'U+FFFD', repl, 'errPos/len', pos, l.length);
  }
}
