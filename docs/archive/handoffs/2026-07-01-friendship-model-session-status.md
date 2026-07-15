---
status: shipped
---

# Session Status — Games Lobby & Friendship Model (2026-06 → 2026-07-01)

> **SUPERSEDED (2026-07-03)** by `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md`, which consolidates this session's design with the GitHub-auth session's work and corrects several findings (the PartyKit server was NOT down; prior related work DID exist — the 2026-06-13 games-identity spec). Kept for historical context only.

## 1) The initial problem

Destin asked two questions:

1. **Why did the games lobby ("who's online") stop working?** Was it intentionally removed?
2. **Is there any open work about restructuring games around a friendship model?**

**Findings:** The lobby was **never removed or disabled** — code (`GameLobby.tsx`, `usePartyLobby.ts`), the PartyKit backend (`partykit/src/lobby-room.ts`), and recent git history all show active maintenance through April 2026. The failure is almost certainly a runtime dependency; top suspect is the PartyKit server (`youcoded-games.itsdestin.partykit.dev`) being down/dormant. Other candidates: signed-out GitHub auth, the Incognito toggle, or the multi-window leader gate. **Root cause not yet diagnosed** (open item).

No prior friendship-model work exists anywhere — this session started that design from scratch. Key research input: YouCoded today has **four disconnected identities** (lobby = ephemeral GitHub username; marketplace Worker = GitHub OAuth + D1 `users`/`sessions`; analytics = device hash; sync = user's own cloud tokens). The marketplace Worker is already ~70% of an account system.

## 2) Considered and agreed vs. rejected

### Agreed (locked in)

- **Scope:** Friendship eventually unlocks presence/games, sharing, messaging, and co-presence. **Phase 1 = friends + presence + games**, but the identity substrate is designed for the full vision now.
- **Backend tier:** **Tier B** — server stores accounts, friend graph, and durable inboxes (friend requests, share handoffs, offline messages). Tier C (moderation/reporting/abuse review) is deferred but architected for with stubs.
- **Discovery:** **Invite links + searchable `@handles`.** Consequence accepted: handles pull **blocking** and a **minimal handle policy** (uniqueness, reserved names, anti-impersonation) into the MVP.
- **Accounts are optional.** YouCoded stays fully usable with no account; the account only unlocks the social layer.
- **Provider-agnostic sign-in.** GitHub-only identity excludes the core audience (students, non-devs). GitHub = linked provider #1, Google = #2, more later.
- **Architecture: Approach 1 — extend the marketplace Worker** into the **"YouCoded platform backend"**: one singular account consolidating user-end sign-ins and services. Built as a **walled-off `social/` module** (own routes, own tables, session-token-only interface) so it can be extracted into its own service later. Two non-negotiables: (a) the module boundary is real; (b) the identity migration is its own careful, rollback-safe task.
- **Design Section 1 (Account & Identity Model) — approved 2026-07-01:**
  - `users` table with native uuid PK, `display_name`, `avatar_url`, nullable `handle`, tier-C stubs (`status`, `deleted_at`).
  - `identities` table `(user_id, provider, provider_user_id, provider_login, linked_at)`, unique on `(provider, provider_user_id)`. One account, N providers.
  - Sign-in generalizes the existing device-code flow per provider; sessions stay hashed-bearer, plus logout/revoke endpoint and stale-session prune.
  - Migration: additive-first (new tables alongside old `github:<id>` keys), cutover second, compat shim for the admin PAT-auth path.
  - Linking conflict rule: linking a provider already attached to another account is **refused** — no account merging in v1.

### Rejected

- **Approach 2 (separate dedicated social service):** ~2× upfront work, second service to secure/operate; isolation not needed at current scale. The `social/` module boundary preserves the option.
- **Approach 3 (auth SaaS — Clerk/Auth0/Supabase):** third party holding user identities contradicts the privacy/self-hosted ethos; ongoing per-MAU cost; still requires building the friend graph anyway.
- **GitHub-keyed friendship (no accounts):** dead end for the non-developer audience.
- **Email/contacts discovery:** email-enumeration privacy risk; not needed.
- **Account merging in v1:** genuinely hard (whose friends/handle?), safely deferrable while accounts are new and empty.
- **QR-code discovery:** considered, not selected for the discovery set (invite links + handles chosen instead).

### Known costs accepted with eyes open

- Storing a friend graph + message inboxes makes YouCoded a **data controller for personal data, including minors'** — phase 1 must include delete-account endpoint and message TTL/retention basics.
- Handles create a public namespace → blocking + handle policy in MVP (not deferred to tier C).
- D1/Worker coupling: offline-message inboxes are the first thing likely to strain D1 — the module boundary is the insurance policy, and messaging volume will likely force the eventual extraction.

## 3) What we've done so far

- Investigated the lobby "outage" — confirmed intentional removal did NOT happen; narrowed to runtime suspects (not yet diagnosed).
- Confirmed no pre-existing friendship/social plans anywhere in the workspace.
- Researched the current identity/auth landscape across app + Worker (lobby identity, marketplace OAuth/D1 schema, analytics device hash, sync auth).
- Ran the brainstorming design dialogue: scope → backend tier → discovery model → architecture selection → began section-by-section design review.
- **Section 1 (Account & Identity Model) presented and approved.**
- No code written, no spec file committed yet — design conversation only (plus this status doc).

## 4) What remains

### Design (in progress — brainstorming skill flow)

1. Present remaining design sections for approval, one at a time:
   - **Section 2:** Friend graph & discovery (invites, handles + policy, blocking)
   - **Section 3:** Durable inboxes (friend requests, share handoffs, offline messages, retention/TTL)
   - **Section 4:** Presence & games integration (what stays ephemeral in PartyKit vs. durable in D1; how lobby identity switches from GitHub username to account)
   - **Section 5:** Privacy & account lifecycle (deletion, data export, in-app privacy copy)
   - **Section 6:** Client UX (sign-in/linking flow in app, Android parity via SessionService IPC)
   - **Section 7:** Phased rollout (phase 1 = friends + presence + games; later phases = sharing, messaging)
2. Write the spec to `docs/superpowers/specs/2026-07-XX-youcoded-accounts-friendship-design.md`, self-review, commit.
3. Destin reviews the written spec.
4. Invoke the **writing-plans** skill → implementation plan.

### Implementation (after plan approval)

- All of it — nothing has been built. Worker `social/` module, D1 migrations, identity migration + compat shim, Google OAuth, client UI, PartyKit identity switch, etc.

### Separate open item (not part of the design)

- **Diagnose why the lobby is actually down** — check PartyKit server deployment status first (`youcoded-games.itsdestin.partykit.dev`), then client-side suspects (gh auth, incognito, leader window). Worth doing regardless: phase 1 of the friendship model rides on the same PartyKit presence backbone.
