# GitHub Auth Consolidation — Session Status

> **SUPERSEDED (2026-07-03)** by `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md`. The games slice this session spec'd is Phase 0 of that consolidated design (implemented on `feat/games-marketplace-identity`); the deferred gh-CLI items are recorded there as out-of-scope follow-ups. Kept for historical context only.

**Date:** 2026-07-01 (session started ~2026-06-13; resumed after a 3-week gap)
**Companion spec:** `docs/superpowers/specs/2026-06-13-games-marketplace-identity-design.md` (commit `e4af627`, on master)

## 1. The initial problem

Destin asked for a review of **every app surface that offers or requires GitHub sign-in**: is it one consistent sign-in across the app, or do different features demand different sign-ins?

The audit (desktop + Android + Worker/registries) found **two completely separate GitHub auth channels** that don't share credentials and don't know about each other:

| Channel | What it is | Token storage | Scope | Features |
|---|---|---|---|---|
| **A. Marketplace OAuth** | YouCoded's own GitHub OAuth app; in-app browser device-code flow through the Cloudflare Worker; app stores only a Worker **session** token, never a GitHub token | Desktop: `~/.claude/marketplace-auth.json` (0600) · Android: `SharedPreferences("marketplace_auth")` | `read:user` only | Theme likes, plugin reviews/ratings, install tracking, abuse reports |
| **B. gh CLI token** | The user's own GitHub CLI login (`gh auth login --web`) | `~/.config/gh/hosts.yml` (+ mirrored to `~/.netrc` on Android for git HTTPS) | Broad write (`repo` etc.) | Sync/backup to GitHub, theme publishing, plugin publishing, bug-report issue submission, restore, **and multiplayer games' player name** |

Desktop and Android are consistent *with each other* (same IPC types on both platforms); the inconsistency is the A/B split itself. Two sharp edges:

1. Nothing in the UI signals these are different logins — "I'm already signed into GitHub" confusion is built in.
2. **Games** gate on channel B (`gh api user --jq .login`) just to read a username, even though channel A already holds the same GitHub identity. Playing a game shouldn't require a developer-grade CLI token.

The follow-up goal that emerged: **the user should never have to touch a terminal (or ask Claude) for any GitHub auth flow.** Today, the games error screen and several "not authenticated" errors literally tell the user to run `gh auth login` in a terminal.

## 2. Considered and agreed vs. rejected

### Rejected: unifying the two channels into one sign-in

Two unification routes were explored and **both were rejected** after asking "what do we lose?":

- **Route A — promote the marketplace OAuth to the single login** (broaden its scopes to write, Worker hands the real GitHub token back, seed it into gh's `hosts.yml`/`.netrc`). Rejected: the consent screen becomes "full control of your repositories" for *every* user, including someone who just wants to like a theme, and YouCoded becomes custodian of a powerful long-lived token on disk.
- **Route B — make gh the single source of truth, derive marketplace identity from the gh token** (reuse the Worker's existing `X-GitHub-PAT` → `github:<id>` path from admin analytics). Initially chosen, then **reversed** on review. Rejected because the A/B split is deliberate and load-bearing:
  1. Casual social actions (like a theme) would require a full gh login with broad write scopes — hostile to the non-dev target audience.
  2. gh becomes a hard dependency for marketplace features that currently work with no gh installed at all.
  3. The user's broad GitHub token would transit to the Worker — against the app's "no tokens leave your device" privacy posture (`AboutPopup.tsx`).
  4. Independent sign-out (marketplace vs. git/publishing) would be lost.
  5. It would *downgrade* the marketplace's own UX from a clean web redirect to gh's 8-char device-code flow.

### Agreed: keep both channels, make each terminal-free

- **Marketplace (A):** leave exactly as-is — it's already the clean, minimal-scope, no-terminal flow.
- **Games:** switch identity source from gh CLI to the marketplace identity (`useMarketplaceAuth().user.login` — same GitHub login, so player tags are preserved). Signed-out users get an **inline "Sign in with GitHub" button** in the games screen (chosen over "message pointing at the Marketplace tab" and over auto-launching the browser).
- **Remove the dead `github:auth` IPC now** (games was its only consumer) rather than leaving it as unused code. Six touchpoints; no parity-test entry exists for it, so no test churn.
- **gh-backed features (B — sync, publishing, issues):** later, build a shared "Connect GitHub" modal wrapping gh's device-code flow (stream output, parse the `XXXX-XXXX` code, copy-and-open-browser button, poll `gh auth status`), and route every "run `gh auth login`" error into it. **Deferred — not started.**
- **Explicitly out of scope:** de-Claude-ifying plugin publishing (desktop plugin publishing goes through the `wecoded-marketplace-publisher` skill/conversation — Destin ruled this irrelevant to the auth work).

### Design decisions inside the games fix (Approach A of three)

- Identity read in `usePartyLobby` from context; "not signed in" becomes a **UI gate**, not a `PARTY_ERROR` (rejected: new `PARTY_NEEDS_SIGNIN` reducer state; rejected: overloading `PARTY_ERROR` with a button).
- Render precedence in `GameLobby`: incognito wins over the sign-in gate; the gate wins over error/spinner screens.
- The `classifyPartyError` github branch and the `gh auth login` `<code>` block get deleted (unreachable after the change).

## 3. Done so far

- Full three-layer audit of GitHub auth surfaces (desktop, Android, Worker/registries) — findings summarized above and in the spec.
- Brainstorming flow completed for the games slice; design approved by Destin.
- **Spec written, committed, and pushed:** `docs/superpowers/specs/2026-06-13-games-marketplace-identity-design.md` (commit `e4af627` on `youcoded-dev` master + origin). It contains the full file-by-file design, cross-platform notes, and verification steps.
- Verified on resume (2026-07-01): spec intact on master; **no implementation exists** (`getGitHubAuth` still present in `usePartyLobby.ts`, `preload.ts`, `remote-shim.ts`, `useIpc.ts`, `main.ts`, `remote-server.ts`, `SessionService.kt`); no implementation plan written; the 3 weeks of unrelated work (artifact viewer, PTY env fix #106) touches none of the affected files.

## 4. Remaining

**Immediate (the games slice — spec approved, awaiting execution):**

1. Write the implementation plan (superpowers writing-plans skill) from the spec.
2. Implement in a `youcoded` worktree:
   - `usePartyLobby.ts` — identity from `useMarketplaceAuth()`, connect gated on `username && !incognito && isLeader`, drop the `getGitHubAuth` call and its error copy.
   - `GameLobby.tsx` — add `SignInScreen` (explainer + `startSignIn()` button, `signInPending` state); render before error/spinner, after incognito; remove the gh hint branch.
   - Remove `github:auth` from: `preload.ts:630`, `remote-shim.ts:1069`, `main.ts:1229`, `remote-server.ts:1027`, `SessionService.kt:1128`, `useIpc.ts:109`.
3. Verify: desktop `npm test && npm run build`; Android `./gradlew assembleDebug`; runtime pass via `bash scripts/run-dev.sh` (signed-out → button → sign in → lobby auto-connects; incognito unchanged).
4. Merge + push (youcoded repo), clean up worktree.

**Later (agreed direction, not yet designed in detail):**

5. Shared "Connect GitHub" modal for the gh device-code flow (spike gh's non-TTY output format first — version-sensitive, needs a Kotlin mirror; PITFALLS notes the Android `gh auth login --web` flakiness).
6. Route all "run `gh auth login`" error strings (e.g. `theme-marketplace-provider.ts:376`) into that modal.
7. Possibly a single "GitHub: connected/not-connected" status surface in Settings explaining the two scopes.
