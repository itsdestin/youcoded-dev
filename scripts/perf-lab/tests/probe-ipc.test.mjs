import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from '../probe-ipc.mjs';

function fixture(getPlatform = async () => 'linux') {
  let now = 0;
  const timers = new Map(), listeners = new Map();
  let serial = 0;
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const context = vm.createContext({
    window: { claude: { getPlatform } }, document,
    performance: { now: () => now },
    setInterval: fn => { const id = ++serial; timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id),
  });
  return {
    cdp: { evaluate: async code => vm.runInContext(code, context) },
    clock: n => { now = n; },
    tick: async () => { for (const fn of [...timers.values()]) await fn(); await Promise.resolve(); },
    visibility: state => { document.visibilityState = state; listeners.get('visibilitychange')?.(); },
    timers, listeners,
  };
}

test('sends an initial ping instead of leaving fast operations with no sample', async () => {
  const f = fixture();
  await installIpcStallProbe(f.cdp);
  assert.equal((await readIpcStallProbe(f.cdp)).pings, 1);
  await stopIpcStallProbe(f.cdp);
});

test('records a delayed callback even when the completed ping is fast', async () => {
  const f = fixture();
  await installIpcStallProbe(f.cdp, { everyMs: 100 });
  f.clock(1000); await f.tick();
  const r = await readIpcStallProbe(f.cdp);
  assert.equal(r.maxMs, 0);
  assert.equal(r.maxTickDelayMs, 900);
  assert.equal(r.tickSamples, 1);
  await stopIpcStallProbe(f.cdp);
});

test('retains an overdue first timer and freezes its observation when stopped', async () => {
  const f = fixture();
  await installIpcStallProbe(f.cdp, { everyMs: 100 });
  f.clock(1200);
  assert.equal((await readIpcStallProbe(f.cdp)).maxTickDelayMs, 1100);
  await stopIpcStallProbe(f.cdp);
  f.clock(5000);
  const r = await readIpcStallProbe(f.cdp);
  assert.equal(r.maxTickDelayMs, 1100);
  assert.equal(r.observedMs, 1200);
  assert.equal(f.timers.size, 0);
});

test('does not turn a reply arriving after stop into a completed in-window ping', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  await installIpcStallProbe(f.cdp);
  f.clock(900); await stopIpcStallProbe(f.cdp);
  assert.equal(typeof resolve, 'function', 'the initial ping is outstanding');
  f.clock(4000); resolve(); await Promise.resolve();
  const r = await readIpcStallProbe(f.cdp);
  assert.equal(r.pings, 0);
  assert.equal(r.openStallMs, 900);
});

test('records visibility changes and removes its listener on stop', async () => {
  const f = fixture();
  await installIpcStallProbe(f.cdp);
  f.visibility('hidden'); f.visibility('visible');
  assert.equal((await readIpcStallProbe(f.cdp)).sawHidden, true);
  await stopIpcStallProbe(f.cdp);
  assert.equal(f.listeners.size, 0);
});

test('visibility after stop does not change the recorded measurement window', async () => {
  const f = fixture();
  await installIpcStallProbe(f.cdp);
  await stopIpcStallProbe(f.cdp);
  f.visibility('hidden');
  const r = await readIpcStallProbe(f.cdp);
  assert.equal(r.visibilityAtEnd, 'visible');
  assert.equal(r.sawHidden, false);
});

test('refuses invalid timer periods before executing page code', async () => {
  const cdp = { evaluate: () => { throw Error('should not execute'); } };
  for (const everyMs of [0, -1, NaN, Infinity, '100']) {
    await assert.rejects(installIpcStallProbe(cdp, { everyMs }), /positive.*integer/i);
  }
});
