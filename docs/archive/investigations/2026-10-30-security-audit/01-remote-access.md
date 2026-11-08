# Security audit 01 - Remote access (reaching this computer from another device)

Scope read end to end: youcoded/desktop/src/main/ remote-server.ts, remote-config.ts, remote-devices.ts, remote-origin.ts,
remote-static-path.ts, remote-static-policy.ts, remote-paths.ts, remote-download.ts, remote-dev-proxy.ts, remote-local.ts,
sync-hub-socket.ts, presence-socket.ts, reconnecting-ws.ts (auth header), ipc/channel-table.ts (serveRemoteChannel),
ipc/file-gates.ts, ipc/files.ts, ipc/remote-admin.ts, ipc/session.ts (create), ipc/native.ts, phone-read-deny.ts,
tests/fixtures/phone-open-channels.json (283 channels a phone may call), Android BackendService.kt + network_security_config.xml.
Read-only. No traffic sent, nothing run.
(Paths below are relative to youcoded/desktop/src/main/ unless stated.)

## How it works (so the findings make sense)
- OFF by default (remote-config.ts:82 `enabled:false`). When on, the server binds ONLY to the computer's Tailscale address
  (remote-server.ts:402-410 startOnce refuses to start without Tailscale; :546 `server.listen(port, this.bindAddress)`).
  It does not listen on Wi-Fi/LAN/loopback. Plain http/ws, but travels inside Tailscale's WireGuard tunnel.
- Sign-in = first WebSocket message: either a stored per-device secret, or the host password (bcrypt). Nothing is trusted by IP.
- Once signed in, a phone can call a pinned allow-list of 283 channels (tests/fixtures/phone-open-channels.json). Host-admin
  channels (set password, switch remote off, unpair, rename) are refused for phones (ipc/remote-admin.ts:62-70).
- Android's own app talks to its own on-phone backend on 127.0.0.1 with a per-run 256-bit token (remote-local.ts, BackendService.kt:134,274).

---------------------------------------------------------------------------------------------------------------------------

## FINDINGS

### RA-1  Medium - Password guessing and "freeze the app" flood by anyone on the tailnet (rate limit is weak, bcrypt runs in the app's main process)
- Attacker: any device/person on the same tailnet (a shared-in node, a compromised laptop/phone of the owner, another user's node under shared ACLs). Needs only network reach to port 9900 - no credentials.
- Attack:
  1. Open many WebSockets to ws://<tailnet-ip>:9900/ws, each sending one `{type:'auth', password:<guess>}` as the first frame (or inside the opening request's subprotocol, shared/first-frames.ts).
  2. Each socket gets exactly ONE attempt (remote-server.ts:794-797 comment, :968 closes on failure), but sockets are cheap: up to MAX_UNAUTH_SOCKETS=64 at once (:66, :825-828).
  3. After 25 failures in 60 s the host only DELAYS each new connection by 2 s (:70-72, :1389-1403 shouldSlowConnection, :902 `await ... setTimeout`). It never refuses. Delay is per socket, parallel sockets overlap, so throughput stays ~tens of guesses/s (limited by bcrypt cost).
  4. Every attempt runs `bcrypt.compare` from `bcryptjs` (remote-config.ts:4,126; package.json:47). bcryptjs is pure JavaScript, so it runs on the Electron main process (not the thread pool); cost 10 is roughly 50-100 ms of CPU each. A steady flood can starve the main process: the desktop UI, terminal relay and IPC for the real user lag or freeze.
- Impact: (a) online brute force of the password at very roughly 10-30 guesses/s (~1M/day) - a weak 8-char password is within reach; success = full control (see RA-2). (b) A tailnet peer can degrade the owner's app with no credentials. (c) The 64-socket cap can also be held full to make the owner's real phone get "Too many pending connections" (4009) - a cheap lockout.
- Existing mitigations: 1 attempt per socket; bcrypt cost 10; min length 8 on NEW passwords (remote-admin.ts:67) but pre-existing shorter ones keep working (remote-config.ts:14-18, weakPassword flag only nags); 5 s auth timeout and 16 KB pre-auth cap (:56-60, :845-870); remote is off by default and tailnet-only.
- Not mitigated: no per-source lockout/backoff growth, no ceiling on attempts/hour, no notification to the owner, no complexity rule.
- Confidence: Likely for the CPU claim (depends on bcryptjs measured speed on the machine - not run, per rules); Confirmed for "no cap on total guess rate / delay-only slowdown".
- Fix: (1) make slowdown escalate (exponential, e.g. 2 s -> 60 s) and apply a hard global cap (e.g. refuse new password attempts for 5 min after 50 failures, while still allowing stored-secret sign-in, which is unaffected by a password lockout); (2) hash off the main thread (native `bcrypt`/argon2 in a worker, or run bcryptjs in a worker_thread); (3) require a stronger password when enabling (>=12 or generated passphrase; show a generated one) and treat the weakPassword note as a blocker; (4) surface "N failed sign-ins from <ip>" to the owner; (5) raise MAX_UNAUTH_SOCKETS cleverly or key it per source IP now that the server sees real tailnet addresses (the "all behind loopback" rationale in comments at :64 and remote-admin.ts:7-12 is out of date - the bind is the tailnet address, req.socket.remoteAddress is the real peer).

### RA-2  Medium (by design, but under-communicated) - A signed-in remote device is effectively full control of the computer, not a bounded "viewer"
- Attacker: anyone who has the password or a paired device's stored secret (stolen/unlocked phone, malware in the phone browser's localStorage, shoulder-surfed password).
- Evidence: allow-list includes `session:create` (any Claude Code/native session, cwd and options come from the phone - ipc/session.ts:200-214; only `provider:'shell'` is refused), `session:input`, `session:claude-control`, `native:send`, `native:set-permission-mode`, `permission:respond`, `permissions:remove`, `defaults:set` / `settings:set` (e.g. skipPermissions default), `engine:run-in-terminal`, `skills:install`, `sync:add-backend`, `provider:set-key/upsert`, `claude-code:install`, `github:*`, `file:upload` (phone-open-channels.json). The code itself says it plainly: "it does NOT stop a signed-in phone from reaching a shell" (ipc/session.ts:207-209).
- Attack: phone signs in -> `session:create` {cwd:"/home/user"} -> `native:set-permission-mode` / `defaults:set skipPermissions` -> `session:input` "run <anything>" -> arbitrary commands as the desktop user, read any file the AI can read (the phone-read-deny list only restricts the phone's *direct file readers*, not what the AI tool can be told to do).
- Why not higher: authentication is required; this is the product's purpose; the unpair/password-change path exists (RA-3).
- Why it matters for the trust story: the phone's direct file reads are carefully sandboxed (see Checked-and-OK) but that sandbox is bypassable by asking the AI session to read the file. Do not market the phone-read-deny list as a boundary.
- Confidence: Confirmed.
- Fix / options: say so in the UI ("a paired device can do anything you can do here"); optional "view-only" device tier that refuses session:create/input/permission/settings channels; require an on-computer approval for the first session:create from a newly paired device; ensure `native:set-permission-mode`/`defaults:set` bypass options require the computer (or a fresh re-auth) from phones.

### RA-3  Low - Paired-device secrets never expire; revocation is manual or on password change
- Evidence: remote-devices.ts: no TTL/expiry field; `authenticate` (:465-476) accepts a valid secret forever and only updates lastSeenAt. Revocation: `revoke` (:483), `revokeAll` on password change (remote-admin.ts:69-70, remote-server.ts:626-634).
- Attack: a lost/stolen phone or a browser profile that was once paired keeps working until the owner notices and unpairs it. Secret lives in the client's storage (localStorage) so any XSS in the served page on that origin or malware on the phone yields persistent access.
- Mitigations: secret is 256-bit random, stored hashed (SHA-256) on the host with 0600 (remote-devices.ts:379,419,425); unpair also kills live socket and download links (remote-server.ts:672-686); device list shows lastSeenAt so stale ones are visible.
- Confidence: Confirmed. Fix: optional idle expiry (e.g. 90 days unused -> revoked), and a "new device paired" notice on the computer.

### RA-4  Low - No Host-header allow-list; Origin check passes DNS-rebinding pages (no known exploit path)
- Evidence: remote-origin.ts compares Origin host:port to the request's own Host header (:55-67). A page on `evil.example` whose DNS is rebound to the owner's tailnet IP sends Origin `http://evil.example:9900` and Host `evil.example:9900`, which match, so verifyClient allows it (remote-server.ts:489-499). The HTTP static handler checks no Host at all.
- Real-world exposure: the page would have to run in a browser that can reach the tailnet IP (so a tailnet member's browser), and then it could (a) open a WebSocket, (b) guess passwords from the victim's machine (laundering RA-1's source) and (c) fetch the public page bundle. It CANNOT use the victim's stored device secret (it lives in the tailnet origin's storage, not evil.example's). Net: no new capability beyond RA-1.
- Confidence: Confirmed for the check gap; Speculative for any impact. Fix: allow only Hosts that are the tailnet IP, the machine's MagicDNS name (*.ts.net) or an explicit list; reject others at both HTTP and upgrade.

### RA-5  Low - `/remote-state` answers unauthenticated and reveals whether a password is set
- Evidence: remote-server.ts:437-441 returns `{needsSetup: !passwordHash}`, no auth, no rate limit. Deliberate and documented ("discloses nothing new"). A peer learns whether the host is in a "no password yet" state; sign-in with no password is refused (:891-896), so there is no takeover-on-first-run window.
- Confidence: Confirmed. Fix: none required; could fold into the first WebSocket reply.

### RA-6  Low - Packaged app falls back to the Vite dev-server proxy if the built page is missing (unauthenticated proxy to 127.0.0.1:5173)
- Evidence: choosePhonePageSource returns 'dev-server' whenever `hasBuild` is false even when `serveBuiltPage` is true (remote-server.ts:124-126). In that case the whole HTTP surface (every path except /remote-state and /download/) is piped to http://127.0.0.1:<VITE port> (remote-dev-proxy.ts:6-19, remote-server.ts:451-455) and non-/ws WebSocket upgrades too (:502). Vite 8.x dev server is configured host 127.0.0.1 (vite.config.ts:97).
- Attack: only if (a) a packaged build is missing renderer/index.html (broken install) AND (b) something is listening on the Vite port on the same machine (a developer running `npm run dev`, or another local service on 5173). A tailnet peer could then read that service unauthenticated (for Vite dev: source files, `/@fs/` reads subject to Vite's fs.allow).
- In normal dev runs (unpackaged `run-dev.sh`, remote enabled on a dev profile) this is the intended behaviour but means a dev instance's remote door serves dev-server content with no password until the WebSocket stage. Dev only.
- Confidence: Confirmed for the logic; Speculative for exploitability. Fix: when `app.isPackaged`, never proxy; return 503 "page not built" instead.

### RA-7  Info - Android allows cleartext traffic app-wide
- Evidence: youcoded/app/src/main/res/xml/network_security_config.xml:34 `<base-config cleartextTrafficPermitted="true" />` (intentional; comment explains Android NSC cannot match IP ranges).
- Impact: any http:// request from the Android app's WebView/HTTP stack is allowed, not just ws:// to the paired desktop. Matters only if some code path ever uses http for an external site (not audited here; other audit areas). The pairing traffic itself rides WireGuard under Tailscale, but a user who pairs to a LAN IP is plain text (and the desktop only binds Tailscale, so that case does not occur with the current server).
- Confidence: Confirmed. Fix: scope with a domain-config for `*.ts.net` + ship WSS, or at minimum keep cleartext off for every non-pairing request (e.g. WebView/OkHttp with their own policy).

### RA-8  Info - Stale comments describe a loopback proxy that no longer exists
- Evidence: remote-server.ts:62-66, 805-810 and ipc/remote-admin.ts:7-12 say "behind a loopback bind every device is 127.0.0.1". The server now binds the tailnet address, so `req.socket.remoteAddress` (stored as `client.ip`, :1063) is the real peer. This is why per-source limiting (RA-1 fix 5) is now possible.
- Confidence: Confirmed.

---------------------------------------------------------------------------------------------------------------------------

## CHECKED AND OK (attacks tested against the code; defended)

1. Exposed to the internet / whole LAN by default? NO. Disabled by default (remote-config.ts:82); when enabled binds ONLY the Tailscale IP and refuses to start otherwise - no fallback to 0.0.0.0 (remote-server.ts:402-410, 546; tests/remote-server-bind.test.ts). Not reachable from home Wi-Fi addresses or the public internet (no port forwarding, no relay/tunnel code of its own; Tailscale only).
2. Unauthenticated access to app data over HTTP/WS? Only `/remote-state` (RA-5), the public page bundle, and `/download/<token>`. All feature channels require a signed-in socket; before sign-in the only accepted frame is `auth` (remote-server.ts:882-889), everything else closes the socket.
3. Pre-auth resource exhaustion partly handled: 5 s auth timeout (:55, :871), 16 KB pre-auth byte cap (:56-60, :858-870), max 16 pipelined early frames (:891-897), 50 MB post-auth max payload (:471), 64 unauth sockets cap (:66, :825) (see RA-1 for what is left).
4. Password storage: bcrypt hash only, file mode 0600 (remote-config.ts:121, 143-149); plaintext never serialized or sent to the renderer (`toSafeObject`, :153-163).
5. Device secrets: 32 random bytes via crypto.randomBytes; host stores only SHA-256; compared with crypto.timingSafeEqual and length check (remote-devices.ts:425-428, 465-475). Host password compare is bcrypt.compare (constant-time by design). Android local token compared with timingSafeEqual (remote-local.ts:21-25).
6. Revocation is real: unpair keeps a tombstone record, survives restart, closes live sockets and kills outstanding download links (remote-devices.ts:483-489; remote-server.ts:672-686); revoked devices get a terminal `revoked` reason and cannot come back by naming themselves (pairAgain rejects revoked/unknown, :449-452). Password change revokes ALL devices, closes sockets, revokes downloads (remote-admin.ts:69-70; remote-server.ts:626-634).
7. A phone cannot change the host password, turn remote off, unpair/rename devices, or disconnect others - refused at the channel table before the handler runs (remote-admin.ts:62-70; channel-table.ts:206-214); ast-grep rule `remote-admin-case-refuses` and phone-open-set pin test guard the list (tests/phone-open-set.test.ts; changing the list needs a deliberate fixture edit).
8. Cross-site WebSocket hijack (a normal website in the owner's browser opening ws://tailnet-ip:9900): a real browser page has a non-matching Origin and gets 403 before the socket opens (remote-origin.ts:55-67; remote-server.ts:489-499). Null/absent Origin (Android WebView, non-browser) is allowed, safe because the socket carries no ambient credential (no cookies; secret only inside the first frame).
9. Static-file path traversal: URL is decoded in try/catch (malformed %, NUL and control bytes rejected), normalized, joined and confined by path-segment check, not string prefix (remote-static-path.ts:82-107; used at remote-server.ts:660-672). Unknown files fall back to index.html - no directory listing, no error text leaks. Fixed earlier crash vectors (`GET /%`, `%00`).
10. Static asset serving leaks nothing sensitive: renderer bundle only, fixed MIME map with `application/octet-stream` default, immutable cache only under hashed /assets/ (remote-static-policy.ts).
11. Download endpoint: 256-bit random token in URL, in-memory only, bound to the minting device+socket, 5-min sliding expiry, capped per device (16) and per socket (2 streams), device-revocation re-checked on every GET, same 404 for unknown/expired/revoked, GET/HEAD only, route regex is strict (remote-download.ts:20-60, 355-383). Mint goes through the phone folder gates, sensitive-file list and phone deny list, with symlink-swap defence by comparing opened-handle dev/ino plus O_NOFOLLOW and /proc/self/fd readlink (remote-download.ts header + :120-135).
12. Phone's direct file reads are bounded: `fs:read-head` for phones is restricted to the upload temp folder and the deny list on the REAL path (file-gates.ts:51-62); artifact/project readers require a known root (file-gates.ts:29-47); `file:upload` writes only to the app's temp upload dir with sanitized names, a per-file size cap (checked before decode) and a folder ceiling (files.ts:35-58). (Caveat: RA-2 - the AI session itself is not so bounded.)
13. Remote host cannot be driven to open a raw shell by `session:create` payload (provider 'shell' refused, ipc/session.ts:210-212); `engine:run-in-terminal` goes through `prepareRunInTerminal`.
14. A signed-in device cannot read other devices' request outcomes (device id prefix check, remote-server.ts:1214-1222) and request ids are bounded (200).
15. Info leakage in logs: connection log lines use only an 8-char device-id prefix, never secret/address/name (remote-server.ts:313-318).
16. Dev proxy is not active in a normal packaged run: only when no built page exists or the app is unpackaged (remote-server.ts:124-126, 451, 502) - see RA-6 for the packaged-without-build corner. Local (Android) mode never proxies upgrades (:502).
17. Android on-phone backend: loopback only (127.0.0.1), per-run token from SecureRandom 32 bytes passed over stdin not env (BackendService.kt:134-152, 274-277), exact-origin check also blocks other web pages on the phone from reaching it (remote-origin.ts), `owner` rights only for the token holder (remote-local.ts).
18. Outbound sockets (sync hub and presence): `wss://api.youcoded.ai/...` with bearer token in the Authorization header, not in the URL; no `rejectUnauthorized:false` or TLS-disable anywhere in main (rg across src/ found none) (sync-hub-socket.ts:20, presence-socket.ts:19, reconnecting-ws.ts:99). Lease takeover frames validated (nonce UUID regex, id regex, expectedHolder checks) before sending (sync-hub-socket.ts:152-163) and inbound nonce/sender validated (:118-126). Server-side relay logic (worker) is out of this area.
19. Tailscale CLI helpers use `execFile` with fixed arguments (no shell string) (remote-config.ts:215-244).
20. Channel dispatch lookup: `findChannel` uses a Map by exact name, so `__proto__`/`constructor` message types cannot resolve to prototype members (ipc/channel-table.ts:133-137); unknown types get a generic "not available" reply.
21. Replacement/duplicate connections: a second connection from the same device replaces the first (cap per device), and liveness pings reap half-open sockets; backpressure closes slow readers at 32 MB (remote-server.ts:60-68, 1010-1020).

## Not examined / out of scope
- Worker-side SyncHub/PresenceRoom auth (another specialist).
- Renderer-side remote-shim XSS / localStorage handling of the device secret (renderer area).
- Actual bcryptjs timing on target hardware (no code execution allowed).
- The ~283 individual channel handlers beyond those cited; RA-2 means any one of them is reachable by an authenticated device by design.
