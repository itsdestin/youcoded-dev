import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOptions, summariseCycles, runCycles, createOwnedSession, recordCount, lifecycleStartupReady, makeBound } from '../short-lifecycle.mjs';

const metrics = { TaskDuration: 1, ScriptDuration: 0.5, LayoutCount: 3, RecalcStyleCount: 3, LayoutDuration: 0.1, RecalcStyleDuration: 0.1, JSHeapUsedSize: 100, Nodes: 10, JSEventListeners: 5 };
const sample = (pss = 12) => ({ metrics: { ...metrics }, pss: { totalMb: pss, perPid: [{ pid: 123, type: 'main', mb: pss }] } });
const complete = (i, pss) => ({ index: i, created: [`owned-${i}-a`, `owned-${i}-b`], closed: [`owned-${i}-b`, `owned-${i}-a`], before: { ids: [], mounted: 0 }, openState: { ids: [`owned-${i}-a`, `owned-${i}-b`], mounted: 2 }, after: { ids: [], mounted: 0 }, output: Array.from({ length: 2 }, () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false })), natural: sample(pss), afterGc: { status: 'unmeasured', reason: 'not requested', sample: null }, persistedRecords: { before: 2, after: 4 } });

test('lifecycle fixture is unique and shared package is refused before fixture creation and launcher sweep',()=>{
  const source=readFileSync(new URL('../short-lifecycle.mjs',import.meta.url),'utf8');
  assert.match(source,/mkdtempSync\(join\(ROOT, 'scratch\/perf-lab\/short-lifecycle-fixture-'\)\)/);
  const fixtureStart = source.indexOf('const fixture = prepareLifecycleFixture(');
  assert.ok(fixtureStart > 0);
  assert.ok(source.indexOf('refusePackageProcesses(build.appDir);') < fixtureStart);
  assert.match(source,/cdpPort: 9569, refuseExisting: true/);
});
test('a timed-out creation destroys its late owned session, never an existing ID', async () => {
  for (const id of ['late-owned', 'anchor']) {
    let finish;
    const closed = [];
    const pending = new Promise(resolve => { finish = resolve; });
    const driver = { create: () => pending, close: async value => { closed.push(value); } };
    await assert.rejects(createOwnedSession(driver, 'new', () => Promise.reject(new Error('deadline')), ['anchor']), /deadline/);
    finish(id);
    await new Promise(setImmediate);
    assert.deepEqual(closed, id === 'anchor' ? [] : ['late-owned']);
  }
});

test('a run with forced collection labels later pre-collection observations as GC-intervened', () => {
  const rows = [complete(1, 12), complete(2, 12)];
  assert.equal(summariseCycles(rows).gcPolicy, 'natural');
  rows[0].gcRequested = true;
  assert.equal(summariseCycles(rows).gcPolicy, 'intervened');
});

test('lifecycle sampling waits for startup repair copies rather than counting them as cycle growth', () => {
  const marks = names => names.map(name => JSON.stringify({ name })).join('\n');
  const done = ['bg:reconcile:copies-done', 'bg:chatsearch-refresh:done', 'bg:materialize:done', 'bg:slug-repair:done'];
  assert.equal(lifecycleStartupReady(marks(done)), true);
  assert.equal(lifecycleStartupReady(marks(done.slice(1))), false);
  assert.equal(lifecycleStartupReady('{partial'), false);
});

test('saved-file counting tolerates a vanished lock directory but does not hide access errors', () => {
  const file = name => ({ name, isFile: () => true, isDirectory: () => false });
  const dir = name => ({ name, isFile: () => false, isDirectory: () => true });
  const missing = Object.assign(new Error('gone'), { code: 'ENOENT' });
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  const read = path => {
    if (path.endsWith('/.youcoded')) return [file('one.jsonl'), dir('transient.lock')];
    if (path.endsWith('/transient.lock')) throw missing;
    return [file('two.jsonl'), file('not-json.txt')];
  };
  assert.equal(recordCount('/fixture', read), 2);
  assert.throws(() => recordCount('/fixture', () => { throw denied; }), /denied/);
  assert.throws(() => recordCount('/fixture', () => Array.from({ length: 10001 }, () => file('many.jsonl'))), /record cap/);
});

test('an incomplete cycle never contributes to the post-warmup trend', () => {
  const broken = { ...complete(3, 900), completed: false, reason: 'scan failed' };
  const report = summariseCycles([complete(1, 100), complete(2, 12), broken]);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.trend.pssMb.samples, 1);
  assert.equal(report.trend.pssMb.change, null);
});

test('CLI validates bounded cycles and minutes, paths, defaults and stamped package option', () => {
  const o = parseOptions(['--checkout', '/tmp/app', '--app-dir', '/tmp/package', '--out', '/tmp/report.json']);
  assert.equal(o.cycles, 5);
  assert.equal(o.maxMinutes, 10);
  assert.equal(o.appDir, '/tmp/package');
  assert.equal(parseOptions(['--post-gc', '--cycles', '2']).postGc, true);
  for (const args of [['--cycles', '0'], ['--cycles', '6'], ['--cycles', 'oops'], ['--max-minutes', '11'], ['--max-minutes', 'NaN'], ['--checkout', 'relative'], ['--app-dir', 'relative'], ['--out', 'relative']]) assert.throws(() => parseOptions(args));
});

test('missing work, output, leaked sessions and mounted views make a cycle incomplete', () => {
  const failures = [
    { ...complete(1, 12), created: [] },
    { ...complete(1, 12), openState: { ids: [], mounted: 0 } },
    { ...complete(1, 12), output: [] },
    { ...complete(1, 12), output: [{ ...complete(1, 12).output[0], persistedExact: false }, complete(1, 12).output[1]] },
    { ...complete(1, 12), after: { ids: ['owned-1-a'], mounted: 1 } },
    { ...complete(1, 12), closed: [] },
    { ...complete(1, 12), output: [{ deltasSent: 0, plannedDeltas: 20, chars: 0, shown: false, exact: false }] },
  ];
  for (const row of failures) {
    const result = summariseCycles([row]);
    assert.equal(result.status, 'incomplete');
    assert.ok(result.reasons.length, JSON.stringify(row));
  }
});

test('missing or nonfinite natural counters cannot be measured; failed GC is unmeasured, not zero', () => {
  for (const invalid of [null, NaN, Infinity]) {
    const r = complete(1, 12);
    r.natural.metrics.TaskDuration = invalid;
    assert.equal(summariseCycles([r]).status, 'incomplete');
  }
  const r = complete(1, 12);
  r.afterGc = { status: 'unmeasured', reason: 'CDP refused collection', sample: null };
  const result = summariseCycles([r]);
  assert.equal(result.status, 'measured');
  assert.equal(result.cycles[0].afterGc.sample, null);
  assert.equal(result.cycles[0].afterGc.reason, 'CDP refused collection');
});

test('warmup is distinct; trend starts with cycle two and persisted growth is context, not a leak verdict', () => {
  const result = summariseCycles([complete(1, 100), complete(2, 12), complete(3, 14)]);
  assert.equal(result.status, 'measured');
  assert.equal(result.rawSampleCount, 3);
  assert.deepEqual(result.trend.pssMb, { samples: 2, change: 2 });
  assert.equal(result.cycles[0].warmup, true);
  assert.equal(result.cycles[1].warmup, false);
  assert.equal(result.cycles[2].deltaFromPrevious.pssMb, 2);
  assert.equal(result.leakVerdict, undefined);
});

test('GC rejection stays unmeasured and does not overwrite natural counters', async () => {
  let ids = ['anchor'];
  const driver = {
    state: async () => ({ ids: [...ids], mounted: ids.length }),
    create: async name => { ids.push(name); return name; },
    switchTo: async () => {},
    send: async () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }),
    close: async id => { ids = ids.filter(x => x !== id); },
    sample: async () => sample(12), records: async () => 1,
    collectGc: async () => { throw new Error('CDP disconnected'); },
  };
  const rows = await runCycles(null, null, { cycles: 1, driver, bound: p => p, postGc: true });
  assert.equal(rows[0].afterGc.status, 'unmeasured');
  assert.match(rows[0].afterGc.reason, /CDP disconnected/);
  assert.equal(rows[0].afterGc.sample, null);
  assert.equal(rows[0].natural.pss.totalMb, 12);
  assert.equal(summariseCycles(rows).status, 'measured');
  assert.deepEqual(ids, ['anchor']);
});

test('cleanup failure stays incomplete and prevents the next cycle', async () => {
  let creates = 0, closes = 0;
  const driver = {
    state: async () => ({ ids: creates && !closes ? ['anchor', 'owned-a', 'owned-b'] : ['anchor'], mounted: creates && !closes ? 3 : 1 }),
    create: async () => ['owned-a', 'owned-b'][creates++],
    switchTo: async () => {},
    send: async () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }),
    close: async () => { closes++; throw new Error('destroy failed'); },
    sample: async () => sample(), records: async () => 1,
  };
  const rows = await runCycles(null, null, { cycles: 3, driver, bound: p => p });
  assert.equal(rows.length, 1);
  assert.equal(creates, 2);
  assert.match(rows[0].reason, /destroy failed/);
  assert.equal(summariseCycles(rows).status, 'incomplete');
});

test('outer lifecycle deadline reserves cleanup time and cancels observation timers with a fake clock', async () => {
  let now = 0, callback, delay, cleared = 0;
  const bound = makeBound(1, { now: () => now, setTimer: (fn, ms) => { callback = fn; delay = ms; return 7; }, clearTimer: id => { assert.equal(id, 7); cleared++; } });
  const pending = bound(new Promise(() => {}), 'stuck', 100000);
  assert.equal(delay, 48000);
  callback();
  await assert.rejects(pending, /timeout at stuck/);
  assert.equal(cleared, 1);
  now = 48000;
  await assert.rejects(bound(Promise.resolve(), 'next'), /deadline/);
  assert.throws(() => makeBound(11), /1..10/);
});

test('matched checkpoints separate natural and forced GC trajectories on the existing cycle driver', async () => {
  const { captureCheckpoint, RESOURCE_METRICS } = await import('../resource-checkpoint.mjs');
  let ids = ['anchor'];
  const samples = [];
  const driver = {
    state: async () => ({ ids: [...ids], mounted: ids.length }),
    create: async name => { ids.push(name); return name; },
    switchTo: async () => {}, send: async () => complete(1, 12).output[0],
    close: async id => { ids = ids.filter(x => x !== id); }, records: async () => 0, collectGc: async () => {},
    sample: async (phase, gcPolicy) => {
      samples.push([phase, gcPolicy]);
      return captureCheckpoint({ phase, gcPolicy, identity: { source: 'sha', run: 'run-1', target: 'target-1' }, readEpoch: async () => ({ documentEpoch: '100', url: 'app://' }), readProcessStart: () => 'start-123', cdp: { send: async () => ({ metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }) }, family: () => [123],
        readPss: () => ({ totalMb: gcPolicy === 'forced-gc' ? 8 : 12, perPid: [{ pid: 123, mb: gcPolicy === 'forced-gc' ? 8 : 12 }] }), now: () => 0 });
    },
  };
  assert.equal(parseOptions(['--resource-checkpoints']).resourceCheckpoints, true);
  const rows = await runCycles(null, null, { cycles: 3, driver, resourceCheckpoints: true, postGc: true });
  const result = summariseCycles(rows);
  assert.equal(result.status, 'measured');
  assert.deepEqual(samples.slice(0, 5).map(s => s[0]), ['before', 'grown', 'switched', 'released', 'released']);
  assert.equal(samples[3][1], 'gc-intervened-pre-collection');
  assert.equal(samples[4][1], 'forced-gc');
  assert.equal(result.trajectories.natural, null);
  assert.equal(result.trajectories.intervenedPreGc.pssMb.samples, 2);
  assert.equal(result.trajectories.forcedGc.pssMb.samples, 2);
  assert.equal(rows[0].natural.pss.totalMb, 12);
  assert.equal(rows[0].afterGc.sample.pss.totalMb, 8);
  assert.deepEqual(ids, ['anchor']);
  await assert.rejects(runCycles(null, null, { cycles: 6, driver }), /1..5/);
});

test('matched checkpoints stay ordered and separate GC policy; failed mount restoration stops cycles', async () => {
  let ids = ['anchor'], restored = false;
  const phases = [];
  const driver = {
    state: async () => ({ ids: [...ids], mounted: ids.length + (restored ? 1 : 0) }),
    create: async name => { ids.push(name); return name; },
    switchTo: async () => {},
    send: async () => complete(1, 12).output[0],
    close: async id => { ids = ids.filter(x => x !== id); restored = true; },
    sample: async (phase, gcPolicy) => { phases.push([phase, gcPolicy]); return sample(); },
    records: async () => 0,
  };
  const rows = await runCycles(null, null, { cycles: 2, driver, resourceCheckpoints: true,
    bound: (p, label) => label === 'post-close wait' ? Promise.reject(Error('restore deadline')) : p });
  assert.equal(rows.length, 1);
  assert.match(rows[0].reason, /restore deadline/);
  assert.deepEqual(phases.map(p => p[0]), ['before', 'grown', 'switched']);
  assert.equal(summariseCycles(rows).status, 'incomplete');
  assert.deepEqual(ids, ['anchor']);
});

test('decreasing cumulative counters are not negative work; decreasing gauges remain release evidence', () => {
  const rows = [complete(1, 20), complete(2, 12)];
  rows[1].natural.metrics.TaskDuration = 0;
  rows[1].natural.metrics.Nodes = 2;
  const report = summariseCycles(rows);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.cycles[1].deltaFromPrevious.TaskDuration, null);
  assert.equal(report.cycles[1].deltaFromPrevious.Nodes, -8);
});

test('driver owns only newly created IDs, switches, and cleans up both on a send failure', async () => {
  const calls = [];
  let ids = ['preexisting'];
  const driver = {
    state: async () => ({ ids: [...ids], mounted: ids.length }),
    create: async (name) => { const id = `owned-${calls.filter(x => x.startsWith('create')).length}`; calls.push(`create:${name}`); ids.push(id); return id; },
    switchTo: async (id) => { calls.push(`switch:${id}`); },
    send: async () => { calls.push('send'); if (calls.filter(x => x === 'send').length === 2) throw new Error('provider disconnected'); return { deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }; },
    close: async (id) => { calls.push(`close:${id}`); ids = ids.filter(x => x !== id); },
    sample: async () => sample(),
    records: async () => 0,
  };
  const rows = await runCycles(null, null, { cycles: 1, driver, bound: p => p });
  assert.equal(rows[0].completed, false);
  assert.match(rows[0].reason, /provider disconnected/);
  assert.deepEqual(rows[0].closed, ['owned-1', 'owned-0']);
  assert.deepEqual(rows[0].after.ids, ['preexisting']);
  assert.deepEqual(ids, ['preexisting']);
  assert.deepEqual(calls.filter(x => x.startsWith('switch')), ['switch:owned-0', 'switch:owned-1']);
});
