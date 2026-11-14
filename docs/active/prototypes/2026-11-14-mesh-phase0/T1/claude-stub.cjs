#!/usr/bin/env node
// T1 rig: a stand-in for the `claude` program. Zero credentials, zero network, zero spend.
// WHY: rig devices must produce Claude Code transcript lines deterministically. The app launches
// `claude` by bare name from PATH (the rig puts <home>/bin first), tells it its session through the
// hook socket exactly as the real one would, then watches the transcript file the stub appends to.
// Differs from scripts/perf-lab/fake-claude.cjs (which writes no turns): every typed line here gets
// a user line and an `end_turn` assistant line, byte-identical for the same (session id, line number).
// Ids, timestamps and text come only from sha256(sessionId:n), never from the clock or randomness,
// so two devices fed the same session id and the same typed lines write identical bytes.
'use strict';
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ loggedIn: true, email: 'rig@example.invalid' }) + '\n');
  process.exit(0);
}
if (args[0] === '--version' || args[0] === '-v') { process.stdout.write('0.0.0-rig-stub\n'); process.exit(0); }

const ri = args.indexOf('--resume');
const resuming = ri >= 0 && !!args[ri + 1];
const { uuidOf } = require('./chat-lines.cjs');
// A fresh session's id is derived from the device name and cwd ONLY (not the app's random session id), so a rig run is
// reproducible; two sessions in one cwd on one device therefore share a chat file.
// RIG_STUB_SESSION_ID forces one (to put the same chat on two devices).
const sessionId = resuming ? args[ri + 1] : (process.env.RIG_STUB_SESSION_ID || uuidOf(`${process.env.RIG_DEVICE || 'dev'}:${process.cwd()}`));
const cwd = process.cwd();
const slug = require('./chat-lines.cjs').slugOf(cwd); // slug-encoding.ts ccProjectSlug
const dir = path.join(process.env.HOME, '.claude', 'projects', slug);
fs.mkdirSync(dir, { recursive: true });
const transcript = path.join(dir, `${sessionId}.jsonl`);
if (!fs.existsSync(transcript)) fs.writeFileSync(transcript, '');

const payload = { hook_event_name: 'SessionStart', session_id: sessionId, source: resuming ? 'resume' : 'startup', transcript_path: transcript, cwd };
if (process.env.CLAUDE_DESKTOP_SESSION_ID) payload._desktop_session_id = process.env.CLAUDE_DESKTOP_SESSION_ID;
if (process.env.CLAUDE_DESKTOP_PIPE) {
  const c = net.createConnection(process.env.CLAUDE_DESKTOP_PIPE, () => c.end(JSON.stringify(payload) + '\n'));
  c.on('error', () => {});
}
process.stdout.write(`rig claude stub ${sessionId.slice(0, 8)} ready\r\n> `);

// Continue numbering after whatever is already in the file, so a resumed chat keeps one chain.
let turn = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean).filter((l) => l.includes('"type":"user"')).length;
let parent = null;
try { // a resumed chat continues from its last line, so the parent chain stays unbroken
  const last = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean).pop();
  if (last) parent = JSON.parse(last).uuid ?? null;
} catch { /* empty file */ }
const { turnLines: makeTurn, uuidOf: _u, slugOf: _s } = require('./chat-lines.cjs'); // shared with rig.mjs `chat`
function turnLines(userText) {
  const r = makeTurn({ sessionId, cwd, n: turn++, parent, userText });
  parent = r.lastUuid;
  return r.lines;
}
let buf = '';
process.stdin.resume();
process.stdin.on('data', (b) => {
  const text = b.toString();
  try { process.stdout.write(text); } catch { /* pipe closed */ }
  buf += text;
  const parts = buf.split(/\r\n|\r|\n/);
  buf = parts.pop();
  for (const line of parts) {
    if (!line.trim()) continue;
    // Whole line in ONE appendFileSync so a reader never sees a torn line (T2 tests torn writes separately).
    fs.appendFileSync(transcript, turnLines(line.trim()).join(''));
    process.stdout.write('\r\n> ');
  }
});
