// Opt-in single-app launch backend. No marker sweeps, public PID controls, shell
// commands or negative group signals. Runtime remains gated on independent review.
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { constants, openSync, closeSync, writeSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSupervisorPlan, SUPERVISOR_STOP_TIMEOUT_MS } from './supervised-launch-core.mjs';
import { authorizeSupervisorPackage } from './supervised-package.mjs';
import { observeChildRetirement } from './supervised-retirement.mjs';
import { assertProtocolEnvelope, PROTOCOL_CAPS } from './supervised-protocol.mjs';

function timeout(promise, ms, label) {
  let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`Supervisor ${label} timeout`)), ms); })]).finally(() => clearTimeout(timer));
}
export class SupervisorProxy extends EventEmitter {
  constructor(worker) {
    super(); this.worker = worker; this.pending = new Map(); this.nextId = 1; this.receipt = null; this.retired = false;
    this.proc = new EventEmitter(); this.proc.stdout = new PassThrough({ highWaterMark: 16384 }); this.proc.stderr = new PassThrough({ highWaterMark: 16384 });
    this.proc.unref = () => {}; this.proc.exitCode = null; this.proc.signalCode = null; this.members = [];
    this.ready = new Promise((ok, reject) => { this.readyOk = ok; this.readyReject = reject; });
    this.ready.catch(() => {});
    this.tails = { stdout: '', stderr: '' };
    for (const name of ['stdout','stderr']) this.proc[name].on('data', data => { this.tails[name] = (this.tails[name] + data.toString('utf8')).slice(-8192); });
    // WHY: require each real resource event; aggregate close can be absent after
    // manual IPC disconnect on Node 26 despite exit + all configured pipes closed.
    this.retirement = observeChildRetirement(worker);
    this.closed = this.retirement.done;
    worker.on('message', message => {
      try {
        assertProtocolEnvelope(message);
        if (!message || typeof message !== 'object' || Object.keys(message).some(k=>!['fatal','id','result','error','event','final'].includes(k))) throw Error('Invalid worker envelope');
      }
      catch { this.failPending('Supervisor oversized/unsafe response'); this.disconnect(); return; }
      if (message.fatal) { this.readyReject(Error(message.fatal)); this.failPending(message.fatal); return; }
      if (message.id && this.pending.has(message.id)) {
        const p = this.pending.get(message.id); this.pending.delete(message.id);
        message.error ? p.reject(Error(message.error)) : p.resolve(message.result); return;
      }
      const event = message.event;
      if (event?.type === 'ready') this.readyOk(event);
      if (event?.type === 'sample') this.members = event.members ?? [];
      if (event?.type === 'ownership') this.members = [event.leader];
      if (event?.type === 'retirement' || message.final) { this.receipt = message.final ?? event; this.retired = true; }
      if (event?.type === 'app-exit') { this.proc.exitCode = event.code; this.proc.signalCode = event.signal; this.proc.emit('exit', event.code, event.signal); }
      if (event?.type === 'app-close') { this.proc.stdout.end(); this.proc.stderr.end(); this.proc.emit('close', event.code, event.signal); }
      if (event?.type === 'stdio') {
        if (!['stdout','stderr'].includes(event.name) || typeof event.data !== 'string' || event.data.length > 22000) { this.disconnect(); return; }
        if (!this.proc[event.name].write(Buffer.from(event.data, 'base64'))) this.disconnect(); // no unbounded controller buffering
      }
    });
    worker.on('error', error => { this.readyReject(error); this.failPending(error.message); });
    worker.on('close', (code, signal) => { this.readyReject(Error('Supervisor closed before acknowledgement')); this.failPending('Supervisor channel closed'); });
    worker.on('disconnect', () => { this.failPending('Supervisor disconnected'); });
  }
  assertBinding({ binary, appDir, fixture, cdpPort, display }) {
    if (!this.plan || binary !== this.plan.binary || dirname(binary) !== resolve(appDir) || fixture.home !== this.plan.home || fixture.userData !== this.plan.userData || cdpPort !== this.plan.cdpPort || display !== this.plan.display) throw Error('Supervisor launch binding mismatch');
  }
  output() { return `stdout tail: ${this.tails.stdout}\nstderr tail: ${this.tails.stderr}`; }
  failPending(reason) { for (const p of this.pending.values()) p.reject(Error(reason)); this.pending.clear(); }
  disconnect() { if (this.worker.connected) this.worker.disconnect(); }
  request(type, ms = 10000) {
    if (this.retired || !this.worker.connected || !['launch','endpoint','stop'].includes(type)) return Promise.reject(Error('Supervisor retired or unsupported request'));
    if (this.pending.size >= PROTOCOL_CAPS.requests) { this.failPending('Supervisor request cap exceeded'); this.disconnect(); return Promise.reject(Error('Supervisor request cap exceeded')); }
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      assertProtocolEnvelope({ id, type });
      try { this.worker.send({ id, type }, error => { if (error) { this.pending.delete(id); reject(error); this.disconnect(); } }); }
      catch (error) { this.pending.delete(id); reject(error); this.disconnect(); }
    });
    return timeout(result, ms, type).catch(error => { this.pending.delete(id); this.disconnect(); throw error; });
  }
  async spawn() {
    const result = await this.request('launch', 8000); this.proc.pid = result.pid;
    if (this.proc.exitCode !== null || this.proc.signalCode !== null) throw Error('App exited before supervised handle delivery');
    return this.proc;
  }
  async kill() {
    if (!this.retired) await this.request('stop', SUPERVISOR_STOP_TIMEOUT_MS).catch(error => { if (!this.receipt) throw error; });
    const workerClose = await timeout(this.closed, 2000, 'retirement close');
    if (this.receipt?.cleanupConfirmed !== true) throw Error(`Supervisor cleanup unconfirmed: ${JSON.stringify(this.receipt)}`);
    if (workerClose.code !== 0 || workerClose.signal || workerClose.error) throw Error('Supervisor retirement had abnormal process close');
    return this.receipt;
  }
}

export async function startLaunchSupervisor({ runDir, fixture, binary, checkout, wallMs, maxRssMb, cleanupReserveMs, cdpPort = 9569, display = ':99' }) {
  if (process.platform !== 'linux') throw Error('Supervised launcher is Linux-only');
  const packageReceipt = await authorizeSupervisorPackage({ checkout, binary });
  const plan = validateSupervisorPlan({ revision: 1, packageReceipt, runDir: resolve(runDir), binary: resolve(binary), home: fixture.home, bin: fixture.bin,
    userData: fixture.userData, perfLog: fixture.perfLog, wallMs, maxRssMb, cleanupReserveMs, cdpPort, display });
  const directory = lstatSync(runDir);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== process.getuid() || (directory.mode & 0o077) !== 0 || realpathSync(runDir) !== runDir) throw Error('Private supervisor run directory required');
  const path = join(runDir, 'supervisor-plan.json');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { assertProtocolEnvelope(plan); writeSync(fd, JSON.stringify(plan)); } finally { closeSync(fd); }
  // The worker, not the measurement controller, is the app's direct parent.
  // Inherit no user keys, NODE_OPTIONS or app profile in the supervisor process.
  const worker = fork(fileURLToPath(new URL('./supervised-launch-worker.mjs', import.meta.url)), [path], {
    cwd: runDir, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, LANG: 'C.UTF-8' },
    execArgv: [], stdio: ['ignore','ignore','ignore','ipc'], detached: true,
  });
  const proxy = new SupervisorProxy(worker);
  proxy.plan = Object.freeze(plan);
  try { await timeout(proxy.ready, 5000, 'acknowledgement'); }
  catch (error) { proxy.disconnect(); throw error; }
  return proxy;
}
