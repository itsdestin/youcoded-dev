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
- dev-workspace: Ship v1.3 — the release mechanics: an `/audit` run, version bumps on both platforms (still
- user-interface: Fold Defaults + Permissions + Model Providers into one "Assistant settings" panel —

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 48 | 8 | 0 | 16 |
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 45 | 23 | 0 | 10 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 26 | 17 | 0 | 5 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 21 | 5 | 0 | 9 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 19 | 10 | 0 | 4 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 16 | 6 | 0 | 5 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 16 | 4 | 0 | 6 |
| [android-only](docs/roadmap/android-only.md) — bugs in Android's own code | 14 | 9 | 0 | 1 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 12 | 7 | 1 | 1 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 12 | 4 | 0 | 6 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 11 | 4 | 0 | 1 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 6 | 3 | 0 | 2 |
| [games](docs/roadmap/games.md) — the arcade | 3 | 1 | 0 | 1 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 3 | 0 | 0 | 2 |

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
