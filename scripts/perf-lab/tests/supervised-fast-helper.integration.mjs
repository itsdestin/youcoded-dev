// TEST ONLY, import-safe and excluded from *.test.mjs. DO NOT RUN before review.
// One fixed true invocation; proves gate mechanics, NOT production allowlist entry.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, readSync, fstatSync, lstatSync, realpathSync,
  readFileSync, mkdirSync, mkdtempSync, writeFileSync, fsyncSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnedProcesses, boundedProcPids, readProc } from '../owned-processes.mjs';
import { inspectExecIdentity } from '../supervised-launch-linux.mjs';
import { HelperExecEvidence } from '../supervised-compositor-helpers.mjs';
import { disposeCompositorChildResources } from '../supervised-compositor-linux.mjs';
import { assertProtocolEnvelope } from '../supervised-protocol.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const SUPPORT = fileURLToPath(new URL('./supervised-fast-helper-fixedsupport.py', import.meta.url));
const GATE = fileURLToPath(new URL('../supervised-exec-gate.py', import.meta.url));
const BINARY = '/usr/bin/true';
const CAPS = Object.freeze({ outerMs: 9000, workMs: 5000, bytes: 4096, members: 4, rssMb: 64 });
const digest = value => createHash('sha256').update(value).digest('hex');
const fields = st => ({ dev: st.dev, ino: st.ino, uid: st.uid, mode: st.mode });
const same = (a, b) => ['dev', 'ino', 'uid', 'mode'].every(key => a[key] === b[key]);

function privatePath(runDir) {
  return typeof runDir === 'string' && resolve(runDir) === runDir &&
    runDir.startsWith(`${ROOT}/scratch/perf-lab/synthetic-fast-`) &&
    /^[A-Za-z0-9]+$/.test(runDir.slice(`${ROOT}/scratch/perf-lab/synthetic-fast-`.length));
}

export function assertFastHelperOptIn({ argv, env, platform }) {
  if (platform !== 'linux' || !Array.isArray(argv) || argv.length ||
      env?.PERF_LAB_SYNTHETIC_FAST_HELPER !== '1') {
    throw Error('Explicit Linux PERF_LAB_SYNTHETIC_FAST_HELPER=1 and no arguments required');
  }
}

export function buildFastHelperPlan(options) {
  if (!options || Object.keys(options).sort().join(',') !== 'identity,runDir,uid') {
    throw Error('No synthetic binary/argv/environment overrides');
  }
  const { runDir, identity, uid } = options;
  if (!privatePath(runDir) || !Number.isSafeInteger(uid) || uid < 0 ||
      !identity || Object.keys(identity).sort().join(',') !== 'dev,ino,mode,uid' ||
      Object.values(identity).some(n => !Number.isSafeInteger(n) || n < 0) ||
      ![0, uid].includes(identity.uid) || (identity.mode & 0o170000) !== 0o100000 ||
      (identity.mode & 0o6022) || !(identity.mode & 0o100)) throw Error('Invalid synthetic private identity');
  const home = join(runDir, 'home');
  return { binary: BINARY, identity: { ...identity }, argv: [BINARY],
    env: { HOME: home, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    helperProof: { purpose: 'synthetic-fast-true', uid, home } };
}

export function validateFastHelperPlan(plan, trustedPlan) {
  assertProtocolEnvelope(plan);
  const home = plan?.helperProof?.home;
  const runDir = typeof home === 'string' && home.endsWith('/home') ? home.slice(0, -5) : '';
  const expected = buildFastHelperPlan({ runDir, identity: plan?.identity, uid: plan?.helperProof?.uid });
  // Canonical serialization rejects extra keys, argv/env changes and identity drift.
  if (!trustedPlan || JSON.stringify(plan) !== JSON.stringify(expected) ||
      JSON.stringify(plan) !== JSON.stringify(trustedPlan)) throw Error('Synthetic plan mutation rejected');
  return plan;
}

export function protectedSourceHashes() {
  return Object.fromEntries([GATE,
    fileURLToPath(new URL('../supervised-package.mjs', import.meta.url)),
    fileURLToPath(new URL('../supervised-launch-core.mjs', import.meta.url)),
    fileURLToPath(new URL('../supervised-launch-linux.mjs', import.meta.url)),
    fileURLToPath(new URL('../supervised-compositor-policy.mjs', import.meta.url)),
  ].map(path => [path, digest(readFileSync(path))]));
}

export function assertSourcesUnchanged(before) {
  const after = protectedSourceHashes();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Protected production source changed');
}

function verifyFile(path, { elf = false, rootOnly = false } = {}) {
  if (realpathSync(path) !== path) throw Error('Synthetic dependency not canonical');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = fstatSync(fd), after = lstatSync(path);
    if (!st.isFile() || !same(st, after) || ![0, process.getuid()].includes(st.uid) ||
        (rootOnly && st.uid !== 0) || (st.mode & 0o6022)) throw Error('Untrusted synthetic dependency');
    if (elf) {
      const head = Buffer.alloc(4);
      if (!(st.mode & 0o100) || readSync(fd, head, 0, 4, 0) !== 4 || head.toString('hex') !== '7f454c46') {
        throw Error('Synthetic dependency must be executable ELF');
      }
    }
    return fields(st);
  } finally { closeSync(fd); }
}

function privateDirectory(path) {
  const st = lstatSync(path);
  if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700 ||
      realpathSync(path) !== path) throw Error('Synthetic private 0700 directory required');
}

export async function runFastHelperSynthetic(...args) {
  if (args.length) throw Error('Synthetic runtime accepts no options');
  assertFastHelperOptIn({ argv: process.argv.slice(2), env: process.env, platform: process.platform });
  const before = protectedSourceHashes();
  const python = realpathSync('/usr/bin/python3');
  if (!/^\/usr\/bin\/python3(?:\.\d+)?$/.test(python)) throw Error('Fixed Python path unavailable');
  const binaryIdentity = verifyFile(BINARY, { elf: true });
  verifyFile(python, { elf: true, rootOnly: true });
  const supportIdentity = verifyFile(SUPPORT), gateIdentity = verifyFile(GATE);
  const supportHash = digest(readFileSync(SUPPORT));
  const parent = join(ROOT, 'scratch/perf-lab');
  mkdirSync(parent, { recursive: true });
  if (realpathSync(parent) !== parent) throw Error('Synthetic evidence ancestor symlink rejected');
  const runDir = mkdtempSync(join(parent, 'synthetic-fast-'));
  const home = join(runDir, 'home');
  mkdirSync(home, { mode: 0o700 });
  privateDirectory(runDir); privateDirectory(home);
  const plan = buildFastHelperPlan({ runDir, identity: binaryIdentity, uid: process.getuid() });
  const planPath = join(runDir, 'exec-plan.json'), raw = JSON.stringify(plan);
  writeFileSync(planPath, raw, { flag: 'wx', mode: 0o600 });
  const planIdentity = verifyFile(planPath);
  const evidencePath = join(runDir, 'evidence.jsonl');
  const evidenceFd = openSync(evidencePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const report = { revision: 1, status: 'incomplete', runDir,
    scope: 'TEST ONLY substituted fixed-true policy; real gate mechanics, NOT production allowlist acceptance',
    binary: BINARY, signals: [], productionSourcesBefore: before, supportHash };
  let records = 0, bytes = 0;
  const persist = row => {
    assertProtocolEnvelope(row);
    const text = JSON.stringify(row) + '\n';
    bytes += Buffer.byteLength(text);
    if (++records > 16 || bytes > 65536) throw Error('Synthetic evidence cap');
    writeFileSync(evidenceFd, text);
    fsyncSync(evidenceFd);
  };
  persist(report); // durable path exists BEFORE any acquired child
  const started = performance.now();
  let child, family, proof, released = false, exited = false, closed = false, eof = false;
  let code = null, signal = null, outputBytes = 0, failure = null, outerTimer, workTimer;
  let rejectFailure, readyResolve, doneResolve, cancellation;
  const failed = new Promise((_, reject) => { rejectFailure = reject; });
  failed.catch(() => {});
  const ready = new Promise(resolveReady => { readyResolve = resolveReady; });
  const done = new Promise(resolveDone => { doneResolve = resolveDone; });
  const checkDone = () => { if (exited && closed && eof) doneResolve(); };
  const fail = error => { if (!failure) { failure = error; rejectFailure(error); } };
  let stopping = false;
  const cleanup = () => {
    if (cancellation) return cancellation;
    stopping = true;
    cancellation = (async () => {
      if (child && !released) child.stdio[3].destroy(); // EOF is never release
      let receipt = { cleanupConfirmed: !child, survivors: [] };
      if (family?.leader) receipt = await family.cleanup({ termWaitMs: 200, killWaitMs: 300, everyMs: 25 });
      report.cleanup = receipt; // retain observed uncertainty BEFORE local detach
      if (child) report.localResources = disposeCompositorChildResources(child);
      return receipt;
    })();
    return cancellation;
  };
  try {
    // The parent watchdog is independent of child execution; it never signals an
    // uncaptured PID. Gate self-release timeout is five seconds, work timeout five.
    outerTimer = setTimeout(() => {
      fail(Error('Synthetic outer watchdog 9s'));
      void cleanup().catch(error => { report.cleanupError = String(error.message).slice(0, 512); });
    }, CAPS.outerMs);
    workTimer = setTimeout(() => fail(Error('Synthetic work deadline 5s')), CAPS.workMs);
    child = spawn(python, ['-I', '-S', SUPPORT, planPath], { cwd: home, detached: true,
      env: { ...plan.env, PERF_LAB_SYNTHETIC_FAST_HELPER: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
    proof = new HelperExecEvidence({ pid: child.pid, uid: process.getuid(), home,
      purpose: 'synthetic-fast-true', identity: binaryIdentity, planDigest: digest(raw) });
    child.on('error', fail);
    child.on('exit', (c, s) => { exited = true; code = c; signal = s; checkDone(); });
    child.on('close', () => { closed = true; checkDone(); });
    for (const stream of [child.stdout, child.stderr, child.stdio[3], child.stdio[4]]) stream.on('error', fail);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      outputBytes += data.length;
      if (outputBytes > CAPS.bytes) fail(Error('Synthetic stdio cap'));
    });
    child.stdio[4].on('data', data => {
      try { proof.append(data); if (proof.ready) readyResolve(); } catch (error) { fail(error); }
    });
    child.stdio[4].on('end', () => { eof = true; proof.end(); checkDone(); });
    family = new OwnedProcesses({ leaderPid: child.pid, parentPid: process.pid, jobDir: runDir,
      maxMembers: CAPS.members, descendantsOnly: true, list: () => boundedProcPids({ maxEntries: 2048 }),
      signal: (pid, sig) => {
        if (!failure && !report.error && !stopping) throw Error('Synthetic signals forbidden outside failure retirement');
        report.signals.push({ pid, sig });
        process.kill(pid, sig);
      } });
    await Promise.race([ready, failed]);
    if (stopping || exited) throw Error('Gate retired before capture');
    try {
      family.captureExecGate({ expectedExe: python, expectedUid: process.getuid(), expectedHome: home, inspect: inspectExecIdentity });
    } finally { if (family.leader) report.capturedGate = family.leader; }
    const snapshot = family.sample();
    if (snapshot.members.length !== 1 || snapshot.rssMb > CAPS.rssMb) throw Error('Synthetic pre-exec family/RSS unexpected');
    persist({ type: 'captured-gate', leader: family.leader, rssMb: snapshot.rssMb });
    // Re-read every fixed input after acquisition; hashes make policy substitution
    // disclosure auditable, not an excuse to change the actual gate or app policy.
    validateFastHelperPlan(JSON.parse(readFileSync(planPath, 'utf8')), plan);
    if (!same(verifyFile(planPath), planIdentity) || readFileSync(planPath, 'utf8') !== raw ||
        !same(verifyFile(BINARY, { elf: true }), binaryIdentity) ||
        !same(verifyFile(SUPPORT), supportIdentity) || digest(readFileSync(SUPPORT)) !== supportHash ||
        !same(verifyFile(GATE), gateIdentity)) throw Error('Synthetic fixed input substituted');
    assertSourcesUnchanged(before);
    if (stopping || failure || performance.now() - started >= CAPS.workMs) throw failure ?? Error('Synthetic retired before release');
    released = true;
    child.stdio[3].end('R');
    // WHY: deliberately wait for real exit + all child pipes closed + receipt EOF
    // BEFORE invoking the consumer. No sleep, busy wait or live-exe fabrication.
    await Promise.race([done, failed]);
    if (failure || outputBytes !== 0) throw failure ?? Error('Fixed true emitted unexpected output');
    report.execution = proof.corroborate({ released, connected: true, exited, closed, code, signal },
      () => { throw Error('Live inspection forbidden in forced-fast branch'); });
    if (report.execution.kind !== 'authorized_fdexec_completed' || report.execution.runtimeExeObserved !== false) {
      throw Error('Synthetic did not exercise unobserved fast-completion branch');
    }
    if (family.sample().members.length !== 0 || readProc(child.pid) !== null) {
      throw Error('Synthetic completed child has remaining observed family');
    }
    report.cleanup = await family.cleanup({ termWaitMs: 200, killWaitMs: 300, everyMs: 25 });
    report.procAbsent = readProc(child.pid) === null;
    if (!report.cleanup.cleanupConfirmed || !report.procAbsent || report.signals.length) throw Error('Synthetic retirement incomplete/unexpected signal');
    assertSourcesUnchanged(before);
    report.productionSourcesAfter = protectedSourceHashes();
    report.status = 'measured-test-only';
  } catch (error) {
    report.error = String(error.message).slice(0, 1024);
    await cleanup().catch(error => { report.cleanupError = String(error.message).slice(0, 512); });
    process.exitCode = 2;
  } finally {
    clearTimeout(workTimer); clearTimeout(outerTimer);
    if (!report.localResources && child) report.localResources = disposeCompositorChildResources(child);
    try {
      assertSourcesUnchanged(before);
      report.productionSourcesAfter = protectedSourceHashes();
    } catch (error) {
      report.status = 'incomplete';
      report.sourceError = String(error.message).slice(0, 512);
      process.exitCode = 2;
    }
    report.actualEvents = { exited, closed, eof, code, signal, released, outputBytes };
    report.elapsedMs = performance.now() - started;
    try { persist({ type: 'final', ...report }); } finally { closeSync(evidenceFd); }
    console.log(JSON.stringify({ status: report.status, evidencePath, execution: report.execution?.kind,
      cleanupConfirmed: report.cleanup?.cleanupConfirmed === true }));
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFastHelperSynthetic().catch(error => { console.error(error.message); process.exitCode = 2; });
}
