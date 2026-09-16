---
date: 2026-09-10
status: active
type: handoff
topic: Android rebuild — where it stands, what was decided, and how to start step 4 (the harness runtime on the phone)
---

# Android rebuild — START HERE

One roadmap item owns this work: `docs/roadmap/android-only.md`. One report holds every
finding and every earlier Android bug: `docs/active/investigations/2026-09-10-android-parity-audit.md`
(read its **Status** block first, then §7). This handoff is the short path between the two.

## Decided by Destin (2026-09-10 deck, `docs/active/design/2026-09-10-android-rebuild/`)

1. **Built-in assistant first.** The phone's Claude Code stays at 2.1.112, labelled as the
   older option. Unfreezing it is not scheduled.
2. **Harness before phone basics.** Notifications with actions, sharing in, real file access,
   onboarding come after the harness.
3. **Google Play, prioritized.** The company's D-U-N-S number arrived 2026-09-10; the Play
   listing item in `docs/roadmap/dev-workspace.md` lists what is left.
4. **Full Project View on the phone**, everything desktop has, including git. Lands after the
   harness, since it needs the same runtime.
5. **Restore wizard removed.** Done.

## Done (merged 2026-09-10, youcoded#468 · youcoded-dev#86, #88)

- CI stamps a real version into every phone build; outputs named after it.
- Notification permission requested once after setup (Android 13+ dropped every approval
  prompt before).
- APK is arm64-only; the stale April web bundle is untracked; dead layout-insets plumbing gone.
- Unknown bridge channels refuse as `unsupported` (the shim rejects and shows a plain notice
  worded "on the phone"); `transcript:page` and `syncspaces:status` are refused quietly.
- The restore-from-backup backend is deleted. Guards: `desktop/tests/android-honest-build.test.ts`,
  `desktop/tests/remote-shim-phone-refusals.test.ts`.

## Next: step 4 — run the desktop's harness as a Node child on the phone

The plan is report §7a; the seam analysis is §7b. In short:

1. A Node entry point with no Electron import (`harness-host.ts`): NativeHome, a Kotlin-backed
   SecretsStore, `ProviderRegistry` with `localEngine = null`, `NativeSessionHost`, and a
   `{type, id, payload}` dispatcher copied from `desktop/src/main/remote-server.ts` (which
   already bridges the whole native stack for a phone over remote access).
2. Replace the six Electron touchpoints (`safeStorage` twice, `app.getPath('userData')`,
   `openExternal`, `appVersion`, IPC send) with injected equivalents.
3. Kotlin `HarnessBridge.kt` beside `PtyBridge.kt`; a second session kind in `SessionRegistry`;
   `provider` on the session-info reply; `session:create` reads `provider`/`binding`/`preset`.
4. Route the ~28 `native:*` / `provider:*` / `chatgpt:*` channels to the child. Keep
   `engine:*` / `models:*` refusing behind a NEW `localEngine.supported=false` flag, never by
   reusing `native.supported` (the Local Models screen crashes on the phone's reply shape).
5. ChatGPT sign-in works as is (loopback on port 1455 on the device); open the URL through
   `PlatformBridge.openUrl`, never a shell shim.
6. Fix `defaults:get` to return the desktop-chosen default model.
7. Ship the harness's pure-JS dependencies as an asset or install them at bootstrap.

Sync Spaces rides the same child later (it is Node code too). Risks and effort: §7a.
Estimate: 3 to 5 weeks to a working ChatGPT/OpenRouter session on the phone.

## Working notes

- Android builds and tests here: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk ./gradlew test -x bundleWebUi` from `youcoded/` (756 tests on 2026-09-10).
- Never run `bundleWebUi` or `npm ci` in a hardlinked worktree.
- A workspace CI check ("Anchors and invariants") fails on master on a git-identity test
  unrelated to Android; a desktop Windows leg fails a harness checkpoint test on master too.
  Read the red check before merging; both were pre-existing on 2026-09-10.
- Rule for the bridge: `.claude/rules/ipc-bridge.md` (the catch-all and quiet-refusal bullets).
