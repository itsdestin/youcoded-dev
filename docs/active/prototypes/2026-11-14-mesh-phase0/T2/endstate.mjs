// Ending state of every chat vs. file age. usage: node endstate.mjs <scanDir>
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const recs = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'all.json'), 'utf8')).filter(r => r.kind);
const paths = new Map();
for (const root of [path.join(os.homedir(), '.claude/projects'), path.join(os.homedir(), '.youcoded/sessions')]) (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (e.name.endsWith('.jsonl')) paths.set(path.basename(e.name, '.jsonl').slice(0, 8) + (p.includes('/subagents/') ? 's' : p.includes('.youcoded') ? 'n' : 'm'), p); } })(root);
const now = Date.now(); const out = {};
for (const r of recs) { if (r.kind === 'vanished') continue;
  const k = r.id + (r.kind === 'cc-sub' ? 's' : r.kind === 'native' ? 'n' : 'm'); const p = paths.get(k); let age = null; try { age = (now - fs.statSync(p).mtimeMs) / 3600000; } catch {}
  const bucket = age === null ? 'gone' : age < 0.25 ? '<15min' : age < 24 ? '<1d' : '>=1d';
  const key = `${r.kind} ${r.end}${r.end === 'mid-reply' ? ':' + r.endDetail : ''} ${bucket}`; out[key] = (out[key] || 0) + 1; }
for (const k of Object.keys(out).sort()) console.log(k.padEnd(50), out[k]);
