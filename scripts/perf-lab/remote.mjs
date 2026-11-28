#!/usr/bin/env node
// scripts/perf-lab/remote.mjs — start the realistic performance test on the DESKTOP PC from the laptop.
//
//   node scripts/perf-lab/remote.mjs doctor [--host destin@100.79.40.94]
//   node scripts/perf-lab/remote.mjs run --build <commit> --against <commit> [--scenarios type,menus,switch,idle]
//        [--repeats 3] [--idle-minutes 10] [--host ...] [--ssh-key ~/.ssh/recovery_key] [--keep-remote] [--dry-run]
//
// `--build` is the CANDIDATE (the new code), `--against` the BASELINE (what it is compared with). Commit ids are hex ids
// (7-40 characters): resolve a branch with `git rev-parse` first.
//
// WHAT IT DOES (spec: docs/active/specs/2026-11-28-remote-realistic-perf-lane.md): over SSH it makes one throwaway folder
// ~/perf-lab-runs/<run-id>/ on the desktop, checks out both commits (from the desktop's own app clone, read-only, else GitHub),
// builds each, runs lane-run.mjs (alternating baseline/candidate) with sleep blocked, copies ONLY the result files back to
// scratch/perf-lab/lane-runs/<run-id>/ here, prints the plain-language report and deletes the remote folder. Only the lab's own
// scripts and one public theme travel to the desktop; no personal data leaves this computer.
//
// SAFETY (enforced here, pinned by tests):
// - Never touches the desktop's installed YouCoded: the FIRST remote step refuses to continue if any YouCoded process other
//   than this lab's own is running, or if no graphical session can be found. Nothing here signals any process.
// - Every remote command stays inside ~/perf-lab-runs/ (plus read-only git clone from the desktop's app checkout). No remote
//   command names ~/.youcoded, ~/.claude or ~/.config/youcoded. The only deletions are inside ~/perf-lab-runs/run-*.
// - Runs only when started by hand. --dry-run prints every command and runs none.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareLegs, render } from './lane-report.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const DEFAULT_HOST = 'destin@100.79.40.94';
export const DEFAULT_KEY = join(homedir(), '.ssh', 'recovery_key');
const SCENARIOS = ['type', 'menus', 'switch', 'idle'];
export const REMOTE_BASE = '$HOME/perf-lab-runs';

/** Single-quote a value for a shell. */
export const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function validateCommit(c, flag) {
  if (typeof c !== 'string' || !/^[0-9a-f]{7,40}$/.test(c)) throw new Error(`${flag} must be a commit id (7 to 40 hex characters), got ${JSON.stringify(c)}. Resolve a branch with: git -C youcoded rev-parse <branch>`);
  return c;
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['run', 'doctor'].includes(cmd)) throw new Error('usage: remote.mjs run --build <commit> --against <commit> [...] | remote.mjs doctor');
  const o = { cmd, host: DEFAULT_HOST, sshKey: DEFAULT_KEY, scenarios: [...SCENARIOS], repeats: 3, idleMinutes: 10, build: null, against: null, dryRun: false, keepRemote: false, themeDir: null, maxWaitHours: 6, pollSeconds: 30 };
  const val = { '--build': 'build', '--against': 'against', '--scenarios': 'scenarios', '--repeats': 'repeats', '--idle-minutes': 'idleMinutes', '--host': 'host', '--ssh-key': 'sshKey', '--theme-dir': 'themeDir', '--max-wait-hours': 'maxWaitHours', '--poll-seconds': 'pollSeconds' };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === '--dry-run') { o.dryRun = true; continue; }
    if (k === '--keep-remote') { o.keepRemote = true; continue; }
    if (!val[k] || rest[i + 1] === undefined) throw new Error(`remote.mjs: unknown or incomplete option ${k}`);
    o[val[k]] = rest[++i];
  }
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9._:-]+$/.test(o.host)) throw new Error(`--host must look like user@address, got ${o.host}`);
  if (cmd === 'run') {
    validateCommit(o.build, '--build'); validateCommit(o.against, '--against');
    if (typeof o.scenarios === 'string') o.scenarios = o.scenarios === 'all' ? [...SCENARIOS] : o.scenarios.split(',').filter(Boolean);
    for (const s of o.scenarios) if (!SCENARIOS.includes(s)) throw new Error(`--scenarios takes ${SCENARIOS.join(',')} (got ${s})`);
    if (!o.scenarios.length) throw new Error('--scenarios is empty');
    for (const k of ['repeats', 'idleMinutes', 'maxWaitHours', 'pollSeconds']) { o[k] = Number(o[k]); if (!(o[k] > 0)) throw new Error(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a positive number`); }
  }
  return o;
}

export function newRunId(now = new Date(), rand = Math.random) {
  const p = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `run-${p}-${Math.floor(rand() * 0xffff).toString(16).padStart(4, '0')}`;
}

/** Where the theme the heavy look needs comes from (public registry; copied to the desktop, it is not personal). */
export function findThemeDir(explicit) {
  const candidates = [explicit, join(ROOT, 'wecoded-themes', 'themes'), resolve(ROOT, '..', '..', '..', 'wecoded-themes', 'themes')].filter(Boolean);
  return candidates.find((d) => existsSync(join(d, 'devils-garden', 'manifest.json'))) ?? null;
}

// ── the remote scripts (each runs under `bash -s` on the desktop; the desktop's login shell is fish) ──

const PRE = 'set -euo pipefail';
const runDir = (id) => `${REMOTE_BASE}/${id}`;

/** First step: refuse if the desktop is not safe to take over. Prints machine-readable lines; parseGuard turns them into a verdict. */
export function guardScript(id) {
  return `${PRE}
RUN=${runDir(id)}
# 1. Any YouCoded process that is not this lab's own (its binaries live under ~/perf-lab-runs) is the installed app: refuse.
for p in $(pgrep -u "$(id -u)" -x youcoded || true); do
  e=$(readlink "/proc/$p/exe" 2>/dev/null || echo unknown)
  case "$e" in "$HOME"/perf-lab-runs/*) ;; *) echo "FOREIGN_YOUCODED $p $e";; esac
done
# 2. Another lab run already driving the screen.
for p in $(pgrep -u "$(id -u)" -f 'perf-lab-runs/.*/lane-run.mjs' || true); do echo "OTHER_RUN $p"; done
# 3. The logged-in graphical session (read-only: only these three variables are looked at).
envof() { systemctl --user show-environment 2>/dev/null | sed -n "s/^$1=//p" | head -n1; }
D=$(envof DISPLAY); X=$(envof XAUTHORITY); W=$(envof WAYLAND_DISPLAY)
if [ -z "$D" ]; then
  sp=$(pgrep -u "$(id -u)" -x plasmashell | head -n1 || true)
  if [ -n "\${sp:-}" ]; then
    D=$(tr '\\0' '\\n' < "/proc/$sp/environ" | sed -n 's/^DISPLAY=//p' | head -n1)
    X=$(tr '\\0' '\\n' < "/proc/$sp/environ" | sed -n 's/^XAUTHORITY=//p' | head -n1)
    W=$(tr '\\0' '\\n' < "/proc/$sp/environ" | sed -n 's/^WAYLAND_DISPLAY=//p' | head -n1)
  fi
fi
if [ -z "$D" ]; then echo "NO_DISPLAY"; else echo "DISPLAY=$D"; echo "XAUTHORITY=$X"; echo "WAYLAND_DISPLAY=$W"; fi
[ -e "$RUN" ] && echo "RUN_EXISTS $RUN" || true
echo GUARD_DONE
`;
}

/** Turn the guard step's output into { ok, reasons, display, xauthority }. Pure. */
export function parseGuard(stdout) {
  const reasons = [];
  let display = null, xauthority = null, done = false;
  for (const line of String(stdout).split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('FOREIGN_YOUCODED')) reasons.push(`the desktop's own YouCoded is running (${line.slice('FOREIGN_YOUCODED '.length)}); it uses the same screen. Close it yourself - this tool never touches it`);
    else if (line.startsWith('OTHER_RUN')) reasons.push(`another lab run is already active (pid ${line.split(' ')[1]})`);
    else if (line === 'NO_DISPLAY') reasons.push('no logged-in graphical session was found on the desktop (nobody signed in at its screen?)');
    else if (line.startsWith('RUN_EXISTS')) reasons.push(`run folder already exists: ${line.slice(11)}`);
    else if (line.startsWith('DISPLAY=')) display = line.slice(8);
    else if (line.startsWith('XAUTHORITY=')) xauthority = line.slice(11) || null;
    else if (line === 'GUARD_DONE') done = true;
  }
  if (!done) reasons.push('the safety check did not finish');
  return { ok: reasons.length === 0, reasons, display, xauthority };
}

export function sweepScript() {
  // Only folders named run-* directly inside ~/perf-lab-runs that are over a day old.
  return `${PRE}
B=${REMOTE_BASE}
mkdir -p "$B"
find "$B" -mindepth 1 -maxdepth 1 -type d -name 'run-*' -mtime +0 -print -exec rm -rf {} + || true
echo SWEEP_DONE
`;
}

export function mkdirScript(id) {
  return `${PRE}
mkdir -p ${runDir(id)}/ws/scripts ${runDir(id)}/ws/wecoded-themes/themes ${runDir(id)}/builds ${runDir(id)}/out
`;
}

/** Upload = local `tar` piped into this remote untar. Only the lab scripts (no tests) and the one theme. */
export function untarScript(id) {
  return `${PRE}
tar -xz -C ${runDir(id)}/ws
test -f ${runDir(id)}/ws/scripts/perf-lab/lane-run.mjs
echo UPLOAD_OK
`;
}
export function localTarCommand(themeDir) {
  return { cmd: 'tar', args: ['-C', ROOT, '-cz', '--exclude=scripts/perf-lab/tests', '--exclude=scripts/perf-lab/queues', '--exclude=scripts/perf-lab/phone', 'scripts/perf-lab', ...(themeDir ? ['-C', resolve(themeDir, '..', '..'), 'wecoded-themes/themes/devils-garden'] : [])] };
}

export function sourceScript(id, baselineCommit, candidateCommit) {
  const R = runDir(id);
  return `${PRE}
R=${R}
SRC="$HOME/youcoded-dev/youcoded"
GH=https://github.com/itsdestin/youcoded.git
# A separate clone: the desktop's own checkout is only READ (git clone copies from it), never changed.
if [ -e "$SRC/.git" ]; then git clone --quiet --no-checkout "$SRC" "$R/base"; else git clone --quiet --no-checkout "$GH" "$R/base"; fi
git -C "$R/base" remote add gh "$GH" 2>/dev/null || true
for c in ${baselineCommit} ${candidateCommit}; do
  git -C "$R/base" cat-file -e "$c^{commit}" 2>/dev/null || git -C "$R/base" fetch --quiet gh "$c" 2>/dev/null || git -C "$R/base" fetch --quiet gh '+refs/heads/*:refs/remotes/gh/*'
  git -C "$R/base" cat-file -e "$c^{commit}"
done
git clone --quiet "$R/base" "$R/builds/baseline" && git -C "$R/builds/baseline" checkout --quiet --detach ${baselineCommit}
git clone --quiet "$R/base" "$R/builds/candidate" && git -C "$R/builds/candidate" checkout --quiet --detach ${candidateCommit}
echo SOURCES_OK
`;
}

export function buildScript(id, side) {
  const R = runDir(id);
  return `${PRE}
R=${R}
cd "$R/builds/${side}/desktop"
# A separate clone with its own node_modules: nothing is shared with the desktop's own checkout.
nice -n 10 npm ci --no-audit --no-fund
nice -n 10 node scripts/generate-preload-channels.mjs
nice -n 10 node "$R/ws/scripts/perf-lab/build.mjs" "$R/builds/${side}" > "$R/out/build-${side}.json"
test -x "$R/builds/${side}/desktop/release/linux-unpacked/youcoded"
echo BUILD_OK ${side}
`;
}

/** Start lane-run detached (it survives an SSH drop) with sleep blocked; the laptop polls for its exit-code file. */
export function startScript(id, o, display) {
  const R = runDir(id);
  const args = [
    `--out "$R/out"`, `--display ${q(display.display)}`, `--baseline "$R/builds/baseline"`, `--candidate "$R/builds/candidate"`,
    `--scenarios ${q(o.scenarios.join(','))}`, `--repeats ${Number(o.repeats)}`, `--idle-minutes ${Number(o.idleMinutes)}`,
    `--baseline-label ${q(o.against.slice(0, 9))}`, `--candidate-label ${q(o.build.slice(0, 9))}`, `--machine 'desktop PC'`,
  ].join(' ');
  const xauth = display.xauthority ? ` XAUTHORITY=${q(display.xauthority)}` : '';
  // WHY a launcher file: the quoting of a nested bash -c is easy to get wrong; a quoted heredoc is written verbatim, and the
  // launcher receives the run folder as its only argument.
  return `${PRE}
R=${R}
rm -f "$R/exit-code"
cat > "$R/start.sh" <<'EOS'
set -u
R="$1"
cd "$R/ws"
# systemd-inhibit blocks sleep and idle for as long as the run lasts.
systemd-inhibit --what=sleep:idle --who=perf-lab --why="realistic performance test" --mode=block env DISPLAY=${q(display.display)}${xauth} node "$R/ws/scripts/perf-lab/lane-run.mjs" ${args}
echo $? > "$R/exit-code"
EOS
# setsid + nohup: the run outlives a dropped SSH connection.
setsid nohup bash "$R/start.sh" "$R" > "$R/out/run.log" 2>&1 < /dev/null &
echo STARTED
`;
}

export function pollScript(id) {
  const R = runDir(id);
  return `${PRE}
R=${R}
tail -n 3 "$R/out/run.log" 2>/dev/null | sed 's/^/LOG /' || true
if [ -f "$R/exit-code" ]; then echo "EXIT $(cat "$R/exit-code")"; else echo RUNNING; fi
`;
}

export function fetchScript(id, file) {
  return `${PRE}\ncat ${runDir(id)}/out/${file}\n`;
}

/** Delete this run's folder. Refuses anything that is not ~/perf-lab-runs/run-*. */
export function cleanupScript(id) {
  return `${PRE}
R=${runDir(id)}
case "$R" in "$HOME"/perf-lab-runs/run-*) rm -rf "$R"; echo CLEANED;; *) echo "refusing to delete $R"; exit 1;; esac
`;
}

export function doctorScript() {
  return `set -uo pipefail
echo "HOST=$(hostname)"
echo "NODE=$(node -v 2>/dev/null || echo missing)"
echo "WEBSOCKET=$(node -e "process.stdout.write(typeof WebSocket==='function'?'yes':'no')" 2>/dev/null || echo no)"
echo "GIT=$(git --version 2>/dev/null || echo missing)"
echo "NPM=$(npm -v 2>/dev/null || echo missing)"
echo "INHIBIT=$(command -v systemd-inhibit >/dev/null && echo yes || echo no)"
echo "GPU=$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null | head -n1 || echo none)"
echo "FREE_GB=$(df -P "$HOME" | awk 'NR==2{printf "%d", $4/1048576}')"
envof() { systemctl --user show-environment 2>/dev/null | sed -n "s/^$1=//p" | head -n1; }
echo "DISPLAY=$(envof DISPLAY)"
echo "WAYLAND_DISPLAY=$(envof WAYLAND_DISPLAY)"
echo "XAUTHORITY_SET=$([ -n "$(envof XAUTHORITY)" ] && echo yes || echo no)"
echo "APP_CLONE=$([ -e "$HOME/youcoded-dev/youcoded/.git" ] && echo yes || echo no)"
for p in $(pgrep -u "$(id -u)" -x youcoded || true); do e=$(readlink "/proc/$p/exe" 2>/dev/null || echo unknown); case "$e" in "$HOME"/perf-lab-runs/*) ;; *) echo "FOREIGN_YOUCODED $p $e";; esac; done
echo DOCTOR_DONE
`;
}

/** Doctor output -> list of { name, ok, detail }. Pure. */
export function parseDoctor(stdout) {
  const kv = {};
  const foreign = [];
  for (const line of String(stdout).split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) kv[m[1]] = m[2];
    if (line.startsWith('FOREIGN_YOUCODED')) foreign.push(line.slice(17));
  }
  const major = Number(/v?(\d+)/.exec(kv.NODE ?? '')?.[1] ?? 0);
  const free = Number(kv.FREE_GB ?? 0);
  const checks = [
    { name: 'Reachable over SSH', ok: /DOCTOR_DONE/.test(stdout), detail: kv.HOST ?? 'no answer' },
    { name: 'Node (22 or newer, needed for the lab)', ok: major >= 22 && kv.WEBSOCKET === 'yes', detail: `${kv.NODE ?? 'missing'}, built-in WebSocket ${kv.WEBSOCKET ?? '?'}` },
    { name: 'git', ok: !!kv.GIT && kv.GIT !== 'missing', detail: kv.GIT ?? 'missing' },
    { name: 'npm', ok: !!kv.NPM && kv.NPM !== 'missing', detail: kv.NPM ?? 'missing' },
    { name: 'Sleep blocker (systemd-inhibit)', ok: kv.INHIBIT === 'yes', detail: kv.INHIBIT ?? '?' },
    { name: 'Graphics card', ok: !!kv.GPU && kv.GPU !== 'none', detail: kv.GPU ?? 'none' },
    { name: 'Free disk (15 GB or more)', ok: free >= 15, detail: `${free} GB free` },
    { name: 'Graphical session (screen to drive)', ok: !!kv.DISPLAY, detail: kv.DISPLAY ? `DISPLAY ${kv.DISPLAY}${kv.WAYLAND_DISPLAY ? `, Wayland ${kv.WAYLAND_DISPLAY}` : ''}, screen access ${kv.XAUTHORITY_SET}` : 'none found: nobody signed in at the desktop?' },
    { name: "Desktop's own YouCoded not running", ok: foreign.length === 0, detail: foreign.length ? foreign.join('; ') : 'not running' },
    { name: 'App clone to read commits from (optional)', ok: true, detail: kv.APP_CLONE === 'yes' ? 'found ~/youcoded-dev/youcoded (read-only)' : 'none: will fetch from GitHub' },
  ];
  return checks;
}

// ── the plan ─────────────────────────────────────────────────────────────────

/**
 * The ordered steps of a run. A step is { id, title, script(ctx) } for a remote bash script, optionally with `localPipe`
 * (a local command whose stdout feeds the script) or `fetchTo` (save the script's stdout under the local result folder),
 * `always` (runs even after a failure) and `poll`.
 */
export function planRun(o, runId, { themeDir = findThemeDir(o.themeDir) } = {}) {
  const steps = [
    { id: 'guard', title: 'Safety check: no other YouCoded running, a screen to use', script: () => guardScript(runId), guard: true },
    { id: 'sweep', title: 'Delete stale run folders older than a day (inside ~/perf-lab-runs only)', script: () => sweepScript() },
    { id: 'mkdir', title: `Make the throwaway folder ~/perf-lab-runs/${runId}`, script: () => mkdirScript(runId), created: true },
    { id: 'upload', title: 'Send the lab scripts and one public theme (no personal data)', script: () => untarScript(runId), localPipe: localTarCommand(themeDir) },
    { id: 'sources', title: 'Check out both commits (read-only from the desktop\'s app clone, else GitHub)', script: () => sourceScript(runId, o.against, o.build) },
    { id: 'build-baseline', title: `Build the baseline (${o.against.slice(0, 9)})`, script: () => buildScript(runId, 'baseline') },
    { id: 'build-candidate', title: `Build the candidate (${o.build.slice(0, 9)})`, script: () => buildScript(runId, 'candidate') },
    { id: 'start', title: 'Start the test (sleep blocked) and wait for it', script: (ctx) => startScript(runId, o, { display: ctx.display ?? '<DISPLAY from the safety check>', xauthority: ctx.xauthority }), poll: true, runId },
    ...['lane-results.json', 'lane-report.json', 'lane-report.txt', 'run.log', 'build-baseline.json', 'build-candidate.json'].map((f) => ({ id: `fetch-${f}`, title: `Copy ${f} back`, script: () => fetchScript(runId, f), fetchTo: f, optional: true, always: true, onlyIfCreated: true })),
    ...(o.keepRemote ? [] : [{ id: 'cleanup', title: 'Delete the throwaway folder on the desktop', script: () => cleanupScript(runId), always: true, onlyIfCreated: true }]),
  ];
  return steps;
}

export function planDoctor() { return [{ id: 'doctor', title: 'Check the desktop', script: () => doctorScript(), doctor: true }]; }

// ── executing ────────────────────────────────────────────────────────────────

export function sshArgs(o) {
  return ['-i', o.sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6', o.host, 'bash', '-s'];
}

/** The real executor: ssh with the script on stdin. Resolves { code, stdout, stderr }. */
export function sshExec(o, script) {
  return new Promise((res) => {
    const ssh = spawn('ssh', sshArgs(o), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    ssh.stdout.on('data', (d) => { stdout += d; });
    ssh.stderr.on('data', (d) => { stderr += d; });
    ssh.on('error', (e) => res({ code: 255, stdout, stderr: String(e) }));
    ssh.on('close', (code) => res({ code, stdout, stderr }));
    ssh.stdin.end(script);
  });
}

/** Upload needs the script AND the tar bytes on one connection: send `bash -c <script>` as the command and the tar as stdin. */
export function sshUpload(o, script, localPipe) {
  return new Promise((res) => {
    const args = ['-i', o.sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', o.host, `bash -c ${q(script)}`];
    const ssh = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    ssh.stdout.on('data', (d) => { stdout += d; });
    ssh.stderr.on('data', (d) => { stderr += d; });
    ssh.on('error', (e) => res({ code: 255, stdout, stderr: String(e) }));
    ssh.on('close', (code) => res({ code, stdout, stderr }));
    const tar = spawn(localPipe.cmd, localPipe.args, { stdio: ['ignore', 'pipe', 'inherit'] });
    tar.stdout.pipe(ssh.stdin);
    tar.on('error', (e) => { stderr += String(e); ssh.stdin.end(); });
  });
}

export const defaultExec = (o) => (step, script) => (step.localPipe ? sshUpload(o, script, step.localPipe) : sshExec(o, script));

/**
 * Run the plan. `exec(step, script)` -> { code, stdout, stderr } is injectable (tests use a fake). Steps run in order and stop at
 * the first failure; `always` steps (copy back, cleanup) still run, cleanup only if the folder was made. Returns { ok, results,
 * refused }.
 */
export async function runPlan(steps, { exec, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollSeconds = 30, maxWaitMs = 6 * 3_600_000, save = () => {}, now = Date.now } = {}) {
  const ctx = {};
  const results = [];
  let failed = null, refused = null, created = false;
  for (const step of steps) {
    if (failed && !step.always) continue;
    if (step.onlyIfCreated && !created) continue;
    log(`== ${step.id}: ${step.title}`);
    const r = await exec(step, step.script(ctx));
    results.push({ id: step.id, code: r.code });
    if (step.id === 'mkdir' && r.code === 0) created = true;
    if (r.code === 255 && step.id === 'guard') { failed = refused = { reasons: ['the desktop is not reachable over SSH (asleep, off, or off the private network?). Run "doctor" for details.'], detail: r.stderr?.trim() }; continue; }
    if (step.guard) {
      const g = parseGuard(r.stdout);
      if (!g.ok || r.code !== 0) { failed = refused = { reasons: g.reasons.length ? g.reasons : [`safety check failed: ${r.stderr?.trim()}`] }; continue; }
      ctx.display = g.display; ctx.xauthority = g.xauthority;
      continue;
    }
    if (step.fetchTo) { if (r.code === 0) save(step.fetchTo, r.stdout); else if (!step.optional) failed = { step: step.id, stderr: r.stderr }; continue; }
    if (r.code !== 0) { failed = { step: step.id, code: r.code, stderr: r.stderr, stdout: r.stdout }; continue; }
    if (step.poll) {
      const t0 = now();
      for (;;) {
        await sleep(pollSeconds * 1000);
        const p = await exec({ id: 'poll', title: 'poll' }, pollScript(step.runId));
        const lines = String(p.stdout).split('\n');
        for (const l of lines.filter((x) => x.startsWith('LOG '))) log(l.slice(4));
        const ex = lines.find((x) => x.startsWith('EXIT '));
        if (ex) { const code = Number(ex.slice(5)); if (code !== 0 && code !== 3) failed = { step: 'run', code, stderr: `lane-run stopped with exit code ${code} (see run.log)` }; break; }
        if (p.code === 255) log('(connection lost; the run continues on the desktop, retrying)');
        if (now() - t0 > maxWaitMs) { failed = { step: 'run', stderr: 'gave up waiting; the run may still be going on the desktop' }; break; }
      }
    }
  }
  return { ok: !failed, results, refused, failed };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function dryRunText(steps) {
  const out = [];
  for (const s of steps) {
    out.push(`### ${s.id}: ${s.title}`);
    if (s.localPipe) out.push(`# local, piped to the desktop: ${s.localPipe.cmd} ${s.localPipe.args.map((a) => q(a)).join(' ')}`);
    out.push(s.script({}).trimEnd(), '');
  }
  return out.join('\n');
}

export async function main(argv = process.argv.slice(2), { exec } = {}) {
  const o = parseArgs(argv);
  if (o.cmd === 'doctor') {
    const steps = planDoctor();
    if (o.dryRun) { console.log(dryRunText(steps)); return 0; }
    const r = await (exec ?? defaultExec(o))(steps[0], steps[0].script());
    if (r.code === 255) { console.error(`The desktop is not reachable over SSH (${o.host}). Is it switched on, awake and on Tailscale?\n${r.stderr.trim()}`); return 2; }
    const checks = parseDoctor(r.stdout);
    for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}: ${c.detail}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  const runId = newRunId();
  const steps = planRun(o, runId);
  if (o.dryRun) { console.log(`DRY RUN: nothing is executed. Run id ${runId}; host ${o.host}\n`); console.log(dryRunText(steps)); return 0; }
  const themeDir = findThemeDir(o.themeDir);
  if (!themeDir) { console.error('Cannot find the devils-garden theme (looked in wecoded-themes/themes). Pass --theme-dir <dir containing devils-garden>.'); return 2; }
  const local = join(ROOT, 'scratch', 'perf-lab', 'lane-runs', runId);
  mkdirSync(local, { recursive: true });
  const res = await runPlan(steps, {
    exec: exec ?? defaultExec(o), log: (m) => console.error(m), pollSeconds: o.pollSeconds, maxWaitMs: o.maxWaitHours * 3_600_000,
    save: (file, text) => writeFileSync(join(local, file), text),
  });
  if (res.refused) { console.error(`REFUSED: ${res.refused.reasons.join('\n         ')}`); return 3; }
  if (res.failed) console.error(`FAILED at ${res.failed.step ?? '?'}: ${String(res.failed.stderr ?? '').trim().slice(-800)}`);
  const resultsFile = join(local, 'lane-results.json');
  if (existsSync(resultsFile)) {
    const text = render(compareLegs(JSON.parse(readFileSync(resultsFile, 'utf8'))));
    writeFileSync(join(local, 'lane-report.txt'), text);
    console.log(text);
    console.log(`Results saved in ${local}`);
  }
  return res.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 2; });
}
