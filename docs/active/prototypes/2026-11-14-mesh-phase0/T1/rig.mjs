#!/usr/bin/env node
// T1 rig: N real YouCoded backends (headless, no window) on this machine, each in its own jail and home folder.
//
//   node rig.mjs build                       compile the backend once into ./build (never touches youcoded/desktop/dist)
//   node rig.mjs up [--devices 3] [--seed t1] [--root <dir>] [--no-jail] [--offline] [--hold]
//   node rig.mjs selftest                    up, prove isolation, write chats, skew a clock, diff inventories, stop
//   node rig.mjs status | ping | down | inventory <name> | diff <A> <B> | skew <name> <ms> | chat <name> <lines> [sessionId]
//
// What one device is: `node -r skew -r audit dist/main/headless/headless-main.js` (the Android backend, run on Linux),
// inside bubblewrap with   - the REAL home replaced by an empty decoy folder (anything written there is a rig-safety bug)
//                          - /tmp and /run/user/<uid> replaced by empty tmpfs (no live-app sockets, no D-Bus keyring)
//                          - only this device's own folder writable; build + source read-only
//                          - its own process list (--unshare-pid), hostname rig-<name>, empty environment + the few below.
// --no-jail runs the same thing with only environment redirection (for machines without bubblewrap; weaker, say so in reports).
// --offline adds --unshare-net (no network at all; the relay stub is then unreachable until a unix-socket bridge exists).
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './relay-stub.mjs';
import { inventory, diffInventories } from './inventory.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');           // workspace/session root
const DESKTOP = path.join(ROOT, 'youcoded', 'desktop');
export const BUILD = path.join(HERE, 'build');
export const REAL_HOME = os.userInfo().homedir;                      // asked of the OS on purpose: NOT process.env.HOME
const UID = process.getuid();
const require = createRequire(import.meta.url);
const { turnLines, uuidOf, slugOf } = require('./chat-lines.cjs');
const wsRequire = createRequire(path.join(DESKTOP, 'package.json'));

const args = process.argv.slice(2);
const cmd = args[0] ?? 'help';
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
// --env K=V (repeatable): extra variables for every device, e.g. --env YOUCODED_PROFILE=rig to switch off the marketplace clone at boot.
const EXTRA_ENV = Object.fromEntries(args.flatMap((a, i) => (a === '--env' && args[i + 1]?.includes('=')) ? [args[i + 1].split(/=(.*)/s).slice(0, 2)] : []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- build ----------
function build() {
  fs.mkdirSync(BUILD, { recursive: true });
  // WHY --outDir into the prototype: the worktree's own desktop/dist is not ours to write (Phase 0 edits nothing outside T1).
  const r = spawnSync(path.join(DESKTOP, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json', '--outDir', path.join(BUILD, 'dist')], { cwd: DESKTOP, stdio: 'inherit' });
  if (!fs.existsSync(path.join(BUILD, 'dist/main/headless/headless-main.js'))) throw new Error('build failed: no headless-main.js');
  // The headless shim resolves the app folder as dist/../.. : give it the files it expects (read-only links).
  for (const x of ['package.json', 'scripts', 'hook-scripts', 'assets', 'node_modules']) {
    try { fs.rmSync(path.join(BUILD, x), { force: true }); } catch { /* absent */ }
    fs.symlinkSync(path.join(DESKTOP, x), path.join(BUILD, x));
  }
  fs.copyFileSync(path.join(DESKTOP, 'src/main/pty-worker.js'), path.join(BUILD, 'dist/main/pty-worker.js'));
  fs.mkdirSync(path.join(BUILD, 'dist/renderer/data'), { recursive: true });
  console.log(`built (tsc exit ${r.status}; type errors do not stop emit) -> ${BUILD}`);
}

// ---------- devices ----------
const NAMES = 'ABCDEFGHIJ'.split('');
const stableId = (seed, name) => uuidOf(`rig-device:${seed}:${name}`); // distinct, reproducible, uuid-shaped
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

export function planDevice(run, name, seed) {
  const dir = path.join(run, name), home = path.join(dir, 'home');
  return { name, id: stableId(seed, name), dir, home, decoy: path.join(dir, 'decoy-real-home'), log: path.join(dir, 'device.log'),
    audit: path.join(dir, 'fs-audit.jsonl'), clock: path.join(dir, 'clock.json'), userData: path.join(home, '.config', 'youcoded') };
}

export function prepareHome(d) {
  for (const p of [d.home, d.decoy, path.join(d.home, 'bin'), d.userData, path.join(d.home, '.config'), path.join(d.home, '.local/share'), path.join(d.home, '.cache'), path.join(d.home, '.local/state'), path.join(d.dir, 'tmp'), path.join(d.dir, 'run')]) fs.mkdirSync(p, { recursive: true });
  fs.chmodSync(path.join(d.dir, 'run'), 0o700);
  // The device identity. getDeviceIdentity AND getMachineIdentity both read <userData>/device-id.json in the headless boot
  // (headless-boot.ts:192-193 pass the same userData), so one file sets both.
  fs.writeFileSync(path.join(d.userData, 'device-id.json'), JSON.stringify({ id: d.id }));
  // The preloads are copied INTO the device folder: the jail mounts only this folder, never the prototype folder
  // (which also holds the other devices' homes).
  fs.mkdirSync(path.join(d.dir, 'rig'), { recursive: true });
  for (const f of ['skew-preload.cjs', 'fs-audit-preload.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(d.dir, 'rig', f));
  for (const f of ['claude-stub.cjs', 'chat-lines.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(d.home, 'bin', f));
  fs.writeFileSync(path.join(d.home, 'bin', 'claude'), '#!/bin/sh\nexec node "$(dirname "$0")/claude-stub.cjs" "$@"\n', { mode: 0o755 });
  fs.writeFileSync(d.clock, JSON.stringify({ offsetMs: 0 }));
  fs.writeFileSync(d.audit, '');
}

export function deviceEnv(d, jail, port) {
  const run = jail ? `/run/user/${UID}` : path.join(d.dir, 'run');
  return {
    // Everything a path could be derived from, pointed inside the device's own folder:
    HOME: d.home, XDG_CONFIG_HOME: path.join(d.home, '.config'), XDG_DATA_HOME: path.join(d.home, '.local/share'),
    XDG_CACHE_HOME: path.join(d.home, '.cache'), XDG_STATE_HOME: path.join(d.home, '.local/state'), XDG_RUNTIME_DIR: run,
    TMPDIR: jail ? '/tmp' : path.join(d.dir, 'tmp'), CLAUDE_CONFIG_DIR: path.join(d.home, '.claude'),
    YOUCODED_USER_DATA: d.userData, YOUCODED_DEVICE_NAME: `rig-${d.name}`,
    PATH: `${path.join(d.home, 'bin')}:/usr/bin:/bin`, LANG: 'C.UTF-8',
    // The app's own switches:
    YOUCODED_HEADLESS_PORT: String(port), YOUCODED_SECRETS_ON_STDIN: '1', YOUCODED_NO_ANALYTICS: '1', YOUCODED_CHATGPT: '0',
    DISABLE_AUTOUPDATER: '1', GH_TOKEN: 'rig-decoy-token', // a decoy, so `gh` never asks a keyring for the real one
    // Rig preloads:
    RIG_DEVICE: d.name, RIG_CLOCK_FILE: d.clock, RIG_REAL_HOME: REAL_HOME, RIG_FS_AUDIT: d.audit,
    RIG_ALLOW: [d.dir, BUILD, DESKTOP].join(path.delimiter),
    YOUCODED_PROFILE: 'rig', // WHY: the app's own dev-copy switch; stops the boot-time clone of the marketplace from GitHub (3 devices = 3 clones) and the outbox drain; override with --env YOUCODED_PROFILE=
    ...EXTRA_ENV,
  };
}

export function jailArgv(d, env, { offline }) {
  const a = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-uts', '--hostname', `rig-${d.name}`, '--unshare-ipc', '--clearenv'];
  if (offline) a.push('--unshare-net');
  a.push('--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', `/run/user/${UID}`,
    '--bind', d.decoy, REAL_HOME,                 // the real home is an empty, writable DECOY: any file that appears there is a leak
    '--ro-bind', BUILD, BUILD, '--ro-bind', DESKTOP, DESKTOP, '--bind', d.dir, d.dir, '--chdir', d.home);
  for (const [k, v] of Object.entries(env)) a.push('--setenv', k, v);
  return a;
}

export async function startDevice(d, { jail, offline }) {
  prepareHome(d);
  const port = await freePort(), token = randomBytes(24).toString('hex'), key = randomBytes(32).toString('hex'); // rig-made, throwaway
  const env = deviceEnv(d, jail, port);
  const node = ['-r', path.join(d.dir, 'rig', 'skew-preload.cjs'), '-r', path.join(d.dir, 'rig', 'fs-audit-preload.cjs'), path.join(BUILD, 'dist/main/headless/headless-main.js')];
  const out = fs.openSync(d.log, 'a');
  const child = jail
    ? spawn('bwrap', [...jailArgv(d, env, { offline }), '/usr/bin/node', ...node], { stdio: ['pipe', out, out] })
    : spawn(process.execPath, node, { cwd: d.home, env, stdio: ['pipe', out, out] });
  // The owner token and secret key go on stdin as ONE JSON line (headless-main.ts readSecrets), never in argv or the log.
  child.stdin.end(JSON.stringify({ token, key }) + '\n');
  child.on('exit', (code, sig) => { d.exited = { code, sig }; });
  Object.assign(d, { pid: child.pid, port, token, jail, child });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (d.exited) throw new Error(`device ${d.name} exited early (${JSON.stringify(d.exited)}); see ${d.log}`);
    if (fs.readFileSync(d.log, 'utf8').includes(`YOUCODED_HEADLESS_READY ${port}`)) { d.readyMs = Date.now() - t0; return d; }
    await sleep(150);
  }
  throw new Error(`device ${d.name} not ready in 60 s; see ${d.log}`);
}

/** pids of everything below a pid, from /proc (bwrap forks an init and then node). Exact pids only. */
export function descendants(pid) {
  const out = [];
  const walk = (p) => { let kids = ''; try { kids = fs.readFileSync(`/proc/${p}/task/${p}/children`, 'utf8'); } catch { return; } for (const k of kids.split(/\s+/).filter(Boolean)) { out.push(Number(k)); walk(k); } };
  walk(pid); return out;
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function stopDevice(d) {
  if (!d.child || d.exited) return;
  const all = [d.pid, ...descendants(d.pid)];
  // Ask nicely: SIGTERM to the backend node process itself (headless-main.ts traps it and stops cleanly).
  const node = all.filter((p) => { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0'); return c[0].endsWith('/node') && c.some((x) => x.endsWith('headless-main.js')); } catch { return false; } });  // argv0 must be node: bwrap's own argv also names the script
  for (const p of node.length ? node : [d.pid]) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !d.exited) await sleep(100);
  // Anything still alive, by the exact pid recorded above (never a name match), is killed.
  for (const p of all) if (alive(p) && p !== process.pid) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  d.stoppedCleanly = !!d.exited && d.exited.code === 0;
}

/** Every file or symlink that appeared inside the decoy "real home" = the device tried to write the real home. */
export function decoyLeaks(d) {
  const leaks = [];
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else leaks.push(path.relative(d.decoy, f)); } };
  try { walk(d.decoy); } catch { /* none */ }
  return leaks;
}
export function auditLines(d) {
  try { return fs.readFileSync(d.audit, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

// ---------- control: talk to a device's local door ----------
export async function ping(d) {
  const WebSocket = wsRequire('ws');
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${d.port}/`);
    const t = setTimeout(() => { try { ws.terminate(); } catch { /* */ } res({ ok: false, why: 'timeout' }); }, 5000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: d.token })));
    ws.on('message', (m) => { clearTimeout(t); const msg = JSON.parse(m.toString()); ws.close(); res({ ok: msg.type === 'auth:ok', type: msg.type }); });
    ws.on('error', (e) => { clearTimeout(t); res({ ok: false, why: String(e.message) }); });
  });
}
async function wrongTokenRejected(d) {
  const WebSocket = wsRequire('ws');
  return new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${d.port}/`); ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'x'.repeat(48) }))); ws.on('message', (m) => { ws.close(); res(JSON.parse(m.toString()).type === 'auth:failed'); }); ws.on('error', () => res(false)); setTimeout(() => res(false), 5000); });
}

export function writeChat(d, { cwd = '/rig/project', sessionId, lines = 4 }) {
  sessionId ??= uuidOf(`rig-chat:${d.name}:${cwd}`);
  const dir = path.join(d.home, '.claude', 'projects', slugOf(cwd)); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${sessionId}.jsonl`); let parent = null, body = '';
  for (let n = 0; n < Math.ceil(lines / 2); n++) { const r = turnLines({ sessionId, cwd, n, parent, userText: `rig line ${n + 1}` }); body += r.lines.join(''); parent = r.lastUuid; }
  fs.appendFileSync(f, body); return { sessionId, file: f };
}

// ---------- the rig ----------
export async function up({ n = 3, seed = 't1', root, jail = true, offline = false } = {}) {
  if (!fs.existsSync(path.join(BUILD, 'dist/main/headless/headless-main.js'))) build();
  if (jail && spawnSync('bwrap', ['--version']).status !== 0) throw new Error('bubblewrap (bwrap) not found; use --no-jail (env-only isolation, weaker)');
  const run = root ?? path.join(HERE, 'run', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(run, { recursive: true });
  const relay = await startRelay();
  const devices = NAMES.slice(0, n).map((nm) => planDevice(run, nm, seed));
  // Booted in parallel: each is its own process; the box has the cores (4 workers is the cap for scans, not boots of 3).
  await Promise.all(devices.map((d) => startDevice(d, { jail, offline })));
  const state = { run, relay: relay.url, devices: devices.map(({ name, id, pid, port, home, log, dir }) => ({ name, id, pid, port, home, log, dir })) };
  fs.writeFileSync(path.join(run, 'rig.json'), JSON.stringify({ ...state, rigPid: process.pid }, null, 2));
  // Door tokens are throwaway values made for this run; kept 0600 so `ping`/`down` from another shell can work. Never printed.
  fs.writeFileSync(path.join(run, 'control.json'), JSON.stringify(Object.fromEntries(devices.map((d) => [d.name, { port: d.port, token: d.token }]))), { mode: 0o600 });
  fs.writeFileSync(path.join(path.dirname(run), 'latest'), run);
  return { run, relay, devices, jail, offline, stop: async () => { await Promise.all(devices.map(stopDevice)); await relay.close(); } };
}

async function selftest() {
  const rig = await up({ n: Number(opt('devices', 3)), jail: !flag('no-jail'), offline: flag('offline') });
  const R = { run: rig.run, jail: rig.jail, offline: rig.offline, devices: [] };
  try {
    for (const d of rig.devices) R.devices.push({ name: d.name, id8: d.id.slice(0, 8), pid: d.pid, port: d.port, readyMs: d.readyMs, ping: await ping(d), wrongTokenRejected: await wrongTokenRejected(d),
      hostname: undefined });
    // Distinct identities as the backend itself reports them (read back from each device's own file):
    R.ids = rig.devices.map((d) => JSON.parse(fs.readFileSync(path.join(d.userData, 'device-id.json'), 'utf8')).id.slice(0, 8));
    R.idsDistinct = new Set(R.ids).size === rig.devices.length;
    // Chats: the same chat on A and B (so inventories can match), a longer copy on B, an unrelated chat on C.
    const sid = uuidOf('rig-shared-chat');
    const [A, B, C] = rig.devices;
    writeChat(A, { sessionId: sid, lines: 4 }); writeChat(B, { sessionId: sid, lines: 6 }); if (C) writeChat(C, { cwd: '/rig/other', lines: 2 });
    // Clock skew: shift B by +30 days and read the shifted date back out of B's own log line timestamps (see below).
    fs.writeFileSync(B.clock, JSON.stringify({ offsetMs: 30 * 86400000 })); await sleep(700);
    const iA = await inventory(A.home, { deviceId: A.id }), iB = await inventory(B.home, { deviceId: B.id });
    R.inventoryA = iA.chats.map((c) => ({ chat: c.chat.slice(0, 14), lines: c.lines, replyEnds: c.replyEnds, chain: c.chain.slice(0, 10) }));
    R.diffAB = (await diffInventories(iA, iB, { homeA: A.home, homeB: B.home })).map((r) => ({ ...r, chat: r.chat.slice(0, 14) }));
    R.relayReachable = (await (await fetch(`${rig.relay.url}/presence`, { method: 'POST', body: '{}' })).json());
  } finally { await rig.stop(); }
  // After everything is stopped: the proof.
  R.stopped = rig.devices.map((d) => ({ name: d.name, exit: d.exited, alive: alive(d.pid) }));
  R.decoyLeaks = Object.fromEntries(rig.devices.map((d) => [d.name, decoyLeaks(d)]));
  R.fsAudit = Object.fromEntries(rig.devices.map((d) => [d.name, auditLines(d)]));
  console.log(JSON.stringify(R, null, 2));
}

async function main() {
  if (cmd === 'build') return build();
  if (cmd === 'help') { console.log('commands: build | up | selftest | status | ping | down | inventory <dev> | diff <A> <B> | skew <dev> <ms> | chat <dev> <lines> [sessionId]'); return; }
  if (cmd === 'selftest') return selftest();
  if (cmd === 'up') {
    const rig = await up({ n: Number(opt('devices', 3)), seed: opt('seed', 't1'), root: opt('root'), jail: !flag('no-jail'), offline: flag('offline') });
    console.log(`rig up: ${rig.devices.length} devices + relay ${rig.relay.url}  (state: ${rig.run}/rig.json)`);
    for (const d of rig.devices) console.log(`  ${d.name}  id ${d.id.slice(0, 8)}  pid ${d.pid}  port ${d.port}  ready ${d.readyMs} ms  home ${d.home}`);
    const down = async () => { await rig.stop(); console.log('rig stopped'); process.exit(0); };
    process.on('SIGINT', down); process.on('SIGTERM', down);
    if (!flag('hold')) { await sleep(Number(opt('for', 5)) * 1000); return down(); }
    await new Promise(() => {});
  }
  // Commands that act on a running rig (the latest one, or --root <run dir>):
  const runDir = opt('root') ?? fs.readFileSync(path.join(HERE, 'run', 'latest'), 'utf8').trim();
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'rig.json'), 'utf8'));
  const ctl = JSON.parse(fs.readFileSync(path.join(runDir, 'control.json'), 'utf8'));
  const dev = (nm) => { const d = state.devices.find((x) => x.name === nm); if (!d) throw new Error(`no device ${nm}`); return { ...d, ...ctl[nm], dir: path.join(runDir, nm), clock: path.join(runDir, nm, 'clock.json') }; };
  if (cmd === 'status') { for (const d of state.devices) console.log(`${d.name} id ${d.id.slice(0, 8)} pid ${d.pid} ${alive(d.pid) ? 'alive' : 'GONE'} port ${d.port}`); return; }
  if (cmd === 'ping') { for (const d of state.devices) console.log(d.name, JSON.stringify(await ping(dev(d.name)))); return; }
  if (cmd === 'down') { if (alive(state.rigPid)) process.kill(state.rigPid, 'SIGTERM'); console.log(`asked rig pid ${state.rigPid} to stop (it stops each device by pid)`); return; }
  if (cmd === 'inventory') { const d = dev(args[1]); console.log(JSON.stringify(await inventory(path.join(d.dir, 'home'), { deviceId: d.id }), null, 1)); return; }
  if (cmd === 'diff') { const [a, b] = [dev(args[1]), dev(args[2])]; const [hA, hB] = [path.join(a.dir, 'home'), path.join(b.dir, 'home')]; console.log(JSON.stringify(await diffInventories(await inventory(hA), await inventory(hB), { homeA: hA, homeB: hB }), null, 1)); return; }
  if (cmd === 'skew') { fs.writeFileSync(dev(args[1]).clock, JSON.stringify({ offsetMs: Number(args[2]) })); console.log(`device ${args[1]} clock offset ${args[2]} ms (takes effect within 200 ms)`); return; }
  if (cmd === 'chat') { const d = dev(args[1]); console.log(writeChat({ ...d, home: path.join(d.dir, 'home') }, { lines: Number(args[2] ?? 4), sessionId: args[3] })); return; }
  console.log('commands: build | up | selftest | status | ping | down | inventory <dev> | diff <A> <B> | skew <dev> <ms> | chat <dev> <lines> [sessionId]');
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.stack ?? e); process.exit(1); });
