// Tool-loop variant of live-repeat-comparison.mjs (Destin, 2026-09-23): two read-only
// questions per conversation that make the model open several files, so one reply spans
// several provider requests. Records EVERY request (step), not just the last per turn, to
// answer "does cache hold between the steps inside one reply?" — where agentic sessions
// spend most requests, and what Codex's x-codex-turn-state echo would target.
// Usage: node live-tool-comparison.mjs [rounds=5] [gapSeconds=10] > results.jsonl
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { buildFixture } from './fixture.mjs';
import { startRequestGate } from './request-gate.mjs';
import { stagePrivateOpenCodeProfile } from './private-opencode-profile.mjs';
import { runOpenCodeHttpThreeTurns } from './opencode-http.mjs';
import { launchIsolatedNative, connectIsolatedNative } from './live-native-cdp.mjs';

const BASE = '/home/destin/.cache/youcoded-luna-experiment';
const BINARY = `${BASE}/opencode-v1.18.31/packages/opencode/dist/opencode-linux-x64/bin/opencode`;
const ROUNDS = Number(process.argv[2] ?? 5);
const GAP_MS = Number(process.argv[3] ?? 10) * 1000;
if (!Number.isSafeInteger(ROUNDS) || ROUNDS < 1 || ROUNDS > 20 || !(GAP_MS >= 0 && GAP_MS <= 120_000)) throw new RangeError('rounds 1-20, gap 0-120s');
// WHY read-only: the six fixture clones are reused every round, so nothing may change them.
const prompts = () => [
  'Using your file tools (not shell), open AGENTS.md, README.md, config.json and src/app.js, one file per tool call. Then report the codename, release channel and module count. Do not change files.',
  'Using your file tools again, re-open config.json and README.md, then explain the retryLimit disagreement in two sentences. Do not change files.',
];
const TURNS = 2;
const output = (label, value) => console.log(JSON.stringify({ label, ...value }));

let parent, gate, native, client;
const results = [];
try {
  parent = await mkdtemp('/tmp/luna-repeat-comparison-');
  const { roots } = await buildFixture(parent);
  // WHY: hard ceiling on ChatGPT-plan use — about 6 steps per reply x 2 replies x 2 clients
  // per round, plus slack. Any attempt past a turn/round/total budget halts the run.
  gate = await startRequestGate({ limit: ROUNDS * 26, budgets: { perProbe: 1, perRepetition: 20, perTurn: 10, turnMs: 150_000 } });
  const nativeEnv = Object.fromEntries(['PATH','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','XDG_CURRENT_DESKTOP','KDE_SESSION_VERSION','LANG']
    .filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  Object.assign(nativeEnv, {
    HOME: BASE, XDG_CONFIG_HOME: `${BASE}/config`, XDG_DATA_HOME: `${BASE}/data`,
    XDG_CACHE_HOME: `${BASE}/cache`, XDG_STATE_HOME: `${BASE}/state`, TMPDIR: `${BASE}/tmp`,
    YOUCODED_PROFILE: 'luna-eval', YOUCODED_NATIVE: '1', YOUCODED_LUNA_EXPERIMENT: '1',
    LUNA_GUARD_URL: gate.url, LUNA_FIXTURE_ROOT: roots[0],
  });
  // WHY: the app stores conversation IDs scrambled (keyed per process), so rows can't be looked
  // up by the real ID — both earlier attempts stopped on that. This isolated copy runs only this
  // experiment, one message at a time, so the rows appended during a message belong to it.
  const LOG = `${BASE}/config/youcoded-luna-eval/private-diagnostics/chatgpt-cache/requests.jsonl`;
  const logLines = async () => (await readFile(LOG, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  // WHY: one isolated dev window for the whole run; each round opens a fresh session in it.
  native = await launchIsolatedNative({ env: nativeEnv });
  try { client = await connectIsolatedNative(native, { port: 9472, viteTarget: 'http://127.0.0.1:5423', fixtureRoot: roots[0] }); }
  catch (error) { output('native-launch', { startup: native.startupStatus() }); throw error; }

  const runYouCoded = async (round) => {
    const turns = [];
    gate.beginRepetition(`youcoded-r${round}`);
    try {
      const info = await client.create({ name: `Luna Repeat ${round}`, cwd: roots[0], skipPermissions: true,
        provider: 'native', binding: { providerId: 'chatgpt', modelId: 'gpt-5.6-luna' }, preset: 'assistant' });
      const sessionId = info?.id;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId ?? '')) throw new Error('Native session identity missing.');
      const texts = prompts();
      let convo = null;
      for (let i = 0; i < TURNS; i++) {
        if (i > 0 && GAP_MS) await delay(GAP_MS);
        const before = (await logLines()).length;
        gate.beginTurn(i + 1);
        try {
          const events = []; const h = client.onTranscriptEvent((e) => events.push(e.type));
          const result = await client.send(sessionId, texts[i]);
          client.offTranscriptEvent('transcript:event', h);
          // WHY: tool calls are the point here; only a permission prompt means the run is stuck.
          if (result.status !== 'sent' || events.includes('permission-request')) throw new Error(`Native turn ${result.status}; ${result.reason ?? 'none'}`);
        } finally { gate.endTurn(); }
        let rows = [];
        for (let tries = 0; tries < 60 && !rows.length; tries++) {
          // WHY: the reply's last step lands last; wait until the log stops growing.
        await delay(1500);
        rows = (await logLines()).slice(before).map((l) => JSON.parse(l)).filter((r) => r.purpose === 'chat' && r.outcome === 'success');
          if (!rows.length) await delay(250);
        }
        if (!rows.length) throw new Error('Native usage row missing.');
        convo ??= rows[0].sessionId;
        if (rows.some((r) => r.sessionId !== convo)) throw new Error('Native usage row belongs to another conversation.');
        rows.forEach((r, step) => turns.push({ turn: i + 1, step: step + 1, input: r.inputTokens, cached: r.cacheDetailPresent ? r.cachedInputTokens : null }));
      }
    } finally { gate.endRepetition(); }
    return turns;
  };

  const runOpenCode = async (round) => {
    // WHY: a fresh disposable OpenCode home per round (the isolation check refuses a used one).
    const staged = await stagePrivateOpenCodeProfile({ sourceRoot: BASE });
    try {
      const oc = await runOpenCodeHttpThreeTurns({ binary: BINARY, cwd: roots[1], env: staged.env, prompts: prompts(),
        authRoot: staged.authRoot, gate, restartBeforeTurn: -1, gapMs: GAP_MS, repetitionLabel: `opencode-r${round}` });
      // WHY: every step (request) inside a reply is its own row.
      const steps = {};
      return oc.turns.map((s) => ({ turn: s.turn, step: (steps[s.turn] = (steps[s.turn] ?? 0) + 1), input: s.inputTokens, cached: s.cacheReadTokens ?? 0 }));
    } finally { await staged.cleanup(); }
  };

  for (let round = 1; round <= ROUNDS; round++) {
    const order = round % 2 ? ['youcoded', 'opencode'] : ['opencode', 'youcoded'];
    for (const clientName of order) {
      const turns = clientName === 'youcoded' ? await runYouCoded(round) : await runOpenCode(round);
      for (const t of turns) { const row = { round, client: clientName, ...t }; results.push(row); output('turn', row); }
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
