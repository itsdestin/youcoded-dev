import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanupScript, guardScript, newRunId, parseArgs, parseDoctor, parseGuard, planRun, runPlan, sshArgs, validateCommit } from '../remote.mjs';

const tool = fileURLToPath(new URL('../remote.mjs', import.meta.url));
const ARGS = ['run', '--build', 'abcdef1234', '--against', '0123456789ab'];
const opts = (extra = []) => parseArgs([...ARGS, ...extra]);
const plan = (extra = []) => planRun(opts(extra), 'run-20261128T000000-abcd', { themeDir: '/themes' });
const allScripts = (steps) => steps.map((s) => s.script({ display: ':0', xauthority: '/run/user/1000/xauth_x' })).join('\n');

test('commit ids must be hex ids: names, shell text and short ids are refused', () => {
  assert.equal(validateCommit('abcdef1', '--build'), 'abcdef1');
  for (const bad of ['main', 'abc', 'abcdef1; rm -rf /', '$(id)', 'ABCDEF1', '', undefined]) assert.throws(() => validateCommit(bad, '--build'), /commit id/);
  assert.throws(() => parseArgs(['run', '--build', 'main', '--against', '0123456789ab']), /commit id/);
  assert.throws(() => parseArgs(['run', '--build', 'abcdef1']), /--against/);
  assert.throws(() => parseArgs(['run', ...ARGS.slice(1), '--scenarios', 'type,bogus']), /--scenarios/);
  assert.throws(() => parseArgs(['run', ...ARGS.slice(1), '--host', 'x; reboot']), /--host/);
});

test('--dry-run prints every remote command and executes nothing (no ssh, no tar)', () => {
  const r = spawnSync(process.execPath, [tool, ...ARGS, '--dry-run'], { encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  // With PATH emptied, a real ssh/tar spawn would fail; a dry run must still succeed.
  assert.equal(r.status, 0, r.stderr);
  for (const id of ['guard', 'sweep', 'mkdir', 'upload', 'sources', 'build-baseline', 'build-candidate', 'start', 'cleanup']) assert.match(r.stdout, new RegExp(`### ${id}:`));
  assert.match(r.stdout, /DRY RUN: nothing is executed/);
  assert.match(r.stdout, /systemd-inhibit --what=sleep:idle/);
});

test('the safety check is the first step, and nothing is created before it', () => {
  const steps = plan();
  assert.equal(steps[0].id, 'guard');
  assert.ok(steps[0].guard);
  const firstWrite = steps.findIndex((s) => s.id === 'mkdir');
  assert.ok(firstWrite > 0);
  assert.match(guardScript('run-x'), /FOREIGN_YOUCODED/);
  assert.match(guardScript('run-x'), /readlink "\/proc\/\$p\/exe"/);
});

test('steps keep the planned order and alternate-run settings reach the lane run', () => {
  const ids = plan().map((s) => s.id);
  assert.deepEqual(ids.slice(0, 8), ['guard', 'sweep', 'mkdir', 'upload', 'sources', 'build-baseline', 'build-candidate', 'start']);
  const text = allScripts(plan(['--scenarios', 'type,idle', '--repeats', '2', '--idle-minutes', '3']));
  assert.match(text, /--scenarios 'type,idle' --repeats 2 --idle-minutes 3/);
  assert.match(text, /--baseline-label '012345678' --candidate-label 'abcdef123'/);
  assert.match(text, /git -C "\$R\/builds\/baseline" checkout --quiet --detach 0123456789ab/);
  assert.match(text, /git -C "\$R\/builds\/candidate" checkout --quiet --detach abcdef1234/);
});

test('no remote command touches the desktop owner\'s own YouCoded or Claude folders', () => {
  const text = allScripts(plan());
  for (const forbidden of ['.youcoded', '.claude', '.config/youcoded', '/opt/YouCoded', 'pkill', 'killall', 'kill -']) assert.ok(!text.includes(forbidden), `remote scripts must not contain ${forbidden}`);
  // only deletions: inside ~/perf-lab-runs
  for (const m of text.matchAll(/rm -rf[^\n]*/g)) assert.match(m[0], /\{\}|"\$R"/);
  assert.match(cleanupScript('run-20261128T000000-abcd'), /case "\$R" in "\$HOME"\/perf-lab-runs\/run-\*\)/);
});

test('guard output: the installed app running, another run, no screen and an unfinished check each refuse', () => {
  assert.equal(parseGuard('DISPLAY=:0\nXAUTHORITY=/run/user/1000/xauth_a\nGUARD_DONE\n').ok, true);
  assert.deepEqual(parseGuard('DISPLAY=:0\nXAUTHORITY=/x\nGUARD_DONE').display, ':0');
  assert.match(parseGuard('FOREIGN_YOUCODED 812 /opt/YouCoded/youcoded\nDISPLAY=:0\nGUARD_DONE').reasons[0], /own YouCoded is running/);
  assert.match(parseGuard('OTHER_RUN 55\nDISPLAY=:0\nGUARD_DONE').reasons[0], /another lab run/);
  assert.match(parseGuard('NO_DISPLAY\nGUARD_DONE').reasons[0], /graphical session/);
  assert.match(parseGuard('DISPLAY=:0').reasons[0], /did not finish/);
});

// A fake desktop: records every script it is asked to run.
const fake = (answers = {}) => {
  const ran = [];
  const exec = async (step, script) => { ran.push(step.id); const a = answers[step.id]; return a ?? { code: 0, stdout: step.guard ? 'DISPLAY=:0\nXAUTHORITY=/x\nGUARD_DONE\n' : (step.id === 'poll' ? 'EXIT 0\n' : ''), stderr: '' }; };
  return { ran, exec };
};
const run = (steps, f, extra = {}) => runPlan(steps, { exec: f.exec, sleep: async () => {}, ...extra });

test('refusal: when the installed app is running nothing after the safety check runs, and nothing is created or deleted', async () => {
  const f = fake({ guard: { code: 0, stdout: 'FOREIGN_YOUCODED 812 /opt/YouCoded/youcoded\nDISPLAY=:0\nGUARD_DONE\n', stderr: '' } });
  const res = await run(plan(), f);
  assert.equal(res.ok, false);
  assert.match(res.refused.reasons[0], /own YouCoded is running/);
  assert.deepEqual(f.ran, ['guard']); // no sweep, no mkdir, no copy back, no cleanup
});

test('refusal: an unreachable desktop is reported as unreachable, not as a failed build', async () => {
  const f = fake({ guard: { code: 255, stdout: '', stderr: 'ssh: connect to host: timed out' } });
  const res = await run(plan(), f);
  assert.match(res.refused.reasons[0], /not reachable/);
  assert.deepEqual(f.ran, ['guard']);
});

test('a full successful run: results are copied back, the folder is deleted last, the display from the guard reaches the start script', async () => {
  const f = fake();
  const saved = [];
  let startScript = '';
  const exec = async (step, script) => { if (step.id === 'start') startScript = script; return f.exec(step, script); };
  const res = await runPlan(plan(), { exec, sleep: async () => {}, save: (n) => saved.push(n) });
  assert.equal(res.ok, true);
  assert.ok(f.ran.includes('poll'));
  assert.equal(f.ran.at(-1), 'cleanup');
  assert.ok(saved.includes('lane-results.json') && saved.includes('lane-report.txt'));
  assert.match(startScript, /DISPLAY=':0'/);
  assert.match(startScript, /XAUTHORITY='\/x'/);
});

test('a failed build still copies back what exists and deletes the folder; --keep-remote keeps it', async () => {
  const f = fake({ 'build-baseline': { code: 1, stdout: '', stderr: 'npm ERR!' } });
  const res = await run(plan(), f);
  assert.equal(res.ok, false);
  assert.equal(res.failed.step, 'build-baseline');
  assert.ok(!f.ran.includes('build-candidate') && !f.ran.includes('start'));
  assert.equal(f.ran.at(-1), 'cleanup');
  const g = fake({ 'build-baseline': { code: 1, stdout: '', stderr: 'x' } });
  await run(plan(['--keep-remote']), g);
  assert.ok(!g.ran.includes('cleanup'));
});

test('a run that stops with an error code is a failure; one that finishes with unusable legs (3) is not', async () => {
  const bad = fake({ poll: { code: 0, stdout: 'EXIT 2\n', stderr: '' } });
  assert.equal((await run(plan(), bad)).ok, false);
  const partial = fake({ poll: { code: 0, stdout: 'EXIT 3\n', stderr: '' } });
  assert.equal((await run(plan(), partial)).ok, true);
});

test('doctor output is read into plain pass/fail lines', () => {
  const good = 'HOST=DestinsLinuxPC\nNODE=v26.1.0\nWEBSOCKET=yes\nGIT=git version 2.50\nNPM=11\nINHIBIT=yes\nGPU=NVIDIA GeForce RTX 4070 SUPER, 580\nFREE_GB=300\nDISPLAY=:0\nWAYLAND_DISPLAY=wayland-0\nXAUTHORITY_SET=yes\nAPP_CLONE=yes\nDOCTOR_DONE\n';
  assert.ok(parseDoctor(good).every((c) => c.ok));
  const bad = parseDoctor(good.replace('v26.1.0', 'v18.0.0').replace('FREE_GB=300', 'FREE_GB=3').replace('DISPLAY=:0', 'DISPLAY=') + 'FOREIGN_YOUCODED 9 /opt/YouCoded/youcoded\n');
  const failed = bad.filter((c) => !c.ok).map((c) => c.name);
  assert.equal(failed.length, 4);
  assert.deepEqual(parseDoctor('').filter((c) => c.name === 'Reachable over SSH').map((c) => c.ok), [false]);
});

test('ssh is never prompted, uses the given key and runs bash from stdin; run ids are unique-shaped', () => {
  const a = sshArgs({ sshKey: '/k', host: 'u@h' });
  assert.ok(a.includes('BatchMode=yes') && a.includes('/k') && a.slice(-2).join(' ') === 'bash -s');
  assert.match(newRunId(new Date('2026-11-28T10:11:12Z'), () => 0.5), /^run-20261128T101112-[0-9a-f]{4}$/);
});
