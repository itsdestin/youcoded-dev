---
status: draft
feature: admin-password
contract: docs/active/design/2026-09-25-admin-password/admin-password.contract.json
branch: session/sudo-prompt (youcoded + youcoded-dev)
---

# Admin password card — technical design

The approved UI (contract rows R1–R20, workbench mockups on `session/sudo-prompt`) is the
contract. This document says how the native runtime makes it real. Native runtime only,
desktop Linux + macOS. Windows and Android change nothing but channel stubs (R19).

## 1. The mechanism in one paragraph

Every native Bash command gets `SUDO_ASKPASS=<bundled helper>` in its environment. sudo
uses an askpass helper whenever it has no terminal (`sudo(8)`: "SUDO_ASKPASS … used to read
the password if no terminal is available or if the -A option is specified" — verified in
the local manual, sudo 1.9.17p2), and native Bash commands never have one (`spawnDetached` →
`setsid`). So any `sudo` inside the command — typed by the model or buried in a script —
runs our helper. The helper connects to a socket the app owns, the app **verifies the
helper really is our helper and that its parent really is the system's sudo**, asks the
user on the card, and writes the password back. The helper prints it to stdout (which is a
pipe to sudo, never to the model) and exits. When the command ends the app runs
`<sudo> -K` so the computer forgets (R5).

## 2. Components

### 2.1 The helper — `desktop/scripts/askpass/` (unpacked by `asarUnpack: scripts/**/*`)
- `youcoded-askpass` (mode 0755, `#!/bin/sh`): `ELECTRON_RUN_AS_NODE=1 exec
  "$YOUCODED_ASKPASS_RUNTIME" "$(dirname "$0")/askpass.cjs"`. The runtime is the app's own
  `process.execPath`, passed in the Bash env. **Nothing about the runtime path is trusted**:
  verification (§3) checks the helper process's real executable.
- `askpass.cjs`: connects to `$YOUCODED_ASKPASS_SOCKET`, sends one JSON line
  `{v:1, pid: process.pid}`, reads one line back: `{ok:true, password}` → writes password +
  `\n` to stdout, overwrites its buffer, exits 0; `{ok:false}` or a closed socket → exits 1
  with nothing on stdout (sudo then fails with "no password was provided"). It never
  receives sudo's prompt argument over the wire (it ignores `argv[2]`, R14).
- Installed read-only for pacman/deb/rpm (`/opt/YouCoded/resources/app.asar.unpacked/…`,
  root-owned) and inside the read-only AppImage mount. In dev it is the worktree file.

### 2.2 `AskpassServer` — `desktop/src/main/harness/askpass-server.ts` (new)
- One per app. Listens on a unix socket in a 0700 directory: `$XDG_RUNTIME_DIR/youcoded/`
  on Linux (fallback `os.tmpdir()/youcoded-<uid>/`), `os.tmpdir()/youcoded-<uid>/` on macOS;
  socket file 0600; path includes the app pid so dev and live instances never collide.
- On each connection: read ≤ 256 bytes, parse `{pid}`, run **verification (§3)**; on
  failure answer `{ok:false}`, log the reason (never a password), show NO card.
- On success, resolve which Bash call it belongs to (§3.4) and hand a `PasswordAsk`
  to that call's session: `{requestId: 'pw-'+uuid, command, via?, triesLeft?, specialist?}`.
- Holds pending asks in a Map keyed by requestId → `{socket, sudoPid, callRoot}`. When the
  socket closes first (sudo gave up, command killed) the ask is withdrawn (§6).
- `submit(requestId, password: Buffer)`: writes `{ok:true,password}` to that socket, then
  `password.fill(0)`. A requestId it doesn't hold → `false` (card says it expired).

### 2.3 Bash env + call registry — `harness/tools/bash.ts`, `harness/shell-registry.ts`
- `spawnEnv` gains (POSIX only, when the askpass server is up) `SUDO_ASKPASS`,
  `YOUCODED_ASKPASS_SOCKET`, `YOUCODED_ASKPASS_RUNTIME`. Applied AFTER `shellEnvIn`, so a
  `persistent_env` from an earlier call can't point these elsewhere. (A command can still
  override them for itself — `SUDO_ASKPASS=x sudo -A …` — which only means its own helper
  runs and the app is never asked; nothing leaks.)
- `diffPersistableEnv` must drop these three names so they are never persisted.
- A process-wide `RunningCalls` map: root pid (the `setsid` leader = `child.pid`) →
  `{sessionId, toolCallId, specialist?}`, registered on spawn (foreground and background,
  surviving hand-off), removed on exit. Exit also triggers the forget step (§5).

### 2.4 Up front for visible sudo (R20)
- `harness-session.ts` step 3b gains the **admin floor** (§4). After the approval card
  returns allow for a call whose command visibly runs `sudo` (shell-words, §4), the session
  asks for the password BEFORE spawning: same `PasswordAsk` card, `command` = the approved
  command text (sudo and its options stripped), no `via`. The password is held in main as a
  `Buffer` keyed by toolCallId, and the first verified askpass connection from that call
  gets it without a card. Wiped on first use, on call exit, and on Skip/Stop.
- If that password is wrong, sudo runs the helper again (same sudo pid) → a card with
  `triesLeft` (§6).

### 2.5 Events and IPC
- New hook event type `PasswordRequest` `{requestId, toolUseId, command, via?, triesLeft?,
  specialist?}` and `PasswordResolved {requestId}` — routed exactly like
  `PermissionRequest` (broker → `hook:event` → renderer + `remoteServer` broadcast) but
  **NOT** added to the remote `hookBuffers` replay beyond the live ask, and no password
  field ever exists on them.
- Renderer: reducer actions `PASSWORD_REQUEST` / `PASSWORD_RESOLVED` set/clear
  `ToolCallState.passwordAsk` (type already mocked). Specialist asks nest like permission
  asks (R16).
- New channel `native:submit-admin-password (requestId, password: string) → boolean` on all
  five surfaces: `ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts` WS
  case (R6), `SessionService.kt` (not-implemented stub). Guarded by `ipc-channels.test.ts`.
  Main converts to a Buffer immediately; the string is not stored, logged or echoed.
- `native:admin-run-state` is not needed: `ShellRunView.admin` rides the existing
  `SHELL_RUN_CHANGED` event.

### 2.6 Renderer
- `AdminPasswordPrompt` (mocked) gets `onSubmit` → `submitAdminPassword`; clears its state
  on send (done). Wrong-try re-render keyed on `triesLeft` (done).
- A card whose ask was withdrawn shows the ask as ended; no field.
- `AdminRunStrip` (mocked) → real `ShellRunView.admin`.
- Buddy compact strip (`CompactToolStrip.tsx`): shows "Enter your password in YouCoded"
  with a jump, never a field (a third surface for a secret is a third place to leak).

## 3. Verification — who may receive a password

Threat: the model runs arbitrary code as the user. It may (a) plant a fake `sudo` earlier in
`PATH`, (b) run our helper itself, (c) point `SUDO_ASKPASS` at its own script, (d) run a
second process that connects to the socket and claims to be a waiting helper, (e) supply
its own prompt text (`sudo -p`).

For a connection claiming pid P, ALL must hold, else refuse:
1. **P is our helper**: real executable of P == `process.execPath` (Linux
   `readlink /proc/P/exe`; macOS `proc_pidpath` via `ps -o comm= -p P`, full path), and
   argv[1] of P == the realpath of our bundled `askpass.cjs`.
2. **P's parent is the system's genuine sudo**: parent executable ∈ trusted sudo set,
   computed once at startup from `/usr/bin/sudo`, `/bin/sudo`, `/usr/local/bin/sudo`: a
   realpath'd regular file owned by uid 0, setuid bit set, not group/other-writable, in a
   root-owned directory. A fake `sudo` in `~/bin` fails this (a); a script that runs our
   helper itself fails it (b); a model-supplied `SUDO_ASKPASS` never reaches us at all (c).
3. **P is inside a registered Bash call**: walking P's ancestors (Linux `/proc/*/stat`
   ppid; macOS `ps -o ppid=`) reaches a root pid in `RunningCalls` within 64 steps.
4. **One claim per pid**: a second connection claiming a pid that already has a pending or
   answered ask is refused, and the first ask is withdrawn too (d, best effort).
5. The card text comes only from the sudo process's own argv (`/proc/<sudo>/cmdline`, macOS
   `ps -o args=`), with sudo and its options removed by `shell-words` WRAPPERS rules; never
   from the helper, never from `-p` (e, R14).

**Residual risk (stated on the deck, S-real-sudo, accepted):** code already running inside
the approved command's own process tree can still read the password as it passes (ptrace
of the helper, which it is an ancestor of, or racing (d) with the exact pid while an ask is
pending). The same holds when a user types sudo in a terminal after running untrusted code.
Linux `SO_PEERCRED` would close the pid-claim race; Node has no API for it — noted as a
follow-up, not a blocker.

## 4. The admin floor (R7, R16)

New `harness/tools/admin-command.ts`: `adminCommandVerdict(command)` → `'admin' | null`,
using `shell-words.ts` to find any simple command whose command word basename is `sudo`,
`doas`, `su`, `pkexec` or `run0` (after wrappers, in pipelines, subshells, `bash -c` scripts,
`$(…)`). Wired into step 3b beside the rm/secret floors, with precedence: admin first
(it names the more serious consequence), so `floorStop: 'admin'` → band in every mode,
Always Allow hidden, nothing remembered (existing floor behaviour). Fixes today's gaps
(`/usr/bin/sudo`, `echo x|sudo tee`, `(sudo x)` are not deny-listed).
`doas/su/pkexec/run0` get the stop band but no password card (they can't use askpass; they
fail as today) — the Bash description says so. R20's "visible sudo" = this verdict with
command word `sudo`.

## 5. Forgetting (R5)

When a registered call that received a password exits (or its admin background run ends),
run `<trusted sudo> -K` (no password needed; removes all of this user's sudo timestamps).
Also on app quit. Cost accepted on the deck: the user's own terminal forgets too. While a
command runs, sudo's own per-parent-process memory applies (a second sudo from the same
shell doesn't re-ask) — that is inside the one command the user approved.

## 6. Tries, timeouts, withdrawal (R9, R10, R17, R18)

- A second helper under the same sudo pid = the previous password was wrong →
  `triesLeft = 3 − previousAttempts` (sudo's default `passwd_tries`; a sudoers override
  just means the count is off — the banner never claims certainty beyond "tries left").
- sudo may stop waiting on its own (`passwd_timeout`, default 5 min — **verify in a
  throwaway VM whether it applies to askpass; never on Destin's machine**, a failed read can
  count toward the lockout). Either way the helper's socket closes → `PasswordResolved` →
  the card's field goes away and the tool result says what happened. The card itself has
  no timer (R18).
- Stop / Skip / session close / app quit: pending sockets answered `{ok:false}`, stored
  up-front passwords wiped.

## 7. Running as admin (R12)

`ShellRegistry` marks a run `admin: true` once a password was delivered for its call and
sudo did not ask again within 1 s (i.e. it was accepted); cleared when the run exits.
Emits through the existing `SHELL_RUN_CHANGED`. Stop = existing `killShell` (sudo relays
the signal to its command). A daemon that fully detaches is outside the process group
(risk accepted on the deck).

## 8. What the model sees

- Bash description: sudo works; the user types the password in the app; never pass
  passwords, `-S` or `-A`, never set `SUDO_ASKPASS`; `su/doas/pkexec/run0` don't work.
- Tool result: sudo's own output only. The helper writes nothing but the password, and only
  to sudo's pipe.

## 9. Tests (make R13–R15 mechanical where possible)

- `askpass-verify.test.ts`: fake `/proc` readers → refuses wrong exe, wrong argv, fake sudo
  (not setuid / not root-owned / user-writable dir), outside any call, duplicate pid;
  accepts the genuine chain.
- `askpass-server.test.ts`: real unix socket, stub verifier; the password is written once,
  the Buffer is zeroed, withdrawn on close, `submit` of unknown id → false.
- `admin-password-leak.test.ts` (R13): drive a whole ask with a sentinel password through
  broker, IPC handler and remote WS handler with every logger/emit spied → the sentinel
  appears only in the socket write.
- `admin-command.test.ts`: the floor on the hostile shapes above + everyday non-sudo
  commands (reuse `shell-words.test.ts` sweep).
- `bash-env.test.ts`: the three vars present, win over `persistent_env`, never persisted.
- `ipc-channels.test.ts` parity for the new channel; `mock-shim` MOCK_ONLY entry removed.
- Real-sudo end to end: only in a disposable VM/container with a known password — never
  against Destin's account.

## 10. Out of scope

API keys / `.env` (next project), GitHub/SSH logins, Windows elevation, Android.
