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
process.stdin.resume();
process.stdin.on('data', (buf) => {
  try { process.stdout.write(buf.toString()); } catch { /* pipe closed */ }
});
for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, () => process.exit(0));
setInterval(() => {}, 1 << 30);   // stay alive until killed
