import path from 'node:path';

const TURN_MS = 90_000;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'cachedInputTokens'];
const VITE_PORT = 5173 + 250;
const integerOrNull = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);
const REQUIRED_GATE = ['beginRepetition', 'beginTurn', 'endTurn', 'endRepetition', 'reserved', 'halted'];
const EVENT_TYPES = new Set(['tool-use', 'tool-result', 'tool_call', 'tool_result', 'permission-request', 'permission_request']);

function sanitizeUsage(rows) {
  if (!Array.isArray(rows)) throw new Error('Private diagnostics returned an invalid record set.');
  return rows.filter((row) => row?.purpose === 'chat')
    .map((row) => {
      if (typeof row.model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(row.model)
          || !['success', 'failed', 'aborted', 'expired'].includes(row.outcome)
          || USAGE_FIELDS.some((key) => !integerOrNull(row[key]))) throw new Error('Private diagnostics usage is incomplete.');
      return { model: row.model, outcome: row.outcome, ...Object.fromEntries(USAGE_FIELDS.map((key) => [key, row[key]])) };
    });
}
async function latchGateClosed(gate) {
  // WHY: the shared gate has no reset endpoint; an out-of-phase reservation irreversibly blocks later sends.
  try { await fetch(`${gate.url}/reserve`, { method: 'POST', signal: AbortSignal.timeout(1_000) }); } catch { /* a dead gate already fails every guarded dispatch */ }
}
function hasToolEvent(value) {
  if (!value || typeof value !== 'object') return false;
  if (EVENT_TYPES.has(value.type) || EVENT_TYPES.has(value.eventType)) return true;
  return Object.values(value).some((entry) => Array.isArray(entry) ? entry.some(hasToolEvent) : hasToolEvent(entry));
}
function validGate(gate) {
  return gate && REQUIRED_GATE.every((name) => typeof gate[name] === 'function');
}
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Luna turn timed out.')), ms); })])
    .finally(() => clearTimeout(timer));
}

/**
 * Offline-safe orchestration seam. Launch/connect are deliberately caller-injected:
 * this module never starts Electron or reads auth, and tests can prove lifecycle with fakes.
 */
export async function runNativeThreeTurns({ prompts, gate, launch, connect, readDiagnostics,
  profileRoot, fixtureRoot, port = 9472, viteTarget, env = process.env, timeoutMs = TURN_MS }) {
  if (!validGate(gate) || typeof launch !== 'function' || typeof connect !== 'function'
      || typeof readDiagnostics !== 'function') throw new TypeError('A caller-owned strict gate and injected client seams are required.');
  if (!Array.isArray(prompts) || prompts.length !== 3 || !prompts.every((prompt) => typeof prompt === 'string' && prompt.length > 0)) throw new TypeError('Exactly three prompts are required.');
  if (typeof profileRoot !== 'string' || !path.isAbsolute(profileRoot) || typeof fixtureRoot !== 'string' || !path.isAbsolute(fixtureRoot)
      || port !== 9472 || viteTarget !== `http://127.0.0.1:${VITE_PORT}`) throw new Error('Private profile, fixture root and exact offset-250 Vite target required.');
  let guardUrl;
  try { guardUrl = new URL(gate.url); } catch { throw new Error('Caller-owned loopback request gate is required.'); }
  if (guardUrl.protocol !== 'http:' || guardUrl.hostname !== '127.0.0.1' || !guardUrl.port || guardUrl.pathname !== '/') throw new Error('Caller-owned loopback request gate is required.');
  if (env.YOUCODED_LUNA_EXPERIMENT !== '1' || env.LUNA_FIXTURE_ROOT !== fixtureRoot) throw new Error('Experiment guard and exact fixture environment are required.');
  if (gate.halted()) throw new Error('Caller-owned request gate is halted.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TURN_MS) throw new RangeError('Turn timeout must be at most 90 seconds.');

  // WHY: passing only explicit process variables avoids leaking credentials and unrelated host configuration to an isolated launch.
  const childEnv = Object.fromEntries(['PATH', 'HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'YOUCODED_NATIVE', 'YOUCODED_DEVTOOLS'].filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]));
  childEnv.YOUCODED_PROFILE = 'luna-eval';
  childEnv.YOUCODED_NATIVE = '1';
  childEnv.YOUCODED_PORT_OFFSET = '250';
  childEnv.YOUCODED_LUNA_EXPERIMENT = '1';
  childEnv.LUNA_GUARD_URL = gate.url;
  childEnv.LUNA_FIXTURE_ROOT = fixtureRoot;
  const startingReservations = gate.reserved();
  let clientProcess;
  let client;
  let sessionId;
  const turns = [];
  gate.beginRepetition('native-three-turn');
  try {
    for (let i = 0; i < 3; i++) {
      if (i === 2) {
        await client?.close();
        clientProcess.killGroup();
        clientProcess = null;
        client = null;
      }
      if (!clientProcess) {
        clientProcess = await launch({ profileRoot: 'luna-eval', userDataRoot: profileRoot, env: { ...childEnv }, port, viteTarget, restart: i === 2 });
        if (!clientProcess || typeof clientProcess.killGroup !== 'function' || clientProcess.attestedFork !== false) throw new Error('Launcher must attest a single owned process group with no fork.');
        client = await connect(clientProcess, { port, viteTarget });
        if (!client || typeof client.onTranscriptEvent !== 'function' || typeof client.offTranscriptEvent !== 'function'
            || typeof client.create !== 'function' || typeof client.send !== 'function' || typeof client.resume !== 'function') throw new Error('Connected isolated client is missing sanctioned APIs.');
      }
      gate.beginTurn(i + 1);
      let eventFailure;
      let completeResolve;
      let completeReject;
      const completion = new Promise((resolve, reject) => { completeResolve = resolve; completeReject = reject; });
      // WHY: a terminal event may arrive before send() settles; pre-attach a rejection observer to avoid an unhandled transient.
      void completion.catch(() => {});
      // WHY: send() acknowledges dispatch; only the transcript's terminal event ends a turn.
      const guardedEvent = (event) => {
        if (event?.type === 'turn-complete') completeResolve(event);
        else if (event?.type === 'session-error' || event?.type === 'user-interrupt') completeReject(new Error('Native turn ended without normal completion.'));
        else if (hasToolEvent(event)) { eventFailure = new Error('Tool or permission event stopped the offline run.'); completeReject(eventFailure); }
      };
      const handler = client.onTranscriptEvent(guardedEvent);
      try {
        await withTimeout((async () => {
          if (i === 0) {
            const created = await client.create({ name: 'Luna Offline Preflight', cwd: fixtureRoot, skipPermissions: false,
              provider: 'native', binding: { providerId: 'chatgpt', modelId: 'gpt-5.6-luna' }, preset: 'assistant' });
            sessionId = created?.id;
            if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw new Error('Native session create did not return a valid session id.');
          } else if (i === 2) {
            const resumed = await client.resume(sessionId);
            if (resumed?.id !== sessionId) throw new Error('Native session resume did not return the exact session id.');
          }
          const result = await client.send(sessionId, prompts[i]);
          if (!result || result.status !== 'sent') throw new Error('Native send dispatch was not accepted.');
          await completion;
          if (eventFailure) throw eventFailure;
          turns.push(sanitizeUsage(await readDiagnostics({ profileRoot, turn: i + 1, sessionId })));
        })(), timeoutMs);
      } finally {
        client.offTranscriptEvent('transcript:event', handler);
        gate.endTurn();
      }
    }
    return { turns, requestCount: gate.reserved() - startingReservations };
  } catch (error) {
    // WHY: any partial/error run is terminal; poison the caller-owned gate before cleanup so no caller can resume the same budget.
    await latchGateClosed(gate);
    try { await client?.close(); } catch { /* preserve primary error */ }
    try { clientProcess?.killGroup(); } catch { /* process may already be gone */ }
    throw error;
  } finally {
    try { await client?.close(); } catch { /* teardown is best-effort after the result is fixed */ }
    try { clientProcess?.killGroup(); } catch { /* the isolated process may already have exited */ }
    gate.endRepetition();
  }
}
