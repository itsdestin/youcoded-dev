---
status: active
date: 2026-09-17
reviews: docs/active/specs/2026-09-17-youcoded-pages-phase1-technical-design.md
---

# YouCoded Pages Phase 1 design — adversarial review 1

Paths are under `youcoded/desktop/src/` unless noted. Severity: blocking / should-fix / nit.

**F1 — The Personal repo is not at `~/YouCoded/Personal/.git`.** (blocking)
Spec §6.2 tells the skill to run `git log`/`git checkout` there. `main/sync-spaces/git-transport.ts:188-189,244` puts the repo at `<root>/.youcoded/sync.git` and runs every call with `GIT_DIR`+`GIT_WORK_TREE` set; the worktree has no `.git`. Project pages have no history at all unless the project is a registered sync space (`sync-spaces/types.ts:5-9`). Fix: give the skill a "restore a page" IPC that runs git with the transport's env, and state that project pages have history only when the project syncs.
triage:

**F2 — mtime folding of conflict copies is meaningless and inverts the policy.** (blocking)
`git-transport.ts:548-560`: the copy is *ours* (stage 2), written right after the merge checks out *theirs*, so both files carry the pull's timestamp and the copy is newer. "Newest mtime wins" therefore makes local win, not remote and not "later save". `conversations/naming-store.ts:14-17,67-113` folds by a commutative merge under `mutateFileUnderLock`, not by mtime; `store-core.ts:238` `CONFLICT_RE` is `.json`-only, so `page (from X, date).html` needs its own matcher. Fix: put `savedAt` inside `data.json` and `page.json` and compare that; for `page.html` keep remote-wins and leave the copy (git is the history); delete copies only under the lock, never in a plain `get`.
triage:

**F3 — `project:<path-hash>:<slug>` ids differ per device.** (should-fix)
The same project lives at different paths on each machine, so a path hash never matches across devices; pins (§4) sync but reference ids the other device will not produce. Sync spaces already key projects as `project:<name>` (`types.ts:8`). `shared/pages-types.ts:14` `PageHome.path` already sends the full path to the renderer, so hashing hides nothing. Fix: `project:<project-name>:<slug>` with the name→path map from the central index; keep `home.path`.
triage:

**F4 — The data handshake cannot be "before the page's own scripts run", and the listener needs a source check.** (blocking)
postMessage is asynchronous; a message posted at load lands after inline scripts. The theme already solves this by baking (`pages/page-theme.ts:68-78`). Fix: bake `window.youcoded.data` into the document the same way (escape `</script>`), which means `get()` returns data or `PageHost` awaits `getData` before setting `srcDoc` (`PageHost.tsx:88-104`). Inbound: the frame has no `allow-same-origin` (`PageHost.tsx:218`), so `e.origin` is `'null'` for it *and* for every HtmlView artifact frame (same sandbox, `PageHost.tsx:3-5`); filter on `e.source === frameRef.current.contentWindow`, not `type`. Enforce the 1 MB cap host-side before IPC and again in main.
triage:

**F5 — `initialInput` does not go "end to end" through the typed builder or Android.** (should-fix)
`shared/session-create-args.ts:36-62` `SessionCreateRequest`/`SessionCreateArgs` have no `initialInput`; only main's `CreateSessionOptions` (`session-manager.ts:38`) does. Android `session:create` (`app/.../SessionService.kt:921-935`) never reads it; only `dev:open-session-in` (`:3355-3357`) does. Fix: either add `initialInput` to both shared shapes and the Kotlin arm, or route Make a page through `dev:open-session-in`, which already exists on all surfaces (`preload.ts:1038`, `remote-shim.ts:2641`). Note in the spec that a Claude Code session executes `/page-builder` through CC's own plugin loader, so the plugin must be installed in `~/.claude`.
triage:

**F6 — The dev walk-through cannot exercise the skill.** (should-fix)
`skill-provider.ts:1041-1043` returns `skipped-dev` for every bundled id under run-dev (it must not rewrite the shared `~/.claude`), and the index entry must be merged and live before any build can install it (`:1058-1071`). Task 8's make→open→pin→edit run will therefore have no `/page-builder`. Fix: order task 7 before 8, and say the walk-through covers the store/frame only, or install the plugin by hand into the dev profile for the run.
triage:

**F7 — "The open page reloads through `pages:changed`" is not wired, and a naive version wipes page state.** (should-fix)
`PageHost.tsx:88-104` fetches on `[pageId]` only. If the reload keys off the list refresh, every `data.json` save — own, debounced, or synced — reloads the frame and loses working state, the exact thing the theme path avoids (`:84`). Fix: reload only when the summary's `page.html` stamp changes; never bump `updatedAt` for data writes.
triage:

**F8 — One chokidar per known project doubles watchers on trees that already have one.** (should-fix)
`artifacts/project-watcher.ts:194-260` already watches each project root (depth 6, subscriber-scoped, `watchersStarted` is a test observable). An unconditional second watcher per project root — most of which have no `Pages/` — is the cost PITFALLS' depth cap exists to avoid. Fix: watch `<project>/Pages` only when it exists (create on demand), depth 2, or extend `ExternalChangeEvent` with a Pages filter.
triage:

**F9 — Project pages show up as project files and churn the Files drawer.** (should-fix)
`artifacts/project-file-discovery.ts:127` walks every non-dot dir, so `page.html`/`data.json` appear as artifacts and every data save fires an external-change event. Fix: decide explicitly — accept, or add `Pages` to the skip sets.
triage:

**F10 — The walk-through writes into Destin's real synced space with the live app's device id.** (should-fix)
`docs/PITFALLS.md` → Shared state: dev shares `~/YouCoded/`; `device-identity.ts:63` reads the *built* app's id, so dev and live share `.pins/<id>.json`. Fix: all pin/data writes via `mutateFileUnderLock`; the walk-through uses a throwaway page and cleans up.
triage:

**F11 — Slug uniqueness and `updatedAt` are trusted to the skill.** (nit)
`page.json.updatedAt` written by an LLM orders the fold (F2); slugs must also be unique case-insensitively (`guards.ts` `findCaseCollisions` exists because macOS/Windows break). Fix: derive stamps from mtime/git; the skill checks existing folders case-insensitively.
triage:

**F12 — Citation drift.** (nit)
`naming-store.ts` is `conversations/`, not `sync-spaces/`; `ipc-channels.test.ts` pins preload vs `shared/types.ts` only (shim/server: `shim-parity.test.ts`, `remote-channel-parity.test.ts`); `getMachineIdentity()` is null when the built app never ran here or its write failed (`device-identity.ts:56-61`), not "remote browser, some Linux builds".
triage:
