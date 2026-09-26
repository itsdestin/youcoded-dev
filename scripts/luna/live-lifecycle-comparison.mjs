// Lifecycle variant of the Luna cache comparison (Destin, 2026-09-23): one conversation per
// round and client that goes through tool replies, a FULL client-process restart + resume,
// a forced compaction, and replies after it. Records EVERY provider request (each step of a
// reply, the compaction summary itself) so cache reuse can be read per phase:
//   t1,t2 tools → restart → t3 recall (resume) → compact → t4 tools, t5 recall.
// Usage: node live-lifecycle-comparison.mjs [rounds=3] [gapSeconds=10] > results.jsonl
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { buildFixture } from './fixture.mjs';
import { startRequestGate } from './request-gate.mjs';
import { stagePrivateOpenCodeProfile } from './private-opencode-profile.mjs';
import { startBackend, verifySignedInRoot, killGroup } from './opencode-adapter.mjs';
import { assertIsolatedEnvironment } from './live-controller.mjs';
import { launchIsolatedNative, connectIsolatedNative } from './live-native-cdp.mjs';

const BASE = `${os.homedir()}/.cache/youcoded-luna-experiment`;
const BINARY = `${BASE}/opencode-v1.18.31/packages/opencode/dist/opencode-linux-x64/bin/opencode`;
const ROUNDS = Number(process.argv[2] ?? 3);
const GAP_MS = Number(process.argv[3] ?? 10) * 1000;
if (!Number.isSafeInteger(ROUNDS) || ROUNDS < 1 || ROUNDS > 6 || !(GAP_MS >= 0 && GAP_MS <= 120_000)) throw new RangeError('rounds 1-6, gap 0-120s');
// WHY read-only: the fixture clones are reused every round, so nothing may change them.
const P = {
  t1: 'Using your file tools (not shell), open AGENTS.md, README.md, config.json and src/app.js, one file per tool call. Then report the codename, release channel and module count. Do not change files.',
  t2: 'Using your file tools again, re-open config.json and README.md, then explain the retryLimit disagreement in two sentences. Do not change files.',
  t3: 'Without using tools, recall the codename and release channel from earlier in this conversation in one sentence.',
  t4: 'Using your file tools, open check.mjs and src/app.js, then say which checks would currently fail and why, in two sentences. Do not change files.',
  t5: 'Without using tools, summarize in two sentences what we have looked at in this conversation.',
};
const PHASES = ['t1', 't2', 'restart+t3', 'compact', 't4', 't5'];
const output = (label, value) => console.log(JSON.stringify({ label, ...value }));
const MODEL = { providerID: 'openai', modelID: 'gpt-5.6-luna' };

let parent, gate, native, client;
const results = [];
try {
  parent = await mkdtemp('/tmp/luna-lifecycle-comparison-');
  const { roots } = await buildFixture(parent);
  // WHY: ~16 requests per conversation (tool steps, restart, summary) x 2 clients per round,
  // plus slack. Any attempt past a phase/round/total budget halts the run.
  gate = await startRequestGate({ limit: ROUNDS * 80, budgets: { perProbe: 1, perRepetition: 40, perTurn: 12, turnMs: 180_000 } });
  const nativeEnv = Object.fromEntries(['PATH','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','XDG_CURRENT_DESKTOP','KDE_SESSION_VERSION','LANG']
    .filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  Object.assign(nativeEnv, {
    HOME: BASE, XDG_CONFIG_HOME: `${BASE}/config`, XDG_DATA_HOME: `${BASE}/data`,
    XDG_CACHE_HOME: `${BASE}/cache`, XDG_STATE_HOME: `${BASE}/state`, TMPDIR: `${BASE}/tmp`,
    YOUCODED_PROFILE: 'luna-eval', YOUCODED_NATIVE: '1', YOUCODED_LUNA_EXPERIMENT: '1',
    LUNA_GUARD_URL: gate.url, LUNA_FIXTURE_ROOT: roots[0],
  });
  // WHY: the app scrambles conversation IDs in this log (keyed per process), so rows are
  // taken by position: this isolated copy runs only this experiment, one phase at a time.
  const LOG = `${BASE}/config/youcoded-luna-eval/private-diagnostics/chatgpt-cache/requests.jsonl`;
  const logLines = async () => (await readFile(LOG, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const startNative = async () => {
    native = await launchIsolatedNative({ env: nativeEnv });
    try { client = await connectIsolatedNative(native, { port: 9472, viteTarget: 'http://127.0.0.1:5423', fixtureRoot: roots[0] }); }
    catch (error) { output('native-launch', { startup: native.startupStatus() }); throw error; }
  };
  const stopNative = async () => {
    try { await client?.close(); } catch {}
    native?.killGroup(); native = null; client = null;
    await delay(3000);
  };

  const runYouCoded = async (round) => {
    const rows = [];
    if (!native) await startNative();
    gate.beginRepetition(`youcoded-r${round}`);
    try {
      const info = await client.create({ name: `Luna Lifecycle ${round}`, cwd: roots[0], skipPermissions: true,
        provider: 'native', binding: { providerId: 'chatgpt', modelId: 'gpt-5.6-luna' }, preset: 'assistant' });
      const sessionId = info?.id;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId ?? '')) throw new Error('Native session identity missing.');
      for (const [n, phase] of PHASES.entries()) {
        if (n > 0 && GAP_MS) await delay(GAP_MS);
        if (phase === 'restart+t3') {
          // WHY: a real restart — the whole app process tree exits and a fresh one reopens
          // the same persisted conversation. An object reset is not a restart.
          gate.endRepetition(); await stopNative(); await startNative(); gate.beginRepetition(`youcoded-r${round}-after-restart`);
          for (let t = 1; t <= n; t++) { gate.beginTurn(t); gate.endTurn(); }
          const resumed = await client.resume(sessionId);
          if (resumed.id !== sessionId) throw new Error('Native session did not resume the same id.');
        }
        const before = (await logLines()).length;
        gate.beginTurn(n + 1);
        try {
          if (phase === 'compact') {
            const r = await client.compact(sessionId);
            if (!r.ok) throw new Error(`Native compact refused: ${r.reason}`);
          } else {
            const events = []; const h = client.onTranscriptEvent((e) => events.push(e.type));
            const result = await client.send(sessionId, P[phase.replace('restart+', '')]);
            client.offTranscriptEvent('transcript:event', h);
            if (result.status !== 'sent' || events.includes('permission-request')) throw new Error(`Native ${phase} ${result.status}; ${result.reason ?? 'none'}`);
          }
        } finally { gate.endTurn(); }
        let got = [];
        for (let tries = 0; tries < 60 && !got.length; tries++) {
          await delay(tries ? 250 : 1500);
          got = (await logLines()).slice(before).map((l) => JSON.parse(l)).filter((r) => r.outcome === 'success' && ['chat', 'summary'].includes(r.purpose));
        }
        if (!got.length) throw new Error(`Native usage row missing for ${phase}.`);
        got.forEach((r, step) => rows.push({ phase, step: step + 1, purpose: r.purpose, input: r.inputTokens, cached: r.cacheDetailPresent ? r.cachedInputTokens : null, change: r.change }));
      }
    } finally { gate.endRepetition(); }
    return rows;
  };

  const runOpenCode = async (round) => {
    const staged = await stagePrivateOpenCodeProfile({ sourceRoot: BASE });
    const cwd = roots[1];
    const env = Object.fromEntries(['PATH','HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR','YOUCODED_LUNA_EXPERIMENT','OPENCODE_PURE']
      .filter((k) => typeof staged.env[k] === 'string').map((k) => [k, staged.env[k]]));
    Object.assign(env, { LUNA_GUARD_URL: gate.url, LUNA_FIXTURE_ROOT: cwd,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ share: 'disabled', autoupdate: false }),
      OPENCODE_DISABLE_AUTOCOMPACT: '1', OPENCODE_DISABLE_PRUNE: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1' });
    assertIsolatedEnvironment(env, cwd);
    await verifySignedInRoot(staged.authRoot, env);
    const json = async (url, options = {}) => {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(170_000) });
      if (!r.ok) throw new Error(`OpenCode HTTP ${r.status}`);
      return r.json();
    };
    const rows = []; const seen = new Set();
    let backend = await startBackend(BINARY, cwd, env);
    gate.beginRepetition(`opencode-r${round}`);
    try {
      const created = await json(`${backend.url}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const sid = created?.id;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sid ?? '')) throw new Error('OpenCode session identity missing.');
      for (const [n, phase] of PHASES.entries()) {
        if (n > 0 && GAP_MS) await delay(GAP_MS);
        if (phase === 'restart+t3') {
          killGroup(backend.pid); await delay(1000);
          backend = await startBackend(BINARY, cwd, env);
          const resumed = await json(`${backend.url}/session/${encodeURIComponent(sid)}`);
          if (resumed?.id !== sid) throw new Error('OpenCode did not restore the same session.');
        }
        gate.beginTurn(n + 1);
        try {
          if (phase === 'compact') {
            await json(`${backend.url}/session/${encodeURIComponent(sid)}/summarize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(MODEL) });
          } else {
            await json(`${backend.url}/session/${encodeURIComponent(sid)}/message`, { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ model: MODEL, parts: [{ type: 'text', text: P[phase.replace('restart+', '')] }] }) });
          }
        } finally { gate.endTurn(); }
        // WHY: each step of a reply is its own assistant message in OpenCode; list them all
        // (the prompt response returns only the last) and take the new step-finish parts.
        const messages = await json(`${backend.url}/session/${encodeURIComponent(sid)}/message`);
        let step = 0;
        for (const m of messages) {
          if (m?.info?.role !== 'assistant') continue;
          for (const part of m.parts ?? []) {
            if (part?.type !== 'step-finish' || seen.has(part.id)) continue;
            seen.add(part.id);
            const t = part.tokens ?? {};
            const read = t.cache?.read ?? 0, write = t.cache?.write ?? 0;
            rows.push({ phase, step: ++step, purpose: m.info.summary || m.info.mode === 'compaction' || m.info.agent === 'compaction' ? 'summary' : 'chat', input: (t.input ?? 0) + read + write, cached: read });
          }
        }
        if (!step) throw new Error(`OpenCode usage missing for ${phase}.`);
      }
    } finally {
      killGroup(backend.pid);
      gate.endRepetition();
      await staged.cleanup();
    }
    return rows;
  };

  for (let round = 1; round <= ROUNDS; round++) {
    const order = round % 2 ? ['youcoded', 'opencode'] : ['opencode', 'youcoded'];
    for (const clientName of order) {
      const rows = clientName === 'youcoded' ? await runYouCoded(round) : await runOpenCode(round);
      for (const r of rows) { const row = { round, client: clientName, ...r }; results.push(row); output('request', row); }
      await delay(GAP_MS);
    }
  }
  output('done', { attempts: gate.reserved(), denied: gate.denied() });
} catch (error) {
  output('stopped', { reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    attempts: gate?.reserved?.() ?? 0, denied: gate?.denied?.() ?? 0, completedRows: results.length });
  process.exitCode = 2;
} finally {
  try { await client?.close(); } catch {}
  try { native?.killGroup(); } catch {}
  try { await gate?.close(); } catch {}
  if (parent) try { await rm(parent, { recursive: true, force: true }); } catch {}
}
