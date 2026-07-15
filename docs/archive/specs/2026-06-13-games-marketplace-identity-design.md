---
status: shipped
---

# Games: GitHub identity from marketplace OAuth (not gh CLI)

**Date:** 2026-06-13
**Status:** Executed — implemented 2026-07-03 on `feat/games-marketplace-identity`; absorbed as **Phase 0** of `2026-07-03-youcoded-accounts-friendship-consolidated-design.md`
**Scope:** Desktop + Android + remote (shared React UI). Single focused change.

## Problem

Multiplayer games currently derive the player's identity (their GitHub username, used
as a player tag) from the **gh CLI** via the `github:auth` IPC (`gh api user --jq .login`).
This is the wrong source for three reasons:

1. **Terminal dependency.** When the user isn't signed in, the games error screen
   (`GameLobby.tsx` `ErrorScreen` → `classifyPartyError`) literally tells them to
   *"Sign in to GitHub from a terminal with:"* and shows a `gh auth login` code block.
   A casual game shouldn't require a developer-grade CLI login.
2. **gh is a hard dependency** for a social feature that has nothing to do with git.
3. The app **already has the user's GitHub identity** from the marketplace OAuth flow
   (`useMarketplaceAuth().user.login`), which is a clean, in-app, browser-redirect
   sign-in — no terminal, minimal `read:user` scope.

This is the first slice of a larger GitHub-auth-UX effort. The broader decision (keep
the marketplace and gh channels separate, but make both terminal-free) is recorded in
conversation; this spec implements **only the games piece**. It does **not** unify the
two auth channels — see "Non-goals."

## Goals

- Games use the **marketplace identity** (`useMarketplaceAuth().user.login`) instead of
  the gh CLI.
- When the user isn't signed in, show an **inline "Sign in with GitHub" button** in the
  games screen that launches the marketplace sign-in flow (`startSignIn()`); the lobby
  connects automatically on completion.
- Remove the now-dead `github:auth` IPC end-to-end.
- Preserve player identity: `user.login` is the same GitHub login the gh path returned,
  so existing players keep their tag.

## Non-goals

- **Not** merging the marketplace and gh auth channels (rejected — would force casual
  marketplace/games users into gh's broad write scopes; the two-tier split is
  deliberate).
- **Not** touching sync setup, theme/plugin publishing, or issue submission (those keep
  using gh; making *their* flow terminal-free is a separate, later piece).
- No new game-context state surface (Approach B was considered and rejected).

## Approach (chosen: A — identity from context in the hook, sign-in gate in the UI)

"Not signed in" stops being a game **error** and becomes a clean **gate**, owned by the
marketplace auth context (the single source of truth for "am I signed in"). Two readers,
each with a clear purpose: the lobby hook reads `user.login` for the username; the games
UI reads `signedIn` to decide whether to render the gate.

Rejected alternatives:
- **B (route through game-state):** add a `PARTY_NEEDS_SIGNIN` action + state flag. Adds
  reducer/state surface for something the marketplace context already tracks.
- **C (overload `PARTY_ERROR`):** smallest diff but conflates "error" with "needs
  sign-in"; sign-in isn't a failure.

## Design

### 1. Identity swap — `desktop/src/renderer/hooks/usePartyLobby.ts`

- Call `useMarketplaceAuth()`; derive `const username = user?.login`.
- Add `username` to the connection effect's dependency array. Connect only when
  `username && !incognito && isLeader`. The effect re-runs automatically when sign-in
  state flips (sign in → connect; sign out → tear down) — strictly better reactivity
  than today's one-shot async fetch.
- When there's no `username`, **do not** dispatch `PARTY_ERROR` — simply don't open the
  socket. The UI gate (below) owns the not-signed-in state.
- Delete the `w.claude.getGitHubAuth()` call, its `.then(...)` body wrapper, and the
  `.catch(...)` block with the "install the GitHub CLI (gh)" copy.
- `PARTY_CONNECTED` still carries `username: user.login`, so `state.username` and all of
  `usePartyGame` are unchanged downstream.
- The existing `reconnect()` / `reconnectNonce` path stays for genuine connection errors.

### 2. Sign-in gate — `desktop/src/renderer/components/game/GameLobby.tsx`

- Read `useMarketplaceAuth()` (`signedIn`, `signInPending`, `startSignIn`).
- Add a `SignInScreen` sub-component (sibling to the existing `ErrorScreen` /
  `JoiningScreen` / `WaitingScreen`):
  - Player-tag explainer ("Games use your GitHub name as your player tag.").
  - A button wired to `startSignIn()`, rendering "Signing in…" while `signInPending`.
- Render order in `GameLobby`: `if (!incognito && !signedIn) return <SignInScreen/>;`
  **before** the `partyError` / spinner branches. Incognito keeps its existing UI (you
  don't need to sign in to stay intentionally disconnected).
- Remove the `github` / `sign-in` branch in `classifyPartyError` and the
  `gh auth login` `<code>` block — that path becomes unreachable.

### 3. Remove dead `github:auth` IPC

Games was the only consumer. Remove from all touchpoints:

| File | What to remove |
|------|----------------|
| `desktop/src/main/preload.ts:630` | `getGitHubAuth` |
| `desktop/src/renderer/remote-shim.ts:1069` | `getGitHubAuth` |
| `desktop/src/main/main.ts:1229` | `ipcMain.handle('github:auth', …)` |
| `desktop/src/main/remote-server.ts:1027` | `case 'github:auth':` |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:1128` | `"github:auth" ->` case |
| `desktop/src/renderer/hooks/useIpc.ts:109` | `getGitHubAuth` type |

**No parity-test change** — `github:auth` is not present in
`desktop/tests/ipc-channels.test.ts`.

## Cross-platform & edge cases

- **Android:** no new Kotlin for games behavior — `marketplaceAuth` already works on
  Android (browser sign-in via the Activity callback). The only Kotlin edit is *removing*
  the `github:auth` case.
- **Remote browser:** `startSignIn` opens the auth URL on the **host** machine (same as
  every other marketplace sign-in today) — pre-existing limitation, not made worse.
- **Incognito:** unchanged; still disconnects the lobby and shows its own UI regardless
  of sign-in state.
- **Provider availability:** `usePartyLobby` and `GameLobby` both render inside
  `<MarketplaceAuthProvider>` (App.tsx:2442 wraps GameProvider at 2448), so
  `useMarketplaceAuth()` is safe. The lobby hook runs only in the main window's
  `AppInner` (the buddy window uses a separate tree), so there's no second-root provider
  concern.

## Verification

- `cd youcoded/desktop && npm test && npm run build`
- `cd youcoded && ./gradlew assembleDebug` — confirm the Kotlin `when`-case removal
  compiles.
- Runtime via `bash scripts/run-dev.sh`:
  - Open Games while signed out → inline "Sign in with GitHub" button appears (no
    `gh auth login` code block anywhere).
  - Click → browser opens → on completion the lobby connects automatically and the
    player tag equals the GitHub login.
  - Confirm incognito still gates the lobby as before.

## Files touched

- `desktop/src/renderer/hooks/usePartyLobby.ts` (identity source)
- `desktop/src/renderer/components/game/GameLobby.tsx` (sign-in gate + remove gh hint)
- `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`,
  `desktop/src/main/main.ts`, `desktop/src/main/remote-server.ts`,
  `desktop/src/renderer/hooks/useIpc.ts`,
  `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (remove `github:auth`)
