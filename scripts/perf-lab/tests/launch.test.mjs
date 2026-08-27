// scripts/perf-lab/tests/launch.test.mjs
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// launch.mjs is the module in this rig with the largest blast radius. It does two
// things no other file here does: it SIGKILLs whole families of processes that it
// believes it owns, and it deletes lock files out of a Chromium profile directory.
// It decides what it owns by taking a rig-owned absolute path and testing it as a
// plain SUBSTRING of every process's command line on the machine.
//
// The machine it runs on is also the machine where Destin's REAL YouCoded app runs,
// installed at /opt/YouCoded against HOME=/home/destin. That app is his working
// environment. If a needle ever widened — to "youcoded", to "/home/destin", to a
// relative path, to nothing at all — the rig would match his live app and kill it
// mid-session, and the numbers it then reported would be from a corpse.
//
// Every safety property in launch.mjs was, until this file, guarded only by a code
// review and by comments asking future readers to be careful. These tests are the
// guard that stands between that module and his live application. They exist so that
// a plausible-looking edit — loosening a needle check, dropping a filter, "simplifying"
// a containment test — turns red instead of turning into a phone call.
//
// ── HOW THEY STAY SAFE ───────────────────────────────────────────────────────
// Nothing here spawns a process, signals a process, reads /proc, or deletes a file.
// The functions under test take their process-table readers and their file remover as
// injectable parameters (production callers pass none and get the real ones), so every
// test drives a small fake process table declared inline. A test that had to kill
// something to prove killing is safe would be its own worst bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertSafeNeedles, killableFamily, protectedAncestor, removeSingletonLocks, selfChain, sweep,
  launchApp,
} from '../launch.mjs';

// launch.mjs captures the real home at import time and derives its protected markers
// from it, so the fixtures below derive theirs the same way rather than hardcoding
// /home/destin — the tests then assert the same relationship on any machine.
const REAL_HOME = resolve(process.env.HOME || homedir());
const RIG = join(REAL_HOME, 'youcoded-dev', 'scratch', 'perf-lab');
const APP_DIR = join(RIG, 'build', 'linux-unpacked');       // the unpacked app the rig built
const FIXTURE_HOME = join(RIG, 'home');                     // the throwaway HOME it runs against
const NEEDLES = [APP_DIR, FIXTURE_HOME];                    // exactly what launchApp uses

// Command lines of the things that must never be touched.
const TOOL_SHELL = `/bin/bash --init-file ${join(REAL_HOME, '.claude', 'shell-snapshots', 'snapshot-fish-4711.fish')} -c -- true`;
const LIVE_APP = `/opt/YouCoded/youcoded --no-sandbox --user-data-dir=${join(REAL_HOME, '.config', 'youcoded')}`;

/**
 * A fake /proc. `procs` maps pid → { cmd, ppid }. Returns the three readers
 * killableFamily accepts, plus a counter so a test can prove a walk stayed bounded.
 */
function fakeProcTable(procs) {
  const calls = { ppid: 0, cmdline: 0 };
  return {
    calls,
    find: (needles) => Object.keys(procs).map(Number)
      .filter((pid) => needles.some((n) => procs[pid].cmd.includes(n))),
    cmdlineOf: (pid) => { calls.cmdline++; return procs[pid]?.cmd ?? ''; },
    ppidOf: (pid) => { calls.ppid++; return procs[pid]?.ppid ?? 0; },
  };
}

// ── assertSafeNeedles: what the rig is allowed to hunt by ────────────────────

test('a search with no needle at all is refused, because it would match every process on the machine', () => {
  assert.throws(() => assertSafeNeedles([]), /empty needle list/);
  assert.throws(() => assertSafeNeedles(undefined), /empty needle list/);
});

test('the root path is refused as a needle', () => {
  // "/" is a substring of every absolute path in every command line in existence.
  assert.throws(() => assertSafeNeedles(['/']), /perf-lab launch/);
});

test("the user's own home directory is refused as a needle", () => {
  // The live app runs with HOME=/home/destin, so this needle selects it. On a
  // two-segment home the depth guard is what fires; the home-specific guard below is
  // the backstop for a deeper home, where the depth guard would wave it through.
  assert.throws(() => assertSafeNeedles([REAL_HOME]), /perf-lab launch/);
  assert.throws(() => assertSafeNeedles(['/home']), /perf-lab launch/);
});

test('a deep home directory, and any ancestor of it, is refused as a needle', async () => {
  // Loads a SECOND copy of the module against a pretend home several levels down, so
  // the home guard is reached instead of being short-circuited by the depth guard.
  // The '?deep-home' query is what makes the ESM loader hand back a fresh instance;
  // launch.mjs snapshots the home at import time, which is the thing being exercised.
  const realHome = process.env.HOME;
  process.env.HOME = '/home/users/team/deeptest';
  try {
    const deep = await import('../launch.mjs?deep-home');
    assert.throws(() => deep.assertSafeNeedles(['/home/users/team/deeptest']), /is the real home/);
    assert.throws(() => deep.assertSafeNeedles(['/home/users/team']), /or an ancestor of it/);
    // …and it still accepts a sibling path that merely starts the same way.
    assert.doesNotThrow(() => deep.assertSafeNeedles(['/home/users/team/deeptest-rig/build']));
  } finally {
    process.env.HOME = realHome;
  }
});

test('a relative path is refused as a needle', () => {
  assert.throws(() => assertSafeNeedles(['scratch/perf-lab/home']), /not an absolute path/);
  assert.throws(() => assertSafeNeedles(['./scratch/perf-lab/home']), /not an absolute path/);
});

test('an empty string is refused as a needle', () => {
  // '' passes String.includes() against literally every command line.
  assert.throws(() => assertSafeNeedles(['']), /not a non-empty string/);
  assert.throws(() => assertSafeNeedles([null]), /not a non-empty string/);
});

test('a needle too short or too shallow to be specific is refused', () => {
  assert.throws(() => assertSafeNeedles(['/usr/bin']), /fewer than 3 path segments/);
  assert.throws(() => assertSafeNeedles(['/a/b/c']), /shorter than 12 characters/);
});

test('a non-canonical needle is refused, since the match is a literal substring test', () => {
  // '/x/../y' never appears verbatim in a kernel-normalised command line, so a needle
  // written that way silently matches nothing and the sweep reports "all clear".
  assert.throws(() => assertSafeNeedles([`${RIG}/build/../build/linux-unpacked`]), /not canonical/);
});

test('a needle overlapping the live app or Claude Code state is refused in either direction', () => {
  assert.throws(() => assertSafeNeedles([join(REAL_HOME, '.config', 'youcoded')]), /overlaps protected path/);
  assert.throws(() => assertSafeNeedles([join(REAL_HOME, '.claude', 'shell-snapshots')]), /overlaps protected path/);
  assert.throws(() => assertSafeNeedles([join(REAL_HOME, '.youcoded', 'sessions')]), /overlaps protected path/);
});

test("the rig's own build directory and fixture home are accepted", () => {
  // The guard has to say yes to something, or the rig cannot clean up after itself.
  assert.doesNotThrow(() => assertSafeNeedles(NEEDLES));
});

test('sweep applies the needle guard before it looks at any process', async () => {
  // The guard is worthless if the entry point forgets to call it, so this asserts the
  // WIRING rather than the function: with the guard in place, sweep rejects before it
  // has read a single line of /proc.
  //
  // It deliberately uses the empty-needle case and not, say, ['/']. Every test here has
  // to be safe in the mutated world it is designed to detect — and in that world this
  // call really would run the sweep. An empty needle list matches no process even with
  // the guard gone; a '/' needle would match every process on the machine. Running this
  // suite must never be able to become the incident it exists to prevent.
  await assert.rejects(sweep([], undefined), /empty needle list/);
});

// ── killableFamily: who may be signalled ─────────────────────────────────────

test("Destin's live application is never selectable, even if something makes it mention a rig path", () => {
  const t = fakeProcTable({
    300: { cmd: LIVE_APP, ppid: 1 },
    // A live renderer that happens to name a rig path — a file he opened from the
    // scratch dir, say. It matches the needle; the protected marker must still win.
    301: { cmd: `${LIVE_APP} --type=renderer ${join(FIXTURE_HOME, 'notes.md')}`, ppid: 300 },
    900: { cmd: 'node /home/destin/youcoded-dev/scripts/perf-lab/run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, []);
  // pid 300 does not even match a needle; 301 matches and is explicitly spared.
  assert.ok(r.skipped.some((s) => s.pid === 301 && /protected/.test(s.why)), JSON.stringify(r.skipped));
});

test('a Claude Code tool shell is spared even when the command it is running names a rig path', () => {
  const t = fakeProcTable({
    510: { cmd: `${TOOL_SHELL} ls ${FIXTURE_HOME}`, ppid: 400 },
    400: { cmd: 'claude', ppid: 1 },
    900: { cmd: 'node run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, []);
  assert.match(r.skipped[0].why, /cmdline mentions/);
});

test('a bystander started by a protected shell is spared because of who started it', () => {
  // The gap this closes: `grep` naming the fixture path matches the needle, carries no
  // protected marker of its own, and is nobody's ancestor. Before the ancestor walk it
  // was SIGTERMed then SIGKILLed — and the same shape is a cp, an rsync or an editor
  // writing a file, which would lose data.
  const t = fakeProcTable({
    800: { cmd: `grep -r todo ${FIXTURE_HOME}`, ppid: 510 },
    510: { cmd: TOOL_SHELL, ppid: 400 },
    400: { cmd: 'claude', ppid: 1 },
    900: { cmd: 'node run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, []);
  assert.match(r.skipped[0].why, /started by pid 510/);
});

test('the same bystander command with an unprotected ancestry stays killable', () => {
  // The mirror of the test above: the ancestor rule must not become "spare everything".
  const t = fakeProcTable({
    810: { cmd: `grep -r todo ${FIXTURE_HOME}`, ppid: 820 },
    820: { cmd: '/usr/bin/systemd --user', ppid: 1 },
    900: { cmd: 'node run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, [810]);
});

test("the rig's own app stays killable even though the rig itself was started by a protected shell", () => {
  // Without the stop-at-ourselves rule the ancestor walk would climb from the app,
  // through the rig, into the Claude Code shell that launched the rig, declare the app
  // protected, and leave teardown unable to kill the very process it spawned.
  const t = fakeProcTable({
    700: { cmd: `${APP_DIR}/youcoded --remote-debugging-port=9555`, ppid: 600 },
    600: { cmd: 'node /home/destin/youcoded-dev/scripts/perf-lab/run.mjs', ppid: 510 },
    510: { cmd: TOOL_SHELL, ppid: 400 },
    400: { cmd: 'claude', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 600 });
  assert.deepEqual(r.pids, [700]);
});

test('pid 1 is never selectable', () => {
  // Signalling init takes the machine down. A match here means /proc lied or a needle
  // is absurdly wide; either way the answer is to refuse.
  const t = fakeProcTable({
    1: { cmd: `/sbin/init ${FIXTURE_HOME}`, ppid: 0 },
    900: { cmd: 'node run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, []);
  assert.equal(r.skipped[0].why, 'pid <= 1');
});

test('the rig never signals itself or the shell that launched it', () => {
  // The rig's own command line usually contains the fixture path (it is an argument),
  // so without this filter the first sweep would kill the sweeper.
  const t = fakeProcTable({
    600: { cmd: `node run.mjs --home ${FIXTURE_HOME}`, ppid: 510 },
    510: { cmd: `/bin/bash -c "node run.mjs --home ${FIXTURE_HOME}"`, ppid: 400 },
    400: { cmd: `wrapper ${FIXTURE_HOME}`, ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 600 });
  assert.deepEqual(r.pids, []);
  assert.equal(r.skipped.length, 3);
  assert.ok(r.skipped.every((s) => s.why === 'this rig process or an ancestor of it'), JSON.stringify(r.skipped));
});

test('selfChain walks parents upward and stops at init', () => {
  const t = fakeProcTable({ 600: { ppid: 510, cmd: '' }, 510: { ppid: 400, cmd: '' }, 400: { ppid: 1, cmd: '' } });
  assert.deepEqual([...selfChain(t.ppidOf, 600)].sort((a, b) => a - b), [400, 510, 600]);
});

test('a looping ancestor chain cannot hang the sweep', () => {
  // /proc should never contain a cycle, but a truncated read or a pid recycled
  // mid-walk can produce one. A rig that spins here holds a half-killed app forever.
  const t = fakeProcTable({
    700: { cmd: `${APP_DIR}/youcoded`, ppid: 710 },
    710: { cmd: 'shim', ppid: 700 },
    900: { cmd: 'node run.mjs', ppid: 1 },
  });
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.deepEqual(r.pids, [700]);          // no marker anywhere in the loop
  // 3 reads: 700→710, 710→700, then "already seen". A bound loose enough to pass with
  // the depth cap alone would not notice the cycle guard going missing.
  assert.ok(t.calls.ppid <= 8, `the cycle guard should stop the walk at once, made ${t.calls.ppid} parent reads`);
});

test('a pathological ancestor chain is abandoned rather than followed forever', () => {
  // 500 links deep. The property under test is that the walk STOPS; the price of the
  // depth cap is that protection further up than the cap is not seen, which is the
  // deliberate trade — a bounded wrong answer beats an unbounded hang.
  const procs = { 900: { cmd: 'node run.mjs', ppid: 1 } };
  for (let i = 0; i < 500; i++) procs[1000 + i] = { cmd: i === 0 ? `cat ${FIXTURE_HOME}/x` : 'link', ppid: 1001 + i };
  procs[1500] = { cmd: TOOL_SHELL, ppid: 1 };
  const t = fakeProcTable(procs);
  const r = killableFamily(NEEDLES, { ...t, selfPid: 900 });
  assert.equal(r.pids.length + r.skipped.length, 1);
  assert.ok(t.calls.ppid <= 70, `walk should stop at the cap, made ${t.calls.ppid} parent reads`);
});

test('protectedAncestor reports which process earned the protection', () => {
  const t = fakeProcTable({ 800: { cmd: 'grep x', ppid: 510 }, 510: { cmd: TOOL_SHELL, ppid: 1 } });
  const found = protectedAncestor(800, t);
  assert.equal(found.pid, 510);
  assert.equal(found.marker, join(REAL_HOME, '.claude'));
  assert.equal(protectedAncestor(510, { ...t, ours: new Set([510]) }), null);
});

// ── removeSingletonLocks: whose profile may be cleaned ───────────────────────

test('a profile outside every rig path is refused', () => {
  // Deleting the live app's SingletonLock while it runs invites a second Electron to
  // share its userData and corrupt the leveldb behind his conversations.
  assert.throws(
    () => removeSingletonLocks(join(REAL_HOME, '.config', 'youcoded'), NEEDLES, () => { throw new Error('must not delete'); }),
    /refusing to touch profile locks/,
  );
});

test('a directory whose name merely begins with a rig path is refused', () => {
  // The prefix impostor: "<fixture>homeEVIL" is a SIBLING of "<fixture>home", not a
  // child of it. A containment check written as a bare startsWith() accepts it and the
  // rig deletes files out of a folder it does not own.
  assert.throws(
    () => removeSingletonLocks(`${FIXTURE_HOME}EVIL`, NEEDLES, () => { throw new Error('must not delete'); }),
    /refusing to touch profile locks/,
  );
  assert.throws(
    () => removeSingletonLocks(`${APP_DIR}-backup/profile`, NEEDLES, () => { throw new Error('must not delete'); }),
    /refusing to touch profile locks/,
  );
});

test('a relative profile path is refused', () => {
  assert.throws(
    () => removeSingletonLocks('scratch/perf-lab/home/.config/youcoded', NEEDLES, () => { throw new Error('must not delete'); }),
    /not an absolute path/,
  );
});

test('exactly the three Chromium lock files inside the fixture profile are removed', () => {
  const userData = join(FIXTURE_HOME, '.config', 'youcoded');
  const deleted = [];
  const removed = removeSingletonLocks(userData, NEEDLES, (p) => deleted.push(p));
  assert.deepEqual(deleted, [
    join(userData, 'SingletonLock'), join(userData, 'SingletonCookie'), join(userData, 'SingletonSocket'),
  ]);
  assert.deepEqual(removed, deleted);
});

test('no profile given means nothing is deleted', () => {
  assert.deepEqual(removeSingletonLocks(undefined, NEEDLES, () => { throw new Error('must not delete'); }), []);
});

// ── launchApp's own front-door guards (they run before anything is spawned) ──

test('launchApp refuses a fixture HOME that is the real home or contains it', async () => {
  // A fixture HOME of /home/destin would put every rig write into his real dotfiles and
  // make the needle match his live app.
  const fixture = { home: REAL_HOME, userData: join(REAL_HOME, '.config', 'youcoded'), bin: '/bin', perfLog: '/dev/null' };
  await assert.rejects(launchApp({ binary: 'x', appDir: APP_DIR, fixture }), /is the real home or an ancestor of it/);
  await assert.rejects(launchApp({ binary: 'x', appDir: APP_DIR, fixture: { ...fixture, home: '/home' } }), /is the real home or an ancestor of it/);
});

test('launchApp refuses an unsafe app directory before it spawns anything', async () => {
  const fixture = { home: FIXTURE_HOME, userData: join(FIXTURE_HOME, '.config'), bin: '/bin', perfLog: '/dev/null' };
  await assert.rejects(launchApp({ binary: 'x', appDir: '/', fixture }), /perf-lab launch/);
});
