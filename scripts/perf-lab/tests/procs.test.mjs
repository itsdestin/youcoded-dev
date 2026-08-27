import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatTicks, parseSmapsPssKb, cpuPercent } from '../procs.mjs';

test('parseStatTicks sums utime+stime after the last paren', () => {
  const line = '1234 (you coded) helper) S 1 1 1 0 -1 4194560 100 0 0 0 250 75 0 0 20 0 30 0 5000 1 1 1';
  assert.equal(parseStatTicks(line), 325);
});
test('parseSmapsPssKb reads the Pss line', () => {
  assert.equal(parseSmapsPssKb('Rss:  10 kB\nPss:   4321 kB\nPss_Anon: 1 kB\n'), 4321);
});
test('cpuPercent is % of one core over the window', () => {
  const before = new Map([[1, 100], [2, 200]]);
  const after  = new Map([[1, 150], [2, 300]]);   // 150 ticks = 1.5 s of CPU over 10 s
  const r = cpuPercent(before, after, 10);
  assert.equal(r.totalPct, 15);
  assert.equal(r.perPid.get(2), 10);
});
