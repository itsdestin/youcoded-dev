// Guards the phone scenario's reading of the app's log lines: if remote-timings.ts changes its wording,
// these fail here instead of the rig timing out on a real run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimings, parseAnswer, summarise, remoteLinesSince, buildSummary } from '../scenario-phone.mjs';

test('parseTimings reads a load report', () => {
  const t = parseTimings('timings (page navigate, 1.2 MB downloaded), ms: page 400 · code ran 800 · connected 1500 · drawn 5000');
  assert.equal(t.kind, 'load'); assert.equal(t.nav, 'navigate');
  assert.equal(t.downloadedBytes, Math.round(1.2 * 1024 * 1024));
  assert.deepEqual(t.marks, { page: 400, 'code ran': 800, connected: 1500, drawn: 5000 });
});
test('parseTimings reads a reconnect report and rejects other lines', () => {
  assert.equal(parseTimings('timings (reconnect), ms: connected 900 · drawn 1900').kind, 'reconnect');
  assert.equal(parseTimings('page ready'), null);
});
test('parseAnswer reads the computer\'s answer lines', () => {
  assert.deepEqual(parseAnswer('conversation answered in 80 ms, 200 KB'), { what: 'conversation', ms: 80, bytes: 204800 });
  assert.equal(parseAnswer('connected (page announces readiness)'), null);
});
test('summarise gives median and range, ignoring missing values', () => {
  assert.deepEqual(summarise([3, 1, 2, null]), { median: 2, min: 1, max: 3, n: 3 });
  assert.equal(summarise([null]), null);
});
test('remoteLinesSince keeps only Remote lines at or after the time', () => {
  const log = [
    JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', component: 'Remote', msg: 'old' }),
    JSON.stringify({ ts: '2026-01-01T00:00:05.000Z', component: 'Other', msg: 'x' }),
    JSON.stringify({ ts: '2026-01-01T00:00:06.000Z', component: 'Remote', msg: 'new' }),
    '{"half written',
  ].join('\n');
  assert.deepEqual(remoteLinesSince(log, '2026-01-01T00:00:01.000Z').map((e) => e.msg), ['new']);
});
test('buildSummary tolerates a leg with no conversation answer', () => {
  const leg = { marks: { drawn: 10 }, wallMs: 12, proxy: { downBytes: 2048, upBytes: 1024, connections: 1 }, conversationAnswer: null, terminalAnswer: null };
  assert.equal(buildSummary([{ cold: leg, reopen: leg, reconnect: leg }]).cold.marks.drawn.median, 10);
});
