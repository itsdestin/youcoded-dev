import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readProc, OwnedProcesses } from '../owned-processes.mjs';
import { buildStallFixtures } from '../stall-fixtures.mjs';
import { assessCoreResult, runCoreStallCase, runCoreStallCases, createLoopSampler, executeOwned } from '../stall-core.mjs';

const checkout = fileURLToPath(new URL('../../../youcoded', import.meta.url));
const good = () => ({ proof: { attempted: true, correctTarget: true, correctResult: true },
  metrics: { operationMs: 3, cpuMs: 2, maxLoopDelayMs: 3, samples: 1, peakRssMb: 50 },
  runtime: { node: process.version, sourceHashes: [{ file: 'actual.ts', sha256: 'a'.repeat(64) }] } });
const observed = () => ({ ready: true, memorySamples: 1, peakRssMb: 51, missingMemory: false, exitCode: 0, signal: null, cleanupConfirmed: true });

test('success requires verified result, heartbeat, memory, runtime and clean exit', () => {
  assert.equal(assessCoreResult(good(), observed()).status, 'measured');
  for (const mutate of [
    (r) => { r.proof.correctResult = false; },
    (r) => { delete r.proof; },
    (r) => { r.metrics.samples = 0; },
    (r) => { r.metrics.maxLoopDelayMs = null; },
    (r) => { r.metrics.operationMs = -1; },
    (r) => { r.runtime.sourceHashes = []; },
  ]) { const r = good(); mutate(r); assert.equal(assessCoreResult(r, observed()).status, 'failed'); }
  for (const patch of [{ ready: false }, { memorySamples: 0 }, { missingMemory: true }, { exitCode: 1 }, { signal: 'SIGSEGV' }, { cleanupConfirmed: false }]) {
    assert.equal(assessCoreResult(good(), { ...observed(), ...patch }).status, 'failed');
  }
  for (const r of [null, {}, [], '']) assert.equal(assessCoreResult(r, observed()).status, 'failed');
  assert.equal(assessCoreResult(null, { ...observed(), forcedStatus: 'timeout' }).status, 'timeout');
  assert.equal(assessCoreResult(null, { ...observed(), forcedStatus: 'memory-limit' }).status, 'memory-limit');
});

test('heartbeat catches a block before its first tick and drains after completion with fake scheduling', async () => {
  let now = 0, callback;
  const sampler = createLoopSampler({ now: () => now, schedule: (fn) => { callback = fn; return 1; }, cancel: () => {} });
  sampler.arm(); now = 279; callback();
  const drain = sampler.drain(); now = 290; callback();
  const result = await drain;
  assert.equal(result.samples, 2); assert.equal(result.maxLoopDelayMs, 269);
});

test('small actual parsers prove markers/counts with source identities and private child HOME', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-real-'));
  try {
    const manifest = await buildStallFixtures(join(temp, 'fixtures'), { checkout });
    for (const kind of ['csv-quoted', 'xlsx-merge', 'docx-table', 'path-list']) {
      const fixture = manifest.cases.find((c) => c.kind === kind);
      const row = await runCoreStallCase({ checkout, fixture, outDir: join(temp, 'out'), timeoutMs: 15000, maxRssMb: 512 });
      assert.equal(row.status, 'measured', JSON.stringify(row));
      assert.equal(row.proof.correctResult, true); assert.equal(row.proof.cleanupConfirmed, true);
      assert.equal(row.fixture.sha256, fixture.sha256);
      assert.ok(row.metrics.samples > 0); assert.ok(row.metrics.peakRssMb > 0);
      assert.ok(row.runtime.sourceHashes.length > 0);
      assert.ok(row.runtime.home.startsWith(join(temp, 'out')));
      assert.equal(row.runtime.node, process.version);
      if (kind === 'xlsx-merge') assert.deepEqual(row.stages.filter((s) => s.timedCore).map((s) => s.name), ['exceljs-load', 'parseMerges']);
    }
    assert.ok((await readdir(join(temp, 'out'))).some((name) => name.endsWith('.json')));
  } finally { await rm(temp, { recursive: true, force: true, maxRetries: 5 }); }
});

test('hash mismatch fails before parsing, HTML is explicitly browser-only, invalid bounds refuse', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-safety-'));
  try {
    const m = await buildStallFixtures(join(temp, 'fixtures'), { checkout });
    const fixture = { ...m.cases.find((c) => c.kind === 'csv-rows'), sha256: '0'.repeat(64) };
    const row = await runCoreStallCase({ checkout, fixture, outDir: join(temp, 'out') });
    assert.equal(row.status, 'failed'); assert.match(row.error, /hash|identity/i);
    const html = await runCoreStallCase({ checkout, fixture: m.cases.find((c) => c.kind === 'html-assets'), outDir: join(temp, 'out') });
    assert.equal(html.status, 'unreviewed'); assert.match(html.error, /browser-only/i);
    assert.equal(html.metrics.operationMs, null);
    await assert.rejects(runCoreStallCase({ checkout, fixture, outDir: join(temp, 'out'), timeoutMs: 0 }), /timeout/i);
    await assert.rejects(runCoreStallCase({ checkout, fixture, outDir: join(temp, 'out'), maxRssMb: Infinity }), /Rss|memory/i);
  } finally { await rm(temp, { recursive: true, force: true, maxRetries: 5 }); }
});

test('owned real subprocess deadlines, RSS limit, malformed/empty output and exits fail closed and clean up', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-owned-'));
  try {
    for (const mode of ['empty', 'malformed', 'exit', 'timeout', 'memory']) {
      const jobDir = join(temp, mode); await mkdir(jobDir); const home = join(jobDir, 'home'); await mkdir(home);
      const jobFile = join(jobDir, 'job.json'); await writeFile(jobFile, '{}');
      const entry = join(jobDir, 'worker.cjs');
      // Readiness triggers work; no assertion depends on a sleep or elapsed wall time.
      const body = mode === 'exit' ? 'process.exit(7);' : mode === 'timeout' ? 'setInterval(()=>{},1000);'
        : mode === 'memory' ? 'global.keep=Buffer.alloc(160*1024*1024,42);setInterval(()=>{},1000);'
        : `process.stdout.write(${JSON.stringify(mode === 'empty' ? '' : '{bad')}); process.send({type:'result-ready'});`;
      await writeFile(entry, `process.on('message',m=>{if(m.type==='go'){${body}}else if(m.type==='exit'){process.disconnect();}});process.send({type:'ready'});`);
      const { result, observed: obs } = await executeOwned({ jobFile, jobDir, home, entry, timeoutMs: 1000, maxRssMb: 64 });
      assert.equal(obs.cleanupConfirmed, true, JSON.stringify(obs));
      const verdict = assessCoreResult(result, obs);
      assert.equal(verdict.status, mode === 'timeout' ? 'timeout' : mode === 'memory' ? 'memory-limit' : 'failed', JSON.stringify(obs));
      assert.ok(obs.memorySamples > 0);
    }
  } finally { await rm(temp, { recursive: true, force: true, maxRetries: 5 }); }
});

test('actual synthetic watcher cold/warm paths prove external events and close their handles', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-watch-'));
  try {
    const fixture = { id: 'watcher-32', kind: 'watcher', shape: { directories: 32, files: 32 }, bytes: 0, sha256: 'a'.repeat(64) };
    const row = await runCoreStallCase({ checkout, fixture, outDir: temp });
    assert.equal(row.status, 'measured', JSON.stringify(row));
    assert.equal(row.proof.externalEvents, 2); assert.equal(row.proof.watchersClosed, true);
    assert.equal(row.proof.watchersStarted, 1); assert.equal(row.proof.cleanupConfirmed, true);
    assert.ok(row.stages.some((s) => s.name === 'watchProject-warm'));
  } finally { await rm(temp, { recursive: true, force: true, maxRetries: 5 }); }
});

test('Linux bounded synthetic untagged helper contributes RSS and is escalated after leader exit without waiting for inherited pipes', { skip: process.platform !== 'linux' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-helper-'));
  const jobDir = join(temp, 'job'); await mkdir(jobDir);
  const home = join(jobDir, 'home'); await mkdir(home);
  const jobFile = join(jobDir, 'job.json'); await writeFile(jobFile, '{}');
  const identityFile = join(jobDir, 'helper.json');
  const entry = join(jobDir, 'worker.cjs');
  const helperCode = `
    process.on('SIGTERM',()=>process.stderr.write('helper-TERM-ignored\\n'));
    global.keep=Buffer.alloc(12*1024*1024,42);
    setTimeout(()=>{process.stderr.write('helper-self-expired\\n');process.exit(0);},8000); // Independent self-expiry, even if the controller dies.
    process.send({type:'allocated'});
    process.disconnect();
  `;
  await writeFile(entry, `
    const {spawn}=require('node:child_process'), fs=require('node:fs');
    process.on('message',m=>{
      if(m.type==='go'){
        // No job path in helper argv. stdout/stderr intentionally stay inherited.
        const helper=spawn(process.execPath,['-e',${JSON.stringify(helperCode)}],{stdio:['ignore',1,2,'ipc']});
        helper.once('message',()=>{
          const text=fs.readFileSync('/proc/'+helper.pid+'/stat','utf8');
          const starttime=text.slice(text.lastIndexOf(')')+1).trim().split(/\\s+/)[19];
          const rssMb=Number(/^VmRSS:\\s+(\\d+) kB/m.exec(fs.readFileSync('/proc/'+helper.pid+'/status','utf8'))[1])/1024;
          const identity={pid:helper.pid,starttime,rssMb};
          fs.writeFileSync(${JSON.stringify(identityFile)},JSON.stringify(identity));
          process.stdout.write(JSON.stringify({helper:identity}),()=>process.send({type:'result-ready'}));
        });
      }else if(m.type==='exit'){process.disconnect();process.exit(0);}
    });
    process.send({type:'ready'});
  `);
  const harness = join(jobDir, 'harness.mjs');
  await writeFile(harness, `
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {executeOwned} from ${JSON.stringify(new URL('../stall-core.mjs', import.meta.url).href)};
    import {readProc} from ${JSON.stringify(new URL('../owned-processes.mjs', import.meta.url).href)};
    try {
      const {result,observed}=await executeOwned(${JSON.stringify({ jobFile, jobDir, home, entry, timeoutMs: 4000, maxRssMb: 128 })});
      assert.equal(observed.cleanupConfirmed,true,JSON.stringify(observed));
      assert.equal(observed.leaderExited,true); assert.equal(observed.pipesClosed,true);
      assert.match(observed.stderr,/helper-TERM-ignored/); assert.doesNotMatch(observed.stderr,/helper-self-expired/);
      assert.ok(result.helper.rssMb>=12);
      assert.ok(observed.peakRssMb>result.helper.rssMb,JSON.stringify({result,observed}));
      assert.ok(observed.peakMemoryMembers.some(r=>r.pid===result.helper.pid&&r.starttime===result.helper.starttime&&r.rssMb>=12));
      assert.equal(observed.peakMemoryMembers.reduce((sum,r)=>sum+(r.rssMb??0),0),observed.peakRssMb);
      assert.equal(readProc(result.helper.pid),null,'helper must disappear, not just become zombie');
      console.log(JSON.stringify({helperRssMb:result.helper.rssMb,peakRssMb:observed.peakRssMb,cleanupConfirmed:observed.cleanupConfirmed,leaderExited:observed.leaderExited,pipesClosed:observed.pipesClosed}));
    } finally {
      try { const old=JSON.parse(readFileSync(${JSON.stringify(identityFile)},'utf8')); const r=readProc(old.pid);
        if(r&&r.starttime===old.starttime&&r.state!=='Z')process.kill(old.pid,'SIGKILL');
      } catch(e) {if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}
    }
  `);
  // WHY: an orphan zombie is not disappearance. A private subreaper reaps only
  // this synthetic test's children, independent of the host init's reap policy.
  // Python's wall watchdog and helper self-expiry bound failures outside Node.
  const supervisor = `
import ctypes, os, subprocess, sys, time
if ctypes.CDLL(None).prctl(36,1,0,0,0)!=0: raise RuntimeError('subreaper unavailable')
p=subprocess.Popen(sys.argv[1:])
deadline=time.monotonic()+12
result=None
while result is None:
    try:
        pid,status=os.waitpid(-1,os.WNOHANG)
        if pid==p.pid: result=os.waitstatus_to_exitcode(status)
    except ChildProcessError: break
    if time.monotonic()>deadline:
        p.kill()
        raise RuntimeError('outer synthetic watchdog expired')
    time.sleep(0.005)
sys.exit(result if result is not None else 1)
`;
  try {
    const run = spawnSync('python3', ['-c', supervisor, process.execPath, harness], { encoding: 'utf8', timeout: 15000 });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const proof = JSON.parse(run.stdout.trim());
    assert.equal(proof.cleanupConfirmed, true);
    console.log('synthetic helper proof', proof);
  } finally {
    try {
      const old = JSON.parse(await readFile(identityFile, 'utf8')), r = readProc(old.pid);
      if (r && r.starttime === old.starttime && r.state !== 'Z') process.kill(old.pid, 'SIGKILL');
    } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e; }
    await rm(temp, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('delayed orphan reaping stops the matrix and persists actual fake-proc zombie cleanup evidence', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-zombie-'));
  const fixture = { id: 'csv-zombie', kind: 'csv-rows', bytes: 1, sha256: 'a'.repeat(64), shape: {}, file: join(temp, 'input') };
  let clock = 0, calls = 0;
  const record = (pid, ppid, extra = {}) => ({ pid, ppid, session: 20, pgrp: 20, starttime: String(pid * 100),
    cmdline: join(temp, 'job'), rssMb: 3, state: 'S', ...extra });
  const table = new Map([[10, record(10, 1, { session: 10, pgrp: 10 })], [20, record(20, 10)]]);
  const family = new OwnedProcesses({ leaderPid: 20, parentPid: 10, jobDir: join(temp, 'job'),
    read: pid => table.get(pid) ?? null, list: () => [...table.keys()], now: () => clock,
    sleep: async ms => { clock += ms; }, signal: (pid, sig) => {
      if (pid === 20) { table.delete(pid); table.get(21).ppid = 1; }
      if (pid === 21 && sig === 'SIGKILL') Object.assign(table.get(pid), { state: 'Z', rssMb: null });
    } });
  family.capture(); table.set(21, record(21, 20)); family.sample();
  try {
    await assert.rejects(runCoreStallCases({ checkout, manifest: { schema: 1, root: temp, cases: [fixture, fixture] }, outDir: temp,
      _execute: async () => {
        calls++;
        const cleanup = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
        return { result: good(), observed: { ...observed(), ...cleanup } };
      } }), /cleanup/i);
    assert.equal(calls, 1);
    const saved = JSON.parse(await readFile(join(temp, 'csv-zombie.json'), 'utf8'));
    assert.equal(saved.proof.cleanupConfirmed, false); assert.equal(saved.status, 'failed');
    assert.equal(saved.diagnostics.survivors[0].pid, 21); assert.equal(saved.diagnostics.survivors[0].state, 'Z');
    assert.match(saved.diagnostics.containmentLimits, /externally reaped|subreaper/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('controller lifecycle fails closed and stops the matrix on uncertain cleanup using injected owned executor', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'stall-core-lifecycle-'));
  const fixture = { id: 'csv-test', kind: 'csv-rows', bytes: 1, sha256: 'a'.repeat(64), shape: {}, file: resolve(temp, 'input'), marker: 'x' };
  try {
    for (const forcedStatus of ['timeout', 'memory-limit']) {
      const row = await runCoreStallCase({ checkout, fixture, outDir: join(temp, forcedStatus),
        _execute: async () => ({ result: null, observed: { ...observed(), forcedStatus } }) });
      assert.equal(row.status, forcedStatus);
      assert.equal(row.metrics.operationMs, null);
    }
    let calls = 0;
    await assert.rejects(runCoreStallCases({ checkout, manifest: { schema: 1, root: temp, cases: [fixture, fixture] }, outDir: temp,
      _execute: async () => { calls++; return { result: good(), observed: { ...observed(), cleanupConfirmed: false,
        cleanupError: 'Unreadable identity', survivors: [{ pid: 123, starttime: '456', unreadable: true }], containmentLimits: 'polling only' } }; } }), /cleanup/i);
    assert.equal(calls, 1);
    const json = JSON.parse(await readFile(join(temp, 'csv-test.json'), 'utf8'));
    assert.equal(json.status, 'failed');
    assert.equal(json.diagnostics.cleanupError, 'Unreadable identity');
    assert.deepEqual(json.diagnostics.survivors, [{ pid: 123, starttime: '456', unreadable: true }]);
    assert.equal(json.diagnostics.containmentLimits, 'polling only');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
