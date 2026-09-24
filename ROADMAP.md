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
- chat-data: Four smaller reads left over from cycle 2 still do more work than they need to: listing past conversations…
- dev-workspace: Waiting on CI runs eats whole sessions
- dev-workspace: The Linux package update path has never run on real hardware: `pkexec` raising the password dialog, `pacman…
- dev-workspace: Strip every youcoded-core step out of the release skill (`youcoded-admin` `skills/release/SKILL.md`, 56…
- dev-workspace: Every macOS download since 2026-07-23 is unopenable, and the download page sends people to a button that no…
- dev-workspace: Windows and macOS installers still hit the security wall
- dev-workspace: No Google Play listing
- files: Searching a big project's files still stops at the first 2,000 files and says "This folder is large
- files: Searching inside files' text in a project stops at 200 matches (20 per file, 5 seconds) and shows "200+",…
- local-models: Gemma models download with no licence notice, and Google's Gemma terms require passing their use restrictions…
- local-models: The file downloader exists three times (model files, the engine, voice assets) and the checksum helper four…
- marketplace: The "Likely safe" badge claims more than the scan checks: it only looks for leaked secrets and file shapes
- native-harness: The "No folder" choice on the new-session form (shipped 2026-09-11) was never tested and not thought through…
- native-harness: Every install should come with a built-in project, "Your Assistant" (name not final), in the Projects list…
- native-harness: Native Runtime Parity Program
- native-harness: The one object that runs a native conversation is 4,756 lines because it also orchestrates the helper agents…
- native-harness: The assistant cannot search the WeCoded marketplace, so when it needs a capability it does not have it…
- native-harness: After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later command that looks…
- native-harness: Helper (specialist) transcripts pile up in the sessions folder forever
- native-harness: native-only users need a YouCoded-owned skills home
- operations: Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing
- other-features: The Linux buddy has never been tried on two screens
- remote-access: 182 features are hand-written twice, once for the desktop window and once for a phone or browser connecting…
- user-interface: Browser-default hover tooltips look foreign to the app
- user-interface: Error messages still guess at causes in many places
- user-interface: The settings screen exists twice

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 100 | 32 | 3 | 9 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 55 | 10 | 5 | 23 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 39 | 16 | 2 | 5 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 29 | 6 | 1 | 4 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 26 | 10 | 8 | 5 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 23 | 5 | 6 | 6 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 22 | 6 | 2 | 2 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 20 | 7 | 0 | 5 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 18 | 4 | 0 | 9 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 13 | 3 | 1 | 4 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 11 | 1 | 3 | 2 |
| [operations](docs/roadmap/operations.md) — running YouCoded the project: website, marketing, legal and community | 10 | 2 | 3 | 1 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 7 | 2 | 0 | 3 |
| [android-only](docs/roadmap/android-only.md) — the Android app | 2 | 0 | 0 | 0 |
| [games](docs/roadmap/games.md) — the arcade | 2 | 1 | 0 | 1 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. New items start `needs-verify` unless you reproduced it or your report anchors
the cause. To close an item: `node scripts/roadmap-check.mjs --close <area>:<text from the
entry> --ref "<commit or PR>"` deletes it, adds its one line to `docs/roadmap/shipped.md` and
rewrites this index; then archive its report. After any other edit run
`node scripts/roadmap-check.mjs --fix` before committing.

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
