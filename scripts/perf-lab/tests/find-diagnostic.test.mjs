import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions, metricDelta, reportStatus, historyDecision, launchOwned, fixtureFindQuery, matchVisible, collectFindTrace, installFindTrace, validateFindOutput } from '../find-diagnostic.mjs';

test('search target is a unique user-message prefix inside the loaded tail', () => {
  assert.equal(fixtureFindQuery(3500, 1000), 'Turn 3250:');
  assert.equal(fixtureFindQuery(6200, 12000), 'Turn 3200:');
  assert.equal(fixtureFindQuery(3500, 1), 'Turn 3500:');
  assert.throws(() => fixtureFindQuery(0, 1000));
});

test('a registered match must actually intersect the visible scroller', () => {
  const viewport = { top: 100, bottom: 900, left: 0, right: 1200 };
  assert.equal(matchVisible({ top: -1000, bottom: -980, left: 10, right: 100 }, viewport), false);
  assert.equal(matchVisible({ top: 500, bottom: 520, left: 10, right: 100 }, viewport), true);
  assert.equal(matchVisible({ top: 500, bottom: 520, left: 10, right: 100 }, viewport, false), false);
  assert.equal(matchVisible({ top: 0, bottom: 0, left: 0, right: 0 }, viewport), false);
  assert.equal(matchVisible(null, viewport), false);
});

test('options default to an isolated checkout, virtual display and scratch output', () => {
  assert.deepEqual(parseOptions([], '/tmp/work'), {checkout:'/tmp/work/youcoded',entries:1000,display:':99',out:'/tmp/work/scratch/perf-lab/find-diagnostic.json'});
  assert.equal(parseOptions(['--entries','12000','--display',':0','--checkout','/tmp/other','--out','/tmp/result.json']).entries,12000);
  assert.equal(parseOptions(['--app-dir', '/tmp/baseline']).appDir, '/tmp/baseline');
  assert.equal(parseOptions(['--trace-find','on']).traceFind, 'on');
  assert.throws(() => parseOptions(['--trace-find','off']), /trace-find must be on/);
  assert.equal(parseOptions(['--trace-find','on','--trace-frame-delay','1000']).traceFrameDelay, '1000');
  assert.throws(() => parseOptions(['--trace-frame-delay','1000']), /trace-frame-delay/);
  for (const args of [['--entries','0'],['--entries','12001'],['--entries','1.5'],['--entries','NaN'],['--display','foo'],['--out'],['--bogus','x']]) assert.throws(() => parseOptions(args));
});

test('Find output admission refuses existing screenshot and paths outside private scratch', () => {
  const root = mkdtempSync(join(tmpdir(), 'find-output-'));
  const dir = join(root, 'scratch', 'perf-lab'); mkdirSync(dir, { recursive: true });
  const out = join(dir, 'find.json');
  try {
    assert.equal(validateFindOutput(out, root), out.slice(0, -5) + '.png');
    assert.throws(() => validateFindOutput(join(root, 'outside.json'), root), /scratch/);
    writeFileSync(out.slice(0, -5) + '.png', 'original');
    assert.throws(() => validateFindOutput(out, root), /already exists/);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test('missing metrics remain unmeasured rather than zero', () => {
  assert.deepEqual(metricDelta({TaskDuration:1,ScriptDuration:2,Nodes:100},{TaskDuration:1.25,Nodes:125}), {TaskDuration:250,ScriptDuration:null,LayoutDuration:null,Nodes:25});
  assert.equal(metricDelta({TaskDuration:2},{TaskDuration:1}).TaskDuration, null, 'reset counters cannot imply negative work');
});

test('report cannot mark short or unfolded history or unconfirmed results measured', () => {
  assert.equal(reportStatus({loaded:999,folded:8,requested:1000,resultReady:true}),'insufficient-history');
  assert.equal(reportStatus({loaded:1000,folded:0,requested:1000,resultReady:true}),'folding-unengaged');
  assert.equal(reportStatus({loaded:1000,folded:995,requested:1000,resultReady:false}),'find-result-unconfirmed');
  assert.equal(reportStatus({loaded:1000,folded:995,requested:1000,resultReady:true}),'measured');
  for (const loaded of [null,undefined,NaN,Infinity]) assert.notEqual(reportStatus({loaded,folded:4,requested:1000,resultReady:true}),'measured');
  for (const folded of [null,undefined,NaN,Infinity]) assert.notEqual(reportStatus({loaded:1000,folded,requested:1000,resultReady:true}),'measured');
  assert.notEqual(reportStatus({loaded:1000,folded:995,requested:1000,resultReady:1}),'measured');
});

test('Find workload refuses a partially folded history as a baseline', () => {
  assert.equal(reportStatus({loaded:1020,folded:110,requested:1000,resultReady:true}), 'folding-unengaged');
  assert.equal(reportStatus({loaded:1020,folded:1015,requested:1000,resultReady:true}), 'measured');
});

test('history decisions refuse an unrelated pane and wait for initial rows', () => {
  assert.equal(historyDecision(null,'id',1000), 'wait');
  assert.equal(historyDecision({sessionId:'other',loaded:2000,hasMore:false},'id',1000), 'wait');
  assert.equal(historyDecision({sessionId:'id',loaded:0,hasMore:false},'id',1000), 'wait');
  assert.equal(historyDecision({sessionId:'id',loaded:60,hasMore:true},'id',1000), 'page');
  assert.equal(historyDecision({sessionId:'id',loaded:60,hasMore:false},'id',1000), 'short');
  assert.equal(historyDecision({sessionId:'id',loaded:1010,hasMore:true},'id',1000), 'ready');
});

test('trace stop cancels outstanding delayed and native frames and is idempotent', () => {
  for (const delay of [0, 1000]) {
    const timers = new Map(), frames = new Map();
    let id = 0;
    class Element { scrollIntoView() {} }
    class ResizeObserver { constructor(callback) { this.deliver = callback; } observe() {} unobserve() {} disconnect() {} }
    const sandbox = vm.createContext({
      Element, ResizeObserver,
      performance: { now: () => 0 },
      document: { querySelector: () => null, hasFocus: () => true, visibilityState: 'visible' },
      setTimeout: callback => { timers.set(++id, callback); return id; },
      clearTimeout: key => timers.delete(key),
      requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
      cancelAnimationFrame: key => frames.delete(key),
    });
    const originalRaf = sandbox.requestAnimationFrame;
    vm.runInContext(`(${installFindTrace.toString()})(${delay})`, sandbox);
    const observer = new sandbox.ResizeObserver(() => sandbox.requestAnimationFrame(() => {}));
    observer.native.deliver([], observer.native);
    assert.equal(timers.size + frames.size, 1);
    const events = sandbox.__findLifecycleTrace.stop();
    assert.equal(timers.size + frames.size, 0);
    assert.equal(sandbox.requestAnimationFrame, originalRaf);
    assert.equal(events.filter(event => event.kind === 'ro-frame-cancel').length, 1);
    const count = events.length;
    sandbox.__findLifecycleTrace.stop();
    assert.equal(events.length, count);
  }
});

test('trace collection preserves partial evidence or explicitly records an unavailable renderer', async () => {
  const trace = { events: [{ kind: 'ro-frame-queued' }], final: { top: 909 } };
  assert.deepEqual(await collectFindTrace({ evaluate: async () => trace }), trace);
  const unavailable = await collectFindTrace({ evaluate: async () => { throw Error('target closed'); } });
  assert.match(unavailable.unavailable, /target closed/);
});

test('late launch success after deadline is killed instead of orphaned', async () => {
  let finish, kills = 0;
  const late = new Promise(r => { finish = r; });
  const bound = () => Promise.reject(new Error('deadline'));
  await assert.rejects(launchOwned(() => late, bound), /deadline/);
  finish({ kill: async () => { kills++; } });
  await new Promise(setImmediate);
  assert.equal(kills, 1);
});
