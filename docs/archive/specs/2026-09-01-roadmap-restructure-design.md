---
date: 2026-09-01
status: shipped
type: spec
topic: ROADMAP.md restructure — per-area files, six-field entries, roadmap-check tooling, migration
supersedes: docs/archive/specs/2026-08-31-roadmap-area-taxonomy-draft.md
---

# Roadmap restructure — design

The roadmap is rewritten so that Destin can scan it and answer "am I still hitting that?",
and so that tooling, not people, notices when an entry's claims about the code have rotted.
The problem measurement and the review history live in
`docs/archive/handoffs/2026-09-01-roadmap-restructure-handoff.md`; this document is the
design as approved on 2026-09-01 and is the source of truth for the implementation plan.

**The one-sentence design:** the roadmap holds *symptoms* in Destin's words, split into one
short file per area behind a one-page index; every *claim* about code lives in a linked
report carrying a machine-checkable anchor; one script checks structure, anchors, and age on
every audit and CI run.

---

## 1. Files

| Path | Holds |
|---|---|
| `ROADMAP.md` | The index: where the app stands, the next release, one row per area with counts and a link, and the five-line filing rule |
| `docs/roadmap/<area>.md` | One file per area (14 at migration). Open items only. **The set of areas is the set of files in this folder minus `shipped.md`** — the tool derives it from disk, never from a hardcoded list, so graduating a sublevel (§3.1) needs no tool edit |
| `docs/roadmap/shipped.md` | Every closed item, one line each, append-only |
| `docs/active/investigations/YYYY-MM-DD-<slug>.md` | Reports — the mechanism behind an item, with a claim anchor. Existing folder, existing lifecycle (`status:` frontmatter, archived when the item closes) |
| `scripts/roadmap-check.mjs` + `scripts/roadmap-check.test.mjs` | The tool and its tests |
| `scripts/roadmap-legacy-worksheet.mjs` | Throwaway: parses today's single-file format into the migration worksheet (§6.1). No tests. Deleted when the migration ships — git history keeps both it and the file it measured |

No generated files. The index is hand-written; the tool checks its numbers and can correct
them with `--fix`.

### 1.1 The index (`ROADMAP.md`)

```
# YouCoded roadmap

## Where the app stands
<one paragraph per pillar: Social AI · Personalization · Comprehensive Workspace ·
 Accessibility · Platforms — what has shipped, what is blocking. Hand-written.>

## Next release
Target: `v1.3`
<one line per item carrying THAT release flag, e.g. `- sync: Sync dead-ends on any machine
 without gh`. Regenerated from the flags by `--fix`; to add or remove an item, edit its flag.
 The `Target:` line is hand-written and is how the tool knows which release token is "next" —
 today both `v1.3` and `v1.3.1` flags exist, so it cannot guess.>

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 58 | 31 | 2 | 4 |
…one row per area file, largest Open count first, ties alphabetical (the order `--fix` writes)…

## Filing an item
Pick the file whose `Filing test:` line says yes. Write what you saw, in one or two lines,
no file paths and no mechanism. If you investigated, put that in a report under
docs/active/investigations/ with a claim anchor and link it. New items start `needs-verify`
unless you reproduced it or your report anchors the cause (§3.3). To close an item: delete
it from the area file, append one line to docs/roadmap/shipped.md, archive its report.
Run `node scripts/roadmap-check.mjs --fix` before committing.
```

**Open** is every entry in the area file, whatever its status; the other three columns are
subsets of it. The text after the dash in the Area cell is the area file's `# <area> — <one
line>` heading, copied by `--fix`; edit it there, not in the index.

The "where the app stands" section is prose Destin owns. The tool never touches it.

**The index holds no entries.** A `- [ ]` line anywhere in `ROADMAP.md` is a structure
error. This is the one failure worth betting on: every session already running on merge
day, and every handoff and memory that says "add it to ROADMAP.md", will keep filing into
the index for days. The error message names the area folder and the filing rule.

### 1.2 An area file (`docs/roadmap/<area>.md`)

```
# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models).

## sessions
- [ ] …entries…

## tools
- [ ] …
```

Line 1 is the heading the index copies; line 2 starts with the literal `Filing test:` prefix
the tool checks for. Sublevels are `##` headings and exist only in the areas §3 lists. Areas
without sublevels have no headings — entries follow the filing test directly. Order within a
section is not significant; the tool never reorders.

### 1.3 `shipped.md`

One line per closed item: `- [x] YYYY-MM-DD <area> — <headline> (<commit or PR>)`. Append
at the bottom. The 150 items shipped before the migration are copied in as they are under
the heading `## Shipped before 2026-09-01 (old format)`; the tool skips everything under
that heading and never rewrites it.

---

## 2. An entry

```
- [ ] Android forgets your skill settings after the first launch — favourites, quick
      chips and overrides all revert to defaults, every launch after the first
      `settings` `android` `needs-verify` `checked 2026-08-28` → docs/active/investigations/2026-08-28-android-skill-config.md
```

**Symptom, one or two lines.** What you saw, on which platform, when. In Destin's words
where they exist. No file paths, no line numbers, no mechanism, no "because" — that is
what the report is for. Detailed enough to be recognisable a month later; that is the
constraint, not brevity.

**Metadata line, last line of the entry.** Backticked tokens in this order, then an optional
link:

| Token | Required | Values |
|---|---|---|
| surface | no | One of the screen names in §3.2 |
| seen-on | yes | `desktop` · `android` · `remote` · `all` · `n/a` (`dev-workspace` only — by that area's filing test no user ever sees it) |
| status | yes | `confirmed` · `needs-verify` · `in-flight` · `blocked` · `decision` · `parked` |
| checked | yes | `checked YYYY-MM-DD` |
| flags | no | zero or more of `urgent` · `needs-repro` · `performance` · `security` · `regression` · a release such as `v1.3.1` |
| link | no | `→ <path>` — the report, relative to the workspace root |

Area is the file, so it is not a token. `source` was dropped: `status` carries the useful
bit (an agent's find starts `needs-verify`), and who first filed it is trivia afterwards.

**Parsing rule (what the tool enforces).** Every token must belong to exactly one vocabulary.
A token in no vocabulary is an error, not a surface — surfaces are a closed list so a typo
cannot silently become a new screen. `in-flight` entries name the branch or worktree in the
symptom text — a rule for the writer, not a check; the tool cannot tell a branch name from a
word. `[x]` entries are errors anywhere but `shipped.md`.

---

## 3. Vocabularies

### 3.1 Areas — 14, each with its filing test

| Area | Filing test — file here if… | Not here if… |
|---|---|---|
| `native-harness` | the app's own agent is doing work — a turn, tool call, permission, cost figure, specialist | it's a chat you already had (`chat-data`) · getting a model onto disk (`local-models`) · Claude Code is doing the work (`claude-code-integration`) |
| `dev-workspace` | it's about building the app, not the app. *Could a normal user ever see it?* No | — |
| `android-only` | *if you fixed this on desktop, would Android still be broken?* Yes — the bug is in Android's own code | the code is shared and the phone is where it shows → the shared area with `android` as seen-on |
| `marketplace` | finding, listing, installing, rating plugins or themes, and the Worker behind them | the theme *renders* wrong (`themes`) |
| `user-interface` | *does the fix change more than one screen?* Yes — shared primitives, chrome, layout, copy | one screen only → that screen's area, with the surface token |
| `files` | documents the user opens, edits or organises — files panel, project files, the git surface, and the per-chat record of which files a session produced (the artifact sidecar) | it's a workspace guidance doc (`dev-workspace`) · the transcript itself, or how it is titled, tagged, searched or resumed (`chat-data`) |
| `sync` | moving your stuff between devices, and the GitHub transport under it | — |
| `other-features` | a real user-facing feature too small for its own area | its sublevel has passed ~8 items (graduate it) |
| `chat-data` | everything *kept* about a chat — transcript, title, tags, notes, search index, resume state | the model is running right now (`native-harness`) · the files a chat produced and the panel that shows them (`files`) |
| `themes` | how the app looks under a theme — engine, editor, a theme rendering wrong | installing or browsing themes (`marketplace`) |
| `remote-access` | reaching the app from another device — the protocol, the browser client | — |
| `local-models` | getting a model onto this machine and serving it — downloads, disk, the engine process. *Would this break the same way on a cloud model?* No | yes → `native-harness` |
| `claude-code-integration` | Claude Code is doing the work and the app is steering its terminal — the terminal pane, the PTY, fake keystrokes, hooks the app plants, install and login checks | the app's own agent (`native-harness`); chat bubbles shared by both (`user-interface` / `chat-data`) |
| `games` | the arcade — the games, leaderboards, head-to-head, match relay | — |

**Why `claude-code-integration`, not `claude-code` or `cc-harness`:** the app has two ways to
run an assistant. `native-harness` is the app's own agent loop. For Claude subscribers the app
runs no agent at all — it launches Claude Code in a hidden terminal and steers it. The area
holds that wrapper and nothing else. "Harness" would name the agent loop, which for Claude
Code belongs to Anthropic; "integration" names what the app actually owns.

**Sublevels** — `##` headings, only in these files:

- `native-harness`: `sessions` · `tools` · `permissions` · `cost` · `specialists` · `skills-mcp`
- `dev-workspace`: `tests` · `rigs` (workbench, UI review sweep, perf lab, harness evaluator) · `knowledge` (CLAUDE.md, rules, MAP, the roadmap itself, `/audit`) · `release` (packaging, versioning, installers, the public site)
- `marketplace`: `catalog` · `backend` · `install`
- `other-features`: `accounts` (sign-in, presence, announcements) · `buddy` · `onboarding` · `misc`

The rule is ~20 open items before an area gets sublevels. `other-features` is the one
exception at 14: its sublevels are the graduation counter (past ~8 items a sublevel becomes
an area), and you cannot count what you have not labelled. `android-only` and
`user-interface` sit at the threshold and stay flat — their natural split is the surface
token, which already exists.

**Naming rule:** the app's own on-screen word where one exists (`remote-access`, `themes`,
`games`); otherwise the job, not the code. `chat-data` is the documented exception — the app
says *conversations*, but the area holds more than transcripts.

### 3.2 Surfaces — the screens a user can name

`chat` · `tool-cards` · `input-bar` · `quick-chips` · `status-bar` · `session-drawer` ·
`resume-browser` · `settings` · `model-picker` · `local-models-screen` · `files-panel` ·
`projects` · `marketplace-screen` · `library` · `terminal` · `themes-screen` · `buddy-window` ·
`arcade` · `onboarding` · `window-chrome` · `specialists-chip`

`settings` sublevels (a token of their own): `settings/permissions` · `settings/themes` ·
`settings/local-models` · `settings/sync` · `settings/specialists` · `settings/accounts` ·
`settings/defaults` · `settings/development`.

**The list in the tool is the authority.** It was seeded from `docs/MAP.md` → Hot paths but
is not that table: MAP has no row for `library` or `onboarding` (`FirstRunView.tsx`), and its
leaderboard, record-badge and game-board rows all fold into `arcade`. The public website is
not a surface — it is `dev-workspace` → `release`. When the app gains a screen, add the token
here; the tool rejects unknown tokens, so a forgotten addition fails loudly rather than
silently.

### 3.3 Status — the definitions

| Status | Means | Who sets it |
|---|---|---|
| `confirmed` | **One of two things happened, and `checked` is stamped that day:** someone reproduced the symptom (Destin in the app, or an agent in a dev instance), **or** an agent read the current code, found the cause, and wrote it into the linked report with a claim anchor. "It sounds right" does not count. "The code is still there" does not count. | whoever did it |
| `needs-verify` | Everything else. An agent's item starts here **unless its report anchors the cause** — reading the code without writing the anchor is "it sounds right". An item **returns** here automatically when its claim anchor breaks. | agents; the tool |
| `in-flight` | Someone is working it now. The symptom text names the branch or worktree. | whoever picks it up |
| `blocked` | Waiting on something the symptom text names. | — |
| `decision` | Waiting on **Destin**, not on work. A question, not a task. | agents file it; Destin clears it |
| `parked` | Real, deliberately not now. Ideas live here, in their real area, not in a separate bucket. | Destin |

**The 60-day rule never changes status.** An item confirmed 61 days ago is still
`confirmed`. It appears on Destin's symptom-pass list, and he decides: still hitting it
(re-stamp `checked`; a `needs-verify` item he reproduces becomes `confirmed`, since his
reproduction is the first definition above), not any more (close it to `shipped.md` with
"no longer reproduces"), or don't know (flip to `needs-verify`).

**Only `confirmed` and `needs-verify` items age.** `parked` means "deliberately not now" —
asking every 60 days whether it is still parked is exactly the ambient noise §5 refuses to
add at session start. `blocked` and `in-flight` name what they wait on in the symptom text;
that is their check. `decision` is listed on every pass regardless of age.

**`confirmed` with no link means "somebody reproduced it."** That is a rule for the writer.
The tool cannot tell a reproduction from an agent's "sounds right", so the only check it
can make is the other half: a `confirmed` item that *does* link a report whose report
carries **zero** `claim:` anchors is listed as a warning — the anchor is the thing that
makes the confirmation re-checkable, and its absence is the "read the code without writing
the anchor" case this definition exists to exclude.

Short test: *confirmed means somebody saw it, or the code proves it and a machine can
re-check the proof. Anything less is needs-verify.*

### 3.4 Flags

`urgent` (blocks core app functionality) · `needs-repro` · `performance` · `security` ·
`regression` · a release token matching `v\d+\.\d+(\.\d+)?`.

`performance` and `security` are flags, not areas: 18 speed items span eight areas, and as an
area they would be hidden from all eight. Release targeting is a flag for the same reason —
the next release's items stay in their backlogs, and the index's "Next release" list is
derived from the flag.

---

## 4. Reports and claim anchors

A report is any markdown file under `docs/active/investigations/` that an entry links to.
It holds everything the entry is not allowed to: paths, line numbers, mechanism, the
investigation. It has the folder's usual `status:` frontmatter and is archived when its item
closes.

**A report that supports a `confirmed` item carries at least one claim anchor** on the
load-bearing claim — the line of code that, if it changes, means the diagnosis needs
re-checking:

```
`ThemeScreen.tsx` floors the slider at 0.3.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ThemeScreen.tsx", "contains": "min=\\{0\\.3\\}"} -->
```

Same JSON body as the workspace's existing `verify:` anchor (`path`, optional `contains`
regex), evaluated by the same exported `checkAnchor()` from `scripts/audit-anchors.mjs`.
**The marker is `claim:`, not `verify:`, on purpose.** The anchor pass treats a broken
`verify:` as documentation drift and fails CI, which is right for a depth doc — fix the doc.
A broken `claim:` means the roadmap item needs re-verifying, which is the signal working
as designed, so it must not turn CI red. `audit-anchors.mjs` ignores `claim:` markers;
`roadmap-check.mjs` owns them. A report may carry both kinds.

Anchor one claim per diagnosis, not every sentence — the same "use sparingly" rule the
`verify:` convention already states. Make the regex specific enough to pin the line you
mean: the example above matches three sliders in `ThemeScreen.tsx`, because all three share
`min={0.3}`, so fixing the wrong one would leave the anchor green. **The tool counts how many
places a `contains` regex matches and warns when it is more than one** — that is the whole
failure mode, and it is ten lines to detect. A better anchor for the example pins the label
next to the slider: `"contains": "Terminal opacity[\\s\\S]{0,200}min=\\{0\\.3\\}"`.

A claim whose `path` starts with a sub-repo that is not on disk (CI never clones the
private `youcoded-admin`) is **skipped and noted**, never reported broken — the existing
anchor pass already distinguishes "repo absent" from "file gone", and this reuses that
distinction.

---

## 5. The tool — `scripts/roadmap-check.mjs`

One script, one run, four jobs. Plain Node, no dependencies, reusing `checkAnchor`,
`currentShas` and `harvestDocAnchors` (generalised to take the marker word, default
`verify` so its existing callers are untouched) from `scripts/audit-anchors.mjs`. Nothing
reads git history — CI clones the sub-repos with `--depth 1`, and the private
`youcoded-admin` repo is not cloned there at all.

**Dormant until the folder exists.** When `docs/roadmap/` is absent the tool prints one
line saying so and exits 0. That is what lets the tool, the hook and the CI step merge to
master *before* the migration branch creates the folder (§6.1), without a red run in
between.

| # | Job | On failure | `--fix` |
|---|---|---|---|
| 1 | **Structure.** Parse the index and every area file. Every entry has a status and a `checked` date; every token is in its vocabulary; every `→` link resolves to a file on disk; `[x]` only in `shipped.md`; no `- [ ]` in the index; each area file has its heading and `Filing test:` line; `##` headings only in files §3.1 allows; index rows cover exactly the area files on disk; the index has a `Target:` line naming one release token. | **error** — exit 1 | — |
| 2 | **Claims.** For every entry with a link, evaluate the report's `claim:` anchors, counting how many places each `contains` matches. The output names the sub-repo commit each anchor was checked against (`currentShas`), so a flip made from a stale or branch checkout can be traced. Also lists: a `confirmed` entry whose report has no `claim:` anchor; an anchor matching in more than one place; an anchor into a repo that is not on disk (skipped). | listed; never exit 1 | flips `confirmed` → `needs-verify` for a broken anchor. `checked` is left alone — it records the last confirmation, and this is not one. An item already `needs-verify` with a broken anchor is only listed |
| 3 | **Symptom pass.** `confirmed` and `needs-verify` entries whose `checked` is older than 60 days, grouped by area, with every `decision` item listed first regardless of age. `parked`, `blocked` and `in-flight` never appear (§3.3). | listed, headed "for Destin" | — |
| 4 | **Index.** Recount Open / Needs verify / Decisions / Parked per area; copy each area heading; regenerate the Next-release list from the `Target:` release's flags; diff against the index. | **warning**, never exit 1 | rewrites the table rows and the Next-release list, touching nothing else in the index |

Why job 4 is a warning: fourteen files edited by concurrent sessions means someone will
file an item and forget `--fix`, and a count drift must not turn the workspace repo red for
everyone else. `/audit` runs `--fix`, so the counts are right at every audit. (An earlier
draft had a `--strict` switch that turned the drift into an error; paired with `--fix` it
could never fire, so it is gone.)

Output is markdown to stdout, in the order above, so `/audit` can paste it into its report
under one heading. `--quiet` prints only errors (CI). `--structure` runs job 1 alone (the
edit hook below). `--root <dir>` and `--today YYYY-MM-DD` exist for tests and worktrees.
No `--json`: nothing consumes it.

**Wiring:**

- `.claude/commands/audit.md` step 5 becomes: run `node scripts/roadmap-check.mjs --fix`,
  paste the output into the report, act on the error and claim lists, hand the symptom-pass
  list to Destin. The step that "has never run" becomes one command. Step 6's "planning
  content moves to ROADMAP.md" becomes "to the area file the filing test picks".
- `.github/workflows/workspace-ci.yml`: a step after the anchor pass, `node
  scripts/roadmap-check.mjs --quiet`. Structure errors fail CI; claims and counts do not.
  The tool's own tests run beside `audit-anchors.test.mjs`; the hook's beside the other
  hook tests.
- **An edit hook** — `.claude/hooks/roadmap-edit-check.mjs`, registered in
  `.claude/settings.json` as a `PostToolUse` hook on `Edit|Write` (the file today has only
  `SessionStart` and a `PreToolUse` Bash matcher, so this is a new block). Hooks match on
  tool name, not path: the script reads `tool_input.file_path` from stdin and exits 0
  immediately unless the path is under `docs/roadmap/` or is `ROADMAP.md`. Otherwise it runs
  `--structure --quiet` and, on errors, **writes them to stderr and exits 2** — the only
  protocol by which a PostToolUse hook's output reaches the model (plain stdout on exit 0 is
  shown to the user's transcript, not to the session). A malformed entry written through
  Edit/Write is caught by the session that wrote it — the only one that knows what the entry
  meant. **This is a net with holes**: a write made through the shell (which bypass-mode
  sessions are told to prefer) and a write by the app's own agent never trigger it. CI is the
  backstop; the hook only shortens the loop for the common case.
- The session-start hook is **not** changed. Surfacing "N items overdue" at every session
  start is tempting and would be ignored within a week; `/audit` is the cadence. The edit
  hook is different in kind: it fires only on a write, never as ambient noise.

**Tests** — `scripts/roadmap-check.test.mjs`, `node --test`, alongside the existing
`audit-anchors.test.mjs`, with one valid fixture workspace under `scripts/fixtures/roadmap/`
(index, two area files — one with sublevels — a `shipped.md` with the old-format block, a
report with a claim, and the file the claim points at); every malformed shape is a copy of
that fixture with one mutation applied in the test, so there is one fixture to keep true.
Cases: valid fixture passes clean; each malformed-entry shape (missing status, unknown
token, dead link, `[x]` in an area file, `- [ ]` in the index, `##` heading in a flat area,
missing `Target:` line, index row for a file that does not exist); a report with a broken
claim (`--fix` flips exactly that item and leaves `checked` unchanged); a `confirmed` entry
whose report has no anchor (warning); an anchor matching in two places (warning); an index with
wrong counts (a warning; `--fix` rewrites only the table and Next-release, byte-identical
elsewhere); the old-format block (skipped, not parsed); a `parked` item 200 days old is
absent from the symptom pass; an absent `docs/roadmap/` exits 0. The 60-day check takes
`--today`.

---

## 6. Migration — its own session

Rewrites 258 entries, verifying each one, in one branch of the workspace repo, ideally in
one day. Concurrency is the risk: 74 items were filed in the three days of 2026-08-26/28,
so other sessions **will** append to the old `ROADMAP.md` while this runs. The last step
diffs the old file against the branch base and migrates anything that landed meanwhile.

### 6.1 Preconditions

1. §5 tool, hook and CI step merged to master with tests green. The tool is dormant there
   (no `docs/roadmap/` yet), so master stays green.
2. **First commit on the migration branch:** `ROADMAP.md` replaced by the index skeleton,
   14 empty area files with their headings and filing tests, and `shipped.md` with the 150
   existing shipped items copied in under the old-format heading — so the tool passes on an
   empty roadmap before any item moves. (An earlier draft had this committed to master before
   the branch; that would have removed the old file from master for the migration day, which
   §6.3.4 needs it to stay on.)
3. The worksheet: `node scripts/roadmap-legacy-worksheet.mjs ROADMAP.md` — JSON per item:
   line, headline, section, type, tags, `added`, word count, **default area from the tag map
   (§6.4)**, every cited file with its last-commit date, and the other items that cite the same
   files (duplicate candidates). Run it against the branch base's `ROADMAP.md` (`git show
   <base>:ROADMAP.md`), not the working tree.
4. `docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md` — already-verified
   findings that must not be re-derived: four items resolved, one half-resolved, and
   `desktop/test-engine/conversation-triage.mjs` gone from disk. The handoff §1 has the honest
   tally. Each area agent gets the ranking doc's rows for its items.

### 6.2 Per area, in parallel

One subagent per area, owning that area file and the reports it writes — **except
`native-harness` (58 items), which gets one subagent per sublevel** (six); one context cannot
verify 58 items against code and git history honestly. For each worksheet item defaulted to
its area:

1. **Classify** by the filing test, not the tag. Move it to another area's list if the test
   says so (the coordinator merges those at the end).
2. **Verify against the code** — read what the entry cites, `git log` since `added`. Three
   outcomes:
   - **Shipped or no longer true** → one line in `shipped.md` with the commit or the reason.
   - **Still open, entry makes claims** → write the report (the entry's mechanism, cleaned
     up, with a `claim:` anchor on the load-bearing line) and a two-line symptom entry.
     Status `confirmed` only if the agent found the cause in current code and anchored it
     (§3.3); otherwise `needs-verify`. `checked` = today. **A report is for a diagnosis**:
     when the entry's "mechanism" is one line naming a file with no cause behind it, drop the
     path, file a pure symptom, and write no report — 186 items cite a file, and a folder of
     150 one-paragraph reports is the old file in fourteen pieces.
   - **Still open, pure symptom** (the 72 items citing no file) → two-line entry, no report,
     `needs-verify`, `checked` = its `added` date (nobody has confirmed it since).
3. **Questions, not work** → status `decision`. **Ideas** → status `parked`, real area.
4. **Duplicates** (worksheet's shared-file groups) → one entry, one report, the older
   `added` kept in the report's history line.
5. Release sections (v1.3: 3 items, v1.3.1: 16) → their real areas plus the release flag.

The area agent's report back is a short list: items moved to other areas, items it could not
classify, items it could not verify either way.

### 6.3 Coordinator, after the fan-out

1. Place the moved items; resolve the unclassifiable ones.
2. Run the tool with `--fix`; structure must be clean and the index correct.
3. **Destin's pass** — one list: every `decision` item, and everything the agents could not
   verify. He answers in one sitting; the answers go into the files.
4. Diff old `ROADMAP.md` against the branch base; migrate late arrivals.
5. **Doc sweep.** Only the instructions change — historical handoffs and investigations that
   say "ROADMAP.md" are left alone, since the file still exists. The list is generated, not
   remembered: `rg -l ROADMAP CLAUDE.md .claude docs scripts youcoded/CLAUDE.md youcoded/docs
   wecoded-marketplace/docs`, minus `docs/archive`, `docs/audits`, `docs/active/design` and
   the lifecycle folders, judged file by file. Re-run it on migration day; the list below is
   what it returned on 2026-09-01 (verified, not remembered — the first draft of this list
   missed three of them). Live instruction sites: `CLAUDE.md` (the "Where knowledge lives"
   row and the lifecycle paragraph), `youcoded/CLAUDE.md` ("Planning happens in the workspace
   `ROADMAP.md`"), `.claude/commands/audit.md` (steps 4, 5 **and 6** — Gardening also routes
   content to the roadmap), four rules (`status-bar-relevance`, `engine-local-models`,
   `harness-evaluator`, `narrow-viewport`), two skills (`ui-review`, `ui-mockup`),
   `docs/PITFALLS.md`, `docs/error-message-standards.md`, `docs/testing-under-load.md`,
   `docs/vm-testing.md`, `youcoded/docs/artifacts.md` line 124. **Three pointers at a roadmap
   *section* or *title* that will stop existing:** `youcoded/docs/native-runtime.md` line 572
   ("under `#specialists`"), `youcoded/docs/harness-evaluator-internals.md` line 96
   ("ROADMAP → Bugs"), `scripts/resize-bench.mjs` line 41 ("ROADMAP.md → 'Window-resize lag
   has a SECOND cause'") — each becomes a pointer at the item's new area file. No hook
   mentions the roadmap. The rule they all need is the "Filing an item" block from the index,
   or a pointer to it.
6. Replace `ROADMAP.md` with the index. The old content is in git; the index's first
   commit message names the last single-file commit for anyone who wants the archaeology.
7. `/audit` once, end to end. Merge and push. Move this spec, the taxonomy draft and the
   handoff to `docs/archive/`.

### 6.4 Tag → default area (the worksheet's first guess; the filing test decides)

| Default area | Tags |
|---|---|
| `native-harness` | `#native-runtime` `#harness` `#permissions` `#specialists` `#pricing` `#cost` `#skills` `#mcp` `#sessions` `#context` `#memory` `#slugs` `#leases` |
| `dev-workspace` | `#tooling` `#tests` `#ci` `#build` `#release` `#workbench` `#harness-eval` `#docs` `#infra` `#tech-debt` `#landing-page` |
| `android-only` | `#android-runtime`; `#android` when the code is Android's own, else seen-on |
| `marketplace` | `#marketplace` `#marketplace-ui` `#worker` `#catalog` `#wecoded` `#plugins` `#install` |
| `user-interface` | `#ui` `#ux` `#ui-consistency` `#a11y` `#animation` `#copy` `#markdown`; `#renderer` (44 items — a *location* tag: default here only if the fix spans screens, else the screen's area) |
| `files` | `#artifacts` `#project-view` `#git` |
| `sync` | `#sync` |
| `chat-data` | `#conversations` `#chatsearch` `#conversation-store` `#chat` `#chat-ui` `#chat-reducer` |
| `themes` | `#themes` |
| `remote-access` | `#remote` `#remote-access` |
| `local-models` | `#local-models` `#engine` |
| `claude-code-integration` | `#hooks` `#pty-io` `#pty-writes` `#terminal` `#terminal-parser` `#transcript-watcher` |
| `games` | `#games` |
| `other-features` | `#social` `#accounts` `#announcements` → accounts · `#buddy` → buddy · `#onboarding` → onboarding |
| *(not an area)* | `#performance` `#perf` → flag `performance` · `#security` `#safety` → flag `security` · `#desktop` `#linux` → seen-on · `#settings` → surface · `#ipc` → by item |

Six open items carry no tag; the worksheet leaves their default blank.

---

## 7. What Destin will notice

- Opening `ROADMAP.md` shows the state of the app in a screen or two, then a table. Each
  backlog is a short file that reads top to bottom.
- Every couple of weeks `/audit` hands over one list: decisions waiting, and symptoms
  nobody has confirmed in 60 days. Yes / no / don't know per item. At today's size that is
  a 20-minute skim **in the steady state. The first pass is a cliff, not a trickle:** 248 of
  258 items were filed within the last 60 days, and pure-symptom items keep their filing date
  as `checked`, so roughly two months after migration most of the roadmap comes due in the
  same fortnight. Plan one long sitting for it — or answer the migration's own "could not
  verify" list (§6.3.3) generously, since every item Destin re-stamps there starts its 60
  days on migration day instead.
- Agents will occasionally file in the wrong area. The filing test at the top of every
  file is what keeps that rare; the coordinator step in every `/audit` is where it gets
  caught.
- Nothing in the app changes. This is a documentation and tooling change in the workspace
  repo only.

## 8. Out of scope

- Item IDs, cross-references between items, or generated files.
- Automatic status changes beyond the broken-claim flip.
- A `--json` output and a `--strict` mode (both in the first draft; neither had a consumer).
- A session-start reminder of overdue items.
- **Modified-since hints** (compare a report's cited files' last-commit dates to `checked`).
  The handoff recommended them as a hint beside the anchor check; dropped in the 2026-09-01
  review. The handoff itself measured the signal at 54% noise and growing, the claim anchor
  is the precise form of the same signal, and it was the only job that needed git history —
  which CI's shallow clones do not have. Nothing else in the tool reads git.
- Rewriting the 150 already-shipped items.
- The "consolidations" idea (grouping related items into larger plans) — the worksheet's
  shared-file groups are the input to it; doing it is a later session.
