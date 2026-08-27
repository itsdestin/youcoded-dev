#!/usr/bin/env node
// scripts/perf-lab/eyeball.mjs — the calibration check a headless rig cannot do
// for itself: boot the SAME build the rig measured, with the SAME fixture
// conversations, on Destin's REAL screen, so he can open the huge conversation
// and say whether the rig's number matches what he feels.
//
// WHY THIS EXISTS. Five wrong conclusions in this project came from the rig's
// world differing from Destin's in a way that made the defect impossible, and
// every one returned a clean number. The only defence against a sixth is a
// ground-truth comparison, and the rig runs under Xvfb with no GPU and no
// compositor — so "does 11 s in the rig feel like 11 s on the desktop" is a
// question only a human at the real screen can answer. Thirty seconds of his
// time calibrates every number the rig has produced.
//
// What it is NOT: it never touches Destin's live app (/opt/YouCoded). It runs
// the worktree's built binary with HOME pointed at a throwaway fixture directory
// and the remote server shifted off the live app's ports (YOUCODED_PORT_OFFSET),
// exactly as launch.mjs does — minus the virtual display.
//
//   node scripts/perf-lab/eyeball.mjs            # build fixture, launch, print instructions
//   node scripts/perf-lab/eyeball.mjs --dry-run  # print the plan, launch nothing
//
// Close the window when done; nothing is left running.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture, SIZES } from './fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
const dryRun = process.argv.includes('--dry-run');
const checkout = join(WORKSPACE, 'worktrees', 'perf-lab');
const binary = join(checkout, 'desktop', 'release', 'linux-unpacked', 'youcoded');
// A SEPARATE fixture root from the rig's, so a measurement run can never wipe
// the eyeball home from under an open window (run.mjs rebuilds its own per boot).
const root = join(WORKSPACE, 'scratch', 'perf-lab', 'eyeball');

if (!existsSync(binary)) {
  console.error(`no built app at ${binary} — run the rig once (it builds) or \`cd ${checkout}/desktop && npm run build\``);
  process.exit(2);
}
if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error('no DISPLAY or WAYLAND_DISPLAY in this shell — this must run from a terminal inside the desktop session, not headless');
  process.exit(2);
}

console.error(`fixture root  ${root}`);
console.error(`binary        ${binary}`);
console.error(`display       ${process.env.WAYLAND_DISPLAY ? `wayland ${process.env.WAYLAND_DISPLAY}` : `x11 ${process.env.DISPLAY}`}`);
if (dryRun) { console.error('dry run — launching nothing'); process.exit(0); }

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const fixture = buildFixture(root, { log: (m) => console.error(`  ${m}`) });

// Same isolation as launch.mjs: the fixture's HOME and XDG dirs, the fake
// `claude` on PATH, shifted ports. NOT deleted here: WAYLAND_DISPLAY, DISPLAY,
// XDG_RUNTIME_DIR and the session bus — this window is meant to land on the
// real desktop with a real compositor, which is the whole point.
const env = { ...process.env };
for (const k of ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH', 'CLAUDE_EFFORT', 'YOUCODED_PROFILE', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) delete env[k];
Object.assign(env, fixture.env, {
  YOUCODED_PORT_OFFSET: '100',
  YOUCODED_NATIVE: '1',
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
});

const proc = spawn(binary, ['--no-sandbox'], { env, stdio: 'ignore', detached: false });
proc.on('exit', (code) => { console.error(`\napp closed (exit ${code}) — done.`); process.exit(0); });

const t = fixture.transcripts;
console.error(`
The window titled YouCoded (NOT your normal one) is the rig's build with the
rig's test conversations. Do this, with a clock or just by feel:

  1. Open the session list. Three conversations are pre-built under the
     'alpha' project:
        huge    ${SIZES.huge} turns  (${t.huge.sessionId.slice(0, 8)}…)   — the rig says ~22 s to open, ~11 s to switch into
        medium  ${SIZES.medium} turns  (${t.medium.sessionId.slice(0, 8)}…)   — the rig says ~15 s to open
        small   ${SIZES.small} turns   (${t.small.sessionId.slice(0, 8)}…)   — the rig says under 2 s
  2. Resume 'huge'. Count until the messages are on screen and you can scroll.
  3. Resume 'medium' as a second session, then click back and forth between
     the two a few times. Count the switch into huge.
  4. Tell Claude the two numbers and whether the app froze (no hover, no
     click) while it loaded.

Close the window when done. Ctrl+C here also closes it.
`);
process.on('SIGINT', () => { try { proc.kill('SIGTERM'); } catch { /* already gone */ } });
