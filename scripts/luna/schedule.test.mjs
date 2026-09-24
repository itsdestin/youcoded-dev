import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROMPTS } from './fixture.mjs';
import { startRequestGate } from './request-gate.mjs';
import { runOfflineSimulation } from './schedule.mjs';

async function withSetup(run) {
  const privateParent = await mkdtemp(path.join(os.tmpdir(), 'luna-schedule-test-'));
  const gate = await startRequestGate({ limit: 100, budgets: { perTurn: 3, perRepetition: 18, perProbe: 1, turnMs: 3000 } });
  try { await run({ privateParent, gate }); }
  finally { await gate.close(); await rm(privateParent, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); }
}

async function correctFakeTurn({ arm, repetition, turn, root, prompt }) {
  assert.equal(prompt, PROMPTS[turn - 1]);
  if (turn === 3) await writeFile(path.join(root, 'config.json'), '{"theme":"light","retryLimit":3}\n');
  if (turn === 4) await writeFile(path.join(root, 'src/app.js'), "export const greeting = 'LUNA-SECOND-CHANGE';\nexport const modules = ['alpha', 'beta', 'gamma'];\n");
  return { session: `${arm}-fake-${repetition}`, processId: turn <= 4 ? `${arm}-first-${repetition}` : `${arm}-second-${repetition}` };
}

test('schedules six exact turns, private clones and process restarts with balanced arm order', async () => withSetup(async ({ privateParent, gate }) => {
  const sent = [];
  const restarted = [];
  const result = await runOfflineSimulation({ privateParent, gate, thirdOrder: 'youcoded',
    simulateTurn: async input => { sent.push(input); return correctFakeTurn(input); },
    simulateRestart: async input => { restarted.push(input); return { processId: `${input.arm}-second-${input.repetition}` }; },
  });
  assert.deepEqual(result.order, ['youcoded', 'opencode', 'opencode', 'youcoded', 'youcoded', 'opencode']);
  assert.equal(sent.length, 36);
  assert.equal(restarted.length, 6);
  assert.equal(new Set(sent.map(s => s.root)).size, 6);
  for (const [index, run] of result.runs.entries()) {
    const turns = sent.slice(index * 6, index * 6 + 6);
    assert.deepEqual(turns.map(t => t.prompt), PROMPTS);
    assert.deepEqual(turns.map(t => t.phase), ['pre-restart', 'pre-restart', 'pre-restart', 'pre-restart', 'post-restart', 'post-restart']);
    assert.equal(run.state, 'both-change');
    assert.equal((await readFile(path.join(run.root, 'AGENTS.md'), 'utf8')).includes(PROMPTS[5]), false);
  }
  assert.equal(gate.reserved(), 0);
}));

test('refuses a fake restart that returns the previous client process', async () => withSetup(async ({ privateParent, gate }) => {
  await assert.rejects(runOfflineSimulation({ privateParent, gate, thirdOrder: 'opencode',
    simulateTurn: correctFakeTurn,
    simulateRestart: async input => ({ processId: input.processId }),
  }), /new process/i);
}));

test('refuses continuation on a different observed session identity', async () => withSetup(async ({ privateParent, gate }) => {
  await assert.rejects(runOfflineSimulation({ privateParent, gate, thirdOrder: 'opencode',
    simulateTurn: async input => ({ ...(await correctFakeTurn(input)), session: input.turn === 5 ? 'different-session' : `${input.arm}-fake-${input.repetition}` }),
    simulateRestart: async input => ({ processId: `${input.arm}-second-${input.repetition}` }),
  }), /same session/i);
}));
