import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, statSync, rmSync, linkSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorizeSupervisorPackage, assertPackageIdentity, reauthorizeSupervisorPackage } from '../supervised-package.mjs';
import { fetchSupervisedTargets } from '../launch-supervised-app.mjs';
import { assertProtocolEnvelope, makeBoundedSender } from '../supervised-protocol.mjs';
import { SupervisorSession, CLEANUP_BUDGET, MIN_CLEANUP_RESERVE_MS, validateSupervisorPlan } from '../supervised-launch-core.mjs';
import { bindSupervisorProtocol } from '../supervised-launch-worker.mjs';
import { SupervisorProxy } from '../supervised-launch.mjs';

const checkout = '/isolated/approved/youcoded', binary = checkout + '/desktop/release/linux-unpacked/youcoded';
const file = () => ({ dev: 1, ino: 2, uid: 1000, mode: 0o100755, isFile: () => true, isSymbolicLink: () => false });
function packageDeps(patch = {}) {
  const stamp = { sha: 'a'.repeat(40), dirty: 'b'.repeat(12), builtAt: '2026-10-20T00:00:00.000Z' };
  return { approvedCheckouts: [checkout], expectedCommon: '/shared/youcoded/.git', readRegistration: () => checkout + '/.git', uid: () => 1000, canonical: p => p,
    stat: p => { if (p !== binary) throw Object.assign(Error('missing'), { code: 'ENOENT' }); return file(); },
    productionStat: () => { throw Object.assign(Error('missing'), { code: 'ENOENT' }); },
    git: async args => args[0] === 'worktree' ? `worktree ${checkout}\nHEAD ${'a'.repeat(40)}\n` : args.includes('--git-common-dir') ? '/shared/youcoded/.git' : args.includes('--absolute-git-dir') ? '/shared/youcoded/.git/worktrees/approved' : checkout,
    fingerprint: async () => stamp, readStamp: async () => stamp, readOptionalStamp: async()=>null, ...patch };
}
const receipt = () => ({ revision: 1, checkout, checkoutIdentity: { common: '/shared/youcoded/.git', gitDir: '/shared/youcoded/.git/worktrees/approved' }, packageRoot: checkout + '/desktop/release/linux-unpacked', stamp: { sha: 'a'.repeat(40), dirty: 'b'.repeat(12), builtAt: '2026-10-20T00:00:00.000Z' }, identity: { dev: 1, ino: 2, uid: 1000, mode: 0o100755 } });
const plan = () => ({ revision: 1, runDir: '/tmp/perf-lab/review-private', binary, packageReceipt: receipt(), home: '/tmp/perf-lab/review-private/home', bin: '/tmp/perf-lab/review-private/home/bin', userData: '/tmp/perf-lab/review-private/home/.config/youcoded', perfLog: '/tmp/perf-lab/review-private/home/perf-marks.jsonl', wallMs: 60000, maxRssMb: 1536, cleanupReserveMs: 8000, cdpPort: 9569, display: ':99' });

test('package authority requires exact approved isolated Git worktree and current official package; path hints are not authority', async () => {
  const r = await authorizeSupervisorPackage({ checkout, binary }, packageDeps());
  assert.equal(r.identity.ino, 2); assert.equal(r.checkout, checkout);
  for (const request of [{ checkout, binary: '/tmp/youcoded' }, { checkout: '/scratch/worktrees/misleading', binary }, { checkout: '/isolated/other', binary }]) await assert.rejects(authorizeSupervisorPackage(request, packageDeps()), /approved|package/);
  for (const deps of [
    packageDeps({ canonical: p => p === binary ? '/foreign/youcoded' : p }),
    packageDeps({ stat: () => ({ ...file(), uid: 999 }) }),
    packageDeps({ stat: () => ({ ...file(), mode: 0o100777 }) }),
    packageDeps({ productionStat: () => file() }), // production hardlink has same dev/inode
    packageDeps({ git: async args => args.includes('--show-toplevel') ? checkout : '/shared/youcoded/.git' }),
    packageDeps({ expectedCommon: '/other-repo/.git' }),
    packageDeps({ readRegistration: () => '/forged/checkout/.git' }),
    packageDeps({ git: async (args, cwd) => args[0] === 'worktree' ? 'worktree /unapproved/neighbor\n' : packageDeps().git(args, cwd) }),
    packageDeps({ canonical: p => p === checkout ? '/opt/YouCoded' : p }),
    packageDeps({ readStamp: async () => ({ ...receipt().stamp, dirty: 'f'.repeat(12) }) }),
    packageDeps({ readOptionalStamp: async()=>({...receipt().stamp,sha:'f'.repeat(40)}) }),
  ]) await assert.rejects(authorizeSupervisorPackage({ checkout, binary }, deps), /approved|canonical|owner|writ|production|worktree|stamp/);
});

test('real filesystem canonical package stamps/executable checks reject symlinked stamp and production hardlink inode', async () => {
  const root=mkdtempSync(join(tmpdir(),'supervised-package-test-')), approved=join(root,'approved','youcoded'), packageRoot=join(approved,'desktop/release/linux-unpacked'), exe=join(packageRoot,'youcoded');
  mkdirSync(packageRoot,{recursive:true}); writeFileSync(exe,'fake ELF never executed'); chmodSync(exe,0o755);
  const stamp=receipt().stamp, stampPath=join(approved,'desktop/release/.perf-lab-build.json');writeFileSync(stampPath,JSON.stringify(stamp));
  const installed=join(root,'fake-installed-youcoded');writeFileSync(installed,'fake installed never executed');chmodSync(installed,0o755);
  const deps={approvedCheckouts:[approved],expectedCommon:'/repo/.git',readRegistration:()=>approved+'/.git',canonical:p=>p.startsWith('/repo/')?p:realpathSync(p),git:async args=>args[0]==='worktree'?`worktree ${approved}\n`:args.includes('--git-common-dir')?'/repo/.git':args.includes('--absolute-git-dir')?'/repo/.git/worktrees/private':approved,fingerprint:async()=>stamp,
    productionStat:()=>statSync(installed)};
  try {
    assert.equal((await authorizeSupervisorPackage({checkout:approved,binary:exe},deps)).identity.ino,statSync(exe).ino);
    rmSync(stampPath);symlinkSync(join(root,'missing-stamp'),stampPath);
    await assert.rejects(authorizeSupervisorPackage({checkout:approved,binary:exe},deps),/ELOOP|symbolic/);
    rmSync(stampPath);writeFileSync(stampPath,JSON.stringify(stamp));rmSync(exe);linkSync(installed,exe);
    await assert.rejects(authorizeSupervisorPackage({checkout:approved,binary:exe},deps),/production.*inode/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('worker reauthorization rejects forged/stale receipt by recomputing checkout/cache/executable evidence', async () => {
  const p=plan();
  assert.deepEqual(await reauthorizeSupervisorPackage(p,packageDeps()),receipt());
  await assert.rejects(reauthorizeSupervisorPackage(p, packageDeps({ approvedCheckouts: [] })), /approved/);
  await assert.rejects(reauthorizeSupervisorPackage(p, packageDeps({ readRegistration: () => '/moved/.git' })), /registration/);
  await assert.rejects(reauthorizeSupervisorPackage(p, packageDeps({ git: async (args, cwd) => args.includes('--absolute-git-dir') ? '/shared/youcoded/.git/worktrees/replaced' : packageDeps().git(args, cwd) })), /receipt/);
  for(const patch of [{ identity:{...receipt().identity,ino:999} },{ stamp:{...receipt().stamp,dirty:'f'.repeat(12)} },{ checkout:'/foreign' }]) {
    await assert.rejects(reauthorizeSupervisorPackage({...p,packageReceipt:{...receipt(),...patch}},packageDeps()),/receipt|approved/);
  }
});

test('retained device/inode/UID/mode is checked again before exec and cannot follow replacement', () => {
  const r = receipt();
  assert.doesNotThrow(() => assertPackageIdentity(binary, r, packageDeps()));
  for (const patch of [{ ino: 99 }, { dev: 3 }, { uid: 9 }, { mode: 0o100777 }]) assert.throws(() => assertPackageIdentity(binary, r, packageDeps({ stat: () => ({ ...file(), ...patch }) })), /identity|owner|writ/);
});

test('supervised discovery never follows 302/307, uses exact numeric origin and cancels bounded body', async () => {
  for (const status of [302,307]) {
    let calls = 0, cancelled = 0;
    await assert.rejects(fetchSupervisedTargets(9569, { fetcher: async (url, opts) => { calls++; assert.equal(url, 'http://127.0.0.1:9569/json/list'); assert.equal(opts.redirect, 'error'); return { status, ok: false, url, body: { cancel: async () => cancelled++ } }; } }), /redirect|status/);
    assert.equal(calls, 1); assert.equal(cancelled, 1);
  }
  let cancelled = 0;
  const response = { status: 200, ok: true, url: 'http://127.0.0.1:9569/json/list', body: { getReader: () => ({ read: async () => ({ value: new Uint8Array(65537), done: false }), cancel: async () => cancelled++, releaseLock: () => {} }) } };
  await assert.rejects(fetchSupervisedTargets(9569, { fetcher: async () => response }), /byte cap/);
  assert.equal(cancelled, 1);
  await assert.rejects(fetchSupervisedTargets(9569, { fetcher: async () => ({ ...response, url: 'http://localhost:9569/json/list', body: { cancel: async () => cancelled++ } }) }), /origin/);
});

test('stalled supervised discovery body is canceled by independent deadline without a real socket', async () => {
  let fire,cancelled=0,signal;
  const pending=fetchSupervisedTargets(9569,{setTimer:fn=>{fire=fn;return 1;},clearTimer:()=>{},fetcher:async(url,options)=>{
    signal=options.signal;return {status:200,ok:true,url,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>cancelled++,releaseLock:()=>{}})}};
  }});
  await new Promise(setImmediate);fire();await assert.rejects(pending,/deadline/);
  assert.equal(signal.aborted,true);assert.equal(cancelled,1);
});

test('cleanup reserve is derived from every bounded cleanup stage plus margin', () => {
  assert.ok(MIN_CLEANUP_RESERVE_MS >= 8000);
  assert.ok(Object.values(CLEANUP_BUDGET).reduce((a,b) => a+b,0) <= MIN_CLEANUP_RESERVE_MS);
  assert.throws(() => validateSupervisorPlan({ ...plan(), cleanupReserveMs: 7999 }), /reserve|Reserve/);
});

test('worst bounded cleanup fits wall reserve including monitor poll, exit/close, flush and margin', async () => {
  let now=60000-MIN_CLEANUP_RESERVE_MS+CLEANUP_BUDGET.pollMs;
  const family={leader:{pid:20,starttime:'200'},sample:()=>({members:[{pid:20}],rssMb:1}),cleanup:async options=>{
    assert.equal(options.termWaitMs,CLEANUP_BUDGET.termMs); assert.equal(options.killWaitMs,CLEANUP_BUDGET.killMs);
    now+=options.termWaitMs+options.killWaitMs+CLEANUP_BUDGET.stabilizeMs; return {cleanupConfirmed:true};
  }};
  const gate={child:{pid:20},family,capture:async()=>{},release:()=>{},corroborate:async()=>{},abort:()=>{},waitClosed:async ms=>{now+=ms;return {exited:true,closed:true};}};
  let clock=0;
  const s=new SupervisorSession(plan(),{now:()=>clock,persist:()=>{},emit:()=>{},spawnGate:async()=>gate});s.ready(); await s.handle({type:'launch'});
  clock=now; family.cleanup=async options=>{clock+=options.termWaitMs+options.killWaitMs+CLEANUP_BUDGET.stabilizeMs;return {cleanupConfirmed:true};};
  gate.waitClosed=async ms=>{clock+=ms;return {exited:true,closed:true};};
  await s.tick();
  assert.equal(s.receipt.reason,'deadline-reserve');
  assert.ok(clock+CLEANUP_BUDGET.flushMs+CLEANUP_BUDGET.marginMs<=60000);
});

test('capture that records leader then fails sampling still cleans usable family before retirement; no proof never signals', async () => {
  for (const verified of [true,false]) {
    let cleanupCalls = 0, released = false, aborted = false;
    const family = { leader: verified ? { pid: 20, starttime: 'start' } : null, cleanup: async () => { cleanupCalls++; return { cleanupConfirmed: true }; } };
    const gate = { child: { pid: 20 }, family, capture: async () => { throw Error('sample failed after capture'); }, release: () => { released = true; }, abort: () => { aborted = true; }, waitClosed: async () => ({ exited: true, closed: true }) };
    const s = new SupervisorSession(plan(), { now: () => 0, persist: () => {}, emit: () => {}, spawnGate: async () => gate });
    s.ready(); await assert.rejects(s.handle({ type: 'launch' }), /sample/);
    assert.equal(cleanupCalls, verified ? 1 : 0); assert.equal(released, false); assert.equal(aborted, true);
    assert.equal(s.receipt.cleanupConfirmed, verified);
  }
});

test('envelopes bound arrays, records, escaped bytes and depth BEFORE process.send allocation', () => {
  assert.doesNotThrow(() => assertProtocolEnvelope({ id: 1, result: { owned: true, members: [{ pid: 20, starttime: '123' }] } }));
  let deep={};for(let i=0;i<14;i++)deep={next:deep};assert.throws(()=>assertProtocolEnvelope(deep),/depth cap/);
  let invoked=0;const hooked={};Object.defineProperty(hooked,'toJSON',{get:()=>{invoked++;return ()=>({});}});
  assert.throws(()=>assertProtocolEnvelope(hooked),/hook/);assert.equal(invoked,0);
  for (const value of [{ result: { members: Array(129).fill({ pid: 20 }) } }, { error: '\u0000'.repeat(12000) }, { data: 'x'.repeat(70000) }, Object.fromEntries(Array.from({length:513}, (_,i) => ['p'+i,1]))]) assert.throws(() => assertProtocolEnvelope(value), /cap/);
});

test('worker sender callback stalls and oversized responses fail closed without forwarding excess', () => {
  const worker = { connected: true }, reasons = [], sent = [];
  worker.send = (message, callback) => sent.push(message); // callbacks deliberately stalled
  const send = makeBoundedSender(worker, reason => reasons.push(reason));
  for (let i=0;i<40;i++) send({ id: i+1, result: true });
  assert.equal(sent.length, 16); assert.ok(reasons.includes('IPC-outstanding-cap'));
  send({ result: { members: Array(129).fill(0) } }); assert.equal(sent.length,16);
});

test('oversized completed handler response never reaches send and forces independent retirement', async () => {
  const controller=new EventEmitter(), reasons=[], sent=[];
  const detach=bindSupervisorProtocol(controller,{handle:async()=>({members:Array(129).fill(0)})},{finish:r=>reasons.push(r),send:m=>sent.push(m),isStopping:()=>false});
  controller.emit('message',{id:1,type:'endpoint'}); await new Promise(setImmediate);
  assert.deepEqual(sent,[]); assert.ok(reasons.includes('IPC-response-cap')); detach();
});

test('actual worker admission serializes endpoint requests and caps concurrent input flood', async () => {
  const controller = new EventEmitter(), reasons = [], sent = []; let calls=0;
  const detach = bindSupervisorProtocol(controller, { handle: () => { calls++; return new Promise(() => {}); } }, { finish: r => reasons.push(r), send: m => sent.push(m), isStopping: () => false });
  controller.emit('message', { id: 1, type: 'endpoint' }); controller.emit('message', { id: 2, type: 'endpoint' });
  assert.equal(calls, 1); assert.ok(reasons.includes('IPC-admission-cap')); detach();
});

test('proxy caps outstanding requests when worker response/callback stalls', async () => {
  const worker = new EventEmitter(); worker.connected=true; let sent=0, disconnected=0;
  worker.send = () => { sent++; }; worker.disconnect = () => { worker.connected=false; disconnected++; worker.emit('disconnect'); };
  const proxy = new SupervisorProxy(worker), promises=[];
  for(let i=0;i<20;i++) promises.push(proxy.request('endpoint').catch(e => e.message));
  const results=await Promise.all(promises);
  assert.ok(sent<=8); assert.equal(disconnected,1); assert.ok(results.some(s=>/cap/.test(s)));
});
