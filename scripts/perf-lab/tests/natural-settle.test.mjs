import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, runCycles, summariseCycles } from '../short-lifecycle.mjs';
import { captureCheckpoint, RESOURCE_METRICS, boundedJson } from '../resource-checkpoint.mjs';
import { SETTLE_DESCRIPTOR, sampleSettlePhase, summariseSettle } from '../natural-settle.mjs';

function rig(familySize = 1, domain = 'full') {
  const pids=Array.from({length:familySize},(_,i)=>123+i);
  let clock = 100, ids = ['anchor'], active = 'anchor', creates = 0;
  const calls = [];
  const now = () => clock;
  const wait = async ms => { clock += ms; };
  const driver = {
    state: async () => ({ ids: [...ids], mounted: ids.length, visible: 1, pills: [...ids] }),
    verifyAnchor: async id => active === id,
    create: async name => { creates++; ids.push(name); return name; },
    switchTo: async id => { active = id; },
    close: async id => { ids = ids.filter(x => x !== id); },
    send: async () => ({ deltasSent: 20, plannedDeltas: 20, chars: 100, shown: true, exact: true, persistedExact: true, turnComplete: true, aborted: false }),
    records: async () => 1,
    sample: async (_phase, _policy, requestedDomain = domain) => {
      assert.equal(requestedDomain, domain);
      calls.push(clock);
      return captureCheckpoint({ phase: 'released', identity: { source: 'sha', run: 'run', target: 'target' }, now,
        domain: requestedDomain,
        readEpoch: async () => ({ documentEpoch: '100', url: 'app://' }),
        readProcessStart: () => { assert.notEqual(domain, 'renderer', 'process start reader forbidden'); return '123'; },
        family: () => { assert.notEqual(domain, 'renderer', 'family discovery forbidden'); return pids; },
        readPss: () => { assert.notEqual(domain, 'renderer', 'PSS reader forbidden'); return { totalMb: 12, perPid: pids.map(pid=>({ pid, mb: 12/familySize })) }; },
        cdp: { send: async () => { clock += 2; return { metrics: RESOURCE_METRICS.map(name => ({ name, value: 10 })) }; } } });
    },
  };
  return { driver, now, wait, calls, creates: () => creates, advance: ms => { clock += ms; } };
}
const args = ['--settle-checkpoints', '--model-free', '--supervised', '--app-dir', '/tmp/cached', '--out', '/tmp/fresh.json', '--max-minutes', '5', '--max-rss-mb', '1024', '--cleanup-reserve-ms', '12000'];
test('strict opt-in caps and no intervention; old defaults unchanged', () => {
  assert.equal(parseOptions([]).cycles, 5);
  assert.equal(parseOptions(args).cycles, 3);
  for (const extra of [['--cycles','4'], ['--max-minutes','6'], ['--post-gc'], ['--resource-checkpoints'], ['--settle-times','1,99999']]) assert.throws(() => parseOptions([...args, ...extra]));
  assert.throws(() => parseOptions(['--settle-checkpoints']));
  assert.deepEqual(SETTLE_DESCRIPTOR.scheduleMs, [0,250,1000,3000]);
});
test('renderer domain is strict opt-in and full remains default', () => {
  assert.equal(parseOptions([...args, '--settle-domain', 'renderer']).settleDomain, 'renderer');
  assert.equal(parseOptions(args).settleDomain, undefined);
  for (const argv of [['--settle-domain','renderer'], [...args,'--settle-domain','unknown'], [...args,'--settle-domain','renderer','--post-gc'], [...args,'--settle-domain','renderer','--resource-checkpoints']]) assert.throws(()=>parseOptions(argv));
});
test('renderer-only completes controls and workloads without invoking any process reader', async () => {
  const r=rig(1,'renderer');
  const rows=await runCycles(null,null,{cycles:3,driver:r.driver,settleCheckpoints:true,settleDomain:'renderer',anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
  const summary=summariseSettle(rows), lifecycle=summariseCycles(rows);
  assert.equal(summary.status,'measured-renderer-only');
  assert.equal(summary.process.status,'not-collected');
  assert.equal(summary.effectivePointCount,24);
  assert.equal(r.creates(),6);
  assert.equal(lifecycle.status,'incomplete');
  assert.ok(lifecycle.cycles.every(c=>c.rendererValid&&c.continuationSafe&&!c.valid));
  assert.equal(lifecycle.familyPssTrend.status,'not-collected');
  assert.equal(lifecycle.trend.pssMb.change,null);
  assert.ok(summary.observed.every(c=>c.matched.every(p=>p.pssMb===null&&p.familyStatus==='not-collected')));
  assert.doesNotThrow(()=>boundedJson({descriptor:SETTLE_DESCRIPTOR,...lifecycle,settleSummary:summary}));
});
test('renderer-only missing metrics, epoch/source changes and cleanup failure cannot green', async () => {
  for(const defect of ['metrics','epoch','source','run','target','reset','order','cleanup']) {
    const r=rig(1,'renderer'), original=r.driver.sample;let n=0;
    r.driver.sample=async(...args)=>{const s=await original(...args);if(++n===2) {
      if(defect==='metrics')s.metrics.Nodes=null;
      if(defect==='epoch')s.identity.documentEpoch='changed';
      if(['source','run','target'].includes(defect))s.identity[defect]='changed';
      if(defect==='reset')s.metrics.TaskDuration=0;
      if(defect==='order')s.startedAt=0;
    }return s;};
    if(defect==='cleanup') { const close=r.driver.close; r.driver.close=async id=>{await close(id);throw Error('cleanup receipt failed');}; }
    const rows=await runCycles(null,null,{cycles:3,driver:r.driver,settleCheckpoints:true,settleDomain:'renderer',anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
    assert.equal(rows.length,1,defect);
    assert.equal(summariseSettle(rows).status,'incomplete',defect);
    assert.equal(summariseCycles(rows).status,'incomplete',defect);
  }
});
test('absolute fake-clock scheduling includes observer cost without accumulating drift', async () => {
  const r = rig();
  const phase = await sampleSettlePhase({ driver:r.driver, kind:'control', cycle:1, anchor:'anchor', now:r.now, wait:r.wait, deadline:10000 });
  assert.equal(phase.status, 'measured');
  assert.deepEqual(r.calls, [100,350,1100,3100]);
  assert.deepEqual(phase.points.map(p => p.actualMs), [0,250,1000,3000]);
  assert.deepEqual(phase.points.map(p => p.sample.observerMs), [2,2,2,2]);
  assert.equal(r.creates(), 0);
});
test('fractional timer truncation and repeated early wakes never record an early interval', async () => {
  for (const mode of ['fractional', 'repeated', 'coarse']) {
    const r=rig(); r.advance(0.771892);
    const sample=r.driver.sample;
    r.driver.sample=async()=>{const result=await sample();r.advance(0.228108);return result;};
    const waits=[];
    const wait=async ms=>{
      waits.push(ms);
      // Model real timer integer truncation, repeated early returns, and a 4ms clock.
      r.advance(mode==='fractional'?Math.floor(ms):mode==='repeated'?Math.min(80,Math.floor(ms)):Math.ceil(ms/4)*4);
    };
    const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,wait,deadline:10000});
    assert.equal(phase.status,'measured',`${mode}: ${phase.reason}`);
    assert.equal(r.calls.length,4);
    for(const [i,point] of phase.points.entries()) {
      assert.ok(point.actualMs>=point.plannedMs);
      assert.ok(point.latenessMs<=100);
      assert.ok(r.calls[i]>=phase.startedAt+point.plannedMs);
    }
    assert.ok(waits.every(ms=>Number.isInteger(ms)&&ms>=1));
    assert.ok(waits.length<=64*3);
  }
});
test('observed 249.771892ms early wake retries remaining target before recording 250ms', async () => {
  const r=rig(), sample=r.driver.sample;let reads=0,waits=0;
  r.driver.sample=async()=>{const result=await sample();if(++reads===1)r.advance(49.671885);return result;};
  const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,
    wait:async ms=>{
      if(++waits===1){r.advance(249.771892-(r.now()-100));assert.equal(r.calls.length,1);}
      else {assert.ok(ms>=1);r.advance(ms);}
    },deadline:10000});
  assert.equal(phase.status,'measured');
  assert.ok(phase.points[1].actualMs>=250);
  assert.equal(phase.points[1].plannedMs,250);
  assert.equal(phase.points[1].sample.status,'measured');
  assert.ok(waits>=4,'early return required an additional yielding wait');
});
test('coarse clock may repeat briefly without failing or busy-spinning', async () => {
  const r=rig();let waits=0;
  const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,
    wait:async ms=>{assert.ok(ms>=1);if(++waits%3===0)r.advance(ms);},deadline:10000});
  assert.equal(phase.status,'measured');assert.equal(waits,9);
  assert.deepEqual(phase.points.map(p=>p.actualMs),[0,250,1000,3000]);
});
test('stagnant and pathological slowly advancing clocks stop bounded waits without sampling early', async () => {
  for(const advance of [0,0.000001,-1,NaN]) {
    const r=rig(); let waits=0;
    const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,
      wait:async()=>{assert.ok(++waits<=64,'unbounded retries');r.advance(advance);},deadline:10000});
    assert.equal(phase.status,'incomplete');
    assert.equal(r.calls.length,1);
    assert.equal(phase.points.length,1,'no early point recorded');
    assert.match(phase.reason,/clock|wait/i);
  }
});
test('wait cancellation and whole deadline prevent the intended interval from being recorded', async () => {
  for(const mode of ['cancel','deadline']) {
    const r=rig();let waits=0;
    const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,
      wait:async()=>{waits++;if(mode==='deadline')r.advance(10000);},
      bound:async(p,label,cap)=>{const value=await p;if(label==='settle scheduled wait') {
        assert.ok(cap>0&&cap<=10000-r.now()+ (mode==='deadline'?10000:0));
        if(mode==='cancel')throw Error('cancelled during wait');
      }return value;},deadline:10000});
    assert.equal(phase.status,'incomplete');
    assert.equal(waits,1);assert.equal(r.calls.length,1);
    assert.equal(phase.points.length,1);
    assert.match(phase.reason,mode==='cancel'?/cancelled/:/deadline/);
  }
});
test('100ms positive lateness gate remains exact, including fractional excess', async () => {
  for(const extra of [100,100.000001]) {
    const r=rig();let first=true;
    const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,
      wait:async ms=>{r.advance(ms+(first?extra:0));first=false;},deadline:10000});
    assert.equal(phase.status,extra===100?'measured':'incomplete');
    if(extra>100)assert.equal(r.calls.length,1);
  }
});
test('late deadlines and late schedule do not rush catch-up samples or continue', async () => {
  const r=rig();
  const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,wait:async ms=>r.advance(ms+300),deadline:10000});
  assert.equal(phase.status,'incomplete');
  assert.equal(phase.points.length,2);
  assert.equal(phase.points[1].latenessMs,300);
  const expired=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,wait:r.wait,deadline:r.now()+1000});
  assert.equal(expired.status,'incomplete');
  assert.equal(expired.points.length,0);
});
test('three workloads including warmup, interleaved controls have identical effective timing/counts', async () => {
  const r=rig(12);
  const rows=await runCycles(null,null,{cycles:3,driver:r.driver,settleCheckpoints:true,anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
  const summary=summariseSettle(rows);
  assert.equal(summary.status,'measured');
  assert.equal(r.creates(),6);
  assert.equal(summary.effectivePointCount,24);
  assert.deepEqual(rows.flatMap(row=>row.settle.map(p=>p.kind)),['control','workload','control','workload','control','workload']);
  for(const row of rows) assert.deepEqual(row.settle[0].points.map(p=>p.actualMs),row.settle[1].points.map(p=>p.actualMs));
  assert.doesNotThrow(()=>boundedJson({descriptor:SETTLE_DESCRIPTOR,...summariseCycles(rows),settleSummary:summary}));
});
test('source/epoch/reset/PID reuse/proc gaps fence continuation; churn only invalidates family PSS', async () => {
  for(const defect of ['source','run','target','epoch','reset','reuse','gap','churn']) {
    const r=rig(), original=r.driver.sample;
    let n=0;
    r.driver.sample=async()=>{const s=await original(); if(++n===2) {
      if(['source','run','target'].includes(defect))s.identity[defect]='other';
      if(defect==='epoch')s.identity.documentEpoch='other';
      if(defect==='reset')s.metrics.TaskDuration=0;
      if(defect==='reuse')s.identity.processStarts[123]='reused';
      if(defect==='gap')s.status='incomplete';
      if(defect==='churn'){s.pss.expectedPids=[124];s.identity.processStarts={124:'new'};s.pss.perPid=[{pid:124,mb:12}];}
    } return s;};
    const phase=await sampleSettlePhase({driver:r.driver,kind:'control',cycle:1,anchor:'anchor',now:r.now,wait:r.wait,deadline:10000});
    assert.equal(phase.status,defect==='churn'?'measured':'incomplete',defect);
    if(defect==='churn')assert.equal(phase.familyPssComparable,false);
  }
});
test('failed anchor restoration prevents workload or later cycles', async () => {
  const r=rig();r.driver.verifyAnchor=async()=>false;
  const rows=await runCycles(null,null,{cycles:3,driver:r.driver,settleCheckpoints:true,anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
  assert.equal(r.creates(),0);assert.equal(rows.length,1);assert.equal(summariseSettle(rows).status,'incomplete');
});
test('post-workload restoration failure and a mid-read deadline stop subsequent cycles', async () => {
  for (const defect of ['restore','deadline']) {
    const r=rig();
    const verify=r.driver.verifyAnchor, original=r.driver.sample;
    r.driver.verifyAnchor=async id=>defect==='restore' && r.creates()>0?false:verify(id);
    let reads=0;
    r.driver.sample=async()=>{const s=await original();if(defect==='deadline' && ++reads===5)r.advance(100000);return s;};
    const rows=await runCycles(null,null,{cycles:3,driver:r.driver,settleCheckpoints:true,anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
    assert.equal(rows.length,1,defect);
    assert.equal(r.creates(),2,defect);
    assert.equal(rows[0].settle[1].status,'incomplete',defect);
    assert.equal(summariseSettle(rows).status,'incomplete',defect);
  }
});
test('decay and retained growth are observed changes, not leak verdicts; missing points are incomplete', async () => {
  const r=rig();
  const rows=await runCycles(null,null,{cycles:2,driver:r.driver,settleCheckpoints:true,anchor:'anchor',now:r.now,wait:r.wait,deadline:100000});
  rows[1].settle[1].points.forEach((p,i)=>{p.sample.metrics.Nodes=40-i*5;p.sample.metrics.TaskDuration=10+i;});
  let result=summariseSettle(rows);
  assert.equal(result.observed[1].workload.change.Nodes,-15);
  assert.equal(result.observed[1].workload.change.TaskDuration,3);
  assert.equal(result.leakVerdict,undefined);
  rows[1].settle[1].points.forEach((p,i)=>{p.sample.metrics.Nodes=40+i*5;});
  result=summariseSettle(rows);
  assert.equal(result.observed[1].workload.change.Nodes,15);
  assert.equal(result.observed[1].control.change.TaskDuration,0);
  rows[1].settle[1].points.pop();
  result=summariseSettle(rows);
  assert.equal(result.status,'incomplete');
  assert.equal(result.observed[1].workload.change,null);
});
