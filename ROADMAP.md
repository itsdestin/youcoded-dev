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
- chat-data: the replayed-turn record's type is ambiguous (D11 in the simplification plan)
- dev-workspace: Mac installers: nothing is signed or notarized, and a Mac download may open as "broken"
- dev-workspace: Waiting on CI runs eats whole sessions
- files: searching a big project stops early, for file names and for text inside files
- local-models: Gemma models download with no licence notice, and Google's Gemma terms require passing their use restrictions…
- local-models: The file downloader exists three times (model files, engine, voice assets) and the checksum helper four…
- native-harness: The "No folder" choice on the new-session form (shipped 2026-09-11) was never tested or thought through…
- native-harness: Every install should come with a built-in project, "Your Assistant" (name not final), in the Projects list…
- native-harness: Native Runtime Parity Program
- native-harness: The one object that runs a native conversation is 4,756 lines because it also runs the helper agents…
- native-harness: The assistant cannot search the WeCoded marketplace, so when it lacks a capability it reaches for a script or…
- native-harness: After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later command that looks…
- native-harness: native-only users need a YouCoded-owned skills home
- operations: Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing
- perf: v1.3.1 blocker, blocked on simplification phase 5: leftover whole-file reads and memory waste
- user-interface: The settings screen exists twice, once for desktop and once for phone
- user-interface: Error messages still guess at causes in many places

## Top priority (P1)
- chat-data: the replayed-turn record's type is ambiguous (D11 in the simplification plan)
- dev-workspace: Session work lost or stranded: 6 ways a session's work or worktree goes missing
- dev-workspace: Mac installers: nothing is signed or notarized, and a Mac download may open as "broken"
- dev-workspace: Waiting on CI runs eats whole sessions
- files: searching a big project stops early, for file names and for text inside files
- files: Files: five ways work can be silently lost
- local-models: Gemma models download with no licence notice, and Google's Gemma terms require passing their use restrictions…
- local-models: The file downloader exists three times (model files, engine, voice assets) and the checksum helper four…
- native-harness: The "No folder" choice on the new-session form (shipped 2026-09-11) was never tested or thought through…
- native-harness: Every install should come with a built-in project, "Your Assistant" (name not final), in the Projects list…
- native-harness: Native Runtime Parity Program
- native-harness: The one object that runs a native conversation is 4,756 lines because it also runs the helper agents…
- native-harness: The assistant cannot search the WeCoded marketplace, so when it lacks a capability it reaches for a script or…
- native-harness: After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later command that looks…
- native-harness: Per-project skills and tools: each project chooses which skills, plugins and tool connections the assistant…
- native-harness: native-only users need a YouCoded-owned skills home
- operations: Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing
- perf: v1.3.1 blocker, blocked on simplification phase 5: leftover whole-file reads and memory waste
- perf: The app still feels sluggish: chat-switch pauses and typing interruptions (4 things, work in progress)
- user-interface: The settings screen exists twice, once for desktop and once for phone
- user-interface: Error messages still guess at causes in many places

## Backlogs
<!-- P1 urgent: app-breaking, a release blocker, or a top-priority feature to build next.
     P2 major: big ideas and things hit repeatedly, but not the immediate next step.
     P3 leisure: smaller bugs and miscellany, done whenever. (Destin, 2026-10-05) -->
| Area | Open | P1 | P2 | P3 | Needs verify | Decisions | Parked |
|---|---|---|---|---|---|---|---|
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 21 | 8 | 5 | 8 | 2 | 2 | 3 |
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 20 | 3 | 5 | 12 | 2 | 0 | 2 |
| [perf](docs/roadmap/perf.md) — app responsiveness and honest performance measurement | 19 | 2 | 0 | 17 | 5 | 3 | 0 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 13 | 2 | 3 | 8 | 4 | 0 | 1 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 9 | 2 | 1 | 6 | 1 | 0 | 1 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 9 | 0 | 3 | 6 | 1 | 0 | 2 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 9 | 0 | 4 | 5 | 2 | 2 | 1 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 8 | 0 | 3 | 5 | 2 | 1 | 1 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 7 | 1 | 0 | 6 | 2 | 1 | 1 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 6 | 2 | 1 | 3 | 0 | 1 | 1 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 6 | 0 | 2 | 4 | 0 | 0 | 2 |
| [operations](docs/roadmap/operations.md) — running YouCoded the project: website, marketing, legal and community | 5 | 1 | 0 | 4 | 1 | 1 | 1 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 4 | 0 | 0 | 4 | 1 | 0 | 1 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 3 | 0 | 0 | 3 | 1 | 0 | 1 |
| [games](docs/roadmap/games.md) — the arcade | 2 | 0 | 0 | 2 | 1 | 0 | 1 |
| [android-only](docs/roadmap/android-only.md) — the Android app | 1 | 0 | 1 | 0 | 0 | 0 | 0 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. **First look for an
entry the new item belongs in** — a small fault or idea joins its theme's bundled entry as one
more lettered clause, and only something big gets an entry of its own: the whole roadmap is
budgeted at 150 entries and `roadmap-check` says when it is over. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. New items start `needs-verify` unless you reproduced it or your report anchors
the cause. **Priority: a new item is `P3` unless you can say why not** — `P1` only for
something app-breaking, a blocker of the `Target:` release, or a feature Destin named as next;
`P2` for a major idea or something he has hit more than once. Only Destin moves an item up a
tier; say so in the entry when he does. To close an item: `node scripts/roadmap-check.mjs --close <area>:<text from the
entry> --ref "<commit or PR>"` deletes it, adds its one line to `docs/roadmap/shipped.md` and
rewrites this index; then archive its report. To close ONE point of a bundled entry, delete
its lettered clause (re-letter the rest, fix the count in the headline) and add its line to
`shipped.md` by hand — `--close` removes a whole entry. After any other edit run
`node scripts/roadmap-check.mjs --fix` before committing.

The last line of an entry is its tokens, in this order. **Every one is a closed list — a
word that is not below is an error, not a new category. Do not invent one.**

| Token | Required | Allowed values |
|---|---|---|
| surface | optional | one of 29 — `node scripts/roadmap-check.mjs --vocab` prints them |
| seen-on | yes | `desktop` `android` `remote` `all` `n/a` |
| status | yes | `confirmed` `needs-verify` `in-flight` `blocked` `decision` `parked` |
| priority | yes | `P1` `P2` `P3` — urgent · major but not next · at leisure (defined above the Backlogs table) |
| checked | yes | `checked YYYY-MM-DD` |
| flags | optional, repeatable | `needs-repro` `performance` `security` `regression`, or one release like `v1.3.1` |

`--vocab` also prints the `##` sublevel headings each area file may use. Full grammar:
`docs/archive/specs/2026-09-01-roadmap-restructure-design.md` §2–3.
