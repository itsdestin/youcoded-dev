# Shipped

One line per closed item, newest at the bottom: `- [x] YYYY-MM-DD <area> — <headline> (<commit or PR>)`.
Lines are capped at 300 characters. Longer pre-2026-09-23 lines, and everything shipped before
2026-09-01, are in full in `docs/archive/roadmap/shipped-full-to-2026-09-23.md`.

A line that reads **PENDING MERGE OF `<branch>`** is work that is built and reviewed but has NOT
landed on master, so it cites a branch instead of a merge sha. It is written here — rather than
held back — so the backlog item it replaces is never simply gone. When the branch merges, replace
that phrase with the merge sha. **If the branch is dropped or reworked instead, move the line's
headline back to its area file as an open item.** Never leave one of these unresolved after a merge
decision either way.

- [x] 2026-09-09 chat-data — You cannot rename a conversation (youcoded `9d445011`)
- [x] 2026-09-09 chat-data — The auto-title reminder fires about six times per conversation (youcoded `9d445011`)
- [x] 2026-09-09 dev-workspace — Android CAN be built and tested on this machine; three docs said otherwise (no PR)
- [x] 2026-09-01 chat-data — Chat Search phase 1: index + read-only CLI (youcoded#282 `2f8b5671`, #283 `8a06d79d`; wecoded-marketplace#65, #66)
- [x] 2026-09-01 chat-data — Chat Search phase 2: writes — tag/untag/note/flag/close from the CLI through the outbox the app drains (youcoded#346 `db4ed2b4`; wecoded-marketplace#70 `c539d26`, chatsearch 0.2.0)
- [x] 2026-09-01 chat-data — Chat Search session references: Preview / Resume a past conversation from a search hit, plus the reference block (youcoded#343 `3b759931`; wecoded-marketplace#68 `314617f8`)
- [x] 2026-09-01 chat-data — Transcript replay has no size ceiling (`8c641296` — the live tailer starts at the END of an existing file on resume/re-dock; history arrives through the bounded page reader, `09de033e`)
- [x] 2026-09-01 chat-data — The app's transcript mirror is LARGER than the original and writes back over it (no longer reproduces)
- [x] 2026-09-01 dev-workspace — Four knowledge files over their word budget, so /audit's mechanical pass fails every run (youcoded-dev c9f81f3 "get the mechanical audit green")
- [x] 2026-09-01 dev-workspace — harness-eval-orchestrator.test.ts has a red test on master (youcoded 780de530 + 6cab56b9 in #362/#363; 86/86 green on master f2d229e4 on 2026-09-01)
- [x] 2026-09-01 dev-workspace — The main youcoded/ checkout is stuck 40+ commits behind, and that makes /audit lie (no longer reproduces: 0 behind, 0 ahead, clean tree on 2026-09-01; the mockup work is on feat/assistant-settings-mockup with a remote)
- [x] 2026-09-01 dev-workspace — Workspace CI's daily anchor cron has been red since 2026-08-16 (youcoded-dev c9f81f3; `node scripts/audit-anchors.mjs --root /home/destin/youcoded-dev` → anchors 366/366, MAP paths 340/340 on 2026-09-01; the unmerged-branch anchors all resolve)
- [x] 2026-09-01 dev-workspace — tests/ipc-handlers.test.ts flakes at import time under full-suite runs (youcoded f05b2711 fixed the SkillConfigStore two-writer temp-file race the failure sat in; suite passes 6 concurrent full runs after #362/#363 0371c265)
- [x] 2026-09-01 dev-workspace — youcoded/docs/native-runtime.md depth doc is missing ALL of Phase 2 (youcoded e1843830, 2026-08-12)
- [x] 2026-09-01 dev-workspace — Workbench screenshot rig — deterministic per-theme/scenario captures (youcoded-dev 4765936, 2026-08-25)
- [x] 2026-09-01 files — Opening a session REPLAYS its whole transcript and re-records every file it ever touched (youcoded `8c641296` 2026-08-27)
- [x] 2026-09-01 files — Concurrent sidecar *creation* can still clobber a record — CAS is off on the create path (no longer reproduces)
- [x] 2026-09-01 local-models — Local Models panel: render orphaned `.partial` rows (shipped as the unified model row's partial-download state with Resume/Delete, youcoded `6d4adf16`; backend became `models:resume` in `7f4d8fd5`, 2026-08-27)
- [x] 2026-09-01 marketplace — Installed prompts are a permanent snapshot, and `update()` lies about it (youcoded 722c6742: prompts install under their marketplace id, `recordPackageInstall` runs for the prompt branch, and a missed update returns an error instead of `{ ok: true }`)
- [x] 2026-09-01 native-harness — Native turn teardown leaves an unhandled promise rejection when a turn is aborted mid-stream (no longer reproduces)
- [x] 2026-09-01 marketplace — Theme Update badge has no working action, updates unreachable from the Library (youcoded a2c4bc9c 2026-08-30, the Update badge is a button that actually updates)
- [x] 2026-09-01 user-interface — Window-resize lag has a second, unidentified cause (youcoded PR #374, `721de02d`, 2026-08-12)
- [x] 2026-09-02 dev-workspace — Session-retrospective triage tool — dropped 2026-09-02: the /wrap-up skill makes each session report its own friction (Destin: "a better re-implementation")
- [x] 2026-09-02 dev-workspace — Sync-spaces rule "ONE sanctioned status-color use" reworded to "sync status comes only from sync-dot-state.ts" (Destin 2026-09-02; this commit)
- [x] 2026-09-02 marketplace — Marketplace cards under five votes keep the worded counts ("3 people found this helpful") — Destin decided 2026-09-02
- [x] 2026-09-02 sync — v1.3 gate 3 — Account → Connected accounts shows an in-app GitHub sign-in (Destin confirmed 2026-09-02)
- [x] 2026-09-02 themes — Theme-builder skill end-to-end run — Destin has run it since the Kit rewrite (2026-09-02)
- [x] 2026-09-02 themes — Android terminal mode hiding the wallpaper — no longer reproduces (Destin 2026-09-02)
- [x] 2026-09-02 sync — Sync dead-ends on a machine without gh — Destin tested the no-gh path in his macOS VM, it worked (2026-09-02)
- [x] 2026-09-23 operations — Site download buttons hand out betas after 1.3.0 shipped — kept on purpose (decided 2026-09-23: keep offering betas; the release skill asks Destin each release)
- [x] 2026-09-23 operations — Landing-page live embed goes fully blurred under framed wallpaper themes (youcoded 868bcf3bd, the 2026-09-03 landing redesign)
