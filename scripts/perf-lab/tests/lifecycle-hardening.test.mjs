import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, openSync, closeSync, readSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { boundedJson, captureCheckpoint, checkpointDelta, RESOURCE_METRICS } from '../resource-checkpoint.mjs';
import { makeBound, recordCount, buildBounded, summariseCycles } from '../short-lifecycle.mjs';
import { readBoundedText, scanJsonLines, makeByteTail } from '../lifecycle-evidence.mjs';

const identity = { source: 'sha:dirty:package', run: 'private-run', target: 'target-1' };
const epoch = async () => ({ documentEpoch: '1000', url: 'app://index' });
const sample = (phase = 'released', now = () => 10) => captureCheckpoint({ identity, readEpoch: epoch, readProcessStart: () => '123-start',
  cdp: { send: async () => ({ metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }) }, family: () => [123],
  readPss: () => ({ totalMb: 10, perPid: [{ pid: 123, mb: 10 }] }), phase, now });

test('bounded serializer rejects escape expansion, primitive property floods, depth, cycles, getters and proxies without executing user code', () => {
  assert.throws(() => boundedJson({ s: '\u0000'.repeat(900000) }), /byte cap/);
  assert.throws(() => boundedJson(Object.fromEntries(Array.from({ length: 10001 }, (_, i) => ['p' + i, 1]))), /record cap/);
  let deep = {}; for (let i = 0; i < 100; i++) deep = { next: deep };
  assert.throws(() => boundedJson(deep), /depth cap/);
  const cyclic = {}; cyclic.x = cyclic;
  assert.throws(() => boundedJson(cyclic), /cyclic/);
  let touched = 0;
  assert.throws(() => boundedJson({ get x() { touched++; return 1; } }), /accessor/);
  assert.throws(() => boundedJson(new Proxy({}, { ownKeys() { touched++; return []; } })), /proxy/);
  assert.equal(touched, 0);
  const value = { unicode: 'x😀\ud800\n"\\', nil: null, array: [1, undefined], omitted: undefined };
  assert.deepEqual(JSON.parse(boundedJson(value)), JSON.parse(JSON.stringify(value)));
});

test('expired bound observes delayed rejections and owned cleanup still executes', async () => {
  let now = 0, rejectLater, cleaned = 0;
  const bound = makeBound(1, { now: () => now }); now = 48000;
  const late = new Promise((_, reject) => { rejectLater = reject; });
  await assert.rejects(bound(late, 'expired read'), /deadline/);
  rejectLater(Error('late read failure'));
  await assert.rejects(bound((async () => { cleaned++; throw Error('cleanup failed'); })(), 'expired cleanup'), /deadline/);
  await new Promise(setImmediate);
  assert.equal(cleaned, 1);
});

test('identity, epochs, memberships, process reuse and reversed/overlapping boundaries fail closed even with regrown counters', async () => {
  const before = await sample();
  const after = await sample('released', () => 20);
  assert.equal(checkpointDelta(before, after).status, 'measured');
  for (const mutate of [
    r => { r.identity.source = 'other'; }, r => { r.identity.run = 'other'; }, r => { r.identity.target = 'other'; },
    r => { r.identity.documentEpoch = 'new-document'; }, r => { r.identity.processStarts['123'] = 'reused'; },
    r => { r.pss.expectedPids.push(124); }, r => { r.startedAt = 9; }, r => { r.endedAt = 19; r.startedAt = 21; },
    r => { delete r.identity; }, r => { r.phase = 'unknown'; },
  ]) {
    const row = structuredClone(after); mutate(row); row.metrics.LayoutCount = 100;
    assert.equal(checkpointDelta(before, row, { acrossPhases: true }).comparable, false);
  }
  const grown = await sample('grown', () => 20);
  assert.equal(checkpointDelta(await sample('before'), grown).comparable, true);
  assert.equal(checkpointDelta(before, grown, { acrossPhases: true }).comparable, false);
});

test('default epoch probe brackets the same metric response with read-only document identity', async () => {
  const events = [];
  const row = await captureCheckpoint({ identity, phase: 'before', family: () => [123], readProcessStart: () => 'start',
    readPss: () => ({ totalMb: 10, perPid: [{ pid: 123, mb: 10 }] }), cdp: {
      evaluate: async code => { events.push('epoch'); assert.match(code, /performance\.timeOrigin/); assert.doesNotMatch(code, /__|querySelector|offset|window\.[A-Za-z]+\s*=/); return epoch(); },
      send: async method => { events.push(method); return { metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }; },
    } });
  assert.equal(row.status, 'measured');
  assert.deepEqual(events, ['epoch', 'Performance.getMetrics', 'epoch']);
});

test('document epoch transition inside a boundary is incomplete', async () => {
  let reads = 0;
  const row = await captureCheckpoint({ identity, readEpoch: async () => ({ documentEpoch: String(++reads), url: 'app://' }),
    readProcessStart: () => 'start', family: () => [123], phase: 'before', cdp: { send: async () => ({ metrics: [] }) } });
  assert.equal(row.status, 'incomplete');
  assert.ok(row.gaps.some(g => /epoch/.test(g)));
});

test('evidence reader bounds actual reads before whole-file allocation and rejects oversized files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lifecycle-evidence-'));
  try {
    const path = join(dir, 'evidence'); writeFileSync(path, 'a'.repeat(10000));
    assert.throws(() => readBoundedText(path, { maxBytes: 100 }), /byte cap/);
    let growthBytes = 0;
    const growingFd = openSync(path, 'r');
    try {
      assert.throws(() => readBoundedText(path, { maxBytes: 100, io: { open: () => growingFd, close: () => {}, size: () => 0,
        read: (handle, buffer, offset, length, position) => { const n = readSync(handle, buffer, offset, length, position); growthBytes += n; return n; } } }), /during read/);
      assert.equal(growthBytes, 101);
    } finally { closeSync(growingFd); }
    writeFileSync(path, 'ok\n');
    assert.equal(readBoundedText(path, { maxBytes: 100 }), 'ok\n');
    let requested = 0;
    const fd = openSync(path, 'r');
    try {
      assert.equal(readBoundedText(path, { maxBytes: 100, io: { open: () => fd, close: () => {}, size: () => 0,
        read: (handle, buffer, offset, length, position) => { requested = Math.max(requested, length); return readSync(handle, buffer, offset, length, position); } } }), 'ok\n');
      assert.ok(requested <= 101);
    } finally { closeSync(fd); }
    assert.throws(() => [...scanJsonLines('{}\n'.repeat(10001))], /record cap/);
    assert.throws(() => [...scanJsonLines('x'.repeat(1024 * 1024 + 1))], /line byte cap/);
    assert.deepEqual([...scanJsonLines('{}\n{torn')], [{}]);
    assert.throws(() => [...scanJsonLines('{bad}\n')], /invalid JSONL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fake build output overflow is incomplete even when a final build marker is present', async () => {
  const spawnProcess = () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.alloc(70000, 120));
      child.stdout.emit('data', Buffer.from('\nPERF_LIFECYCLE_BUILD={"sha":"fake"}\n'));
      child.emit('close', 0);
    });
    return child;
  };
  await assert.rejects(buildBounded('/fake-checkout', p => p, { spawnProcess }), /evidence incomplete.*cap/);
});

test('process start changes inside capture invalidate otherwise finite counters', async () => {
  let n = 0;
  const row = await captureCheckpoint({ identity, readEpoch: epoch, readProcessStart: () => String(++n),
    cdp: { send: async () => ({ metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }) }, family: () => [123],
    readPss: () => ({ totalMb: 10, perPid: [{ pid: 123, mb: 10 }] }), phase: 'before' });
  assert.equal(row.status, 'incomplete');
  assert.ok(row.gaps.some(g => /start changed/.test(g)));
});

test('cycle summaries reject document epoch changes despite regrown counters', async () => {
  const a = await sample('released', () => 10), b = await sample('released', () => 20);
  b.identity.documentEpoch = 'new'; b.metrics.LayoutCount = 100;
  const rows = [a, b].map((natural, i) => ({ index: i, completed: true, created: ['a', 'b'], closed: ['b', 'a'],
    before: { ids: ['anchor'], mounted: 1 }, after: { ids: ['anchor'], mounted: 1 }, openState: { ids: ['anchor', 'a', 'b'], mounted: 3 },
    output: Array.from({ length: 2 }, () => ({ deltasSent: 1, plannedDeltas: 1, chars: 1, aborted: false, shown: true, exact: true, persistedExact: true, turnComplete: true })),
    natural, persistedRecords: { before: 0, after: 0 } }));
  const report = summariseCycles(rows);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.cycles[1].deltaFromPrevious.LayoutCount, null);
});

test('build output tails are byte-bounded and directory iteration closes when capped', () => {
  const tail = makeByteTail(10);
  tail.push(Buffer.from('12345')); tail.push(Buffer.alloc(100000, 120));
  assert.equal(tail.text(), 'xxxxxxxxxx'); assert.equal(tail.truncated, true);
  let closed = false;
  function* entries() { try { for (let i = 0; i < 10002; i++) yield { name: 'x', isDirectory: () => false, isFile: () => true }; } finally { closed = true; } }
  assert.throws(() => recordCount('/fixture', entries), /record cap/);
  assert.equal(closed, true);
});
