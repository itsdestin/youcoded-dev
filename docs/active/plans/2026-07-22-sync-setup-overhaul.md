---
status: active
created: 2026-07-22
roadmap:
  - "Sync dead-ends on any machine without `gh`"
  - "Sync reports green \"All synced\" on a device that has never synced once"
  - "First-sync hydration has no progress state"
---

# Sync setup overhaul — honest state machine + GitHub token custody

Approved by Destin 2026-07-22 after the investigation in this session. Fixes the three
open `#sync` roadmap bugs as one program: the green-lie state machine, the unnarrated
first sync, and the `gh` dead-end on stock machines — and consolidates every GitHub
sign-in surface in the app onto one stored token.

## Symptoms (2026-07-20, beta.8 on a fresh macOS VM)

Enabling sync showed "Setting up…" then a green "All synced · instant sync on · 1 Device"
while the device had never pushed or pulled anything. Root cause of the sync failure was
`gh` being absent (Xcode CLT ships `git`, not `gh`); root cause of the *reporting* failure
is below. Destin escaped only via Terminal — exactly what the product exists to avoid.

## Investigation findings (verified against code 2026-07-22)

**(a) The gh-missing error is emitted, then structurally superseded.**
`startEngine` broadcasts the correct plain-language error (`service.ts:266` — the string
from `space-manager.ts:53`). But the space was already added to the engine *before*
`ensureRemote` threw (`service.ts:260-261`), so it runs live with no remote. With no
remote, `pull` returns `{updated:false}` (`git-transport.ts:236`) and `push` returns
`{pushed:false}` (`git-transport.ts:182`) — both "succeed" — so `engine.ts:138` emits a
**phantom `synced` event for a space that has never contacted any remote**, within ~a
second, from the very same `startEngine` call (`service.ts:284`). `latestUnresolvedError`
(`sync-dot-state.ts`) deliberately treats any later `synced` for the same space as
resolving the error (transient-hiccup suppression), so `errorMsg` is null before
`enable()` even resolves. The user never sees red, not even a flicker. The 120s poll
re-emits the phantom forever; `ensureRemote` is never retried until restart. "Try again"
(`syncNow`) only re-runs `engine.syncSpace` — it never retries provisioning — so even
after fixing gh/auth, sync stays remote-less until restart or toggle-cycle.

**(b) The ladder has an unused evidence signal in its own payload.**
No persisted "has ever synced" fact exists anywhere: `lastSyncEpoch` is the *legacy
rclone-backends* `.sync-marker` (written by `sync-service.ts`, a different subsystem);
`recentEvents` is per-boot and polluted by phantom syncs. But `spaces[].remote`
(`service.ts:381` — null exactly when provisioning never completed) is already in the
status payload the ladder destructures, used only for a tiny "connected/local only" chip
(`SyncPanel.tsx:1073`). "Instant sync on" comes from the SyncHub socket, which auths with
the *marketplace* token and needs no gh — hence the false comfort.

**(c) gh's real footprint + what already shipped.**
Sync uses gh for exactly two things: `repo create`/`repo view` (`space-manager.ts:40,46`)
and git credentials (`git-transport.ts` has zero credential logic — it inherits whatever
helper the system gitconfig has). The stopgap installer **already exists on master**:
`installGhUserLocal()` (mac/Linux user-local tarball, no sudo/brew) landed 2026-07-20 as
youcoded `f13dea52`, wired through `installGh()` → `GITHUB_INSTALL_GH` IPC → the
"Install GitHub CLI" button in `ConnectGithubModal`. It postdates beta.8. The state-machine
bug is what makes it unreachable: its entry points are the `waiting-github`/`error` header
states, which the supersession prevents.

**Unverified gap that could sink even the stopgap:** nothing runs `gh auth setup-git`, and
the in-app device flow ends in `gh auth login --with-token` (non-interactive), which is
not confirmed to configure git's credential helper. Every working machine so far went
through *interactive* terminal login. The pure in-app path may never have produced a
working `git push` on a clean machine. One VM test settles it; the fix if confirmed is a
one-line `setup-git` after `completeLogin`.

Other gh consumers (all optional flows, all keep working under this plan): marketplace
publishing (`skill-provider.ts`), theme publishing (`theme-marketplace-provider.ts`), PR
lookups (`theme-pr-lookup.ts`), bug reports (`dev-tools.ts`, has browser-prefill
fallback), legacy `sync-setup-handlers.ts`. Games identity is the marketplace account
(2026-07-20 correction), not gh.

## Phase 1 — Honest state machine (release unblocker, ships independently)

> **Status: SHIPPED 2026-07-22** — youcoded PR #199, merge `efab7e7d`. Items 1–5 below
> landed (item 4's hydrating phase is copy-level; percentages via `git fetch --progress`
> move to Phase 2+). Item 6 (VM verification of the gh installer through the first real
> push, incl. the `gh auth setup-git` question) is still OPEN — it needs Destin's macOS
> VM and gates calling roadmap :49's stopgap done. Roadmap :96/:99 flipped [x].

One main-process-owned sync status object with explicit phases; every surface (sidebar
row, panel header, project dots) derives from it. Phases:

`off → connecting-github → provisioning → hydrating → synced ⇄ syncing → error`

1. **Kill the phantom `synced`.** A space with no remote emits a `not-provisioned` error
   each cycle instead of `synced`. This keeps the gh error alive under
   `latestUnresolvedError`'s own philosophy ("a genuinely broken sync re-emits every
   cycle") — and MUST NOT regress the transient-hiccup suppression that helper exists for
   (a one-off error pinned the header red ~100 min pre-fix). Guard test required.
2. **Evidence-gated green.** `synced` requires every active space to have a provisioned
   remote (`spaces[].remote` — already in the payload) AND a completed first sync.
   Persist `firstSyncCompleted`/`lastSyncAt` per space in `sync-spaces.json` next to
   `remotes` (or derive from `origin/main` existing in the hidden repo). A never-synced
   device can never show green, structurally.
3. **Self-healing provisioning.** Retry `ensureRemote` on the 120s poll and on
   "Try again," so fixing gh/auth heals sync without restart or toggle-cycling.
4. **`hydrating` phase.** Distinct copy after provisioning returns: "Downloading your
   synced data — this can take a few minutes on first sync." Phase-only first;
   percentages come in Phase 2+ (parse `git fetch --progress` stderr once the transport
   is fully ours). Kills the "Setting up… / a few seconds" lie over a multi-minute pull.
5. **Preflight, don't fail-and-recover.** Toggling on with no working GitHub connection
   routes directly into the connect step (`connecting-github`), instead of erroring into
   a recovery CTA. Fix the auto-resume: `wasMidEnableRef` only fires on a *rejected*
   enable, which provisioning failures never produce — the completed connect must
   continue the enable.
6. **VM verification of the shipped stopgap** through the first actual push — settles the
   `setup-git` question (see above).

## Phase 2 — Shared `github-client` + remove gh from the sync path (fix B)

> **Status: SHIPPED 2026-07-22** — youcoded PR #201, merge `998d6fb0`. All bullets below
> landed as designed, with two deltas: (1) the git credential mechanism is an inline
> per-invocation `credential.helper` (NOT `GIT_ASKPASS`) — git consults helpers before
> askpass, so askpass could never outrank a stale system helper; (2) auth-refused git
> fetch/push failures are classified (`classifyGitAuthFailure`) and throw coded
> plain-language errors so an expired token can't masquerade as offline. `errorCode:
> 'github-auth'` rides error events → SyncPanel's Reconnect CTA; `github:status` is the
> combined status; the connect modal no longer gates on gh being installed. Guards:
> `github-client.test.ts`, transport/engine/connect Phase 2 pins, plus a real-git
> credentialed-cycle pin (CI Windows leg proves the inline helper under gh-for-Windows sh).
> The Phase 1 VM verification item now covers the gh-free path end-to-end and the
> `gh auth setup-git` question is moot on it (credentials ride the transport env).

New main-process module (`github-client.ts` or similar): token custody + REST helpers +
401 handling. Sync is its first consumer.

- **Token acquisition order:** app keychain → `gh auth token` (if gh present + authed) →
  in-app device flow. Developers with gh never see a connect screen.
- **Two-way bootstrap:** when the device flow completes, keep piping the token into
  `gh auth login --with-token` (best-effort, when gh exists) — so a non-developer who
  connects GitHub in the app gets a gh-authed *terminal*, and Claude Code sessions inside
  YouCoded can push code / open PRs. The app's connection and the agent's GitHub
  capability become one sign-in.
- **Storage:** Electron `safeStorage` (OS-keychain-backed). Explicit Linux policy: if
  `isEncryptionAvailable()` is false, store 0600-permission file + documented warning —
  never a silent fallback.
- **Sync conversion:** `repo create`/`view` become `POST /user/repos` / `GET
  /repos/{owner}/{repo}`; push/pull auth via `GIT_ASKPASS` (or inline
  `credential.helper` reading the child env) in the per-call env `git-transport.ts`
  already builds. Keep `sync-transport-contract.ts` green.
- **Credential precedence, no migration:** transport tries app token first, else falls
  back to the system helper working today. Existing devices untouched; no migration step
  to get wrong.
- **401 handling:** any REST 401 → paused "GitHub sign-in expired — Reconnect" state,
  never a cryptic push failure. Classify offline separately ("You're offline — sync will
  resume").
- **Token hygiene (extends, never relaxes):** never logged / in error strings / over the
  WebSocket (existing test) + NEW pins: never in `.git/config` after any transport op,
  never in spawn argv, log-redaction helper. Token never leaves the main process.
- **Keep gh's OAuth client id** (`178c6fc778ccc68e1d6a`) — token interchangeable with a
  normal gh login (the bootstrap depends on it), no second consent screen.

## Phase 3 — Consumer conversions + Connected accounts UI (mechanical follow-ups)

- Convert marketplace publishing + theme publishing fork/PR calls to REST via the shared
  client (currently they dead-end on stock machines exactly like sync did — at the
  product's social pillar). Convert `dev-tools.ts` bug reports to one REST POST
  (browser-prefill fallback stays). `theme-pr-lookup.ts` gains authed rate limits
  (60/hr → 5,000/hr).
- **Settings "Connected accounts" section:** two rows — WeCoded account (SyncHub, games,
  marketplace) and GitHub (sync storage, publishing) — with status + Disconnect each.
  Disconnecting GitHub deletes the stored token and pauses sync into a clear reconnect
  state (today there is no sign-out surface at all).
- Plain-language scope sentence in the connect modal (the `repo` scope grants access to
  all the user's private repos — identical to gh's token today, but say it).

## Explicitly out of scope / don't do

- No own OAuth app / GitHub App registration (complexity for no scope gain today).
- No token in the renderer or over the remote WebSocket, ever.
- No forced migration of gh-authed devices (precedence handles it).
- Don't touch legacy `sync-setup-handlers.ts` backends (rclone-era, on its way out).
- Don't remove the gh installer/modal machinery (terminal-agent story + unconverted flows
  still benefit).
- Don't convert all gh consumers in one PR — sync first, then mechanical follow-ups.
- No YouCoded Cloud transport now — but every choice above (transport-owned auth, one
  state machine, evidence-gated status) points toward the `SyncTransport` seam
  (`types.ts`, spec §16), where setup becomes one toggle with no third-party account.

## Verification matrix (before each phase ships)

Fresh machine no gh · gh authed · gh installed-unauthed · revoked token (401) ·
win32/darwin/linux keychain variants · final pass on the fresh macOS VM (the original
repro environment), through the first actual push AND a second device's first pull.

## Named residual risks

- The app becomes a credential custodian (keychain + hygiene test wall mitigate; still a
  new responsibility).
- `repo` scope breadth — same as gh today, disclosed in the modal.
- Phase 1 touches load-bearing suppression logic in `latestUnresolvedError` — guard tests
  are the contract.
- Linux keyring absence — explicit degraded-storage policy, never silent.

## Target UX (end state, stock machine)

Toggle ON → "Connect GitHub" card (one-time code + open-browser button) → "Setting up —
creating your private repositories" (honest: seconds) → "Downloading your synced data —
this can take a few minutes on first sync" (counts fill in) → green "All synced", earned
by a recorded completed sync. Any failure names the step, in plain language, with a retry
that retries that step.
