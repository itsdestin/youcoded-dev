// T1 proof 3: can a rig device run a CHAT through the claude stub (no credentials, no spend)?
import { up, decoyLeaks, auditLines } from './rig.mjs';
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
import { inventory } from './inventory.mjs';
const wsReq = createRequire(path.resolve(import.meta.dirname, '../../../../../youcoded/desktop/package.json'));
const WebSocket = wsReq('ws');
const rig = await up({ n: 1 }); const d = rig.devices[0];
const out = { events: [] };
try {
  const ws = new WebSocket(`ws://127.0.0.1:${d.port}/`);
  const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m.toString())));
  await new Promise((r) => ws.on('open', r)); ws.send(JSON.stringify({ type: 'auth', token: d.token }));
  await new Promise((r) => setTimeout(r, 500));
  const cwd = path.join(d.home, 'proj'); fs.mkdirSync(cwd, { recursive: true });
  ws.send(JSON.stringify({ type: 'session:create', id: 'c1', payload: { name: 'rig', cwd, skipPermissions: true, provider: 'claude' } }));
  await new Promise((r) => setTimeout(r, 3000));
  const created = msgs.find((m) => m.id === 'c1');
  out.created = created ? JSON.stringify(created).slice(0, 300) : null;
  const sid = created?.payload?.id;
  const { descendants } = await import('./rig.mjs');
  out.procs = descendants(d.pid).map((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0').slice(0,3).map((x)=>path.basename(x)).join(' '); } catch { return '?'; } });
  if (sid) { for (const t of ['hello rig one', 'hello rig two']) { ws.send(JSON.stringify({ type: 'session:input', id: 'i' + t.length, payload: { sessionId: sid, text: t + '\r' } })); await new Promise((r) => setTimeout(r, 1200)); } }
  await new Promise((r) => setTimeout(r, 1500));
  out.inputReplies = msgs.filter((m) => /^i\d+$/.test(m.id ?? '')).map((m) => JSON.stringify(m).slice(0, 160));
  out.types = [...new Set(msgs.map((m) => m.type))].slice(0, 25);
  out.transcriptEvents = msgs.filter((m) => /transcript/.test(m.type)).length;
  const inv = await inventory(d.home); out.inventory = inv.chats.map((c) => ({ chat: c.chat.slice(0, 14), lines: c.lines, replyEnds: c.replyEnds, chain: c.chain.slice(0, 10) }));
  ws.close();
} finally { await rig.stop(); }
out.leaks = decoyLeaks(d); out.audit = auditLines(d);
out.logTail = fs.readFileSync(d.log, 'utf8').split('\n').filter((l) => /rror|WARN|claude/i.test(l)).slice(0, 8);
console.log(JSON.stringify(out, null, 1));
