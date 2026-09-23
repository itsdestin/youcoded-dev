import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeUsageRecords, scoreUsage } from './usage.mjs';

const record = (overrides = {}) => ({
  arm: 'youcoded', repetition: 1, session: 's1', phase: 'pre-restart', turn: 2, sequence: 1,
  purpose: 'root-chat', outcome: 'success', inputTokens: 100, outputTokens: 20,
  reasoningTokens: null, cacheReadTokens: 60, cacheWriteTokens: null, durationMs: 1000,
  clientVersion: '1.2.3', model: 'gpt-5-6-luna', providerRoute: 'chatgpt-oauth',
  inputIncludesCached: true, usageSource: 'provider-per-request', ...overrides,
});

test('normalizes allowed synthetic records, preserving null versus zero and unknown usage', () => {
  const [normalized] = normalizeUsageRecords([record({ inputTokens: 0, cacheReadTokens: 0, outputTokens: null })]);
  assert.equal(normalized.inputTokens, 0);
  assert.equal(normalized.cacheReadTokens, 0);
  assert.equal(normalized.outputTokens, null);
  assert.equal(normalized.usageKnown, false);
});

test('rejects unsafe counts, booleans, impossible cache counts, and unexpected fields', () => {
  for (const bad of [true, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeUsageRecords([record({ inputTokens: bad })]), /inputTokens/);
  }
  assert.throws(() => normalizeUsageRecords([record({ inputTokens: 2, cacheReadTokens: 3 })]), /cacheReadTokens/);
  assert.throws(() => normalizeUsageRecords([record({ request: 'private body' })]), /Unexpected/);
  assert.throws(() => normalizeUsageRecords([record({ sessionId: 'raw-id' })]), /Unexpected/);
});

test('scores warm root requests excluding compatibility, cold first, auxiliaries and failures', () => {
  const rows = [
    record({ turn: 1, sequence: 1, cacheReadTokens: 0 }),
    record({ turn: 2, sequence: 2 }),
    record({ turn: 3, sequence: 3, purpose: 'title' }),
    record({ turn: 4, sequence: 4, outcome: 'failed' }),
    record({ phase: 'compatibility', turn: 1, sequence: 1 }),
  ];
  const result = scoreUsage(rows, { completedScoredTurns: { 'youcoded:1:s1': 3 } });
  const run = result.repetitions[0];
  assert.equal(run.warmReuseRate, 0.6);
  assert.equal(run.freshInputPerCompletedTurn, 40 / 3);
  assert.equal(run.cleanRequests, 1);
  assert.equal(run.excluded.compatibility, 1);
  assert.equal(run.excluded.coldFirst, 1);
  assert.equal(run.excluded.auxiliary, 1);
  assert.equal(run.excluded.failed, 1);
});

test('marks arm inconclusive below 70% root cache detail or with fewer than two repetitions', () => {
  const rows = [record(), record({ repetition: 2, session: 's2', sequence: 1, turn: 1, cacheReadTokens: null })];
  const result = scoreUsage(rows);
  assert.equal(result.arms.youcoded.verdict, 'inconclusive');
  assert.deepEqual(result.arms.youcoded.inconclusiveReasons, ['root-cache-detail-coverage-below-70%', 'fewer-than-two-valid-repetitions']);
});

test('requires bounded client metadata, rejects nested fields and unsafe property descriptors', () => {
  for (const field of ['clientVersion', 'model', 'providerRoute']) {
    assert.throws(() => normalizeUsageRecords([record({ [field]: undefined })]), new RegExp(field));
    assert.throws(() => normalizeUsageRecords([record({ [field]: 'x'.repeat(129) })]), new RegExp(field));
    assert.throws(() => normalizeUsageRecords([record({ [field]: 'real/session-id?' })]), new RegExp(field));
  }
  assert.throws(() => normalizeUsageRecords([record({ itemPrefixClassification: 'same' })]), /Unexpected/);
  assert.throws(() => normalizeUsageRecords([record({ itemPrefixCounts: { same: 1 } })]), /Unexpected/);
  const nested = record();
  Object.defineProperty(nested, 'model', { enumerable: true, get() { return 'unsafe'; } });
  assert.throws(() => normalizeUsageRecords([nested]), /accessor/);
  const symbol = record();
  symbol[Symbol('payload')] = 'hidden';
  assert.throws(() => normalizeUsageRecords([symbol]), /symbol/);
  assert.equal(normalizeUsageRecords([record({ expectedRebuild: null })])[0].expectedRebuild, null);
});

test('reports observed operational burden including failed root attempts', () => {
  const result = scoreUsage([
    record({ turn: 1, sequence: 1, cacheReadTokens: 0 }),
    record({ turn: 2, sequence: 2, inputTokens: 30, cacheReadTokens: null, outputTokens: 7, outcome: 'failed' }),
  ]);
  const burden = result.repetitions[0].operational;
  assert.equal(burden.inputTokens, 130);
  assert.equal(burden.outputTokens, 27);
  assert.equal(burden.unknownInputRequests, 0);
  assert.equal(burden.unknownOutputRequests, 0);
  assert.equal(burden.observedRequests, 2);
});

test('reports compatibility probe consumption separately from repetition burden', () => {
  const result = scoreUsage([
    record({ phase: 'compatibility', inputTokens: 50, outputTokens: 8, cacheReadTokens: null }),
    record({ turn: 1, sequence: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 }),
  ]);
  assert.equal(result.repetitions[0].operational.inputTokens, 100);
  assert.equal(result.probeOperational.observedRequests, 1);
  assert.equal(result.probeOperational.inputTokens, 50);
  assert.equal(result.probeOperational.outputTokens, 8);
  assert.equal(result.allObservedOperational.inputTokens, 150);
  assert.equal(result.allObservedOperational.outputTokens, 28);
});

test('compatibility rows do not affect cross-arm token semantics', () => {
  const result = scoreUsage([
    record({ phase: 'compatibility', inputIncludesCached: true }),
    record({ arm: 'opencode', session: 'o1', inputIncludesCached: false }),
  ]);
  assert.ok(!result.arms.youcoded.inconclusiveReasons.includes('incompatible-input-token-semantics'));
  assert.ok(!result.arms.opencode.inconclusiveReasons.includes('incompatible-input-token-semantics'));
});

test('requires comparable cache semantics and exposes source annotation', () => {
  assert.throws(() => normalizeUsageRecords([record({ inputIncludesCached: null })]), /inputIncludesCached/);
  const mismatch = scoreUsage([record(), record({ arm: 'opencode', session: 'o1', inputIncludesCached: false })]);
  assert.ok(mismatch.arms.youcoded.inconclusiveReasons.includes('incompatible-input-token-semantics'));
  const result = scoreUsage([record()]);
  assert.match(result.sourceSemantics, /already allowlisted/);
  assert.match(result.sourceSemantics, /does not make up OpenCode per-request usage/);
});
