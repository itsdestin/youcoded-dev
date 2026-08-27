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
//   4. protectedAncestor()  — a process is also spared when any process ABOVE it
//      carries a protected marker. Marker-on-own-cmdline alone was not enough: a
//      sibling the agent spawns (say `grep -r foo <fixture>/home`) mentions a rig
//      path, carries no marker itself, and is nobody's ancestor — so guards 1-3
//      all waved it through and the sweep SIGKILLed another tool's work mid-write.
// Nothing here uses process names, and nothing signals a pid it did not first
// re-read from /proc and confirm still matches.
//
// Node built-ins only: the workspace root has no package.json and must not gain one.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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

/**
 * A process's argv, NUL-separated in /proc, joined with spaces. '' when the pid is
 * already gone or unreadable — and '' matches no needle, so an unreadable process is
 * never signalled. Exported so tests can drive the safety filters with a fake process
 * table instead of the machine's real one.
 */
export function readCmdline(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' '); } catch { return ''; }
}

/**
 * A process's parent pid. 0 when the pid is gone or the file is unreadable, which
 * every walk below treats as "chain ends here".
 *
 * WHY /proc/<pid>/status and not /proc/<pid>/stat: in /stat the executable name sits
 * in parentheses and MAY ITSELF CONTAIN ')', so the parent pid has to be counted as
 * an offset from the last ')' — a parse that is easy to get quietly wrong, and getting
 * it wrong here means walking the wrong family tree while deciding what to SIGKILL.
 * /status states it in words: a plain "PPid:\t<n>" line.
 */
export function readPpid(pid) {
  try {
    const m = /^PPid:\s*(\d+)/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
    return m ? Number(m[1]) : 0;
  } catch { return 0; }
}

// Every ancestor walk in this file stops after this many steps. /proc cannot really
// contain a cycle, but a truncated read, a pid recycled mid-walk, or an injected
// reader in a test can all produce one — and a walk that never ends is a rig that
// hangs holding a half-killed app, which is worse than one that gives up.
const ANCESTOR_WALK_CAP = 64;

/**
 * This process plus every ancestor, so the rig can never signal its own launcher
 * (the shell, the agent, the terminal). Also the STOP LINE for the ancestor walk
 * below — see protectedAncestor.
 */
export function selfChain(ppidOf = readPpid, startPid = process.pid) {
  const out = new Set([startPid]);
  let pid = startPid;
  for (let i = 0; i < ANCESTOR_WALK_CAP && pid > 1; i++) {
    const ppid = ppidOf(pid);
    if (!Number.isFinite(ppid) || ppid <= 1 || out.has(ppid)) break;   // out.has = cycle guard
    out.add(ppid);
    pid = ppid;
  }
  return out;
}

/**
 * Walk `pid`'s ancestry looking for a protected process, and return the first one
 * found (or null). This is guard 4 from the header.
 *
 * WHY the ancestry and not just the process itself: a needle is a plain substring of
 * a command line, so ANY program that merely NAMES a rig path matches it —
 * `grep -r foo <fixture>/home`, an `rsync` copying the fixture out, an editor saving a
 * file under it. Such a process is not the app, carries no protected marker of its
 * own, and is not an ancestor of the rig, so the older filter handed it straight to
 * SIGTERM/SIGKILL. Killing a `cp` or an editor mid-write loses somebody's data. Its
 * PARENT, though, is the tool shell that started it, and that shell's command line
 * does carry a marker — so asking "who started this?" is the fence that tells a
 * bystander apart from the app we own.
 *
 * WHY the walk stops at `ours`: the rig's OWN Electron is, by construction, a child
 * of this process — and this process is very often itself a child of a Claude Code
 * tool shell, which is protected. Without the stop, the rig would inherit that
 * protection through its parent and become unable to kill the app it just launched,
 * which breaks teardown completely. Anything at or below the rig in the tree is the
 * rig's own family and stays killable.
 */
export function protectedAncestor(pid, { cmdlineOf = readCmdline, ppidOf = readPpid, ours = new Set() } = {}) {
  const seen = new Set();
  let cur = pid;
  for (let depth = 0; depth < ANCESTOR_WALK_CAP && cur > 1; depth++) {
    if (seen.has(cur)) break;          // cycle guard: a pid we already visited
    seen.add(cur);
    if (ours.has(cur)) return null;    // reached the rig itself — below here is ours to kill
    const marker = PROTECTED_MARKERS.find((m) => cmdlineOf(cur).includes(m));
    if (marker) return { pid: cur, marker, depth };
    const parent = ppidOf(cur);
    if (!Number.isFinite(parent) || parent <= 1) break;
    cur = parent;
  }
  return null;
}

/**
 * The pids this module is willing to signal: findFamily's matches, minus pid 1,
 * minus this process and its ancestors, minus anything protected in its own right
 * or by descent (protectedAncestor). Returns the skipped set too, so callers can
 * say WHY a survivor survived.
 *
 * `deps` exists ONLY so the tests can substitute a fake process table — production
 * callers pass one argument and get the real /proc.
 */
export function killableFamily(needles, deps = {}) {
  const {
    find = findFamily,
    cmdlineOf = readCmdline,
    ppidOf = readPpid,
    selfPid = process.pid,
    ours = selfChain(ppidOf, selfPid),
  } = deps;
  const pids = [];
  const skipped = [];
  for (const pid of find(needles)) {
    if (pid <= 1) { skipped.push({ pid, why: 'pid <= 1' }); continue; }
    if (ours.has(pid)) { skipped.push({ pid, why: 'this rig process or an ancestor of it' }); continue; }
    const prot = protectedAncestor(pid, { cmdlineOf, ppidOf, ours });
    if (prot) {
      skipped.push({
        pid,
        why: prot.pid === pid
          ? `protected: cmdline mentions ${prot.marker}`
          : `protected: started by pid ${prot.pid}, whose cmdline mentions ${prot.marker}`,
      });
      continue;
    }
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
export function removeSingletonLocks(userData, needles, remove = (p) => rmSync(p, { force: true })) {
  if (!userData) return [];
  if (!isAbsolute(userData)) throw new Error(`perf-lab launch: userData ${JSON.stringify(userData)} is not an absolute path.`);
  // Containment check: the profile we clean must live inside a rig-owned needle
  // (fixture.home is always one), so this can never delete the live app's locks.
  //
  // The test is `=== n` or starts-with `n + '/'`, and that trailing slash is the whole
  // point: a bare startsWith(n) would accept "<fixture>homeEVIL" as living inside
  // "<fixture>home" — a sibling directory whose name merely begins the same way — and
  // the rig would delete lock files out of a folder it does not own. Requiring the
  // separator means only a real descendant qualifies.
  if (!needles.some((n) => userData === n || userData.startsWith(`${n}/`))) {
    throw new Error(`perf-lab launch: refusing to touch profile locks in ${userData} — it is not inside a rig path (${needles.join(', ')}).`);
  }
  // `remove` is injectable ONLY so the tests can prove the guard without a real rmSync;
  // every production caller takes the default.
  const removed = [];
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const p = join(userData, f);
    remove(p);
    removed.push(p);
  }
  return removed;
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
        const detail = left.map((p) => `${p} (${readCmdline(p).slice(0, 120) || 'cmdline unreadable'})`).join('; ');
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
  const c = readCmdline(groupPid);
  if (!c || !needles.some((n) => c.includes(n))) return;  // dead or recycled → never signal
  // Same fence as killableFamily: protected in its own right, or by descent. A group
  // kill hits every process in the group, so it gets the stricter of the two checks.
  if (protectedAncestor(groupPid, { ours: selfChain() })) return;
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
  // DBUS_*: see the XDG_RUNTIME_DIR / DBUS_SESSION_BUS_ADDRESS note below — the
  // session bus was the one live wire still running from this sandboxed app to
  // Destin's real desktop. Both DBUS_STARTER_* variables are the same address under
  // another name (systemd sets them for bus-activated services), so they go too.
  for (const k of [
    'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH', 'CLAUDE_EFFORT',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
    'WAYLAND_DISPLAY', 'YOUCODED_PROFILE',
    'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE',
    'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS',
  ]) delete env[k];
  // A runtime dir INSIDE the fixture, created 0700 (the spec requires the directory
  // be private to its owner or software refuses to use it).
  const runtimeDir = join(fixture.home, '.runtime');
  mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

  Object.assign(env, {
    HOME: fixture.home,
    DISPLAY: display,
    // ── CUTTING THE LAST WIRE TO THE REAL DESKTOP ────────────────────────────
    // Deleting XDG_CONFIG/DATA/CACHE and WAYLAND_DISPLAY isolates the app's FILES
    // and its WINDOW, but it left one live channel open: D-Bus, the bus every Linux
    // desktop app uses to talk to the desktop itself. Over it the rig's app could
    // raise real notifications, drive real file-picker portals, and register itself
    // as the real session's handler for things — a sandboxed measurement run poking
    // at Destin's working desktop, and any of that costs CPU that lands in the
    // numbers we are here to measure.
    //
    // Unsetting DBUS_SESSION_BUS_ADDRESS alone does NOT close it. libdbus falls back,
    // in order, to $XDG_RUNTIME_DIR/bus — the REAL session bus, still findable — and
    // then to X11 autolaunch, which would fork a stray dbus-daemon under Xvfb that
    // nothing in this rig knows how to clean up. So we do all three at once:
    //   • XDG_RUNTIME_DIR points inside the fixture, so the "$XDG_RUNTIME_DIR/bus"
    //     fallback finds nothing (and any other runtime file the app drops lands in
    //     the throwaway fixture instead of /run/user/<uid>).
    //   • DBUS_SESSION_BUS_ADDRESS names a socket inside the fixture that is never
    //     created, so the connect fails instantly with ENOENT — that failure is what
    //     suppresses the autolaunch fallback and its orphan daemon.
    // Chromium tolerates having no session bus (this is exactly the situation in every
    // headless container it runs in): it logs "Failed to connect to the bus" and boots
    // normally, with notifications and portals degraded — neither of which the rig
    // measures. XDG_RUNTIME_DIR is REDIRECTED rather than deleted for the same reason:
    // absence is tolerated but is a slightly odder shape than a real, empty directory,
    // and a run costs an hour, so the rig takes the shape closest to a normal desktop.
    XDG_RUNTIME_DIR: runtimeDir,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(runtimeDir, 'no-session-bus')}`,
    // WHY these two, plus the --ozone-platform=x11 argv flag below: deleting
    // WAYLAND_DISPLAY is NOT enough to keep Electron off the real desktop.
    // Chromium's Ozone auto-detection sees XDG_SESSION_TYPE=wayland and connects
    // to the DEFAULT socket name ($XDG_RUNTIME_DIR/wayland-0) on its own, so it
    // silently ignored DISPLAY=:99 and opened on Destin's 2560x1440 screen —
    // measured: screen.width 2560 while Xvfb :99 is 1600x1000. That both
    // invalidates every number (real GPU compositing, his machine's activity in
    // the sample) and pops a window onto his desktop on every one of the 5-7
    // boots a run performs. Forcing x11 pins the app to the virtual display.
    XDG_SESSION_TYPE: 'x11',
    ELECTRON_OZONE_PLATFORM_HINT: 'x11',
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
  // --ozone-platform=x11 is the decisive half of the Wayland fix above: the env
  // vars express the preference, this flag removes the choice.
  const proc = spawn(binary, [`--remote-debugging-port=${cdpPort}`, '--no-sandbox', '--ozone-platform=x11'], {
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

  // ── TEARDOWN HANDLERS ARE ARMED HERE, right after spawn ───────────────────
  // They used to be registered ~90 seconds later, only once the app's window had
  // appeared and CDP was fully attached. That left two windows in which the rig could
  // die with the app still alive: a Ctrl-C during the up-to-90-second wait below, and
  // any failure in the CDP handshake. `detached: true` means the app does NOT die with
  // the rig, so in either window a headless Electron was left running under Xvfb with
  // nobody left who knew how to kill it — holding the CDP port and the profile lock, so
  // the NEXT run either refused to start or silently measured the leftover. Arming the
  // handlers before anything can go wrong closes both windows.
  let cleanedUp = false;
  const hardCleanup = () => {
    // Idempotent by design. kill() sets `cleanedUp` before doing its own orderly
    // teardown, so the 'exit' handler that fires afterwards is a no-op rather than a
    // second round of SIGKILLs aimed at pids that may since have been reused.
    if (cleanedUp) return;
    cleanedUp = true;
    // Synchronous by necessity ('exit' allows no async work), and it goes through the
    // same killable/protected filter as everything else — an emergency is not a licence
    // to signal something we do not own.
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
  let handlersAttached = true;
  const detachHandlers = () => {
    // Also idempotent: a caller that both kill()s and exits must not double-remove,
    // and a caller that retries launchApp must not accumulate listeners (a full run
    // boots the app 5-7 times, which is enough to trip Node's max-listeners warning).
    if (!handlersAttached) return;
    handlersAttached = false;
    process.off('exit', onExit);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };

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

  // Everything that can fail while the app is alive lives inside this ONE try, so
  // there is exactly one exit route and it always sweeps. Previously `connect` and the
  // two `enable` calls sat outside it: a CDP socket that dropped between "window
  // appeared" and "Page.enable returned" threw straight out of launchApp and left the
  // app running, which is precisely the orphan the sweep exists to prevent.
  let target;
  let cdp;
  try {
    // Promise.race attaches a handler to `died`, so a later exit cannot surface as an
    // unhandled rejection.
    target = await Promise.race([waitForMainTarget(cdpPort, { timeoutMs: 90000 }), died]);

    // Sanity: the window we are about to drive must belong to a process that matches
    // the rig paths. If it does not, we found someone else's browser.
    if (killableFamily(familyNeedles).pids.length === 0) {
      throw new Error(`perf-lab launch: a CDP target appeared on :${cdpPort} but no process matches the rig paths (${familyNeedles.join(', ')}). Refusing to measure a process this rig does not own.`);
    }

    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
  } catch (e) {
    try { cdp?.close(); } catch {}
    await sweep(familyNeedles, fixture.userData, { groupPid: proc.pid }).catch(() => {});
    // Disarm only AFTER the sweep: while it runs, a Ctrl-C must still reach
    // hardCleanup. Disarming at all matters because the caller retries — see the
    // listener-accumulation note on detachHandlers.
    detachHandlers();
    throw e;
  }

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
