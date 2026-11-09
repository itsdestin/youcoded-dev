import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRequests, compareRuns, summarizeRuns } from './metrics.mjs';

const request = (id, role = 'main', usage = {}) => ({
  id, role, status: 'completed', model: 'fixture-model',
  usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60,
    cacheWriteTokens: 0, reasoningTokens: 5, costUsd: 0.01, ...usage },
});
const run = (arm, taskId, repetition, success, tokens = 100) => ({
  schemaVersion: 1, arm, taskId, repetition, model: 'fixture-model',
  comparisonKey: 'matched-model-fixture-v1', status: 'completed', success,
  wallClockMs: 1000, finalText: 'A useful answer.',
  requests: [request(`${arm}-${taskId}-${repetition}`, 'main', { inputTokens: tokens, cacheReadTokens: Math.min(60, tokens) })],
});

test('counts physical requests once and excludes judge cost', () => {
  const result = aggregateRequests([request('a'), request('b', 'specialist'), request('c', 'compaction'), request('j', 'judge')]);
  assert.equal(result.agent.inputTokens.total, 300);
  assert.equal(result.agent.outputTokens.total, 60);
  assert.equal(result.agent.totalTokens, 360); // cache and reasoning are subsets
  assert.equal(result.judge.inputTokens.total, 100);
  assert.equal(result.agent.requestCount, 3);
  assert.throws(() => aggregateRequests([request('a'), request('a')]), /duplicate/i);
});

test('unknown usage never becomes a zero or a complete partial bill', () => {
  const result = aggregateRequests([request('a'), { ...request('failed'), status: 'failed', usage: null }]);
  assert.equal(result.agent.inputTokens.total, null);
  assert.equal(result.agent.inputTokens.observed, 100);
  assert.equal(result.agent.inputTokens.known, 1);
  assert.equal(result.agent.inputTokens.missing, 1);
  assert.equal(result.agent.totalTokens, null);
  assert.equal(result.agent.costUsd.total, null);
});

test('zero reported cost is known, unavailable reasoning remains unavailable', () => {
  const result = aggregateRequests([request('a', 'main', { costUsd: 0, reasoningTokens: null })]);
  assert.equal(result.agent.costUsd.total, 0);
  assert.equal(result.agent.reasoningTokens.total, null);
});

test('rejects negative, nonfinite and invalid subset measurements', () => {
  for (const usage of [{ inputTokens: -1 }, { costUsd: Infinity }, { cacheReadTokens: 101 }, { reasoningTokens: 21 }]) {
    assert.throws(() => aggregateRequests([request('a', 'main', usage)]), /invalid/i);
  }
});

test('empty request list cannot be advertised as free complete usage', () => {
  assert.equal(aggregateRequests([]).agent.inputTokens.total, null);
});

test('all-attempt totals include failed tasks and success denominator is explicit', () => {
  const result = summarizeRuns([run('base', 'easy', 0, true, 100), { ...run('base', 'hard', 0, false, 200), status: 'timeout' }]);
  assert.equal(result.attempts, 2);
  assert.equal(result.successes, 1);
  assert.equal(result.successRate, 0.5);
  assert.equal(result.totalTokens, 340);
  assert.equal(result.costPerSuccessUsd, 0.02);
  assert.equal(result.ungraded, 0);
});

test('ungraded runs are not silently scored as passes or completed failures', () => {
  const result = summarizeRuns([run('base', 'task', 0, null)]);
  assert.equal(result.successRate, null);
  assert.equal(result.ungraded, 1);
  assert.equal(result.costPerSuccessUsd, null);
});

test('pairs by task/repetition, exposes missing cells, separates common successes', () => {
  const result = compareRuns([
    run('base', 'easy', 0, true, 100), run('candidate', 'easy', 0, true, 80),
    run('base', 'hard', 0, true, 1000), run('candidate', 'hard', 0, false, 10),
    run('base', 'missing', 0, true),
  ], 'base', 'candidate');
  assert.equal(result.pairs.length, 2);
  assert.equal(result.missing.length, 1);
  assert.equal(result.commonSuccessPairs.length, 1);
  assert.equal(result.commonSuccessPairs[0].tokenDelta, -20);
  assert.equal(result.pairs[1].successDelta, -1);
});

test('refuses comparisons that mix different timing boundaries', () => {
  assert.throws(() => compareRuns([
    { ...run('a', 'x', 0, true), timingScope: 'launcher' },
    { ...run('b', 'x', 0, true), timingScope: 'harbor-agent-execution' },
  ], 'a', 'b'), /timing/i);
});

test('refuses synthetic versus live performance comparisons', () => {
  assert.throws(() => compareRuns([
    { ...run('a', 'x', 0, true), synthetic: true }, run('b', 'x', 0, true),
  ], 'a', 'b'), /synthetic/i);
});

test('refuses duplicate cells and mismatched comparison declarations', () => {
  assert.throws(() => compareRuns([run('a', 'x', 0, true), run('a', 'x', 0, true)], 'a', 'b'), /duplicate/i);
  assert.throws(() => compareRuns([run('a', 'x', 0, true), { ...run('b', 'x', 0, true), comparisonKey: 'different' }], 'a', 'b'), /comparison/i);
});
