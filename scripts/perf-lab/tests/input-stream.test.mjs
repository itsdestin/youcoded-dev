import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOptions, summariseInput, scheduleKeys, runInputLeg, closeInputSessions } from '../input-stream.mjs';

const samples = Array.from({ length: 36 }, (_, i) => ({ char: 'a', eventToListenerMs: 2, inputToDomMs: 3, inputToTwoRafMs: 17, dispatchWallMs: 4, index: i }));
const valid = () => ({ expected: 'a'.repeat(36), draft: 'a'.repeat(36), mirror: 'a'.repeat(36), composer: { visible: true, disabled: false, focused: true }, stream: { plannedDeltas: 3000, deltasSent: 3000, perSec: 150, aborted: false, during: Array.from({ length: 36 }, (_, i) => ({ before: i + 1, after: i + 2, activeBefore: true, activeAfter: true })) }, samples, probe: { longtaskSupported: true, longtasks: [], rafGaps: [] }, ipc: { pings: 10, rejectedPings: 0, medianMs: 2, p95Ms: 3, maxMs: 3, totalStallMs: 0 }, cleared: { draft: '', mirror: '' } });

test('input fixture is unique and shared package is refused before fixture creation and launcher sweep',()=>{
  const source=readFileSync(new URL('../input-stream.mjs',import.meta.url),'utf8');
  assert.match(source,/mkdtempSync\(join\(ROOT,'scratch\/perf-lab\/input-stream-fixture-'\)\)/);
  assert.ok(source.indexOf('refusePackageProcesses(build.appDir);')<source.indexOf('const fixture=buildFixture('));
  assert.match(source,/cdpPort:9571,refuseExisting:true/);
});
test('reverse-order cleanup cannot reverse the report session identity mapping', async () => {
  const ids = ['huge', 'medium', 'small', 'empty', 'native-a', 'native-b'];
  const report = { sessions: { ids } };
  const closed = [];
  await closeInputSessions(ids, async id => { closed.push(id); });
  assert.deepEqual(closed, ['native-b', 'native-a', 'empty', 'small', 'medium', 'huge']);
  assert.deepEqual(report.sessions.ids, ['huge', 'medium', 'small', 'empty', 'native-a', 'native-b']);
});

test('input metadata cannot overwrite an incomplete verdict', () => {
  const result = summariseInput({ ...valid(), samples: [], status: 'measured', reasons: [], p95: { fake: 0 } }, false);
  assert.equal(result.status, 'incomplete');
  assert.ok(result.reasons.length > 0);
  assert.equal(result.p95, null);
});

test('unsupported or failed longtask observer cannot certify input timings', () => {
  for (const probe of [{ ...valid().probe, longtaskSupported: false }, { ...valid().probe, observerError: 'not supported' }]) {
    const verdict = summariseInput({ ...valid(), probe }, false);
    assert.equal(verdict.status, 'incomplete');
    assert.ok(verdict.reasons.some(reason => /observer|probe|longtask/.test(reason)));
  }
});

test('missing or failed IPC and failed probe cleanup invalidate the observation', () => {
  for (const ipc of [null, { error: 'disconnected' }, { ...valid().ipc, pings: 0 }, { ...valid().ipc, rejectedPings: 1 }]) {
    assert.equal(summariseInput({ ...valid(), ipc }, false).status, 'incomplete');
  }
  assert.equal(summariseInput({ ...valid(), probeError: 'cleanup failed' }, false).status, 'incomplete');
});

test('CLI limits duration and requires absolute paths', () => {
  const o = parseOptions(['--checkout', '/tmp/app', '--app-dir', '/tmp/pkg', '--out', '/tmp/out.json']);
  assert.equal(o.maxMinutes, 5);
  assert.equal(o.appDir, '/tmp/pkg');
  for (const args of [['--max-minutes','11'], ['--max-minutes','0'], ['--checkout','relative'], ['--out','relative'], ['--app-dir','relative'], ['--display','hello']]) assert.throws(() => parseOptions(args));
});

test('scheduler waits for each dispatch and rejects an expired deadline, without stacking keys', async () => {
  let active = 0, max = 0, count = 0;
  await scheduleKeys('abc', async () => { active++; max = Math.max(max, active); await Promise.resolve(); count++; active--; }, { intervalMs: 0, wait: async () => {} });
  assert.equal(count, 3); assert.equal(max, 1);
  await assert.rejects(scheduleKeys('abc', async () => {}, { deadline: () => false, wait: async () => {} }), /deadline/);
});

test('wrong field, disabled, hidden, dropped input, wrong mirror or failed clearing invalidates a leg', () => {
  const cases = [
    { composer: { visible: false, disabled: false, focused: true } },
    { composer: { visible: true, disabled: true, focused: true } },
    { composer: { visible: true, disabled: false, focused: false } },
    { draft: 'a'.repeat(35) }, { mirror: '' }, { cleared: { draft: '', mirror: 'old' } },
    { samples: [] }, { samples: samples.slice(0, 35) },
  ];
  for (const patch of cases) assert.equal(summariseInput({ ...valid(), ...patch }, true).status, 'incomplete', JSON.stringify(patch));
});

test('missing, overlapping, invalid or insufficient samples never produce an informative p95', () => {
  for (const patch of [{ samples: samples.map((s, i) => i === 2 ? { ...s, inputToDomMs: null } : s) }, { samples: samples.map((s, i) => i === 3 ? { ...s, index: 2 } : s) }, { samples: samples.slice(0, 19) }]) {
    const r = summariseInput({ ...valid(), ...patch }, true);
    assert.equal(r.status, 'incomplete'); assert.equal(r.p95, null);
  }
  const good = summariseInput(valid(), true);
  assert.equal(good.status, 'measured'); assert.equal(good.p95.inputToTwoRafMs, 17);
  assert.equal(good.raw.length, 36);
});

test('stream must be actively delivering deltas across every timed key, not just complete afterward', () => {
  const row = valid(); row.stream.during[5].activeAfter = false;
  assert.equal(summariseInput(row, true).status, 'incomplete');
  assert.equal(summariseInput({ ...valid(), stream: { ...valid().stream, during: [] } }, true).status, 'incomplete');
  assert.equal(summariseInput({ ...valid(), stream: { ...valid().stream, deltasSent: 0 } }, true).status, 'incomplete');
  assert.equal(summariseInput({ ...valid(), stream: null }, false).status, 'measured');
});

test('leg cleans the composer on a dispatch error without converting the error to zero samples', async () => {
  let cleared = false;
  await assert.rejects(runInputLeg({ prepare: async () => {}, key: async () => { throw Error('CDP gone'); }, finish: async () => ({}), clear: async () => { cleared = true; } }, 'a'.repeat(36), { wait: async () => {} }), /CDP gone/);
  assert.equal(cleared, true);
});
