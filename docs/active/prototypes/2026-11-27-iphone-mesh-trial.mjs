// trial.mjs — does an iPhone-mode backend join the Mesh with a computer-mode backend?
// Throwaway (scratch, not committed). Same jail as the Mesh rig (desktop/tests/mesh-rig/rig.ts): each device runs under
// bubblewrap with the real home replaced by an empty decoy; the relay is the real Worker code run locally.
//   A = computer: system Node, the tsc build.   I = iPhone: Node 18 --jitless, the iPhone bundle, YOUCODED_HOST_OS=ios.
// usage: node trial.mjs [keystore]   keystore = "test" (default, plaintext test file) | "os" (the real secret-store path)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const T = path.dirname(new URL(import.meta.url).pathname);
const DESKTOP = path.join(T, 'app/desktop');
const NODE18 = '/tmp/claude-1000/-home-destin-youcoded-dev/9e6bc0eb-070d-4c50-9053-21be1ee95d44/scratchpad/probe/node-v18.20.4-linux-x64/bin/node';
const REAL_HOME = os.userInfo().homedir;
const UID = process.getuid();
const KEYSTORE = process.argv[2] === 'os' ? 'os' : 'test';
const ROOT = fs.mkdtempSync(path.join(T, 'run-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const until = async (fn, what, ms = 90_000) => { const t0 = Date.now(); for (;;) { if (await fn()) return Date.now() - t0; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(100); } };
const pids = [];

async function startRelay() {
  const dir = path.join(ROOT, 'relay'); const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(path.join(dir, 'log'), { recursive: true });
  const port = await freePort(); const log = path.join(dir, 'relay.log'); const out = fs.openSync(log, 'a');
  const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, XDG_CONFIG_HOME: home + '/.config', XDG_CACHE_HOME: home + '/.cache', XDG_DATA_HOME: home + '/.local', XDG_STATE_HOME: home + '/.state', TMPDIR: dir, LANG: 'C.UTF-8', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: dir + '/log', CI: '1', NO_COLOR: '1', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' };
  const child = spawn(path.join(T, 'worker/node_modules/.bin/wrangler'), ['dev', '--local', '--env', 'test', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', path.join(dir, 'state')], { cwd: path.join(T, 'worker'), env, stdio: ['ignore', out, out], detached: true });
  await until(() => fs.readFileSync(log, 'utf8').includes(`Ready on http://127.0.0.1:${port}`), 'the relay');
  return { url: `ws://127.0.0.1:${port}`, stop: () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } } };
}

async function startDevice(name, { node, nodeArgs, entry, build, extraEnv, keyStoreWord }) {
  const dir = path.join(ROOT, name); const home = path.join(dir, 'home'); const userData = path.join(home, '.config/youcoded'); const decoy = path.join(dir, 'decoy');
  for (const p of [userData, decoy, path.join(home, 'bin'), path.join(dir, 'tmp')]) fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(userData, 'mesh-switch.json'), JSON.stringify({ enabled: true }));
  fs.writeFileSync(path.join(home, 'bin/claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const port = await freePort(); const meshToken = randomBytes(24).toString('hex'); const log = path.join(dir, 'device.log');
  const env = { HOME: home, XDG_CONFIG_HOME: home + '/.config', XDG_DATA_HOME: home + '/.local/share', XDG_CACHE_HOME: home + '/.cache', XDG_STATE_HOME: home + '/.local/state', XDG_RUNTIME_DIR: `/run/user/${UID}`, TMPDIR: '/tmp', CLAUDE_CONFIG_DIR: home + '/.claude',
    YOUCODED_USER_DATA: userData, YOUCODED_DEVICE_NAME: `trial-${name}`, PATH: `${home}/bin:/usr/bin:/bin`, LANG: 'C.UTF-8', YOUCODED_HEADLESS_PORT: String(port), YOUCODED_SECRETS_ON_STDIN: '1', YOUCODED_NO_ANALYTICS: '1', YOUCODED_CHATGPT: '0', DISABLE_AUTOUPDATER: '1', YOUCODED_PROFILE: 'rig',
    YOUCODED_MESH_TEST: '1', YOUCODED_MESH_TEST_TOKEN: meshToken, YOUCODED_MESH_RELAY_URL: RELAY.url, YOUCODED_MESH_RELAY_BACKOFF_MS: '150', YOUCODED_MESH_REPLICATOR: '1', YOUCODED_MESH_HEADS_MS: '1500', YOUCODED_MESH_GEN_TAKEOVER_MS: '300',
    ...(KEYSTORE === 'os' ? { YOUCODED_MESH_KEYSTORE: 'os' } : {}), ...extraEnv };
  const jail = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-uts', '--hostname', `trial-${name}`, '--unshare-ipc', '--clearenv', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', `/run/user/${UID}`,
    '--bind', decoy, REAL_HOME, '--ro-bind', build, build, '--ro-bind', DESKTOP, DESKTOP, '--ro-bind', path.dirname(path.dirname(node)), path.dirname(path.dirname(node)), '--bind', dir, dir, '--chdir', home];
  for (const [k, v] of Object.entries(env)) jail.push('--setenv', k, v);
  const out = fs.openSync(log, 'a');
  const t0 = Date.now();
  const child = spawn('bwrap', [...jail, node, ...nodeArgs, entry], { stdio: ['pipe', out, out] });
  pids.push(child.pid);
  child.stdin.end(JSON.stringify({ token: randomBytes(24).toString('hex'), key: randomBytes(32).toString('hex'), ...(KEYSTORE === 'os' ? { keyStore: keyStoreWord } : {}) }) + '\n');
  let exited = null; child.on('exit', (c, s) => { exited = { c, s }; });
  let controlPort;
  await until(() => { if (exited) throw new Error(`${name} exited early ${JSON.stringify(exited)}; see ${log}`); const text = fs.readFileSync(log, 'utf8'); const m = /YOUCODED_MESH_TEST_CONTROL (\d+)/.exec(text); if (m) controlPort = Number(m[1]); return text.includes(`YOUCODED_HEADLESS_READY ${port}`) && (controlPort || text.includes('"refused"') || /Mesh.*refused/.test(text)); }, `${name} to start`, 120_000);
  const post = async (route, body = {}) => { const res = await fetch(`http://127.0.0.1:${controlPort}${route}`, { method: 'POST', headers: { authorization: `Bearer ${meshToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json(); if (!res.ok) throw new Error(`${name} ${route}: ${j.error ?? res.status}`); return j; };
  return { name, dir, log, decoy, controlPort, post, bootMs: Date.now() - t0, child };
}

let RELAY;
const report = {};
const timed = async (label, fn) => { const t0 = Date.now(); const r = await fn(); report[label] = `${Date.now() - t0} ms`; return r; };
try {
  RELAY = await startRelay();
  const A = await startDevice('A', { node: '/usr/bin/node', nodeArgs: [], entry: path.join(T, 'buildA/dist/main/headless/headless-main.js'), build: path.join(T, 'buildA'), keyStoreWord: 'android_keystore' });
  const I = await startDevice('I', { node: NODE18, nodeArgs: ['--jitless'], entry: path.join(T, 'ios-backend/dist/main/headless/ios-boot.js'), build: path.join(T, 'ios-backend'), extraEnv: { YOUCODED_HOST_OS: 'ios' }, keyStoreWord: 'ios_keychain' });
  report['start: computer'] = `${A.bootMs} ms`; report['start: iPhone mode'] = `${I.bootMs} ms`;
  if (!I.controlPort) { report.result = 'iPhone-mode Mesh did NOT start (refused)'; throw new Error('refused'); }
  const sA = await A.post('/status'); const sI = await I.post('/status');
  report['iPhone status'] = JSON.stringify({ keystore: sI.keystore, inSet: sI.inSet });

  // 1. computer hosts, iPhone joins with the typed code
  await timed('computer creates the set and reaches the relay', async () => { await A.post('/create-set'); await until(async () => (await A.post('/status')).relay === 'ready', 'A on the relay'); });
  const pair = async (host, joiner, label) => {
    const t0 = Date.now();
    const { code } = await host.post('/pair/open-relay');
    await joiner.post('/pair/join-relay', { code });
    let hostSas = '';
    await until(async () => { const p = (await host.post('/pair/prompt')).prompt; if (p) { hostSas = p.sas; return true; } return false; }, 'the host prompt');
    await until(async () => !!(await joiner.post('/pair/join-status')).sas, 'the joiner number');
    const joinerSas = (await joiner.post('/pair/join-status')).sas;
    report[`${label}: until both screens show the number`] = `${Date.now() - t0} ms`;
    if (hostSas !== joinerSas) throw new Error('the two numbers differ');
    const p = (await host.post('/pair/prompt')).prompt;
    await host.post('/pair/decide', { conn: p.conn, approve: true });
    await until(async () => (await joiner.post('/pair/join-status')).done === true, 'the joiner to finish');
    await until(async () => (await joiner.post('/status')).relay === 'ready', 'joiner on the relay');
    report[`${label}: total`] = `${Date.now() - t0} ms`;
  };
  await pair(A, I, 'pair (computer hosts, iPhone joins)');

  // 2. notes both ways
  await timed('note computer -> iPhone', async () => { await A.post('/send', { text: 'trial-note-from-computer' }); await until(async () => (await I.post('/inbox')).items.some((x) => x.text === 'trial-note-from-computer'), 'note on iPhone'); });
  await timed('note iPhone -> computer', async () => { await I.post('/send', { text: 'trial-note-from-iphone' }); await until(async () => (await A.post('/inbox')).items.some((x) => x.text === 'trial-note-from-iphone'), 'note on computer'); });

  // 3. a chat copied each way (the replicator): 300 lines of ~400 bytes
  const line = (i) => Buffer.from(`${JSON.stringify({ type: i % 2 ? 'assistant' : 'user', message: { content: `trial line ${i} ${'y'.repeat(400)}` } })}\n`).toString('base64');
  const copyChat = async (from, to, label) => {
    const V = (await from.post('/rep/create', { nonce: randomBytes(32).toString('hex'), chat: `trial:${label}` })).version;
    const t0 = Date.now();
    for (let b = 0; b < 30; b++) await from.post('/rep/append', { version: V, lines: Array.from({ length: 10 }, (_, i) => line(b * 10 + i)) });
    report[`${label}: write 300 lines`] = `${Date.now() - t0} ms`;
    await until(async () => (await to.post('/rep/heads')).heads.some((h) => h.version === V && h.lines === 300), `${label} to arrive`, 120_000);
    report[`${label}: all 300 arrived after`] = `${Date.now() - t0} ms`;
    const [ra, rb] = await Promise.all([from, to].map((d) => d.post('/rep/read', { version: V, from: 0, to: 300 })));
    if (!ra.ok || !rb.ok || JSON.stringify(ra.lines) !== JSON.stringify(rb.lines) || rb.lines.length !== 300) throw new Error(`${label}: copies differ`);
  };
  await copyChat(A, I, 'chat computer -> iPhone');
  await copyChat(I, A, 'chat iPhone -> computer');

  // 4. iPhone goes offline, misses notes, comes back
  await I.post('/offline', { offline: true });
  await A.post('/send', { text: 'missed-1' }); await A.post('/send', { text: 'missed-2' });
  await timed('iPhone catches up after being offline', async () => { await I.post('/offline', { offline: false }); await until(async () => { const t = (await I.post('/inbox')).items.map((x) => x.text); return t.includes('missed-1') && t.includes('missed-2'); }, 'catch-up'); });

  report['wrote into the real home'] = [A, I].map((d) => `${d.name}: ${fs.readdirSync(d.decoy).length} files`).join(', ');
  report.result = 'PASS';
} catch (e) {
  report.error = String(e.message ?? e);
} finally {
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  RELAY?.stop();
  await sleep(1500);
  for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  console.log(JSON.stringify(report, null, 1)); console.log('folders:', ROOT);
}
