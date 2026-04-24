# Marketplace Integrations v2 — Bundled Skills Plan

**Status:** Planning refined 2026-04-16; ready to implement Phase 1. One empirical test (TCC attribution) blocks Phase 2 commitment.
**Created:** 2026-04-16
**Owner:** Destin

## Problem

The landing page advertises 18 integrations. Today's reality:

- `google-workspace` marketplace entry is **deprecated metadata only** (marked `deprecated: true` 2026-04-14, no real implementation)
- Gmail is backed by Anthropic's hosted MCP; a `tool-router.sh` PreToolUse hook blocks it and redirects to a `gws` CLI that was never built
- Drive is backed by `rclone` (real, works)
- Gmail / Drive / Docs / Sheets / Slides / Calendar are fragmented: three different transports, several missing entirely
- Google Messages works via existing `youcoded-messaging` plugin (`mautrix-gmessages` Go binary)
- **iMessage is already covered by the official Anthropic iMessage plugin**, present in our marketplace index (`./external_plugins/imessage`, `sourceMarketplace: "anthropic"`). It polls `~/Library/Messages/chat.db` directly and sends via `osascript`. Needs Full Disk Access + Automation permission. No new work required here — just promote it as the iMessage integration.
- Apple Notes, Apple Reminders, Apple Calendar, Apple Mail: **none implemented** today
- Safari, Canva: no backing
- iCloud: only referenced as a sync backend in setup-wizard; no file/data integration

Net: ~7 of 18 chips have real backing once we count the Anthropic iMessage plugin. The rest are aspirational.

## Goal

1. Make every chip on the landing page **actually work**
2. Collapse the 18 service surface into **~8 installable skills** at the marketplace layer (bundling is a marketplace concern, NOT a landing-page concern — landing page keeps all 18 chips for marketing breadth)
3. Every skill ships with a **first-run setup command** that installs deps, walks through auth, and verifies with smoke tests

## Architecture

### Landing page (unchanged)

All 18 chips stay: Google Drive, Google Docs, Google Sheets, Google Slides, Google Calendar, Gmail, Google Messages, iMessage, iCloud, Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Todoist, GitHub, Chrome, Safari, Canva. "More coming soon..." chip stays.

### Marketplace skills (the install surface)

| Marketplace skill | Backing | Chips covered |
|---|---|---|
| **Google Services** | `googleworkspace/cli` (Rust binary) + existing `mautrix-gmessages` | Drive, Docs, Sheets, Slides, Calendar, Gmail, Google Messages |
| **Apple Services** | EventKit-based MCP (3rd-party now, YouCoded-native later) + AppleScript supplements for Notes/Mail | iCloud (Drive), Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Apple Contacts |
| **iMessage** | Official Anthropic iMessage plugin (already in marketplace) | iMessage |
| **macOS Control** | AppleScript (`osascript`) + `cliclick` + `screencapture` + `shortcuts` CLI + curated app recipes | Safari, plus Spotify / Apple Music / Finder / Terminal / Zoom / MS Office etc. |
| **Windows Control** | Existing `mcp__windows-control` MCP | Windows desktop automation |
| **Todoist** | Existing skill | Todoist |
| **GitHub** | Existing official MCP | GitHub |
| **Chrome** | Existing `chrome-devtools-mcp` | Chrome |
| **Canva** | Generic Chrome skill (user manually drives Canva web app for now) | Canva — honest, not separately packaged |

### Parallel descriptions (landing page install hints)

> **Google Services** — One setup, all your Google apps. Gmail, Drive, Docs, Sheets, Slides, Calendar, Contacts, and Google Messages.
>
> **Apple Services** — One setup, all your Apple apps. Mail, Notes, Calendar, Reminders, Contacts, and iCloud.
>
> **iMessage** — The official Anthropic plugin, packaged as a one-click YouCoded integration.
>
> **macOS Control / Windows Control** — Full desktop automation. Control any installed app, take screenshots, drive the mouse and keyboard, and use popular apps like Spotify, Safari, and Finder by voice.

## Component details

### Google Services

**Foundation:** [`googleworkspace/cli`](https://github.com/googleworkspace/cli) — Rust binary, Apache 2.0, Google org, 24.8k stars, v0.22.5 (Mar 31 2026).

**Why it's the right foundation:**
- Official Google namespace (`googleworkspace/*` org — same disclaimer appears on all their repos; Destin deems reliable)
- One tool covers Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin
- Dynamic Discovery Service support — auto-adds new Google APIs
- **Designed for LLMs**: "every response is structured JSON", NDJSON streaming for pagination
- Multiple auth flows: interactive OAuth + OS keyring storage, service account JSON, pre-obtained tokens, `gcloud` integration

**Risks:**
- Pre-v1 (breaking changes expected). Rapid release cadence (22 minor versions in 6 weeks). Pin a specific version in the setup skill; bump periodically.
- OAuth scope cap: unverified apps hit Google's 25-scope limit; default preset wants 85+. Setup skill must either use a narrower preset or walk users through verification.
- `gws` handles Google **Chat** (the workspace app) — NOT Google **Messages** (RCS/SMS). Google Messages stays on the existing `mautrix-gmessages` transport.

**Install methods:** brew / npm / cargo / pre-built GitHub release binaries. Setup skill picks based on platform.

**Migration:**
- Deprecate + remove the old `google-workspace` marketplace entry
- Deprecate + remove the old `youcoded-messaging` plugin (absorb its `mautrix-gmessages` piece into Google Services)
- Update `tool-router.sh` hook: point at the real `gws` binary or remove the Claude.ai Gmail block entirely
- Retire `rclone gdrive:` Drive transport (`gws drive` is a superset)

### Apple Services

**Foundation:** native EventKit, accessed via a Swift CLI acting as a stdio MCP server. Notes + Mail supplemented with AppleScript (no public framework alternative exists for these two).

**Why this over iMCP:**
- No GUI app required to be running in the background
- No macOS 15.3+ floor (EventKit works on macOS 13+)
- No third-party maintainer risk
- No Bonjour app↔CLI indirection
- The community has already built four live EventKit MCP servers, proving the pattern — we don't have to invent it
- iMCP's cleanest feature (per-service UI toggle) isn't something users need; they just don't invoke the skill for services they don't want

**Phased plan (this is where the empirical question sits):**

**Phase 1 — ship on a third-party EventKit MCP.** Pick one of:
- [PsychQuant/che-ical-mcp](https://github.com/kiki830621/che-ical-mcp) — 24 tools, iCloud + Google + Exchange, active. Leading candidate.
- [FradSer/mcp-server-apple-events](https://github.com/FradSer/mcp-server-apple-events) — Calendar + Reminders, narrower surface.
- [Krishna-Desiraju/apple-reminders-swift-mcp-server](https://github.com/Krishna-Desiraju/apple-reminders-swift-mcp-server) — Reminders-only but full CRUD, recurring, location triggers.

`/apple-services-setup` installs the chosen MCP (brew or npm, depending on project), writes the MCP config entry, triggers the TCC permission prompts. Ships the AppleScript recipes for Notes + Mail alongside. Users on this path see the third party's binary name in the TCC prompt, not "YouCoded."

**Phase 2 — YouCoded-native EventKit helper.** Bundle a small Swift helper inside `YouCoded.app/Contents/Resources/helpers/eventkit-helper`, signed with YouCoded's Developer ID, notarized as part of the existing release. Claude Code spawns it as a stdio MCP server. First call triggers TCC prompt.

The Phase 2 commitment hinges on one test (see Open questions): does a helper bundled inside YouCoded.app inherit YouCoded's TCC identity (prompt says "Allow YouCoded"), or does it get its own identity (prompt says the binary name)? Answer determines whether Phase 2 is a clean UX win or merely architectural purity.

**Why NOT iMCP** (explicitly rejected this cycle): requires a GUI app to stay running (Bonjour architecture), macOS 15.3+ floor, third-party maintainer, adds another moving part for no functional benefit we can't get from Swift + EventKit directly.

**Why NOT `supermemoryai/apple-mcp`:** archived January 2026, no successor.

**Notes + Mail stay on AppleScript** in both phases — no public framework exists. `osascript` wrappers, ~100 lines each. Notes requires Automation permission per app; Mail may additionally need Full Disk Access for some operations.

**Install requirements:**
- macOS ≥ 13 (EventKit base)
- Phase 1: whatever the chosen 3rd-party MCP requires (typically Swift 5.9+ / Xcode CLI tools for source builds, or pre-built binary)
- Phase 2: nothing user-facing beyond the YouCoded installer itself

### iMessage

**Foundation:** the official Anthropic iMessage plugin, already present in our marketplace index at `sourceRef: "./external_plugins/imessage"`.

**How it works:**
- Polls `~/Library/Messages/chat.db` once per second for new messages (watermark-based, no replay on restart)
- Sends via `osascript` to Messages.app
- Requires Full Disk Access (for chat.db read) and Automation permission (for sends)
- No external app, no background server, pure AppleScript + SQLite

**Work needed:** promote it from "one entry among many in the marketplace" to "the click target for the iMessage chip on the landing page." Add `/imessage-setup` that walks users through Full Disk Access + Automation grants with a screenshot-heavy guide, plus smoke tests (send-self, poll-self roundtrip).

### macOS Control

**Foundation:** Toolbox of CLI primitives + curated app recipe library.

**Primitives:**
- `osascript` — AppleScript runner (built-in). Semantic app control, menu navigation, keystrokes, app-specific dictionaries.
- `cliclick` (brew install) — raw cursor/mouse coordinates, drags, keystrokes. Reliable where System Events is flaky.
- `screencapture` (built-in) — screenshots, window capture, region capture, interactive selection.
- `shortcuts` CLI (built-in, macOS 12+) — invoke user's Shortcuts.app automations.

**Recipes (Tier 1 — ship at launch):**

| App | Recipe covers |
|---|---|
| Spotify | play/pause, next/prev, play specific track/album/playlist, get current track, volume, search |
| Apple Music | Same surface as Spotify via Music.app AppleScript |
| Safari | Open URL, list/switch/close tabs, read current page, run JS, reading list |
| Finder | Open folders, move/copy/rename files, get selection, reveal in Finder, tag mgmt |
| Terminal / iTerm2 | Open new window/tab, run command, split panes |
| System Events | Global keystrokes, app launch/quit/switch, window management, menu navigation |
| Zoom | Mute/unmute, camera on/off, leave meeting |
| Microsoft Office (Word, Excel, PowerPoint) | Document read/write, basic content ops |

**Recipes (Tier 2 — follow-up):** Slack, Discord, Obsidian, Notion, VS Code, Figma. Mostly System Events or URL schemes (weaker AppleScript coverage).

**Tier 3 — user-extensible:** Document the recipe format so users drop their own `recipes/<app>.md` into the skill.

**Skill structure:**
```
wecoded-marketplace/macos-control/
  SKILL.md                     # overview; Claude invokes based on this
  lib/
    applescript-runner.sh      # osascript wrapper with structured JSON output
    cliclick-helper.sh
    screencapture-helper.sh
  recipes/
    spotify.md                 # read on-demand when user asks about Spotify
    apple-music.md
    safari.md
    finder.md
    terminal.md
    system-events.md
    zoom.md
    microsoft-office.md
    _template.md               # for user-added recipes
  setup/
    install.sh                 # brew install cliclick; verify built-ins
    permissions.md             # Automation + Accessibility permission walkthrough
```

**SKILL.md frontmatter enumerates every supported app by name** (Spotify, Apple Music, Safari, Finder, Terminal, iTerm2, Zoom, Word, Excel, PowerPoint, …) so Claude's skill-discovery match triggers on user utterances like "pause Spotify" or "open this folder in Finder" — without loading every recipe upfront. Recipe bodies are read on-demand after the skill activates.

### Windows Control

**Foundation:** `mcp__windows-control` MCP server (currently bundled in the YouCoded runtime, not installed via the marketplace).

**Work needed:**
1. Move `mcp__windows-control` from the YouCoded runtime to a marketplace plugin (same mechanism `youcoded-messaging/mcp-manifest.json` uses today). After the move, the plugin owns the MCP — the runtime no longer bundles it.
2. `/windows-setup` verifies the plugin is enabled and its MCP server is bound, then runs a smoke test.
3. Add Windows app recipes analogous to macOS Control (Spotify for Windows, File Explorer, Excel, etc. via PowerShell/SendKeys).

Lower priority than macOS Control since the MCP itself already works — this is a repackaging job.

### Todoist / GitHub / Chrome

Already shipped. Work needed: add `/todoist-setup`, `/github-setup`, `/chrome-setup` commands following the same shape as the bundles.

## First-run setup commands

**Pattern:** every installable marketplace skill ships a companion `/X-setup` slash command.

Setup commands follow a shared shape:
1. **Detect platform** — gate macOS-only / Windows-only / cross-platform as needed
2. **Check & install deps** — Homebrew / winget / cargo / npm / pre-built releases
3. **Walk through auth** — browser OAuth, API key paste, or system permission dialogs
4. **Write MCP config** — edit YouCoded's MCP config atomically
5. **Smoke test** — run a real round-trip operation per service (create → read → delete), not a bare auth probe
6. **Report success/failure** with specific next-step guidance keyed to the failure mode

**Per-skill setup commands:**

```
/google-services-setup  (state machine — each node has an explicit branch)

  [detect platform]
    ├─ macOS      → brew install gws
    ├─ Linux/WSL  → cargo install or pre-built release binary
    └─ Windows    → pre-built release binary from GitHub releases
    (fail: no Rust toolchain AND no pre-built binary for arch → direct user to install brew/cargo)

  [pin version]
    write pinned `gws` version to YouCoded config so future CLI updates don't silently break things

  [choose OAuth path]
    ├─ narrow-scope preset (default; fits under Google's 25-scope unverified cap)
    └─ user-brings-own-verified-GCP-app (advanced; can request broader scopes)

  [run `gws auth setup`]
    ├─ browser opens, user completes OAuth
    │    ├─ success  → credentials written to OS keyring
    │    ├─ keyring unavailable (headless Linux, locked keychain) → fall back to encrypted file + warn
    │    └─ user cancels browser flow → retry prompt, then abort with clear message
    └─ existing credentials found → skip, confirm with user

  [install mautrix-gmessages]
    download platform-specific binary, walk through emoji pairing with user's phone

  [smoke test — real round-trips, not just auth probes]
    • Gmail:    send a draft to self, fetch it, confirm body text matches, delete
    • Drive:    create a tiny test file, read it back, delete
    • Calendar: create a test event 1 hour from now, read it back, delete
    • Messages: send a test RCS to self, read it back
    Any failure → report which step + likely cause (scope missing, keyring issue, phone unpaired)

  [migration cleanup]
    • remove deprecated `google-workspace` marketplace entry
    • remove `tool-router.sh` Gmail block (no longer redirecting to an unbuilt CLI)

/apple-services-setup  (macOS only)
  • verify macOS ≥ 13
  • Phase 1 branch: install chosen 3rd-party EventKit MCP (default: PsychQuant/che-ical-mcp)
      - npm install -g, or brew, depending on vendor
      - run the MCP once so its first EventKit call fires; user sees TCC prompts for Calendar / Reminders / Contacts
  • Phase 2 branch (once landed): the bundled YouCoded helper is already present inside the app bundle; trigger its permission-request entry point
  • deploy Notes + Mail AppleScript recipes to skill dir
  • grant Automation permissions for Notes + Mail (osascript first-run triggers these prompts)
  • write MCP server entry to YouCoded's config
  • smoke test (each a real round-trip):
      - create a test reminder "YouCoded setup OK", confirm it appears, delete it
      - list the next 3 Calendar events with start times
      - read the body of the most recent Apple Note (AppleScript path)
      - list subject lines of the last 3 Apple Mail inbox messages (AppleScript path)
      - look up one Contact by name
    Fail loudly naming which specific step broke + which permission is likely missing.

/imessage-setup  (macOS only)
  • verify the Anthropic iMessage plugin is installed (already in marketplace)
  • walk user through granting Full Disk Access to Claude Code's host (screenshot of System Settings pane)
  • walk user through Automation permission for Messages (triggered by first osascript call)
  • smoke test: send an iMessage to the user's own number with a test string, poll chat.db, confirm readback

/macos-setup  (macOS only)
  • brew install cliclick
  • verify osascript + screencapture + shortcuts CLI all present (built-in)
  • request Accessibility permission for Claude's terminal host
  • deploy recipe library
  • smoke test (each a real round-trip):
      - take screenshot of active window, confirm file written + non-empty
      - move cursor to a specific pixel, read cursor position back, confirm match
      - run osascript that reads + writes a Finder selection
      - if Spotify is installed: play, read current track, pause
    Fail loudly naming which primitive broke (most likely: Accessibility permission missing)

/windows-setup  (Windows only)
  • verify `mcp__windows-control` plugin is enabled (post-transition) OR runtime-bundled copy is bound (during transition)
  • smoke test (real round-trips):
      - take screenshot of active window, confirm file written + non-empty
      - list open window titles, confirm non-empty
      - open Notepad, type "YouCoded setup OK", read the window text back, close without saving
  • deploy recipe library

/todoist-setup     → prompt for API token, store securely, verify
/github-setup      → `gh auth login`, configure MCP, verify with `gh api user`
/chrome-setup      → verify chrome-devtools-mcp, walk through DevTools Protocol enable, smoke test
```

**Shared framework decision (deferred):** don't build the abstraction first. Implement `/macos-setup` as the pilot, then `/apple-services-setup`, then `/google-services-setup`. Extract the shared framework after seeing 2–3 concrete implementations — avoids premature abstraction.

### Failure modes (inventory before implementation)

Each setup command must handle these explicitly — either recover automatically or fail with a user-actionable message naming the specific cause.

**Shared across all setup commands:**
- Dependency installer absent (no brew on macOS, no winget on Windows, no cargo/npm anywhere) → direct user to install the prereq, don't try silent workarounds
- Existing MCP config at target path is malformed JSON → back up, don't overwrite silently
- Existing MCP config already has an entry with the same server name → prompt user (replace / skip / rename)
- Claude Code binary not found on PATH → abort with install link
- Network offline during a download step → retry once, then fail with "check connection" message
- Setup command interrupted mid-flow (Ctrl-C) → all writes must be atomic or resumable

**`/google-services-setup`:**
- OAuth browser flow never completes (user closes tab, redirect URI mismatch) → detect timeout, offer retry with "bring your own GCP project" branch
- OS keyring unavailable (headless Linux, locked macOS keychain, Windows Credential Manager disabled) → fall back to encrypted file with loud warning
- Google's unverified-app warning screen scares user off → onboarding copy must preempt this with screenshot + explanation
- Scope request exceeds 25-scope unverified cap → setup rejects the preset choice at time of selection, not at OAuth time
- `gws` pinned version yanked from upstream → fall back to next-most-recent known-good version
- Google Messages phone pairing fails (camera can't read QR, user closes the Messages web app) → offer manual pairing flow

**`/apple-services-setup`:**
- macOS < 13 → abort early with upgrade message
- TCC prompt dismissed or denied → catch, surface specific service + System Settings path to grant after the fact
- User on Phase 1 path: chosen 3rd-party MCP needs Xcode CLI tools and they're missing → prompt to install, or switch to a vendor that ships pre-built binaries
- AppleScript prompts for Notes/Mail denied → record per-service, continue with remaining, list denied ones at end
- Mail AppleScript blocked by missing Full Disk Access (some operations require it) → specific message pointing at System Settings pane

**`/imessage-setup`:**
- Full Disk Access not granted to Claude Code's host → plugin exits with `authorization denied`; surface the System Settings path with a screenshot
- Messages.app not signed in → abort with a "sign into Messages.app first" message
- Automation prompt dismissed before user responds → retry by triggering a send

**`/macos-setup`:**
- Accessibility permission denied (most common failure) → loud visual guide; show exact System Settings path
- Automation permissions denied per-app → catch at recipe invocation, surface as "grant permission" modal

**`/windows-setup`:**
- `mcp__windows-control` plugin not yet published to marketplace (during the transition) → fall back to runtime-bundled version, warn that future versions will require plugin install
- User on Windows with no PowerShell (non-standard setup) → abort with install guidance

**`/todoist-setup`, `/github-setup`, `/chrome-setup`:**
- API token/OAuth wrong scope → detect via test API call and name the missing scope
- Chrome DevTools Protocol blocked by corporate policy → surface the policy name from `chrome://policy`

## Build order

1. **Pilot: `/macos-setup`** — no auth flows, just dep installs + permission prompts. Fastest feedback.
2. **Second pilot: `/imessage-setup`** — trivial integration (the plugin already exists), introduces Full Disk Access / Automation permission UX copy we'll reuse elsewhere.
3. **Third pilot: `/apple-services-setup` Phase 1** — ship on a 3rd-party EventKit MCP + AppleScript supplements. No new Swift code.
4. **`/google-services-setup`** — full OAuth browser flow; most complex.
5. **Extract shared setup-skill framework** based on what 1–4 have in common.
6. **TCC attribution test** (see Open Questions). 30-line Swift binary signed with Developer ID, bundled in `YouCoded.app/Contents/Resources/`, spawned from Electron main. Read the TCC prompt text. Decides Phase 2 shape.
7. **Apple Services Phase 2** (if TCC attribution works cleanly): build the YouCoded-native EventKit helper, migrate users from Phase 1 backing to Phase 2.
8. **macOS Control Tier 1 recipes** — Spotify, Safari, Finder, Terminal, System Events, Zoom, MS Office, Apple Music.
9. **Migration cleanup:** delete deprecated `google-workspace` entry, absorb/deprecate `youcoded-messaging`, prune `tool-router.sh` Gmail-block logic, retire `rclone gdrive:` path.
10. **Remaining setup commands:** `/todoist-setup`, `/github-setup`, `/chrome-setup`, `/windows-setup`.
11. **macOS Control Tier 2 recipes** (Slack, Discord, Obsidian, VS Code, Figma).
12. **Windows Control recipes** (app-level recipes for Windows analogues).
13. Landing page copy updates (link each chip to its backing marketplace skill's setup command).

## Decisions made

- Landing page stays as-is (all 18 chips). Bundling is a marketplace concern, not a marketing one.
- Canva kept on landing page without a dedicated skill — users drive via generic Chrome skill.
- Safari bundled into macOS Control, not a separate skill.
- Google Messages bundled into Google Services, deprecating `youcoded-messaging` standalone.
- iMessage = promote the existing Anthropic plugin already in our marketplace. No new code.
- Apple Services built on EventKit (3rd-party MCP for Phase 1, YouCoded-native helper for Phase 2) + AppleScript for Notes/Mail. iMCP explicitly rejected this cycle.
- `googleworkspace/cli` over a custom MCP or API wrapper.
- `supermemoryai/apple-mcp` rejected (archived).
- Recipe format for macOS Control: per-app files + frontmatter enumerates every supported app name.

## Open questions

**Blocking Phase 2 commitment:**
- **TCC attribution test.** Does a Swift helper bundled inside `YouCoded.app/Contents/Resources/` and signed with YouCoded's Developer ID inherit YouCoded's TCC identity? Test is ~30 lines of Swift calling `requestFullAccessToEvents`, bundled + spawned through the production path (Electron main → Claude Code → helper). If prompt says "Allow YouCoded" → Option A (single clean identity). If prompt says the binary name → Option B (works, less clean). Must run before committing to Phase 2.
- **Does YouCoded's current CI build Swift?** Adding a Swift build step to the macOS release pipeline is 1–3 days of work depending on what exists today. Need to confirm before scoping Phase 2.
- **Phase 1 vendor choice.** PsychQuant/che-ical-mcp (leading — 24 tools, iCloud/Google/Exchange) vs. FradSer (narrower) vs. Krishna-Desiraju (Reminders-only). Depends on distribution model (pre-built binary vs. source build) and active maintenance.

**Google Services:**
- **OAuth scope preset**: ship with broad 85-scope preset (requires verified GCP app) or narrow preset users can expand later? Leaning narrow-by-default.
- **GCP project strategy**: use `gws auth setup`'s per-user GCP project creation, or stand up a YouCoded-owned verified app? Verified app is cleaner UX but costs $$ + time + privacy policy work.

**Nice-to-have, non-blocking:**
- Shortcuts CLI coverage: inventory user's installed Shortcuts and expose as dynamic recipes? v2 enhancement.
- `.dmg` installer UX for less-technical macOS users on the Apple Services Phase 1 path (if the chosen vendor requires brew/source build).

## Risks

- **gws CLI pre-v1 breaking changes** — version-pin in setup skill, monitor release notes, plan quarterly bumps.
- **Unverified GCP OAuth flow friction** — 25-scope cap + "Google hasn't verified this app" warning screen will scare non-technical users. Interim: narrow scope preset + clear onboarding copy. Long-term: get verified.
- **Phase 1 vendor risk** — the 3rd-party EventKit MCP we pick for Apple Services could become unmaintained. Mitigation: Phase 2 replaces it with a YouCoded-native helper, so Phase 1 vendor is explicitly transient.
- **TCC attribution test result unfavorable** — if Phase 2 can't attribute to "YouCoded," Option B (helper with own bundle ID) still ships but the UX is "Allow [weird-binary-name]." Users will figure it out; not a dealbreaker.
- **macOS Automation permission prompts at every service first-use** — users may interpret repeated prompts as bugs. Setup skill copy must explain: "You'll see several permission prompts — approve each one to unlock that Apple app."
- **EventKit + AppleScript API drift across macOS versions** — each major macOS release breaks something. Long-term maintenance cost. Same risk whether we're on 3rd-party MCP or native helper; just who eats the cost.
- **Cross-cutting regression** — per CLAUDE.md pitfalls, batch fixes to permissions can silently break features. After implementing each setup command, verify cross-platform features (this work is desktop/mac-only).

## References

Investigated during planning session:

**Google Services:**
- [googleworkspace/cli](https://github.com/googleworkspace/cli) — chosen foundation

**Apple Services (EventKit MCP servers — Phase 1 candidates):**
- [PsychQuant/che-ical-mcp](https://github.com/kiki830621/che-ical-mcp) — leading Phase 1 candidate; 24 tools
- [FradSer/mcp-server-apple-events](https://github.com/FradSer/mcp-server-apple-events) — Calendar + Reminders
- [Krishna-Desiraju/apple-reminders-swift-mcp-server](https://github.com/Krishna-Desiraju/apple-reminders-swift-mcp-server) — Reminders CRUD
- [EgorKurito/apple-calendar-mcp](https://github.com/egorkurito/apple-calendar-mcp) — Calendar w/ recurring

**Apple Services (rejected/context):**
- [mattt/iMCP](https://github.com/mattt/iMCP) — rejected this cycle (GUI-app dependency, macOS 15.3+ floor)
- [supermemoryai/apple-mcp](https://github.com/supermemoryai/apple-mcp) — rejected (archived Jan 2026)
- [griches/apple-mcp](https://github.com/griches/apple-mcp) — Notes-focused, considered
- [karlhepler/apple-mcp](https://github.com/karlhepler/apple-mcp) — Notes + Reminders only
- [peakmojo/applescript-mcp](https://github.com/peakmojo/applescript-mcp) / [joshrutkowski/applescript-mcp](https://github.com/joshrutkowski/applescript-mcp) — generic AppleScript MCPs

**iMessage:**
- [anthropics/claude-plugins-official — external_plugins/imessage](https://github.com/anthropics/claude-plugins-official/blob/main/external_plugins/imessage/README.md) — chosen foundation (already in our marketplace)
- [steipete/imsg](https://github.com/steipete/imsg) — Swift CLI alternative, good docs on TCC requirements

**macOS platform research:**
- [Apple TCC bundle ID forum thread](https://developer.apple.com/forums/thread/698337)
- [Building command tools for macOS — Eclectic Light](https://eclecticlight.co/2019/06/13/building-and-delivering-command-tools-for-catalina/)

## Current-state artifacts to clean up

- `wecoded-marketplace/index.json` — `google-workspace` entry (flagged `deprecated: true` 2026-04-14)
- `youcoded-core/hooks/tool-router.sh` — blocks Anthropic's hosted Gmail MCP, redirects to unbuilt `gws` CLI
- `wecoded-marketplace/youcoded-drive/skills/google-drive/SKILL.md` — rclone-based Drive integration (to be retired after `gws drive` verified)
- `wecoded-marketplace/youcoded-messaging/` — `mautrix-gmessages` to be absorbed into Google Services; iMessage portion is superseded by the Anthropic plugin
- `wecoded-marketplace/youcoded-inbox/skills/claudes-inbox/providers/gmail.md` — Gmail provider using Anthropic's hosted MCP; migrate to `gws gmail`

## Not doing (yet)

- Canva as a dedicated skill (kept on landing page, no install target — users drive via generic Chrome)
- Safari as a standalone skill (bundled into macOS Control)
- Linux Control skill (no Linux desktop automation story yet)
- Numbers / Keynote AppleScript recipes (Apple's spreadsheet + presentation dictionaries are anemic)
- A shared setup-skill abstraction (wait for 2–3 pilot implementations first)
- iMCP (explicitly rejected this cycle — see Apple Services)
- Writing our own Swift iMessage implementation (Anthropic plugin already solves this)
