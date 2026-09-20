# YouCoded roadmap

## Where the app stands
<!-- Destin's prose, one paragraph per pillar. The tool never touches this section. Drafted
     2026-09-01 from youcoded-feature-fact-sheet.md and docs/roadmap/shipped.md for Destin
     to edit. -->

**Social AI.** Friends, live presence and a four-game arcade (Chess and Connect Four
head-to-head, Flappy Bird and 2048 with friend leaderboards) ship on desktop and Android,
docked beside the chat so a game fills the wait while the assistant works. Blocking: a
head-to-head forfeit is still one client's word, and what "Online" should mean on a phone is
an open decision.

**Personalization.** Themes (engine, editor, wallpaper packs, the `/theme-builder` skill),
skills and commands, and the WeCoded marketplace for both are live on every surface, with
account sign-in, ratings and comments behind them. Blocking: MCP servers still have no
settings screen (phase 2 unbuilt), project-scoped skills are not discovered by native
sessions, and Android forgets skill settings after its first launch.

**Comprehensive Workspace.** The app runs its own agent (native harness: tools, permissions,
compaction, cost, background Bash, specialists) beside Claude Code, on any provider or a
bundled local engine; conversations are stored, titled, tagged, searched and synced; the
files pane edits documents with version history and a git surface. Blocking: the parity
program (M6 onward) — context truncation is invisible to the user, harness manifests are
decorative, there is no agent memory, and the Agents & Automations view has no design.

**Accessibility.** Copy and menus have been through one consistency migration (shared
primitives, tokens, review decks); error states have one component; onboarding is still
the conversational wizard. Hover hints are the app's own on the whole main chat screen —
themed, and reachable by press-and-hold where a pointer hover never was — with settings,
the marketplace and project view still to convert. Blocking: the misleading-error audit
(v1.3.1), those remaining tooltips, and the proper first-run screen (the 2026-09-11 guide
wrapped the wizard; the replacement itself is still parked).

**Platforms.** Windows, macOS and Linux desktop, Android with an on-device runtime, and any
browser through remote access; sync, backup and restore on all of them. Blocking for
`v1.3.1`: the release mechanics — the last product gate (Connected accounts shows an in-app
GitHub sign-in) was confirmed 2026-09-02; Android still lacks tags, notes, the native
harness and the local engine.

## Next release
Target: `v1.3.1`
- chat-data: Chat Search phase 3 — per-conversation digests (resolved / open / abandoned / unclear) behind an
- chat-data: **v1.3.1 release blocker.** Four smaller reads left over from cycle 2 still do more work than they need to: listing
- dev-workspace: Destin, 2026-09-20: "just fixing a few minor test issues and such has seemingly eaten over
- dev-workspace: The Linux package update path has never run on real hardware: `pkexec` raising the password
- dev-workspace: Strip every youcoded-core step out of the release skill (`youcoded-admin`
- dev-workspace: Re-work the release method: releases tag master directly, so every release ships the
- dev-workspace: Landing-page live embed goes fully blurred under framed wallpaper themes — pick Meadow Mist
- dev-workspace: Ship v1.3.1 — the release mechanics, now that v1.3.0 has been cut (2026-09-20: version
- dev-workspace: Public-launch formalization is the 1.3.1 gate: signed macOS/Windows installers, a Play listing,
- dev-workspace: Windows and macOS installers still hit the security wall — nothing is signed or notarized.
- dev-workspace: No Google Play listing — Android installs only from a GitHub APK, and from 2027 Google requires
- files: **v1.3.1 release blocker.** Searching a big project's files still stops at the first
- files: **v1.3.1 release blocker.** Searching inside files' text in a project stops at 200
- local-models: Gemma models download with no licence notice, and Google's Gemma terms require passing their
- local-models: **v1.3.1 release blocker.** The file downloader exists three times (model files, the
- marketplace: A plugin that ships from a non-default branch gets scanned against the wrong code. Four live
- marketplace: The "Likely safe" badge reads as a safety verdict, but the scan only looks for leaked secrets
- native-harness: **v1.3.1 release blocker.** The "No folder" choice on the new-session form (shipped
- native-harness: **v1.3.1 release blocker.** Every install should come with a built-in project, "Your
- native-harness: **v1.3.1 release blocker.** A local model forgets the user's request halfway through a long
- native-harness: Native Runtime Parity Program — everything that still separates a native session from a Claude
- native-harness: **v1.3.1 release blocker.** The one object that runs a native conversation is 4,756 lines
- native-harness: The assistant cannot search the WeCoded marketplace, so when it needs a capability it does
- native-harness: After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later
- native-harness: Helper (specialist) transcripts pile up in the sessions folder forever — there is no way
- native-harness: **v1.3.1 release blocker — native-only users need a YouCoded-owned skills home.** Today the
- other-features: The Linux buddy has never been tried on two screens — every probe ran on the laptop panel
- remote-access: **v1.3.1 release blocker.** 182 features are hand-written twice, once for the desktop
- user-interface: Browser-default hover tooltips look foreign to the app — the whole main chat screen is
- user-interface: Error messages still guess at causes in many places — the app-wide re-audit is done and
- user-interface: **v1.3.1 release blocker.** The settings screen exists twice — a desktop version and a

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 107 | 33 | 6 | 10 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 63 | 12 | 5 | 23 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 40 | 16 | 2 | 6 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 39 | 9 | 1 | 4 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 25 | 8 | 2 | 2 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 24 | 6 | 0 | 9 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 22 | 12 | 1 | 4 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 19 | 5 | 3 | 5 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 18 | 6 | 3 | 6 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 15 | 6 | 1 | 4 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 14 | 1 | 3 | 2 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 7 | 3 | 0 | 3 |
| [android-only](docs/roadmap/android-only.md) — the Android app | 2 | 0 | 0 | 0 |
| [games](docs/roadmap/games.md) — the arcade | 2 | 1 | 0 | 1 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. New items start `needs-verify` unless you reproduced it or your report anchors
the cause. To close an item: delete it from the area file, append one line to
`docs/roadmap/shipped.md`, archive its report. Run `node scripts/roadmap-check.mjs --fix`
before committing.

The last line of an entry is its tokens, in this order. **Every one is a closed list — a
word that is not below is an error, not a new category. Do not invent one.**

| Token | Required | Allowed values |
|---|---|---|
| surface | optional | one of 29 — `node scripts/roadmap-check.mjs --vocab` prints them |
| seen-on | yes | `desktop` `android` `remote` `all` `n/a` |
| status | yes | `confirmed` `needs-verify` `in-flight` `blocked` `decision` `parked` |
| checked | yes | `checked YYYY-MM-DD` |
| flags | optional, repeatable | `urgent` `needs-repro` `performance` `security` `regression`, or one release like `v1.3.1` |

`--vocab` also prints the `##` sublevel headings each area file may use. Full grammar:
`docs/archive/specs/2026-09-01-roadmap-restructure-design.md` §2–3.
