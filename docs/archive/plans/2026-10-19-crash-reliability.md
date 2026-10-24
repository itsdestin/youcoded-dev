---
status: shipped
---
# Crash reliability implementation plan

> Execute in this session; the submitted crash-reliability-20261019 deck and Destin's request to build quickly authorize these repairs. No commit, release, engine upgrade, search rewrite or history-window redesign.

**Goal:** Recover a failed desktop page without stopping its backend conversations; reclaim closed-session memory; finish shutdown; retain drafts through page failure.

**Architecture:** Reuse session:open, window ownership, pending handoffs, native dialogs and browser-backed draft storage. Add small lifecycle helpers rather than a generic recovery framework. Keep the shared renderer usable on Android/remote; Electron recovery stays desktop-only.

## 1. Window recovery and delivery
- [x] Add targeted failing tests for one automatic reload, bounded repeated-crash recovery, gone-page delivery suppression, recipient failure isolation, and readiness reset without deleting queued handoffs.
- [x] Add a small renderer recovery helper. Production main/peer windows reload after unexpected renderer death; repeated failure offers a native Retry/Close choice. No reload on clean exit or shutdown. Existing development load recovery remains separate.
- [x] Mark a page unavailable on main-frame navigation/death; ready only after the existing detach claim. Keep session ownership, clear page-specific pending fills/attention/close requests, and reuse boot reconstruction.
- [x] Fence window and phone fan-out independently. Native close fallback must work for a gone renderer.

Files: desktop/src/main/{main.ts,pending-acquire.ts,ipc-handlers.ts,publish.ts,crash-diagnostics.ts}; focused helper and existing lifecycle tests.

## 2. Native memory (bounded specialist task)
- [x] Prove the transcript suffix backing-buffer retention and closed-session reference retention with targeted tests.
- [x] Copy the small suffix, bound parsed-reader cached source bytes, release runtime-only caches when sessions finish destroying, and delete disposed reference/failure maps after the append chain drains.
- [x] Join nativeHost.destroyAll() with engine shutdown in runtime cleanup. Preserve durable history and checkpoint ordering.

Files: desktop/src/main/harness/{accepted-history-store.ts,session-store.ts,native-session-host.ts}, desktop/src/main/create-runtime.ts; corresponding existing tests.

## 3. Shutdown
- [x] Separate stopping from stopped so another quit cannot bypass teardown.
- [x] Isolate cleanup failures and wait for started cleanups under existing practical deadlines.
- App teardown is fixed here. Dev-launcher/process-group changes are not included: they do not establish the cause of the old packaged helpers, and installing a new Linux supervisor would expand this repair. Existing orphan processes were left untouched.

Files: desktop/src/main/{main.ts,app-restart.ts}; desktop/scripts/run-dev.js and workspace scripts/run-dev.sh only if a small safe correction fits.

## 4. Draft and editor recovery
- [x] Use a bounded versioned local draft journal for composer text/attachment references and text-editor drafts; update during edits, clear on successful submission/save/discard, expire stale entries. Never resend restored drafts.
- [x] Keep file concurrency tokens so a restored edit cannot silently overwrite an outside change.
- [x] Release Office editor references on renderer loss/navigation while keeping unsaved Office recovery journals.

Files: desktop/src/renderer/components/{InputBar.tsx,artifact-views/draft-store.ts,ActiveArtifactView.tsx}; small shared renderer draft journal helper; desktop/src/main/office/office-ipc.ts; existing draft/InputBar/Office tests.

## Verification
- [x] Targeted tests first (observe the regression, implement, rerun). No multi-day soak or exhaustive failure simulator.
- [x] One fresh code review of the finished diff; address practical correctness findings.
- [x] Run bash scripts/verify.sh against this app worktree and report actual results. Check Android SDK/JDK availability if shared runtime changes need native verification.
- [x] No live-app experiments, automatic installation, commits or pushes. Explain any remaining limitations rather than expanding scope.

## Crash evidence retained for follow-up

Official Electron 41.10.7 Linux x64 Breakpad symbols matched the executable ELF build ID `baca34e32f88cb3688cb6e6a727749c2b8d5df66`. The latest saved IP, module offset `0xa4d0338`, resolves to `blink::Document::UpdateStyleAndLayoutTreeForThisDocument()` and `CHECK(Lifecycle().StateAllowsTreeMutations())`. The recovered callers run from selection commit through `FrameSelection::SelectionHasFocus()` into a forced style/layout update during compositing-inputs processing. This is not a cppgc write-barrier signature. The exact app-level trigger was not recovered.

Matching upstream fix: https://github.com/electron/electron/pull/54281 (supersedes #52670). Its ResizeObserver/lifecycle explanation matches the native call chain; it is not independent proof of the exact triggering app action. Repository ancestry verified that Electron 43.8.0 and 44.9.0 contain the fix. Upgrade is deferred under #172, not implemented here.

All 14 dumps stackwalked successfully: one latest Blink lifecycle CHECK; six GPU-unusable fatal terminations; four weak-reference faults during DevTools ownership/opening; two Wayland hold-event dispatch traps; one libc abort with Node/libuv filesystem callers. Those older signatures are not one recurring renderer crash. Nearby GC symbols, largest-renderer memory samples without process identity, and last-started IPC names are not causal evidence.

Symbolicated summaries, latest stack and matching source/disassembly were preserved privately at `~/.cache/youcoded-crash-20261019/`. Raw dumps remain local in Crashpad and were never uploaded. Production observations/analysis used external read-only inspection; no live attach or process signalling.

## Result

Implemented on session/93-crash-reliability; app commit `8c38570b1`, PR https://github.com/itsdestin/youcoded/pull/654. Merged and pushed to remote master as `0a020c3f7fcfd121622aeef5bc3c3def36e97b9d`; remote merged-tree equality with the verified source was confirmed. Linux desktop CI, all four Linux package formats, Android JVM and debug/releaseTest APK jobs passed. No release tag or installed-app update. Fresh code review found two practical issues (native recovery Close bypassed session cleanup; empty file drafts were treated as cleared composers); both were corrected and the reviewer confirmed no remaining blockers in scope.

- Targeted recovery/routing, native lifecycle, editor/composer and shutdown suites passed.
- Required verify.sh run: full suite 20,718 passed, 47 skipped; types, test types, knip, lint, design lint, screens and journeys passed. Its sole remaining failure was the invariant still looking for the development watchdog in main.ts after extraction. Updated that rule to guard dev-load-recovery.ts, then reran the invariant command: 413/413 violation fixtures fired and real source/tests had no violations. On explicit merge authorization, the complete shipping wrapper was rerun with the corrected rule: exit 0, every gate passed.
- Local Android backend compiled and 36 Android debug unit tests passed. Local runtime packaging was blocked by missing apk-version tooling, so the successful local unit run excluded buildRuntimeDebug and bundleWebUi. GitHub CI on app head `8c38570b1` subsequently passed JVM tests and built both debug and releaseTest APKs (run 39347252456); that is CI packaging evidence, not an installation/device-runtime claim.
- Draft recovery is per window using sessionStorage, limited/expiring and batched at 250 ms. It restores a failed page in the same WebContents; it is not an app-restart backup or cross-window draft synchronization. No restored draft is automatically sent.
- Electron upgrade (#172), history-window redesign (#173), search indexing work owned elsewhere, older-crash investigation and a new Linux child-process supervisor remain outside this implementation. Cache source-byte limits are 16 MiB per transcript / 64 MiB aggregate, not exact heap limits.
