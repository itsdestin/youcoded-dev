// scripts/perf-lab/hops.mjs — watches the terminal-output pipeline from OUTSIDE the app,
// using only /proc and the fixture's own files (no app source edits, no inspector).
//
// WHY: terminal output passes producer (fake claude) -> pseudo-terminal -> pty-worker
// (node) -> Node IPC -> main process -> Electron IPC -> renderer. A flood that "stops
// arriving" could have stopped at any of those. For each process on that path this
// samples, every `everyMs`: resident memory (VmRSS), CPU ticks, run state, the kernel's
// "what is it waiting on" (wchan), and cumulative bytes read/written (/proc/<pid>/io
// rchar/wchar). Bytes written by the pty-worker vs bytes the renderer counted shows
// where the bytes stop; a growing RSS on the pty-worker means main is not draining it.
//
// Linux only. Reads processes the rig started (own fixture HOME / own package path).
import { readFileSync, readdirSync } from 'node:fs';
import { findFamily } from './procs.mjs';

const read = (p) => { try { return readFileSync(p, 'latin1'); } catch { return null; } };
const cmd = (pid) => (read(`/proc/${pid}/cmdline`) ?? '').replace(/\0/g, ' ');
const ppid = (pid) => { const s = read(`/proc/${pid}/stat`); return s ? Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]) : null; };
const envOf = (pid) => read(`/proc/${pid}/environ`) ?? '';

/** Classify the rig's processes. Returns { main, renderers[], gpu[], ptyWorkers[], fakeClaudes:{sessionId:pid} }. */
export function classify(app) {
  const pids = app.family();
  const out = { main: app.pid, renderers: [], gpu: [], utility: [], ptyWorkers: [], fakeClaudes: {} };
  for (const pid of pids) {
    const c = cmd(pid);
    const t = /--type=([a-z-]+)/.exec(c)?.[1];
    if (t === 'renderer') out.renderers.push(pid);
    else if (t === 'gpu-process') out.gpu.push(pid);
    else if (t === 'utility') out.utility.push(pid);
    else if (!t && c.includes('pty-worker')) out.ptyWorkers.push(pid);
    else if (!t && /bin\/claude/.test(c)) {
      const m = /CLAUDE_DESKTOP_SESSION_ID=([^\0]+)/.exec(envOf(pid));
      if (m) out.fakeClaudes[m[1]] = pid;
    }
  }
  return out;
}

function sample(pid) {
  const st = read(`/proc/${pid}/stat`);
  if (!st) return null;
  const f = st.slice(st.lastIndexOf(')') + 2).split(' ');
  const status = read(`/proc/${pid}/status`) ?? '';
  const io = read(`/proc/${pid}/io`);
  const num = (re, s) => { const m = re.exec(s ?? ''); return m ? Number(m[1]) : null; };
  return {
    state: f[0], ticks: Number(f[11]) + Number(f[12]),
    rssMb: Math.round((num(/VmRSS:\s+(\d+) kB/, status) ?? 0) / 102.4) / 10,
    wchan: (read(`/proc/${pid}/wchan`) ?? '').trim() || null,
    rchar: num(/rchar: (\d+)/, io), wchar: num(/wchar: (\d+)/, io),
  };
}

/**
 * Start sampling. `ids` names the processes to watch: main, the session's pty-worker and
 * fake claude, every renderer, and the GPU process. Call .stop() for the rows.
 */
export function startHops(app, sessionId, { everyMs = 250, ptyWorkerPid = null } = {}) {
  const c = classify(app);
  const fake = c.fakeClaudes[sessionId] ?? null;
  const worker = ptyWorkerPid ?? (fake ? ppid(fake) : null);
  const watch = { main: c.main, ptyWorker: worker, fakeClaude: fake, ...Object.fromEntries(c.renderers.map((p, i) => [`renderer${i}`, p])), ...Object.fromEntries(c.gpu.map((p, i) => [`gpu${i}`, p])) };
  const rows = []; const t0 = Date.now();
  const tick = () => {
    const row = { t: Date.now() - t0, at: Date.now() };
    for (const [k, pid] of Object.entries(watch)) if (pid) row[k] = sample(pid) ?? { gone: true };
    rows.push(row);
  };
  tick();
  const timer = setInterval(tick, everyMs);
  return { watch, stop() { clearInterval(timer); tick(); return rows; }, rows };
}

/** Compact the rows to a readable timeline: per sample, MB and state for each watched process. */
export function summariseHops(rows, hz = 100) {
  const keys = Object.keys(rows[0] ?? {}).filter((k) => k !== 't' && k !== 'at');
  const peak = {}, first = {}, last = {};
  for (const k of keys) {
    const vals = rows.map((r) => r[k]).filter((v) => v && !v.gone);
    if (!vals.length) continue;
    first[k] = vals[0].rssMb; last[k] = vals.at(-1).rssMb; peak[k] = Math.max(...vals.map((v) => v.rssMb));
  }
  const gone = {}; for (const k of keys) { const g = rows.find((r) => r[k]?.gone); if (g) gone[k] = g.t; }
  const timeline = rows.map((r) => {
    const o = { t: r.t };
    for (const k of keys) { const v = r[k]; if (!v) continue; o[k] = v.gone ? 'GONE' : { mb: v.rssMb, st: v.state, w: v.wchan, r: v.rchar, wr: v.wchar }; }
    return o;
  });
  return { rssMbFirst: first, rssMbPeak: peak, rssMbLast: last, goneAtMs: gone, samples: rows.length, hz, timeline };
}

export function readEmissions(home) {
  try { return readFileSync(`${home}/.claude/perf-terminal-emissions.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s)); } catch { return []; }
}
export { findFamily, readdirSync };

// ── Main-process counters through the rig-owned app's OWN inspector ────────────
// WHY: /proc cannot say how many characters the main process HANDED to the renderer.
// The packaged private app is launched with --inspect=<port>; this patches two methods
// IN MEMORY of that one rig-owned process (nothing on disk, no app source touched):
//   - webContents.send            -> chars + calls per channel prefix ('pty:output:*')
//   - ChildProcess emit('message') -> chars + calls of {type:'data'} frames per worker pid
// so "worker -> main -> renderer" can be compared hop by hop. Never aimed at the live app.
import { connect } from './cdp.mjs';
const HOOK = `(() => {
  const req = process.mainModule?.require ?? (typeof require === 'function' ? require : null);
  if (!req) return { error: 'no require in main' };
  if (globalThis.__hopCounters) return { ok: 'already' };
  const { webContents } = req('electron'); const cp = req('child_process');
  const c = { send: { chars: 0, calls: 0, lastAt: null, firstAt: null, big: 0 }, worker: {}, sendQueueMs: [] };
  const wcs = () => webContents.getAllWebContents();
  const patchWc = (wc) => {
    if (wc.__hop) return; wc.__hop = true;
    const orig = wc.send;
    wc.send = function (ch, ...a) {
      if (typeof ch === 'string' && ch.startsWith('pty:output:')) {
        const n = typeof a[0] === 'string' ? a[0].length : 0; const now = Date.now();
        c.send.chars += n; c.send.calls++; c.send.lastAt = now; if (c.send.firstAt === null) c.send.firstAt = now; if (n > 65536) c.send.big++;
      }
      return orig.apply(this, [ch, ...a]);
    };
  };
  wcs().forEach(patchWc);
  const origEmit = cp.ChildProcess.prototype.emit;
  cp.ChildProcess.prototype.emit = function (ev, msg) {
    if (ev === 'message' && msg && msg.type === 'data') {
      const w = (c.worker[this.pid] ??= { chars: 0, calls: 0, lastAt: null });
      w.chars += typeof msg.data === 'string' ? msg.data.length : 0; w.calls++; w.lastAt = Date.now();
    }
    return origEmit.apply(this, arguments);
  };
  c.read = () => JSON.parse(JSON.stringify({ send: c.send, worker: c.worker, now: Date.now(), wcCount: wcs().length }));
  c.reset = () => { c.send = { chars: 0, calls: 0, lastAt: null, firstAt: null, big: 0 }; c.worker = {}; };
  globalThis.__hopCounters = c;
  return { ok: true, windows: wcs().length };
})()`;

export async function attachMainCounters(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = targets.find((x) => x.webSocketDebuggerUrl);
  if (!t) throw new Error('no main-process inspector target');
  const cdp = await connect(t.webSocketDebuggerUrl);
  const r = await cdp.evaluate(HOOK);
  if (r?.error) throw new Error(r.error);
  return {
    hook: r,
    read: () => cdp.evaluate('globalThis.__hopCounters.read()'),
    reset: () => cdp.evaluate('globalThis.__hopCounters.reset(); true'),
    // The app may open new windows; patch any that appeared since.
    repatch: () => cdp.evaluate(HOOK.replace("if (globalThis.__hopCounters) return { ok: 'already' };", '')) ,
    close: () => cdp.close(),
  };
}
