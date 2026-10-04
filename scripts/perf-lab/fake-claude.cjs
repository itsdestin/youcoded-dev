#!/usr/bin/env node
// perf-lab fake `claude`: stands in for Claude Code so the app can be exercised
// with ZERO API spend. It does exactly what the app needs from CC at startup —
// one SessionStart hook message on the desktop pipe (byte-for-byte what
// hook-scripts/relay.js would send) carrying session_id + transcript_path —
// then idles until killed. The rig "streams a conversation" by appending JSONL
// lines to transcript_path; the app's TranscriptWatcher tails it exactly as it
// would a real CC session.
//
// CommonJS on purpose: it is copied to <fixture>/bin/claude and run as a plain
// script via the shebang, with no package.json anywhere near it to declare
// "type": "module". The app resolves the bare name `claude` off PATH
// (pty-worker.js:49-63 resolveCommand) and passes CLAUDE_DESKTOP_SESSION_ID +
// CLAUDE_DESKTOP_PIPE in the child env (pty-worker.js:252-259).
const net = require('node:net');
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');
const crypto = require('node:crypto');

// Argv the app actually passes (session-manager.ts:118-127), in this order:
// --dangerously-skip-permissions, --resume <id>, --model <id>. Only --resume
// matters here; the rest are accepted and ignored, like extra CC flags.
const args = process.argv.slice(2);

// `claude auth status` — a ONE-SHOT subcommand, not a session. It must print JSON
// and EXIT, because the app blocks its first contentful paint on it.
//
// WHY this matters enough to hardcode: on a normal (setup-complete) boot the
// renderer's whole UI is gated behind window.claude.firstRun.getState()
// (App.tsx:472-488), whose main-process handler calls detectAuth()
// (main.ts:887 -> prerequisite-installer.ts:457), which runs `claude auth status`
// and awaits its stdout. While that is outstanding App renders an EMPTY div
// (App.tsx:2669-2672), so nothing contentful paints.
//
// The first version of this fake ignored argv and idled forever, so that IPC never
// returned and the app fell through to its 3-second safety timeout on EVERY boot.
// Measured: first-paint 148ms, first-contentful-paint 3300ms, with only 61ms of
// long tasks in between — the renderer was idle, waiting on us. That made
// blankWindowMs (a PRIMARY, hard-reject metric) an artefact of the rig rather than
// a property of the app. Answering promptly here measures the app instead.
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ loggedIn: true, email: 'perf-lab@example.invalid' }) + '\n');
  process.exit(0);
}

const ri = args.indexOf('--resume');
const resuming = ri >= 0 && !!args[ri + 1];
const sessionId = resuming ? args[ri + 1] : crypto.randomUUID();

const cwd = process.cwd();
// ccProjectSlug (slug-encoding.ts:44-48): every non-alphanumeric becomes '-'.
// Fixture cwds are POSIX and far under CC_SLUG_MAX, so no hash tail is needed.
const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');
const home = process.env.HOME || os.homedir();
const dir = path.join(home, '.claude', 'projects', slug);
fs.mkdirSync(dir, { recursive: true });
const transcript = path.join(dir, `${sessionId}.jsonl`);
// Never truncate: on --resume the transcript is the fixture's pre-built history,
// and clobbering it would silently zero every history measurement.
if (!fs.existsSync(transcript)) fs.writeFileSync(transcript, '');

// The payload shape the app's HookRelay parses (hook-relay.ts:29-37) and its
// SessionStart consumer reads (ipc-handlers.ts:2821-2905): session_id, the
// hook_event_name that gates a remap, `source` (startup|resume|clear|compact —
// resolveMappingAction in session-id-mapping.ts refuses a `startup` that would
// repoint an already-mapped session), plus transcript_path and cwd, which are
// what TranscriptWatcher.startWatching is pointed at.
const payload = {
  hook_event_name: 'SessionStart',
  session_id: sessionId,
  source: resuming ? 'resume' : 'startup',
  transcript_path: transcript,
  cwd,
};
// relay.js only injects this key when the env var is set — match that, since an
// empty string would make HookRelay fall back to CC's own session_id as the
// DESKTOP id and map the wrong session.
if (process.env.CLAUDE_DESKTOP_SESSION_ID) {
  payload._desktop_session_id = process.env.CLAUDE_DESKTOP_SESSION_ID;
}
if (process.env.CLAUDE_DESKTOP_PIPE) {
  const c = net.createConnection(process.env.CLAUDE_DESKTOP_PIPE, () => {
    c.end(JSON.stringify(payload) + '\n');
  });
  // A dead/missing pipe must not crash the fake — a crashed `claude` would look
  // like a broken app instead of a broken rig.
  c.on('error', () => {});
}

// Enough of a TUI that the app's PTY plumbing sees a live child: clear screen,
// print a prompt, echo whatever is typed (the submit protocol in pty-worker.js
// waits for its own bytes to echo back before sending the CR).
process.stdout.write(`\x1b[2Jfake claude ${sessionId.slice(0, 8)} ready\r\n> `);

// ── Terminal glyph fill (added 2026-09-10 for scenario-terminal.mjs) ─────────
// WHY: the terminal scenario measures the glyph-atlas heal, whose cost is
// re-rasterising the glyphs each open terminal is showing. A terminal that only
// ever says "fake claude … ready" has ~20 glyphs in its atlas, so the heal would
// look free. The terminal view shows THIS process's PTY, not a shell, so the
// brief's "run `seq 1 2000` in each" cannot be typed anywhere real. Instead the
// scenario types one line, `perf-lab-glyphs <n>`, into each session's PTY and
// this prints n lines of mixed glyphs: printable ASCII, the box-drawing and
// status symbols Claude Code's TUI draws, in seven colours with bold every fifth
// line (the atlas keys each glyph by colour and weight too).
//
// Only a line that is the command and nothing else — leading/trailing whitespace
// is ignored (the line is trimmed), any other text on it is not — does anything, so
// every other scenario, which never types it, sees the byte-for-byte echo it always had.
// The final line is a fixed sentinel the scenario waits for instead of sleeping.
const GLYPH_CMD = /^perf-lab-glyphs (\d{1,5})$/;
const GLYPH_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const GLYPH_TUI = '─│╭╮╰╯├┤●○✓✗⏺▶◆…';
function glyphFill(n) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const off = (i * 7) % GLYPH_ASCII.length;
    const ascii = (GLYPH_ASCII + GLYPH_ASCII).slice(off, off + 64);
    const sgr = `\x1b[${i % 5 === 0 ? '1;' : ''}3${1 + (i % 7)}m`;
    lines.push(`${sgr}${String(i + 1).padStart(5, '0')} ${ascii} ${GLYPH_TUI}\x1b[0m`);
  }
  return `\r\n${lines.join('\r\n')}\r\n[perf-lab] glyph fill complete: ${n} lines\r\n> `;
}
let lineBuf = '';
let activeFlood = null;
let inkFinal = null;      // set once the Ink-style animation finished (perf-lab-flood-modes)
process.on('SIGWINCH', () => { if (inkFinal) { try { fs.writeSync(1, Buffer.from('\x1b[5A\x1b[0J' + inkFinal(-1))); } catch { /* pty full */ } } });

process.stdin.resume();
process.stdin.on('data', (buf) => {
  const text = buf.toString();
  try { process.stdout.write(text); } catch { /* pipe closed */ }
  // The PTY runs in canonical mode, so a submitted line arrives ending in \n
  // (the tty maps the typed \r); split on either so raw mode would work too.
  lineBuf += text;
  const parts = lineBuf.split(/\r\n|\r|\n/);
  lineBuf = parts.pop();
  for (const line of parts) {
    const m = GLYPH_CMD.exec(line.trim());
    if (m) {
      const n = Math.min(Number(m[1]), 20000);
      try {
        // WHY: the burst rig needs a producer-side clock; a CDP send acknowledgment
        // is not an output-emission timestamp. This file exists only in fixture HOME.
        const marker = path.join(home, '.claude', 'perf-terminal-emissions.jsonl');
        const payload = glyphFill(n);
        // Timestamp AFTER generating the bytes. Fixture marker's synchronous
        // append still sits between timestamp and stdout.write; report that cost.
        fs.appendFileSync(marker, JSON.stringify({ n, startedAt: Date.now() }) + '\n');
        process.stdout.write(payload, () => {
          try { fs.appendFileSync(marker, JSON.stringify({ n, finishedAt: Date.now() }) + '\n'); } catch { /* fixture may be gone */ }
        });
      } catch { /* pipe closed */ }
    }
  }
  // WHY (2026-10-04): the glyph fill is one bounded write (<= ~1.8 MB). A noisy
  // build log or `yes` is a SUSTAINED producer that only pauses when the pipe is
  // full, which is the case the app has no brake for. `perf-lab-flood <mb>` emits
  // that: 64 KB chunks, honouring stdout backpressure like a real program does.
  for (const line of parts) {
    const f = /^perf-lab-flood(-modes)? (\d{1,3})(?: (\d{1,3}))?$/.exec(line.trim());
    if (!f) continue;
    const modesRun = !!f[1];
    const mb = Number(f[2]);
    // Optional 2nd number = pace in MB/s (omitted = as fast as the pty accepts, the original behaviour).
    const rate = f[3] ? Number(f[3]) : 0;
    const row = `\x1b[32mbuild:\x1b[0m compiling module ${'x'.repeat(72)} ok\r\n`;
    const chunk = row.repeat(Math.ceil(65536 / row.length));
    // WHY writeSync and not stdout.write + 'drain': the first version stopped at
    // 17.8 of 40 MB with the app idle — a 'drain' that never came, i.e. the
    // producer stalled itself and the run blamed the app. A blocking write is also
    // what `yes` or a compiler does. EAGAIN (non-blocking tty) retries a tick later.
    let left = mb * 1024 * 1024, off = 0;
    const buf = Buffer.from(chunk), tail = Buffer.from(`\r\n[perf-lab] flood complete: ${mb} MB\r\n> `);
    let tailOff = 0;
    // WHY producer-side log (2026-10-04): a 200 MB flood once stopped arriving at ~48 MB and
    // the rig could not tell "the app stopped reading" from "this producer died silently"
    // (the catch below used to swallow every non-EAGAIN error). Now every ~250 ms the
    // producer appends how many bytes it has WRITTEN, how many EAGAIN retries it needed and
    // any other error code, to the same fixture-only file the glyph command uses. A line
    // that stops appearing while the process is alive = it is blocked in write().
    const total = mb * 1024 * 1024;
    const marker = path.join(home, '.claude', 'perf-terminal-emissions.jsonl');
    const t0 = Date.now(); let lastLog = 0, eagain = 0, otherErr = null;
    const log = (extra) => {
      try { fs.appendFileSync(marker, JSON.stringify({ flood: mb, t: Date.now(), sinceStartMs: Date.now() - t0, written: total - left, eagain, ...extra }) + '\n'); } catch { /* fixture may be gone */ }
    };
    log({ event: 'start' });
    // WHY (2026-10-04, terminal flow control): Ctrl+C during a flood must stop THIS producer the way it
    // stops `yes` or a build, and leave the session alive, so the rig can time "Ctrl+C to the prompt".
    // Everywhere else SIGINT still exits (below). `activeFlood` is read by the SIGINT handler.
    // `perf-lab-flood-modes`: the terminal starts with bracketed paste OFF and the cursor VISIBLE, and a quarter of the way
    // through the flood the program turns paste ON and hides the cursor — a state set once and never repeated, deep inside
    // the part of a backlog that a cut throws away. The perf rig then checks the terminal still has those modes.
    let modesInjected = !modesRun;
    if (modesRun) { try { fs.writeSync(1, Buffer.from('\x1b[?2004l\x1b[?25h')); } catch { /* pty full: the rig reads the result either way */ } }
    const state = { aborted: false, finished: false };
    activeFlood = state;
    // WHY time-sliced (2026-10-04, review round 3): a blocking write to a full pty waits for the app to drain it, and 64 blocking
    // 64 KB writes in one turn of the event loop took ~8 s while a hidden terminal drained at 0.5 MB/s — stdin was not
    // read for that long, so "type a command into the flooding terminal" looked like a stalled reply. It was this producer,
    // not the app. A turn now ends after ~40 ms of writing, so stdin is read between slices (like a real interactive program).
    const pump = () => {
      if (state.aborted) return;
      const sliceStart = Date.now();
      try {
        for (let i = 0; i < 64 && left > 0 && Date.now() - sliceStart < 40; i++) {
          if (!modesInjected && (total - left) >= total / 4) { fs.writeSync(1, Buffer.from('\x1b[?2004h\x1b[?25l')); modesInjected = true; }
          if (rate > 0 && (total - left) > rate * 1048576 * ((Date.now() - t0) / 1000 + 0.02)) return void setTimeout(pump, 5);
          const w = fs.writeSync(1, buf, off, Math.min(buf.length - off, left));
          off = (off + w) % buf.length; left -= w;
          if (Date.now() - lastLog >= 250) { lastLog = Date.now(); log({ event: 'progress' }); }
        }
        if (left > 0) return void setImmediate(pump);
        if (modesRun) {
          // An Ink-style animation as the LAST output: a 5-line frame redrawn in place with RELATIVE cursor moves
          // (up 5, erase to end of screen), ~5 MB of frames, so the part of the backlog a cut keeps begins in the middle
          // of it. The final frame is redrawn on SIGWINCH (the app's repaint nudge) the way Ink does.
          const frame = n => Array.from({ length: 5 }, (_, k) => `\x1b[36m| FRAME ${n === -1 ? 'FINAL' : n} line ${k + 1} ${'-'.repeat(30)}\x1b[0m\r\n`).join('');
          let out = `\r\n[perf-lab] flood complete: ${mb} MB\r\n` + frame(0);
          const flushOut = () => { const b = Buffer.from(out); let o = 0; while (o < b.length) o += fs.writeSync(1, b, o, b.length - o); out = ''; };
          for (let n = 1; n <= 20000; n++) { out += '\x1b[5A\x1b[0J' + frame(n); if (out.length > 60000) flushOut(); }
          out += '\x1b[5A\x1b[0J' + frame(-1); flushOut();
          inkFinal = frame;
        } else {
          while (tailOff < tail.length) tailOff += fs.writeSync(1, tail, tailOff, tail.length - tailOff);
        }
        state.finished = true;
        log({ event: 'done' });
      } catch (e) {
        if (e && e.code === 'EAGAIN') {
          eagain++;
          if (Date.now() - lastLog >= 250) { lastLog = Date.now(); log({ event: 'progress' }); }
          return void setTimeout(pump, 1);
        }
        // Behaviour unchanged (the pump still stops), but it is no longer silent.
        otherErr = e && (e.code || String(e));
        log({ event: 'error', code: otherErr, message: String(e && e.message) });
      }
    };
    pump();
  }
  // A line that never ends must not grow without bound.
  if (lineBuf.length > 4096) lineBuf = lineBuf.slice(-256);
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGHUP', () => process.exit(0));
process.on('SIGINT', () => {
  if (activeFlood && !activeFlood.finished && !activeFlood.aborted) {
    activeFlood.aborted = true;
    // Queued write: if the pty is full of the flood just stopped it waits its turn instead of spinning.
    try { process.stdout.write('^C\r\n[perf-lab] flood interrupted\r\n> '); } catch { /* pipe closed */ }
    try { fs.appendFileSync(path.join(home, '.claude', 'perf-terminal-emissions.jsonl'), JSON.stringify({ event: 'interrupted', t: Date.now() }) + '\n'); } catch { /* fixture gone */ }
    return;
  }
  process.exit(0);
});
setInterval(() => {}, 1 << 30);   // stay alive until killed
