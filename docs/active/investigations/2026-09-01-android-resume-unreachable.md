---
date: 2026-09-01
status: active
type: investigation
topic: Android resume never resumes — the resume id is dropped at the one call site, and the slug walker picks the wrong folder
---

# Android resume never resumes

**Symptom.** On Android, resuming a past Claude Code conversation starts a fresh session
instead; and for a project whose folder name contains hyphens, the session can open in the
wrong folder.

## Mechanism (two independent defects, both in Android's own code)

### 1. The resume id is plumbed but never passed

`PtyBridge` accepts `resumeSessionId` (`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt:23`)
and appends `--resume <id>` to the Claude Code launch line (`PtyBridge.kt:147`).
`SessionRegistry.createSession` threads it through (`SessionRegistry.kt:32`, `:49`). But the
single caller — `SessionService.createSession` at
`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:658` — calls
`sessionRegistry.createSession(bs, cwd, dangerousMode, apiKey, titlesDir, model = model)` with
no `resumeSessionId`, so the argument is always `null` and Claude Code is always launched
fresh. Remaining work is the call site (and a cwd guard mirroring desktop's), not the plumbing.

### 2. `walkSlugParts` is the pre-fix shortest-first algorithm

Claude Code names a project folder by a slug in which every `/` and `-` collapses to `-`, so
`/home/u/my-app` and `/home/u/my/app` slug identically. Desktop's
`walkSlugParts` (`youcoded/desktop/src/main/session-browser.ts:156`) tries the **longest**
grouping of dash-parts first and falls back shorter. The Kotlin port
(`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionBrowser.kt:373`) still iterates
shortest-first — `for (len in 1..parts.size)` — and recurses into the first directory that
exists, so a sibling `my/` next to `my-app/` wins and the session opens in `my/…`.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionBrowser.kt", "contains": "for \\(len in 1\\.\\.parts\\.size\\)"} -->

This landed in `6381ec72` (2026-04-23), before the desktop longest-first fix, so it is the
original bug rather than an unported improvement. Desktop has since also grown
`forwardResolveSlug` (re-slug on-disk candidates with backtracking) — port that too if the
Android session list is to match desktop for `,`/`&`/space folder names.

## History
- added 2026-07-15 (old ROADMAP L68, v1.3.1 "Android sync + Android-resume fixes"); state
  re-verified 2026-08-12; re-checked against today's code 2026-09-01 — no commits on
  `SessionBrowser.kt`, `PtyBridge.kt` or `SessionRegistry.kt` since 2026-08-12 touch this.
- The same old item also carried the Android restore-backend demolition follow-up (sync Plan
  2c); that is filed as its own entry in `docs/roadmap/android-only.md`.
