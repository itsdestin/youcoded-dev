# Phase 2 — Conversation Sync, Leases & Legacy Demolition (Design)

> **⏳ PARTIALLY IMPLEMENTED (as of 2026-07-13).** §1–§2 (Conversation Store + CC transcript sync) SHIPPED as **Plan 2a** (`docs/superpowers/plans/2026-07-10-conversation-store-2a.md`, youcoded#116). §3+ — **leases/takeover (Plan 2b)** and **legacy demolition (Plan 2c)** — are DESIGNED here but **NOT yet planned or built**. "Phase 2" here is the SYNC roadmap's phase 2 (NOT the multi-model provider roadmap's phase 2). Live status: `docs/superpowers/2026-07-10-sync-completion-handoff.md` §2.B.

**Date:** 2026-07-10
**Status:** Approved by Destin (brainstorming session 2026-07-10)
**Parent spec:** `2026-07-03-cross-device-sync-design.md` §8–§12 (this doc refines those sections into buildable shape; where they differ, this doc wins)
**Depends on:** Sync Spaces 1a (shipped youcoded#107), import flows (#109), management UX (#112/#113), SyncHub 1b (shipped wecoded-marketplace#21 + youcoded#114)

## 0. Decisions made in this session (do not re-litigate)

1. **The Conversation Store is born multi-provider at the schema level.** `provider` field + a written plug-in contract; Claude Code is the only real adapter built in Phase 2. The native-harness adapter lands in the platform track when the harness exists. (The abandoned opencode-mvp branch is NOT the model — the provider-seam/platform-roadmap track is.)
2. **Read-only watching is deferred** out of Phase 2 entirely (it rides the remote-access machinery; separate feature).
3. **Takeover is immediate — no consent prompt on the holding device.** The holder cleanly interrupts, final-pushes, releases, and shows a "This conversation moved to <device>" banner; the session ends on the holder (two live CC processes on one transcript would fork it). No grace/cancel window.
4. **Lease stale-expiry is 5 minutes** (not the parent spec's ~90s), with a 30s heartbeat — ten missed beats before a live session's lease silently expires. The asleep-holder case is covered at the request level instead: a takeover request unanswered for ~10s offers "<Device> isn't responding — take over anyway?" (force takeover). Nobody ever waits out the lease.
5. **Release scope: desktop-only sync.** Android sync is Phase 3, post-release; Android continues to degrade gracefully (no Kotlin syncspaces handlers, by design).
6. **Store shape: one small JSON record per conversation** (`Conversations/<provider>/<id>.json`), NOT a single index file (machine-managed single file fights the engine's conflict-copy policy), NOT SQLite (binary = whole-file conflicts), NOT per-device shards (takeover forces cross-shard reads forever), NOT event-log CRDT (YAGNI; leases give single-writer semantics).
7. **The Conversations folder is visible** (`~/YouCoded/Personal/Conversations/`), not a dot-dir — transparency is on-brand and dot-dirs risk tangling with sync ignore rules. Hand-deletion from a file manager is acceptable (own data, daily backups).

## 1. The Conversation Store

### Layout

```
~/YouCoded/Personal/Conversations/
  claude/
    <session-uuid>.json            ← one record per conversation
    transcripts/<projectKey>/<session-uuid>.jsonl   ← synced CC transcript content
  native/                          ← future (platform track)
```

### Record schema (v1)

```jsonc
{
  "schema": 1,
  "id": "<provider-stable conversation id>",     // CC: session UUID
  "provider": "claude",                           // 'claude' | 'native' | future
  "projectName": "youcoded-dev",                 // portable cross-device key (folder name)
  "originalPath": "C:\\Users\\desti\\youcoded-dev", // path on the device that created it
  "title": "SyncHub Plan 1b Execution",
  "lastActive": "2026-07-10T21:14:03Z",           // ISO-8601, written at event time — NEVER derived from file mtime
  "device": "DESKTOP-ABC",                        // last device that ran a turn
  "flags": { "complete": { /* existing SessionFlagState shape */ } },
  "transcriptRef": "claude/transcripts/youcoded-dev/<uuid>.jsonl", // space-relative
  "createdAt": "2026-07-08T02:11:00Z"
}
```

### Writers (desktop main process; ONE writer module, `conversation-store.ts`)

- **Live path:** the existing TranscriptWatcher events (the app already subscribes) upsert the record on turn activity — title, `lastActive`, `device` set at event time.
- **Reconciler scan:** on startup (the load-bearing one) + a slow periodic tick (exact interval decided in Plan 2a), scan `~/.claude/projects/*/**.jsonl` and upsert records for sessions run outside the app (bare `claude` CLI). Guarded by the existing `SESSION_UUID_RE` (phantom-id lesson from the Resume Browser incident).
- **Titles:** the auto-title mechanism keeps writing where it writes today; the store consumes that output into `record.title`. Topic files stop being a *read* source of truth in Plan 2a and stop existing in Plan 2c (their write path is rewired or retired there).
- **Flags:** `setSessionFlag` writes the record (not the legacy index). Flag edits are the one write allowed from a non-lease-holding device.

### Invariants (each becomes a PITFALLS entry when built)

- **Mirror-in is add/update-only.** CC's own `cleanupPeriodDays` deletion of a local transcript must NEVER propagate as a deletion of the space copy. The space copy is the durable one. Only an explicit user delete removes a record/transcript from the space.
- **`lastActive` comes from the record field, never file mtime.** Sync/restore clobbers mtimes (the 627-file rebump incident). No consumer may infer recency from filesystem timestamps.
- **Conflict-copy healer:** leases protect transcripts, but records can be edited (flags/title) from two offline devices. When the store reads a record and finds engine conflict copies beside it (`<id> (from <device>, <date>).json`), it folds field-by-field (newest-timestamp wins per field), rewrites the canonical, deletes the copies. The engine's generic conflict policy gets NO special cases.
- **Provider plug-in contract:** a provider supplies (a) an event adapter into the normalized stream and (b) a stable conversation ID. Sync, backup, Resume Browser, flags, titles consume the store only — never a provider's disk format.

## 2. CC transcript sync + materialization

- **Mirror-in:** on turn-end (transcript-watcher event), copy/append the transcript from `~/.claude/projects/<local-slug>/<id>.jsonl` into the space at `claude/transcripts/<projectKey>/<id>.jsonl`. Transcript pushes go promptly on turn-end (do not wait for the engine's 15s quiet window). JSONL is append-only; git delta-compresses it well; leases prevent concurrent writers.
- **Materialize-out:** on pull, write updated transcripts into THIS device's `~/.claude/projects/<local-slug>/` (slug via the existing `ccProjectSlug` from the import work) so `claude --resume <id>` works natively. Materialization is add/update-only on the local side too (never deletes local files).
- **Project matching:** `projectKey` = folder name (same normalization family as `repoNameForSpace`). A conversation whose project exists locally (saved folder / managed root match by key) materializes eagerly on pull — combined with 1b's instant signals, transcripts are usually present before the user clicks (this IS the "warm prefetch" of the parent spec; no extra machinery needed). A conversation whose project does NOT exist locally still shows in the Resume Browser everywhere, with resume disabled and a plain-words note ("Project folder not on this device"). No glyphs.
- **Resume Browser reads the store.** During Plan 2a the legacy sources keep running untouched (dual-source is read-preference only: store first, legacy fallback); Plan 2c deletes the legacy path.

## 3. Session leases + takeover

### Lease authority

The 1b `SyncGroupRoom` DO is extended (allowlist + a small lease table in DO storage — same room, no new DO):

- Kinds added to `ALLOWED_KINDS`: `lease-acquired`, `lease-renewed`, `lease-released`, `takeover-request` (the 1b relay/ring is already kind-agnostic; this is the planned one-line-plus-handlers extension).
- Lease record: `{sessionId, device, expiresAt}` — **`expiresAt` is computed by the DO on server time** (parent spec §18 clock-skew rule; a device with a wrong clock can neither hold forever nor expire early).
- Heartbeat 30s; expiry **300s** after last renewal.
- Fallback when SyncHub is down: a best-effort lease file syncs through the git transport; stale rules apply to it identically. Per the never-block principle, no failure mode may lock the user out of their own conversation.

### Takeover flow

1. Device B opens a conversation whose lease is held by device A → dialog: **"This session is active on <Device A> — take over here?"** / Never mind.
2. Confirm → `takeover-request` relayed via the room.
3. Device A: interrupts any in-flight turn through the existing interrupt path (ESC → `TRANSCRIPT_INTERRUPT` → `endTurn`), final transcript push, `lease-released`, chat shows the moved-to banner, session (PTY) ends there. History stays readable.
4. Device B: sees the release + the push signal, pulls (usually a no-op thanks to eager materialization), acquires the lease, resumes (`claude --resume`).
5. **Unresponsive holder:** no ack within ~10s → dialog offers "<Device A> isn't responding — take over anyway?" → force: B acquires over the stale-pending lease and resumes; A's client, whenever it wakes, sees it no longer holds the lease and ends its session with the same banner (its final turn may land as an engine conflict copy in the worst case — visible, never silent loss).
6. **Expired lease (>5 min silent):** no dialog ceremony at all — open proceeds as if unleased.

## 4. Migration + demolition (strictly last)

- The existing `personal-sync` GitHub backup repo **becomes** the personal space's sync remote (history preserved; it changes jobs). Migration runs on first Phase-2 enable for existing GitHub-backup users.
- Backup layer shrinks to **Drive/iCloud, once daily, dated folders** (`Backup/2026-07-03/`), age-pruned. Restore Wizard speaks only Drive/iCloud; new-device bootstrap is "enable Sync and everything appears," the wizard is disaster recovery.
- **Deleted** (per parent §12): 15-min push loop; session-end push; 30s index-debounce push; `--ignore-existing` pull semantics; topic files + mtime-as-lastActive + `regenerateTopicCache`; **slug rewriting + foreign-slug symlinks — concretely `SyncService.aggregateConversations()` (`sync-service.ts:2062`, the `.jsonl`-into-home-slug symlinks "for /resume from ~") + `rewriteProjectSlugs()` (`:2026`, foreign-device slug junctions), both run from `pull()` (`:1595-1596`)**; GitHub restore adapter + GitHub backup target; recent-50 pull; `PROJECTS_UNSYNCED` warning. Warning codes shrink to actionable-only. (These symlinks are why 2a's reconciler skips symlinks — youcoded#118; once the aggregator is gone the skip is a harmless no-op. The Resume Browser's own `/resume from ~` need is replaced by the store-fed browser, so nothing else requires the aggregation after 2c.)
- Resolves the knowledge-debt entry "CC-drift: cleanupPeriodDays coverage" as part of the sync-service work.
- **Ordering guard (PITFALLS, standing):** none of `sync-service.ts` is touched before this plan — flipping backup to daily-only earlier regresses conversation backup freshness to 24h.

### 4a. Foreign-slug symlink removal — the FULL 2c task (not just deleting the functions)

Deleting the creator does NOT remove the symlinks already on disk, so this is a **four-part** task, all in Plan 2c:

1. **Stop creating them.** Delete `SyncService.aggregateConversations()` (`sync-service.ts:2062`) and `rewriteProjectSlugs()` (`:2026`), plus their two call sites in `pull()` (`:1595-1596`). (`regenerateTopicCache()` at `:1604` goes in the same pass — it's on the deletion list above.)
2. **One-time on-disk cleanup sweep (the easily-missed part).** A migration on first 2c launch must remove the symlinks/junctions ALREADY created (687 on Destin's machine; every existing user has them). Sweep `~/.claude/projects/*/` and delete entries where `lstatSync().isSymbolicLink()` is true (both the `.jsonl` file-symlinks from `aggregateConversations` and the `rewriteProjectSlugs` foreign-device dir junctions — on Windows a junction also reports as a reparse point; use `lstat`/junction-aware removal). **NEVER delete a real file** — only symlinks/junctions. Without this sweep the stale links linger forever (harmless to the store thanks to the 2a reconciler skip, but they pollute `~/.claude/projects` and confuse anyone browsing it, and CC's `/resume` picker from `~` still shows the stale aggregated set). Idempotent; safe to re-run.
3. **Keep the 2a reconciler symlink-skip (youcoded#118) — do NOT remove it.** After the aggregator is gone it's a harmless, cheap no-op, and it defends against any future/other symlink source. Removing it buys nothing and re-opens the bucketing bug if any symlink ever reappears.
4. **Accept the `claude --resume`-from-`~`-outside-the-app consequence.** The aggregation existed so CC's `/resume` invoked from the home dir (bare CLI, not through YouCoded) showed every project's conversations in one list. After removal, a bare-CLI user resuming from `~` sees only genuine home-dir sessions. This is acceptable: the in-app store-fed Resume Browser is the replacement and shows everything cross-project/cross-device. The agent trace confirmed `/resume from ~` + the legacy backup's consolidated-slug pull are the ONLY consumers, and both are replaced by the store — nothing else depends on the aggregation. (If the bare-CLI-from-home case turns out to matter, revisit before deleting — but the design intent is that the app is the resume surface.)

## 5. Plan decomposition & sequencing

| # | Plan | Scope | Gate before next |
|---|------|-------|------------------|
| 2a ✅ **SHIPPED** (youcoded#116, 2026-07-11) | **Store + conversation sync** | `conversation-store.ts` (records, reconciler, healer), transcript mirror-in/materialize-out, Resume Browser reads store (legacy fallback intact) | **Two-device dogfood** (handoff item D): conversations appear + resume works both ways on dev builds — STILL THE GATE before 2b |
| 2b | **Leases + takeover** | SyncGroupRoom lease table + kinds (worker), lease client + heartbeat + takeover dialog/banner + force path (desktop) | Two-device takeover verified |
| 2c | **Migration + demolition** | personal-sync repo repurpose, Drive/iCloud daily backup, the §4 deletion list | `/audit` + release checklist readiness |

Plans merge independently; nothing releases until the whole system is complete (Destin's standing §0 decision, desktop-only per decision 5). Each plan executes via superpowers:subagent-driven-development, Opus implementers, two-stage review — the process that caught real defects in every plan so far.

**Cross-track coordination:** the provider-seam track (Phase 0 of the platform roadmap) edits renderer session types/UI but not the conversation index/Resume Browser; 2a's store work is main-process + Resume Browser. Overlap is low; rebase before PRs as usual. The store's `provider` field uses the seam's `SessionProvider` values (`'claude' | 'native'`).

## 6. Testing

- `conversation-store.ts` record logic + healer as pure core (IO shell thin), unit-tested — house pattern (local-theme synthesizer, context discovery).
- Materialization path mapping (projectKey ↔ local slug) unit-tested against Windows + POSIX paths.
- Worker lease tests in the sync-hub suite style (SELF.fetch, server-time expiry, force-takeover ordering).
- Takeover integration on desktop with a mocked hub (the sync-spaces-service test harness already fakes the hub socket).
- The 10-test transport contract suite is untouched — none of this changes the transport.
- Reconciler + mirror-in guarded by fixtures for the invariants: cleanup-never-propagates, mtime-never-recency, healer folds.

## 7. Explicitly out of scope

- Read-only watching (deferred, separate feature on remote-access machinery).
- Native-harness adapter (platform track; schema + contract ready for it).
- Android sync (Phase 3, post-release).
- OpenCode: the 2026-05 opencode-mvp approach is abandoned; any OpenCode support arrives via the platform track's provider model, writing to this store like any provider.
