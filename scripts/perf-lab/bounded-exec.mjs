// scripts/perf-lab/bounded-exec.mjs — run a fixture-generation / image-decode child under an EXTERNAL memory bound.
//
// WHY (lane F, item 1): generating a 4096x3072 image or a 5 MiB sheet allocates far more than the file it writes, and the old
// guard was "the caller promises". A bound enforced from outside the child cannot be argued with:
//   1. preferred: `systemd-run --user --scope -p MemoryMax=<n>M -p MemorySwapMax=0 -- <cmd>` — a transient USER-level cgroup
//      scope (no system change, no root); the kernel kills the child when it exceeds the limit, and swap is off so it cannot
//      hide in swap.
//   2. fallback when the user manager is unavailable: `prlimit --as=<bytes> -- <cmd>` — an address-space cap. Node reserves a
//      lot of virtual address space that is not memory, so the cap is MemoryMax plus a fixed headroom (AS_HEADROOM_MB); it is a
//      looser bound than (1) and the report says which one applied.
// A child that dies from the bound is a RECORDED row `failed:memory-bound`, never a missing one. Nothing here installs
// anything or touches system configuration.
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';

export const BOUND = Object.freeze({ systemd: 'systemd-run-user-scope', prlimit: 'prlimit-as', none: 'none' });
/** Virtual address space node needs beyond real memory (measured: node starts and runs under prlimit --as=2G; 4 GiB is a wide margin). */
export const AS_HEADROOM_MB = 4096;
const KILL_GRACE_MS = 5_000;
const TAIL = 4_000;

/** Pure: which bound to use given what probing found. */
export function chooseBound({ systemdUser = false, prlimit = false } = {}) {
  return systemdUser ? BOUND.systemd : prlimit ? BOUND.prlimit : BOUND.none;
}

/** Pure: the exact argv that wraps `argv` in the bound. Throws on BOUND.none so an unbounded run can never be built by accident. */
export function boundedArgv(bound, memoryMaxMb, argv) {
  if (!Number.isInteger(memoryMaxMb) || memoryMaxMb < 64 || memoryMaxMb > 32768) throw new Error('bounded-exec: memoryMaxMb must be an integer in 64..32768');
  if (!Array.isArray(argv) || !argv.length || argv.some((a) => typeof a !== 'string')) throw new Error('bounded-exec: argv must be a non-empty string array');
  if (bound === BOUND.systemd) return ['systemd-run', '--user', '--scope', '-q', '-p', `MemoryMax=${memoryMaxMb}M`, '-p', 'MemorySwapMax=0', '--', ...argv];
  if (bound === BOUND.prlimit) return ['prlimit', `--as=${(memoryMaxMb + AS_HEADROOM_MB) * 1024 * 1024}`, '--', ...argv];
  throw new Error('bounded-exec: no memory bound is available; refusing to run unbounded');
}

/** Probe once which bound works HERE (a 1-second no-op under each), never assuming from the OS. */
export function detectBound({ run = (cmd, args) => spawnSync(cmd, args, { timeout: 10_000, stdio: 'ignore' }) } = {}) {
  const ok = (cmd, args) => { try { const r = run(cmd, args); return r.status === 0 && !r.error; } catch { return false; } };
  const systemdUser = ok('systemd-run', ['--user', '--scope', '-q', '-p', 'MemoryMax=64M', '--', 'true']);
  const prlimit = ok('prlimit', ['--as=1073741824', '--', 'true']);
  return { bound: chooseBound({ systemdUser, prlimit }), systemdUser, prlimit };
}

const MEMORY_TEXT = /out of memory|allocation failed|array buffer allocation failed|invalid array length|std::bad_alloc|heap limit|cannot allocate memory|ENOMEM|ERR_MEMORY_ALLOCATION_FAILED|memory allocation failed/i;
/** Pure: what a finished child means. A bound kill is its own status so the lane never confuses it with a bug. */
export function classifyBoundedExit({ bound, code, signal, stderr = '', timedOut = false }) {
  if (timedOut) return 'failed:timeout';
  if (code === 0 && !signal) return 'ok';
  // cgroup OOM kill: SIGKILL, or the 137 (128+9) that systemd-run reports when its scope's process was SIGKILLed.
  if (bound === BOUND.systemd && (signal === 'SIGKILL' || code === 137)) return 'failed:memory-bound';
  // address-space cap: allocation errors from V8/libc, or node's abort (SIGABRT / 134) after "Allocation failed".
  if (bound === BOUND.prlimit && (MEMORY_TEXT.test(stderr) || signal === 'SIGABRT' || code === 134)) return 'failed:memory-bound';
  if (MEMORY_TEXT.test(stderr)) return 'failed:memory-bound';
  return 'failed:exit';
}

/**
 * Run `argv` bounded. Resolves (never rejects) with { status, bound, memoryMaxMb, code, signal, stdout, stderr, elapsedMs }.
 * `spawn` is injectable for tests. A timed-out child is stopped by its exact pid (SIGTERM, then SIGKILL after a grace).
 */
export function runBounded({ argv, memoryMaxMb, timeoutMs = 120_000, bound, spawn = nodeSpawn, now = Date.now }) {
  return new Promise((resolve) => {
    const started = now();
    let wrapped;
    try { wrapped = boundedArgv(bound, memoryMaxMb, argv); }
    catch (error) { resolve({ status: 'failed:no-memory-bound', bound, memoryMaxMb, code: null, signal: null, stdout: '', stderr: error.message, elapsedMs: 0 }); return; }
    let stdout = '', stderr = '', timedOut = false, settled = false;
    let child;
    try { child = spawn(wrapped[0], wrapped.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ status: 'failed:exit', bound, memoryMaxMb, code: null, signal: null, stdout: '', stderr: `spawn failed: ${error.message}`, elapsedMs: 0 }); return; }
    const finish = (code, signal) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer);
      resolve({ status: classifyBoundedExit({ bound, code, signal, stderr, timedOut }), bound, memoryMaxMb, code, signal, stdout: stdout.slice(-TAIL * 4), stderr: stderr.slice(-TAIL), elapsedMs: now() - started });
    };
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, KILL_GRACE_MS);
      killTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (d) => { stdout += d; if (stdout.length > TAIL * 8) stdout = stdout.slice(-TAIL * 4); });
    child.stderr?.on('data', (d) => { stderr += d; if (stderr.length > TAIL * 2) stderr = stderr.slice(-TAIL); });
    child.on('error', (error) => { stderr += `\n${error.message}`; finish(null, null); });
    child.on('close', finish);
  });
}
