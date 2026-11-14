// T1 rig: the ONE function that makes a deterministic Claude Code transcript turn (user line + end_turn
// assistant line). Used by claude-stub.cjs (when a typed line arrives) and by rig.mjs `chat` (to write a chat
// straight into a device's home without a process). Same inputs -> same bytes, on any device, at any clock.
'use strict';
const crypto = require('node:crypto');
const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const uuidOf = (key) => { const x = h(key); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`; };
const EPOCH = Date.parse('2026-01-01T00:00:00.000Z'); // fixed, never Date.now()
function turnLines({ sessionId, cwd, n, parent, userText }) {
  const iso = (ms) => new Date(EPOCH + n * 60000 + ms).toISOString();
  const env = (ts) => ({ sessionId, cwd, version: '0.0.0-rig-stub', gitBranch: 'rig', userType: 'external', isSidechain: false, timestamp: ts });
  const uu = uuidOf(`${sessionId}:${n}:u`), au = uuidOf(`${sessionId}:${n}:a`);
  const reply = `Rig reply ${n + 1}: ${h(`${sessionId}:${n}:text`).slice(0, 24)}`;
  const u = { type: 'user', uuid: uu, parentUuid: parent, promptId: uuidOf(`${sessionId}:${n}:p`), isMeta: false, ...env(iso(0)), message: { role: 'user', content: userText } };
  const a = { type: 'assistant', uuid: au, parentUuid: uu, ...env(iso(1000)), requestId: `req_${n}`, message: { role: 'assistant', model: 'rig-stub', stop_reason: 'end_turn', content: [{ type: 'text', text: reply }], usage: { input_tokens: 10, output_tokens: 10 } } };
  return { lines: [JSON.stringify(u) + '\n', JSON.stringify(a) + '\n'], lastUuid: au };
}
const slugOf = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');
module.exports = { turnLines, uuidOf, slugOf };
