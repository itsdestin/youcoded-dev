# What YouCoded has today (code audit, 2026-09-26)

Read-only audit of `wecoded-marketplace/` at `61a5d46` and `youcoded/` at `bb939f917`.
Paths are relative to the workspace root.

## Headline

- Every "integration" is a marketplace plugin: skill files plus bash scripts the assistant runs
  in a Claude Code session. The app has no Google/Apple/Microsoft sign-in code and no connector
  framework.
- Google needs each user to build their own Google Cloud project by hand; sign-in lapses every 7 days.
- Apple is Mac-only (Swift helper + AppleScript).
- Microsoft: nothing exists anywhere.
- Computer use: "macOS Control" and "Windows Control" are "planned" tiles with no code. The native
  harness has no browser or computer-use tool. Browser automation exists only as third-party
  marketplace plugins (playwright, browser-use, chrome-devtools-mcp), usable only in Claude Code sessions.
- Android: integrations are listed but cannot be installed.

## google-services (`wecoded-marketplace/google-services/`)

- `plugin.json` v0.1.0, personal accounts. 23 skills (22 vendored `gws-*` + `youcoded-gws-reauth`),
  one 608-line setup command `commands/google-services-setup.md`.
- `gws` = `googleworkspace/cli` (Rust, Apache-2.0, prints a "not an official Google product" line —
  `docs/DEV-VERIFICATION.md:95`). Pinned `GWS_PINNED_VERSION="0.22.5"`, "Update quarterly; last
  bumped 2026-04-16" (`setup/install-gws.sh:10`) — not bumped since. Downloaded to `~/.youcoded/bin`,
  appends PATH to the shell profile (`:113-136`); a pre-existing npm/brew/cargo `gws` aborts setup (`:31-50`).
- Skills call it over bash, every call carrying `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=<dir>` and
  `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` (`skills/gws-shared/SKILL.md:71-81`). No MCP.
- Setup (conversational, the assistant runs scripts and gates steps with AskUserQuestion):
  0. `uname` platform check (`:66-81`).
  1. Install gcloud (~500 MB; macOS needs Homebrew, Linux apt only with deprecated `apt-key`,
     Windows needs winget; `install-gcloud.sh:34-58`) and gws. Exit 2 = "start a new conversation"
     because gcloud isn't on PATH yet (`:67-76`).
  2. `gcloud auth login` — browser trip 1.
  3. `bootstrap-gcp.sh` creates `youcoded-personal-<6 chars>` and enables 6 APIs; then THREE manual
     Cloud Console pages: consent screen (~5 sub-steps), add yourself as test user (5 sub-steps,
     incl. a Google "Ineligible accounts not added" popup the copy tells users to ignore), create a
     Desktop OAuth client + download JSON (6 sub-steps) (`:198-311`). Google shut down the API for
     automating external consent screens on 2026-03-19 (`docs/archive/specs/2026-04-16-google-services-design.md:437-443`).
  4. `ingest-oauth-json.sh` finds the newest `client_secret*.json` in `~/Downloads`, needs Python 3,
     wipes stale token caches (`:39-149`).
  5. Warn about "Google hasn't verified this app"; "check every box".
  6. `gws auth login` in background, URL scraped from the log (`:379-396`).
  7. `smoke-test.sh` (6 read-only calls); `migrate-legacy.sh`; optional extra accounts.
  - Total: ~4 browser trips, ~20 console clicks/fields, 8–10 chat gates, ~500 MB download.
- Failure points: no brew/winget, non-apt Linux, gcloud not on PATH, MSYS pipefail, conflicting gws,
  no Python, JSON not in Downloads, wrong client type, stale cache, unchecked scope boxes, Workspace
  org policy, missing `jq` (`lib/registry.sh:8`).
- Scopes: gmail.modify, drive (full), calendar, documents, spreadsheets, presentations (design spec
  `:299`, `:433`) — via gws defaults plus "check every box".
- 7-day expiry: External + Testing + sensitive scopes ⇒ 7-day refresh tokens
  (`docs/archive/investigations/2026-04-16-refresh-token-findings.md`). `youcoded-gws-reauth`
  pattern-matches `invalid_grant`/401 and reopens the browser.
- Multi-account: registry `~/.config/gws-profiles.json`, one config dir per account; fast path reuses
  the primary client (only if the email was added as a test user), slow path = a whole new project.
  Upstream gws dropped multi-account in v0.7; we rely on two undocumented env vars
  (`docs/archive/specs/2026-04-29-google-services-multi-account-design.md:10,31-38`).
- Stale: `install-gws.sh:111` references `lib/gws-wrapper.sh`, which no longer exists;
  `DEV-VERIFICATION.md` checklist entirely unchecked.

## apple-services (`wecoded-marketplace/apple-services/`)

- `"platforms": ["macos"]`, 15 skills, one setup command.
- `bin/apple-helper`: universal Swift binary (EventKit for Calendar/Reminders, Contacts framework),
  built from separate repo `itsdestin/apple-helper`, ad-hoc signed, not notarized. Copied to
  `~/.apple-services/bin/` so macOS privacy grants stay tied to a stable path; quarantine stripped.
- `lib/apple-wrapper.sh`: calendar/reminders/contacts → helper; notes/mail → `osascript`; iCloud Drive
  → plain file access. Denied permission → `TCC_DENIED:<svc>`, exit 2.
- **Probable Mac bug (unverified, no Mac here):** the wrapper calls `timeout` (`:68`, `:117`) and
  `flock` (`:111`), neither of which ships with stock macOS; setup Step 5 also uses `timeout`. Only `jq`
  is checked for.
- Setup: macOS 14+, jq via brew, grant Calendar → Reminders → Contacts, then Automation for Notes and
  Mail (attributed to the host app, found by walking parent processes). Dev checklist never completed.
- Windows/Linux/Android: nothing.

## Integrations index and other plugins

`wecoded-marketplace/integrations/index.json` (stamp 2026-04-22):

| Integration | Status | Notes |
|---|---|---|
| apple-services | available | darwin; postInstall `/apple-services-setup` |
| google-services | available | `/google-services-setup` |
| imessage | available | Anthropic's plugin; no setup, shows "Connected" at once; Full Disk Access not handled |
| todoist | available | `setup.type: api-key` — the installer rejects that type ("setup method isn't supported", `integration-installer.ts:129-132`): **broken** |
| applescript, canva, github, macos-control, windows-control | planned | no code |

- youcoded-messaging: Go MCP server over `mautrix-gmessages` (Google Messages pairing). Manifest claims
  darwin/linux/win32 but **only `gmessages.exe` ships** — likely broken on Mac/Linux. Description still says "SMS/iMessage".
- youcoded-inbox: its SKILL.md lists "Gmail MCP tools" + rclone while `providers/gmail.md` uses gws — inconsistent.
- spotify-services: Python MCP with PKCE; user registers their own Spotify developer app; long trail of portability fixes.

## The app (`youcoded/`)

- UI: `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` (integrations rail; detail
  overlay `:728`; setup details `:1054`).
- `desktop/src/main/integration-installer.ts`: fetches the index (24 h cache); only `setup.type:
  "plugin"` implemented (`:125-133`). `connected` stays false while a setup command exists and **nothing
  ever sets it true** — Google/Apple show "Needs auth" forever. `configure()` unimplemented (`:230-234`).
- Setup trigger: "Open setup session" opens an empty session hardcoded to `claude-sonnet-4-6`
  (`MarketplaceScreen.tsx:84-89`); the user types the slash command. No native setup UI.
- Sign-ins the app DOES own: Claude Code, OpenRouter (`providers/openrouter-oauth.ts`), ChatGPT
  (`chatgpt-oauth.ts`), GitHub device flow (`github-auth.ts`), YouCoded account. No Google/Microsoft.
- MCP: `mcp-reconciler.ts` writes plugin MCP servers into `~/.claude.json` (Claude Code only). Native
  MCP phase 1 reads only a hand-edited `~/.youcoded/mcp.json`; "a marketplace-installed MCP server is
  visible in Claude Code sessions but NOT in native sessions today" (`youcoded/docs/native-runtime.md:572-594`).
- Native harness tools (`harness/tools/index.ts`): Read, Write, Edit, Bash, BashOutput, KillShell, Glob,
  Grep, TodoWrite, WebFetch, WebSearch, SendUserFile, SendUserLink, AskUserQuestion (+ Skill, Task,
  ModelSearch). **No browser, screenshot or computer-use tool.**
- Native sessions can run plugin skills but the catalog has no plugin *commands*, so the setup flows
  are probably unusable in native sessions (inferred, not tested).
- Android: `integrations:install/connect` return "not-implemented" (`SessionService.kt:1248-1259`); no
  calendar/contacts/SMS permissions in `AndroidManifest.xml`.

## Roadmap / past decisions

- Vision spec `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md:167` (MCP phase 2
  unbuilt) and `:340-343` (browser-use tool listed as a Phase 6 differentiator, no roadmap entry).
- `docs/roadmap/native-harness.md:377-381` (MCP only by hand-editing a config file).
- No roadmap item covers the 7-day re-sign-in, the Cloud Console friction, or Microsoft.
- Why users bring their own Google project (`docs/archive/specs/2026-04-16-google-services-design.md:36-46`):
  verification takes ~4–6 weeks, needs a homepage/privacy policy/demo video, and "would make Destin the
  sole owner of an app every user depends on." A YouCoded-owned verified app was parked as v2 "once v1
  has measurable usage" (`:481`).
- History: 27 commits, almost all in April 2026 (installer portability, MSYS/pipefail, gws's
  undocumented behaviour, console quirks); nothing since August. In practice, unmaintained.
