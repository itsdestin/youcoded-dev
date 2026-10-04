// WHY: fixed role markers bind independent concurrent native turns; request arrival order must never select a plan.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, appendFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MIXED_MODEL_ID = 'perf-mixed';
export const MIXED_ROLES = Object.freeze(['stream-1', 'stream-2', 'stream-3', 'tool-1', 'tool-2', 'idle']);
const SCRIPT = fileURLToPath(import.meta.url);
const marker = (role) => `MIXED_ROLE:${role}`;
const pause = (ms, signal) => new Promise((done) => {
  if (signal.aborted) return done();
  const timer = setTimeout(finish, ms);
  function finish() { clearTimeout(timer); signal.removeEventListener('abort', finish); done(); }
  signal.addEventListener('abort', finish, { once: true });
});
function limited(n, min, max, label) {
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${label}`);
  return n;
}
function quote(s) { return `'${s.replaceAll("'", "'\\''")}'`; }

// WHY: BashTool returns the exact captured stdout followed by one terminal
// `[cwd: ... · exit 0]` line (bash.ts:859-63,915). Searching substrings lets
// partial, reordered, background or failed calls masquerade as completed work.
export function completedToolOutput(text, tool) {
  if (typeof text !== 'string' || !tool || !Number.isInteger(tool.steps)) return false;
  const expected = Array.from({ length: tool.steps }, (_, i) => `MIXED_PROGRESS:${tool.role}:${i + 1}/${tool.steps}`).join('\n') + `\n${tool.result}`;
  const index = text.lastIndexOf('\n[cwd: ');
  if (index < 0 || text.slice(0, index) !== expected) return false;
  const metadata = text.slice(index);
  // Cwd is an app-selected private working directory, not the generated tool subdir.
  return /^\n\[cwd: [^\r\n\]]+ · exit 0\]$/.test(metadata);
}

/** Creates ONLY a newly named, marked root below an existing private parent; caller owns removal. */
export async function createMixedToolFixture({ parent, durationMs = 30_000, steps = 15 } = {}) {
  limited(durationMs, 1, 45_000, 'durationMs');
  limited(steps, 1, 100, 'steps');
  if (process.platform === 'win32' || !isAbsolute(parent ?? '')) throw new Error('Absolute POSIX private parent required (Bash fixture unsupported on Windows)');
  const safeParent = await realpath(parent);
  const root = await mkdtemp(join(safeParent, 'mixed-tools-'));
  const token = randomUUID();
  await writeFile(join(root, '.mixed-perf-owned.json'), JSON.stringify({ token, root }), { flag: 'wx', mode: 0o600 });
  const tools = {};
  for (const role of ['tool-1', 'tool-2']) {
    const dir = join(root, role);
    await mkdir(dir);
    const result = `MIXED_TOOL_OK:${role}:${token}`;
    // The command consists solely of quoted generated paths and fixed flags, never prompt text.
    tools[role] = { role, dir, result, steps, command: `node ${quote(SCRIPT)} --tool-worker ${quote(root)} ${role} ${token} ${durationMs} ${steps}`, progressPath: join(dir, 'progress.jsonl'), resultPath: join(dir, 'result.json') };
  }
  return { root, token, tools };
}

/** Executable fixture: validates the marked root AND its children before any write. */
export async function runMixedToolWorker([root, role, token, durationText, stepsText], { signal } = {}) {
  if (!['tool-1', 'tool-2'].includes(role) || !/^[a-f0-9-]{36}$/.test(token ?? '')) throw new Error('Invalid tool identity');
  const durationMs = Number(durationText), steps = Number(stepsText);
  // A pre-aborted execution must not claim to have started or leave a success file.
  if (signal?.aborted) return false;
  limited(durationMs, 1, 45_000, 'durationMs');
  limited(steps, 1, 100, 'steps');
  if (process.platform === 'win32' || !isAbsolute(root ?? '') || root !== resolve(root)) throw new Error('Invalid root or unsupported platform');
  const info = JSON.parse(await readFile(join(root, '.mixed-perf-owned.json'), 'utf8'));
  if (info.root !== root || info.token !== token || await realpath(root) !== root || (await lstat(join(root, role))).isSymbolicLink() || await realpath(join(root, role)) !== join(root, role)) throw new Error('Unowned or escaped root');
  const own = new AbortController();
  const stop = () => own.abort();
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) own.abort(); // close the validation-to-listener race
  const events = join(root, role, 'progress.jsonl');
  const writeEvent = (event, step) => appendFile(events, JSON.stringify({ event, step, at: Date.now(), role, token }) + '\n', { flag: 'a' });
  try {
    if (own.signal.aborted) return false;
    await writeFile(events, '', { flag: 'wx' }); // refuse a repeated launch
    if (own.signal.aborted) { await writeEvent('canceled', 0); return false; }
    await writeEvent('start', 0);
    const begin = performance.now();
    for (let step = 1; step <= steps; step++) {
      await pause(Math.max(0, begin + durationMs * step / steps - performance.now()), own.signal);
      if (own.signal.aborted) { await writeEvent('canceled', step - 1); return false; }
      // Harmless local work on each beat, not a CPU-saturation-only scenario.
      await writeEvent('progress', step);
      process.stdout.write(`MIXED_PROGRESS:${role}:${step}/${steps}\n`);
    }
    if (own.signal.aborted) { await writeEvent('canceled', steps); return false; }
    await writeEvent('end', steps);
    const result = `MIXED_TOOL_OK:${role}:${token}`;
    await writeFile(join(root, role, 'result.json'), JSON.stringify({ role, token, result, steps, completedAt: Date.now() }), { flag: 'wx' });
    process.stdout.write(result + '\n');
    return true;
  } finally { signal?.removeEventListener('abort', stop); }
}

function parseRole(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return null;
  const user = messages.filter((m) => m?.role === 'user');
  const last = user.at(-1)?.content;
  if (typeof last !== 'string') return null;
  const hits = MIXED_ROLES.filter((role) => last.includes(marker(role)));
  return hits.length === 1 && last.trim() === marker(hits[0]) ? hits[0] : null;
}
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

/** Routes by the latest exact user marker, with one outstanding launch per tool role. */
export async function startMixedProvider({ port = 0, host = '127.0.0.1', fixture, stream = {} } = {}) {
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Loopback only');
  const plans = new Map();
  const requests = [];
  const rejected = [];
  const active = new Set();
  const launched = new Set();
  const acknowledged = new Set();
  for (const role of MIXED_ROLES.filter((r) => r.startsWith('stream-'))) plans.set(role, { deltas: 1500, perSec: 50, ...stream[role] });
  const validate = (p) => { limited(p.deltas, 1, 3000, 'deltas'); limited(p.perSec, 1, 200, 'perSec'); if (p.deltas / p.perSec > 45) throw new Error('Stream exceeds 45 seconds'); };
  for (const p of plans.values()) validate(p);
  function plan(role, update) {
    if (!plans.has(role)) throw new Error('Not a stream role');
    const next = { ...plans.get(role), ...update }; validate(next); plans.set(role, next);
    return { ...next };
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}`);
    if (req.method === 'GET' && ['/health', '/v1/health'].includes(url.pathname)) return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && ['/models', '/v1/models'].includes(url.pathname)) return json(res, 200, { object: 'list', data: [{ id: MIXED_MODEL_ID, object: 'model', owned_by: 'perf-lab' }] });
    if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') return json(res, 404, { error: { message: 'Unknown endpoint' } });
    const refuse = (status, message, role = null) => { rejected.push({at:Date.now(),role,status,message}); return json(res,status,{error:{message}}); };
    let body;
    // WHY: incomplete clients must not keep a private measurement service alive indefinitely.
    req.setTimeout(5_000, () => req.destroy());
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw new Error('Request too large'); chunks.push(chunk); }
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch { return refuse(400,'Invalid request body'); }
    const role = parseRole(body);
    if (!role || body.stream !== true || body.model !== MIXED_MODEL_ID) return refuse(400,'Exact marked streaming request required',role);
    const followup = body.messages.filter((m) => m?.role === 'tool');
    const tool = fixture?.tools?.[role];
    if (role.startsWith('tool-')) {
      if (!tool || !Array.isArray(body.tools) || !body.tools.some((t) => t?.function?.name === 'Bash')) return refuse(409,'Fixture and native Bash schema required',role);
      if (followup.length) {
        const call = body.messages.filter((m) => m?.role === 'assistant').flatMap((m) => m.tool_calls ?? []).at(-1);
        const result = followup.at(-1);
        if (!launched.has(role) || acknowledged.has(role) || followup.length !== 1 || call?.id !== `mixed-${role}-${fixture.token}` || call?.function?.name !== 'Bash' || result?.tool_call_id !== call.id || !completedToolOutput(result.content, tool)) return refuse(409,'Matching successful tool result required',role);
        // WHY: the follow-up must pair the exact command issued, not merely an ID and plausible prose.
        try {
          const issued = JSON.parse(call.function.arguments);
          if (issued.command !== tool.command || issued.run_in_background === true) throw new Error('Different command');
        } catch { return refuse(409,'Original fixture command required',role); }
        // WHY: provider prose alone cannot certify real tool engagement; require the worker's completed file and every numbered beat.
        try {
          const actual = JSON.parse(await readFile(tool.resultPath, 'utf8'));
          const events = (await readFile(tool.progressPath, 'utf8')).trim().split('\n').map(JSON.parse);
          if (actual.result !== tool.result || actual.steps !== tool.steps || events.length !== tool.steps + 2 ||
              events[0].event !== 'start' || events.at(-1).event !== 'end' ||
              events.some((e, i) => e.role !== role || e.token !== fixture.token || (i > 0 && i <= tool.steps && (e.event !== 'progress' || e.step !== i)))) throw new Error('Incomplete tool work');
        } catch { return refuse(409,'Owned tool completion proof required',role); }
      } else if (launched.has(role)) return refuse(409,'Duplicate tool launch refused',role);
    } else if (followup.length) return refuse(409,'Unexpected tool result',role);
    // Snapshot the plan before the first await: edits cannot mutate in-flight requests.
    const snapshot = role.startsWith('stream-') ? { ...plans.get(role) } : null;
    const rec = { role, startedAt: Date.now(), firstWriteAt: null, lastWriteAt: null, endedAt: null, deltasSent: 0, aborted: false, followup: followup.length > 0, plan: snapshot };
    requests.push(rec);
    if (tool && followup.length) acknowledged.add(role);
    const controller = new AbortController();
    const entry = { res, controller, rec }; active.add(entry);
    res.on('close', () => { if (!rec.endedAt) { rec.aborted = true; controller.abort(); } });
    const id = `chatcmpl-mixed-${requests.length}`;
    const frame = (delta, reason = null, extra = {}) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(rec.startedAt / 1000), model: MIXED_MODEL_ID, choices: [{ index: 0, delta, finish_reason: reason }], ...extra })}\n\n`;
    const write = async (text) => {
      if (controller.signal.aborted || res.destroyed) return false;
      if (!res.write(text)) await new Promise((done) => { const end = () => { res.off('drain', end); res.off('close', end); done(); }; res.once('drain', end); res.once('close', end); });
      if (controller.signal.aborted || res.destroyed) return false;
      rec.firstWriteAt ??= Date.now(); rec.lastWriteAt = Date.now(); return true;
    };
    try {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      if (snapshot) {
        const start = performance.now();
        for (let i = 0; i < snapshot.deltas; i++) {
          await pause(Math.max(0, start + i * 1000 / snapshot.perSec - performance.now()), controller.signal);
          if (!await write(frame({ ...(i === 0 ? { role: 'assistant' } : {}), content: `MIXED_TEXT:${role}:${String(i).padStart(4, '0')}\n` }))) break;
          rec.deltasSent++;
        }
      } else if (tool && !followup.length) {
        launched.add(role);
        const args = JSON.stringify({ command: tool.command, description: `Run owned ${role} progress fixture`, timeout: 50_000 });
        const callId = `mixed-${role}-${fixture.token}`;
        for (let i = 0; i < args.length; i += 60) {
          if (!await write(frame({ tool_calls: [{ index: 0, ...(i === 0 ? { id: callId, type: 'function' } : {}), function: { ...(i === 0 ? { name: 'Bash' } : {}), arguments: args.slice(i, i + 60) } }] }))) break;
          rec.deltasSent++;
        }
      } else {
        if (await write(frame({ role: 'assistant', content: tool ? `MIXED_ACK:${role}:${fixture.token}` : 'MIXED_IDLE' }))) rec.deltasSent++;
      }
      if (!controller.signal.aborted) { await write(frame({}, tool && !followup.length ? 'tool_calls' : 'stop', { usage: { prompt_tokens: 64, completion_tokens: rec.deltasSent, total_tokens: 64 + rec.deltasSent } })); await write('data: [DONE]\n\n'); res.end(); }
    } finally { rec.endedAt = Date.now(); active.delete(entry); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, () => { server.off('error', fail); ok(); }); });
  const bound = server.address().port;
  return { host, port: bound, baseUrl: `http://${host}:${bound}/v1`, requests, rejected, plan, expectedText: (role, n = plans.get(role)?.deltas) => Array.from({ length: n }, (_, i) => `MIXED_TEXT:${role}:${String(i).padStart(4, '0')}\n`).join(''), async close() { for (const entry of active) { entry.rec.aborted = true; entry.controller.abort(); entry.res.destroy(); } server.closeAllConnections(); await new Promise((ok) => server.close(ok)); } };
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT && process.argv[2] === '--tool-worker') {
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  process.once('SIGINT', () => controller.abort());
  runMixedToolWorker(process.argv.slice(3), { signal: controller.signal }).then((ok) => { process.exitCode = ok ? 0 : 2; }, (err) => { console.error(err.message); process.exitCode = 2; });
}
