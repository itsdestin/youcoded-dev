import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startRequestGate } from './request-gate.mjs';

test('reserves only the configured number of provider HTTP attempts', async () => {
  const gate = await startRequestGate({ limit: 2 });
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${gate.url}/reserve`, { method: 'POST' });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [204, 204, 429]);
    assert.equal(gate.reserved(), 2);
    assert.equal(gate.denied(), 1);
  } finally {
    await gate.close();
  }
});

test('rejects non-reservation paths and request bodies without consuming slots', async () => {
  const gate = await startRequestGate({ limit: 1 });
  try {
    const path = await fetch(`${gate.url}/unknown`, { method: 'POST' });
    const body = await fetch(`${gate.url}/reserve`, { method: 'POST', body: 'PRIVATE_PROMPT' });
    assert.equal(path.status, 404);
    assert.equal(body.status, 400);
    assert.equal(gate.reserved(), 0);
  } finally {
    await gate.close();
  }
});

const budgets = { perTurn: 2, perRepetition: 3, perProbe: 1, turnMs: 1000 };
const status = async gate => (await fetch(`${gate.url}/reserve`, { method: 'POST' })).status;

test('strict gate latches closed after an unscoped provider request', async () => {
  const gate = await startRequestGate({ limit: 4, budgets });
  try {
    assert.equal(await status(gate), 429);
    assert.throws(() => gate.beginRepetition('youcoded-1'), /halted/i);
    assert.equal(await status(gate), 429);
    assert.equal(gate.reserved(), 0);
  } finally { await gate.close(); }
});

test('strict gate stops an exhausted turn even if the controller advances', async () => {
  const gate = await startRequestGate({ limit: 4, budgets });
  try {
    gate.beginRepetition('youcoded-1'); gate.beginTurn(1);
    assert.deepEqual([await status(gate), await status(gate), await status(gate)], [204, 204, 429]);
    gate.endTurn();
    assert.throws(() => gate.beginTurn(2), /halted/i);
    assert.equal(await status(gate), 429);
    assert.equal(gate.reserved(), 2);
  } finally { await gate.close(); }
});

test('strict gate counts requests across turns toward a repetition ceiling', async () => {
  const gate = await startRequestGate({ limit: 4, budgets });
  try {
    gate.beginRepetition('youcoded-1'); gate.beginTurn(1);
    assert.deepEqual([await status(gate), await status(gate)], [204, 204]);
    gate.endTurn(); gate.beginTurn(2);
    assert.deepEqual([await status(gate), await status(gate)], [204, 429]);
    assert.equal(gate.reserved(), 3);
  } finally { await gate.close(); }
});

test('strict gate counts probe attempts toward the whole-experiment ceiling', async () => {
  const gate = await startRequestGate({ limit: 2, budgets });
  try {
    gate.beginProbe('youcoded'); assert.equal(await status(gate), 204); gate.endProbe();
    gate.beginRepetition('youcoded-1'); gate.beginTurn(1);
    assert.deepEqual([await status(gate), await status(gate)], [204, 429]);
    assert.equal(gate.reserved(), 2);
  } finally { await gate.close(); }
});

test('strict gate snapshots ceilings so callers cannot raise them mid-run', async () => {
  const mutable = { ...budgets, perTurn: 1 };
  const gate = await startRequestGate({ limit: 4, budgets: mutable });
  try {
    gate.beginRepetition('youcoded-1'); gate.beginTurn(1);
    assert.equal(await status(gate), 204);
    mutable.perTurn = 4;
    assert.equal(await status(gate), 429);
    assert.equal(gate.reserved(), 1);
  } finally { await gate.close(); }
});

test('strict gate stops a probe when its provider-request cap is hit', async () => {
  const gate = await startRequestGate({ limit: 4, budgets });
  try {
    gate.beginProbe('opencode');
    assert.deepEqual([await status(gate), await status(gate)], [204, 429]);
    assert.equal(gate.reserved(), 1);
  } finally { await gate.close(); }
});

test('strict gate rejects a timed-out turn before provider dispatch without spending a slot', async () => {
  let now = 0;
  const gate = await startRequestGate({ limit: 2, budgets: { perTurn: 2, perRepetition: 2, perProbe: 1, turnMs: 1000 }, clock: () => now });
  try {
    gate.beginRepetition('youcoded-1');
    gate.beginTurn(1);
    now = 1000;
    assert.equal(gate.turnExpired(), true);
    assert.equal((await fetch(`${gate.url}/reserve`, { method: 'POST' })).status, 429);
    assert.equal(gate.reserved(), 0);
  } finally { await gate.close(); }
});

test('strict gate cannot advance after a wall-clock-expired turn without a provider attempt', async () => {
  let now = 0;
  const gate = await startRequestGate({ limit: 4, budgets, clock: () => now });
  try {
    gate.beginRepetition('youcoded-1'); gate.beginTurn(1);
    now = 1000;
    assert.equal(gate.turnExpired(), true);
    gate.endTurn();
    assert.equal(gate.halted(), true);
    assert.throws(() => gate.beginTurn(2), /halted/i);
    assert.equal(gate.reserved(), 0);
  } finally { await gate.close(); }
});

test('strict gate rejects missing and malformed numeric safeguards before binding', async () => {
  await assert.rejects(startRequestGate({ limit: 4, budgets: { perTurn: 2 } }), /budget/i);
  await assert.rejects(startRequestGate({ limit: 4, budgets: { perTurn: 0, perRepetition: 4, perProbe: 1, turnMs: 1000 } }), /budget/i);
  await assert.rejects(startRequestGate({ limit: 4, budgets: { perTurn: 2, perRepetition: 4, perProbe: 1, turnMs: true } }), /budget/i);
});

test('does not accept requests after the guard process stops', async () => {
  const gate = await startRequestGate({ limit: 1 });
  await gate.close();
  await assert.rejects(fetch(`${gate.url}/reserve`, { method: 'POST' }));
});

const workspace = path.resolve(import.meta.dirname, '../..');
const app = path.join(workspace, 'youcoded/desktop');
const source = process.env.LUNA_OPENCODE_SOURCE;
const run = promisify(execFile);

test('two fake clients share a ceiling across a client-process restart',
  { skip: !source || !existsSync(path.join(source, 'packages/opencode/src/plugin/openai/codex.ts')) },
  async () => {
    const gate = await startRequestGate({ limit: 2 });
    let sends = 0;
    const endpoint = createServer((_req, res) => {
      sends++;
      res.writeHead(200).end('{}');
    });
    await new Promise(resolve => endpoint.listen(0, '127.0.0.1', resolve));
    const fakeUrl = `http://127.0.0.1:${endpoint.address().port}/backend-api/codex/responses`;
    const privateRoot = path.dirname(source);
    const env = {
      PATH: process.env.PATH,
      HOME: path.join(privateRoot, 'home'),
      XDG_CONFIG_HOME: path.join(privateRoot, 'config'),
      XDG_DATA_HOME: path.join(privateRoot, 'data'),
      XDG_CACHE_HOME: path.join(privateRoot, 'cache'),
      LUNA_GUARD_URL: gate.url,
      LUNA_FAKE_ENDPOINT: fakeUrl,
      YOUCODED_LUNA_EXPERIMENT: '1',
    };
    // WHY: each invocation runs the real ChatGptAuth.fetch() with fake auth and
    // transport in its own process, not just the reusable reservation helper.
    const runApp = expected => run(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', 'tests/chatgpt-auth.test.ts',
      '-t', 'cross-process Luna transport fixture',
    ], { cwd: app, env: { ...env, LUNA_FAKE_INTEGRATION: '1', LUNA_FAKE_EXPECT: expected } });
    const opencodeCode = `import { CodexAuthPlugin } from './src/plugin/openai/codex.ts';
      const hooks = await CodexAuthPlugin({} , { codexApiEndpoint: process.env.LUNA_FAKE_ENDPOINT });
      const loaded = await hooks.auth.loader(async () => ({
        type: 'oauth', access: 'fake', refresh: 'fake', expires: Date.now() + 60000,
      }), {});
      await loaded.fetch('https://api.openai.com/v1/responses', { method: 'POST', body: 'PRIVATE_PROMPT' });`;
    let gateClosed = false;
    try {
      await runApp('allow');
      await run('/usr/bin/bun', ['-e', opencodeCode], { cwd: path.join(source, 'packages/opencode'), env });
      await runApp('deny');
      // The fake app transport asserts its denied request never reached fetch().
      assert.equal(gate.reserved(), 2);
      assert.equal(gate.denied(), 1);
      assert.equal(sends, 1); // OpenCode's fake endpoint; YouCoded asserts its own fake fetch.
      await gate.close();
      gateClosed = true;
      await runApp('down');
      assert.equal(sends, 1);
    } finally {
      if (!gateClosed) await gate.close();
      await new Promise((resolve, reject) => endpoint.close(error => error ? reject(error) : resolve()));
    }
  });
