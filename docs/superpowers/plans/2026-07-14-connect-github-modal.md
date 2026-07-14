# Connect-GitHub Modal (Sync GA Prerequisite)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Opus implementers, two-stage review per task (handoff §3). Parallelizable with 2b/2c — touches none of their files except one SyncPanel hook-in.

**Goal:** Non-developers can connect GitHub from inside the app (device-code flow in a modal) so enabling Sync never dead-ends on "gh is not installed" / "Not signed in to GitHub".

**Architecture:** A main-process `github-auth.ts` runs GitHub's OAuth device flow directly (using the gh CLI's public client ID), then hands the token to `gh auth login --with-token` via stdin — so `gh` remains the single credential store the sync layer already uses. The modal shows the one-time code + opens the browser; main polls and pushes completion. gh-missing gets an install path (winget on Windows) with restart guidance.

**Tech Stack:** GitHub device flow (`https://github.com/login/device/code` → `https://github.com/login/oauth/access_token`), `gh` CLI, existing prerequisite-installer patterns.

**Governing docs:** parent spec `2026-07-03-cross-device-sync-design.md` §18; PITFALLS → Prerequisite Installer (ALL of it — CVE-2024-27980 `.cmd` spawn, `detectWinget()`, PATH-propagation restart rule); PITFALLS → Sync Spaces ("friendly gh error messages are a UI contract").

**Worktree:** `feat/connect-github-modal` in `youcoded`.

---

## Design decisions (pre-made — don't re-explore)

1. **Do NOT wrap interactive `gh auth login --web`.** It's an Ink-style interactive prompt; non-TTY spawns are fragile across gh versions. The device flow + `--with-token` is what gh itself does under the hood and is fully scriptable. (Task 1 still runs a 10-minute empirical probe to confirm on the dev box — if `gh auth login --web` happens to be cleanly non-interactive with all flags, note it, but build the device-flow path anyway: it also works while gh is MISSING mid-install, and gives us the code/URL to render in-app.)
2. **Client ID:** use the gh CLI's public OAuth client id `178c6fc778ccc68e1d6a` with scopes `repo,read:org,gist,workflow` (gh's own default set). The resulting token is a gh-shaped token, indistinguishable from a normal gh login — sync's `gh repo create/view` and the `.netrc` machinery keep working unchanged. Do NOT mint a new OAuth app (a second app = a second consent screen + our own secret handling for zero benefit).
3. **Token never leaves the main process** and is never logged, never sent over the remote WS, never written anywhere except piped to `gh auth login --with-token`'s stdin.
4. **gh missing:** Windows → `detectWinget()` then `winget install GitHub.cli`, then the PATH-propagation rule applies: if `gh --version` still fails post-install, show "Quit and reopen YouCoded" (deterministic fix — no polling loop, same as installClaude). macOS/Linux → show the brew/apt one-liner + a "Check again" button (no auto-install v1).

## Bugs to be wary of

- **Device-flow polling:** respect `interval` from the device-code response and back off on `slow_down` (add 5s); `authorization_pending` is the normal loop state, not an error. Timeout the whole flow at `expires_in` (~15 min) with a clean "code expired — try again" state.
- **`gh auth login --with-token` reads stdin; close stdin after write** or it hangs forever. Use the `runCommand`-style helper discipline; `gh.exe` is a real exe (no `.cmd` shell flip needed), but resolve it via PATH probe, not a hardcoded path.
- **After `--with-token`, run `Bootstrap`-equivalent follow-ups? NO** — desktop needs none (`.netrc` sync is Android-only). But DO re-run the sync enable path's provisioning check so the user lands in a working state without a second click.
- **The two friendly error strings in `space-manager.ts:53,57` are a UI contract** — the modal trigger matches on structured state (a new `github:status` IPC), NOT by parsing those strings. Don't regex the error text.
- **Remote browsers:** the modal must work over remote too (the flow is all main-process; the modal just renders code + polls status) — but `shell.openExternal` is desktop-only; on remote, render the URL as a copyable link instead of auto-opening.

---

### Task 1: Spike (timebox 30 min, no commit to src)

- [ ] In the scratchpad, run: `gh auth status` parsing check (exit codes: 0 authed, 1 not), and a raw device-flow probe with `curl`/node fetch against `https://github.com/login/device/code` (`Accept: application/json`, body `client_id=178c6fc778ccc68e1d6a&scope=repo read:org gist workflow`) — confirm the response shape `{device_code, user_code, verification_uri, expires_in, interval}`. Record findings in the task notes. **Do not complete an actual login against Destin's account during the spike.**

### Task 2: `github-auth.ts` (main)

**Files:**
- Create: `youcoded/desktop/src/main/github-auth.ts`
- Test: `youcoded/desktop/tests/github-auth.test.ts` (mock fetch + exec; pure state machine)

- [ ] **Step 1: Failing tests:**
  - `detectGh()` → `{installed:boolean, authed:boolean, login?:string}` from mocked exec results (gh absent → ENOENT path; present-unauthed → exit 1; authed → parse `gh api user -q .login` or `gh auth status` output)
  - `startDeviceFlow()` returns `{userCode, verificationUri, expiresAt}` from mocked POST
  - polling: `authorization_pending` keeps polling at `interval`; `slow_down` grows the interval by 5s; `access_token` resolves; `expired_token`/timeout rejects with a typed reason
  - `completeLogin(token)` spawns `gh auth login --with-token`, writes token to stdin, closes stdin, resolves on exit 0
  - token value never appears in any thrown error message (assert on a forced failure)
- [ ] **Step 2: Implement.** Keep the flow a pure async generator/state object with injected `fetchFn`/`execFn` (house pure-core/IO-shell pattern). Poll POST `https://github.com/login/oauth/access_token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`. Windows gh install path: `detectWinget()` from `prerequisite-installer.ts` (import, don't duplicate), then `winget install --id GitHub.cli -e --silent` via the `runCommand` helper; post-install re-detect; on still-missing → return the `restart-required` state (PITFALLS rule: no PATH-rebuild loops).
- [ ] **Step 3: Green. Commit** — `feat(github): device-flow auth module`.

### Task 3: IPC surface

**Channels (exact strings, 4-surface parity + Kotlin stub + `ipc-channels.test.ts` rows):**
- `github:status` → `{installed, authed, login?}`
- `github:connect-start` → `{userCode, verificationUri, expiresAt}` (also begins main-side polling; push `github:connect-done` `{ok, login?, error?}` when it resolves)
- `github:connect-cancel` → aborts polling
- `github:install-gh` → `{ok, restartRequired?, error?}` (Windows only; others return a typed `manual` state with the copy-paste command)

- [ ] preload (inlined literals) + remote-shim (object payloads) + ipc-handlers + remote-server routes + SessionService.kt combined stub case (`not-implemented-on-mobile`) + parity test rows. Commit — `feat(github): connect IPC parity`.

### Task 4: `ConnectGithubModal` (renderer)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/ConnectGithubModal.tsx`
- Modify: `SettingsPanel.tsx` (SyncPanel section)

- [ ] States: `checking` → `gh-missing` (install button on Win / command + "Check again" elsewhere; `restart-required` copy) → `code` (big `user_code`, Copy button, "Open github.com/login/device" — `shell.openExternal` on Electron, copyable link on remote, "waiting for approval…" note) → `done` (green-free plain-words success; auto-close after re-running the sync status refresh) → `error` (typed reasons: expired/network/denied, with Try again). L2 `<Scrim>`/`<OverlayPanel>`, `useEscClose` registration, no status glyphs, no hardcoded scrim/z-index (PITFALLS → Overlays).
- [ ] Triggers: (a) a "Connect GitHub…" row in the SyncPanel whenever `github:status` reports not-authed; (b) when Sync enable emits either provisioning error event, surface a "Connect GitHub…" action next to the existing error note (keep the raw message too — the strings are a pinned contract; the modal is additive).
- [ ] After `github:connect-done` ok: if the user was mid-enable, re-kick the enable/provisioning path automatically so "everything appears" without a second click.
- [ ] Commit — `feat(github): Connect GitHub modal + SyncPanel wiring`.

### Task 5: Verify + PR

- [ ] Full suite + tsc + build. Manual in the dev instance: sign out of gh (`gh auth logout` in a sandbox HOME if you don't want to touch the real auth — set `GH_CONFIG_DIR` to a temp dir for the dev run), walk the modal end-to-end with a throwaway GitHub account if available; otherwise verify every state renders via a mocked `github:status` and stop before the real token exchange, and ask Destin to do one live pass.
- [ ] PITFALLS additions: device-flow client-id decision, token-hygiene rule, modal-not-string-matching rule. Update handoff §2.C → shipped. PR, merge AND push, clean worktree.
