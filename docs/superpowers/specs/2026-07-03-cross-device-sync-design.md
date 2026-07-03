# Cross-Device Sync — Design

- **Date:** 2026-07-03 (brainstormed 2026-06-12 → 2026-07-03)
- **Status:** Approved design, pending implementation plan
- **Precursor:** Full review of the existing sync/backup/restore system (conducted in-session 2026-06-12; key findings summarized in §1)
- **Related:** `docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md` (shipped), `docs/superpowers/plans/2026-06-12-resume-browser-reliability.md` (shipped), `docs/decisions/003-multi-backend-sync.md` (superseded in part by this design)

## 1. Motivation & background

A comprehensive review of the current system found that what YouCoded calls "sync" is actually a **scheduled cloud backup** of `~/.claude` (15-minute rclone/git push to Drive/GitHub/iCloud, pull at app launch) plus a restore wizard. As a backup system it is mature (locks, checksums, classified errors, atomic restore with undo). But:

1. **There is no cross-device continuity.** A user cannot close a session on their laptop and continue it on their desktop. Devices independently mirror to a shared cloud folder; transcripts already on disk are never updated from remote (`--ignore-existing`); settings never reconcile after first pull.
2. **Projects are not backed up at all.** The `PROJECTS_UNSYNCED` warning points at a sync-panel inclusion flow that was never built (`tracked-projects.json` is read in exactly one place and written nowhere). The user's actual work product has zero protection.
3. **The June 2026 incident** (221 conversations deleted by CC's 30-day cleanup while their backups sat safely in Drive) showed the system can succeed at backup while the user still experiences data loss — a transparency failure.
4. **Drive/iCloud backups are HEAD-only mirrors** — corruption propagates within 15 minutes and there is no version history (GitHub was the only versioned backend).
5. **The conversation pipeline is grafted onto Claude Code's private storage** (topic-file mtimes as `lastActive`, homedir-derived slugs, foreign-slug symlinks, model-typed topic filenames). Every CC behavior change is a potential data-integrity incident, and the pattern cannot extend cleanly to OpenCode or the future youcoded-harness.

This design replaces the "sync" layer with a true cross-device sync system and simplifies the backup layer underneath it.

## 2. Goals & non-goals

**Goals**

- **Project live-sync:** projects are folders the user creates in YouCoded, offered at session creation, living under a managed root. Everything inside (CLAUDE.md, docs, scripts, etc.) syncs across devices within seconds-to-tens-of-seconds.
- **Session handoff:** close a session on one device, open it on another with minimum friction ("warm handoff" — the data is already there when you sit down).
- **Personal space:** a general-purpose synced folder for anything the user wants YouCoded to own, not hardcoded to specific frameworks (encyclopedia et al. become folder conventions inside it).
- **Provider-agnostic:** conversations from Claude Code, OpenCode, and the future youcoded-harness are all first-class citizens (visible everywhere; resumable where the provider allows).
- **Platform-agnostic:** correct behavior across Windows/macOS/Linux mixes. Desktop↔desktop ships first; Android is a planned phase.
- **Simplify backup:** backup becomes one dumb, reliable, *versioned* daily job to Drive/iCloud. GitHub is removed as a backup backend — sync supersedes it.
- **Transparency:** users can always see what synced, what's pending, what conflicted, and which devices are online.

**Non-goals (this design)**

- Real-time collaborative editing (two devices editing one file simultaneously with live merge). The session lease makes one device the writer at a time; offline divergence resolves via merge/conflict-copies.
- Hosting user data on YouCoded infrastructure. That is the **YouCoded Cloud** future transport (§16), deliberately deferred.
- OpenCode live cross-device *resume* (visibility/readability everywhere ships; live resume waits on upstream session-import support and is lower value since local models are device-specific).
- Multi-user / shared projects. Sync groups are single-user (one person's devices).

## 3. User-facing model

YouCoded owns one folder on every device: **`~/YouCoded/`**

- **`Projects/<name>/`** — the folders offered when creating a new session. Everything inside live-syncs. Cross-device path mapping is automatic because the root is managed (Laptop's `~/YouCoded/Projects/budget-app` *is* Desktop's `~/YouCoded/Projects/budget-app`).
- **`Personal/`** — free-form space for anything else the user wants carried across devices: notes, reference docs, templates. Plugin frameworks (encyclopedia, journal) become conventions inside it (e.g. `Personal/Encyclopedia/`), not hardcoded sync categories. A user who never touches those plugins still gets full value from `Personal/`.

Alongside the visible folder, YouCoded silently syncs its **AI state**: conversations (all providers), per-project memory, user-created skills, and the portable settings subset. Users don't manage this — it's part of "my stuff is on both machines."

**The pitch:** *"Turn on Sync and your projects, files, and conversations are on every device. Drive or iCloud backup is an optional extra copy."* Onboarding pushes Sync as the default path; backups are framed as belt-and-suspenders.

**Import/migration:**

- Existing external folders can be imported into `Projects/` (move or copy).
- `~/.claude/encyclopedia/` migrates to `Personal/Encyclopedia/` with the plugin's paths updated.
- Existing GitHub-*backup* users are upgraded to sync automatically (same repo lineage; see §11).

## 4. Core concept: sync spaces

Everything syncable is grouped into **spaces** — the unit the transport moves:

1. **Project spaces** — one per managed project (`project:<name>`), containing the user's files.
2. **The personal space** — one per user: `Personal/**` + AI state (conversation store + raw transcripts, memory, skills, conversation index, portable settings).

Settings stay deliberately conservative: only the portable subset syncs (keybindings, theme preferences, the conversation index) — never machine-specific config — and the existing "first-pull-only, local wins afterward" rule is retained for anything that could break a device if blindly overwritten. Credential-bearing config (`mcp.json`) is excluded by default (§14).

The engine doesn't know how a space travels; the transport doesn't know what's in a space. That seam is where future transports plug in.

## 5. Architecture overview

| Component | What it is | Status |
|---|---|---|
| **Sync Engine** | Per-device daemon inside the app: watches owned roots, debounce-commits, pushes/pulls via transport, applies merges, materializes provider-specific artifacts (e.g. CC JSONL into device-local slugs) | New (TS desktop; Kotlin in Android phase) |
| **SyncTransport** | Interface: `push(space)`, `pull(space)`, `subscribe(space)`, `history(space)`. First impl: **git transport** (hidden repos → private GitHub). Future impl: **YouCoded Cloud** (§16) | New interface; git impl reuses existing `gh` auth + repo-creation code from `sync-setup-handlers.ts` |
| **SyncHub** | Tiny Cloudflare Worker + Durable Object: device registry, change signals, session leases, presence. **Metadata only — never file contents, names, or conversation titles** | New; same stack/pattern as the marketplace Worker |
| **Conversation Store** | Provider-neutral local store (SQLite) fed by the existing TranscriptWatcher (CC) and OpenCodeSessionAdapter (OpenCode). Resume Browser, flags, and titles read from here. Replaces conversation-index/topic-file/slug machinery over time | New; conversation-index v2 schema is its seed |
| **Backup layer** | Once-daily mirror of *all synced spaces* to Drive and/or iCloud into **dated folders** (versioned). Restore Wizard retained for these two backends only. GitHub removed as backup/restore backend | Simplified from today's 15-min loop; most current push complexity is deleted (§12) |

## 6. SyncHub (signal service)

- **One Durable Object per sync group** (a user's device set). Devices hold a WebSocket while the app runs. Missed signals replay from a small ring buffer on reconnect; a full reconcile-on-connect covers anything older, so the DO is never a source of truth — only an accelerant.
- **Identity/pairing:** devices join a sync group via the user's GitHub identity — the Worker verifies a `gh` token the same way the marketplace Worker's PAT path does (`auth/pat.ts` pattern). No new account system. The user already authenticates `gh` for the git transport.
- **Message types (all metadata-only):** `space-updated {spaceId, rev}`, `lease-acquired/renewed/released {sessionId, deviceName}`, `takeover-request {sessionId}`, `device-online/offline`. Space IDs are opaque hashes; session IDs are provider UUIDs; the only human-readable field is the user-chosen device name.
- **Degradation:** if SyncHub is unreachable, the engine falls back to polling the transport every few minutes, and leases fall back to lease files written through the transport (slower takeover, same safety). SyncHub downtime never blocks work or loses data — it only makes sync less instant.
- **Privacy:** consistent with the analytics privacy-by-construction stance — the hosted component physically never receives user content.

## 7. Git transport (first SyncTransport implementation)

- Each space is backed by a **hidden git repository** using a separate git dir (`<root>/.youcoded/sync.git`) so a developer's own `.git` in the same project folder is never touched, and non-developers never see git at all.
- Remote: **auto-created private GitHub repos** (one per space), via the existing repo-creation flow. The personal space evolves from the existing `personal-sync` repo lineage.
- Push = commit + push (atomic, checksummed, resumable). Pull = fetch + merge. History = `git log` (free point-in-time restore, richer than the old wizard's version picker).
- **Known limits, handled explicitly:** 100MB/file GitHub hard limit and multi-GB repo softness → per-file size cap (~50MB) with a clear "too large to sync — covered by your daily backup instead" message; history compaction job for binary churn; default ignores (below).
- Requires the GitHub backend connected (one-time OAuth). Drive/iCloud-only users are prompted to add it when enabling Sync; their backups are unaffected either way.

## 8. Sync Engine

- **Watch → debounce → commit → push.** File watcher on owned roots; ~15s of quiet triggers commit + push + `space-updated` signal. Transcript appends push on turn-end without waiting for quiet.
- **Receive:** on `space-updated`, pull + merge. Clean merges apply silently. True conflicts (both devices edited the same lines while offline) never block: the losing version is materialized as `filename (from Laptop, Jul 3).md` next to the original, with a toast + Sync panel entry. The session lease makes this rare — most edits come from sessions, and one device holds a session at a time.
- **Cross-platform correctness:** line-ending normalization (gitattributes); filename validation at creation time (Windows reserved names; case-collisions that break case-insensitive filesystems); repo-relative paths so homedir differences are irrelevant; symlinks not synced (skipped with a warning).
- **Guardrails:** default ignore set (`node_modules/`, build dirs, `.env*`, key/credential files — UI-overridable); per-file size cap with routing to daily backup; secrets warning on first sync of a file matching credential patterns.
- **Materialization:** the engine translates space-relative artifacts to device-local layouts — e.g. a synced CC transcript is written into the device's own `~/.claude/projects/<local-slug>/` so `claude --resume` works; per-project memory is keyed by project name in the space and materialized to the local slug path.

## 9. Conversations & multi-provider handling

- **Conversation Store** is the canonical record: `{id, provider: 'claude' | 'opencode' | <future>, project, title, lastActive, device, flags, transcriptRef}`. Provider adapters already produce normalized event streams (TranscriptWatcher, OpenCodeSessionAdapter); the store persists them. The store syncs in the personal space → **every conversation from every provider is visible in the Resume Browser on every device.**
- **Resume is provider-specific:**
  - **Claude Code:** raw JSONL also syncs (append-only; git delta-compresses it well; lease prevents concurrent writers). Engine materializes it locally; `claude --resume <id>` from the project path completes the handoff. Full warm-handoff path.
  - **OpenCode:** visible/readable everywhere from day one (store holds full event history). Live resume ships later if upstream session-import appears; UI shows "Ran on Laptop · local model" instead of a resume button it can't honor.
  - **youcoded-harness (future):** writes to the store natively — inherits sync, visibility, and handoff for free. **Design rule: the store schema, not any provider's disk format, is the contract.** Every provider integration supplies (a) an event adapter into the normalized stream and (b) a stable conversation ID. Sync, backup, restore, Resume Browser, flags, titles consume the store only.
- **Retiring the old machinery:** topic files, mtime-as-lastActive, `regenerateTopicCache`, slug rewriting and foreign-slug symlinks are replaced by the store + engine materialization (deprecation-staged; §12).

## 10. Session leases & handoff

- Opening a session acquires a **lease** via SyncHub: `{sessionId, deviceName, heartbeat 30s}`. Closing releases it after a final transcript push.
- Opening a leased session elsewhere → **"This session is active on Laptop — take over here?"** Takeover sends an interrupt via SyncHub to the holder (cleanly ends the in-flight turn through the existing `endTurn` path, final-pushes, releases), then resumes locally.
- **Stale leases:** no heartbeat for ~90s → lease expires; takeover proceeds without ceremony (covers laptop-asleep-at-home).
- **Warm prefetch:** devices background-pull transcript updates as signals arrive, so takeover is "click → resumed," not "click → download → resumed."
- **Phase-2 polish:** a "watch read-only" third option reusing the remote-access machinery.

## 11. Backup layer (simplified)

- **Backends: Drive and iCloud only.** GitHub is removed as a backup/restore option — synced data already lives in versioned private repos, so a GitHub "backup" is redundant. Existing GitHub-backup users migrate automatically: their `personal-sync` repo becomes the personal space's sync remote.
- **Schedule/shape: once per day**, copy **all synced spaces** (projects + personal, including conversations) to the backup backend into a **dated folder** (e.g. `Backup/2026-07-03/`), with age-based pruning. Dated folders fix the HEAD-only-mirror problem — a corrupted file no longer destroys the last good copy.
- **Restore Wizard** keeps merge/wipe/snapshots/undo but speaks only Drive/iCloud. New-device bootstrap is primarily "enable Sync and everything appears"; the wizard is the disaster-recovery path.
- The current 15-minute push loop, session-end push, and 30s index-debounce push are **deleted**, not moved — the sync layer's event-driven pushes replace them.

## 12. What gets deleted (simplification accounting)

Removed by this design (some immediately, some after a deprecation release):

- 15-minute push loop; session-end push; 30s index-only debounce push
- `--ignore-existing` pull semantics for conversations
- Topic-file mtime as `lastActive`; `regenerateTopicCache()`; topic files themselves (store replaces)
- Slug rewriting + foreign-slug symlink aggregation
- GitHub restore adapter + GitHub as a backup target
- `PROJECTS_UNSYNCED` dead-end warning (replaced by real project sync)
- Recent-50 pull machinery (superseded by warm prefetch + store)

The warning-code system survives but shrinks to genuinely actionable items (auth expired, quota, conflict created, offline-with-pending).

## 13. Failure modes & transparency

- **One Sync status surface** (Sync panel + status-bar widget) answering, per space: last synced, pending changes, conflicts needing attention, devices online.
- **Offline is a first-class state** ("3 changes waiting — will sync when you're back online"), not a warning.
- **Activity log:** every push, pull, merge, conflict-copy, and takeover is listed — no silent magic.
- **Never-block principle:** no failure mode may stop the user from working locally. Sync failures queue; conflicts produce copies; SyncHub outages degrade to polling; transport outages surface a status chip and retry with backoff.

## 14. Security & privacy

- User content flows only between the user's devices and the user's own GitHub account (git transport). SyncHub sees opaque IDs + device names only.
- Default ignores prevent common secret files from syncing; first-sync warning on credential-looking files.
- Synced repos are always private; the engine verifies repo visibility at creation and on connect.
- `mcp.json` and other credential-bearing config are **excluded from sync by default** with an explicit opt-in (addresses the review finding that MCP keys currently ship to backends silently).

## 15. Testing strategy

- **Two-instance integration harness:** generalize the `run-dev.sh` port/profile-shifting pattern — two dev instances with separate `userData` + separate fake homedirs, against a local miniflare SyncHub and a local bare git remote. Scripted matrix: edit-offline-both-sides, takeover-mid-turn, stale-lease expiry, conflict-copy creation, cross-platform filename rejection, transcript handoff + resume.
- **Transport contract tests:** one suite any `SyncTransport` implementation must pass — written for the git transport, reused verbatim for YouCoded Cloud later.
- **Store parity fixtures:** extend the `shared-fixtures/transcript-parity/` pattern to store ingestion — the same fixture set must produce identical store rows on desktop TS and (later) Android Kotlin.
- **SyncHub tests:** vitest-pool-workers/miniflare, same conventions as the marketplace Worker (including its `[env.test]` binding pitfalls).

## 16. Future work: YouCoded Cloud transport (roadmap commitment)

Documented here by explicit decision — **Destin intends to add this at a later date** as a second `SyncTransport`, likely a paid tier. Outline:

- **Storage:** Cloudflare R2, content-defined chunking (~1MB chunks, content hashes, dedup — edit a paragraph, upload kilobytes). Metadata (file-version → chunk list) in D1/DO.
- **Coordination:** the same SyncHub DOs, extended to carry data-plane change feeds.
- **Encryption:** client-side (end-to-end) — chunks encrypted with user-held keys before upload, so YouCoded-the-service cannot read user data. Requires key management + recovery-phrase UX (lost keys = lost data, or an explicit escrow choice).
- **Prerequisites that make this a real product effort, not just a transport:** a user account system (YouCoded currently has no server-side identity), quotas/billing, abuse handling, data-deletion obligations, uptime/support responsibility.
- **Economics:** R2 ≈ $0.015/GB-month, free egress — storage cost is trivial; the cost is operational responsibility. Paid tier funds it.
- **Why deferred:** the git transport delivers the same user value for free using infrastructure someone else operates; Cloud makes sense once "zero-setup sync, no GitHub account" is worth becoming a data custodian.
- **What keeps it honest:** the transport contract tests (§15) and the space abstraction (§4) — Cloud must slot in without changes above the transport seam.

A pointer to this section lives in `docs/knowledge-debt.md` so the commitment is discoverable outside this spec.

## 17. Phasing

1. **Phase 1 — Foundation + project sync:** `SyncTransport` interface + git transport, SyncHub, managed `~/YouCoded/` roots + session-creation picker integration, project + personal space live sync, simplified daily backup, GitHub-backup migration, Sync status surface.
2. **Phase 2 — Conversations + handoff:** Conversation Store + provider adapters feeding it, session leases, CC warm handoff + takeover UX, Resume Browser reads from store. Read-only watching as polish.
3. **Phase 3 — Android:** Kotlin engine port (spaces, transport, store ingestion against shared fixtures), mobile-appropriate scheduling (foreground sync + on-open reconcile rather than persistent watchers).
4. **Future:** YouCoded Cloud transport (§16); OpenCode live resume if upstream support appears.

Each phase gets its own implementation plan (writing-plans skill) and ships independently.

## 18. Open questions & risks

- **Watcher scale:** very large `Projects/` trees (a user importing a monorepo) — the ignore set + size caps mitigate, but the engine needs a files-count guardrail with a "this project is too large to live-sync" fallback.
- **GitHub rate/abuse limits:** per-space repos with frequent small pushes are well within limits for single users, but the engine should batch (debounce already does) and back off on 403/429.
- **CC `--resume` semantics** are a CC-coupled dependency (session-id stability verified 2026-06-12; re-verify on CC bumps — `docs/cc-dependencies.md` entry required when Phase 2 lands).
- **Lease correctness under clock skew:** lease expiry decided by SyncHub (server time), never device clocks.
- **Migration ordering:** GitHub-backup → sync migration must not run while a legacy 15-min push is mid-flight; reuse the existing `.sync-lock` discipline during the transition release.
