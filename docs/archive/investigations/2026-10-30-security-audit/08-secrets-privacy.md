# 08 - Secrets at rest, leaks, sync, OAuth, privacy claims

Scope: youcoded/desktop/src/main (Electron desktop). Android not reviewed. Static analysis only; the only live-system action was `stat` (mode/owner) on a few of the owner's files. No secret contents were read or printed.
Paths below are relative to `youcoded/desktop/src/main/` unless they start with `youcoded/`.

## Summary

The core secret handling is strong. API keys, ChatGPT tokens, Plaid access tokens, MCP/search keys and page-connection keys all go through one SecretsStore (OS-keychain encrypted, plaintext fallback refused by design). Tokens stay in the main process, and the OAuth flows check state or use PKCE.

The findings cluster in four places:
1. The hidden sync repo inside a project folder is trusted blindly, and the git credential helper gives the GitHub token to any host.
2. Sync adopts an already-existing GitHub repo without checking that it is private.
3. A handful of credential-bearing files are not on the assistant's "never read" list.
4. PRIVACY.md omits two YouCoded-server flows that exist in code (SyncHub, presence) and has two inaccurate phrasings.

| ID | Severity | Title |
|---|---|---|
| F1 | Medium | Untrusted `.youcoded/sync.git` in an imported or cloned project is trusted: code execution plus the GitHub token reaches any host |
| F2 | Medium | Sync adopts an existing same-named GitHub repo without checking it is private |
| F3 | Medium | GitHub token falls back to a base64 file on Linux because github-client bypasses the keychain-recovery wrapper; token scope is very broad |
| F4 | Medium | PRIVACY.md omits SyncHub and presence/friends flows (device name, device id, session ids, project-name slugs sent to api.youcoded.ai) |
| F5 | Low | Assistant file tools can read marketplace-auth.json, github-token.json, page-connections.json, youcoded-remote.json (password hash) |
| F6 | Low | `~/.claude.json` is rewritten with default permissions (likely 0644) while holding decrypted MCP secrets |
| F7 | Low | Provider upsert lets the renderer or a remote client repoint a saved key's baseUrl (key exfil if the renderer is compromised) |
| F8 | Low | Bug-report redaction covers only GitHub and Anthropic key shapes; report posts to a public repo |
| F9 | Low | Legacy API-key path puts the key in argv and in the logged error text |
| F10 | Low | desktop.log is world-readable (0644 in a 0755 dir) |
| F11 | Low | Sync "never sync" secret list is narrow; legacy Drive backup copies settings/mcp/history unscrubbed |
| F12 | Low | PRIVACY.md wording inaccuracies (OAuth tokens, "secret" salt, bug-report flow unmentioned) |
| F13 | Info | Misc: Electron basic_text reliance, argv/ps exposure of OAuth URL log, remote access without TLS (documented) |

---

## Findings

### F1 - Medium - Untrusted hidden sync repo is trusted; token goes to any host
- **Attacker/precondition:** The user puts a project folder from someone else into a sync space (import-project, or clones/downloads a repo into `~/YouCoded/Projects/`) and sync is enabled. The folder contains `.youcoded/sync.git/` with a HEAD file, a hooks/ directory, or a config (e.g. `core.fsmonitor`, `core.sshCommand`, `url.*.insteadOf`, a `remote.origin.url`). This is a normal path for git: only `.git` is forbidden as a tree component, `sync.git` is not.
- **Steps:**
  1. `GitTransport.init()` only creates the hidden repo when `HEAD` is missing. An existing hostile one is used as is (`sync-spaces/git-transport.ts:262-278`, the `if (!fs.existsSync(path.join(gd,'HEAD')))` guard).
  2. Every sync runs `git add/commit/fetch/push` with `GIT_DIR=<root>/.youcoded/sync.git` (`git-transport.ts:297`). Hooks and config in that dir execute as the user (arbitrary code execution).
  3. These git processes inherit `YOUCODED_GIT_TOKEN` in their env (`git-transport.ts:56-61`). The token is a `repo workflow` scope GitHub token.
  4. The injected credential helper prints the token for every host: it ignores git's host input (`GIT_CREDENTIAL_HELPER`, `git-transport.ts:45-46`). `setRemote` only runs `set-url` when the code asks (`git-transport.ts:453-457`), so a foreign `remote.origin.url` survives. `insteadOf` rewrites also survive.
- **Existing mitigations:** `.youcoded/` is in DEFAULT_IGNORES, so it is never pushed from a legit machine. Needs a user to import an untrusted folder and enable sync. Token is env-only, not in argv.
- **Confidence:** Likely (code path read end to end; no live PoC).
- **Fix:**
  - On init, if `sync.git` pre-exists but was not created by this install, delete it or validate it. Require that `config` contains only expected keys, that `hooks/` is empty, and that the remote URL is `https://github.com/<login>/...`.
  - Always pass `-c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.sshCommand=` etc. on every git call.
  - Make the credential helper host-scoped: read `host=` from stdin and answer only for `github.com`.
  - Refuse to import folders that already contain `.youcoded/sync.git`.

### F2 - Medium - Existing repo adopted without a "private" check
- **Attacker/precondition:** No attacker needed. The user already has a repo literally named `youcoded-sync-personal` (or a project slug+hash name) that is PUBLIC, or later flips the repo public on GitHub.
- **Steps:**
  1. `createPrivateRepo` POSTs `private:true`.
  2. On HTTP 422 ("already exists") it GETs `/repos/<login>/<name>` and returns `clone_url` if status is 200 (`github-client.ts:327-337`). It never reads `existing.json.private`.
  3. The Personal space (conversation store plus mirrored Claude Code transcripts) is then pushed there.
  4. The legacy `createGithubRepo` (`sync-setup-handlers.ts:313-325`) does the same: it treats "already exists" as success.
  5. Visibility is never re-checked on later syncs.
- **Existing mitigations:** New repos are created private. The Personal repo name is fixed and unusual, so a collision is unlikely.
- **Confidence:** Confirmed (code); likelihood of a real collision is low, impact high (all conversations public).
- **Fix:** On the adopt path require `existing.json.private === true` and refuse with a plain message otherwise. Also read `private` on each sync cycle (the repo GET is cheap) and halt with a clear error if it ever turns public.

### F3 - Medium - GitHub token can land in a base64 file; scope is broader than needed
- **Evidence:**
  - `createGithubClient` is handed raw `electron.safeStorage` (`main.ts:1780-1784`, `headless/headless-boot.ts:257`), not the `RecoverableSafeStorage` wrapper that every other secret uses to survive Linux's cached "keyring not ready" failure (`providers/secret-storage.ts`).
  - When `isEncryptionAvailable()` is false, `setToken` writes the token as base64 in `<userData>/github-token.json` (`github-client.ts:210-221`). The code flags it with `degradedStorage` (surfaced in the UI) and writes it 0600 from the first byte.
  - On KDE/KWallet machines (the owner's), a locked or slow wallet at launch is exactly the case the wrapper was built for. Other secrets refuse the plaintext fallback ("we refuse plaintext fallback by design", `providers/secrets-store.ts:37-38`); the GitHub token silently differs.
  - `github-auth.ts:47` requests `repo read:org gist workflow` with the public `gh` client id. A leaked token gives write access to every repo the user owns, including Actions workflows.
- **Attacker/precondition:** Local read access to the 0600 file, or the assistant reading it (see F5), on a machine in degraded mode.
- **Existing mitigations:** 0600; documented degraded flag; the token is never logged or sent to the renderer (header comments, tests).
- **Confidence:** Confirmed for the wiring; whether degradation actually occurs depends on the user's keyring.
- **Fix:**
  - Pass `getSecretStorage()` (the async recoverable wrapper) to github-client, or refuse to store when unavailable and fall back to `gh auth token`.
  - Consider the narrowest scope that works: `repo` is unavoidable for private repos with an OAuth app, so say so in the consent copy. Drop `gist` and `read:org` if unused.

### F4 - Medium - PRIVACY.md does not disclose SyncHub or presence flows
- **Claim:** PRIVACY.md section 1 says "three narrow data flows" touch YouCoded-operated servers: analytics, marketplace, multiplayer games.
- **Code:**
  - `sync-hub-socket.ts:22,83-84` opens `wss://api.youcoded.ai/sync/hub?device=<computer name>&deviceId=<durable machine id>`. The Bearer marketplace token is attached (`reconnecting-ws.ts:99`).
  - Frames carry session ids and lease operations (`sync-hub-socket.ts:189`), plus a "space updated" signal whose key is the repo name (`sync-spaces/service.ts:237`). For project spaces that is a readable slug of the project folder name plus a hash (`space-manager.ts:14-25`).
  - `presence-socket.ts:15` opens `wss://api.youcoded.ai/social/presence` (online status visible to friends, with an incognito mode). Only "multiplayer games" is described in PRIVACY.md section 3.3.
  - The computer's hostname often contains the owner's real name ("Destin's Z13").
- **Impact:** A false or incomplete privacy statement is a trust and legal risk, especially because the policy itself says "If anything here conflicts with what the app actually does, the app is wrong".
- **Confidence:** Confirmed that the code sends these; I did not verify what the Worker stores (see the Worker audit).
- **Fix:** Add a section covering account-linked cross-device sync signalling and presence: what is sent (device name, device id, session ids, project-name slugs), that no conversation content is sent, retention, and how to turn it off.

### F5 - Low - Assistant file tools can read several credential-bearing app files
- **Evidence:** The native assistant's Read/Grep guard (`harness/tools/guards.ts:258` -> `isCredentialPath`, `harness/tools/credential-paths.ts:61-86`) blocks `native-secrets.json`, `chatgpt-account.json`, `.claude.json`, `.git-credentials` and others. It does NOT block:
  - `marketplace-auth.json` (plaintext bearer token)
  - `github-token.json` (plaintext token in degraded mode)
  - `page-connections.json`
  - `youcoded-remote*.json` (bcrypt hash of the remote-access password)
  - `search-providers.json` (pointers only)
  - `.remote-devices*.json` (hashes)
  The phone-read deny list (`credential-paths.ts:111-118`, `PHONE_DENY_BASENAMES`) already includes all of these; the assistant's own list is the narrower one. Bash is unrestricted by design (documented limitation in guards.ts).
- **Attacker/precondition:** Prompt injection (a web page or file the assistant reads) steering the assistant to read these files and exfiltrate through a tool that makes a request.
- **Existing mitigations:** Per-tool permission prompts; Bash needs approval; the Linux keychain-encrypted blobs are unreadable without the keyring.
- **Confidence:** Confirmed (list comparison).
- **Fix:** Make the assistant guard call `isPhoneDeniedPath`'s basename set as well, or add these basenames to `HOME_BASENAMES` (`credential-paths.ts:67`).

### F6 - Low - `~/.claude.json` rewritten without preserving 0600
- **Evidence:** `mcp-reconciler.ts:200` writes via `atomicWrite`, which creates a temp file with default mode (`atomic-write.ts:36-37`) and renames it over `~/.claude.json`. The file holds decrypted MCP env vars and headers for registry servers (projected from the SecretsStore, `mcp-reconciler.ts:285-292`, the credential-paths comment confirms "holds decrypted MCP env/headers"). On a normal umask the result is 0644. The owner's current file is 0600 (stat), probably because Claude Code rewrote it afterwards.
- **Attacker/precondition:** Another local account on the machine (shared or family computer), plus a readable home directory.
- **Confidence:** Likely (code path confirmed; actual mode after a reconcile not tested).
- **Fix:** Pass `mode: 0o600` and `chmod` after writing, or `stat` the existing file and copy its mode to the temp file.

### F7 - Low - Provider upsert lets the caller redirect a saved key
- **Evidence:** `IPC.PROVIDER_UPSERT` (`ipc/provider.ts:59`) is not desktop-only. `upsert` merges `baseUrl` and `secretRef` from the caller's input (`providers/provider-registry.ts:187-190`). Test-connection for an `openai-compatible` provider then sends `Authorization: Bearer <saved key>` to `${baseUrl}/models` (`provider-registry.ts:626-640`). The OpenRouter path passes `p.baseUrl` to the health check with the saved key (`provider-registry.ts:623`). `secretRef`s are visible to the renderer in the provider list.
- **Attacker/precondition:** Script running in the renderer (XSS, a malicious page that escapes its sandbox) or a paired remote client.
- **Impact:** The renderer can make main send a stored key anywhere. This turns "renderer compromise" into "key theft" despite the keys being main-only.
- **Existing mitigations:** The renderer never receives plaintext keys; a remote client already has near-full control.
- **Confidence:** Confirmed mechanism; exploitation needs another bug.
- **Fix:** Reject `baseUrl` or `secretRef` changes on an existing row unless the same call also supplies a new key; for built-in OpenRouter ignore `baseUrl`; only accept `secretRef` values that the same provider already owns.

### F8 - Low - Bug-report redaction is narrow
- **Evidence:** `dev-tools.ts:17-18,51-62` redacts only `gh[opsu]_...` and `sk-ant-...` plus the home path. It does not cover `sk-or-` (OpenRouter), `sk-` (OpenAI), `AIza` (Google), `Bearer ...`, Plaid, email addresses or project names. The report becomes a GitHub issue on the PUBLIC `itsdestin/youcoded` repo (`dev-tools.ts` submitIssue). The code comment says the editable preview is the safety net. The text also goes to `claude -p` for the optional rewrite (`buildSummarizerPrompt`), and its `flagged_strings` highlights suspicious items.
- **Mitigation:** Logs rarely contain keys (I checked log call sites; provider errors log only kind/code/status, `providers/provider-failure.ts:183`). The user sees and can edit the preview.
- **Confidence:** Confirmed (regex list).
- **Fix:** Add the other key shapes and a generic `Bearer \S+`; add an obvious "this will be public" line above the preview.

### F9 - Low - Legacy `claude auth set-key` path exposes the key
- **Evidence:** `prerequisite-installer.ts:1361-1376` runs `claude auth set-key <key>` with the key in argv (visible to other local users via `ps`/`/proc/<pid>/cmdline` for the call's duration). On failure `String(err)` is used: Node's execFile error message starts "Command failed: <cmd> <args>", so the key goes into `desktop.log` (`log('ERROR','prereq','API key submission failed',{error: msg})`) and into the error returned to the UI (`first-run.ts:536-551`).
- **Reachability:** FirstRunView always passes a `service` (`renderer/components/FirstRunView.tsx:314`), so the legacy branch (`ipc/first-run.ts:118`) is reachable only by an IPC caller that omits it.
- **Confidence:** Likely. **Fix:** Delete the legacy branch, or pass the key on stdin and scrub error text.

### F10 - Low - `~/.claude/desktop.log` world-readable
- `logger.ts:5,22` appends with the default mode; observed `644` inside `~/.claude` (`755`). The log holds file paths, session ids and error text, and it feeds the bug report. Fix: create it 0600.

### F11 - Low - "Never sync" list is short; legacy backup is unfiltered
- `sync-spaces/guards.ts:19-21` enforces only `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `*.credentials.json` at staging (`git-transport.ts:842,917`). Not covered: `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials`, `credentials.json`, `*.p12`, `*.pfx`, `service-account*.json`, `.aws/`, `kubeconfig`, `secrets.*`. Project spaces push arbitrary user folders to GitHub.
- Legacy Drive snapshot copies `settings.json`, `mcp.json`, `history.jsonl`, `config.json` as is (`sync-service.ts:727-741`). `settings.json` can carry env tokens and `history.jsonl` holds typed prompts. The destination is the user's own Drive, so this is exposure to Google, not to YouCoded.
- Conversations and mirrored Claude Code transcripts are pushed whole with no secret scanning. If the user pastes a key in chat, it is in the private GitHub repo. (By design; worth one sentence in the sync consent copy.)
- Fix: widen NEVER_SYNC (see list), and run a gitleaks-style scan on staged text in project spaces.

### F12 - Low - PRIVACY.md wording
- Section 2 says OAuth tokens for any other service never reach YouCoded servers. The marketplace sign-in sends a GitHub `read:user` token to the Worker (`wecoded-marketplace/worker/src/auth/routes.ts:145-146`, `auth/github.ts:41`). It is used for one profile lookup and I found no code that stores it. Reword to "GitHub sign-in is exchanged by our server; we keep only your id and login".
- Section 3.1 describes the HMAC salt as "secret". It is a literal in the public repo (`analytics-salt.ts:7`). Because machine ids are random 128-bit values this does not make the hash reversible, but "secret" is inaccurate.
- The Report-a-bug flow is not described: a public GitHub issue with a log excerpt, and an optional rewrite that sends the description and log to Anthropic through `claude -p`.
- Analytics default is ON (`analytics-service.ts:30 defaultState optIn: true`); the policy says so. Note for EU readers: a stable device hash on an opt-out basis is arguably personal data needing opt-in.

### F13 - Info
- Linux backend check: the native path trusts Electron's `isEncryptionAvailable()` and only the helper path additionally refuses `basic_text` (`providers/keychain-operation.ts:15`). The app never calls `setUsePlainTextEncryption` (grep). Electron's documented behavior makes `isEncryptionAvailable()` false on basic_text unless that call is made, so this holds, but adding `safeStorage.getSelectedStorageBackend() !== 'basic_text'` to `RecoverableSafeStorage.needsHelper` would be cheap insurance.
- `prerequisite-installer.ts:1308` logs the Claude login OAuth URL (contains a PKCE challenge and state, no secret).
- Remote access is HTTP, not TLS; this is disclosed in PRIVACY.md 3.7. Passwords and per-device secrets travel in clear on a LAN unless Tailscale is used. (Remote-server audit covers this.)
- Plaid: connected pages can pull balances and transactions into page data files, and the model can read that data through the Pages MCP (`ReadPageData`). That is the feature working as designed, but it means bank data can reach a cloud model. Worth a note in the Plaid consent copy.

---

## Checked and OK (defenses that hold)

**Credentials at rest**
- Provider API keys, ChatGPT tokens, Plaid access tokens (`pages/plaid.ts:98-101`), MCP and search keys (`harness/mcp/mcp-registry.ts`, `harness/search/search-key-store.ts`) and page-connection keys (`pages/connections-store.ts:9`) live as safeStorage ciphertext in `<userData>/native-secrets.json` (`providers/secrets-store.ts:1-5`). `providers.json` and the others hold only a `secretRef` pointer.
- Plaintext fallback refused: `assertAvailable` throws (`secrets-store.ts:40-44`, 134, 147). `setUsePlainTextEncryption` is never called.
- Linux keyring recovery runs a child with an explicit secure backend and refuses `basic_text` (`providers/keychain-launch.ts:1-24`, `providers/keychain-operation.ts:15`). Helper errors do not echo input (`keychain-operation.ts:11-12`, `secrets-store.ts:150-165`).
- userData dir is `0700` (observed with stat); `marketplace-auth.json` and `youcoded-remote.json` are written `0600` (`marketplace-auth-store.ts:89`, `remote-config.ts:149`); `.remote-devices.json` is `0600` (`remote-devices.ts:73`); GitHub token file `0600` (`github-client.ts:219`).
- Remote password stored as bcrypt (`remote-config.ts:110-113`); paired-device secrets stored as hashes and compared with `timingSafeEqual` (`remote-devices.ts:33,126`). `toSafeObject` never exposes the hash (`remote-config.ts:151-160`).
- Sudo/admin password: unix-socket helper with kernel peer-credential verification, self-hardening against ptrace, 256-byte line cap, buffers zeroed, `sudo -K` on last use (`harness/askpass/askpass-server.ts:19-70,366`, `admin-forget.ts`). Not persisted.
- Secrets are not sent to the renderer: GitHub, marketplace and ChatGPT token comments and code keep them in main (`github-auth.ts` header, `marketplace-auth-store.ts:1-4`, providers list returns `hasKey` only, `provider-registry.ts:130-155`).

**Leak surfaces**
- Crash dumps stay local: `uploadToServer:false`, no submitURL (`crash-diagnostics.ts:42`).
- Provider error logging records only kind/code/status, not bodies or headers (`providers/provider-failure.ts:183`). Google key-in-URL is only used for a connection test, and errors do not echo the URL.
- The assistant's file tools deny `.ssh`, `.aws`, `.gnupg`, `.netrc`, `.credentials.json`, dotenv, `.git-credentials`, keyrings, browser login stores, `native-secrets.json`, `chatgpt-account.json`, `.claude.json` (`harness/tools/credential-paths.ts:17-86`, `guards.ts:240-263`). Search excludes the same (`CREDENTIAL_EXCLUDE_GLOBS`). The phone/remote read path has an even broader list (`credential-paths.ts:104-160`).
- Git token passes by env var, never argv or git config (`git-transport.ts:36-61`).
- Plaid page requests are validated (`cleanPlaidRequest`, `pages/plaid.ts:490+`); Plaid sign-in URL is restricted to https plaid.com (`openPlaidLink`, `pages/plaid.ts:462-466`); Plaid responses never include client id, secret or access token (`runPlaid` doc, `plaid.ts:393-394`).
- Heartbeat payload is only `deviceIdHash`, `appVersion`, `platform`, `os` (`analytics-service.ts:128-133`), once per UTC day, honors opt-out (`analytics-service.ts:120-123`), skipped in smoke tests. Matches PRIVACY.md 3.1 except the "secret" salt wording.
- Announcements fetch is a plain GET with no identifiers (`announcement-service.ts:76`).

**Sync**
- Repos are created `private:true` (`github-client.ts:322`, `sync-setup-handlers.ts:314`); transport has size cap, case-collision and secret-name guards enforced at staging, not just via info/exclude (`guards.ts:16-30`, `git-transport.ts:842,917`); `.youcoded/` and `Leases/` never synced; machine-bound ciphertext is deliberately kept out of any syncable home (`secrets-store.ts:1-4`, `github-client.ts:17-26`).
- Handoff: the transport validates every id and create-parameter field against a strict allow-list and explicit consent flags (`conversations/handoff-transport.ts:8-62`). Handoff moves through the user's own sync repo plus the YouCoded hub (signals/leases only, over wss with a Bearer token, `reconnecting-ws.ts:99`); no conversation content goes through the hub.

**OAuth flows**
- ChatGPT: PKCE S256 plus random `state` checked on callback before anything else (`providers/chatgpt-auth.ts:786-795`); callback listener bound to `127.0.0.1` (`chatgpt-auth.ts:101`, listen at 254); non-GET or wrong path gets a 404; one exchange per round; the late callback after timeout is ignored; tokens are never logged (header at `chatgpt-auth.ts:20-35`); issued client id format-validated (`:810-818`).
- OpenRouter: PKCE S256, listener on `127.0.0.1` with an OS-chosen port and a 128-bit random callback path in place of `state`, single-use (`providers/openrouter-oauth.ts:60-64,131,183-187`); key checked before saving; server error text is not shown in the browser page.
- GitHub: device flow (no callback server, no client secret in the app), token never in errors (`github-auth.ts` header, injectable I/O). Marketplace Worker uses `read:user` scope only.
- Packaged builds do not enable the remote-debugging port (`main.ts:1291-1295`: `!app.isPackaged` gate).

---

## Not covered / limits
- Android code, the Worker's real storage and retention (IP discard, 90-day claim), and the remote server's transport are other auditors' scope.
- I did not run the app. Behaviors marked "Likely" come from reading the code path, not from a live reproduction.
- Whether Electron 41 returns false from `isEncryptionAvailable()` on `basic_text` was taken from its documented API, not tested.
