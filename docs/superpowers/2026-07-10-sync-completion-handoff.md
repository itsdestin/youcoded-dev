# Handoff: Cross-Device Sync — the road to COMPLETE and SHIPPABLE

**Date:** 2026-07-10
**Supersedes:** `docs/superpowers/2026-07-09-sync-spaces-post-1a-handoff.md` (its work items A and B are fully executed; its sharp-edges section §4 is still gold — read it).
**Spec:** `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` (the authority for everything below; §17 phasing statuses updated 2026-07-10).

## 0. The governing decision (Destin, 2026-07-09 — do not re-litigate)

**No app release until the sync system is ENTIRELY complete — including conversation sync.** Conversation sync is not an add-on; Destin considers it *the most important part* of the expected sync UX. The earlier "release now behind the off-by-default toggle, dogfood, iterate" recommendation was considered and rejected. Consequences:

- Master accumulates unreleased work (accounts Phase 2 client, games changes, all sync work). Expect bigger rebases and re-run `npm ci` after each (parallel tracks add deps).
- Two-device dogfooding happens with **dev builds**, not release builds.
- The release, when it comes, ships the whole system at once — run `/audit` and the full release checklist when that day arrives (docs are already flagged stale: AUDIT.md >76 days).

## 1. Accomplished (all merged, all pushed)

| Work | PR(s) | What landed |
|---|---|---|
| **Phase 1a — foundation + project sync** | youcoded#107 (2026-07-08) | `SyncTransport` interface + git transport (hidden `GIT_DIR` repos, `* -text`, convergent conflicts), `SpaceSyncEngine` (chokidar → 15s debounce → pull+push, single-flight, **120s poll standing in for SyncHub**), `ManagedRoots` (`~/YouCoded/{Projects,Personal}`), `SpaceManager` (enable flag + GitHub repo provisioning, `repoNameForSpace` slug+hash), SyncPanel section, dated daily space backup. 10-test transport contract suite = the transport compatibility boundary. |
| **Import existing folders (spec §3)** | youcoded#109 (2026-07-09) | Both flows: convert an existing saved-folder project ("Sync this project") and folder-picker import. MOVE-not-copy with consent (`ImportProjectModal`), EXDEV fallback, four path-keyed store remaps (saved-folders, central index, sidecar includes/excludes, CC transcript slug dir), bounded `countFilesBounded`, remap-failures-degrade-to-warnings. |
| **Project & sync management UX** | youcoded#112, #113 (2026-07-09) | Session picker slimmed to rows + sync dots + single "Manage projects…" footer (portaled dropdown at z-9001 + the `data-folder-switcher-portal` outside-click marker; rows are pick-only). Unified two-step `AddProjectModal`. ProjectHero = per-project sync hub (four-state status line, Sync now via per-space `syncSpacesSyncNow(spaceId?)`, "Last synced" from `SpaceSyncEvent.at`, Rename nickname-only, Remove gated for synced). Live status refresh via `syncspaces:event` subscription. Sync-off honesty copy everywhere. Pure `sync-dot-state.ts` module drives all three dot surfaces. |
| **SyncHub plan written (NOT executed)** | — | `docs/superpowers/plans/2026-07-09-sync-hub-1b.md` — 8 tasks, complete code, self-reviewed. Research embedded: reuses the accounts track's landed `PresenceRoom` DO patterns (now in wecoded-marketplace master) and clones `presence-socket.ts` for the desktop client. |

Working-state notes: all worktrees/branches from the above are cleaned up; the main `youcoded/` checkout is on merged master; no dev instance is running; `docs/PITFALLS.md → Sync Spaces` carries every invariant learned (including the #112/#113 UX subsection).

## 2. Remaining work, in execution order

### A. Execute SyncHub — Plan 1b (READY NOW)
`docs/superpowers/plans/2026-07-09-sync-hub-1b.md`. Worker half first (`SyncGroupRoom` DO in wecoded-marketplace — per-account `idFromName(userId)` rooms, signal relay + replay ring, requireAuth in the route; merge → CI auto-deploys → smoke-test 401), then desktop half (`sync-hub-socket.ts` + service wiring: signal→pull, push→signal, reconcile-on-connect, SyncPanel "Instant sync" line). Execute via superpowers:subagent-driven-development, Opus implementers + two-stage review (the loop caught real defects in every plan so far). Coordination: the accounts track also works in `worker/` — rebase early and before the PR.

### B. Phase 2 — conversations + handoff (THE BIG ONE; needs brainstorm + spec-refinement + plan)
Spec §9/§10/§11/§12. This is the largest remaining chunk and the part Destin cares most about. Scope:
1. **Conversation Store** — canonical `{id, provider, project, title, lastActive, device, flags, transcriptRef}` record syncing in the personal space; provider adapters (TranscriptWatcher, OpenCodeSessionAdapter) feed it. *Design rule: the store schema, not any provider's disk format, is the contract.*
2. **CC transcript sync + materialization** — raw JSONL syncs (append-only); engine materializes into each device's `~/.claude/projects/<local-slug>/` so `claude --resume` works.
3. **Session leases + takeover UX** — lease via SyncHub (`lease-acquired/renewed/released`, `takeover-request` — extend `ALLOWED_KINDS` in the SyncGroupRoom relay; the 1b design deliberately left this a one-line change), 30s heartbeat, 90s stale expiry, takeover interrupt through the existing `endTurn` path, warm prefetch. Lease-file fallback through the transport when SyncHub is down.
4. **Resume Browser reads from the store** — replaces topic files, mtime-as-lastActive, `regenerateTopicCache`, slug rewriting (deprecation-staged; see the Resume Browser invariants in PITFALLS before touching — several of those invariants exist because of the machinery this replaces).
5. **GitHub-backup migration + legacy deletions (§11/§12)** — existing `personal-sync` repo becomes the personal space remote; backup layer goes Drive/iCloud-only daily-dated; DELETE the legacy sync-service 15-min push loop, session-end push, 30s index-debounce push. **Do not touch `sync-service.ts` before this phase** — flipping backup to daily-only earlier regresses conversation backup freshness to 24h (PITFALLS). Related: knowledge-debt entry "CC-drift: cleanupPeriodDays coverage" should be resolved as part of the sync-service work here.
Phase 2 almost certainly wants decomposition into 2+ plans (store+transcript-sync first, leases+takeover second, migration+deletions third). Run superpowers:brainstorming against spec §9–§12 to settle open UX questions (takeover dialog copy, read-only watching deferral) before writing plans.

### C. Connect-GitHub modal (GA/launch prerequisite; parallelizable any time)
Spec §18: `gh` auth is a silent gate non-developers never pass; sync's GA path requires an in-app modal wrapping gh's device-code flow. Independent of A/B — can be brainstormed/planned/built in parallel or by a second session. Small-to-medium scope; touches first-run + Settings + the sync enable path.

### D. Two-device dogfood (after A, ideally mid/after B)
Dev builds on a second machine: sign in, enable Sync, verify Personal + a project space converge, conflict copies materialize correctly, second-device provisioning reuses device 1's repos, and (post-A) signals make it near-instant. This is the first real-world test of the convergent-conflict policy — schedule it BEFORE building too much of Phase 2 on top, in case it surfaces design problems.

### E. Android (Phase 3) — DECISION NEEDED from Destin
Spec phases Android sync as Phase 3 (Kotlin engine port, foreground sync + on-open reconcile). **Open question the next session should ask Destin:** does "entirely complete and shippable" include Android sync, or does the release ship with desktop-only sync (Android UI already degrades gracefully — no syncspaces Kotlin handlers by design)? This materially changes the timeline; don't assume either way.

### F. Release (after everything above Destin includes in "complete")
`/audit` first (already overdue), bump `versionCode`+`versionName` in `app/build.gradle.kts`, tag `vX.Y.Z`, one tag → both platform workflows. Consider `assembleReleaseTest` locally (R8 parity) since sync code is new. The release-blocking definition is Destin's §0 decision — check with him before tagging.

## 3. Process that works (repeat it)

superpowers:subagent-driven-development with **Opus** implementers + spec-compliance reviewer + code-quality reviewer per task, full task text pasted into each subagent (never "read the plan file"), review loops until approved, whole-branch final review before PR. Across the three executed plans this caught, among others: an uncommitted parity surface (remote per-space sync-now), silent second-device sync failure, conflict-copy data loss, the buddy-window add-folder dead end, and sync-now-with-no-feedback. WHY comments on every non-trivial edit. Worktrees per plan; clean up after merge; "merge" means merge AND push.

## 4. Sharp edges

Everything in the 2026-07-09 handoff §4 still applies verbatim (npm-test-watch hang, env-var contamination → `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run`, transport-suite timeouts, `npm ci` after rebases, ipc-channels adjacency conflicts, port-5223 orphans, worktree smoke-test recipe, cwd discipline, dead-subagent recovery). New since:
- **Vite orphans survive Electron window close** — killing/closing the dev window can leave vite holding 5223; check `netstat -ano | grep :5223`, verify the PID's CommandLine points at youcoded's vite.js (NEVER kill Destin's built app), then kill.
- **Portaled popovers vs host outside-click handlers** — any dropdown portaled to document.body is invisible to its host menu's `ref.contains()` checks; see the `data-folder-switcher-portal` pattern (PITFALLS → Sync Spaces → Project & sync management UX).
- **The worker now has DO/WebSocket infrastructure** (PresenceRoom, `[[migrations]] v1`) — new DO classes add a NEW migration tag and must mirror bindings under `[env.test.durable_objects]`.

## 5. Decisions already made — do NOT re-litigate

All of the 2026-07-09 handoff §5, plus:
- **Release gating (§0 above).**
- **Sync dots** (green/red/gray) are the one sanctioned status-color use; tooltip/hero carry the plain words; the no-●◐○-glyph rule is about glyph text.
- **The session picker just picks** — no add/create/import/rename/remove row actions (buddy-window "Browse for folder…" fallback is the sole exception, only where Project View doesn't exist; delete it if the buddy window ever gains Project View).
- **Move-out-of-sync and folder-rename-for-synced-projects are deferred** named follow-ups (hero hides Remove for synced projects; Rename is picker-nickname-only).
- **SyncHub design** (per the 1b plan): per-account DO rooms, kind-allowlisted generic relay (Phase 2 extends the allowlist), spaceKey = `repoNameForSpace()` never the local id, DO is an accelerant never a source of truth, 120s poll stays as fallback.
