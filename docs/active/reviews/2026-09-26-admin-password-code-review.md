# Admin password card — code review

Branch `session/sudo-prompt` vs `origin/master`, reviewed against
`docs/active/design/2026-09-25-admin-password/admin-password.contract.json` and
`.claude/rules/{native-permissions,ipc-bridge,react-renderer,performance,renderer-lists,
narrow-viewport,test-suite-hygiene,harness-tools}.md` + `docs/PITFALLS.md`. No sudo, docker,
or any authenticating command was run on this machine; `admin-password-docker.test.ts` (the
one test that touches a real `sudo`, inside a disposable container) was read but not executed.

## `verify.sh` summary

```
verify: youcoded (base origin/master)
  tests: related to 61 changed file(s) + 60 source-scanning guards + 13 naming a changed/deleted data file
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```
`npm run knip` re-run directly confirms none of the new askpass/admin-password files or
components appear in its dead-export/dead-file output.

## Findings

- F1 accepted (where the password card is unavailable, sudo still runs after approval — passwordless sudo keeps working — and the Bash description tells the model sudo only works there without a password) — `desktop/src/main/ipc-handlers.ts:3099` + `desktop/src/main/harness/askpass/proc-info.ts:247` + `desktop/src/main/harness/harness-session.ts:4101` — **macOS is unimplemented, contradicting contract R19 ("This is for Mac and Linux")** — confirmed by reading the chain: the app only ever constructs an `AskpassServer` `if (process.platform === 'linux')` (ipc-handlers.ts:3099), `MAC_ENABLED` is hardcoded `false` (proc-info.ts:247, also enforced again in `verify.ts:216-217`), and `harness-session.ts:4101`'s `if (isAdmin && isBash && this.opts.adminPasswordService)` guard means the up-front password ask is skipped whenever `adminPasswordService` is unset — which it always is on macOS. But the *approval* card still fires on macOS, because `floorStop:'admin'` (harness-session.ts:4030-4049) forces an ask independent of platform. Net effect on a Mac: the user sees and approves the "run sudo?" card exactly as the contract describes (R1-R3), then the command runs with no `SUDO_ASKPASS` wired and no password card ever appears — sudo fails or hangs with zero explanation, "exactly the pre-feature behavior" per the code's own comment at harness-session.ts:4144-4146. This is a broken promise, not a documented scope cut in the contract itself: R19 states unqualified Mac support.
- F2 accepted — `desktop/src/main/harness/shell-registry.ts:535-536` (`markAdmin`) vs `:460` (`onExit`) — **`acceptedToolCallIds` leaks one entry per approved admin command for the life of a session's `ShellRegistry`.** `markAdmin(toolUseId)` unconditionally does `acceptedToolCallIds.add(toolUseId)` (line 536); the only removal is `onExit`'s `acceptedToolCallIds.delete(run.toolUseId)` (line 460), which fires only for `ShellRun`s that were `register()`ed into `this.runs` — i.e. commands that were backgrounded or timed-out into the registry. The code's own comment at lines 528-534 admits the common case never reaches this registry at all ("the command finished in the foreground before ever reaching this registry"), so every ordinary approved `sudo` command that runs and exits in the foreground adds a `Set` entry that is never removed for the rest of that session. Confirmed by reading both methods and the full call chain from `native-session-host.ts`'s `attachAdminPassword` listener; not exploitable (toolCallIds are unique UUIDs never re-checked after registration) but is exactly the "state that grows with history/event count" class `.claude/rules/performance.md` rule 4 forbids — just gated behind a human approval instead of a keystroke, so its real-world growth rate is small. Low severity.
- F3 accepted — `desktop/src/main/harness/tools/admin-command.ts:217` vs `:81` — **`visibleSudoLines` and `adminCommandVerdict` tokenize the same command text with different platform rules.** `adminCommandVerdict` calls `tokenize(text, !win)` (line 81, platform-aware POSIX/Windows quoting), but `visibleSudoLines` — used by the up-front password-ask path (design §2.4/R20) — hardcodes `tokenize(text, true)` (line 217) regardless of platform. Confirmed by reading both call sites; currently unreachable because the up-front path is only reached when `adminPasswordService` is wired, which today is Linux-only (see F1), so `win` is always `false` at the only site this runs. Flagging as "weird" per the brief's category 4 (two functions reading the same input with silently different rules) — a latent trap if this feature is ever extended past Linux without someone re-auditing this line.
- F4 accepted — `desktop/src/renderer/components/permissions/AdminPasswordPrompt.tsx:37` — **the field-clearing effect keys on `ask.triesLeft` only, not `ask.requestId`.** `useEffect(() => { setValue(''); setShown(false); setSending(false); }, [ask.triesLeft])` will not re-run when a brand-new ask (different `requestId`) arrives carrying the same `triesLeft` value as the ask just resolved (e.g. two distinct top-level asks both at `triesLeft: undefined`, or a specialist's ask following the root session's ask at the same count) — the typed password from the previous ask, and the shown/hidden toggle state, would persist into the new card instead of resetting. The sibling focus effect two lines above (line 34) correctly includes `ask.requestId` in its dependency array, so this looks like an oversight rather than an intentional choice. PLAUSIBLE as user-visible (depends on whether `AdminPasswordPrompt` is ever kept mounted across two different `requestId`s rather than unmounted between asks — I traced the effect in isolation but did not force this exact remount timing at runtime) but concretely confirmed as a dependency-array mismatch against the component's own sibling effect and against contract row R9 ("clears the box for your next try").
- F5 rejected (the reviewer traced it fail-safe; overriding these only makes sudo fail, never leaks — same reasoning as task-2 review T2-1) — `desktop/scripts/askpass/askpass.cjs` / `desktop/scripts/askpass/youcoded-askpass` — **`YOUCODED_ASKPASS_SOCKET`/`SUDO_ASKPASS`/`YOUCODED_ASKPASS_RUNTIME` are ordinary environment variables inherited from the Bash command's own (still-untrusted-at-that-point) shell environment**, so a model-supplied command could in principle redefine them before `env -i` scrubs the rest. Traced through `verify.ts`'s independent exe/argv/environ/ptrace-based authentication of the connecting peer and could not construct a path where this redirects a real password to an attacker-controlled destination — a hijacked socket path just breaks the feature (no card), it does not appear to let anything impersonate genuine `sudo`. PLAUSIBLE-but-likely-benign; I did not run the protocol to confirm empirically.
- F6 rejected (refusing when the parent can't be resolved is the intended fail-closed behaviour) — `desktop/src/main/harness/askpass/verify.ts` (`sudoPid === null || sudoPid <= 1` check, design's "no-parent" guard) — refuses whenever the resolved parent pid is `0` as well as absent, which is reachable in a narrow, legitimate race if the helper's immediate parent already exited and it gets reparented to init (`ppid` becomes `1`, not `0` — read again, this is likely a non-issue: `<= 1` deliberately also catches `1`/init-reparenting) before this read runs. Fails safe (denies the ask, sudo behaves as before the feature existed) rather than unsafe. PLAUSIBLE, low severity, not confirmed reachable against real `sudo`'s process lifecycle.

No password-leak path was found: the typed password stays in `AdminPasswordPrompt`'s local
`useState` only, is passed straight to `window.claude.native.submitAdminPassword(requestId,
password)` (`ToolCard.tsx`) without ever entering `chat-reducer.ts`/`chat-types.ts` (no
`password` field exists on `PasswordAsk` or any action), is not present in any
`chat:hydrate`/`chat:export-snapshot` payload, and `remote-server.ts`'s
`native:submit-admin-password` case reads `payload.password` exactly once with no logging
near it. Five-surface IPC parity (`preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`,
`remote-server.ts`, `SessionService.kt`) for `native:submit-admin-password` is correct,
including Android's honest `unsupported: true` refusal (R19) and the remote/phone path being
deliberately *not* gated on `native.supported` (R6). Full Auto's forced stop for every admin
command (R16) is enforced unconditionally via `floorStop:'admin'` in
`harness-session.ts:4030-4049`, independent of any remembered "Always allow" rule or
`decide()`'s own verdict — traced directly, no bypass found. The Docker e2e test
(`admin-password-docker.test.ts`) is correctly gated behind `YOUCODED_DOCKER_E2E=1` and skipped
by default; it builds a disposable container with a throwaway user rather than touching the
host or Destin's account.

## Not covered

- Did not run any test file (relied on `verify.sh`'s own "related tests" pass plus reading
  test bodies), so I did not independently confirm the askpass test suite exercises the
  `macos-disabled` branch (F1) or the pid-reuse/starttime-mismatch branches in
  `verify.ts`/`peer-cred.ts` beyond reading their assertions.
- Did not check `AdminRunStrip`'s Stop button against the 640px narrow-viewport/44px
  touch-target rule at runtime (it renders through the shared `Button` primitive, which should
  cover this, but I did not measure it).
- Did not review Android build output (`./gradlew test`) or the marketplace worker — out of
  scope for this branch (no worker changes) and `verify.sh` itself does not cover Android.
- Did not re-derive whether pam_faillock's real default lockout window is actually "~10
  minutes" on the distros YouCoded targets — R10/R17's wording is `checkedBy: "human"`/
  `"live-app"`, a copy-accuracy question rather than a code-correctness one.
