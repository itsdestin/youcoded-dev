import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCheckpoint, checkpointDelta, RESOURCE_METRICS, boundedJson, readFamilyPss } from '../resource-checkpoint.mjs';

const raw = () => RESOURCE_METRICS.map(name => ({ name, value: 10 }));
const cdpFor = metrics => ({ send: async () => ({ metrics }) });
const pss = () => ({ totalMb: 12, perPid: [{ pid: 123, mb: 12 }] });
const capture = (metrics = raw(), extra = {}) => captureCheckpoint({ cdp: cdpFor(metrics), family: () => [123], readPss: pss, phase: 'released', identity: { source: 'sha', run: 'run-1', target: 'target-1' }, readEpoch: async () => ({ documentEpoch: '100', url: 'app://' }), readProcessStart: () => 'start-123', now: () => 10, ...extra });

test('one matched boundary reads CDP once, reuses layout helper, and labels scopes and observer time', async () => {
  let calls = 0, clock = 0;
  const row = await capture(raw(), { cdp: { send: async method => { assert.equal(method, 'Performance.getMetrics'); calls++; return { metrics: raw() }; } }, now: () => clock++ });
  assert.equal(calls, 1);
  assert.equal(row.status, 'measured');
  assert.equal(row.layout.layoutDurationMs, 10000);
  assert.equal(row.observerMs, 1);
  assert.equal(row.scope.renderer, 'CDP target renderer-wide');
  assert.equal(row.pss.discoveryComplete, false);
  assert.deepEqual(row.pss.missingPids, []);
});

test('missing, negative and nonfinite metrics remain null and incomplete', async () => {
  for (const value of [undefined, NaN, Infinity, -1]) {
    const metrics = raw().filter(m => m.name !== 'RecalcStyleCount');
    metrics.push({ name: 'RecalcStyleCount', value });
    const row = await capture(metrics);
    assert.equal(row.status, 'incomplete');
    assert.equal(row.metrics.RecalcStyleCount, null);
    assert.ok(row.gaps.length);
  }
});

test('missing family members and read errors cannot be healthy zero PSS', async () => {
  for (const readPss of [() => ({ totalMb: 12, perPid: [] }), () => { throw Error('denied'); }]) {
    const row = await capture(raw(), { readPss });
    assert.equal(row.status, 'incomplete');
    assert.equal(row.pss.totalMb, null);
    assert.deepEqual(row.pss.missingPids, [123]);
  }
  assert.equal((await capture(raw(), { family: () => [] })).status, 'incomplete');
});

test('valid CDP and process ENOENT are separate domains; renderer-only never calls process readers', async () => {
  let processReads=0;
  const unavailable=()=>{processReads++;throw Object.assign(Error('vanished PID'),{code:'ENOENT'});};
  const full=await capture(raw(),{readProcessStart:unavailable});
  assert.equal(full.status,'incomplete');
  assert.equal(full.renderer.status,'measured');
  assert.equal(full.process.status,'incomplete');
  assert.ok(full.procFailures.records.some(r=>r.errno==='ENOENT'));
  processReads=0;
  const renderer=await capture(raw(),{domain:'renderer',family:unavailable,readPss:unavailable,readProcessStart:unavailable});
  assert.equal(processReads,0);
  assert.equal(renderer.status,'renderer-only');
  assert.equal(renderer.process.status,'not-collected');
  assert.equal(renderer.pss.totalMb,null);
  assert.equal(checkpointDelta(renderer,renderer).renderer.status,'measured');
  assert.equal(checkpointDelta(renderer,renderer).family.status,'not-collected');
  assert.equal(checkpointDelta(full,renderer).renderer.status,'incomplete','mixed domains cannot be compared');
});
test('renderer-only enforces finite counters and the same document read brackets', async () => {
  for(const defect of ['missing','epoch','identity']) {
    let epochs=0;
    const row=await capture(defect==='missing'?[]:raw(),{domain:'renderer',
      identity:defect==='identity'?{}:{source:'sha',run:'run',target:'target'},
      readEpoch:async()=>({documentEpoch:defect==='epoch'?String(++epochs):'100',url:'app://'})});
    assert.equal(row.status,'incomplete',defect);
    assert.equal(row.renderer.status,'incomplete',defect);
    assert.equal(row.process.status,'not-collected',defect);
  }
});
test('counter decreases are resets, gauge decreases are release, and phase/policy mismatches are not comparable', async () => {
  const before = await capture();
  const after = structuredClone(before);
  after.metrics.Nodes = 2;
  after.metrics.LayoutCount = 2;
  const delta = checkpointDelta(before, after);
  assert.equal(delta.status, 'incomplete');
  assert.equal(delta.metrics.Nodes, -8);
  assert.equal(delta.metrics.LayoutCount, null);
  assert.deepEqual(delta.resets, ['LayoutCount']);
  after.phase = 'grown';
  assert.equal(checkpointDelta(before, after).comparable, false);
  after.phase = before.phase;
  after.gcPolicy = 'forced-gc';
  assert.equal(checkpointDelta(before, after).comparable, false);
});

test('strict PSS parsing preserves unreadable and absent Pss fields as missing membership', () => {
  const row = readFamilyPss([1, 2, 3], path => {
    if (path.includes('/1/')) return 'Rss: 999 kB\nPss: 2048 kB\n';
    if (path.includes('/2/')) return 'Rss: 999 kB\n';
    throw Error('exited');
  });
  assert.deepEqual(row, { totalMb: 2, perPid: [{ pid: 1, mb: 2 }] });
});

test('report byte and record caps fail explicitly without truncating into a healthy report', () => {
  assert.throws(() => boundedJson({ records: Array(10001).fill(0) }), /record cap/);
  assert.throws(() => boundedJson({ text: 'x'.repeat(5 * 1024 * 1024) }), /byte cap/);
  assert.match(boundedJson({ status: 'incomplete' }), /incomplete/);
});
