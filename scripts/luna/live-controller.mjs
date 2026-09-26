import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const integer = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

/** WHY: CLI JSON carries raw assistant text and real session identifiers; keep only numeric usage in memory. */
export function sanitizeOpenCodeEvent(line) {
  let event;
  try { event = JSON.parse(line); } catch { return null; }
  if (event?.type !== 'step_finish' || event.part?.type !== 'step-finish') return null;
  const token = event.part.tokens;
  if (!token || integer(token.input) === null || integer(token.output) === null) return null;
  const read = integer(token.cache?.read);
  const write = integer(token.cache?.write);
  const reasoning = integer(token.reasoning);
  // WHY: the pinned OpenCode mapper turns an absent provider cache count into 0.
  // A positive value proves reporting; zero cannot distinguish a miss from missing data.
  return {
    type: 'step_finish',
    inputTokens: read === null || read === 0 ? null : token.input + read + (write ?? 0),
    outputTokens: reasoning === null ? null : token.output + reasoning,
    cacheReadTokens: read === 0 ? null : read,
    cacheWriteTokens: write === 0 ? null : write,
    reasoningTokens: reasoning,
  };
}

/** WHY: never launch a model with a normal home, unset guard, or a guessed fixture root. */
export function assertIsolatedEnvironment(env, root) {
  const required = ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'LUNA_FIXTURE_ROOT'];
  if (env.YOUCODED_LUNA_EXPERIMENT !== '1' || env.OPENCODE_PURE !== '1') throw new Error('Luna isolation flags missing');
  if (!required.every((key) => env[key] && path.isAbsolute(env[key]))) throw new Error('Private absolute home/state paths required');
  const privateRoot = realpathSync(path.dirname(env.HOME));
  if (privateRoot === os.homedir() || privateRoot.startsWith(`${os.homedir()}${path.sep}`) && !privateRoot.includes('youcoded-luna-experiment')) throw new Error('Non-private home');
  for (const key of required.slice(0, 6)) {
    const real = realpathSync(env[key]);
    if (real !== privateRoot && !real.startsWith(`${privateRoot}${path.sep}`)) throw new Error(`Path outside private state: ${key}`);
  }
  if (realpathSync(root) !== root || env.LUNA_FIXTURE_ROOT !== root) throw new Error('Wrong fixture root');
  const url = new URL(env.LUNA_GUARD_URL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/') throw new Error('Invalid guard URL');
}

/** WHY: kill the isolated process tree, not merely the CLI parent, on the approved wall-clock ceiling. */
export function runBounded(binary, args, { cwd, env, timeoutMs, onLine = () => {}, maxBytes = 1024 * 1024 }) {
  if (process.platform !== 'linux' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Linux and bounded timeout required');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let timedOut = false;
    let total = 0;
    let buffer = '';
    let stderrBytes = 0;
    const killTree = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) { timedOut = true; killTree(); return; }
      buffer += chunk.toString('utf8');
      let next;
      while ((next = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, next);
        buffer = buffer.slice(next + 1);
        try { onLine(line); } catch { timedOut = true; killTree(); }
      }
    });
    child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; if (stderrBytes > maxBytes) { timedOut = true; killTree(); } });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ pid: child.pid, code, signal, timedOut, stderrBytes });
    });
  });
}
