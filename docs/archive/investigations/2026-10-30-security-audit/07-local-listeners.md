# 07 - Local listeners, IPC endpoints and "can another program or a website take control of YouCoded?"

Scope: desktop app (youcoded/desktop/src/main, hook-scripts, electron-builder.yml). Static analysis only, plus read-only `ss`/`ls`/`stat` and one read of the installed binary's fuse bytes. No port was connected to. Paths below are relative to `youcoded/desktop/` unless stated.

## Bottom line
No finding lets a website or an unrelated program take over the app on a normal single-user machine. Every TCP listener is either loopback-only with a per-run random secret, or bound to the Tailscale address only behind a password. The weak spots are (1) the local llama.cpp model server, which has no password, (2) Electron "fuses" never configured, (3) a few predictable shared-/tmp names that matter only on multi-user computers, (4) password-guessing speed on the opt-in remote-access server.

## Inventory of every listener / endpoint

| # | Endpoint | Bind | Auth | Source |
|---|---|---|---|---|
| 1 | Remote-access HTTP+WebSocket (phone/browser), default port 9900, opt-in | Tailscale IP only; refuses to start with no Tailscale (never 0.0.0.0). Live check: `100.111.147.124:9900` | Password (bcrypt, 10 rounds) or paired-device secret as first WS message; Origin check; 64-socket pre-auth cap | src/main/remote-server.ts:407-410, 536; remote-origin.ts |
| 2 | Same server in "local mode" (Android only) | 127.0.0.1 | per-run token, constant-time compare | remote-server.ts:376-378, 896-904; remote-local.ts |
| 3 | Claude control bridge (HTTP) | 127.0.0.1, ephemeral port | 256-bit per-session Bearer secret + Host must equal `127.0.0.1:<port>` + Origin must be absent + remoteAddress check | claude-control-bridge.ts:147-153, 253-259 |
| 4 | Hook relay (unix socket / Windows pipe) | `$XDG_RUNTIME_DIR/youcoded/claude-desktop-hooks-<pid>.sock` (dir 0700); /tmp fallback; Windows `\\.\pipe\claude-desktop-hooks-<pid>` | None beyond filesystem permission (socket 0755 = others cannot connect) | hook-relay.ts:30-42, 191, 325 |
| 5 | Browser MCP relay (unix socket) | `$XDG_RUNTIME_DIR/youcoded` or `/tmp/yc-<uid>`, dir chmod 0700, socket chmod 0600 | per-run 24-byte token (timingSafeEqual) + must be a live Claude Code session id | assistant-browser/claude-code-browser-mcp.ts:183-232 |
| 6 | Askpass (sudo password helper) socket | `$XDG_RUNTIME_DIR/youcoded/askpass-<pid>.sock`, 0700 dir, 0600 socket | Kernel peer-pid verification (SO_PEERCRED) with a startup self-test; refuses to start if the self-test fails | harness/askpass/askpass-server.ts:219-285 |
| 7 | Local model server (llama-server) | 127.0.0.1:9920 (dev 9970) | NONE (see F1) | engine/engine-supervisor.ts:640; shared/ports.ts:13 |
| 8 | OpenRouter sign-in callback | 127.0.0.1 random port, short-lived, random path | PKCE + 128-bit random path | providers/openrouter-oauth.ts:60-66, 138 |
| 9 | ChatGPT sign-in callback | 127.0.0.1, short-lived | `state` must match, PKCE | providers/chatgpt-auth.ts:101, 251-254, 793 |
| 10 | Vite dev server | 127.0.0.1:5173+offset, dev builds only | none (dev only) | vite.config.ts; main.ts:383 |
| 11 | Chromium remote-debugging port | only if `!app.isPackaged && YOUCODED_DEVTOOLS_PORT` | n/a - never in packaged builds | main.ts:1293-1295 |

Not listeners (checked, no TCP/unix socket opened): the three MCP servers SendUserLink (claude-code-mcp.ts), Pages (claude-code-pages-mcp.ts) and Doc-comments (claude-code-doc-comments-mcp.ts) are stdio programs spawned by Claude Code. Office uses the in-process `office:` custom protocol (office/office-protocol.ts:192) - no x2t/editor TCP server. Pages, Plaid, Home Assistant, voice, presence and sync-hub are outbound clients (grep for listen/createServer found none). The assistant browser uses Playwright's pipe transport, not a debugging port (assistant-browser/browser-service.ts:412-433; no `--remote-debugging-port`).

Deep links / argv: there is NO `setAsDefaultProtocolClient`, no `open-url`, no `requestSingleInstanceLock` (only a stub in headless/electron-headless.ts:72), no `second-instance` handler, no `fileAssociations`/`protocols` in electron-builder.yml, and the installed `youcoded.desktop` has an Exec with `%U` but no MimeType. A `youcoded://` link or a double-clicked file therefore does nothing. (Side effect: a second launch starts a second full app instead of focusing the first - UX only.) `process.argv` is read only by internal worker processes.

---

## Findings

### F1 - Local model server (llama-server, port 9920) has no password; any website or local program can use it
- Severity: Medium (possible free use of the user's GPU, and likely reading what the local model is doing; no code execution found).
- Precondition: user has the local-model engine running; victim visits a hostile web page, or any local program runs. Fixed, well-known port 9920 built / 9970 dev.
- Steps: a page (or program) sends requests to `http://127.0.0.1:9920/v1/chat/completions`, `/props`, `/models`, `/models/load`, `/models/unload`, `/slots`. The spawn command line has `--host 127.0.0.1 --port <fixed>` and no `--api-key`/`--api-key-file`; the app's own calls (engine-manager.ts:711, 1517, 1814, 1983) send no Authorization header, confirming nothing is required.
- Evidence: engine/engine-supervisor.ts:640 (args), shared/ports.ts:13 (fixed port), engine/engine-pin.ts:90 (api-key flags are known and stripped, i.e. deliberately unused). Live: `ss` shows llama-server on 127.0.0.1:9920.
- Existing mitigation: loopback-only; `--no-webui`. Browsers block cross-site reads by default, BUT llama.cpp's server is known to answer cross-origin requests permissively and does no Host-header check, so a web page (or a DNS-rebinding page) can plausibly both send and read replies. I could not run it (forbidden) and the llama.cpp CORS behaviour is from my knowledge of that project, not from this repo.
- Confidence: Confirmed (no auth); Likely (cross-site read); impact on private data in the model's slots Speculative.
- Fix: pass a random per-run `--api-key` (or `--api-key-file` with a 0600 file) and send it from the app; use a random free port instead of fixed 9920; optionally verify with a test that a bare request returns 401.

### F2 - Electron fuses are never set; the shipped binary has every default (dangerous ones) enabled
- Severity: Medium for hardening/defence-in-depth (needs the attacker to already run code as the user, so it is not a remote takeover).
- Evidence: no `@electron/fuses`, `flipFuses`, `electronFuses` or `afterPack` anywhere in the repo (rg over desktop/, scripts, package.json, electron-builder*.yml). I read the fuse sentinel in the installed `/opt/YouCoded/youcoded`: wire bytes `1 9 101100011`, i.e. RunAsNode=ON, CookieEncryption=OFF, NodeOptionsEnvironmentVariable=ON, NodeCliInspectArguments=ON, EmbeddedAsarIntegrityValidation=OFF, OnlyLoadAppFromAsar=OFF, LoadBrowserProcessSpecificV8Snapshot=OFF, GrantFileProtocolExtraPrivileges=ON.
- Consequences: (a) any program can run arbitrary JS using the signed YouCoded binary with `ELECTRON_RUN_AS_NODE=1` (a "living off the land" trick; on macOS the child inherits the app's microphone permission); (b) `--inspect`/`NODE_OPTIONS` are accepted by the packaged binary; (c) an unpacked `resources/app/` folder is loaded in preference to app.asar and app.asar is not integrity-checked, so on Windows (per-user install folder, user-writable) a dropped folder persists code inside the trusted signed app.
- Constraint found: the app itself USES RunAsNode (askpass wrapper scripts/askpass/youcoded-askpass:93, pages/page-program.ts:32, assistant-browser/browser-installer.ts:57, harness/pdf-text.ts), so that one fuse cannot simply be switched off; the others can.
- Existing mitigations: the app scrubs `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS` from child envs it hands out (harness/tools/bash.ts:544-551, providers/keychain-launch.ts:13-14) and the askpass verifier pins the exact env (harness/askpass/verify.ts:159, 290). Dev debugging port is gated on `!app.isPackaged` (main.ts:1293).
- Confidence: Confirmed.
- Fix: add an electron-builder `afterPack` that flips: EnableNodeCliInspectArguments=false, EnableNodeOptionsEnvironmentVariable=false, OnlyLoadAppFromAsar=true, EnableEmbeddedAsarIntegrityValidation=true (needs asar integrity support per platform), EnableCookieEncryption=true. Leave RunAsNode on until those four callers use a dedicated helper/utilityProcess. Test the packaged app on all 3 OSes.

### F3 - Hook scripts fall back to a SHARED, predictable socket name when run outside the app (permission-prompt hijack on multi-user machines)
- Severity: Medium on a shared computer; Low/not applicable on a single-user laptop.
- Preconditions: another account (or sandboxed process with /tmp access) on the same computer; the victim runs `claude` in a normal terminal while the hooks YouCoded installed into the global `~/.claude/settings.json` are active (install-hooks.js:154-182 registers PermissionRequest -> relay-blocking.js for ALL claude sessions).
- Steps: attacker creates a listening socket at `/tmp/claude-desktop-hooks.sock` (Windows: pipe `\\.\pipe\claude-desktop-hooks`) before any legit owner; with no `CLAUDE_DESKTOP_PIPE` set, the script connects there (relay-blocking.js:18, relay.js:5). It receives every hook payload (prompts, commands, file paths) and can reply `{"decision":{"behavior":"allow"}}`, which the script prints as Claude Code's hook decision (relay-blocking.js:57-69) - auto-approving tool use.
- Existing mitigation: inside YouCoded sessions the env var points at the per-pid private path, so this is only the outside-the-app case; if nothing listens the script exits 0 and Claude shows its normal prompt. The app itself never binds the unsuffixed name.
- Confidence: Confirmed by reading; not exploited (cannot test cross-user here).
- Fix: have the scripts refuse the bare shared fallback (exit quietly unless `CLAUDE_DESKTOP_PIPE` is set), or use `$XDG_RUNTIME_DIR/youcoded` and verify the socket owner uid equals the current user before sending.

### F4 - Hook socket falls back to `/tmp/claude-desktop-hooks-<pid>.sock` when no per-user runtime folder exists; squatting is possible
- Severity: Low (needs multi-user Linux without XDG_RUNTIME_DIR, or multi-user Windows).
- Steps: attacker pre-creates a listener at the guessable `<pid>` path; the app's `listen` fails EADDRINUSE, `forceReleasePipe` unlink fails (sticky /tmp), start() throws, and main.ts:1419-1423 only logs the error and goes on; sessions still get `CLAUDE_DESKTOP_PIPE=<that path>` (main.ts:304-306) so hook payloads and permission requests flow to the squatter, which can answer `allow`.
- Evidence: hook-relay.ts:30-42 (fallback), 308-331 (start), 354-364; main.ts:1419-1423.
- Existing mitigation: the Linux default is the 0700 `$XDG_RUNTIME_DIR` path (verified live: `/run/user/1000/youcoded` is `drwx------`, sockets 0755 so others cannot connect); macOS os.tmpdir() is per-user. 
- Confidence: Likely (code path confirmed, not exercised).
- Fix: if `hookRelay.start()` fails, do not pass a pipe name to sessions (or abort hook setup); create a per-run random-named socket inside a verified-0700 directory; check the path is not pre-existing and owned by us (the browser socket-repair helper already has `folderIsSafe`, socket-repair.ts:70-80).

### F5 - Remote-access password guessing is only mildly rate limited
- Severity: Medium when remote access is on and the tailnet is shared/large; Info otherwise.
- Precondition: attacker can reach the Tailscale IP:9900 (another tailnet member/shared node). Remote access is ON on the owner's machine right now (`100.111.147.124:9900` listening).
- Steps: each connection gets one password attempt; the host slows new connections by only 2 s after 25 failures per 60 s, host-wide (remote-server.ts:73-74, 835, 1416-1430). Up to 64 unauthenticated sockets may wait in parallel (line 81), so roughly 30 guesses per second are possible. Minimum length is 8 for new passwords, but shorter existing ones keep working and setting a short one is allowed (flagged only, remote-config.ts:14-18, 121-122). bcrypt cost 10 (remote-config.ts:12). A successful guess gives full control (terminal, approvals, files) via the phone channel table.
- Existing mitigation: Tailscale-only bind (no LAN/Internet exposure), Origin check, constant slowdown, bcrypt.
- Confidence: Confirmed (math from the constants).
- Fix: exponential back-off / temporary lockout per host after N failures, count failures in the 64-socket queue, raise bcrypt cost to 12+, enforce a real minimum (12+ chars or a generated passphrase), optionally show failed-attempt alerts to the owner.

### F6 - Predictable, world-readable temp folders for phone uploads and pasted images
- Severity: Low (multi-user machines only; privacy leak plus tampering).
- Evidence: `os.tmpdir()/claude-desktop-uploads` (upload-store.ts:12-14, ipc/files.ts:39-52) and `claude-desktop-attachments` (ipc/shell.ts:22, 94-100) are created with `mkdir(..., {recursive:true})` and default mode; live listing shows `drwxr-xr-x destin` in /tmp, and files are written with default mode (0644 under umask 022). File names are `Date.now()-<name>` / `paste-<ms>.png`. Another local user can read screenshots/photos/PDFs the user pastes or phone-uploads for one hour, or pre-create the directory (owned by them) so the app writes into a folder they control and can swap the file before Claude reads it (prompt injection).
- Confidence: Confirmed for the modes; squat Likely.
- Fix: put them in a 0700 dir under userData or `$XDG_RUNTIME_DIR`, create with mode 0o700, verify ownership with lstat before use, write files 0600 with `flag: 'wx'` and random names.

### F7 - Secrets and tokens inside the user's config directory use default file modes (0644) for some sensitive-adjacent files
- Severity: Info/Low.
- Evidence: `~/.config/youcoded` itself is 0700 (live listing), so other users cannot reach the files. Inside it, `native-secrets.json`, `chatgpt-account.json`, `page-connections.json`, `device-id.json` are 0644 (secrets in native-secrets.json are OS-keychain encrypted: providers/secrets-store.ts:1-5; on a Linux without a keyring Electron safeStorage may use a weak fallback - not verified here). Remote device list and remote config ARE written 0600 (remote-devices.ts:73, remote-config.ts:143-149). `claude-code-pages-mcp.ts:349-358` writes the config and server in default mode (no secrets in them). 
- Fix: write all files with secrets at 0600, and keep the dir at 0700 explicitly via chmod (not just mkdir mode).

### F8 - Pre-approved Pages read tool follows symlinks (hostile project could expose a JSON file)
- Severity: Low / Speculative.
- Evidence: claude-code-pages-mcp.ts:96-125 reads `<root>/<page>/page.json` and `data.json` via plain readFile (follows symlinks); the two read tools are pre-approved (line ~24). A cloned project's `Pages/x/data.json` could be a symlink to a JSON file elsewhere. It only returns content if the target JSON has a top-level `data` key (readData, line ~127), which limits it greatly.
- Fix: lstat/realpath the page files and require they stay within the Pages root.

### F9 - Info: unauthenticated `/remote-state`, and Origin check allows absent Origin
- `/remote-state` reveals only whether a password is set (remote-server.ts:442-444). Origin absent/null is deliberately allowed because the Android app needs it and every socket still needs the password (remote-origin.ts header). A DNS-rebinding page whose name resolves to the Tailscale IP would pass the Host=Origin check but still needs the password. Severity: Info.

### F10 - Info: control-bridge secret is in the environment of Claude Code and everything it runs
- `YOUCODED_CC_CONTROL_URL/TOKEN` ride in the session environment (claude-control-bridge.ts:98). Code the model runs in that session can therefore type into the same session, the same power it already has. Not an escalation. Same for the Browser MCP token (documented in claude-code-browser-mcp.ts:17-21).

---

## Checked and OK (defences that hold)
- Remote server never binds all interfaces: `start()` throws when Tailscale is down and says why (remote-server.ts:243-244, 385-405, 536).
- Cross-site WebSocket hijack blocked: `verifyClient` -> `isAllowedWsOrigin` (remote-server.ts:481-492; remote-origin.ts:54-67). Opaque/`null` origin allowed on purpose and shown safe because there is no cookie/ambient credential; first message must be auth.
- Pre-auth hardening: 5 s auth timeout, 16 KB pre-auth byte cap, 64 unauth socket cap, `maxPayload` 50 MB (remote-server.ts:58-81, 847-869).
- Device secrets are 32 random bytes stored as SHA-256 hashes in a 0600 file; unpair/password-change revoke everything (remote-devices.ts:1-73; remote-server.ts:621-640).
- Download links: 256-bit single-purpose tokens, device-bound, 5-minute TTL, symlink/inode checks, secret-path refusal (remote-download.ts:1-60).
- Static file serving path-traversal guard and malformed-URL crash guard (remote-static-path.ts:13-45).
- Claude control bridge: 127.0.0.1 only, per-session 256-bit secret, Host exact match (anti DNS-rebinding), any Origin header rejected (anti browser), remoteAddress check, POST-only route allowlist, 16 KB body cap, strict key allowlists, timeouts (claude-control-bridge.ts:147-153, 253-286).
- Browser MCP relay: 0700 dir + chmod, 0600 socket, token compared with timingSafeEqual, only live Claude sessions accepted, config file 0600 (claude-code-browser-mcp.ts:183-232, 311-312).
- Doc-comments MCP: per-session random id and token, 0700 dir, 0600 config (claude-code-doc-comments-mcp.ts:1046-1095).
- Askpass: dir 0700, socket 0600, kernel peer-pid verification with startup self-test, hardened helper with scrubbed env (askpass-server.ts:219-285; scripts/askpass/youcoded-askpass:86-93).
- Hook socket on Linux sits in `$XDG_RUNTIME_DIR/youcoded` (0700) with socket mode 0755 (not connectable by others), per-pid name, nested-claude owner gate (hook-relay.ts:30-42, 66-108); live `ls` confirms modes. Forged hook events can only create UI noise: permission replies go back on the connection that asked, so a forger only answers itself.
- OAuth callbacks: loopback, short-lived, PKCE, random path / `state`, server closes after use (openrouter-oauth.ts:60-66, 138; chatgpt-auth.ts:101, 793).
- Local engine and its check run bind 127.0.0.1 only, never 0.0.0.0 (engine-supervisor.ts:640; model-presets.ts:559).
- No debugging port in production: `remote-debugging-port` only when `!app.isPackaged` (main.ts:1293-1295); browser uses pipe transport.
- No `--no-sandbox`, `webSecurity:false`, or node integration in the main window: `contextIsolation`, `sandbox:true`, `nodeIntegration:false` (main.ts:680-682); will-navigate and window-open guards (main.ts:743-748); office frames sealed (office-frame-guard.ts).
- No custom URL protocol, no file associations, no single-instance argv handling (so nothing to abuse); `.desktop` file has no MimeType.
- Office editor/pictures: no TCP server; picture fetch refuses private/loopback/link-local addresses on resolved IPs incl. NAT64/6to4 forms (office/public-address.ts:1-90).
- Update/install helpers scrub `ELECTRON_RUN_AS_NODE` and `NODE_OPTIONS` for children (harness/tools/bash.ts:544-551; providers/keychain-launch.ts:13-14).

## Live observations (read-only `ss`/`ls`, nothing connected)
- Remote access is enabled on the owner's app: `100.111.147.124:9900` (youcoded pid 2403). Also several dev instances with 127.0.0.1 Vite ports (5223/5233/5243/5253) and llama-servers on 127.0.0.1 (9920, 10000, 39871).
- The long-running installed app (pid 2403, started Oct 24) still keeps its hook socket in shared `/tmp/claude-desktop-hooks-2403.sock` (older build, before the XDG move); its mode is 0755 so others cannot connect, but the squat precondition in F4 applies to that build.
- Stale files: many old `br-*.sock` and `claude-desktop-hooks-*.sock` for dead pids in the runtime dir (harmless, tidy-up only); a stale `~/.config/youcoded/DevToolsActivePort` from Aug 15 (dev debugging leftover).
