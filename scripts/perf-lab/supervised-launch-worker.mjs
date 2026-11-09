// Internal entry point: single immutable plan, private IPC channel, one app only.
import { constants, openSync, closeSync, writeSync, realpathSync, statSync, lstatSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SupervisorSession, validateSupervisorPlan, CLEANUP_BUDGET } from './supervised-launch-core.mjs';
import { makeLinuxAdapters } from './supervised-launch-linux.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { boundedJson } from './resource-checkpoint.mjs';
import { reauthorizeSupervisorPackage } from './supervised-package.mjs';
import { assertProtocolEnvelope, makeBoundedSender, sendFinalAndDisconnect } from './supervised-protocol.mjs';

// Actual worker protocol handler, dependency-injected for offline IPC tests.
export function bindSupervisorProtocol(controller, session, { finish, send, isStopping }) {
  let admitted = 0, endpointPending = false, failed = false;
  const fail = reason => { if (!failed) { failed = true; void finish(reason); } };
  const onDisconnect = () => { void finish('controller-disconnect'); };
  const onTerm = () => { void finish('supervisor-SIGTERM'); };
  const onInt = () => { void finish('supervisor-SIGINT'); };
  const onMessage = message => {
    if (failed) return;
    try { assertProtocolEnvelope(message); } catch { fail('IPC-envelope-cap'); return; }
    if (!message || !Number.isSafeInteger(message.id) || message.id < 1 || Object.keys(message).some(k => !['id','type'].includes(k))) { void finish('invalid-protocol'); return; }
    if (isStopping()) { send({ id: message.id, error: 'Supervisor retired' }); return; }
    if (admitted >= 2 || (message.type === 'endpoint' && endpointPending)) { fail('IPC-admission-cap'); return; }
    admitted++; if (message.type === 'endpoint') endpointPending = true;
    session.handle({ type: message.type }).then(result => {
      try { assertProtocolEnvelope({ id: message.id, result }); send({ id: message.id, result }); }
      catch { fail('IPC-response-cap'); }
      if (message.type === 'stop') void finish('controller-stop');
    }, error => {
      const text = String(error.message ?? 'request failure').slice(0,1024);
      send({ id: message.id, error: text }); void finish(`request-error: ${text}`);
    }).finally(() => { admitted--; if (message.type === 'endpoint') endpointPending = false; });
  };
  controller.on('disconnect', onDisconnect); controller.on('SIGTERM', onTerm); controller.on('SIGINT', onInt); controller.on('message', onMessage);
  return () => { controller.off('disconnect', onDisconnect); controller.off('SIGTERM', onTerm); controller.off('SIGINT', onInt); controller.off('message', onMessage); };
}

export async function runSupervisorWorker(planPath) {
  if (process.platform !== 'linux' || typeof process.send !== 'function' || process.argv.length !== 3) throw Error('Private Linux supervisor IPC required');
  const plan = validateSupervisorPlan(JSON.parse(readBoundedText(planPath, { maxBytes: 65536 })));
  if (resolve(planPath) !== `${plan.runDir}/supervisor-plan.json`) throw Error('Supervisor plan outside private run');
  for (const path of [plan.runDir, plan.home, plan.bin, plan.userData]) {
    const st = lstatSync(path);
    if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || realpathSync(path) !== path) throw Error('Untrusted private directory identity');
  }
  if ((statSync(plan.runDir).mode & 0o077) !== 0) throw Error('Supervisor run directory must be private mode 0700');
  await reauthorizeSupervisorPackage(plan); // independent exact checkout/cache/inode authority before ready or gate acquisition
  mkdirSync(`${plan.home}/.runtime`, { mode: 0o700 });
  const fd = openSync(`${plan.runDir}/supervisor-evidence.jsonl`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  let bytes = 0, records = 0, outputBytes = 0, stopping = false, timer, closed = false;
  let detachProtocol = () => {};
  const send = makeBoundedSender(process, reason => { void finish(reason); });
  const persist = row => {
    assertProtocolEnvelope(row);
    const text = boundedJson(row);
    if (++records > 10000 || bytes + Buffer.byteLength(text) > 5 * 1024 * 1024) throw Error('Supervisor evidence cap exceeded');
    const data = Buffer.from(text); bytes += data.length;
    for (let offset = 0; offset < data.length;) {
      const n = writeSync(fd, data, offset, data.length - offset);
      if (n <= 0) throw Error('Supervisor evidence short write');
      offset += n;
    }
  };
  const emit = message => send({ event: message });
  const output = (name, data) => {
    outputBytes += data.length;
    if (outputBytes > 1024 * 1024) { void finish('stdio-byte-cap'); return; }
    // No more than 16 KiB per IPC envelope; raw bytes retained by proxy streams.
    for (let i = 0; i < data.length; i += 16384) send({ event: { type: 'stdio', name, data: data.subarray(i, i + 16384).toString('base64') } });
  };
  const session = new SupervisorSession(plan, makeLinuxAdapters(plan, { persist, emit, output }));
  async function finish(reason) {
    if (stopping) return; stopping = true; clearInterval(timer);
    let receipt;
    try { receipt = await session.stop(reason); }
    catch (error) { receipt = { cleanupConfirmed: false, reason, error: error.message }; send({ event: { type: 'retirement', ...receipt } }); }
    detachProtocol();
    try { if (!closed) { closed = true; closeSync(fd); } } catch { receipt.cleanupConfirmed = false; }
    process.exitCode = receipt.cleanupConfirmed ? 0 : 2;
    // Same bounded callback/disconnect path as startup fatal failures.
    sendFinalAndDisconnect(process,send,{final:receipt});
  }
  detachProtocol = bindSupervisorProtocol(process, session, { finish, send, isStopping: () => stopping });
  timer = setInterval(() => { void session.tick().then(() => { if (session.receipt) void finish(session.receipt.reason); }, error => { void finish(`monitor-error: ${error.message}`); }); }, CLEANUP_BUDGET.pollMs);
  if (!process.connected) { await finish('controller-disconnected-before-ready'); return; }
  session.ready();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runSupervisorWorker(process.argv[2]).catch(error => {
  const send=makeBoundedSender(process,()=>{});
  sendFinalAndDisconnect(process,send,{fatal:String(error.message).slice(0,1024)});
  process.exitCode = 2;
});
