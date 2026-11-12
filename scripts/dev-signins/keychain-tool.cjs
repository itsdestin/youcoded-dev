// keychain-tool.cjs — a tiny Electron program that locks or unlocks text with the system keychain, under a chosen app name.
//
// WHY (card #17): saved API keys and the ChatGPT sign-in are stored locked by the system keychain (Electron safeStorage). To
// lend them to a test copy WITHOUT handing over the real files, the launcher must unlock the real app's copy and lock a
// changed copy for the test app. Electron fixes the keychain identity from the app name at startup, so this runs once per
// name. It mirrors the app's own helper (desktop/src/main/providers/keychain-helper.ts): scratch browser folder, no window,
// no files, no network, no logging of values.
//
// Run:  electron keychain-tool.cjs --password-store=<backend> --user-data-dir=<scratch>
// Env:  KEYCHAIN_TOOL_NAME=<app name>  KEYCHAIN_TOOL_SCRATCH=<empty private folder>  KEYCHAIN_TOOL_OUT=<answer file>
// Stdin (JSON):  { "op": "decrypt" | "encrypt" | "backend", "values": ["<base64 or text>", …] }
// Answer file (JSON, mode 600): { "ok": true, "backend": "kwallet6", "values": [ "<text or base64>" | null, … ] }
//   (null = that one failed). WHY a file, not stdout: Electron can exit before a piped stdout is flushed — the first
//   probe of this tool came back empty that way (2026-11-11).
const { app, safeStorage } = require('electron');
const name = process.env.KEYCHAIN_TOOL_NAME;
const scratch = process.env.KEYCHAIN_TOOL_SCRATCH;
const outFile = process.env.KEYCHAIN_TOOL_OUT;
if (!name || !scratch || !outFile) { app.exit(2); }
// WHY before readiness: same reason as keychain-helper.ts — the name is snapshotted into the keychain setup during startup.
app.setName(name);
app.setPath('userData', scratch);
app.setPath('sessionData', scratch);
// Never let an error dialog or a stack trace (which could carry a value) appear.
process.on('uncaughtException', () => app.exit(1));
process.on('unhandledRejection', () => app.exit(1));
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  app.whenReady().then(() => {
    const req = JSON.parse(input);
    let backend = 'unknown';
    try { backend = safeStorage.getSelectedStorageBackend(); } catch { /* not on Linux */ }
    // WHY refuse basic_text: that "backend" is a fixed built-in password, i.e. no protection — the app refuses it too.
    const usable = safeStorage.isEncryptionAvailable() && backend !== 'basic_text';
    const values = (req.values || []).map((v) => {
      if (!usable || req.op === 'backend') return null;
      try {
        return req.op === 'encrypt'
          ? safeStorage.encryptString(v).toString('base64')
          : safeStorage.decryptString(Buffer.from(v, 'base64'));
      } catch { return null; }
    });
    require('fs').writeFileSync(outFile, JSON.stringify({ ok: usable, backend, values }), { mode: 0o600 });
    app.exit(0);
  }).catch(() => app.exit(1));
});
