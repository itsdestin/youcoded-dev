import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runBounded, sanitizeOpenCodeEvent, assertIsolatedEnvironment } from './live-controller.mjs';

test('times out a process and leaves no live child', async () => {
  const result = await runBounded(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: '/tmp', env: { PATH: process.env.PATH }, timeoutMs: 70,
  });
  assert.equal(result.timedOut, true);
  await assert.rejects(() => new Promise((resolve, reject) => {
    const child = spawn('kill', ['-0', String(result.pid)]);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('gone')));
  }));
});

test('never serializes raw text or session identity from JSON stream', () => {
  const line = JSON.stringify({ type: 'step_finish', sessionID: 'SECRET_SESSION', part: {
    type: 'step-finish', tokens: { input: 120, output: 10, reasoning: 2, cache: { read: 80, write: 0 } },
    text: 'PRIVATE_PROMPT', messageID: 'SECRET_MESSAGE',
  } });
  const safe = sanitizeOpenCodeEvent(line);
  assert.deepEqual(safe, { type: 'step_finish', inputTokens: 200, outputTokens: 12, cacheReadTokens: 80, cacheWriteTokens: null, reasoningTokens: 2 });
  assert.ok(!JSON.stringify(safe).includes('SECRET'));
  assert.ok(!JSON.stringify(safe).includes('PRIVATE'));
  assert.equal(sanitizeOpenCodeEvent('{"type":"text","part":{"text":"PRIVATE_PROMPT"}}'), null);
});

test('normalized zero cache is unknown, not proof that provider reported zero', () => {
  const line = JSON.stringify({ type: 'step_finish', part: {
    type: 'step-finish', tokens: { input: 100, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
  } });
  const safe = sanitizeOpenCodeEvent(line);
  assert.equal(safe.cacheReadTokens, null);
  assert.equal(safe.inputTokens, null);
});

test('isolated environment refuses real home and missing strict guard', () => {
  assert.throws(() => assertIsolatedEnvironment({ HOME: '/home/destin', LUNA_GUARD_URL: 'http://127.0.0.1:1234', YOUCODED_LUNA_EXPERIMENT: '1' }, '/tmp/clone-1'));
  assert.throws(() => assertIsolatedEnvironment({ HOME: '/tmp/private', YOUCODED_LUNA_EXPERIMENT: '1' }, '/tmp/clone-1'));
});
