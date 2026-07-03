# Coordination Memo: Cross-Device Sync × Accounts/Friendship Platform

**Date:** 2026-07-03
**From:** the accounts/friendship consolidation session
**To:** the cross-device-sync session (worktree `youcoded-dev.wt/cross-device-sync`)
**Action requested:** amend `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` (§5, §6, §14, §16) before writing the sync implementation plan.

---

## 1. What you need to know happened elsewhere

A parallel line of work consolidated two earlier sessions (games/lobby identity + friendship model) into one approved spec, committed to `youcoded-dev` master:

> **`docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md`**

Read it before amending — but the short version of what it establishes:

- **YouCoded gets a real server-side account system, starting now.** The wecoded-marketplace Worker becomes the "YouCoded platform backend" (same name/URL). Its Phase 1 (implementation imminent) rebuilds identity as:
  - `users`: opaque `acct_<random>` primary key, `display_name`, `avatar_url`, `handle`, tier-C stubs. **No `github_*` columns.**
  - `identities`: `(provider, provider_user_id) → user_id`, one account / N providers (GitHub first, Google later).
  - The old `github:<id>` user-id format is **eliminated** (clean D1 rebuild — user base ≈ 4, no compat shims).
  - **Hard rule adopted: no code ever parses a user id.** Provider linkage is asked of the `identities` table only.
- **`auth/pat.ts` semantics change in Phase 1.** `resolvePat` no longer constructs `github:<id>` strings. PAT/gh-token resolution becomes: GitHub token → GitHub numeric user id → `identities` lookup → opaque account id. The admin allowlist is re-keyed the same way.
- **The platform Worker gains the infrastructure sync was planning to build separately:** an authenticated WebSocket + Durable Object pattern (the friends-only `PresenceRoom`), session-token middleware, cron pruning, and the existing CI deploy (`worker-deploy.yml`: test → D1 migrate → deploy → secrets).
- Phases: Phase 0 (games identity off gh CLI — already implemented, branch `feat/games-marketplace-identity`), Phase 1 (account substrate — next), Phase 2 (friends + presence), Phase 3 (inboxes/Google, sketched).

## 2. Conflicts / overlaps found in the sync spec, and the amendments requested

### 2.1 §6 SyncHub identity — conflicts with the identity rebuild (must change)

Current text: devices join a sync group "via the user's GitHub identity — the Worker verifies a `gh` token the same way the marketplace Worker's PAT path does (`auth/pat.ts` pattern). No new account system."

Problems:

1. It copies a pattern (`github:<id>` user keys from `auth/pat.ts`) that the accounts Phase 1 **deletes**. Building SyncHub on it bakes the legacy id format into a brand-new subsystem the same release it's eliminated, and violates the platform-wide "no code parses user ids" rule.
2. "No new account system" is now stale — the account system exists (or will, before sync Phase 1 plausibly lands). Keeping sync groups keyed by a *separate* GitHub-token identity creates a third parallel identity axis (platform account, gh-token identity, analytics device hash) — the exact fragmentation the accounts consolidation exists to end.

**Requested amendment:** keep the gh-token *authentication* (sensible — the git transport already requires gh), but resolve it to the **platform account id**: `gh token → GitHub /user id → identities lookup → account` (auto-creating the account if none exists, identical to GitHub sign-in resolution). Sync groups are keyed by the opaque account id. Consequences you get for free: the same human's sync group, social account, and (later) YouCoded Cloud identity are provably the same principal; §16's account-system prerequisite is satisfied.

### 2.2 §5/§6 SyncHub as a separate Worker — architecture drift (should change)

The spec reads as a new standalone "tiny Cloudflare Worker + DO." The platform Worker now already has: DO + authenticated WebSocket infrastructure (PresenceRoom), session middleware, D1, cron, secrets, and a CI deploy pipeline. A second Worker means a second deploy path, second secret store, and two divergent implementations of "authenticated DO holding per-user WebSockets."

**Requested amendment:** SyncHub becomes a walled module **inside the platform Worker** (sibling of `social/` — own routes, own DO class, e.g. `SyncGroupRoom`). Its privacy property ("metadata only — never file contents, names, or conversation titles") is about what flows through it, not where it runs, and is unaffected. Note in the spec that SyncHub and PresenceRoom are *different DOs with different data* (your own devices vs. your friends) — shared pattern, no shared state.

### 2.3 §3/§7 gh-CLI dependency as the default onboarding path — product-level warning (should acknowledge)

Sync Phase 1 requires gh CLI auth (git transport + group join), and §3 makes Sync the onboarding default. The accounts session just spent its whole arc diagnosing what that gate does: the games lobby was "empty" for months because non-developer users silently never pass `gh auth login`. Fine for desktop↔desktop dogfooding; not fine as the default path for the app's actual audience.

**Requested amendment:** add to §18 (risks) — the **"Connect GitHub" modal** (an in-app wrapper around gh's device-code flow; currently a deferred follow-up in the accounts spec, originally from the GitHub-auth session) is a **prerequisite for making Sync the default onboarding path**, not a nice-to-have. Dogfooding can proceed without it; GA cannot.

### 2.4 §14 credential exclusions — missing the account session token (small, must change)

§14 excludes `mcp.json` from sync but not the marketplace/account auth file (today `~/.claude/marketplace-auth.json`; may be renamed with the `account:*` IPC rename in accounts Phase 1). Account sessions are per-device bearer tokens — server-side logout, 90-day expiry, and presence semantics all assume one token = one device. Syncing or backing up that file replicates a bearer token across machines via cloud storage.

**Requested amendment:** add the account auth file (both current and future name) to the default credential-exclusion set for sync AND the daily backup. Each device signs in once itself.

### 2.5 §16 YouCoded Cloud prerequisites — stale claim (trivial)

"a user account system (YouCoded currently has no server-side identity)" — no longer true. **Requested amendment:** point the prerequisite at the accounts spec; with §2.1 above, sync groups are already account-keyed, so the Cloud transport inherits identity for free. Remaining real prerequisites (quotas/billing, abuse, retention obligations, ops) stand.

## 3. Explicitly NOT in conflict — don't change these

- The **space/transport/engine architecture**, git transport, leases, conversation store, backup simplification: no interaction with accounts. Untouched.
- **SyncHub device presence vs. social friend presence:** different concepts (my devices vs. my friends), different DOs, no shared state. Both existing designs stand.
- **gh CLI remains the auth for the git transport itself** (repo creation, push/pull). The accounts work deliberately keeps the marketplace/account channel and the gh channel separate — sync using gh for *git* is correct and unchanged. Only the *SyncHub group identity* moves to the account (§2.1).
- The sync spec's phasing and testing strategy.

## 4. Sequencing note

Accounts **Phase 1 (Worker identity rebuild) should land before SyncHub is implemented** — SyncHub's group keying and token resolution depend on the `identities` table and the new `resolvePat`-style helper existing. If sync's plan reaches SyncHub first, coordinate: the identity rebuild is a single self-contained Worker arc (schema migration + auth-layer updates) and is the very next implementation phase on the accounts track. Watch for merge adjacency in `wecoded-marketplace/worker/` — both tracks will touch `auth/` and `wrangler.toml` (DO bindings, migrations); rebase early, and land migrations as separate numbered files.

## 5. Pointers

- Accounts/friendship spec: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` (master, commit `fed7402`)
- Executed games slice (Phase 0): `docs/superpowers/specs/2026-06-13-games-marketplace-identity-design.md` + branch `feat/games-marketplace-identity` (worktree `youcoded.wt/games-identity`, unmerged pending runtime verification)
- Superseded session docs (historical context): `docs/superpowers/2026-07-01-friendship-model-session-status.md`, `docs/superpowers/investigations/2026-07-01-github-auth-consolidation-status.md`
