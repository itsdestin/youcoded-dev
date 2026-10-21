// Single-app supervisor state machine. Dependencies are injected for OFFLINE tests;
// the worker supplies the only real process implementation, never remote commands.
import { isAbsolute, join, resolve } from 'node:path';
import { assertProtocolEnvelope } from './supervised-protocol.mjs';

// WHY: reserve accounts for worst-case bounded teardown, not just TERM+KILL.
export const CLEANUP_BUDGET = Object.freeze({ termMs: 1000, killMs: 1500, stabilizeMs: 50, exitCloseMs: 1000, flushMs: 250, pollMs: 100, marginMs: 4100 });
export const MIN_CLEANUP_RESERVE_MS = Object.values(CLEANUP_BUDGET).reduce((a,b)=>a+b,0);
export const SUPERVISOR_STOP_TIMEOUT_MS = MIN_CLEANUP_RESERVE_MS + 2000;
import { CONTAINMENT_LIMITS } from './owned-processes.mjs';

export const SUPERVISION_LIMITS = `${CONTAINMENT_LIMITS} Initial app family only: Xvfb/compositor/provider/controller are outside this scope. No cgroup, pidfd, privilege, kernel memory enforcement or guaranteed orphan reaping. Synchronous evidence I/O can block this supervisor; byte bounds are not a kernel deadline guarantee.`;
const KEYS = ['revision','runDir','binary','home','bin','userData','perfLog','wallMs','maxRssMb','cleanupReserveMs','cdpPort','display','packageReceipt'];
export function validateSupervisorPlan(plan) {
  if (!plan || Object.keys(plan).some(k => !KEYS.includes(k)) || plan.revision !== 1) throw Error('Invalid fixed supervisor plan');
  for (const key of ['runDir','binary','home','bin','userData','perfLog']) if (typeof plan[key] !== 'string' || !isAbsolute(plan[key]) || resolve(plan[key]) !== plan[key]) throw Error(`Invalid absolute ${key}`);
  if (!plan.runDir.includes('/perf-lab/') || plan.home !== join(plan.runDir, 'home') || plan.bin !== join(plan.home, 'bin') || plan.userData !== join(plan.home, '.config/youcoded') || plan.perfLog !== join(plan.home, 'perf-marks.jsonl')
    || !plan.packageReceipt || plan.packageReceipt.revision !== 1 || plan.packageReceipt.packageRoot !== join(plan.packageReceipt.checkout ?? '', 'desktop/release/linux-unpacked')
    || plan.binary !== join(plan.packageReceipt.packageRoot, 'youcoded')) throw Error('Private package receipt/path binding required');
  assertProtocolEnvelope(plan.packageReceipt);
  for (const [key,min,max] of [['wallMs',10000,600000],['maxRssMb',64,2048],['cleanupReserveMs',MIN_CLEANUP_RESERVE_MS,20000],['cdpPort',1024,65535]]) if (!Number.isSafeInteger(plan[key]) || plan[key] < min || plan[key] > max) throw Error(`Invalid ${key} cap`);
  if (plan.cleanupReserveMs >= plan.wallMs / 2 || typeof plan.display !== 'string' || !/^:[0-9]+$/.test(plan.display)) throw Error('Invalid cleanup reserve or display');
  return { ...plan };
}

export function verifyPostExecIdentity(record, leader, { home, binary, packageReceipt }, uid, gateExe) {
  if (!record || !leader || record.pid !== leader.pid || record.starttime !== leader.starttime || record.ppid !== leader.ppid
    || record.pgrp !== record.pid || record.session !== record.pid || record.home !== home || record.uid !== uid) throw Error('Post-exec identity/HOME/UID mismatch');
  if (record.exe === gateExe) return false;
  if (record.exe !== binary) throw Error('Unexpected post-exec executable');
  const expected = packageReceipt?.identity;
  if (!expected || !record.executableIdentity || ['dev','ino','uid','mode'].some(k => record.executableIdentity[k] !== expected[k])) throw Error('Post-exec package device/inode identity mismatch');
  return true;
}

export class SupervisorSession {
  constructor(plan, deps) {
    this.plan = validateSupervisorPlan(plan); this.deps = deps; this.started = deps.now();
    this.state = 'new'; this.launches = 0; this.gate = null; this.family = null; this.receipt = null; this.stopping = null;
  }
  note(type, fields = {}) { const row = { revision: 1, type, at: this.deps.now(), ...fields }; assertProtocolEnvelope(row); this.deps.persist(row); this.deps.emit(row); }
  ready() { if (this.state !== 'new') throw Error('Supervisor already acknowledged'); this.state = 'ready'; this.note('ready', { limits: SUPERVISION_LIMITS }); }
  async handle(message) {
    if (!message || Object.keys(message).some(k => k !== 'type') || !['launch','endpoint','stop'].includes(message.type)) throw Error('Unsupported supervisor protocol');
    if (message.type === 'stop') return this.stop('controller-stop');
    if (this.stopping || ['retired','failed-retirement'].includes(this.state)) throw Error('Supervisor retired; new launch forbidden');
    if (message.type === 'endpoint') {
      if (this.state !== 'running') throw Error('Endpoint unavailable before verified exec');
      return this.deps.endpoint(this.family, this.plan.cdpPort);
    }
    if (this.state !== 'ready' || this.launches++) throw Error('Only one launch per supervisor');
    this.state = 'starting';
    try {
      const gate = await this.deps.spawnGate(this.plan);
      this.gate = gate;
      if (this.stopping) { gate.abort(); throw Error('Supervisor retired during gate acquisition'); }
      // capture can record a verified leader then fail a later family sample.
      // Retain that usable authority in finally; never infer ownership from EOF.
      try { await gate.capture(); }
      finally { if (gate.family?.leader) this.family = gate.family; }
      this.note('ownership', { leader: this.family.leader });
      if (this.stopping || this.deps.now() >= this.started + this.plan.wallMs - this.plan.cleanupReserveMs) throw Error('Supervisor retired/deadline before gate release');
      gate.release();
      await gate.corroborate();
      if (this.stopping) throw Error('Supervisor retired during exec');
      this.state = 'running';
      const result = { pid: gate.child.pid, leader: this.family.leader };
      this.note('launched', result); return result;
    } catch (error) {
      this.gate?.abort();
      await this.stop(`startup: ${error.message}`);
      throw error;
    }
  }
  async tick() {
    if (this.stopping) return;
    if (this.deps.now() >= this.started + this.plan.wallMs - this.plan.cleanupReserveMs) return this.stop('deadline-reserve');
    if (!this.family) return;
    try {
      const snapshot = this.family.sample();
      if (snapshot.members.length > 128) throw Error('Supervisor family member cap exceeded');
      this.note('sample', { rssMb: snapshot.rssMb, members: snapshot.members.map(({ pid, starttime, state }) => ({ pid, starttime, state })) });
      if (snapshot.rssMb > this.plan.maxRssMb) return this.stop('memory-limit');
      if (this.state === 'running' && !snapshot.members.some(r => r.pid === this.gate.child.pid && !['Z','X'].includes(r.state))) return this.stop('dead-app');
    } catch (error) { return this.stop(`ownership-uncertain: ${error.message}`); }
  }
  stop(reason) {
    if (this.stopping) return this.stopping;
    const wasStarting = this.state === 'starting';
    this.state = 'stopping';
    this.stopping = (async () => {
      let cleanup = { cleanupConfirmed: !this.gate && !wasStarting, survivors: [] }, pipes = { exited: !this.gate, closed: !this.gate };
      this.gate?.abort(); // closes release pipe; NEVER writes release on an error.
      try {
        if (this.family) cleanup = await this.family.cleanup({ termWaitMs: CLEANUP_BUDGET.termMs, killWaitMs: CLEANUP_BUDGET.killMs, everyMs: CLEANUP_BUDGET.stabilizeMs });
        if (this.gate) pipes = await this.gate.waitClosed(CLEANUP_BUDGET.exitCloseMs);
      } catch (error) { cleanup = { cleanupConfirmed: false, cleanupError: error.message, survivors: [] }; }
      const cleanupConfirmed = cleanup.cleanupConfirmed === true && pipes.exited === true && pipes.closed === true && !pipes.error;
      this.receipt = { reason, cleanupConfirmed, memoryComplete:cleanup.memoryComplete!==false, family: cleanup, pipes, limits: SUPERVISION_LIMITS };
      this.state = cleanupConfirmed ? 'retired' : 'failed-retirement';
      this.note('retirement', this.receipt);
      return this.receipt;
    })();
    return this.stopping;
  }
}
