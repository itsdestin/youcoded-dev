---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T1 — the test rig (N isolated devices, a relay that can lie, link cutting, clock skew, inventory)
---

# T1 — Can real "devices" be run for tests?

## 1. Verdict

**PASS** against the design section 9 pass line ("one command runs 3 devices and a relay; two inventories can be diffed"), with no app changes needed to boot. `node rig.mjs up --hold` starts 3 real headless backends plus a relay stub in about 3 s (ready times 1.8 to 4.4 s across runs); `node rig.mjs diff A B` diffs two inventories. Isolation was proved with a positive control, not just an absence of evidence. What is stubbed or only designed (the real link layer, the real relay wire, frame-level faults) is listed in sections 3.9 and 6; none of it exists in the app yet.

## 2. What was done

All throwaway code is in `docs/active/prototypes/2026-11-14-mesh-phase0/T1/` (no app source edited, nothing outside the two folders touched).

| File | What it is |
|---|---|
| `rig.mjs` | The rig. `build`, `up [--devices N] [--no-jail] [--offline] [--hold] [--env K=V]`, `selftest`, `status`, `ping`, `down`, `inventory <dev>`, `diff <A> <B>`, `skew <dev> <ms>`, `chat <dev> <lines> [sessionId]` |
| `relay-stub.mjs` | In-process relay on 127.0.0.1 (design 6.4 operations, in memory) with lie rules: replay an old register, drop frames, tell two devices both "reserved", delay, cut one device |
| `linkproxy.mjs` | A cuttable, slowable TCP link per directed path (tested: echo 3 ms, +200 ms latency, cut gives "closed", heal works) |
| `skew-preload.cjs` | Shifts `Date` in a running device by an offset the rig can change live |
| `fs-audit-preload.cjs` | Logs every real-home path a device's JavaScript touches, read or write |
| `claude-stub.cjs`, `chat-lines.cjs` | A stand-in for the `claude` program that writes deterministic transcript lines |
| `inventory.mjs` | The inventory tool and its diff |
| `proof.mjs`, `proof2.mjs`, `proof3.mjs`, `proof4.mjs` | The proofs; their outputs are in `evidence/` |
| `build/` (git-ignored) | The compiled backend |

Commands run, to re-run: `cd T1 && node rig.mjs build` (tsc into `T1/build/dist` with `--outDir`, about 2.5 min), then `node rig.mjs selftest`, `node proof.mjs`, `node proof2.mjs`, `node proof3.mjs`, `node proof4.mjs [--env YOUCODED_PROFILE=]`. Single-command form: `node rig.mjs up --hold &` then `status`, `ping`, `chat`, `diff`, `skew`, `down` from any shell (all exercised once, ending with 0 leftover processes).

## 3. Findings

### 3.1 The headless boot runs under plain Node on Linux from the worktree, no packaging

1. Entry is `youcoded/desktop/src/main/headless/headless-main.ts` (`node dist/main/headless/headless-main.js`). `tsc -p tsconfig.json --outDir <elsewhere>` emits it (command above; `ls T1/build/dist/main/headless` shows the five files). The worktree's own `desktop/dist` was never written (it is git-ignored anyway: `.gitignore` line for `youcoded/desktop/dist`).
2. It needs the folder two levels above `dist/main/headless` to hold `package.json`, `scripts/` (install-hooks.js), `hook-scripts/`, `assets/`, `node_modules/` (`electron-headless.ts:19` `APP_ROOT`; `launch-settings-chores.ts:27`) and `dist/main/pty-worker.js` (a plain `.js` that `tsc` does not emit; `npm run build` copies it by hand). `rig.mjs build` links the first five read-only and copies the last. Nothing else non-TS is needed to boot (`find src -name '*.js' -o -name '*.cjs' -o -name '*.mjs'` outside the renderer returns only `pty-worker.js`).
3. `skill-scanner` logs "skill-registry.json not found" (harmless; `npm run build:web` copies it).

### 3.2 How secrets and identity arrive

4. **Owner token and secret key.** `YOUCODED_SECRETS_ON_STDIN=1` makes `headless-main.ts` read ONE JSON line `{token, key}` from stdin (`readSecrets`, top of file); without it they come from `YOUCODED_HEADLESS_TOKEN` / `YOUCODED_SECRET_KEY` and are deleted from the environment. Token must be at least 32 characters, key 64 hex chars (it keys the AES-GCM `safeStorage` stand-in, `electron-headless.ts:141-172`), port from `YOUCODED_HEADLESS_PORT`. The rig uses the stdin form with random throwaway values; they are never logged (the one control file that holds door tokens is 0600 and only holds throwaway per-run values).
5. **The door.** Local mode binds `127.0.0.1` only (`remote-server.ts:382-385`, `this.bindAddress = '127.0.0.1'`), authenticates with `{type:'auth', token}` over a WebSocket at `/`. Verified: all 3 devices answer `auth:ok` to the right token and `auth:failed` to a wrong one. Sessions are opened with `{type:'session:create', id, payload:{name,cwd,skipPermissions,provider}}` and typed into with `session:input` where the text must end in `\r` (as `InputBar.tsx:1008` does).
6. **Device identity.** `getDeviceIdentity(userData)` and `getMachineIdentity(userData)` both read `<userData>/device-id.json`; the headless boot passes the SAME `userData` to both (`headless-boot.ts:192-193`), so in a headless device they are the same id, and one pre-written file `{"id":"…"}` sets both (`device-identity.ts`: `readIdFile`, `getDeviceIdentity`). The rig writes it before boot; `YOUCODED_USER_DATA` points `userData` inside the device's home (`electron-headless.ts:21-23`). Verified: 3 distinct ids (`43b96fb2`, `08dbc5b1`, `e7896759`), identical after a restart of the same folder.
   - In the DESKTOP boot (`main.ts`) the machine id is the BUILT app's userData file, read-only (`device-identity.ts:42-75`); a dev profile never mints one. So design 5.1's sentence "that id is empty where the built app never ran" is true of desktop dev instances, but a headless/rig device has its own id by construction. See section 4.
7. **Device name.** `YOUCODED_DEVICE_NAME` overrides `os.hostname()` for the roster row (`sync-spaces/device-registry.ts:35-37`). The rig sets `rig-<name>` (and the jail also sets the hostname).

### 3.3 What the headless boot hard-codes for Android

8. `headless-boot.ts:133-139`: analytics "platform: android" and `setAndroidId(process.env.YOUCODED_ANDROID_ID)`. `:306`: the device-registry row is written with `platform: 'android'` ("process.platform is the bundled Linux's linux"). So a rig device (or a future desktop super-host, 5.10) would appear in the roster as an Android phone. No override exists. The GitHub client (`:296`) and marketplace auth store (`:183`) are keyed by `userData` only.
9. `electron-headless.ts`: `powerSaveBlocker` is a call to the host app and does nothing without one (`hostNotify` when no host); `getPath('downloads')` is `<home>/Download`, `'desktop'` is the home (`:51-53`); `isPackaged = false`; `safeStorage.getSelectedStorageBackend()` returns `'android_keystore'` (`:170`). None of these breaks a rig; the first two matter for a desktop super-host (5.10).

### 3.4 Every place the backend derives paths from the home (rig-safety audit)

Search: `rg -n "os\.homedir\(\)|process\.env\.HOME\b|USERPROFILE|CLAUDE_CONFIG_DIR|XDG_|app\.getPath\(|homedir\(\)" youcoded/desktop/src/main youcoded/desktop/src/shared -g '*.ts'` gives 232 lines (tests included); `homedir()` appears in 85 files (`rg -l`). `app.getPath` names used outside tests: `userData` 35, `home` 4, `documents` 3, `crashDumps` 2, `appData` 2, `desktop` 1 (`rg -o "app\.getPath\('[a-zA-Z]+'\)"`).

10. **On Linux `os.homedir()` returns `$HOME`**, so all homedir-derived paths follow a redirected `HOME` (`.claude`, `.youcoded`, `YouCoded`, `.config/youcoded`, theme and plugin folders). The headless `app.getPath` is built from `os.homedir()` and `YOUCODED_USER_DATA` (`electron-headless.ts:42-58`). No `os.userInfo()`, `getpwuid`, `SUDO_USER`, `LOGNAME` or `process.env.USER` anywhere in `main/` or `shared/` (searched, zero hits), and no literal `/home/…` path in non-test, non-comment code (the hits are comments and `/usr`, `/opt`, `/etc/os-release` reads).
11. **`CLAUDE_CONFIG_DIR` is not read by the app at all** (zero hits in `src`), but Claude Code does read it. Rule for the rig: it must equal `$HOME/.claude` or be unset; the rig sets it to exactly that. If someone sets it elsewhere, the app and Claude Code would disagree about where chats live.
12. **Not under HOME, would escape a HOME-only redirect (each is a rig-safety bug unless handled):**
    - `XDG_RUNTIME_DIR/youcoded/…` sockets: hook relay `hook-relay.ts:36-38` (`claude-desktop-hooks-<pid>.sock`), askpass `harness/askpass/askpass-server.ts:140-141`, browser MCP `assistant-browser/claude-code-browser-mcp.ts:186`. This is the very folder Destin's live app uses (`/run/user/1000/youcoded` held 16 live sockets when checked). Handled: the rig redirects `XDG_RUNTIME_DIR` (a private empty tmpfs in the jail; a private 0700 folder with `--no-jail`).
    - The OS keyring over D-Bus: `gh auth token` finds the real login by user id even with HOME changed (documented in `scripts/dev-isolation.sh`, the 2026-10-01 incident). Handled: the jail hides `/run/user/<uid>` (no bus socket) and the rig gives `GH_TOKEN` a decoy; `PATH` is `<home>/bin:/usr/bin:/bin` so Destin's real `claude` in `~/.local/bin` is not even findable.
    - `os.tmpdir()` (42 uses in main) follows `TMPDIR`; literal `/tmp` and `/var/tmp` appear only in `artifacts/sidecar-cleanup.ts:103,279` as stat targets. Handled by a private `/tmp` in the jail and a private `TMPDIR` without it.
    - `sync-state.ts:168` `resolvePaths(os.homedir())` is frozen at module load; fine for a rig because HOME is set before the process starts (the comment there is about in-process tests).
    - Inherited environment: GitHub/Anthropic/OpenAI/AWS tokens, `SSH_AUTH_SOCK`, `DBUS_SESSION_BUS_ADDRESS`. Handled: the jail starts from an empty environment (`--clearenv`); `--no-jail` builds the environment from scratch (no inheritance).
13. **Network at boot.** With defaults a device runs `git clone --depth … wecoded-marketplace.git` (seen in the process list, 1 to 4 git processes per device) to install the bundled plugins (`skill-provider.ts:1066,1327`, `plugin-blocklist.ts:184`). `YOUCODED_PROFILE=<anything>` switches that off (0 git processes, verified, and memory fell from about 218 MB to about 185 MB per device) but also turns on other dev-copy behaviour (`outbox-drain.ts:311` `isDevInstance`, `remote-paths.ts:15`, `remote-config.ts:31`). The rig defaults to `YOUCODED_PROFILE=rig`, which matches design 7.2 ("on, before Phase 7, only in test-rig and dev instances"); `--env YOUCODED_PROFILE=` overrides. `YOUCODED_NO_ANALYTICS=1` (`analytics-service.ts:85`) is set so no device phones home.

### 3.5 What `run-dev.sh` and `docs/local-dev.md` isolate today (they changed since the design was written)

14. Design 3.7 says dev instances "share `~/.claude` and the machine id". **That is out of date on this branch:** `docs/local-dev.md` "The private home" and `scripts/run-dev.sh` now run every dev launch in `~/.cache/youcoded-test-copies/<profile>/home` (card #17, 2026-11-11), with lent sign-ins and a decoy GitHub token, proven with a real window. What it still does not give: a DISTINCT device id and name per instance beyond the userData profile, no loopback-only guarantee for several windowless devices, no model-free chats, no clock or link control, no inventory, and it needs a display (a window) so it cannot run 3 devices headless. Note the fresh private home means a dev profile's machine id is empty (`getMachineIdentity` reads the built app's userData, absent in the private home), exactly the case 5.1 mentions.
15. `dev-isolation.sh` is "hides credentials, not a sandbox (an absolute path still opens a real file)" by its own header. The rig's jail adds the sandbox: the real home is an empty decoy, so an absolute path cannot reach a real file.

### 3.6 How tests boot the backend today

16. Nothing boots it. The only tests that mention the headless files, `tests/session-publish-coverage.test.ts`, `tests/socket-repair.test.ts`, `tests/threadpool-size.test.ts`, read the source text (`rg -l "bootHeadless|headless-boot" tests src --glob '*.test.ts'`). Tests that touch the home use per-module seams (`setClaudeDirForTests`, `sync-state.ts:182`). The Electron smoke (`scripts/smoke-test.js`, `YOUCODED_SMOKE_TEST`) and `tests/e2e` need Electron. So the rig is the first harness that runs the real backend object graph without a window.

### 3.7 The proof of isolation (no `strace`/`ltrace`/`perf` is installed; none was installed)

Method: bubblewrap (`/usr/bin/bwrap`, works unprivileged here). Per device: whole filesystem read-only; **the real home replaced by an empty writable decoy folder**; `/tmp` and `/run/user/<uid>` replaced by empty tmpfs; only that device's own folder writable and the other devices' folders not mounted at all; own process list, own hostname; empty environment plus the rig variables. Afterwards, any FILE in a decoy is a write that would have hit the real home. Plus a JavaScript-level audit of every real-home path handed to `fs`.

17. **Zero writes.** `evidence/selftest.json`: 3 devices booted, pinged, given chats, skewed, stopped. `decoyLeaks` is `[]` for A, B and C; `fsAudit` has 0 rows for each. Repeated in `evidence/proof-clean-stop-restart-offline.json` (0 leaks, 0 audit rows, including an offline restart).
18. **The detectors fire (positive control, `evidence/proof-positive-control-and-skew.json`).** A jailed process told to write `<real home>/.claude/rig-positive-control.txt` and read `<real home>/.claude.json` produced: the file in the decoy (`.claude/rig-positive-control.txt`), a `write` audit row and two `read` audit rows. `ls ~/.claude/rig-positive-control.txt` on the real home afterwards: no such file. So "0" above means something.
19. **Environment-only mode (`--no-jail`) also checked**, with before/after listings (name, mtime, size) of `~/.youcoded`, `~/YouCoded`, `~/.config/youcoded`, `~/.claude` and the top of `~`, around a 6 s run of 2 devices. Real folders did change, but every changed entry is the live app or a live session writing: lease files and chat files named by the live sessions' ids (this session `1d94ee8c`, `77a53a0b`, …), `perf/hitches.jsonl`, `.usage-cache.json`, `wifi-monitor.log`. Searching all after-listings for the rig's device ids, `rig-` or the prototype folder name finds nothing, and the device audit files had 0 rows. **Limit, stated plainly:** because Destin's app is running, a before/after listing cannot by itself prove "zero writes"; the jail result in 17 can. `--no-jail` is evidence the environment variables suffice, not a guarantee.
20. **Real-home READS.** The audit shows 0 reads of real-home paths during boot. Once a chat is opened (`proof3`), the backend reads 36 paths: `CLAUDE.md`, `AGENTS.md` and `.git` in every parent folder of the chat's working folder, up to `/home/destin`. That is the app walking up from the rig's project folder because the rig's run folder sits inside the real home (`T1/run/…`). Harmless in the jail (it reads the empty decoy). Advice: put the run folder outside the real home when it matters (`--root /var/tmp/yc-rig`). Child processes (git, claude, pty-worker) and native addons are not seen by the audit; the jail covers them.
21. **Stopping.** `stopDevice` SIGTERMs the backend's node pid (found by exact argv: argv0 is `node` and an argument ends in `headless-main.js`, because bwrap's own argv also names the script), waits 8 s, then SIGKILLs only the pids recorded from `/proc/<pid>/task/<pid>/children`. Result: exit code 0 for every device (the backend's own `stop()` ran), `ps … | grep -c headless-main` is 0 after every run and after `down`.
22. **Clock skew works and is visible to the device.** Setting `clock.json` to +30 days on B made B's own log stamp read `2026-12-14T09:45:21` against a host time of `2026-11-14T09:45:21` (30.00 days ahead, within 600 ms of the change). It is JavaScript `Date` only: monotonic timers, file mtimes (kernel) and child processes (git, claude) are not shifted. `libfaketime` is not installed (checked), and `CLOCK_REALTIME` has no kernel namespace, so a whole-process skew would need an install; not done.

### 3.8 Running chats without credentials

23. **The `claude` stand-in works end to end** (`evidence/proof-chat-through-stub.json`). With `PATH` starting at the device's `<home>/bin` the real backend launched `pty-worker.js`, which launched `claude-stub.cjs`; a `session:create` over the door then two `session:input` lines produced 4 lines (2 reply ends) in `<home>/.claude/projects/<slug>/<id>.jsonl`, found by the inventory tool. The stub answers `claude auth status` (so first-run does not block), announces itself on the hook socket exactly like `scripts/perf-lab/fake-claude.cjs`, and writes a user line plus an `end_turn` assistant line per typed line. Ids, timestamps and text come only from `sha256(sessionId:n)`, never the clock, so the same chat on two devices is byte-identical (`chat-lines.cjs` is the one function; `rig.mjs chat` uses it too, with no process).
24. **There is an existing mock, and I reused its idea but not its code.** `scripts/perf-lab/fake-claude.cjs` stands in for Claude Code but writes no turns of its own ("never writes turns", its own header); `scripts/perf-lab/fake-provider.mjs` is an OpenAI-compatible SSE server for the NATIVE runtime, wired in as a `providers.json` row (`fixture.mjs:644-667`) so a native session streams deterministic replies with no key. I did not run the native path (UNVERIFIED). Expect native lines to carry runtime-generated ids and times, so independent regeneration on two devices would not match bytewise; the mesh copies bytes, so this only affects tests that expect two devices to produce the same chat independently (use the Claude stub for those).
25. **Limits of the stub (to be honest in later tests):** only clean append of user/assistant text lines. It does not write `summary`, `system`, attachment or tool lines, torn partial lines, truncation, a rewrite on `/compact`, or fork-on-resume. Those are T2 and T3 and need either real Claude Code samples or an explicit fault mode (`chat --rewrite`, `--truncate`, `--torn` are the designed additions, section 3.10).

### 3.9 Link cutting, relay lies (what exists, where the seam goes)

26. **Relay lies: built.** `relay-stub.mjs` implements `hold`, `fetch-after`, `reg-get`, `reg-set` (compare-and-swap with tokens), `reg-list`, `presence` over HTTP on 127.0.0.1 with `rules.replayRegister`, `dropFrames`, `doubleReserve`, `delay`, `cut`; it records every stored byte (`stored[]`, for S4's "relay cannot read" assertion) and has its own settable clock for the 30-day rule. Tested in isolation (CAS conflict, replayed register). Not wired to any device, because the app has no relay client; the transport (JSON POST) is a placeholder for the Durable Object WebSocket.
27. **Links: design.** The link layer has three paths (direct, super-host, relay; design 5.2), one connection per path per device, frames byte-identical on all. Seams:
    - **Primary, no app change: a TCP proxy per directed path** (`linkproxy.mjs`). Each device is handed proxy addresses instead of real peer addresses (and the relay stub's address through its own proxy), so `cut()`, `heal()`, `setLatency()` act on one device's one path while the others are unaffected, and the app's real reconnect, retry and presence logic runs. It can sever mid-frame. The rig has to supply peer addresses because same-wifi discovery does not exist in the app (design 5.2; T6); so Phase 1's link layer needs one config input, "peer address list" (a file in userData or an env var), used when set instead of discovery. That is the only app-side requirement.
    - **Frame-level faults (drop frame 7, duplicate, reorder, corrupt a signature):** inside S3 as a `Transport` test double used by the replicator's unit tests, not in the rig. The outer envelope (design 6.3 `{v, set, to, group, seq, bytes}`) is readable without keys, so a proxy COULD do group-aware faults if later wanted.
    - **Cut one path versus all:** one proxy each for direct, super-host, relay; "partition {A} from {B,C}" is cutting A's proxies to B and to C and leaving A to relay.
    - **Presence/offline timing (30 s, V3):** the rig must not wait 30 real seconds per test; expose the offline timeout as a setting the rig can shrink (a constant read from one place), otherwise use the proxy's `setLatency` plus real waits for the few V3 tests.
28. **Clocks.** Device clocks: `skew-preload.cjs` as above (any offset, live). Relay clock: `relay.setClock(fn)`. Both cover design 5.2 ("correctness never depends on comparing two devices' clocks; only two display matters do"). A test that stamps something with file mtime must not rely on the rig for skew.

### 3.10 The inventory tool

29. **What it lists per device** (built, `inventory.mjs`, streams each file): `{chat, version, segment, provider, slug, path, lines, bytes, chain, replyEnds, partialTailBytes, extras:{files, manifestHash}}`. Sources today: `~/.claude/projects/<slug>/<id>.jsonl` (provider `claude`) and `~/.youcoded/sessions/<slug>/<id>.jsonl` (`native`); chat id = `provider:sessionId`, main version id = chat id, segment 0. A line is the bytes through `\n`; a trailing partial line is not counted (S1). Reply end = an assistant line whose `stop_reason` is not `tool_use` (the app's own rule, `transcript-watcher.ts:219`).
30. **Chain hash, with the encoding the design left open pinned:** `h0 = SHA-256(utf8(versionId) ‖ uint32be(segment))`, `h[n] = SHA-256(h[n-1] as 32 raw bytes ‖ line n raw bytes)` (design 5.3 formulas; the byte encodings of `‖` and the segment are mine and should become the Phase 2 spec so rig and store agree).
31. **How two inventories diff** (`diff A B`, exit 0 only if all identical): per chat id one verdict: `identical`; `A-is-prefix-of-B` / `B-is-prefix-of-A` (with lines behind), decided by hashing the longer file at the shorter's line count; `split` with `firstDifferingLine` and `lineEndingsOnly` (T21's question: a CRLF versus LF difference is called out, not hidden); `only-in-A` / `only-in-B`. Given only two inventory JSON files (no homes) it reports "differs (heads only)". Demonstrated: A has 4 lines, B has 6 of the same chat, verdict `A-is-prefix-of-B`, behind 2 (`evidence/selftest.json`).
32. **Phase 2 extension (designed, not built):** a second source `store` that asks a device for S2 `listVersions()/head()/hashAt()` through the door, with the same output shape, plus `versions[]` per chat (several versions per chat id), per-version `segment`, the control-log head, and the parked/set-aside counts; `diff` then also compares control-log heads. Rig tests assert "inventories match" (design Phase 2 exit) by exit code.

## 4. What this changes in the design

- **3.7 Test rigs, first bullet.** Replace "They share `~/.claude` and the machine id, so two dev instances on one computer are not two devices. A two-device rig does not exist (pre-build item T1)." with: "`run-dev.sh` now gives each launch a private home (`~/.cache/youcoded-test-copies/<profile>/home`, card #17), but it needs a window and a profile has no machine id. The T1 rig (`prototypes/2026-11-14-mesh-phase0/T1/rig.mjs`) runs N windowless backends, each jailed (real home replaced by an empty decoy), with its own device id, hostname, clock and links."
- **5.1 Identity, last sentence.** Replace "That id is empty where the built app never ran, so the test rig (T1) assigns its own." with: "In a headless boot it is the same `device-id.json` that `getDeviceIdentity` reads and creates (`headless-boot.ts:192-193`), so a rig device is given an id by writing that file before boot. A desktop dev instance reads the built app's file and has none where the built app never ran."
- **5.10 Super-host, "To generalise" list.** Add two items: "`headless-boot.ts:139` and `:306` name the platform `android` (analytics and the device-registry row): a desktop super-host needs a platform value; and `RemoteServer` in local mode binds loopback only (`remote-server.ts:382-385`), so the Tailscale browser view needs the non-local mode started in the headless boot." (The second is from reading the code, not from a test.)
- **7.2 The switch.** Add: "The rig writes this setting into each device's home before boot; it is read from that home only." (No settings file for it exists yet, so this is a requirement on its location: inside the home or `userData`, never a path outside HOME.)
- **9, row T1 "How".** Add: "Isolation is by jail (bubblewrap) with the real home replaced by an empty decoy; proof is an empty decoy plus a positive control. Needs `bwrap` (Linux). Windows and macOS rigs are a separate job." Pass line unchanged.
- **9, rule for every later test.** Add one sentence to section 0 rule 2: "Rig run folders live outside the real home where possible (the app reads `CLAUDE.md`/`.git` in every parent of a chat's folder)."
- **5.2 Link layer.** Add the one requirement from 3.9: "A device takes its peer addresses from a config input when present, so tests can substitute cuttable proxies for discovery."

### Proposed app changes (NOT made; none needed to boot)

```diff
--- a/youcoded/desktop/src/main/headless/headless-boot.ts
+++ b/youcoded/desktop/src/main/headless/headless-boot.ts
@@ startDailyHeartbeat({ platform: 'android' });
-  startDailyHeartbeat({ platform: 'android' });
+  // WHY: the platform this backend runs on. 'android' stays the default (the phone app sets nothing); a test rig
+  // or a desktop super-host sets YOUCODED_HEADLESS_PLATFORM so the analytics and the device roster tell the truth.
+  const headlessPlatform = (process.env.YOUCODED_HEADLESS_PLATFORM || 'android') as 'android' | 'windows' | 'mac' | 'linux';
+  startDailyHeartbeat({ platform: headlessPlatform });
@@ upsertSelf(pr, { id: machineIdentity.id, platform: 'android' ...
-    ... platform: 'android' /* WHY: ... */ }
+    ... platform: headlessPlatform }
```
(Type of `platform` to be checked against `upsertSelf` and `startDailyHeartbeat` signatures; I did not compile this.) With `YOUCODED_NO_ANALYTICS=1` the first line has no network effect in the rig.

## 5. Needs Destin

Nothing user-visible. One note for the lead: the workspace `.gitignore` line 37 `*-phase*/` ignores every folder with "phase" in its name, which includes `docs/active/prototypes/2026-11-14-mesh-phase0/` and `docs/active/investigations/2026-11-14-mesh-phase0/`. `git check-ignore -v docs/active/prototypes/2026-11-14-mesh-phase0/T1/rig.mjs` confirms it, and `git status` does not list these files. They will not be committed or pushed unless the lead force-adds them or renames the folders, which breaks "never leave work only on this device".

## 6. Could not test here

- **macOS and Windows rigs.** Isolation here is bubblewrap (Linux only). `--no-jail` is environment-only; on Windows `os.homedir()` reads `USERPROFILE`, not `HOME` (see the comment at `sync-state.ts:178`), so the environment set would need `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`; untested.
- **Android.** No phone attached. The rig runs the phone's backend code on Linux with the Android assumptions left in place (3.3); nothing about the Keystore shim's real behaviour, battery or a real Node build on the phone is tested.
- **The native runtime with the fake provider** (3.8, item 24): reuse is designed from reading `fixture.mjs`/`fake-provider.mjs`, not run.
- **`--offline` mode.** Booting with no network works (ready in about 1.1 to 1.4 s, `evidence/proof-clean-stop-restart-offline.json`), but the host cannot reach a jailed device's private loopback, so `ping` and the relay stub do not work in that mode until a unix-socket bridge exists. Not built.
- **A device running 48 hours or on a Raspberry Pi** (T8); memory is one sample only: about 185 MB (with `YOUCODED_PROFILE`) to 220 MB (without) per idle device.
- **Whole-process clock skew** (mtimes, git, claude) needs `libfaketime`, not installed.
- **The real link layer, relay wire, S2 store, `decide`**: do not exist; only the stubs and seams above.
- Boot ready time varied 1.1 s to 6.9 s (6.9 s was the first `--no-jail` run while other work ran); one run only per setting, not a benchmark.
