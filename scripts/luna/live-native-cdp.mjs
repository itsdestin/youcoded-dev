import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readNativeDiagnostics } from './native-diagnostics.mjs';

// WHY derived, not pinned: the workspace copy this script sits in (scripts/luna/../..) —
// its youcoded/ component must carry the experiment hooks (youcoded master since #555).
const WORKTREE = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const DEV = `${WORKTREE}/scripts/run-dev.sh`;
const APP = `${WORKTREE}/youcoded`;
const PORT = 9472;
const TARGET = 'http://localhost:5423';

/** A fresh process group launched from the experiment worktree only. Never signal a process by name. */
export async function launchIsolatedNative({ env }) {
  if (process.platform !== 'linux' || env.YOUCODED_LUNA_EXPERIMENT !== '1'
      || env.YOUCODED_PROFILE !== 'luna-eval' || !env.LUNA_GUARD_URL || !env.LUNA_FIXTURE_ROOT
      || env.HOME !== path.join(os.homedir(), '.cache/youcoded-luna-experiment')) {
    throw new Error('Experiment-only private native launch flags are required.');
  }
  // WHY: the private HOME still needs this user's display authorization and KDE keychain;
  // pass only the session's Xauthority path, never a real client profile or app state.
  if (!env.XAUTHORITY) throw new Error('Isolated app requires explicit display authorization.');
  const child = spawn('bash', [DEV, '--offset', '250', '--profile', 'luna-eval', '--label', 'Luna Cache Measurement', '--path', APP], {
    cwd: WORKTREE, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // WHY: logs may contain private data. Expose only fixed diagnostic categories, never lines or paths.
  const signs = { devStart:false, viteReady:false, electronError:false, npmMissing:false, portBusy:false, sandbox:false, display:false, guard:false, stage:null, errorClass:null, exited:null };
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    const text = String(chunk).slice(0, 8192);
    if (text.includes('Starting YouCoded dev')) signs.devStart = true;
    if (text.includes('VITE') && text.includes('ready')) signs.viteReady = true;
    if (/electron.*(error|failed)|error.*electron/i.test(text)) signs.electronError = true;
    if (/command not found|Cannot find module|MODULE_NOT_FOUND/i.test(text)) signs.npmMissing = true;
    if (/EADDRINUSE|port.*already in use/i.test(text)) signs.portBusy = true;
    if (/sandbox|setuid/i.test(text)) signs.sandbox = true;
    if (/DISPLAY|Wayland|X11/i.test(text)) signs.display = true;
    if (/Luna experiment|LUNA_GUARD_URL|luna-eval/i.test(text)) signs.guard = true;
    const stage = /\[run-dev\] (dev:main|dev:renderer|wait-on) exited with code (\d+)/.exec(text);
    if (stage) signs.stage = {name:stage[1],code:Number(stage[2])};
    for (const [label, pattern] of Object.entries({electronBinary:/Electron failed to install|electron.*ENOENT/i, displayMissing:/Missing X server|cannot open display|Failed to connect to display/i, compile:/error TS\d+/, authRefused:/authentication.*failed|account.*missing/i, profileRefused:/experiment.*profile|profile.*luna/i, moduleMissing:/Cannot find module|ERR_MODULE_NOT_FOUND/i, unhandled:/UnhandledPromiseRejection|uncaughtException/i})) if (pattern.test(text)) signs.errorClass = label;
  });
  child.once('exit', (code, signal) => { signs.exited = { code, signal }; });
  if (!child.pid) throw new Error('Private native launcher did not start.');
  return {
    pid: child.pid, attestedFork: false, startupStatus: () => ({...signs}),
    killGroup() { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } },
  };
}

async function waitForTarget(port, expectedUrl, timeoutMs = 50_000) {
  if (port !== PORT || expectedUrl !== 'http://127.0.0.1:5423') throw new Error('Wrong private CDP target.');
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await r.json();
      const item = targets.find((t) => t.type === 'page' && [TARGET, expectedUrl].some((value) => t.url === value || t.url === `${value}/`));
      if (item && /^ws:\/\/127\.0\.0\.1:9472\//.test(item.webSocketDebuggerUrl)) return item.webSocketDebuggerUrl;
    } catch { /* startup in progress */ }
    await delay(250);
  }
  throw new Error('Private native renderer did not appear on dedicated CDP port.');
}

/** Only the dedicated dev-process port and exact Vite page are accepted. The installed app is never attached. */
export async function connectIsolatedNative(_child, { port, viteTarget, fixtureRoot }) {
  const wsUrl = await waitForTarget(port, viteTarget);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Private CDP connection timed out.')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Private CDP connection failed.')); }, { once:true });
  });
  let nextId = 0;
  const pending = new Map();
  const callbacks = new Set();
  ws.addEventListener('message', ({ data }) => {
    let result;
    try { result = JSON.parse(String(data)); } catch { return; }
    if (!pending.has(result.id)) return;
    const entry = pending.get(result.id); pending.delete(result.id); clearTimeout(entry.timer);
    if (result.error || result.result?.exceptionDetails) entry.reject(new Error('Private renderer operation failed.'));
    else entry.resolve(result.result?.result?.value);
  });
  const evaluate = (expression, timeoutMs = 90_000) => new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error('Private renderer disconnected.'));
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Private renderer operation timed out.')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise:true, returnByValue:true } }));
  });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate('Boolean(window.claude?.native?.send && window.claude?.session?.create)', 2000).catch(() => false)) { ready = true; break; }
    await delay(250);
  }
  if (!ready) { ws.close(); throw new Error('Private renderer preload bridge did not become ready.'); }
  return {
    onTranscriptEvent(cb) { callbacks.add(cb); return cb; },
    offTranscriptEvent(_channel, cb) { callbacks.delete(cb); },
    async create(options) {
      const args = { ...options, cwd: fixtureRoot };
      const id = await evaluate(`(async () => { const x = await window.claude.session.create(${JSON.stringify(args)}); return x?.id ?? null; })()`);
      return { id };
    },
    async resume(id) {
      const args = { name: 'Luna Cache Measurement', cwd: fixtureRoot, skipPermissions:false, provider:'native', resumeSessionId:id };
      const resumedId = await evaluate(`(async () => { const x = await window.claude.session.create(${JSON.stringify(args)}); return x?.id ?? null; })()`);
      return { id: resumedId };
    },
    async send(id, text) {
      // WHY: project text and transcript content remain inside the isolated renderer. Only event types cross CDP.
      const expr = `(async () => {
        const events = []; const sid = ${JSON.stringify(id)};
        let off, timer;
        try {
          const completed = new Promise((resolve) => {
            off = window.claude.on.transcriptEvent((e) => {
              if (e?.sessionId !== sid) return;
              if (['tool-use','tool-result','permission-request'].includes(e.type)) events.push(e.type);
              if (e.type === 'turn-complete') resolve('complete');
              if (e.type === 'session-error' || e.type === 'user-interrupt') {
                const text = String(e.data?.text ?? '');
                const kind = /sign.?in|signed out|account/i.test(text) ? 'account'
                  : /credential|auth|token/i.test(text) ? 'auth'
                  : /model|luna/i.test(text) ? 'model'
                  : /provider/i.test(text) ? 'provider'
                  : /network|fetch|offline/i.test(text) ? 'network'
                  : /guard|experiment/i.test(text) ? 'guard' : 'unknown';
                const safe = text.slice(0, 180).replace(/[A-Za-z0-9_+\/-]{24,}/g, '[redacted]').replace(/[\w.+-]+@[\w.-]+/g, '[email]');
                resolve('error-' + kind + ':' + safe);
              }
            });
            timer = setTimeout(() => resolve('timeout'), 85000);
          });
          const sent = await window.claude.native.send(sid, ${JSON.stringify(text)});
          if (sent?.status !== 'sent') return { status:'rejected', reason:sent?.reason ?? null, events };
          return { status: await completed, events };
        } finally { clearTimeout(timer); if (off) window.claude.off('transcript:event', off); }
      })()`;
      const result = await evaluate(expr, 89_000);
      for (const type of result?.events ?? []) for (const cb of callbacks) cb({ type });
      return { status: result?.status === 'complete' ? 'sent' : result?.status ?? 'error', reason: result?.reason ?? null };
    },
    // WHY: the lifecycle comparison forces a compaction with the same bridge call the
    // app's own /compact uses; only the ok/reason result crosses CDP.
    async compact(id) {
      const r = await evaluate(`(async () => { const x = await window.claude.native.compact(${JSON.stringify(id)}); return x ?? null; })()`, 120_000);
      return { ok: r?.ok === true, reason: typeof r?.reason === 'string' ? r.reason.slice(0, 60) : null };
    },
    async close() { for (const row of pending.values()) { clearTimeout(row.timer); row.reject(new Error('Private renderer closed.')); } pending.clear(); ws.close(); },
  };
}

export function nativeDiagnosticsReader(directory) {
  const seen = new Set();
  return async ({ sessionId }) => {
    for (let tries = 0; tries < 12; tries++) {
      const rows = await readNativeDiagnostics({ directory, sessionId, seen });
      if (rows.length) return rows;
      await delay(250);
    }
    return [];
  };
}
