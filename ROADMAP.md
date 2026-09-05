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
the conversational wizard. Blocking: the misleading-error audit (v1.3.1), browser-default
tooltips across the app, and a first-run screen that does not exist yet.

**Platforms.** Windows, macOS and Linux desktop, Android with an on-device runtime, and any
browser through remote access; sync, backup and restore on all of them. Blocking for
`v1.3`: one product gate (does Connected accounts show an in-app GitHub sign-in?) and the
release mechanics; Android still lacks tags, notes, the native harness and the local engine.

## Next release
Target: `v1.3`
- android-only: Android is pinned to Claude Code 2.1.112 because later releases ship as a native binary the
- dev-workspace: Re-work the release method: releases tag master directly, so every release ships the
- dev-workspace: Ship v1.3 — the release mechanics: an `/audit` run, version bumps on both platforms (still
- dev-workspace: Public-launch formalization is the 1.3 gate: signed macOS/Windows installers, a Play listing,
- dev-workspace: Windows and macOS installers still hit the security wall — nothing is signed or notarized.
- dev-workspace: No Google Play listing — Android installs only from a GitHub APK, and from 2027 Google requires
- local-models: Gemma models download with no licence notice, and Google's Gemma terms require passing their
- marketplace: A plugin that ships from a non-default branch gets scanned against the wrong code. Four live
- marketplace: The "Likely safe" badge reads as a safety verdict, but the scan only looks for leaked secrets
- native-harness: The assistant cannot search the WeCoded marketplace, so when it needs a capability it does
- native-harness: **v1.3 release blocker — native-only users need a YouCoded-owned skills home.** Today the
- other-features: Nothing on first run tells a new user the assistant can change and delete files and that
- user-interface: Fold Defaults + Permissions + Model Providers into one "Assistant settings" panel.

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 72 | 28 | 2 | 9 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 52 | 10 | 1 | 16 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 28 | 16 | 0 | 6 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 23 | 6 | 0 | 9 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 18 | 10 | 1 | 4 |
| [android-only](docs/roadmap/android-only.md) — bugs in Android's own code | 16 | 9 | 1 | 1 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 16 | 4 | 0 | 6 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 15 | 6 | 0 | 5 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 14 | 1 | 2 | 2 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 14 | 4 | 2 | 6 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 13 | 8 | 1 | 1 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 11 | 4 | 0 | 1 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 8 | 3 | 2 | 2 |
| [games](docs/roadmap/games.md) — the arcade | 2 | 1 | 0 | 1 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. New items start `needs-verify` unless you reproduced it or your report anchors
the cause. To close an item: delete it from the area file, append one line to
`docs/roadmap/shipped.md`, archive its report. Run `node scripts/roadmap-check.mjs --fix`
before committing. **The area table at the top of this file is generated** by that
command: two branches that both file items will conflict on it every time. On a merge
conflict there, take either side and run `--fix`; never hand-edit the counts.

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
