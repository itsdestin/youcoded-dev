# YouCoded roadmap

## Where the app stands
<!-- Destin's prose: one paragraph per pillar — Social AI · Personalization · Comprehensive
     Workspace · Accessibility · Platforms — what has shipped, what is blocking. The tool
     never touches this section. Written in M3 step 3. -->

## Next release
Target: `v1.3`

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [android-only](docs/roadmap/android-only.md) — bugs in Android's own code | 0 | 0 | 0 | 0 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 0 | 0 | 0 | 0 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 0 | 0 | 0 | 0 |
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 0 | 0 | 0 | 0 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 0 | 0 | 0 | 0 |
| [games](docs/roadmap/games.md) — the arcade | 0 | 0 | 0 | 0 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 0 | 0 | 0 | 0 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 0 | 0 | 0 | 0 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 0 | 0 | 0 | 0 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 0 | 0 | 0 | 0 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 0 | 0 | 0 | 0 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 0 | 0 | 0 | 0 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 0 | 0 | 0 | 0 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 0 | 0 | 0 | 0 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. The last line of an entry is its tokens: optional surface, then seen-on, status,
`checked YYYY-MM-DD`, then flags (`urgent` `needs-repro` `performance` `security` `regression`
or a release like `v1.3.1`). New items start `needs-verify` unless you reproduced it or your
report anchors the cause. To close an item: delete it from the area file, append one line to
`docs/roadmap/shipped.md`, archive its report. Run `node scripts/roadmap-check.mjs --fix`
before committing. Grammar and vocabularies:
`docs/active/specs/2026-09-01-roadmap-restructure-design.md` §2–3.
