---
status: active
feature: admin-password
review-round: task5
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
contract: docs/active/design/2026-09-25-admin-password/admin-password.contract.json
commit: 0dd61a25b
---

# Admin password card — task 5 (Bash integration) — security review

Scope: `desktop/src/main/harness/tools/bash.ts`, `shell-registry.ts`, `harness-session.ts`,
`native-session-host.ts`, `askpass/running-calls.ts`, `askpass/admin-forget.ts` (new),
`askpass/askpass-server.ts` (sudoExePath only), `askpass/proc-info.ts`/`askpass/verify.ts`
(knip un-exports only), `tools/admin-command.ts`, `tools/types.ts`, `ipc-handlers.ts`,
`main-blocking-calls.allowlist.json`, `line-budgets.json`, and the new/extended tests, commit
`0dd61a25b`.

`npx vitest run tests/bash-env.test.ts tests/admin-forget.test.ts
tests/admin-password-service.test.ts tests/shell-registry.test.ts
tests/harness-session-loop.test.ts tests/main-blocking-calls.test.ts`: **261 passed (6
files), 0 failed.** All green — none of them exercise the real app-start wiring
(`ipc-handlers.ts` → `NativeSessionHost.attachAdminPassword`), which is where T5-1 lives.

## T5-1 accepted — Critical — `SUDO_ASKPASS` is wired to the wrong file; sudo cannot work at all

**File/line:** `desktop/src/main/harness/native-session-host.ts:2394`
(`attachAdminPassword`), fed by `desktop/src/main/ipc-handlers.ts:373-391`
(`resolveAskpassScript`) and `:3082-3092` (the wiring call).

**Problem:** `SUDO_ASKPASS` — the one variable `sudo(8)` itself execve()s when it needs a
password with no tty — is set to the realpath of `scripts/askpass/askpass.cjs`. It must be
the realpath of the shell wrapper `scripts/askpass/youcoded-askpass`, a *sibling* file. The
design (§2.1) is explicit that `youcoded-askpass` is "the SUDO_ASKPASS target" and that
`askpass.cjs` is what the wrapper `exec`s into only *after* it has scrubbed the environment
(`env -i`) — the wrapper's own header comment calls that scrub "load-bearing" against a
`NODE_OPTIONS=--require=evil.js`-class attack (review 1, D1).

**Evidence:**
- `verify.ts:95-97` and `askpass-server.ts:102-103` both document `helperScriptRealpath` as
  "Real path of the shipped `askpass.cjs`" — this is the value `resolveAskpassScript()`
  computes (`path.join('scripts', 'askpass', 'askpass.cjs')`) and the *same* value
  `attachAdminPassword` assigns to `SUDO_ASKPASS`.
- On disk, `scripts/askpass/askpass.cjs` is `-rw-r--r--` (no execute bit) and its first line
  is `'use strict';` (no shebang). `sudo` execve()-ing this path fails outright — the feature
  cannot work at all, in dev or packaged, on any platform this ships to.
- `scripts/askpass/youcoded-askpass` is `-rwxr-xr-x` and is exactly the file described in
  design §2.1 (`#!/bin/sh`, `ulimit -c 0`, then `exec env -i … "$YOUCODED_ASKPASS_RUNTIME"
  "$dir/askpass.cjs"`).
- The Docker e2e test's own hand-rolled harness (`tests/e2e/admin-password-docker.test.ts`,
  inside `HARNESS_TS`) sets `SUDO_ASKPASS: path.join(__dirname, 'scripts', 'askpass',
  'youcoded-askpass')` — i.e. it builds the env correctly *by hand*, which is a second,
  independent confirmation of what the real wiring should have done and didn't.
- `tests/bash-env.test.ts:28` hardcodes `ADMIN_ENV.SUDO_ASKPASS` as
  `'/opt/YouCoded/resources/app.asar.unpacked/scripts/askpass/askpass.cjs'` — the test fixture
  bakes in the same wrong value, which is exactly why no test caught this (see T5-2).

**Why this is more than "it just fails safe":** it does fail safe today (sudo errors out,
no password is ever typed into a broken pipe) — but the *fix* is not "make `askpass.cjs`
executable with a shebang." Doing that would restore functionality while silently deleting
the wrapper's `env -i` step, which is the actual control against a command-supplied
`NODE_OPTIONS`/`ELECTRON_RUN_AS_NODE` reaching the verified helper (design §2.1, review 1
D1). The fix must route through the wrapper, not around it.

**Fix:** in `ipc-handlers.ts`, compute the wrapper's realpath as a sibling of
`helperScriptRealpath` (e.g. `fs.realpathSync(path.join(path.dirname(helperScriptRealpath),
'youcoded-askpass'))`) and pass *that* to `attachAdminPassword` for the `SUDO_ASKPASS` value;
keep `helperScriptRealpath` (askpass.cjs's path) flowing to `AskpassServer` unchanged, since
that half (the argv[1] check in `verify.ts`) is correct. Then fix the `bash-env.test.ts`
fixture (T5-2) to match.

## T5-2 accepted — High — nothing, including the never-run e2e test, would have caught T5-1

**File:** `desktop/tests/e2e/admin-password-docker.test.ts`; `desktop/tests/bash-env.test.ts`.

**Problem:** the Docker e2e test is a good exercise of the askpass *protocol*
(`AskpassServer` + the real wrapper + a real `sudo`), but its container harness builds
`SUDO_ASKPASS` and the rest of the env itself, by hand, rather than calling
`ipc-handlers.ts`'s `resolveAskpassScript()` / `NativeSessionHost.attachAdminPassword()`. So
even with `YOUCODED_DOCKER_E2E=1`, this test would pass whether or not the real wiring code
is correct — it has zero coverage of the exact bug in T5-1. `bash-env.test.ts` only asserts
that whatever value lands in `ctx.adminPasswordEnv` passes through into the spawned process's
env unchanged (task 5's actual scope), which is a legitimate thing to test on its own, but
its `ADMIN_ENV` fixture is hand-written to the (wrong) production value, so it can't catch
the assembly bug either — no test anywhere calls `resolveAskpassScript()` or
`attachAdminPassword()` together and checks the resulting `SUDO_ASKPASS`.

**Fix:** add a small, fast, no-Docker-needed test — e.g. in `ipc-handlers.test.ts` or a new
`admin-password-wiring.test.ts` — that fakes `AskpassServer.start()`/`socketPath`, calls
`resolveAskpassScript()` + `attachAdminPassword()` for real, and asserts
`adminPasswordEnv.SUDO_ASKPASS` ends in `/youcoded-askpass` and is NOT
`helperScriptRealpath`. This is exactly the seam T5-1 broke and the only one of the ~40 new
test cases in this task that would have caught it.

## T5-3 accepted — Medium — new `main-blocking-calls.allowlist.json` entry violates the "may only shrink" invariant

**File/line:** `desktop/tests/main-blocking-calls.allowlist.json` (new entry for
`ipc-handlers.ts` `resolveAskpassScript` / `fs.realpathSync`); `desktop/src/main/ipc-handlers.ts:382-391`.

**Problem:** `.claude/rules/performance.md` rule 1 states the allowlist "may only shrink."
This commit adds a brand-new entry for a brand-new blocking call. `main-blocking-calls.test.ts`'s
own in-file comment (`HOW_TO_FIX`) says a "tiny and rare" startup call may be allowlisted, so
the mechanical guard doesn't fail — but the workspace rule is the authority the task brief
explicitly asked to check against, and it does not carve out a startup exception. Whether or
not this specific call is genuinely harmless (it runs once, at app start, off any click/IPC/
timer path — it likely is), adding to this list is the thing rule 1 says never to do.

**Fix:** use the async form instead, which needs no allowlist entry at all:
`await fs.promises.realpath(base)`, making `resolveAskpassScript` return a `Promise<string |
null>` (its only call site already sits inside an async/`.then` flow next to
`askpassServer.start().then(...)`, so this is a small, local change). Then drop the new
allowlist entry.

## T5-4 accepted (set only on the accepted signal) — Medium — `ShellRegistry.admin` can be seeded true from a delivery that turns out wrong

**File/line:** `desktop/src/main/harness/shell-registry.ts` (`register()`: `admin:
this.runningCalls.hasGranted(spec.toolUseId)`); `desktop/src/main/harness/askpass/running-calls.ts`
(`markGranted`/`hasGranted`).

**Problem:** design §7 defines "admin" (the "Running as admin" strip, R12) as "a password
was delivered … and sudo did NOT ask again within ~1s (i.e. it was accepted)." The live
foreground path honors that: `AdminPasswordService.scheduleAcceptance` only fires `'accepted'`
after the 1s window, and `NativeSessionHost.attachAdminPassword`'s listener is what calls
`ShellRegistry.markAdmin`. But `RunningCalls.markGranted` — the thing `hasGranted` reads — is
called immediately on *every* delivery attempt, right or wrong (both in
`AdminPasswordService.submit()` and in the up-front hold-match branch of `onAsk()`), with no
gate on whether sudo re-asks a moment later. `ShellRegistry.register()` seeds `run.admin =
true` straight from `hasGranted`, so a background start or hand-off registered in the window
right after a submitted password — while it's still possible sudo is about to ask again for
the same pid because that password was wrong — shows "Running as admin" before anything was
actually accepted. This is deliberate and explicitly tested (`shell-registry.test.ts`:
"seeds admin: true at registration when RunningCalls already granted this toolCallId (the
up-front-then-background case)"), so it's a known simplification, not an oversight — but it
is not listed among §3/§7's stated residual risks, and it weakens R12/R9's "Running as admin"
signal to "a password was sent," not "a password worked."

**Fix (pick one):** either track acceptance (not mere delivery) per toolCallId in
`RunningCalls` and seed from that instead of `hasGranted`, or add this window to the design
doc's residual-risk language so it's an accepted tradeoff rather than an implicit one.

## T5-5 rejected (a sudo with the exact approved command text runs exactly what the user approved; the argv match is the design's intended boundary, review 3 F2) — Low/Medium — the up-front hold matches by argv text, not by "this is the approved line's own invocation"

**File/line:** `desktop/src/main/harness/admin-password-service.ts` (`onAsk()`'s hold-match
branch, `argvEquals`).

**Problem:** design §2.4 states a "hidden sudo elsewhere in the same call (a downloaded
script)" is supposed to get the ordinary mid-command card, never the silently-consumed
up-front password. The implementation enforces this only by comparing the connecting sudo's
*argv* against `expectedArgvLines` — any sudo invocation anywhere in the call whose argv is
textually identical to an approved line consumes the hold silently, regardless of whether it
is literally the approved line or a different piece of the same call (a hidden script segment
that happens to run, or is crafted to run, the same command text). The practical impact is
limited — the action taken is the same one the user already saw and approved — but the
guarantee as written ("a hidden sudo … gets the mid-command card instead") is not what's
implemented, and this specific gap isn't named in §3's "Residual risk" paragraph the way the
real-sudo residual is.

**Fix:** at minimum, add this to the design doc's accepted-residual list; tightening it
further would need some notion of "the FIRST simple-command position" rather than argv
equality, which the design doesn't currently track.

## T5-6 accepted (a verify miss on a not-yet-registered root must wait briefly for registration, not refuse) — Low — `registerPid`'s fire-and-forget async registration is a narrow race, not a leak

**File/line:** `desktop/src/main/harness/tools/bash.ts` (foreground path: `void
ctx.runningCalls.registerPid(child.pid, …)`).

**Problem:** registration reads the pid's start time asynchronously
(`ProcReader.startTime`, a `/proc/<pid>/stat` read) and is not awaited before the shell
continues running. If a command's very first statement is a `sudo -A …` that reaches
`AskpassServer`'s verification before this read resolves, `verify.ts` item 3 ("P is inside a
registered call") fails and a legitimate sudo is refused (fails safe — no leak, just a
false-negative ask failure). Low probability (both are fast local reads), but worth a note
since it's exactly the kind of thing that would show up as an intermittent "sudo just didn't
ask" report.

**Fix:** none required for security; consider a regression test under artificial `/proc`
read latency, or awaiting registration before returning from the spawn call on paths where
`adminCommandVerdict` already flagged the command as admin.

## Not flagged (checked, found correct)

- **Env ordering/denylist (§2.3):** `spawnEnv` applies `adminPasswordEnv` strictly after
  `shellEnvIn`/`persistent_env`; `ENV_PERSIST_DENYLIST` gained the three names so
  `diffPersistableEnv` can never persist them forward; `NODE_OPTIONS`/
  `NODE_REPL_EXTERNAL_MODULE`/`ELECTRON_RUN_AS_NODE` are deleted and `NODE_V8_COVERAGE` is set
  to `''` (verified empirically per its own comment that `delete` doesn't stick) on every Bash
  call unconditionally.
- **Argv matching for R20 (`sudoRealArgv`/`visibleSudoLines`):** both go through the same
  `stripSudoOptionsFromArgv`, sharing `WRAPPERS.sudo.valueFlags` (includes `-u`/`--user`, `--`,
  etc.), so `sudo -u root cmd`, `sudo -- cmd` and long-form flags strip consistently between
  the approval-time shell-text parse and the verification-time real-argv read.
- **Wipe-on-exit coverage:** `wipeUpfront` is called from every Bash early-return (`persistent_env`
  + background, missing `ctx.shells`, background-start failure, sync spawn throw, Luna-jail
  refusal) and from both real "this call is over" listeners (`close`/`error`), and again from
  `ShellRegistry.onExit` for the hand-off/background path; the hand-off branch removes those
  same two listeners *before* `adopt()`, so cleanup never double-fires across the ownership
  handoff.
- **Forget (§5):** `RunningCalls.release()` returns true only on the non-empty→empty
  transition; `forgetOnCallExit`/`forgetOnQuit` run `execFile(verifiedSudoPath, ['-K'])`
  (async, never blocks the main thread; never a PATH lookup; never needs a password) and quit
  additionally answers every open ask `{ok:false}` via `AskpassServer.stop()`.
- **RunningCalls registration lifecycle:** foreground registers/unregisters directly in
  `bash.ts`; background/hand-off registers/unregisters in `ShellRegistry.start()`/`onExit()`
  against the *same* shared instance (`NativeSessionHost.runningCalls`); a recycled pid can't
  match because `RunningCallEntry.startTime` rides along and `verify.ts` re-checks it.
- **Specialist routing (`specialistMetaByChildId`):** populated in the one place a child's
  `parentId`/`agentType`/`title`/`parentToolCallId` are already assembled
  (`buildSpecialistSession`, alongside `childAskRouter`), removed in `destroy()` alongside
  `childrenOf` de-registration — can't drift from the same routing a permission ask already
  gets.
- **Bash description text (§8):** accurate to the shipped behavior (sudo works; the user
  types the password in the app, never in tool output; don't pass `-S`/`-A`/set
  `SUDO_ASKPASS`; `doas`/`su`/`pkexec`/`run0` are refused) and is two added sentences, not a
  rewrite.
- **Line-budget bumps** (`ipc-handlers.ts` +58, `native-session-host.ts` +121,
  `harness-session.ts` +45): proportionate to the actual added code; unlike the blocking-call
  allowlist, `line-budgets.json` carries no "shrink-only" rule.
- **Knip un-exports** (`VerifyOk`/`VerifyFail`/`VerifyReason`/`splitNulRecords`): grepped the
  whole tree — nothing outside `verify.ts`/`proc-info.ts` themselves referenced any of the
  four; safe.
- **No timeout on the up-front ask (R18):** `askUpFront`'s promise only settles on
  submit/withdraw-via-broker-cancellation; no `setTimeout` path exists in
  `AdminPasswordService` for it.

## Test gaps (summary)

1. **T5-2 is the main one:** no test exercises `resolveAskpassScript()` +
   `attachAdminPassword()` together against the real filenames on disk.
2. No test pins that `SUDO_ASKPASS` must end in `youcoded-askpass` (not `askpass.cjs`) — would
   have caught T5-1 directly and cheaply, no Docker required.
3. No test covers the "wrong up-front password, then a background start/hand-off before the
   retry" race named in T5-4 (the existing seed test only covers the correct-password case).
4. `bash-env.test.ts`'s `ADMIN_ENV` fixture will need its `SUDO_ASKPASS` value corrected
   alongside the T5-1 fix, or it will keep asserting the wrong value is "passed through
   correctly."
