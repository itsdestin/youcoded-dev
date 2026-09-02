---
paths:
  - "**/app/**"
last_verified: 2026-09-01
verify:
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/runtime/DirectShellBridge.kt
    contains: "no 600ms Enter-split here"
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/bridge/TranscriptSerializer.kt
    contains: "anthropicRequestId"
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt
  - path: youcoded/app/src/main/assets/claude-wrapper.js
  - path: youcoded/app/proguard-rules.pro
    contains: "Bootstrap"
---

# Android Runtime Rules

Claude Code (a Node CLI) runs inside a Termux-derived environment. **Full context: `youcoded/docs/android-runtime.md` — read before non-trivial changes.**

## System fundamentals — DO NOT violate
- **`LD_LIBRARY_PATH` is mandatory** in `Bootstrap.buildRuntimeEnv()` (Termux binaries are relocated; DT_RUNPATH is stale).
- **All exec routes through `/system/bin/linker64`** (SELinux W^X bypass). Three layers: LD_PRELOAD (termux-exec) for C/Rust; `claude-wrapper.js` for /tmp rewriting + fs patches + BASH_ENV (NOT exec routing); `linker64-env.sh` for Go binaries. **Use the LINKER variant of termux-exec** (`libtermux-exec-linker-ld-preload.so` copied over primary).
- **`TMPDIR` = `$HOME/.cache/tmpdir`, NOT `$HOME/tmp`** (the specific path avoids Node's compiled-in `/tmp` rewriting double-applying). No glibc — Bionic only.
- **Runtime fixes must work in BOTH `PtyBridge` and `DirectShellBridge`** (shared `Bootstrap.buildRuntimeEnv()` + `deployBashEnv()`). **Do NOT poll `isRunning`** — use the reactive `sessionFinished: StateFlow` (JNI waitpid thread).
- **`claude-wrapper.js` canonical source is `app/src/main/assets/claude-wrapper.js`** — edit this file; deployed inline in `PtyBridge.start()` at every launch (no `deployWrapperJs()` method).

## Exec permissions & git auth
- **`~/.claude-mobile/exec-wrappers/*` must be chmod 0755, not 0700.** Java's `setExecutable(true)` gives 0700 under Android's 0077 umask; shebang exec via `/system/bin/sh` then fails EACCES (stricter than a direct linker64 invoke) — breaks `gh` spawning `git`. Fix: `setReadable(true,false)` + `setExecutable(true,false)` in `deployBashEnv()`. Don't "tighten" back — wider perms stay inside the uid-isolated app sandbox.
- **Git HTTPS auth uses `~/.netrc`, NOT `gh auth setup-git`** (Go's raw-syscall exec can't traverse the exec-wrapper path). The OAuth token is mirrored into `~/.netrc` (mode 0600) by `Bootstrap.syncGhTokenToNetrc()` in first-run `Bootstrap.setup()` + the `gh` wrapper's `_youcoded_sync_gh_netrc` post-hook. Add any new gh-auth-changing command to that hook's case list. **Do NOT reintroduce `gh auth setup-git` anywhere** — it fails silently or EACCES.
- **`gh auth login --web` polling is flaky — retry once** if it dies "error connecting to github.com" (Go HTTP/2 on Android's stack, ~1-of-3 success in the wild). Don't wrap a retry in `gh()` (double-prompts a new device code).

## Build-type parity (R8) — guard: `./gradlew :app:assembleReleaseTest` (CI: `android-ci.yml`)
- **Release enables R8 minification; debug skips it — they are NOT equivalent.** **Don't use string-based reflection against your own code** (`getMethod`, `Class.forName`, `KClass`, `::declaredMembers`) — R8 obfuscates the name and the lookup throws. The `PluginInstaller.buildEnv()` reflection bug (`912f5ca7`) shipped a stripped env without `LD_PRELOAD` in release — every marketplace install died — while every dev/CI build was debug. Direct calls always; unavoidable reflection needs an explicit `-keep` in `proguard-rules.pro`, never a silent `try{reflection}catch{fallback}`.
- **`Bootstrap` has a defensive `-keep` rule** — don't remove without an audit confirming nothing reflects against it. **`assembleReleaseTest`** (same R8 config, debug keystore, `.releasetest` suffix, port 9961) is the parity check — run it before tagging after touching reflection/annotation/symbol-name-dependent code. Android workflows `setup-node@v7` explicitly so `bundleWebUi` doesn't depend on the runner image's node.

## PTY writes are NOT symmetric across the two bridges
- **`PtyBridge.writeInput` keeps the 600 ms split before Enter; `DirectShellBridge.writeInput` deliberately does NOT — never "parity fix" it.** The split works around Ink's 500 ms `PASTE_TIMEOUT` in Claude Code's TUI; `DirectShellBridge` talks to raw bash, which has no paste-mode timing. The shared-env rule above is about `buildRuntimeEnv`/`deployBashEnv`, not write timing. *Guard:* the WHY comment at `DirectShellBridge.writeInput`.

## Per-turn transcript metadata (Android parity)
- **`TranscriptEvent.TurnComplete` carries `stopReason`, `model`, `usage` and `anthropicRequestId`, matching desktop's transcript-watcher output.** Preserve all four when touching `TranscriptWatcher.parseAssistantLine` or `TranscriptSerializer.turnComplete` — remote clients read them for the per-turn metadata strip, StopReasonFooter, the AttentionBanner request-id readout and sessionModels reconciliation.

## Native UI bridge pattern (deferred)
When an IPC handler needs native Android UI: `SessionService` creates a `CompletableDeferred<T>`, calls an Activity callback, MainActivity shows the UI, the result calls `deferred.complete()`, SessionService awaits + responds. Used by `dialog:open-file`, `dialog:open-folder`, `android:scan-qr`.
