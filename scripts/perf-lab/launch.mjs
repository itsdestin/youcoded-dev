// scripts/perf-lab/launch.mjs — starts Xvfb (:99), launches the PACKAGED YouCoded
// app against a throwaway fixture HOME, attaches CDP to its main window, and
// guarantees a teardown that leaves nothing running.
//
// ── LIVE-APP SAFETY (the reason this file is written the way it is) ───────────
// Destin runs the REAL YouCoded app (installed at /opt/YouCoded, HOME=/home/destin)
// as his daily working environment. Nothing in this rig may ever signal it.
//
// Discovery is therefore by /proc/<pid>/cmdline SUBSTRING match against rig-owned
// absolute paths (procs.mjs → findFamily, which reads /proc/<pid>/cmdline and never
// /proc/<pid>/comm). A NAME match — `pkill youcoded`, matching argv[0]'s basename,
// anything of that shape — would kill his live app and is FORBIDDEN here forever.
//
// Three further guards sit on top of that, because a substring match is only as
// safe as the substring:
//   1. assertSafeNeedles()  — refuses vague/dangerous needles (see its comment).
//   2. PROTECTED_MARKERS    — a denylist derived from the REAL home; any process
//      whose cmdline mentions the live app's state dirs (or Claude Code's) is
//      never signalled, whatever else it matched.
//   3. selfChain()          — this process and every ancestor of it are excluded,
//      so the rig can never kill the shell/agent that launched it.
// Nothing here uses process names, and nothing signals a pid it did not first
// re-read from /proc and confirm still matches.
//
// Node built-ins only: the workspace root has no package.json and must not gain one.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, listTargets, waitForMainTarget } from './cdp.mjs';
import { findFamily } from './procs.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Captured ONCE at import, before any env is copied or mutated, so the safety
// checks always compare against the real user's home and not a fixture value
// something later assigned.
const REAL_HOME = resolve(process.env.HOME || homedir());

// A process whose cmdline mentions any of these is NEVER signalled by this module.
// - <real home>/.config/youcoded  → the live app's Electron userData (its renderers
//   carry it as --user-data-dir=…), i.e. the exact processes we must never touch.
// - <real home>/.youcoded         → the live app's own state dir.
// - <real home>/.claude           → every Claude Code process and tool shell, whose
//   cmdlines carry …/.claude/shell-snapshots/…; this protects concurrent sessions
//   that merely *mention* a rig path in a command they are running.
// The rig's own processes run with HOME=<fixture> and so contain none of these.
const PROTECTED_MARKERS = [
  join(REAL_HOME, '.config', 'youcoded'),
  join(REAL_HOME, '.youcoded'),
  join(REAL_HOME, '.claude'),
];

/**
 * Refuse needles that could match anything but the rig.
 * findFamily does a plain substring test, so a needle like "/home/destin" or
 * "youcoded" would match half the machine — including the live app. A needle must
 * be a canonical absolute path, deep enough to be specific, not an ancestor of the
 * real home, and not overlapping a protected marker in either direction.
 */
export function assertSafeNeedles(needles) {
  if (!Array.isArray(needles) || needles.length === 0) {
    throw new Error('perf-lab launch: refusing to search for processes with an empty needle list.');
  }
  for (const n of needles) {
    const where = `needle ${JSON.stringify(n)}`;
    if (typeof n !== 'string' || n.length === 0) throw new Error(`perf-lab launch: ${where} is not a non-empty string.`);
    if (!isAbsolute(n)) throw new Error(`perf-lab launch: ${where} is not an absolute path; a relative needle would match unrelated processes.`);
    if (resolve(n) !== n) throw new Error(`perf-lab launch: ${where} is not canonical (resolves to ${resolve(n)}); pass the resolved path, since the match is a literal substring test.`);
    if (n.split('/').filter(Boolean).length < 3) throw new Error(`perf-lab launch: ${where} has fewer than 3 path segments — far too broad to signal processes by.`);
    if (n.length < 12) throw new Error(`perf-lab launch: ${where} is shorter than 12 characters — far too broad to signal processes by.`);
    if (n === REAL_HOME || REAL_HOME.startsWith(`${n}/`)) throw new Error(`perf-lab launch: ${where} is the real home (${REAL_HOME}) or an ancestor of it. That would match the live app.`);
    for (const m of PROTECTED_MARKERS) {
      if (n === m || m.startsWith(`${n}/`) || n.startsWith(`${m}/`)) {
        throw new Error(`perf-lab launch: ${where} overlaps protected path ${m} (the live app's / Claude Code's state). Refusing.`);
      }
    }
  }
}

function cmdlineOf(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' '); } catch { return ''; }
}

/** This process plus every ancestor, so the rig can never signal its own launcher. */
function selfChain() {
  const out = new Set([process.pid]);
  let pid = process.pid;
  for (let i = 0; i < 64 && pid > 1; i++) {
    let ppid;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      // Same parse as procs.mjs: after ")" the fields are state ppid pgrp …
      ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    } catch { break; }
    if (!Number.isFinite(ppid) || ppid <= 1) break;
    out.add(ppid);
    pid = ppid;
  }
  return out;
}

/**
 * The pids this module is willing to signal: findFamily's matches, minus pid 1,
 * minus this process and its ancestors, minus anything carrying a protected marker.
 * Returns the skipped set too, so callers can say WHY a survivor survived.
 */
export function killableFamily(needles) {
  const mine = selfChain();
  const pids = [];
  const skipped = [];
  for (const pid of findFamily(needles)) {
    if (pid <= 1) { skipped.push({ pid, why: 'pid <= 1' }); continue; }
    if (mine.has(pid)) { skipped.push({ pid, why: 'this rig process or an ancestor of it' }); continue; }
    const c = cmdlineOf(pid);
    const marker = PROTECTED_MARKERS.find((m) => c.includes(m));
    if (marker) { skipped.push({ pid, why: `protected: cmdline mentions ${marker}` }); continue; }
    pids.push(pid);
  }
  return { pids, skipped };
}

function signalAll(pids, sig) {
  for (const pid of pids) {
    // ESRCH (already exited) is the normal case, not an error — kill() is idempotent.
    try { process.kill(pid, sig); } catch { /* gone */ }
  }
}

/** Poll until no killable family member is left, or the budget runs out. */
async function waitForFamilyEmpty(needles, budgetMs, everyMs = 100) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const { pids } = killableFamily(needles);
    if (pids.length === 0) return [];
    if (Date.now() >= deadline) return pids;
    await sleep(Math.min(everyMs, Math.max(1, deadline - Date.now())));
  }
}

/**
 * Chromium's profile locks. Removing them is only safe once nothing is running
 * against that profile — deleting a lock a live Electron still holds is an
 * invitation for two instances to share one userData and corrupt its leveldb.
 * Callers must therefore only reach here after the family is confirmed empty.
 */
function removeSingletonLocks(userData, needles) {
  if (!userData) return;
  if (!isAbsolute(userData)) throw new Error(`perf-lab launch: userData ${JSON.stringify(userData)} is not an absolute path.`);
  // Containment check: the profile we clean must live inside a rig-owned needle
  // (fixture.home is always one), so this can never delete the live app's locks.
  if (!needles.some((n) => userData === n || userData.startsWith(`${n}/`))) {
    throw new Error(`perf-lab launch: refusing to touch profile locks in ${userData} — it is not inside a rig path (${needles.join(', ')}).`);
  }
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    rmSync(join(userData, f), { force: true });
  }
}

/**
 * Kill anything left over from a previous run that matches the fixture/app paths,
 * then clear the profile locks. SIGTERM → poll → SIGKILL → poll → verify.
 *
 * Throws if anything survives: a survivor would hold the CDP port or the profile
 * lock, and the next launch would silently attach to it and measure the wrong app.
 * A no-op sweep (nothing matched) never throws, so this is safe to call repeatedly.
 *
 * @param {string[]} needles      rig-owned absolute paths (see assertSafeNeedles)
 * @param {string} [userData]     fixture profile dir whose Singleton* files to clear
 * @param {{groupPid?: number, termWaitMs?: number, killWaitMs?: number}} [opts]
 */
export async function sweep(needles, userData, opts = {}) {
  assertSafeNeedles(needles);
  const { groupPid, termWaitMs = 3000, killWaitMs = 2000 } = opts;
  const first = killableFamily(needles);

  if (first.pids.length) {
    signalAll(first.pids, 'SIGTERM');
    // Backstop: if we own a detached process group, TERM the whole group — that
    // reaches grandchildren whose argv happens not to mention a needle. Ownership
    // is re-proved from /proc first, so a recycled pid can never be signalled.
    groupKill(groupPid, needles, 'SIGTERM');
    // Poll instead of a flat sleep: a clean exit usually lands in well under 100 ms.
    let left = await waitForFamilyEmpty(needles, termWaitMs);
    if (left.length) {
      signalAll(left, 'SIGKILL');
      groupKill(groupPid, needles, 'SIGKILL');
      left = await waitForFamilyEmpty(needles, killWaitMs);
      if (left.length) {
        // Do NOT clear the profile locks here: something is still holding the profile.
        const detail = left.map((p) => `${p} (${cmdlineOf(p).slice(0, 120) || 'cmdline unreadable'})`).join('; ');
        throw new Error(`perf-lab launch: ${left.length} process(es) survived SIGKILL and still match the rig paths: ${detail}. The profile locks were left in place on purpose — investigate before launching again.`);
      }
    }
  }

  // Only now, with the family provably empty, is it safe to clear the locks.
  removeSingletonLocks(userData, needles);
  return { terminated: first.pids, protectedSkipped: first.skipped };
}

/**
 * Group-kill backstop for a detached spawn. Only fires when the group leader is
 * still alive AND its cmdline still matches a rig needle — that re-read is what
 * makes a pid-recycling accident impossible.
 */
function groupKill(groupPid, needles, sig) {
  if (!groupPid) return;
  const c = cmdlineOf(groupPid);
  if (!c || !needles.some((n) => c.includes(n))) return;  // dead or recycled → never signal
  if (PROTECTED_MARKERS.some((m) => c.includes(m))) return;
  try { process.kill(-groupPid, sig); } catch { /* group already gone */ }
}

// ── Xvfb ─────────────────────────────────────────────────────────────────────

/** Is an X server answering on `display`? Throws only if xdpyinfo itself is missing. */
function probeDisplay(display) {
  return new Promise((res, rej) => {
    const p = spawn('xdpyinfo', ['-display', display], { stdio: 'ignore' });
    p.on('error', (err) => {
      if (err.code === 'ENOENT') {
        rej(new Error('perf-lab launch: `xdpyinfo` is not installed, so the rig cannot tell whether the virtual display came up. Install it with: sudo pacman -S --needed xorg-xdpyinfo'));
      } else {
        rej(new Error(`perf-lab launch: could not run xdpyinfo: ${err.message}`));
      }
    });
    p.on('exit', (code) => res(code === 0));
  });
}

/**
 * Start (or reuse) a virtual X display. Idempotent: a server already listening on
 * `display` — from a previous run — is reused as-is.
 *
 * Reports failure honestly. The draft returned success 700 ms after spawn without
 * ever checking, so a missing Xvfb surfaced 90 seconds later as an unexplained CDP
 * timeout. Now the display is re-probed until it answers, and if it never does we
 * quote the real cause (ENOENT, or Xvfb's own exit code + stderr) rather than
 * guessing at one.
 */
/**
 * Where to find an Xvfb binary, in priority order:
 *   1. $XVFB_BIN — an explicit override
 *   2. `Xvfb` on PATH — a normal system install
 *   3. the vendored copy under scratch/perf-lab/assets/ — extracted from the
 *      distro package into a user prefix, no root needed
 *
 * WHY (3) exists: installing xorg-server-xvfb needs sudo, which this rig cannot
 * do, and on this machine the package DB was stale enough that the install
 * 404'd. Extracting the same package to a user prefix needs no root and every
 * shared library it wants is already present — verified running at
 * 1600x1000x24. This mirrors how the engine and the toy model self-provision:
 * the rig should not be blocked on a privileged step it can do without.
 */
export function resolveXvfbBin() {
  if (process.env.XVFB_BIN) return process.env.XVFB_BIN;
  const onPath = spawnSync('sh', ['-c', 'command -v Xvfb'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
  const vendored = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'scratch', 'perf-lab', 'assets', 'xvfb-prefix', 'usr', 'bin', 'Xvfb');
  if (existsSync(vendored)) return vendored;
  return 'Xvfb';   // let the spawn fail with a real ENOENT, reported below
}

export async function startXvfb(display = ':99', { timeoutMs = 8000 } = {}) {
  if (await probeDisplay(display)) return { proc: null, display, reused: true };

  const stderr = [];
  let spawnError = null;
  let exit = null;
  const xvfbBin = resolveXvfbBin();
  const proc = spawn(xvfbBin, [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  proc.on('error', (err) => { spawnError = err; });           // explicit: an ENOENT here must not be an unhandled rejection
  proc.on('exit', (code, signal) => { exit = { code, signal }; });
  proc.stderr.on('data', (b) => { stderr.push(b.toString('latin1')); });
  proc.stderr.on('error', () => {});

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await sleep(150);
    if (spawnError) {
      if (spawnError.code === 'ENOENT') {
        throw new Error(`perf-lab launch: Xvfb is not installed — the perf rig needs a virtual X display to run the app headless. Install it with: sudo pacman -S --needed xorg-server-xvfb`);
      }
      throw new Error(`perf-lab launch: could not start Xvfb on ${display}: ${spawnError.message}`);
    }
    if (await probeDisplay(display)) break;
    if (exit) {
      const said = stderr.join('').trim();
      throw new Error(`perf-lab launch: Xvfb exited immediately (${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}) and ${display} is not up.${said ? ` Xvfb said: ${said}` : ' It printed nothing.'}`);
    }
    if (Date.now() >= deadline) {
      const said = stderr.join('').trim();
      try { process.kill(proc.pid, 'SIGTERM'); } catch {}
      throw new Error(`perf-lab launch: Xvfb is running but ${display} did not answer within ${timeoutMs}ms.${said ? ` Xvfb said: ${said}` : ' It printed nothing.'}`);
    }
  }

  // Unref so a finished rig can exit; Xvfb is deliberately left running between
  // runs (startXvfb reuses it), and it holds no app state.
  proc.unref();
  proc.stderr.unref?.();
  return { proc, display, reused: false };
}

// ── The app ──────────────────────────────────────────────────────────────────

const TAIL_BYTES = 8192;
function tailSink(store) {
  return (buf) => {
    store.text += buf.toString('latin1');
    if (store.text.length > TAIL_BYTES) store.text = store.text.slice(-TAIL_BYTES);
  };
}

/**
 * Launch the packaged app against the fixture and connect CDP to its main window.
 *
 * @param {{binary: string, appDir: string, fixture: object, cdpPort?: number, display?: string}} o
 */
export async function launchApp({ binary, appDir, fixture, cdpPort = 9555, display = ':99' }) {
  if (!binary) throw new Error('perf-lab launch: launchApp needs { binary } — the packaged app executable.');
  if (!fixture?.home || !fixture?.userData) throw new Error('perf-lab launch: launchApp needs a fixture with { home, userData } from buildFixture().');
  // A fixture HOME that IS (or contains) the real home would put the rig's writes
  // in Destin's real dotfiles and make every needle match his live app. Refuse loudly.
  if (resolve(fixture.home) === REAL_HOME || REAL_HOME.startsWith(`${resolve(fixture.home)}/`)) {
    throw new Error(`perf-lab launch: fixture.home (${fixture.home}) is the real home or an ancestor of it. Refusing to launch.`);
  }

  const familyNeedles = [appDir, fixture.home];
  assertSafeNeedles(familyNeedles);

  const env = { ...process.env };
  // No YOUCODED_PROFILE: a profile skips the install-hooks chore (main.ts:1339) and
  // we must measure the boot users actually get.
  // XDG_CONFIG_HOME is DELETED rather than set: on Linux Electron's userData is
  // (XDG_CONFIG_HOME || $HOME/.config)/<appName>, so with it gone the profile is
  // derived from the fixture HOME and lands at <fixture>/.config/youcoded — the dir
  // buildFixture() already seeded. If it were inherited from this shell it would
  // point at the REAL ~/.config and the run would write into the live app's profile.
  // XDG_DATA_HOME / XDG_CACHE_HOME are deleted for the same reason: an inherited
  // value would send Chromium's cache into ~/.cache/youcoded, which the live app
  // also uses. (fixture.env pins the same three explicitly; deleting is equivalent
  // here because HOME is the fixture.)
  // ELECTRON_RUN_AS_NODE would make the binary run as a bare Node process — no
  // window, no CDP — and NODE_OPTIONS could inject an inspector into it.
  for (const k of [
    'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH', 'CLAUDE_EFFORT',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
    'WAYLAND_DISPLAY', 'YOUCODED_PROFILE',
    'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS',
  ]) delete env[k];
  Object.assign(env, {
    HOME: fixture.home,
    DISPLAY: display,
    // Read from process.env (the REAL environment) and written into `env` (our copy),
    // so there is no self-reference. filter(Boolean) keeps an absent PATH from
    // becoming the literal string "undefined" or a stray trailing colon (an empty
    // PATH entry means "the current directory", which is a real hazard). The
    // fixture's bin/ goes FIRST so its fake `claude` wins over any real one.
    PATH: [fixture.bin, process.env.PATH].filter(Boolean).join(':'),
    YOUCODED_PORT_OFFSET: '100',      // keeps the rig's remote server off the live app's ports
    YOUCODED_PERF_LOG: fixture.perfLog,
    YOUCODED_NATIVE: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  });

  // Never attach to a stale app from a crashed run: kill it FIRST, and refuse to
  // continue if it will not die (sweep throws).
  await sweep(familyNeedles, fixture.userData);

  // If something is still answering on the CDP port after that sweep, it is NOT ours
  // (ours would have matched a needle). Attaching would measure a foreign browser.
  let portBusy = false;
  try { await listTargets(cdpPort); portBusy = true; } catch { /* nothing listening — good */ }
  if (portBusy) {
    throw new Error(`perf-lab launch: something is already serving CDP on port ${cdpPort} and it is not part of this rig (it matches none of ${familyNeedles.join(', ')}). Refusing to attach — pass a different cdpPort or close that process yourself.`);
  }

  const out = { text: '' };
  const err = { text: '' };
  const spawnedAt = Date.now();
  // detached: true gives the app its own process group, which buys the `-pid` group
  // kill above as a backstop for descendants findFamily might not match. The tradeoff
  // — a detached app outlives the rig — is covered three ways: the stdio pipes are
  // unref'd so the rig can exit, an exit/SIGINT/SIGTERM handler group-kills on the way
  // out, and the next run's sweep() would kill any orphan before launching anyway.
  const proc = spawn(binary, [`--remote-debugging-port=${cdpPort}`, '--no-sandbox'], {
    env, cwd: fixture.home, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  proc.stdout.on('data', tailSink(out));
  proc.stderr.on('data', tailSink(err));
  proc.stdout.on('error', () => {});
  proc.stderr.on('error', () => {});

  const output = () => [
    err.text.trim() ? `stderr (last ${Math.min(err.text.length, TAIL_BYTES)} bytes):\n${err.text.trim()}` : 'stderr: (empty)',
    out.text.trim() ? `stdout (last ${Math.min(out.text.length, TAIL_BYTES)} bytes):\n${out.text.trim()}` : 'stdout: (empty)',
  ].join('\n');

  let exitInfo = null;
  // The draft discarded stdio and had no exit handler, so a missing/crashing binary
  // showed up only as a 90-second CDP timeout. Now the death itself is the error, and
  // it quotes what the app actually printed.
  const died = new Promise((_res, rej) => {
    proc.on('error', (e) => {
      rej(new Error(e.code === 'ENOENT'
        ? `perf-lab launch: app binary not found: ${binary}. Build the packaged app first.`
        : `perf-lab launch: could not spawn ${binary}: ${e.message}`));
    });
    proc.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      rej(new Error(`perf-lab launch: the app exited before its CDP window appeared (${signal ? `signal ${signal}` : `exit code ${code}`}), ${Date.now() - spawnedAt}ms after spawn.\n${output()}`));
    });
  });

  let target;
  try {
    // Promise.race attaches a handler to `died`, so a later exit cannot surface as an
    // unhandled rejection.
    target = await Promise.race([waitForMainTarget(cdpPort, { timeoutMs: 90000 }), died]);
  } catch (e) {
    await sweep(familyNeedles, fixture.userData, { groupPid: proc.pid }).catch(() => {});
    throw e;
  }

  // Sanity: the window we are about to drive must belong to a process that matches
  // the rig paths. If it does not, we found someone else's browser.
  if (killableFamily(familyNeedles).pids.length === 0) {
    await sweep(familyNeedles, fixture.userData, { groupPid: proc.pid }).catch(() => {});
    throw new Error(`perf-lab launch: a CDP target appeared on :${cdpPort} but no process matches the rig paths (${familyNeedles.join(', ')}). Refusing to measure a process this rig does not own.`);
  }

  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // Last-resort cleanup so a crashed or Ctrl-C'd rig cannot leave the app running.
  // Synchronous by necessity ('exit' allows no async work), and it goes through the
  // same killable/protected filter as everything else.
  let cleanedUp = false;
  const hardCleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try { signalAll(killableFamily(familyNeedles).pids, 'SIGKILL'); } catch {}
    try { groupKill(proc.pid, familyNeedles, 'SIGKILL'); } catch {}
  };
  const onSignal = (sig) => { hardCleanup(); process.exit(sig === 'SIGINT' ? 130 : 143); };
  const onExit = () => hardCleanup();
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.on('exit', onExit);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  const detachHandlers = () => {
    process.off('exit', onExit);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };

  // Unref the child and its pipes so the rig's event loop is not held open by an app
  // the caller forgot to kill; the handlers above still clean up on the way out.
  proc.unref();
  proc.stdout.unref?.();
  proc.stderr.unref?.();

  return {
    proc, spawnedAt, pid: proc.pid, cdpPort, target, cdp, familyNeedles,
    /** Every matching pid, including protected/self ones — for measurement, not signalling. */
    family: () => findFamily(familyNeedles),
    /** Last few KB the app printed; the thing to paste when a run misbehaves. */
    output,
    get exitInfo() { return exitInfo; },
    /**
     * Idempotent teardown: SIGTERM the family, poll up to 3 s, SIGKILL stragglers,
     * poll again, then clear the profile locks. Throws only if something SURVIVED —
     * a survivor would hold port 9555 or the profile and poison the next run.
     * Never throws for an already-dead app.
     */
    async kill() {
      cleanedUp = true;                 // the exit handler must not double-signal
      detachHandlers();
      try { cdp.close(); } catch {}
      await sweep(familyNeedles, fixture.userData, { groupPid: proc.pid });
    },
  };
}
