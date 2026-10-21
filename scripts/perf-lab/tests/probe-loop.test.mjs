import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const loaded = await import('../probe-loop.mjs').catch(loadError => ({ loadError }));

function fixture(options = {}) {
  assert.ifError(loaded.loadError);
  let now = 0, tick, cancelled = 0;
  const sampler = loaded.createLoopSampler({ everyMs: 20, now: () => now,
    schedule: fn => { tick = fn; return 1; }, cancel: () => { cancelled++; }, ...options });
  return { sampler, at: n => { now = n; }, tick: () => tick(), cancelled: () => cancelled };
}

test('independent loop sampling catches a blocked first callback without long-task entries', () => {
  const f = fixture(); f.at(420); f.tick();
  const s = f.sampler.snapshot();
  assert.equal(s.sampleCount, 1); assert.equal(s.maxDelayMs, 400); assert.equal(s.maxGapMs, 420);
  f.sampler.stop();
});

test('an ongoing stall is retained and stop freezes the observation', () => {
  const f = fixture(); f.at(600);
  assert.equal(f.sampler.snapshot().openDelayMs, 580);
  f.sampler.stop(); f.at(5000);
  assert.equal(f.sampler.snapshot().maxDelayMs, 580);
  assert.equal(f.sampler.snapshot().observedMs, 600);
  f.sampler.stop(); assert.equal(f.cancelled(), 1);
});

test('normal callbacks do not turn slow asynchronous work into a loop stall', () => {
  const f = fixture();
  for (let n = 20; n <= 1000; n += 20) { f.at(n); f.tick(); }
  const s = f.sampler.snapshot();
  assert.equal(s.sampleCount, 50); assert.equal(s.maxDelayMs, 0); assert.equal(s.totalStallMs, 0);
  f.sampler.stop();
});

test('bounded event retention reports truncation but keeps the true peak', () => {
  const f = fixture({ maxEvents: 2 });
  for (const n of [200, 400, 1000]) { f.at(n); f.tick(); }
  const s = f.sampler.snapshot();
  assert.equal(s.events.length, 2); assert.equal(s.droppedEvents, 1); assert.equal(s.truncated, true);
  assert.equal(s.maxDelayMs, 580); f.sampler.stop();
});

test('readiness waits for a real callback and stop rejects an unfulfilled wait', async () => {
  const f = fixture(); let ready = false;
  const waiting = f.sampler.ready().then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  f.at(20); f.tick(); await waiting; assert.equal(ready, true); f.sampler.stop();
  const other = fixture(); const rejected = assert.rejects(other.sampler.ready(), /stopped/);
  other.sampler.stop(); await rejected;
});

test('serialized probes run in the right context and reject stale or foreign identities', async () => {
  assert.ifError(loaded.loadError);
  let clock = 0, tick, starts = 0;
  const base = { performance: { now: () => clock, timeOrigin: 10000 }, setInterval: fn => { tick = fn; starts++; return starts; }, clearInterval() {} };
  const renderer = vm.createContext({ ...base, window: {}, document: {} });
  const cdp = { evaluate: async code => vm.runInContext(code, renderer) };
  const first = await loaded.installLoopProbe(cdp);
  clock = 420; tick();
  const read = await loaded.readLoopProbe(cdp, 'renderer', { token: first.token, stop: true });
  assert.equal(read.maxDelayMs, 400); assert.equal(read.kind, 'renderer');
  await loaded.installLoopProbe(cdp);
  await assert.rejects(loaded.readLoopProbe(cdp, 'renderer', { token: first.token }), /missing or replaced/);
  await loaded.readLoopProbe(cdp, 'renderer', { stop: true });
  const owner = { pid: 17, binary: '/owned/youcoded', home: '/fixture/home' };
  const main = vm.createContext({ ...base, process: { pid: 17, execPath: owner.binary, env: { HOME: owner.home }, getBuiltinModule: () => ({ isMainThread: true }) } });
  const mainCdp = { evaluate: async code => vm.runInContext(code, main) };
  const before = starts;
  await assert.rejects(loaded.installLoopProbe(mainCdp, { kind: 'main', owner: { ...owner, pid: 99 } }), /foreign or non-main/);
  assert.equal(starts, before);
  const installed = await loaded.installLoopProbe(mainCdp, { kind: 'main', owner });
  const ready = loaded.readLoopProbe(mainCdp, 'main', { token: installed.token, waitForSample: true, stop: true });
  clock += 20; tick();
  assert.equal((await ready).sampleCount, 1);
});

test('sustained short delays accumulate even without a single long stall', () => {
  const f=fixture();
  for(let n=40;n<=400;n+=40){f.at(n);f.tick();}
  const s=f.sampler.snapshot();
  assert.equal(s.totalStallMs,0);assert.equal(s.totalExcessMs,200);assert.equal(s.delayedSamples,10);
  f.at(440);f.sampler.stop();assert.equal(f.sampler.snapshot().totalExcessMs,220);
});

test('nonfinite clocks invalidate the serialized sampler', () => {
  const f=fixture();f.at(NaN);f.tick();assert.equal(f.sampler.snapshot().available,false);f.sampler.stop();
});

test('backwards clocks and invalid configuration cannot certify healthy sampling', () => {
  const f = fixture(); f.at(40); f.tick(); f.at(10);
  assert.equal(f.sampler.snapshot().available, false); f.sampler.stop();
  assert.throws(() => fixture({ everyMs: 0 }), /positive integer/);
  assert.throws(() => fixture({ maxEvents: -1 }), /positive integer/);
});
