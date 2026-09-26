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
- `youcoded-askpass` (mode 0755, `#!/bin/sh`): `ulimit -c 0` (review 2, E1), then
  `exec /usr/bin/env -i ELECTRON_RUN_AS_NODE=1 YOUCODED_ASKPASS_SOCKET="$YOUCODED_ASKPASS_SOCKET"
  "$YOUCODED_ASKPASS_RUNTIME" "$(dirname "$0")/askpass.cjs"`. **`env -i` is load-bearing
  (review 1, D1):** sudo forks askpass with its own unsanitised environment, so without it a
  command could set `NODE_OPTIONS=--require=evil.js` and run code inside the verified helper.
  The runtime is the app's own `process.execPath`, passed in the Bash env; **nothing about the
  runtime path or the environment is trusted** — verification (§3) checks the helper's real
  executable, its exact argv and its exact environment.
- `askpass.cjs`: FIRST makes itself unreadable to other processes (review 2, E1): Linux
  `prctl(PR_SET_DUMPABLE, 0)`, macOS `ptrace(PT_DENY_ATTACH)`, via koffi (loaded from the
  app's own node_modules); then refuses to continue if it is already being traced (Linux
  `/proc/self/status` TracerPid ≠ 0). A non-dumpable process cannot be ptrace'd or
  core-dumped by same-uid processes, so a command can neither attach to it nor crash it into
  a core file while it holds the password. Then it connects to `$YOUCODED_ASKPASS_SOCKET`, sends one JSON line
  `{v:1, pid: process.pid}`, reads one line back: `{ok:true, password}` → writes password +
  `\n` to stdout, overwrites its buffer, exits 0; `{ok:false}` or a closed socket → exits 1
  with nothing on stdout (sudo then fails with "no password was provided"). The wrapper
  never passes sudo's prompt argument on at all (R14).
- `electron-builder.yml` `asarUnpack` gains `node_modules/koffi/**` (review 3, F1: an unpacked
  script cannot resolve a module packed inside `app.asar` — proven with this repo's own
  asar + electron); a packaged-layout test builds the unpacked tree and loads koffi from the
  helper.
- Installed read-only for pacman/deb/rpm (`/opt/YouCoded/resources/app.asar.unpacked/…`,
  root-owned) and inside the read-only AppImage mount. In dev it is the worktree file.

### 2.2 `AskpassServer` — `desktop/src/main/harness/askpass-server.ts` (new)
- One per app. Listens on a unix socket in a 0700 directory: `$XDG_RUNTIME_DIR/youcoded/`
  on Linux (fallback `os.tmpdir()/youcoded-<uid>/`), `os.tmpdir()/youcoded-<uid>/` on macOS;
  socket file 0600; path includes the app pid so dev and live instances never collide.
- **Startup self-test (review 2, E6):** open a real loopback connection to the socket and
  check that `socket._handle.fd` is a valid fd whose peer credentials read back as this
  process. If it fails, the server does not start, the Bash env gets no `SUDO_ASKPASS`, the
  failure is logged, and sudo fails as it does today. There is no fallback to a
  self-reported pid.
- On each connection: take the peer's pid from the KERNEL (review 1, D3) — koffi FFI, the
  way `window-exclude-capture.ts` already calls into system libraries: Linux
  `getsockopt(fd, SOL_SOCKET, SO_PEERCRED)`, macOS `getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID)`,
  on the accepted socket's fd. The helper sends nothing but `{v:1}`; any pid it claims is
  ignored. Then run **verification (§3)**; on
  failure answer `{ok:false}`, log the reason (never a password), show NO card.
- On success, resolve which Bash call it belongs to (§3.4) and hand a `PasswordAsk`
  to that call's session: `{requestId: 'pw-'+uuid, command, via?, triesLeft?, specialist?}`.
- Pending asks live in **`PermissionBroker`'s pending map** (review 1, D4; made concrete by
  review 2, E4): `PendingAsk` gains `kind: 'permission' | 'password'`; `requestEventFor` takes
  the event type (`PermissionRequest` | `PasswordRequest`) instead of hardcoding it;
  `pendingEventsFor`'s replay and the 3 s re-announce walk both kinds unchanged; a password
  ask's `resolve` is never called with a decision — it is removed by
  `broker.withdraw(requestId)` (emitting `PasswordResolved`) when AskpassServer delivers,
  refuses or loses the socket. This gives password asks re-announce and replay because sudo never times out an
  askpass read (sudo `tgetpass.c`: `passwd_timeout`'s alarm wraps only the terminal read), so
  a lost card would otherwise hang the command forever. The server keeps only
  `requestId → {socket, sudoPid, callRoot}` for the write-back. When the
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
- `spawnEnv` drops only the app's own `ELECTRON_RUN_AS_NODE` (and blanks `NODE_V8_COVERAGE`).
  `NODE_OPTIONS`/`NODE_REPL_EXTERNAL_MODULE` are the user's settings and stay (2026-09-26:
  dropping them silently changed every command's behaviour); the helper's `env -i` and the
  exact-environment check are the guard.
- A process-wide `RunningCalls` map: root pid (the `setsid` leader = `child.pid`) →
  `{sessionId, toolCallId, specialist?}`, registered on spawn (foreground and background,
  surviving hand-off), removed on exit. Exit also triggers the forget step (§5).

### 2.4 Up front for visible sudo (R20)
- `harness-session.ts` step 3b gains the **admin floor** (§4). After the approval card
  returns allow for a call whose command visibly runs `sudo` (shell-words, §4), the session
  asks for the password BEFORE spawning: same `PasswordAsk` card, `command` = the approved
  command text (sudo and its options stripped), no `via`. The password is held in main as a
  `Buffer` keyed by toolCallId, and it is handed over only to a verified askpass connection
  from that call **whose sudo's own command line matches the approved command's sudo line**
  (review 3, F2); any other sudo in the call — a hidden one inside a downloaded script — gets
  the mid-command card instead. Wiped on first use, on call exit, and on Skip/Stop.
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


### 2.7 Handshake v2 — verify, then harden, then deliver (found while building, 2026-09-26)

A non-dumpable process's `/proc/<pid>/exe` and `/proc/<pid>/environ` are unreadable to other
processes of the same user — including the app — so a helper that hardens first can't be
verified. Order:
1. helper connects, sends `{"v":2}` as a plain process (holds nothing yet; `env -i` and
   `ulimit -c 0` already applied);
2. server verifies (§3) while exe/argv/environ are readable;
3. server sends `{"harden":true}`; helper goes non-dumpable, checks its own TracerPid, replies
   `{"hardened":true}`;
4. server re-checks TracerPid 0, starttime unchanged, and proves non-dumpability (opening
   `/proc/P/environ` now fails with EACCES);
5. only then the card is shown; the password is sent after the user confirms.
Steps 1–4 have short timeouts; step 5 none. Residual: a tracer that attaches and detaches
between 2 and 4 (ancestor-only under Yama scope 1, milliseconds wide) is not caught.

## 3. Verification — who may receive a password

Threat: the model runs arbitrary code as the user. It may (a) plant a fake `sudo` earlier in
`PATH`, (b) run our helper itself, (c) point `SUDO_ASKPASS` at its own script, (d) run a
second process that connects to the socket and claims to be a waiting helper, (e) supply
its own prompt text (`sudo -p`).

For a connection claiming pid P, ALL must hold, else refuse:
0. **Pin every process the chain reads (review 2, E7):** Linux opens a `pidfd_open()` for P,
   its parent and the call root, and records each `/proc/<pid>/stat` start time; after the
   chain, every start time is re-read and must be unchanged, else refuse. macOS records and
   re-checks `kinfo_proc` start times (`sysctl KERN_PROC_PID`). `RunningCalls` stores the
   root's start time, so a recycled root pid never matches.
1. **P is our helper, unmodified**: real executable of P == `process.execPath` (Linux
   `readlink /proc/P/exe`; macOS `proc_pidpath`); P's argv is EXACTLY
   `[execPath, <realpath of bundled askpass.cjs>]` (no `--require`, `--inspect`, …); P's
   environment is EXACTLY `{ELECTRON_RUN_AS_NODE, YOUCODED_ASKPASS_SOCKET}` — review 1, D1.
   Both are read as NUL-separated raw data: Linux `/proc/P/cmdline` + `/proc/P/environ`,
   macOS `sysctl(KERN_PROCARGS2)` via koffi — never `ps` text, which SIP blanks on macOS and
   which can't be parsed unambiguously (review 2, E2/E3). An unreadable result refuses. **The
   Mac half ships switched off until KERN_PROCARGS2 is proven on a real Mac with SIP on.**
   P's TracerPid (Linux) must be 0.
2. **P's parent is a genuine setuid sudo** — REDESIGNED 2026-09-26 (Destin found on his real
   machine: every real sudo call was refused, `reason:"proc-read-failed"`, right here).

   **Why the original check could never pass.** It read `/proc/<parent>/exe` (Linux
   `readlink`) to get the parent's real executable, then stat'd THAT path. sudo runs
   setuid-root, and the kernel clears the "dumpable" flag on any process that elevates
   privilege via a privileged exec — `/proc/<pid>/exe`, `/proc/<pid>/environ` and
   `/proc/<pid>/maps` all become `EACCES` to a reader whose EFFECTIVE uid differs from the
   target's, and this holds even when the reader's REAL uid matches (our own case exactly:
   we and sudo share a real uid, but sudo's effective uid is 0 and ours isn't). Confirmed
   empirically against `/proc/1` (always root-owned, always present, no sudo needed to
   check it): `readlink /proc/1/exe` and `cat /proc/1/environ` both fail `EACCES`, while
   `/proc/1/status`, `/proc/1/comm`, `/proc/1/cmdline` and `/proc/1/stat` of the SAME pid
   all stay readable. So this check, as originally written, could never observe a genuine
   sudo's exe path in production — it worked only in the fakes-based test suite, which never
   modeled the EACCES a real kernel enforces here. Pinned by `tests/proc-info.test.ts`
   (`createProcReader('linux')` against pid 1) and by `tests/askpass-verify.test.ts`'s
   `goodProcs()` fixture, which now deliberately fakes the parent's own exe/environ as
   unreadable (`null`) precisely so the accept-path tests can never regress into depending
   on a read that will not exist in reality.

   **What it checks now**, using only what stays readable for a setuid process we did not
   create:
   - `/proc/<parent>/status`'s `Uid:` line: **effective uid must be 0** (the kernel sets this
     ONLY via `execve()` of an actual root-owned setuid regular file — unforgeable by an
     attacker without root), and **real uid must be OURS** (otherwise this euid-0 process
     belongs to a different user and has nothing to do with our call).
   - `/proc/<parent>/comm` must read `sudo` — set by the KERNEL from the EXECUTED FILE's own
     basename at exec time, never from the caller-supplied `argv[0]`, which is what keeps
     this a meaningful identity signal despite (a) below.
   - `/proc/<parent>/cmdline`'s `argv[0]`: attacker-choosable at exec time (a caller of
     `execve()` picks the new process's argv independently of which file actually gets
     mapped), so it is NEVER trusted as identity by itself — only, when it happens to be
     absolute, as a candidate PATH to run the SAME ownership/setuid/writability/directory-
     chain check item 2 always required. A bare name (the common case — a shell passes
     `argv[0]` exactly as typed, not the path its own PATH lookup resolved) falls back to a
     FIXED, never-PATH-derived list of well-known install locations
     (`/usr/bin/sudo`, `/usr/local/bin/sudo`, `/bin/sudo` today), using whichever one this
     machine actually has and passes those same checks. **Never a PATH lookup performed by
     us** — repeating the shell's own lookup is exactly attack (a) (a fake `sudo` earlier in
     `PATH`), and effective-uid-0 already rules out anything that isn't a real root-owned
     setuid file regardless.

   **Why this is still sound without reading the real exe path.** Achieving effective uid 0
   is a kernel-enforced fact, not a claim: it requires having `execve()`'d an actual
   root-owned setuid regular file, and an attacker without root privileges cannot create,
   relocate or retroactively bless one. Once such a file IS exec'd, the attacker's own code
   is gone — the new image's real code is what runs from that instant, so it cannot then
   call `prctl(PR_SET_NAME, "sudo")` or otherwise fake being sudo; only the REAL sudo binary
   (or another genuine setuid-root program that happens to be named `sudo` and sits under the
   fixed list — which nobody but root can arrange) satisfies `comm == 'sudo'` post-exec.

   **Accepted residual weakening vs. the original design** (stated rather than silently
   accepted, matching this section's own posture elsewhere): the original readlink-based
   check bound the ownership/setuid/writability chain to the EXACT file the kernel executed;
   this redesign binds it to either (i) an attacker-influenceable `argv[0]` string (when
   absolute) or (ii) a location WE chose in advance (when bare) — in either case, a real
   improvement over trusting nothing, but not the same cryptographic tightness as reading the
   kernel's own resolved path. A distro installing `sudo` somewhere outside the fixed list
   needs an entry added there or the feature refuses every real sudo on that machine (loud
   and logged — never a silent bypass, same "sudo fails as it does today" posture §2.2
   already commits to).
3. **P is inside a registered Bash call**: walking P's ancestors (Linux `/proc/*/stat`
   ppid; macOS `ps -o ppid=`) reaches a root pid in `RunningCalls` within 64 steps.
4. **The pid is the kernel's** (§2.2), so (d) — another process claiming a waiting
   helper's identity — is closed.
5. The card text comes only from the sudo process's own argv (`/proc/<sudo>/cmdline`, macOS
   `ps -o args=`), with sudo and its options removed by `shell-words` WRAPPERS rules; never
   from the helper, never from `-p` (e, R14).

**Residual risk (stated on the deck, S-real-sudo, accepted):** the helper is non-dumpable
before it holds anything (E1), which closes ptrace and core dumps; what remains is code
that already has root, or a kernel/Electron flaw. The password also passes through sudo's
own pipe and memory, which are root's.

## 4. The admin floor (R7, R16)

New `harness/tools/admin-command.ts`: `adminCommandVerdict(command)` → `'admin' | null`,
using `shell-words.ts` to find any simple command whose command word basename is `sudo`,
`doas`, `su`, `pkexec` or `run0` (after wrappers, in pipelines, subshells, `bash -c` scripts,
`$(…)`). Wired into step 3b beside the rm/secret floors, with precedence: admin first
(it names the more serious consequence), so `floorStop: 'admin'` → band in every mode,
Always Allow hidden, nothing remembered (existing floor behaviour). Fixes today's gaps
(`/usr/bin/sudo`, `echo x|sudo tee`, `(sudo x)` are not deny-listed).
**`doas`, `su`, `pkexec`, `run0` are refused outright** (review 1, D2): `pkexec`/`run0` would
raise the desktop's own polkit dialog on a normal GNOME/KDE session — a system pop-up
outside the app (R1) with wording the app doesn't control (R14). The refusal is a deny with
a message to the model ("use sudo; the user is asked for their password in the app"); the
card shows the command as not run. Like every floor, this reads shell syntax, not the
inside of an interpreter: `python3 -c "os.execvp('pkexec', …)"` still reaches polkit
(review 2, E9). That is the known limit of floors ("honest friction, not a sandbox"). R20's "visible sudo" = this verdict with
command word `sudo`.

## 5. Forgetting (R5)

When the LAST registered call that received a password exits (a `Set<toolCallId>` of calls
that received at least one password, added to once per call and removed on exit, so it
can't drift when one call authenticates twice — review 2, E5;
review 1, D6: `-K` clears every record, so running it on each exit would make a still-running
admin command re-ask), run `<the verified sudo> -K` (no password needed; removes all of this user's sudo timestamps).
Also on app quit. Cost accepted on the deck: the user's own terminal forgets too. While a
command runs, sudo's own per-parent-process memory applies (a second sudo from the same
shell doesn't re-ask) — that is inside the one command the user approved. A sudo under a
different parent in the same command (a pipeline stage, a subshell) keys a separate record
and asks again through the mid-command card (review 1, D7) — intended.

## 6. Tries, timeouts, withdrawal (R9, R10, R17, R18)

- A second helper under the same sudo pid = the previous password was wrong →
  `triesLeft = 3 − previousAttempts` (sudo's default `passwd_tries`; a sudoers override
  just means the count is off — the banner never claims certainty beyond "tries left").
- sudo never times out an askpass read (review 1, D4, sudo `tgetpass.c`), so the ask waits
  for the user (R18). If the helper's socket closes anyway (command killed) →
  `PasswordResolved` → the card's field goes away and the tool result says what happened.
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

## 11. Build order (each task: builder subagent, then a reviewer; both check `.claude/rules/performance.md`)

1. **Admin floor** — `harness/tools/admin-command.ts` + step 3b wiring (sudo → band, never
   remembered; doas/su/pkexec/run0 → refused with a message) + `admin-command.test.ts`.
2. **Helper + packaging** — `scripts/askpass/youcoded-askpass` (0755) + `askpass.cjs`
   (non-dumpable first, TracerPid check), `asarUnpack` koffi, packaged-layout test.
3. **AskpassServer** — socket dir/permissions, startup self-test, kernel peer pid via koffi,
   verification chain with pinning (§3), `RunningCalls`, fakes-based `askpass-verify.test.ts`
   + real-socket `askpass-server.test.ts`. macOS path behind an off switch.
4. **Broker + events + IPC + renderer** — `PendingAsk.kind`, `PasswordRequest/Resolved`,
   `native:submit-admin-password` on five surfaces + parity test, reducer actions, real
   `onSubmit`, withdrawn state, buddy strip text, mock shim entries moved from MOCK_ONLY.
5. **Bash integration** — env vars (after `shellEnvIn`, never persisted, NODE_OPTIONS-class
   drop), `RunningCalls` registration incl. hand-off, up-front flow with argv match, forget
   Set + `sudo -K`, `ShellRunView.admin`, Bash description text, `bash-env.test.ts`.
6. **Leak test + real sudo end to end** — `admin-password-leak.test.ts`; a docker container
   with a throwaway user and known password runs the helper + a real sudo against a
   headless AskpassServer harness. Never Destin's account.
