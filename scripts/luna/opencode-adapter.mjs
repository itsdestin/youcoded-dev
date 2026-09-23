import { spawn } from 'node:child_process';
import path from 'node:path';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { runBounded, sanitizeOpenCodeEvent, assertIsolatedEnvironment } from './live-controller.mjs';

const TURN_MS = 90_000;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function killGroup(pid) {
  try { process.kill(-pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

/** WHY: keep one server process group per backend lifetime and accept only its local startup address. */
export async function startBackend(binary, cwd, isolatedEnv) {
  if (process.platform !== 'linux') throw new Error('OpenCode adapter requires Linux process-group isolation.');
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd, env: isolatedEnv, detached: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  let buffer = '';
  let settled = false;
  let timer;
  try {
    const url = await new Promise((resolve, reject) => {
      const done = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      timer = setTimeout(() => done(new Error('OpenCode serve did not announce a loopback address.')), 15_000);
      child.once('error', (error) => done(error));
      child.once('exit', () => done(new Error('OpenCode serve exited before readiness.')));
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 16_384) return done(new Error('OpenCode serve startup output exceeded limit.'));
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const match = /^opencode server listening on (http:\/\/127\.0\.0\.1:\d{1,5})\s*$/.exec(line);
          if (match) return done(null, match[1]);
        }
      });
    });
    return { pid: child.pid, url };
  } catch (error) {
    if (child.pid) killGroup(child.pid);
    throw error;
  }
}

async function latchGateClosed(gate) {
  // WHY: the shared gate has no public reset/stop path; an unscoped reservation atomically poisons it.
  try { await fetch(`${gate.url}/reserve`, { method: 'POST', signal: AbortSignal.timeout(1_000) }); } catch { /* A missing gate already blocks every client dispatch. */ }
}

function extractSession(line) {
  let event;
  try { event = JSON.parse(line); } catch { return null; }
  const id = event?.sessionID ?? event?.sessionId;
  return typeof id === 'string' && SESSION_ID.test(id) ? id : null;
}

/** WHY: only the normalized token allowlist escapes this adapter; raw OpenCode JSON and session IDs stay in memory. */
export async function verifySignedInRoot(authRoot, isolatedEnv) {
  if (typeof authRoot !== 'string' || !path.isAbsolute(authRoot)) throw new Error('A preverified private OpenCode auth root is required.');
  const privateRoot = path.dirname(isolatedEnv.HOME);
  const expected = path.join(isolatedEnv.XDG_DATA_HOME, 'opencode');
  if (path.resolve(authRoot) !== expected || authRoot !== expected) throw new Error('OpenCode auth root must be the provided private data/opencode directory.');
  const owned0700 = async (target) => {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) throw new Error('OpenCode private auth ancestry must be owned mode 0700 directories.');
  };
  const root = await realpath(privateRoot);
  if (root !== privateRoot) throw new Error('Private OpenCode root must not use symlinks.');
  await owned0700(root);
  for (const key of ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR']) {
    const info = await lstat(isolatedEnv[key]);
    if (info.isSymbolicLink() || (await realpath(isolatedEnv[key])) !== isolatedEnv[key]) throw new Error('OpenCode private directories must not use symlinks.');
    await owned0700(isolatedEnv[key]);
  }
  for (const key of ['HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR']) {
    if ((await readdir(isolatedEnv[key])).length !== 0) throw new Error(`OpenCode private ${key} contains unrelated files or instructions.`);
  }
  const dataEntries = await readdir(isolatedEnv.XDG_DATA_HOME);
  if (dataEntries.length !== 1 || dataEntries[0] !== 'opencode') throw new Error('OpenCode private data directory contains unrelated files or instructions.');
  await owned0700(authRoot);
  const entries = await readdir(authRoot);
  if (entries.length !== 1 || entries[0] !== 'auth.json') throw new Error('OpenCode signed-in root contains unrelated files or instructions.');
  const authPath = path.join(authRoot, 'auth.json');
  const auth = await lstat(authPath);
  if (auth.isSymbolicLink() || !auth.isFile() || auth.uid !== process.getuid?.() || (auth.mode & 0o777) !== 0o600) throw new Error('OpenCode auth.json must be an owned regular mode 0600 file.');
}

// WHY: the repeat comparison (live-repeat-comparison.mjs) needs many fresh sessions without the
// turn-3 restart, a fixed pause between turns, and a unique gate label per round.
export async function runOpenCodeThreeTurns({ binary, cwd, env, prompts, authRoot, gate, restartBeforeTurn = 2, gapMs = 0, repetitionLabel = 'opencode-three-turn' }) {
  if (!gate || typeof gate.url !== 'string' || typeof gate.beginRepetition !== 'function' || typeof gate.beginTurn !== 'function' || typeof gate.endTurn !== 'function' || typeof gate.endRepetition !== 'function' || typeof gate.reserved !== 'function' || typeof gate.halted !== 'function'
      || typeof binary !== 'string' || !binary || typeof cwd !== 'string' || !Array.isArray(prompts) || prompts.length !== 3
      || !prompts.every((prompt) => typeof prompt === 'string' && prompt.length > 0)) {
    throw new TypeError('A binary, fixture directory and three prompts are required.');
  }
  // WHY: the experiment controller owns the shared ten-request gate; this client may only consume its strict five-request repetition budget.
  // WHY: discard inherited auth/provider variables rather than relying on the caller to scrub them.
  const isolatedEnv = Object.fromEntries(['PATH', 'HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'YOUCODED_LUNA_EXPERIMENT', 'OPENCODE_PURE']
    .filter((key) => typeof env?.[key] === 'string').map((key) => [key, env[key]]));
  isolatedEnv.LUNA_GUARD_URL = gate.url;
  isolatedEnv.LUNA_FIXTURE_ROOT = cwd;
  // WHY: a clean profile's defaults still allow sharing and automatic history
  // changes; pin these experiment-only restrictions rather than trust caller env.
  isolatedEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify({ share: 'disabled', autoupdate: false });
  isolatedEnv.OPENCODE_DISABLE_AUTOCOMPACT = '1';
  isolatedEnv.OPENCODE_DISABLE_PRUNE = '1';
  isolatedEnv.OPENCODE_DISABLE_PROJECT_CONFIG = '1';
  try {
    assertIsolatedEnvironment(isolatedEnv, cwd);
    await verifySignedInRoot(authRoot, isolatedEnv);
  } catch (error) {
    await latchGateClosed(gate);
    throw error;
  }
  const turns = [];
  let sessionId = null;
  let backend = null;
  const clientStartCount = gate.reserved();
  gate.beginRepetition(repetitionLabel);
  try {
    for (let index = 0; index < prompts.length; index++) {
      if (index > 0 && gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
      if (index === restartBeforeTurn) {
        killGroup(backend.pid);
        backend = null;
        backend = await startBackend(binary, cwd, isolatedEnv);
      } else if (!backend) {
        backend = await startBackend(binary, cwd, isolatedEnv);
      }
      gate.beginTurn(index + 1);
      let observedSession = null;
      let completedSteps = 0;
      let reportedError = false;
      // WHY: the restarted CLI must not silently fall back to a configured or default non-Luna model.
      const args = ['run', '--attach', backend.url, '--model', 'openai/gpt-5.6-luna', '--format', 'json'];
      if (sessionId) args.push('--session', sessionId);
      args.push(prompts[index]);
      let result;
      try {
        result = await runBounded(binary, args, {
          cwd, env: isolatedEnv, timeoutMs: TURN_MS,
          onLine(line) {
            const sanitized = sanitizeOpenCodeEvent(line);
            if (sanitized) {
              completedSteps++;
              // WHY: the sanitizer hides a zero cache read as null; the repeat comparison needs the
              // raw counts (OpenCode's `input` excludes cache reads/writes) to score misses as 0%.
              const t = JSON.parse(line).part.tokens;
              turns.push({ turn: index + 1, ...sanitized, rawInput: t.input, rawCacheRead: t.cache?.read ?? null, rawCacheWrite: t.cache?.write ?? null });
            }
            // WHY: attached OpenCode CLI can exit zero after emitting a session error;
            // never accept a session ID alone as evidence that a model turn completed.
            try { if (JSON.parse(line)?.type === 'error') reportedError = true; } catch { /* only JSON events matter */ }
            const candidate = extractSession(line);
            if (candidate) {
              if (observedSession && observedSession !== candidate) throw new Error('OpenCode changed session during a turn.');
              observedSession = candidate;
            }
          },
        });
      } finally {
        gate.endTurn();
      }
      if (result.timedOut || result.code !== 0 || reportedError || !observedSession) throw new Error('OpenCode turn failed, timed out, emitted an error, or omitted session identity.');
      if (completedSteps === 0) throw new Error('OpenCode turn omitted completed provider usage.');
      if (sessionId && observedSession !== sessionId) throw new Error('OpenCode did not resume the exact session.');
      sessionId ??= observedSession;
    }
    return { turns, sessionLabel: 'session-1', requestCount: gate.reserved() - clientStartCount };
  } catch (error) {
    // WHY: failures poison this private run; never leave a serving backend or continue with a partial session.
    await latchGateClosed(gate);
    if (backend) killGroup(backend.pid);
    backend = null;
    throw error;
  } finally {
    if (backend) killGroup(backend.pid);
    gate.endRepetition();
  }
}
