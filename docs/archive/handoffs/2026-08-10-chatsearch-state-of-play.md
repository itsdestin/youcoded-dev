---
status: shipped
created: 2026-08-10
related:
  - docs/active/specs/2026-08-05-chat-search-design.md
  - docs/archive/specs/2026-08-10-chatsearch-session-references-design.md
  - docs/archive/plans/2026-08-05-chatsearch-phase1-plan.md
---

# Chat Search — state of play

Pick-up notes for a later session. What is shipped, what is specced, and the
one thing that has never been done.

## Shipped

**Phase 1 — index + read-only CLI.** On `youcoded` master:
`youcoded#282` (feature) and `youcoded#283` (transcript-resolution fix);
`wecoded-marketplace#65` (index regeneration) and `#66` (the plugin).

Index on this device: ~1,697 Claude + ~69 native conversations, ~13.5k indexed
user turns, at `~/.youcoded/chatsearch/`.

The `youcoded-chatsearch` plugin is installed, enabled, and registered in all
four Claude Code registries.

## The gap: nobody has actually used it

**Phase 1 has never been exercised by a human.** It has been verified by tests
and by reading the index off disk, but the questions that decide whether it is
worth building on are untested:

1. **Recall quality.** Search 3–4 things you genuinely remember. The failure
   that matters is *you know it happened and it is not in the results* — that
   is the shape of the bug `#283` fixed, and there is no test for it.
2. **Cross-device rows.** Search for work done on the Mac or Galaxy Book. Those
   are the records `#283` was about; before it, 1,532 of them were falsely
   tombstoned.
3. **Tombstone honesty.** A `†` row must still show a real title and date. The
   conversation happened; only its bytes are gone.
4. **Drill-down cost.** Does `show` alone usually answer the question? If every
   lookup needs `turns`/`tail`, the metadata tier is not earning its place.
5. **Does the model reach for it unprompted?** Ask something half-remembered
   *without* mentioning search. If it says it cannot recall past conversations,
   or opens a transcript directly, the skill description is not doing its job.
   No test can answer this one.
6. **Index freshness.** Phase 1 refreshes on app launch and at session end, not
   continuously. Confirm the turn count does *not* move mid-session — that is
   phase 2's job, and it is worth knowing what you actually have.

**2026-08-25 — Task 0 done: GO.** Destin exercised phase-1 search by hand in a
dev instance (`run-dev.sh master --label "Chat Search check"`) against the live
index (1,816 Claude + 154 native conversations, 14,261 indexed turns, refreshed
2026-08-25T22:26Z) and judged recall good enough to build on: *"i think this is
good."* No individual defect was raised against the six checks, and none of them
was itemized separately — the verdict is a whole-feature go, not six recorded
answers. Session-references implementation proceeds from Task 1.

Run these before building more. The session-references design assumes the
results are worth surfacing; if recall is poor, that work builds a better frame
around the wrong picture.

Requires `bash scripts/run-dev.sh --label "Chat Search"` — never the installed
app.

## Specced, not built

**Session references** —
`docs/archive/specs/2026-08-10-chatsearch-session-references-design.md`
(`status: active`, revised 2026-08-25) with an implementation plan at
`docs/archive/plans/2026-08-25-chatsearch-session-references-plan.md`.

Preview and Resume from a search hit. **Nothing is built.** No branch, no
worktree, no CLI change.

**What the 2026-08-25 revision changed, and why** (history lives here, not in
the spec):

- *Reviewed the 2026-08-10 draft against master* (`df96b4a5`). About thirty of
  its code claims held; the ones that did not are fixed in the spec: paths were
  missing `src/`, the reducer resets `currentGroupId` at six sites not one, the
  renderer folds segments in `splitIntoBubbles` (whose trailing `else` assumes
  `tool-group` — an unknown segment would push `undefined` as a group id), and
  `chat-serialization.test.ts` never exercises a populated segments list.
- *Dropped the plugin-side machine-readable block.* Bundled plugins are
  install-if-missing and never upgraded (`skill-provider.ts:803-812`; manual
  `skills:update` exists but nothing drives it for bundled ids and the entry
  has no version) — so a CLI change would never reach existing installs and
  the cards would silently not exist for them. Instead the card parses the
  short ids from the table the CLI already prints and resolves them in-app
  over a new `chatsearch:resolve` channel against the index the app writes.
  Works against every installed plugin version today. ROADMAP has the upgrade
  gap as its own bug.
- *Reader keyed by id, not path* (`chatsearch:read`): the renderer never names
  a path; main looks it up in its own index. Containment kept as defense in
  depth, three legal roots (`~/.claude/projects`, `~/.youcoded/sessions`, the
  space root resolved at call time).
- *Two drawer fields with a reducer rule* instead of the draft's
  `activePaneItem` consolidation — same guarantee, thirteen fewer call sites.
- *Android has no chatsearch index* (verified: the only `app/src` mention is
  the bundled-id list), so both channels get the `project:*`-style
  not-implemented stub and the cards fall back to plain shell there.
- *Step 1 is a visual design pass with Destin in the workbench* — Destin's
  instruction, 2026-08-25. The plan's Task 7 is that gate; no backend task
  starts before his sign-off.

**Plan shape:** Task 0 = Destin uses phase-1 search by hand, go/no-go.
Phase A (Tasks 1–6) builds the parser + copy table, the workbench fixture
index, the two cards (**Task 4 = first look with Destin, cards only**), the
shared transcript renderer, the preview pane, and the drawer state + list —
all real renderer code against a fake `chatsearch` namespace (`MOCK_ONLY`).
Task 7 = sign-off gate, with the full list of subjective decisions and the
backend error sentences to confirm. Phase B (Tasks 8–13) builds the meta
reader, the two-lane transcript reader (with a parse cache), the four IPC
surfaces + WS + Kotlin stub, Resume wiring, and the unknown-segment guard.
Task 14 is the `show`-as-segment change, **conditional on Destin asking for
it**. Tasks 15–16 verify and finish; Task 17 is the one-sentence `SKILL.md`
change in the marketplace repo.

**Reviewed 2026-08-25** by an independent agent with no session context
(errors / omissions / over- and under-thinking / add-one-subtract-one /
simplification / user checkpoints / unapproved subjective decisions). It found
ten defects in the plan's own code, every one of which the plan's tests would
have passed anyway — the kind worth recording so the next plan checks for them:

- `status !== 'completed'` where the real union says `'complete'`
  (`shared/types.ts:351`); tests hid it behind an `as ToolCallState` cast.
  Cards would never have appeared. Now: fixtures built as the real type.
- A hook depending on a fresh array each render → cancel-and-never-refetch
  spinner. Now: depends on the joined key only, with a re-render test.
- The drawer's early return (`SessionDrawer.tsx:607`) made the pane branch
  unreachable; the drawer is also unmounted until open, so the event listener
  had to move to `ChatView` (found separately the same day).
- Workbench seed ids are `wb-past-0`, not hex — every gallery row would have
  been rejected; and the gallery renders bare cards with no `ChatView`, so
  Preview had no listener there. Now: a dedicated hex fixture index with one
  entry per state, and a scenario conversation that replays through the real
  reducer.
- The `show`-segment reducer change covered only one of the three
  `TRANSCRIPT_TOOL_USE` branches; the permission-placeholder branch is the one
  Bash takes in "ask" mode. Now: the segment is conditional (built only if
  Destin wants `show` set apart after seeing it in a group) and, if built, must
  cover every placing branch.
- Gap counts off by one (a message's own tool calls were added to the gap
  before it). Now: push text first, then count.
- A vacuous "no filepath chips" assertion on an attribute that does not
  exist. Now: positive control first.
- One truncation marker checked of three; dateless (`----------`) rows
  rejected; `2>&1` disqualified a card. All fixed.

It also surfaced three things the plan had not decided: cards are collapsed
by default (so the feature would have been a one-line header), raw `native` as
a user-facing label, and no go/no-go on phase-1 recall despite this handoff
asking for one. Now: expanded by default (Destin can reverse), `providerLabel`,
Task 0. Its subtract-one candidate — the Referenced conversations list — is
kept in the spec but marked a cut candidate for Destin at the gate.

**Still unsettled inside the spec:** tool activity in the preview is a count
marker only in v1 (open question 1); references are not persisted (2); a
mirrored transcript may lag its origin device and the preview does not say so
(3).

## Design decisions from the 2026-08-25/26 workbench sessions

**Search-results card — APPROVED.** Compare surface `chatsearch-results`, round 2
candidate `b-closed`, ported to `ChatsearchFindCard` / `ChatsearchShowCard`.
A titled panel whose rows carry title + a metadata line (tags as real `TagChip`s,
then project, then the relative date pinned right) + Preview/Resume as the real
`Button` primitive. **Closed by default**, using `ToolCard`'s own header as the
single disclosure control — this REVERSES the plan's "expanded by default"
constraint. Verified reason: `ToolCard`'s header already carries a chevron and
already prints `COPY.headerFind(n)`, so a second header inside it meant two
arrows and the same sentence twice.

Three defects drove the first rejection ("i hate these") and are fixed: the two
buttons were hand-rolled from raw classes instead of the `Button` primitive; tags
rendered as plain `#tag` text instead of `TagChip`; and nothing signalled that the
rows were past conversations.

**Presented conversation — NEW SCOPE, look LOCKED, trigger UNDECIDED.** Destin,
2026-08-25: the search card should stay as it is, and a *separate*, visually
distinct thing should let the model present one or more specific conversations it
has judged relevant, ideally mid-message. Seven compare rounds
(`chatsearch-present`); rounds 1-4 and 6-7 rejected. **Locked: round 5 candidate
`present-row-split`** — a Deliverables-style card (shell + header-row-as-collapse,
closed by default) whose rows are two lines: title left with the relative date
pinned right; project left with Preview + Resume right. No tags, no excerpt, no
leading glyph.

*Tags are deliberately absent here* though Destin asked to keep them: round 6 put
them in three places and all three broke. Measured — two chips plus an overflow
chip plus the project plus two buttons overflow the row at the pane's real width,
because a real tag label is wide (`Follow-Up Needed`, not `perf`). Tags stay on
the search card, which has the room.

*The card is deliberately NOT built in production yet.* It has no trigger, and a
component nothing renders is dead code. **The trigger is the open question**, and
one finding constrains it hard: **the app cannot give Claude Code a custom tool.**
Verified 2026-08-25 by searching for `mcpServers` / `.mcp.json` / any
app-spawned server across both repos — YouCoded authors no MCP server; it only
projects *third-party* servers into `~/.claude.json` and otherwise reaches Claude
Code through plugins that shell out. So a `present_chat` tool on the Claude lane
means a new `chatsearch.js` subcommand, which the never-upgrades bug
(`skill-provider.ts` → `plugin-installer.ts:360-365`, the already-installed guard
returns before any version comparison) keeps from existing installs. An unknown
`cmd` degrades gracefully (`chatsearch.js:996` returns `unknown command "x"` plus
usage, exit 0), and an old install simply never learns to call it — so the
degradation is "the feature is absent", not "something breaks". On the native
lane it is small: `harness/tools/` is a plain array of tool objects, and the
harness already carries UI-only result payloads invisible to the model
(`structuredPatch`, `harness-session.ts:1886-1893`).

**Deliverables-card coupling.** The locked look re-expresses `DeliverablesCard`
(`worktrees/send-user-file`, branch `feat/send-user-file-card`, unmerged) because
it cannot be imported across branches. When that branch lands, extract the shared
shell — card chrome, header-as-collapse-button, tile frame — instead of keeping
two copies that drift. That card was also changed to closed-by-default after
Destin saw it on a real screen, which is the same call he made here.

**Environment note.** The workbench died repeatedly mid-session with Vite
`ENOSPC` on `watch`. Cause was inotify exhaustion, not the code: the installed
YouCoded app holds ~247k watches on its own and a second dev Electron held ~272k,
against a 524,288 default. Raised to 1,048,576 via `/etc/sysctl.d/90-inotify.conf`
on 2026-08-26. Worth its own look — a quarter-million watches for one app is a
lot.

## Not started

**Phases 2 and 3** of the original design — the write outbox, then digests.
ROADMAP owns the detail. Phase 3 unblocks two things phase 1 ships deliberately
inert: the `○` open marker and `--state open`.

## Traps worth knowing before you touch this

- **A newly bundled plugin will not install for up to 24h.** The marketplace
  index is cached with a 24h TTL at
  `~/.claude/youcoded-marketplace-cache/index.json`. Until it expires, the
  bundled installer looks the plugin up in a stale snapshot and silently does
  nothing. Symptom: the plugin is in `BUNDLED_PLUGIN_IDS` and merged to the
  registry, but absent from `installed_plugins.json`. Fix is to delete that one
  file and relaunch. **The local marketplace clone under
  `~/.claude/plugins/marketplaces/youcoded/` is a red herring** — it is the
  install *destination*, not the source, and it is app-managed (the app rewrites
  its `marketplace.json`), so do not `git pull` it.
- **Subagent transcripts are excluded only by accident.** They live at
  `<slug>/<parent-id>/subagents/agent-<hash>.jsonl` and are missed purely
  because both enumerators do a flat `readdir` filtered on `.jsonl`. Nothing in
  the store, mirror, or reconciler mentions them. The session-references spec
  makes the exclusion explicit and adds the pinning test; until that lands, the
  protection is depth alone.
- **`~/.youcoded/` is shared** by the live app and every dev instance —
  `run-dev.sh` isolates only `userData` and ports. Index writes must stay
  atomic.
- Dev launches may need `node node_modules/electron/install.js` first; see the
  `allowScripts` ROADMAP entry.
