import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwnedProcesses, parseProcStat } from '../owned-processes.mjs';

const row = (pid, ppid = 10, extra = {}) => ({ pid, ppid, pgrp: 20, session: 20, starttime: String(pid * 100), state: 'S', cmdline: 'untagged', rssMb: 3, ...extra });
function rig(extra = {}) {
  const table = new Map([row(1, 0, { pgrp: 1, session: 1 }), row(10, 1, { pgrp: 10, session: 10 }), row(20, 10, { cmdline: '/tmp/perf-lab/private-owned-job/job.json' })].map(r => [r.pid, r]));
  const signals = []; let time = 0;
  const family = new OwnedProcesses({ leaderPid: 20, parentPid: 10, jobDir: '/tmp/perf-lab/private-owned-job',
    read: pid => { const r = table.get(pid); if (r instanceof Error) throw r; return r ?? null; }, list: () => [...table.keys()],
    signal: (pid, sig) => signals.push([pid, sig]), now: () => time, sleep: async ms => { time += ms; }, ...extra });
  return { table, signals, family };
}

test('protected live app above supervisor permits owned children, but protected intermediary below supervisor is refused', () => {
  const {table,family,signals}=rig();
  table.get(10).ppid=9; table.set(9,row(9,1,{pgrp:9,session:9,cmdline:`/opt/YouCoded/youcoded ${process.env.HOME}/.config/youcoded`}));
  // Reconstruct ancestry with the running-app marker ABOVE the direct supervisor.
  const owned=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:'/tmp/perf-lab/private-owned-job',read:pid=>table.get(pid),list:()=>[...table.keys()],signal:(...args)=>signals.push(args)});
  owned.capture(); owned.signalAll('SIGTERM'); assert.deepEqual(signals,[[20,'SIGTERM']]);
  table.set(30,row(30,20,{cmdline:`${process.env.HOME}/.youcoded/protected-child`}));
  table.set(21,row(21,30));
  assert.throws(()=>owned.sample(),/Protected/); owned.signalAll('SIGKILL');
  assert.ok(!signals.some(([pid])=>pid===30||pid===21||pid===9||pid===10));
});

test('mixed-time parent reuse cannot authorize an unrelated child in another session', () => {
  const { table, family, signals } = rig(); family.capture();
  table.set(21, row(21, 20, { session: 99, pgrp: 99 }));
  const read = family.read; let parentReads = 0;
  family.read = pid => {
    if (pid === 20 && ++parentReads > 2) return row(20, 10, { starttime: '9999', session: 99, pgrp: 99 });
    return read(pid);
  };
  assert.throws(() => family.sample(), /identity|reuse|parent/i);
  assert.equal(family.known.has(21), false);
  family.signalAll('SIGKILL'); assert.deepEqual(signals, []);
});

test('adoption rejects a changed child-parent relation between enumeration and verification', () => {
  const { table, family, signals } = rig(); family.capture();
  table.set(21, row(21, 20, { session: 99, pgrp: 99 }));
  const read = family.read; let childReads = 0;
  family.read = pid => pid === 21 && ++childReads > 1 ? row(21, 999, { session: 99, pgrp: 99 }) : read(pid);
  assert.throws(() => family.sample(), /ancestry changed/);
  assert.equal(family.known.has(21), false);
  family.signalAll('SIGKILL'); assert.deepEqual(signals, [[20, 'SIGKILL']]);
});

test('terminal empty stabilization rescan refuses a later unverified session occupant', async () => {
  const { table, family, signals } = rig(); family.capture(); table.delete(20);
  family.sleep = async () => { table.set(21, row(21, 1)); };
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, false); assert.equal(result.survivors[0].verified, false);
  assert.match(result.cleanupError, /continuity/); assert.deepEqual(signals, []);
});

test('terminal enumeration rescans a late same-session fork before confirming disappearance', async () => {
  const { table, family, signals } = rig(); family.capture();
  const list = family.list, read = family.read; let enumerated = false, forked = false;
  family.list = () => { const pids = list(); enumerated = true; return pids; };
  family.read = pid => {
    if (pid === 20 && enumerated && !forked) {
      forked = true; table.set(21, row(21, 1)); table.delete(20); return null;
    }
    return read(pid);
  };
  family.signal = (pid, sig) => { signals.push([pid, sig]); if (sig === 'SIGKILL') table.delete(pid); };
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, true, JSON.stringify(result));
  assert.equal(family.known.has(21), true);
  assert.deepEqual(signals, [[21, 'SIGTERM'], [21, 'SIGKILL']]);
});

test('a helper forked during TERM is discovered and receives exact KILL escalation', async () => {
  const { table, family, signals } = rig(); family.capture();
  family.signal = (pid, sig) => {
    signals.push([pid, sig]);
    if (pid === 20 && sig === 'SIGTERM') table.set(21, row(21, 20));
    if (sig === 'SIGKILL') { table.delete(pid); if (pid === 20) table.get(21).ppid = 1; }
  };
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, true, JSON.stringify(result));
  assert.deepEqual(signals, [[20, 'SIGTERM'], [20, 'SIGKILL'], [21, 'SIGKILL']]);
});

test('delayed external orphan reaping preserves zombie evidence and refuses cleanup', async () => {
  const { table, family, signals } = rig(); family.capture(); table.set(21, row(21, 20)); family.sample();
  family.signal = (pid, sig) => {
    signals.push([pid, sig]);
    if (pid === 20) { table.delete(pid); table.get(21).ppid = 1; }
    else if (sig === 'SIGKILL') table.set(pid, row(pid, 1, { state: 'Z', rssMb: null }));
  };
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, false); assert.equal(result.survivors[0].state, 'Z');
  assert.deepEqual(signals, [[20, 'SIGTERM'], [21, 'SIGTERM'], [21, 'SIGKILL']]);
  table.delete(21); assert.equal((await family.cleanup({ termWaitMs: 5, killWaitMs: 5, everyMs: 5 })).cleanupConfirmed, true);
});

test('stat parses after last parenthesis and preserves starttime without numeric rounding', () => {
  const fields = ['S', '10', '20', '20', ...Array(15).fill('0'), '90071992547409931'];
  assert.equal(parseProcStat(`20 (odd ) process) ${fields.join(' ')}`).starttime, '90071992547409931');
  assert.throws(() => parseProcStat('bad'), /stat/);
});

test('untagged private-session helpers, verified descendants and recorded escapees share RSS and signals', () => {
  const { table, signals, family } = rig(); family.capture();
  table.set(21, row(21, 20)); table.set(22, row(22, 21, { pgrp: 22, session: 22 }));
  assert.equal(family.sample().rssMb, 9);
  table.set(21, row(21, 1, { pgrp: 21, session: 21 })); table.delete(20);
  assert.deepEqual(family.sample().members.map(r => r.pid), [21, 22]);
  family.signalAll('SIGTERM'); assert.deepEqual(signals, [[21, 'SIGTERM'], [22, 'SIGTERM']]);
});

test('PID reuse cannot inherit ownership, even within the old private group', () => {
  const { table, signals, family } = rig(); family.capture(); table.set(20, row(20, 10, { starttime: '999' }));
  assert.throws(() => family.sample(), /reuse|identity/); family.signalAll('SIGKILL'); assert.deepEqual(signals, []);
});

test('lost group continuity does not adopt a reused group after leader disappearance', () => {
  const { table, signals, family } = rig(); family.capture(); table.delete(20); table.set(23, row(23, 1));
  assert.throws(() => family.sample(), /continuity/); family.signalAll('SIGTERM'); assert.deepEqual(signals, []);
});

test('leader gone is not family gone, and zombies have zero RSS but are not cleanup confirmation', async () => {
  const { table, signals, family } = rig(); family.capture(); table.set(21, row(21, 20)); family.sample(); table.delete(20);
  table.set(21, row(21, 1, { state: 'Z', rssMb: null })); assert.equal(family.sample().rssMb, 0);
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 20, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, false); assert.equal(result.survivors[0].state, 'Z'); assert.deepEqual(signals, []);
});

test('protected own/ancestor cmdlines and unreadable relevant records fail closed', () => {
  for (const mode of ['self', 'ancestor', 'unreadable']) {
    const { table, signals, family } = rig(); family.capture(); table.set(21, row(21, 20)); family.sample();
    if (mode === 'self') table.get(21).cmdline = `${process.env.HOME}/.youcoded/live`;
    if (mode === 'ancestor') { table.set(30, row(30, 1, { cmdline: `${process.env.HOME}/.claude/live` })); table.get(21).ppid = 30; }
    if (mode === 'unreadable') table.set(21, new Error('unreadable proc'));
    assert.throws(() => family.sample()); family.signalAll('SIGKILL'); assert.ok(!signals.some(([pid]) => pid === 21));
  }
});

test('capture refuses wrong parent/private launch/group and self; bounded cleanup escalates exact identities', async () => {
  for (const patch of [{ ppid: 1 }, { cmdline: 'unrelated' }, { pgrp: 99 }, { session: 99 }]) {
    const { table, family } = rig(); Object.assign(table.get(20), patch); assert.throws(() => family.capture());
  }
  assert.throws(() => rig({ leaderPid: 10 }).family.capture());
  const { family, signals } = rig(); family.capture();
  const result = await family.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
  assert.deepEqual(signals, [[20, 'SIGTERM'], [20, 'SIGKILL']]); assert.equal(result.cleanupConfirmed, false);
});

test('known identities omitted from enumeration are re-read; unreadable and absent RSS cannot confirm cleanup', async () => {
  const { table, family, signals } = rig({ list: () => [] }); family.capture();
  assert.equal(family.sample().members[0].pid, 20);
  table.get(20).rssMb = null;
  assert.throws(() => family.sample(), /RSS/);
  const result = await family.cleanup({ termWaitMs: 5, killWaitMs: 5, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, false); assert.match(result.cleanupError, /RSS/);
  assert.deepEqual(signals, [[20, 'SIGTERM'], [20, 'SIGKILL']]);
  await assert.rejects(family.cleanup({ termWaitMs: Infinity }), /bounds/);
});

test('replacement between sampling and signal never receives a signal and uncertain group survivors are recorded', async () => {
  const { table, family, signals } = rig(); family.capture(); table.set(21, row(21, 20)); family.sample();
  table.get(21).starttime = '999'; family.signalAll('SIGTERM');
  assert.deepEqual(signals, [[20, 'SIGTERM']]);
  assert.equal(family.survivors().find(r => r.pid === 21).currentStarttime, '999');
  const other = rig(); other.family.capture(); other.table.delete(20); other.table.set(23, row(23, 1));
  const result = await other.family.cleanup({ termWaitMs: 5, killWaitMs: 5, everyMs: 5 });
  assert.equal(result.cleanupConfirmed, false); assert.equal(result.survivors[0].verified, false);
  assert.deepEqual(other.signals, []);
});

test('a protected exec on the final identity read is refused even without a PID change', () => {
  const { family, signals } = rig(); family.capture();
  const read = family.read; let reads = 0;
  family.read = pid => {
    const r = read(pid);
    return pid === 20 && ++reads === 2 ? { ...r, cmdline: `${process.env.HOME}/.youcoded/live` } : r;
  };
  family.signalAll('SIGKILL'); assert.deepEqual(signals, []);
  assert.match(family.errors.join(' '), /Protected/);
});

// Use the production readProc producer with fake file bytes, not a null-returning
// identity stub: an exit can occur on either stat bracket of the final read.
function procSignalRig(defect) {
  const {table}=rig(); const signals=[];let clock=0,statReads=0,armed=false;
  const absent=()=>Object.assign(Error('process absent'),{code:'ENOENT'});
  const family=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:'/tmp/perf-lab/private-owned-job',
    list:()=>[...table.keys()],now:()=>clock,sleep:async ms=>{clock+=ms;},signal:(...args)=>signals.push(args),
    procRead:path=>{
      const [,pidText,file]=/^\/proc\/(\d+)\/(stat|status|cmdline)$/.exec(path)??[];
      const pid=Number(pidText);
      if(armed&&pid===20&&file==='stat'&&++statReads=== (defect==='exit-after'?4:3)) {
        if(defect.startsWith('exit'))table.delete(pid);
        if(defect==='reuse')table.get(pid).starttime='999999';
        if(defect==='protected')table.get(pid).cmdline=`${process.env.HOME}/.youcoded/live`;
        if(defect==='permission'||defect==='malformed') {
          table.delete(pid); // Later absence must not erase this historical error.
          if(defect==='permission')throw Object.assign(Error('denied stat'),{code:'EACCES'});
          return 'malformed stat';
        }
        if(defect==='state')table.get(pid).state='Z';
      }
      const r=table.get(pid);if(!r)throw absent();
      if(file==='stat')return `${pid} (worker) ${[r.state,r.ppid,r.pgrp,r.session,...Array(15).fill(0),r.starttime].join(' ')}`;
      if(file==='status')return `Name:\tworker\nState:\t${r.state} (worker)\nVmRSS:\t3072 kB\n`;
      return r.cmdline.replaceAll(' ','\0');
    }});
  family.capture();
  return {family,table,signals,arm:()=>{armed=true;}};
}
test('default proc producer confirms exit on either final stat bracket without signal or ownership error', async () => {
  for(const defect of ['exit-before','exit-after']) {
    const r=procSignalRig(defect);r.arm();r.family.signalAll('SIGTERM');
    assert.deepEqual(r.signals,[]);
    assert.deepEqual(r.family.errors,[]);
    const receipt=await r.family.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});
    assert.equal(receipt.cleanupConfirmed,true,JSON.stringify(receipt));
    assert.ok(receipt.procFailures.records.some(p=>p.pid===20&&p.errno==='ENOENT'));
  }
});
test('final-read replacement, protected exec, permission, malformed data and historical ambiguity never turn green', async () => {
  for(const defect of ['reuse','protected','permission','malformed','historical']) {
    const r=procSignalRig(defect);
    if(defect==='historical'){r.family.rememberError(Error('historically ambiguous identity'));r.table.delete(20);}
    r.arm();r.family.signalAll('SIGTERM');
    assert.deepEqual(r.signals,[],defect);
    assert.ok(r.family.errors.length>0,defect);
    r.table.delete(20);
    const receipt=await r.family.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});
    assert.equal(receipt.cleanupConfirmed,false,defect);
    assert.ok(receipt.cleanupError,defect);
  }
});
test('state transition alone is not PID replacement or disappearance and zombie still blocks cleanup', async () => {
  const r=procSignalRig('state');r.arm();r.family.signalAll('SIGTERM');
  assert.deepEqual(r.signals,[]);assert.deepEqual(r.family.errors,[]);
  const receipt=await r.family.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});
  assert.equal(receipt.cleanupConfirmed,false);assert.equal(receipt.survivors[0].state,'Z');
});
test('identity is re-read immediately before each signal and missing protection ancestry refuses', () => {
  const { table, family, signals } = rig(); family.capture(); table.set(21, row(21, 20)); family.sample();
  table.get(21).ppid = 999; family.signalAll('SIGTERM'); assert.deepEqual(signals, [[20, 'SIGTERM']]);
  assert.match(family.errors.join(' '), /ancestry/);
});
