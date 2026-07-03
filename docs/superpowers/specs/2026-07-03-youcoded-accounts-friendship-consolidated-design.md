# YouCoded Accounts & Friendship — Consolidated Design

**Date:** 2026-07-03
**Status:** Approved design — Phase 0 implemented (pending runtime verification), Phases 1–2 ready for implementation plans, Phase 3 sketched.
**Supersedes:**
- `docs/superpowers/2026-07-01-friendship-model-session-status.md` (friendship-model session)
- `docs/superpowers/investigations/2026-07-01-github-auth-consolidation-status.md` (GitHub-auth session)
- Absorbs `docs/superpowers/specs/2026-06-13-games-marketplace-identity-design.md` as **Phase 0** (that spec remains the file-level implementation reference for the games slice).

## 0. Context & lineage

Two parallel sessions converged on the same code without knowing about each other:

- The **GitHub-auth session** audited sign-in surfaces, found two deliberate auth channels — (A) the marketplace's minimal-scope GitHub OAuth via the Cloudflare Worker, and (B) the user's broad-scope `gh` CLI login — decided to keep them separate, and spec'd the games lobby's identity switch from (B) to (A).
- The **friendship-model session** designed a full account system (multi-provider identity, friend graph, presence, inboxes) by extending the same Worker, and had approved its Section 1 (identity model) when work paused.

Both sessions redesigned `usePartyLobby.ts`'s identity source. This document consolidates them: the games slice is Phase 0; the account platform builds directly on top of it.

### Corrections to prior-session reasoning (verified against code, 2026-07-01..03)

1. **The friendship session's "no prior related work exists" claim was wrong** — the committed 2026-06-13 games spec covers the same lobby identity switch. Resolved by this consolidation.
2. **"PartyKit server is down" was the wrong outage suspect.** The deployment answers (`/party/global-lobby` → "No onRequest handler", the healthy signature of a WebSocket-only room). The observed symptom (connected lobby, nobody visible even when others are online) means *other users* are filtered out before connecting — by the gh-CLI auth gate (non-devs never pass it) and/or pre-rebrand builds pointing at the dead `destinclaude-games.itsdestin.partykit.dev` host (renamed at v1.0.0; old deployment no longer resolves). Root cause is closed out empirically by the Phase 0 and Phase 2 two-user verifications.
3. **Neither session addressed PartyKit connection auth.** The lobby room trusts a raw `?username=` query param — anyone can impersonate anyone. Tolerable for the toy global lobby; fatal for friend-scoped presence. Fixed by the Phase 2 presence design (authenticated Worker socket).
4. **Friend-scoped presence cannot run on the current broadcast-to-everyone room.** Filtering must be server-side or presence leaks every online user to every client. Fixed by the Phase 2 Durable Object design.
5. **The friendship session's Section 1 (new `users` PK) glossed over the FK/migration mechanics.** Per Destin's direction (user base ≈ 4), we do a clean SQL rebuild rather than an additive compat-shim migration — best long-term schema, no legacy id formats.

### Decision log (provenance)

| Decision | Status |
|---|---|
| Keep marketplace OAuth (A) and gh CLI (B) as separate channels | Inherited (auth session) |
| Games identity from marketplace sign-in; inline sign-in gate; remove `github:auth` IPC | Inherited (auth session, spec'd 2026-06-13) — **Phase 0** |
| Tier B backend (server stores accounts, friend graph, durable inboxes) | Inherited (friendship session) |
| Accounts optional; app fully usable signed out | Inherited (friendship session) |
| Provider-agnostic identity; GitHub first | Inherited (friendship session) |
| Google sign-in | **Reopened → design-only**; ships GitHub-only in phase 1, Google is a later config + review effort |
| Extend the Worker into the platform backend; walled `social/` module | Inherited (friendship session), boundary refined (identity is platform-level `auth/`, not social-level) |
| Discovery: invite links + searchable handles | **Reopened → handles only.** No invite codes, no invite links, no landing pages. Handle lookup is exact-match, session-gated |
| Blocking + handle policy in MVP | Inherited (friendship session) |
| No account merging in v1; linking an already-linked provider is refused | Inherited (friendship session) |
| No email/contacts discovery; no QR | Inherited (friendship session) |
| Global lobby survives? | **New decision → No.** Friends-only presence; global lobby retires in Phase 2 |
| Presence backend | **Reopened → Worker Durable Object**, not PartyKit (auth + friend graph + single CI-deployed backend) |
| Presence persistence | **New decision → single `last_seen_at` timestamp** (friends-visible, diagnostic value); no presence *history* ever |
| Offline messages | Inherited (friendship session) — phase 3, sketched here |

## 1. Accounts & identity (Phase 1)

**Where it lives.** The existing wecoded-marketplace Worker becomes the "YouCoded platform backend" in concept. Its deployed name, URL, and route stay identical — clients have the URL baked in, and the PartyKit-rebrand lobby split is the cautionary tale for renaming live backends. Identity/accounts live in the existing `auth/` layer (marketplace features already consume `user_id` from it). The walled `social/` module (Sections 2–4) owns friends, presence, and inboxes only, and talks to identity exclusively through the session middleware and user ids — that boundary is what keeps it extractable into its own service later.

**Schema (clean rebuild — replaces the current `users` table shape):**

```sql
users:      id TEXT PK ('acct_' || random),  -- opaque; nothing ever parses it
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            handle TEXT,                      -- nullable; UNIQUE index, stored lowercase
            status TEXT NOT NULL DEFAULT 'active',  -- tier-C stub ('active'|'suspended')
            created_at INTEGER NOT NULL,
            deleted_at INTEGER                -- tier-C stub; user deletion is hard delete

identities: provider TEXT NOT NULL,           -- 'github' (later 'google')
            provider_user_id TEXT NOT NULL,   -- GitHub numeric id / Google sub
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider_login TEXT,
            linked_at INTEGER NOT NULL,
            UNIQUE (provider, provider_user_id)
```

No `github_*` columns on `users` — provider data lives only in `identities`. No email column anywhere (data minimization; nothing needs it).

**Migration (one SQL migration file, D1/CI-applied):** create the new tables; remap the existing handful of users (`github:<id>` → fresh `acct_` ids) and carry `installs` / `ratings` / `theme_likes` / `reports` rows across via an old→new id mapping computed in the same migration; **drop all `sessions` rows** (every current user signs in again once — zero compat shims); drop the old tables. Worker queries that read `github_login` / `github_avatar_url` are updated to `display_name` / `avatar_url` in the same change (grep-driven; miniflare test suite in CI catches misses).

Known wrinkle: CI applies migrations *before* deploying the new Worker code, so the old code errors against the new schema for the seconds between the two steps. Accepted at current scale; don't merge Phase 1 mid-demo.

**Sign-in resolution:** the existing CSRF-hardened device-code flow is unchanged mechanically, but resolution becomes: look up `identities(provider, provider_user_id)` → account; if absent, create account (+ identity), seeding `display_name`/`avatar_url` from the provider profile. Internally parameterized by provider; only `github` ships in phase 1. Adding Google later = OAuth client config + provider adapter, no schema change (Google's consent-screen verification review is the real lead time and is out of phase-1 scope).

**Linking rules:** an account may link N providers; linking a provider identity already attached to another account is refused with a clear error. No account merging in v1.

**Session hygiene (new endpoints/behavior):** `POST /auth/logout` revokes the presented session server-side (today "sign out" only deletes the client's local token — the D1 row lives forever); sessions expire after 90 days of disuse; a Worker cron prunes expired sessions (shared with Section 4/5 pruning).

**Admin auth becomes id-format-independent:** `resolvePat` stops constructing `github:<id>` strings; the admin allowlist matches `(provider='github', provider_user_id ∈ allowlist)` via an `identities` lookup. Survives this and any future id change.

**Profile endpoints (Phase 1, in `auth/`):** update display name; set/change handle (validation + reserved list + uniqueness live here — the handle is account profile, even though *discovery* by handle is Phase 2). Avatar always comes from the linked provider's profile — no uploads, ever (scope guard).

**Hard rule:** *no code ever parses a user id.* Provider linkage is asked of `identities`. This is what makes this the last identity migration.

## 2. Friend graph & discovery (Phase 2)

**Tables (in `social/`):**

- `friendships (user_low, user_high, created_at)` — one canonical row per pair (`CHECK user_low < user_high`); symmetric by definition.
- `friend_requests (id, from_user, to_user, created_at, resolved state)` — the first durable inbox: requests wait server-side until the recipient next opens the app. Accepting creates the friendship and resolves the request atomically. Sending a request to someone with a pending request *to you* simply accepts it.
- `blocks (blocker, blocked, created_at)` — blocking severs any existing friendship, auto-declines pending requests both ways, prevents new requests and challenges, and hides presence in both directions. Block beats friend everywhere. The block list is visible only to its owner.

**Discovery — handles are the whole story.** No invite codes, no invite links, no landing pages (dropping the landing page also removes what would have been the only unauthenticated handle-probing endpoint).

- Adding a friend = enter a handle (exact match) → friend request → they accept. Nothing auto-friends; one flow.
- Handles: optional, unique, case-insensitive, 3–30 chars of `a-z 0-9 -`, reserved list (`youcoded`, `admin`, `support`, `mod`, `official`, `destin`, …) as the anti-impersonation floor. Renames allowed; the old handle is released only after a **30-day cooldown** (anti-sniping; tracked in a small `handle_releases` table). Deleted accounts' handles enter the same cooldown. Setting/changing a handle is a Phase-1 account API (Section 1); this section owns *discovery*.
- Lookup is **exact-match only**, session-gated, returning one minimal card (display name, handle, avatar). Prefix/fuzzy search is deliberately excluded — it's a user-enumeration/scraping surface; if ever wanted, it's a separate decision with its own privacy review.
- Consequence: you need a handle to be discoverable. The client prompts for one right after sign-in (skippable — you can still add others).

**Abuse limits:** per-user daily caps on friend requests, enforced with simple D1 counts (authoritative), keeping the existing per-colo Cache-API limiter for casual burst abuse only. Unfriending and declining are silent.

**API surface (all session-token-gated, all under `social/`):** exact handle lookup · send/accept/decline/cancel request · list friends/requests · unfriend · block/unblock/list blocks. (Handle set/change lives in `auth/`, Phase 1.)

## 3. Presence & games (Phase 2)

**Backend: a `PresenceRoom` Durable Object inside the platform Worker** (replaces the PartyKit lobby room; decision rationale — same session-token auth via the same `resolveSession()` against the same D1, direct friend-graph reads, one CI-deployed backend, and PartyKit's manual-deploy/rename history):

- Client connects to `wss://<worker>/social/presence`, authenticating with the session token. No `?username=` trust — closes the impersonation hole.
- **Friends-only fan-out:** on connect the DO loads the user's friend ids from D1 (cached in-DO; invalidated by a poke from friend-mutation routes). Presence events flow only between friends; strangers are mutually invisible.
- Single global DO instance for phase 2 (same scale class as the single PartyKit room it replaces); sharding is a documented later option.
- **Ephemeral vs durable:** presence state, `idle`/`in-game` status, and challenge relay live only in DO memory. The single exception: the DO writes `last_seen_at` to the user's D1 row on disconnect plus a coarse ~5-minute refresh while connected (so a crashed client doesn't freeze it). No presence *history* is ever stored — no session logs, durations, or event trails.
- **Challenges are friends-only:** the DO checks the friend set before relaying. Message shapes (`challenge`, `challenge-response`, `challenge-failed`, `presence`, `user-joined/left/status`) stay compatible with the current reducer events so `usePartyGame` and Connect-4 are minimally disturbed.
- **Multi-device:** presence keyed by account id, not connection id — join broadcast on first connection, leave on last (carries over the current room's dedup behavior).

**Game rooms stay on PartyKit in phase 2.** The Connect-4 relay is a dumb pipe keyed by a room code (a capability token); migrating it into the Worker is a later cleanup, listed under follow-ups. The old PartyKit **lobby** room is retired when this ships.

**Client:** `usePartyLobby` → `usePresence`. Same reducer events; identity is the account (display name + handle). The socket is owned by the platform layer, not the renderer (Section 6). Incognito ("appear offline") = don't connect, unchanged. Leader-window gating carries over.

**Player identity in games:** Phase 0 uses the GitHub login (unchanged tags for existing players); Phase 2 switches the visible tag to `display_name` (handle as the stable underlying identifier) — the Google-compatible answer, since non-GitHub users have no GitHub login.

## 4. Durable inboxes (Phase 3 — architecture fixed now, product details deferred)

- One generic table: `inbox_items (id, recipient, sender, type 'share'|'message', payload JSON, created_at, read_at, expires_at)`. Friend requests stay in their own table (graph state, not mail).
- **Share handoffs carry references, not content:** `{kind: 'theme'|'plugin'|'skill', slug}` pointing at the existing registries. Bytes never flow through D1.
- **Messages** are short text between friends: a DM that waits — sender writes while the recipient's app is closed; the Worker stores it; the recipient sees it on next open (or instantly via a presence-DO poke if online). Hard caps on length, per-pair daily count, and total inbox size. Anything richer is out of scope until it's a real ask.
- **Retention enforced at write time:** every item gets `expires_at` (default 30 days; phase-3 design may tune per type). The shared Worker cron prunes expired/read items. Account deletion cascades the inbox.
- Writes are friends-only, rate-capped, block-beats-everything.
- Delivery: `GET /social/inbox` on app open + live poke when online. No push notifications.

## 5. Privacy & account lifecycle

- **Delete account ships in Phase 1** (`DELETE /auth/account`, session-authed, typed confirm in UI). Hard delete; FK `ON DELETE CASCADE` removes identities, sessions, friendships, requests, blocks, inbox items (sent and received), installs, ratings, theme likes. `status`/`deleted_at` are tier-C *suspension* stubs (admin action), not user soft-delete.
- **Data export** (`GET /auth/export` → one JSON of every row referencing the account) ships in Phase 2, when meaningful personal data first exists.
- **Invariants:**
  1. **No presence history.** The only persisted presence fact is the single most-recent `last_seen_at` — friends-visible, coarsened in UI ("Active now" / "2h ago" / date), included in export, deleted with the account. (A "hide my last seen" preference is a noted future toggle, not phase-2 scope.)
  2. **The analytics device hash is never joined to an account id** — not in a table, a query, or a log line. Extends the existing no-cross-tabulation rule.
- **Privacy copy ships with the feature, never after:** Phase 1 updates the in-app privacy section (AboutPopup) with account storage + deletion; Phase 2 adds friend graph, presence, and last-seen wording; Phase 3 adds messages + TTL.
- **Minors, stated plainly:** no age, email, or real-name collection. Defenses are data minimization, friends-only interaction (no stranger contact by design), blocking, deletion, and TTLs.
- **Cron hygiene:** one scheduled Worker job prunes expired sessions, expired/read inbox items, and stale (90-day) unresolved friend requests.

## 6. Client UX & platform parity

- **Account surface (Phase 1):** Settings → Account section (avatar, display name, editable handle, linked providers, sign out, delete account). Existing `MarketplaceAuthChip` / `SignInPromptModal` flows re-worded from "marketplace sign-in" to "YouCoded account (via GitHub)". Post-sign-in skippable handle prompt (L2 `<OverlayPanel>`). IPC rename `marketplace:auth-*` → `account:*` in one atomic commit across preload / remote-shim / ipc-handlers / SessionService.kt + parity test (safe: all surfaces ship together).
- **The platform layer owns the presence socket.** Electron main / Android `SessionService` opens the authenticated WebSocket and relays events to React as push events (`social:presence-event`). Rationale: the session token already lives platform-side and never crosses into the renderer; Android behaves identically over the local bridge; remote browsers get presence relayed by the host like every other push event.
- **Friends UI (Phase 2):** the games panel's lobby becomes the friends list — display name + handle + plain-word status ("Online", "In game", "Last seen 2h ago"; **words, never status glyphs**). Add-friend by handle; requests section with Accept/Decline when non-empty; block via row menu, block list in Settings → Account; challenge buttons on online friends only.
- **Parity is scope, not hope:** every new IPC type lands in all four surfaces in the same phase, pinned by `ipc-channels.test.ts`. No desktop-only stubs for account/social — Android users are the audience. Intentional gap: remote-access sign-in opens the browser on the host (pre-existing, unchanged).

## 7. Phased rollout & verification

**Phase 0 — games slice.** Implemented on `feat/games-marketplace-identity` (worktree `youcoded.wt/games-identity`), per the 2026-06-13 spec: lobby identity from marketplace sign-in, `SignInScreen` gate, `github:auth` IPC removed (six touchpoints + orphaned gh helpers in main.ts). Desktop build passes; Kotlin compiles; the 3 failing desktop tests are pre-existing on master (verified against a clean checkout). **Remaining:** runtime pass via `bash scripts/run-dev.sh` (signed-out → button → sign-in → lobby auto-connects; incognito unchanged), a **two-user lobby verification** with a real second person, then merge + push + worktree cleanup.

**Phase 1 — account substrate.** Worker: rebuild migration, identity-based sign-in resolution, profile + handle endpoints, logout, session expiry + prune cron, delete-account, admin-PAT-via-identities. Client: `account:*` rename, Settings → Account, handle prompt. **Verify:** Worker suite in CI, live smoke test post-deploy, all current users re-sign-in once, delete-account exercised with a throwaway GitHub account. Near-zero user-visible change by design.

**Phase 2 — friends + presence + games.** `social/` module (friendships, requests, blocks, handle APIs), `PresenceRoom` DO with `last_seen_at`, platform-owned socket, friends-list UI, friends-only challenges, data export; PartyKit lobby room retired. **Verify (inherently two-person):** add-by-handle → accept → mutual presence → challenge → full Connect-4 game → block behavior → last-seen sensible after one side quits. Desktop + Android.

**Phase 3 — sketched only:** inbox (shares + messages, TTL cron), Google provider (incl. consent-screen verification), tier-C moderation. Each gets its own design pass against this architecture.

**Sequencing rule:** each phase is its own implementation plan (writing-plans skill), own worktree, verified and merged before the next starts. No cross-phase branches.

### Out-of-scope follow-ups (recorded so they don't vanish)

- **"Connect GitHub" modal** wrapping the gh CLI device-code flow for sync/publishing/issues, and routing every "run `gh auth login`" error string into it (gh's non-TTY output is version-sensitive; needs a spike + Kotlin mirror; Android `gh auth login --web` flakiness noted in PITFALLS).
- **Settings surface** showing the two GitHub connections (account vs gh CLI) with plain-language scope explanations.
- **Migrate game rooms off PartyKit** into the Worker (after which the PartyKit project can be decommissioned entirely).
- **"Hide my last seen"** preference toggle.
- De-Claude-ifying plugin publishing — explicitly ruled irrelevant to this work by Destin (auth session).

### Related in-flight work

- **Cross-device sync** (`docs/superpowers/specs/2026-07-03-cross-device-sync-design.md`, separate session, worktree `youcoded-dev.wt/cross-device-sync`) plans a SyncHub (device registry + leases) on the same Worker stack. Coordination memo with requested amendments (SyncHub keys groups by **account id** via `identities`, lives as a module in the platform Worker, account token file joins sync/backup credential exclusions, gh "Connect GitHub" modal becomes a sync-GA prerequisite): `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md`. Sequencing: accounts Phase 1 lands before SyncHub implementation; both tracks touch `wecoded-marketplace/worker/auth/` and `wrangler.toml` — coordinate migrations.

### Known risks

- **D1 migrate-then-deploy blip** (Phase 1): old Worker code errors against the new schema for the seconds between CI's migration and deploy steps. Accepted at current scale.
- **PartyKit game rooms remain legacy infra** until the follow-up migration; the rebrand host-split incident is the standing argument for finishing that migration eventually.
- **Lobby-emptiness root cause is still empirical**, not proven: closed out by the Phase 0 and Phase 2 two-user verifications. If a second user still fails to appear after Phase 0 with both parties signed into marketplace auth on current builds, diagnose before Phase 2 (candidates: leader-window gate, incognito persistence, WebSocket egress).
- **Single global presence DO** is a scale ceiling (fine for the foreseeable user count); sharding path documented in Section 3.
