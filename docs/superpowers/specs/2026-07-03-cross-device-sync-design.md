# Cross-Device Sync — Design

> **📐 THE STANDING AUTHORITY — partially implemented (as of 2026-07-13).** This is the parent design for the whole cross-device-sync workstream; §17 has the phasing. SHIPPED: Phase 1a (#107), import (#109), management UX (#112/#113), SyncHub 1b (#21/#114), conversation store 2a (#116), and cross-device project discovery/rename/stop (`1f397c87`+`0b599bf5`). REMAINING: conversation leases (Plan 2b), legacy demolition (Plan 2c), Connect-GitHub modal, Android (Phase 3), release. **The LIVE status tracker is `docs/superpowers/2026-07-10-sync-completion-handoff.md`** — do not treat the "pending implementation plan" `Status:` line below as current.

- **Date:** 2026-07-03 (brainstormed 2026-06-12 → 2026-07-03)
- **Status:** Approved design, pending implementation plan
- **Precursor:** Full review of the existing sync/backup/restore system (conducted in-session 2026-06-12; key findings summarized in §1)
- **Related:** `docs/superpowers/plans/2026-05-04-opencode-provider-mvp.md` (shipped), `docs/superpowers/plans/2026-06-12-resume-browser-reliability.md` (shipped), `docs/decisions/003-multi-backend-sync.md` (superseded in part by this design), `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` (the platform account system SyncHub identity builds on; coordination memo at `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md`)

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

**Import/migration (REQUIRED for feature completion — expanded 2026-07-09):**

The rebuild is not complete until existing work can be brought into sync without manual file surgery. Users like Destin run their real projects as plain home-directory folders (`~/youcoded-dev`, `~/askthebudgetaz`, `~/cookinonlowheat`); a sync system that only covers folders born inside `~/YouCoded/` misses the entire point for them. Two explicit flows must ship (Phase 1b or a dedicated Phase 1 follow-up plan — see §17):

1. **Convert an existing saved-folder project into a managed synced project.** From the session picker (and/or Project View), any existing non-managed folder gets a "Sync this project" affordance. YouCoded shows a plain-language confirm — *"YouCoded will move this folder to `~/YouCoded/Projects/<name>/` so it can sync across your devices. Is this okay?"* — then MOVES the folder, updates the saved-folders entry (`~/.claude/youcoded-folders.json`) to the new path, and initializes the space. Post-move integrity matters: artifact sidecars, the central index, and conversation/cwd associations that reference the old path must be remapped or gracefully degrade; block (or warn hard) if a live session currently has the folder as its cwd.
2. **Import any on-device folder via the folder picker.** In the new-project flow, alongside "type a name," offer "choose an existing folder" (native picker). Same move-with-consent warning, same path-remap treatment. This is the general entry: a folder that was never a YouCoded project becomes a synced project in one step.

Shared rules for both flows: **move, not copy, is the default** (a copy silently forks the user's work — the old path keeps winning their muscle memory while the synced copy rots); name validation runs through the existing `validateSyncName` guards; a folder that is already a git repo is fine (the hidden `GIT_DIR` transport never touches it, and `.git/` is in the default ignore set); very large trees hit the §18 watcher-scale guardrail with the "too large to live-sync" fallback rather than a silent hang.

Also:

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
| **SyncHub** | A walled module **inside the platform Worker** (the wecoded-marketplace Worker, per the accounts consolidation): own routes + its own `SyncGroupRoom` Durable Object for device registry, change signals, session leases, presence. **Metadata only — never file contents, names, or conversation titles** | New module; reuses the platform Worker's session middleware, D1, cron, secrets, and CI deploy |
| **Conversation Store** | Provider-neutral local store (SQLite) fed by the existing TranscriptWatcher (CC) and OpenCodeSessionAdapter (OpenCode). Resume Browser, flags, and titles read from here. Replaces conversation-index/topic-file/slug machinery over time | New; conversation-index v2 schema is its seed |
| **Backup layer** | Once-daily mirror of *all synced spaces* to Drive and/or iCloud into **dated folders** (versioned). Restore Wizard retained for these two backends only. GitHub removed as backup/restore backend | Simplified from today's 15-min loop; most current push complexity is deleted (§12) |

## 6. SyncHub (signal service)

- **Lives inside the platform Worker** (wecoded-marketplace Worker — now the "YouCoded platform backend" per the accounts consolidation spec) as a walled module: its own routes and its own `SyncGroupRoom` Durable Object class. One deploy path, one secret store, one authenticated-DO pattern. **`SyncGroupRoom` and the social `PresenceRoom` are different DOs with different data** — a user's own devices vs. a user's friends. Shared infrastructure pattern, no shared state.
- **Reality check (2026-07-08):** accounts Phase 1 shipped identity + sessions + cron, but the Worker has **no Durable Objects and no WebSocket handling yet** — `PresenceRoom` is accounts Phase 2, unlanded. Whichever of `SyncGroupRoom` / `PresenceRoom` lands first pioneers the Worker's first `[[durable_objects]]` binding + DO `[[migrations]]` entry in `wrangler.toml` and the WebSocket-upgrade pattern; the second reuses it. Coordinate with the accounts track before starting Plan 1b.
- **One `SyncGroupRoom` per sync group** (a user's device set). Devices hold a WebSocket while the app runs. Missed signals replay from a small ring buffer on reconnect; a full reconcile-on-connect covers anything older, so the DO is never a source of truth — only an accelerant.
- **Identity/pairing (updated 2026-07-08 after accounts Phase 1 landed, `wecoded-marketplace@8d18246`):** devices authenticate to SyncHub with the **platform account session token** — the same Bearer token the app already stores after the shipped device-code sign-in (`marketplace-auth-store.ts` on desktop; `MarketplaceAuthStore.kt` on Android) — verified server-side by the existing `requireAuth` middleware / `resolveSession()`. The resolved **opaque `acct_` account id keys the sync group**, never a provider-derived string, per the platform-wide "no code ever parses a user id" rule. The `gh` token is used ONLY by the git transport (repo create/push/pull), not for SyncHub identity — the landed `resolvePat` helper is identity-keyed but does not auto-create accounts, so gh-token join would fail for users who never signed in; the session token has neither problem. Net: enabling sync requires the in-app platform sign-in (easy, shipped) plus `gh` auth (the §18 Connect-GitHub-modal risk). This makes a user's sync group, social account, and (later) YouCoded Cloud identity provably the same principal.
- **Message types (all metadata-only):** `space-updated {spaceId, rev}`, `lease-acquired/renewed/released {sessionId, deviceName}`, `takeover-request {sessionId}`, `device-online/offline`. Space IDs are opaque hashes; session IDs are provider UUIDs; the only human-readable field is the user-chosen device name.
- **Degradation:** if SyncHub is unreachable, the engine falls back to polling the transport every few minutes, and leases fall back to lease files written through the transport (slower takeover, same safety). SyncHub downtime never blocks work or loses data — it only makes sync less instant.
- **Privacy:** consistent with the analytics privacy-by-construction stance — the hosted component physically never receives user content.

## 7. Git transport (first SyncTransport implementation)

- Each space is backed by a **hidden git repository** using a separate git dir (`<root>/.youcoded/sync.git`) so a developer's own `.git` in the same project folder is never touched, and non-developers never see git at all.
- Remote: **auto-created private GitHub repos** (one per space), via the existing repo-creation flow. The personal space evolves from the existing `personal-sync` repo lineage.
- Push = commit + push (atomic, checksummed, resumable). Pull = fetch + merge. History = `git log` (free point-in-time restore, richer than the old wizard's version picker).
- **Known limits:** 100MB/file GitHub hard limit and multi-GB repo softness. **Built:** per-file size cap (50MB, `MAX_SYNC_FILE_BYTES`) with a clear "too large to sync — covered by your daily backup instead" message, plus default ignores (below). **NOT yet built (Phase 2c) — the single medium-term GitHub-backend concern:** a history-compaction / `gc` job for the unbounded `.git` growth from append-only transcript re-commits + binary churn. Audited 2026-07-12: the engine has no `gc`/repack/shallow today, so history accumulates every version forever. Non-trivial because the sync remote is *shared* — rewriting history to reclaim space means a force-push and every other device re-clones, so it needs a deliberate strategy (periodic `gc`/repack at minimum; squash/shallow for old transcript history), not a drive-by fix. Repos stay well under limits for normal use; heavy multi-month use is what eventually approaches GitHub's ~5GB soft recommendation.
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

### 10a. Device registry & friendly names (Plan 2b — decided 2026-07-12)

Leases and takeover need a stable per-device identity and human-readable device names ("moved to **Home PC**"), so the device registry ships **with 2b** (Plan 1b's `SyncGroupRoom` deliberately tracks no roster — `webSocketClose` persists nothing). Design:

- **Persistent registry = a git-synced `devices.json` in the Personal space** — one entry per device: a **stable random per-install id** (generated locally on first run; **NOT** the analytics device hash and **NOT** machine-id-derived — kept un-correlatable across contexts), the OS hostname as the *default* name, a **user-editable friendly name**, and first/last-seen timestamps updated on each sync. This is the backbone: it survives offline, needs no live socket, and gives a rename affordance (replace an identifying hostname like `DESTIN-HOME-PC` with "Laptop").
- **Live online/offline** (which devices are connected *right now*) reuses SyncHub's `device-online/offline` signals — a nice-to-have layered on the persistent list, not a prerequisite.
- **Surfaced in the Backup & Sync menu** as a "Your devices" list (name, last synced, online dot), extending today's spaces-only view; rename inline.
- **Privacy (see §14):** the registry lives ONLY in the user's own private sync repo and travels ONLY between the user's own devices — never sent to the Worker or analytics. The hostname it defaults to is *already* synced today (commit authors, conflict-copy filenames), so this adds no new collection; the friendly-name rename is a privacy *improvement*. The only device string SyncHub ever sees stays the ephemeral, connection-pinned `?device=` label (metadata-only, not persisted beyond the 32-entry ring).

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
- **The device registry (§10a) is the user's own data about the user's own devices** — a `devices.json` in the private Personal space, synced only between the user's devices, never sent to the Worker or analytics. Its device id is a random per-install value (**not** the analytics device hash, **not** machine-id-derived), so it can't correlate a user across contexts, and it carries only name + last-seen (no IP, geolocation, or serials). Friendly names let a user replace an identifying hostname — a net privacy improvement over the hostname that already syncs today.
- Default ignores prevent common secret files from syncing; first-sync warning on credential-looking files.
- Synced repos are always private; the engine verifies repo visibility at creation and on connect.
- `mcp.json` and other credential-bearing config are **excluded from sync by default** with an explicit opt-in (addresses the review finding that MCP keys currently ship to backends silently).
- **The platform account session token must never sync or back up — verified safe by construction as of accounts Phase 1 (corrected 2026-07-08).** The coordination memo anticipated `~/.claude/marketplace-auth.json` and an `account:*` rename; what actually shipped keeps the `marketplace:auth:*` naming and stores the token at Electron `userData/marketplace-auth.json` (`marketplace-auth-store.ts`, mode 0600) on desktop and in SharedPreferences (`MarketplaceAuthStore.kt`) on Android — **both outside every synced root** (`~/YouCoded/`, `~/.claude/` AI state), so no exclusion entry is needed today. The rule stands as a guard: account sessions are per-device bearer tokens (server-side logout, 90-day idle expiry, one token = one device); if the store ever moves under a synced or backed-up root, it MUST join the default exclusion set in the same change.

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
- **Prerequisites that make this a real product effort, not just a transport:** quotas/billing, abuse handling, data-deletion obligations, uptime/support responsibility. (The account-system prerequisite is already satisfied: the platform account substrate exists per `2026-07-03-youcoded-accounts-friendship-consolidated-design.md`, and with sync groups account-keyed from day one — §6 — the Cloud transport inherits identity for free.)
- **Economics:** R2 ≈ $0.015/GB-month, free egress — storage cost is trivial; the cost is operational responsibility. Paid tier funds it.
- **Why deferred:** the git transport delivers the same user value for free using infrastructure someone else operates; Cloud makes sense once "zero-setup sync, no GitHub account" is worth becoming a data custodian.
- **What keeps it honest:** the transport contract tests (§15) and the space abstraction (§4) — Cloud must slot in without changes above the transport seam.

A pointer to this section lives in `docs/knowledge-debt.md` so the commitment is discoverable outside this spec.

## 17. Phasing

1. **Phase 1 — Foundation + project sync:** `SyncTransport` interface + git transport, SyncHub, managed `~/YouCoded/` roots + session-creation picker integration, project + personal space live sync, simplified daily backup, GitHub-backup migration, Sync status surface.
   - **1a (SHIPPED 2026-07-08, youcoded#107):** transport + engine + managed roots + picker/SyncPanel UI + dated daily space backup. SyncHub, backup migration, and legacy deletions deliberately excluded (see the 1a plan's scope notes).
   - **1-followup — Import existing folders (SHIPPED 2026-07-09, youcoded#109):** the two §3 import flows — convert an existing saved-folder project to a managed synced project, and folder-picker import of any on-device folder — each with the move-with-consent warning and path-remap integrity work. Without this, sync only serves folders created after the feature shipped, which excludes the user's actual existing projects.
   - **1-followup — Project & sync management UX (SHIPPED 2026-07-09, youcoded#112 + #113):** session picker slimmed to rows + sync dots + a single "Manage projects…" bridge; unified two-step Add-a-project flow; ProjectHero as the per-project sync hub (status line, Sync now, rename/remove gating). Spec: `2026-07-09-project-sync-management-ux-design.md`.
   - **1b — SyncHub (SHIPPED 2026-07-10, wecoded-marketplace#21 + youcoded#114):** `SyncGroupRoom` DO (per-account `idFromName(userId)` rooms, kind-allowlisted signal relay, 32-entry storage-backed replay ring) deployed via the marketplace worker; desktop `sync-hub-socket.ts` + service wiring (signal→pull, push→signal on `pushed:true` only, reconcile-on-connect, SyncPanel "Instant sync" line). Live production smoke test verified relay + replay with real auth. The 120s poll stays as the fallback. Plan: `docs/superpowers/plans/2026-07-09-sync-hub-1b.md` (execution log inside).
2. **Phase 2 — Conversations + handoff:** Conversation Store + provider adapters feeding it, session leases, CC warm handoff + takeover UX, Resume Browser reads from store. Read-only watching as polish.
3. **Phase 3 — Android:** Kotlin engine port (spaces, transport, store ingestion against shared fixtures), mobile-appropriate scheduling (foreground sync + on-open reconcile rather than persistent watchers).
4. **Future:** YouCoded Cloud transport (§16); OpenCode live resume if upstream support appears.

Each phase gets its own implementation plan (writing-plans skill). **Release gating (Destin, 2026-07-09): phases MERGE independently but the app does NOT release until the sync system is entirely complete, including Phase 2 conversation sync** — conversation sync is the most important part of the expected UX, not an add-on. Whether Phase 3 (Android) also gates the release is an open decision — ask Destin before tagging. See `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

**Cross-track sequencing (updated 2026-07-10):** accounts Phase 1 (Worker identity rebuild) **landed** — `wecoded-marketplace@8d18246`: `users`/`identities`/`sessions` tables, `resolveProviderSignIn`, `requireAuth`/`resolveSession`, `/auth/me`, prune cron. SyncHub's identity dependency is satisfied: devices authenticate with the platform session token (§6). Accounts Phase 2 also **landed** (`wecoded-marketplace#20`): the Worker now HAS DO/WebSocket infrastructure — `PresenceRoom`, the `[durable_objects]` binding + `[[migrations]] v1` pattern, and hibernation-API WS handling — which Plan 1b's `SyncGroupRoom` reuses (new migration tag, mirrored `[env.test]` binding). Both tracks still touch `worker/`: rebase early, land D1 migrations as separate numbered files.

## 18. Open questions & risks

- **Watcher scale:** very large `Projects/` trees (a user importing a monorepo) — the ignore set + size caps mitigate, but the engine needs a files-count guardrail with a "this project is too large to live-sync" fallback.
- **GitHub rate/abuse limits:** per-space repos with frequent small pushes are well within limits for single users, but the engine should batch (debounce already does) and back off on 403/429.
- **CC `--resume` semantics** are a CC-coupled dependency (session-id stability verified 2026-06-12; re-verify on CC bumps — `docs/cc-dependencies.md` entry required when Phase 2 lands).
- **Lease correctness under clock skew:** lease expiry decided by SyncHub (server time), never device clocks.
- **Migration ordering:** GitHub-backup → sync migration must not run while a legacy 15-min push is mid-flight; reuse the existing `.sync-lock` discipline during the transition release.
- **Existing-folder import (§3) is a completion prerequisite, same tier as the Connect-GitHub modal.** Shipping sync that only covers newly created projects looks done in a demo and useless on a real machine full of pre-existing project folders. The rebuild is not "complete" until the convert-existing-project and folder-picker-import flows exist (decided with Destin 2026-07-09).
- **gh CLI auth is a silent gate for non-developers — the "Connect GitHub" modal is a GA prerequisite, not polish.** Sync Phase 1 requires `gh` auth (git transport + group join) and §3 makes Sync the default onboarding path. The accounts track's core lesson applies directly: the games lobby sat "empty" for months because non-developer users silently never pass `gh auth login`. The in-app "Connect GitHub" modal (wrapping gh's device-code flow; currently a deferred follow-up in the accounts spec) must ship **before Sync becomes the default onboarding path**. Desktop↔desktop dogfooding can proceed without it; GA cannot.
- **Accounts-track dependency (updated 2026-07-08):** accounts Phase 1 landed, so SyncHub is no longer identity-blocked. The remaining dependency is infrastructural: the platform Worker has no Durable Object / WebSocket setup yet — SyncGroupRoom either pioneers it or reuses accounts Phase 2's PresenceRoom setup, whichever lands first (§6, §17). The legacy `github:<id>` format is already deleted server-side; note the desktop client's `MarketplaceUser.id` type comment still mentions it — cosmetic, don't build on it.
