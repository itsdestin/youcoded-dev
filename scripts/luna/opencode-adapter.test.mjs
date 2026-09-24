import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOpenCodeThreeTurns } from './opencode-adapter.mjs';
import { startRequestGate } from './request-gate.mjs';

async function signedInRoot(dir) {
  const root = path.join(dir, 'youcoded-luna-experiment');
  await mkdir(root, { mode: 0o700 });
  const names = ['home', 'config', 'data', 'cache', 'state', 'tmp'];
  const env = { YOUCODED_LUNA_EXPERIMENT: '1', OPENCODE_PURE: '1', PATH: process.env.PATH };
  for (let i = 0; i < names.length; i++) {
    env[['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR'][i]] = path.join(root, names[i]);
    await mkdir(env[['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR'][i]], { mode: 0o700 });
  }
  const authRoot = path.join(env.XDG_DATA_HOME, 'opencode');
  await mkdir(authRoot, { mode: 0o700 });
  await writeFile(path.join(authRoot, 'auth.json'), '{"fake":true}', { mode: 0o600 });
  return { env, authRoot };
}

async function externalGate() {
  return startRequestGate({ limit: 10, budgets: { perProbe: 1, perRepetition: 5, perTurn: 2, turnMs: 90_000 } });
}

const script = (body) => `#!/usr/bin/env node\n${body}\n`;

test('uses one serve for two turns, restarts, then attaches to the exact session; exposes allowlisted usage only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luna-opencode-test-'));
  const root = path.join(dir, 'fixture');
  await mkdir(root, { mode: 0o700 });
  const { env, authRoot } = await signedInRoot(dir);
  const gate = await externalGate();
  const calls = path.join(dir, 'calls');
  const fake = path.join(dir, 'fake-opencode');
  await writeFile(fake, script(`
const fs = await import('node:fs');
const args = process.argv.slice(2);
const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || '{}');
if (config.share !== 'disabled' || config.autoupdate !== false || process.env.OPENCODE_DISABLE_AUTOCOMPACT !== '1' || process.env.OPENCODE_DISABLE_PRUNE !== '1' || process.env.OPENCODE_DISABLE_PROJECT_CONFIG !== '1') process.exit(9);
if (args[0] === 'run') { const response = await fetch(process.env.LUNA_GUARD_URL + '/reserve', {method:'POST'}); if (response.status !== 204) process.exit(8); }
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
if (args[0] === 'serve') {
  const http = await import('node:http');
  const server = http.createServer((req,res) => res.end());
  server.listen(0, '127.0.0.1', () => console.log('opencode server listening on http://127.0.0.1:' + server.address().port));
  setInterval(() => {}, 1000);
} else {
  const previous = args.includes('--session') ? args[args.indexOf('--session') + 1] : null;
  process.stdout.write(JSON.stringify({type:'step_finish', sessionID: previous || 'opaque-test-session', part:{type:'step-finish', tokens:{input:10,output:2,reasoning:1,cache:{read:3,write:0}}, text:'RAW_SECRET'}}) + '\\n');
}`));
  await chmod(fake, 0o700);
  try {
    const result = await runOpenCodeThreeTurns({ binary: fake, cwd: root, env, prompts: ['cold', 'warm', 'restart'], authRoot, gate });
    assert.equal(gate.reserved(), 3);
    gate.beginProbe('still-open');
    gate.endProbe();
    assert.equal(result.turns.length, 3);
    assert.deepEqual(result.turns.map((turn) => turn.turn), [1, 2, 3]);
    assert.equal(result.sessionLabel, 'session-1');
    assert.ok(result.turns.every((turn) => !JSON.stringify(turn).includes('RAW_SECRET')));
    const lines = (await import('node:fs/promises')).readFile;
    const log = await lines(calls, 'utf8');
    const invocations = log.trim().split('\n').map((line) => JSON.parse(line));
    const serves = invocations.filter((args) => args[0] === 'serve');
    const runs = invocations.filter((args) => args[0] === 'run');
    assert.equal(serves.length, 2);
    assert.equal(runs.length, 3);
    assert.ok(runs.every((args) => args[args.indexOf('--model') + 1] === 'openai/gpt-5.6-luna'));
    assert.ok(runs[0].includes('--attach'));
    assert.ok(runs[1].includes('--attach'));
    assert.ok(runs[2].includes('--attach'));
    const attachedUrls = runs.map((args) => args[args.indexOf('--attach') + 1]);
    assert.equal(attachedUrls[0], attachedUrls[1]);
    assert.notEqual(attachedUrls[1], attachedUrls[2]);
    assert.equal(runs[2][runs[2].indexOf('--session') + 1], 'opaque-test-session');
    assert.equal(result.requestCount, 3);
    assert.equal(JSON.stringify(result).includes('opaque-test-session'), false);
  } finally {
    await gate.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('refuses a successful CLI exit without completed provider usage, including a hidden error event', async () => {
  for (const event of [
    { type: 'error', sessionID: 'opaque-test-session', error: { name: 'RAW_SECRET' } },
    { type: 'text', sessionID: 'opaque-test-session', part: { type: 'text', text: 'RAW_SECRET' } },
  ]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'luna-opencode-no-usage-'));
    const root = path.join(dir, 'fixture');
    await mkdir(root, { mode: 0o700 });
    const { env, authRoot } = await signedInRoot(dir);
    const gate = await externalGate();
    const fake = path.join(dir, 'fake-opencode');
    await writeFile(fake, script(`
if (process.argv[2] === 'serve') {
  const http = await import('node:http');
  const server = http.createServer((req, res) => res.end());
  server.listen(0, '127.0.0.1', () => console.log('opencode server listening on http://127.0.0.1:' + server.address().port));
  setInterval(() => {}, 1000);
} else {
  await fetch(process.env.LUNA_GUARD_URL + '/reserve', { method: 'POST' });
  console.log(JSON.stringify(${JSON.stringify(event)}));
}`));
    await chmod(fake, 0o700);
    try {
      await assert.rejects(runOpenCodeThreeTurns({ binary: fake, cwd: root, env, prompts: ['cold', 'warm', 'restart'], authRoot, gate }), /OpenCode turn.*(error|usage)/);
      assert.equal(gate.reserved(), 1);
      assert.equal(gate.halted(), true);
    } finally { await gate.close(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); }
  }
});

test('rejects unrelated signed-root contents and latches the externally owned gate closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luna-opencode-auth-'));
  const root = path.join(dir, 'fixture');
  await mkdir(root, { mode: 0o700 });
  const { env, authRoot } = await signedInRoot(dir);
  const gate = await externalGate();
  try {
    await writeFile(path.join(authRoot, 'instructions.md'), 'do not load');
    await assert.rejects(runOpenCodeThreeTurns({ binary: process.execPath, cwd: root, env, prompts: ['a','b','c'], authRoot, gate }), /unrelated files or instructions/);
    assert.equal(gate.halted(), true);
  } finally { await gate.close(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); }
});

test('fails closed when the server never announces a loopback address', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luna-opencode-bad-'));
  const root = path.join(dir, 'fixture');
  await mkdir(root, { mode: 0o700 });
  const fake = path.join(dir, 'fake-opencode');
  const calls = path.join(dir, 'calls');
  await writeFile(fake, script(`(await import('node:fs')).appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ') + '\\n'); if (process.argv[2] === "serve") { console.log("starting elsewhere"); process.exit(0); }`));
  await chmod(fake, 0o700);
  const { env, authRoot } = await signedInRoot(dir);
  const gate = await externalGate();
  try {
    await assert.rejects(runOpenCodeThreeTurns({ binary: fake, cwd: root, env, prompts: ['a','b','c'], authRoot, gate }), /OpenCode serve/);
    assert.equal((await (await import('node:fs/promises')).readFile(path.join(dir, 'calls'), 'utf8')).includes('run'), false);
  } finally { await gate.close(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); }
});
