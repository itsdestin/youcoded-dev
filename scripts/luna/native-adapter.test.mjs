import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNativeThreeTurns } from './native-adapter.mjs';
import { startRequestGate } from './request-gate.mjs';

function fakeHarness() {
  const calls = [];
  const process = (name) => ({ name, killed: false, killGroup() { this.killed = true; calls.push(['kill', name]); } });
  const clients = [];
  const launch = async (options) => {
    calls.push(['launch', options.profileRoot, options.restart, options.env]);
    const child = process(`child-${clients.length + 1}`);
    child.attestedFork = false;
    clients.push(child);
    return child;
  };
  const connect = async (_child, options) => {
    calls.push(['connect', options.port, options.viteTarget]);
    let handler;
    const client = {
      onTranscriptEvent(callback) { handler = callback; return callback; },
      offTranscriptEvent(channel, callback) { assert.equal(channel, 'transcript:event'); assert.equal(callback, handler); },
      async create(options) { calls.push(['create', options]); return { id: 'session-abc' }; },
      async send(id, prompt) {
        calls.push(['send', id, prompt]);
        handler({ type: 'assistant-text', sessionId: id, data: { text: 'private text' } });
        setImmediate(() => handler({ type: 'turn-complete', sessionId: id, data: { usage: { inputTokens: 10 } } }));
        return { status: 'sent' };
      },
      async resume(id) { calls.push(['resume', id]); return { id }; },
      async close() { calls.push(['close']); },
    };
    return client;
  };
  return { calls, clients, launch, connect };
}
const gate = () => startRequestGate({ limit: 10, budgets: { perProbe: 1, perTurn: 2, perRepetition: 5, turnMs: 90_000 } });
const diagnostics = async () => [
  { purpose: 'chat', model: 'gpt-5.6-luna', inputTokens: 10, outputTokens: 2, cachedInputTokens: 0, outcome: 'success' },
  { purpose: 'chat', model: 'gpt-5.6-luna', inputTokens: null, outputTokens: null, cachedInputTokens: null, outcome: 'failed' },
];
const args = async (f, g, extra = {}) => ({ prompts: ['p1', 'p2', 'p3'], gate: g, launch: f.launch,
  connect: f.connect, readDiagnostics: diagnostics, profileRoot: '/private/profile', fixtureRoot: '/private/fixture',
  port: 9472, viteTarget: 'http://127.0.0.1:5423', env: { PATH: '/bin', HOME: '/private/home', YOUCODED_LUNA_EXPERIMENT: '1', LUNA_FIXTURE_ROOT: '/private/fixture' }, ...extra });
const closeGate = async (value) => value.close();

test('three turns use same gate, restart the child, resume exact session, and return usage only', async () => {
  const f = fakeHarness();
  const g = await gate();
  try {
  const result = await runNativeThreeTurns(await args(f, g));
  assert.equal(f.clients.length, 2);
  assert.equal(f.clients[0].killed, true);
  assert.equal(f.clients[1].killed, true);
  assert.equal(result.turns.length, 3);
  assert.ok(!JSON.stringify(result).includes('private text'));
  assert.ok(!JSON.stringify(result).includes('session-abc'));
  assert.equal(f.calls.filter(([kind]) => kind === 'send').length, 3);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'resume').map(([, id]) => id), ['session-abc']);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'connect').map(([, port, target]) => [port, target]), [[9472, 'http://127.0.0.1:5423'], [9472, 'http://127.0.0.1:5423']]);
  const launches = f.calls.filter(([kind]) => kind === 'launch');
  assert.equal(launches[0][1], 'luna-eval');
  assert.equal(launches[0][3].YOUCODED_PROFILE, 'luna-eval');
  assert.equal(launches[0][3].YOUCODED_LUNA_EXPERIMENT, '1');
  assert.equal(launches[0][3].LUNA_GUARD_URL, g.url);
  assert.equal(f.calls.filter(([kind]) => kind === 'create')[0][1].cwd, '/private/fixture');
  assert.equal(result.turns[0].length, 2);
  assert.ok(result.turns[0].some((row) => row.outcome === 'failed'));
  } finally { await closeGate(g); }
});

test('requires caller-owned strict gate before launching', async () => {
  const f = fakeHarness();
  await assert.rejects(async () => runNativeThreeTurns(await args(f, {})));
  assert.equal(f.clients.length, 0);
});

test('rejects wrong Vite offset, guard state, or missing fixture before launch', async () => {
  const f = fakeHarness();
  const g = await gate();
  try {
    await assert.rejects(async () => runNativeThreeTurns({ ...await args(f, g), viteTarget: 'http://127.0.0.1:5472' }));
    await assert.rejects(async () => runNativeThreeTurns({ ...await args(f, g), env: { PATH: '/bin' } }));
    assert.equal(f.clients.length, 0);
  } finally { await closeGate(g); }
});

test('does not sample diagnostics until turn-complete and latches gate on timeout', async () => {
  const f = fakeHarness();
  const g = await gate();
  let diagnosticReads = 0;
  const connect = async (...connectArgs) => {
    const client = await f.connect(...connectArgs);
    client.send = async () => ({ status: 'sent' });
    return client;
  };
  try {
    await assert.rejects(async () => runNativeThreeTurns({ ...await args({ ...f, connect }, g),
      timeoutMs: 20, readDiagnostics: async () => { diagnosticReads++; return diagnostics(); } }), /timed out/i);
    assert.equal(diagnosticReads, 0);
    assert.equal(g.halted(), true);
  } finally { await closeGate(g); }
});

test('stops after a tool event without continuing', async () => {
  const f = fakeHarness();
  const g = await gate();
  const connect = async (...args) => {
    const client = await f.connect(...args);
    let activeHandler;
    const subscribe = client.onTranscriptEvent;
    client.onTranscriptEvent = (callback) => { activeHandler = callback; return subscribe(callback); };
    client.send = async () => { activeHandler({ type: 'tool-use' }); return { status: 'sent' }; };
    return client;
  };
  try {
    await assert.rejects(async () => runNativeThreeTurns(await args({ ...f, connect }, g)));
    assert.equal(f.calls.filter(([kind]) => kind === 'send').length, 0);
    assert.equal(g.halted(), true);
  } finally { await closeGate(g); }
});
