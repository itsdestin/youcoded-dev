import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHarbor } from './harbor-import.mjs';
const identity = { arm: 'competitor', taskId: 'task', repetition: 0, comparisonKey: 'matched-v1' };
const result = { agent_info: { name: 'pi', version: 'pinned', model_info: { name: 'model' } },
  agent_result: { n_input_tokens: 100, n_output_tokens: 20, n_cache_tokens: 50, cost_usd: 0.01 },
  verifier_result: { rewards: { reward: 1 } },
  agent_execution: { started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:00:02Z' } };
test('imports verified outcomes and execution time without adding cached tokens twice', () => {
  const r = fromHarbor(result, identity);
  assert.equal(r.success, true);
  assert.equal(r.wallClockMs, 2000);
  assert.equal(r.requests[0].usage.inputTokens, 100);
  assert.equal(r.accountingGranularity, 'adapter-run-total');
  assert.match(r.costSource, /adapter/);
});
test('preserves synthetic marker so container smoke cannot become a model result', () => {
  const r = fromHarbor({ ...result, agent_result: { ...result.agent_result,
    metadata: { youcoded_lab: { synthetic: true } } } }, identity);
  assert.equal(r.synthetic, true);
});
test('missing usage stays unknown; exceptions cannot be successful', () => {
  const r = fromHarbor({ ...result, agent_result: null, exception_info: { exception_type: 'Timeout' } }, identity);
  assert.equal(r.success, false);
  assert.equal(r.status, 'failed');
  assert.equal(r.requests[0].usage, null);
});
test('does not invent latency or interpret arbitrary rewards as binary success', () => {
  assert.equal(fromHarbor({ ...result, agent_execution: null }, identity).wallClockMs, null);
  assert.equal(fromHarbor({ ...result, verifier_result: { rewards: { quality: 0.8 } } }, identity).success, null);
});
