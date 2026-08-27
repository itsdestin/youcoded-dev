---
status: shipped
shipped: 2026-08-26  # youcoded merge 62c1f182
created: 2026-08-16
last_reviewed: 2026-08-26
spec: docs/archive/specs/2026-08-16-native-specialists-plan-1c-design.md
plan: docs/archive/plans/2026-08-16-native-specialists-plan-1c-implementation.md
checklist: docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md
branch: youcoded feat/specialists-1c-ui (worktree worktrees/specialists-1c) — 47 commits, unmerged, no PR
---

> **Status 2026-08-26 (paused, mid-task):** The opening paragraph below is
> HISTORICAL and no longer true — plan 1c is written (spec + plan + checklist all
> exist, see the frontmatter) and Tasks 0–13 plus Task 15 Steps 1–2 are built.
> Work stopped on **2026-08-16 23:07 local** because the session hit its weekly
> Claude usage limit mid-turn (transcript `8c00`, "Specialists Plan 1c Docs",
> tagged `#Follow-Up Needed`), not at a task boundary. Read the
> "Addendum 2026-08-26" section at the very bottom of this file for exactly where
> it stopped and what is still open.

# Handoff: native specialists — plan 1c

Native specialists shipped plans **1a** (foreground) and **1b** (background,
durability, steering, permissions) to youcoded master. **Plan 1c is the last
piece and is unwritten.** Your job is to brainstorm it into a spec, then a plan,
then implement — figure out the scope yourself from the sources below.

**Start here (don't take my word for the scope — read them):**
- `docs/active/specs/2026-08-11-native-specialists-design.md` — the approved
  design; 1c is called out as "definitions folder / CC-compat mapping / chat UI."
- `ROADMAP.md` — every open `#specialists` item is 1c work. Read all of them.
- `docs/archive/plans/2026-08-12-...-plan-1b-...md` and
  `docs/archive/handoffs/2026-08-20-specialists-1b-testing-checklist.md` — what
  already shipped, and where the interim UI is a known stopgap.

**The one directive from Destin's 1b hands-on that must land in 1c** (a ROADMAP
item spells it out): a *background* hire should render exactly like a
*foreground* one — the child's routed permission ask nests under the launching
**Task card**, and the report folds back into that **same Task card** instead of
the standalone interim card that ships today. Everything else about 1c is open.

**Norms:** `bash setup.sh` first; start non-trivial work at `docs/MAP.md`; use the
brainstorming → writing-plans skills before coding; work in a worktree; verify
with `bash scripts/verify.sh`. The `youcoded/.superpowers/sdd/progress.md` ledger
has the full 1b run history if you want it.

Explore, propose a scope, and confirm it with Destin before building.

---

## Addendum 2026-08-16 — what happened after this handoff (for the next agent)

**Scope was settled with Destin, then the UI was designed workbench-first before any
backend.** Spec: `docs/archive/specs/2026-08-16-native-specialists-plan-1c-design.md`
(rules R1–R12 + the channel contract). Branch: youcoded `feat/specialists-1c-ui`,
worktree `worktrees/specialists-1c` — the real renderer against `MOCK_ONLY` channels;
seeded workbench session "specialists demo" (`wb-3`) drives review.

### Review-round history (so it is not re-proposed)

| Round | What was shown | Destin's verdict |
|---|---|---|
| 1 | Nested ask + folded report on the Task card; cards with a pending ask **hoisted to the bottom** of the timeline; chip + list popup; Settings page | Asks deep in cards "impossible to navigate" — must be centrally manageable in the popup |
| 2 | Popup gets the asks + Note/Stop; hoisting dropped | — |
| 3 | Popup restyled as flat rows in the Open-Tasks-popup language | "Still ugly and shallow" — wants cards with clear hierarchy |
| 4 | One card per helper: who → what → how far (elapsed, steps, last three actions) → ask band → footer | Better; then a series of edits |
| 5 | Two-row compression of the cards | **Reverted at Destin's request** — do not re-propose |
| 6 | Name in-line with role/model; no "Needs you" pill; request + buttons on one line; ask band at the bottom | Approved |
| 7 | Name is the out-link (dotted underline); Note/Stop top-right; charter copy dropped | Approved |
| 8 | Role tag dropped from popup cards | Approved |
| 9 | Popup cards render the chat card's own Briefing/Activity/Report (`AgentSections`) instead of a summary band | Approved |
| 10 | Those sections collapsed, accordion | "Good enough for now" |

### Independent review of the spec (another session), and what was done with it

Accepted: name the ledger's write methods and put the change emitter **in the
ledger** (not a host wrapper — the steer methods live outside the host's spawn path);
write down the roster loading strategy (in-memory catalog per cwd, read on attach, Task
tool built only after); a running helper keeps its spawn-time definition; Android gets
the "desktop only" state; starter `example.md` + visible parse errors; note cap; move
this history out of the spec; drop `specialists:openFolder` (list returns folder paths;
Settings uses `shell:open-path`; the personal folder is created on visiting Settings →
Specialists — a deliberate bend of the "`~/.youcoded/` on first write" convention);
drop the project-level *native* folder for now (`.claude/agents/` covers "travels with
the project"); ship the reload-bug fix as its own change ahead of 1c.

Pushed back, with the code: (a) "a Yes after the helper finished is a promise the card
can't keep" — 1b already delivers a late answer to the assistant as a follow-up note
naming the `task_id`, so it is kept; only the copy changed (R3). (b) "replay on attach
is uncapped" — bounded by 1b's `SPECIALIST_SPAWN_BUDGET_PER_SESSION` (30) per
conversation; cited, no machinery added.

### Second review of the spec (same day, later session) — verified against the code

Accepted, all in the spec now: the ledger has **10** write methods (not eleven) and only
**7** touch disk — all through one `home.mutateJson` call — so the emitter is a single
private `mutate()` chokepoint, not a per-method list; the Task tool is **rebuilt at every
turn start** (identical roster = identical description, no cache cost) instead of a
catalog version counter; **no shadowing — built-in ids reserved, collisions warn +
skip** (a cloned repo's `.claude/agents/worker.md` must not silently replace the
built-in Worker); a **lifecycle** rule for the per-cwd catalog + watchers (ref-counted,
closed on last detach; never `mkdir` `.claude/agents/` in a user's repo); CC's
**user-level `~/.claude/agents/`** joins the project folder as a source (CC reads both);
Settings tells **loading / failed / not-available** apart (the branch spins forever on
any throw; no app-standard "desktop only" component exists — the plan builds one);
`SPECIALIST_NOTE` **dedupe** and the note event firing on *accept* for parked steers,
both added to §7 (the spec had described the dedupe as if it existed); tokens/cost and
the per-action toggle (parent-spec promises never shipped) named in the Out table.
Destin declined the one optional simplification (defer `.claude/agents/` support) —
CC-folder support ships in 1c.

### Plan review (same day, a third session) — what changed in the plan AND spec

Accepted: **no file watchers** — the Task tool is rebuilt from memory every turn, so
watchers only bought a live-updating Settings list (Refresh covers it); replaced by
re-read on conversation open, at each turn start when a **per-file fingerprint** (name +
mtime + size — a directory's mtime does NOT change on an edit) differs, and on Refresh.
Deletes the ref-counting, debounce, roster push event, and the "folder appears later"
edge. **No separate note message** — notes ride on the run record only; the reducer
rebuilds note rows from `run.notes` (no merge key). A parked steer and its note land in
ONE ledger write. The reflection-based emitter test is dropped for a source-level "exactly
one `home.mutateJson`" test. **Offered cap** (20, visible warning) and a **provenance
line** ("defined by …") on the consent card + Settings row. `permissionMode:` in a CC file
now warns. `model` view fields match the branch (optional). The 5-minute hold is stated as
a real wait (no override exists). Settings' cwd source named.

Held, with the code: the remote (phone) run buffer stays — the phone does not use the
transcript-replay path, so the connect-time buffer is the only route, and it is the same
mechanism `hookBuffers` already uses. "File disappeared mid-run" UI: not worth it — the
run completes normally and a later resume already refuses with a clear message.

### Second plan review (same day, a fourth session) — verified against branch `5718d44d` / master `b79db26a`

Accepted, all in the plan (its "Second plan review" table lists where each landed) and
mirrored in the spec (§3, §5, R11): **a remembered hire grant never covers a file-defined
helper** — the hire subject was `${charter}:${workDir}` ("this kind of helper in this
folder", not which one) and hire cards offer Always-allow, so a grant given for the
built-in Worker would auto-hire a cloned repo's `.claude/agents/x.md` with a shell and the
provenance line would never be shown; built-ins keep the old subject (no grant lost),
file-defined ones get `:file:<id>` and no Always-allow button. **The consent card looks
up its definition per cwd and refetches once on a miss** — the branch's roster cache is
one page-wide list loaded once with no folder, so a project-defined helper's card had no
definition and a file dropped mid-conversation was hireable but unknown to the card (the
roster push that would have told it was dropped in the first plan review). **`PermissionHeld`
is replayed after a reload** for asks whose hold already flipped (Task 0 predates the
event). **Catalog `forget()` deleted** — several conversations share a cwd, and the
ref-counting that made teardown cleanup safe was itself deleted in review 1. Smaller: a
300-char cap on the description a file feeds into the Task tool; `load` + `refreshIfChanged`
collapsed into `ensureFresh` + `reload`; the note textarea's `maxLength` (silent paste
truncation) and the one-message `DesktopOnlyState` component dropped.

Held, with the code: Settings' Refresh mid-turn changing what `resolve` returns later in
that turn — acknowledged in a WHY, no machinery (what the card shows still equals what
spawns).

### Third plan review (same day) — mostly taken

Taken: the ledger guard regex must skip comment lines and match `await this.home.mutateJson(`
(a comment naming the call would have tripped it); the reducer returns the same state for a
byte-identical run view (delivery bookkeeping fires the listener up to four times per
delivery with an unchanged card view); a replay-then-live ordering pin in the reducer tests;
the fingerprint's same-millisecond-same-size blind spot stated as accepted. Not taken:
collapsing per-row "not offered" into one summary line (a summary cannot say WHICH helper
the assistant can't hire); dropping the `:file:<id>` hire subject — the review argued the
consent card is shown regardless once Always-allow is hidden, but a matching OLD grant
answers `allow` in `decide()` before any card exists, so the distinct subject is the only
thing keeping the Worker's grant off a repo's helper (plan Global Constraints spells out the
two halves).

### Next step

The implementation plan is written:
`docs/archive/plans/2026-08-16-native-specialists-plan-1c-implementation.md` (Task 0 =
the reload-bug fix on its own branch first; Tasks 1–9 backend on `feat/specialists-1c-ui`;
Tasks 10–13 the §7 renderer edits; 14 hands-on checklist; 15 docs/archive). Execute it
with `superpowers:subagent-driven-development` in the existing worktree.

---

## Addendum 2026-08-26 — where it actually stopped, and what is still open

**Verified by re-review on 2026-08-26. Nothing below is from memory.**

### Where it stopped

Last commit `6dd6a1a4`, **2026-08-16T23:00:30-07:00**. Four files were then edited
at 23:04-23:06 and never committed. The session that was driving the work (`8c00`
"Specialists Plan 1c Docs", tagged `#Follow-Up Needed`) ended at
**2026-08-17T06:07:52Z** with `You've hit your weekly limit - resets Aug 19, 7am`.
This was **not a clean boundary** - an in-flight fix agent had just finished and a
question to Destin was left unanswered.

### The four uncommitted files in `worktrees/specialists-1c`

`git status --porcelain` -> 4 `M` files, ~66 insertions:
`desktop/src/main/harness/harness-session.ts`,
`desktop/src/main/harness/native-session-host.ts`,
`desktop/src/renderer/dev/workbench/mock-shim.ts`,
`desktop/tests/workbench-shim-semantics.test.ts`.

They are the *output of the final whole-branch review's three fixes*, applied but
never committed:

1. `harness-session.ts` - rewrite a WHY comment in `syncTaskTool` that asserted the
   roster is stable for a turn. It isn't: `roster.resolve()` reads catalog state at
   call time, and `specialists:list` (which the renderer fires on every hire-card
   mount) calls `reload()` on the shared catalog instance.
2. `native-session-host.ts` - rewrite the `envelopeGranted: true` comment, which
   claimed "the ask was the consent". Untrue in auto-edit mode, where no card is
   ever shown.
3. `mock-shim.ts` + `workbench-shim-semantics.test.ts` - a **real workbench bug**:
   `shell` had no hand-written entry, so `shell.openPath` fell through to the
   catch-all proxy, which resolves unknown members to `[]`; `[]` is truthy, so
   Settings -> Specialists' "Open folder" always popped a blank error box. Fixed to
   resolve `''` (the real success value), with a regression test.

**Worth committing.** Two comment corrections that stop a future session trusting a
false invariant (this branch has already been bitten twice by exactly that), plus a
genuine dev-surface bug fix with its own test.

### The one open question for Destin - nothing on disk records it

The final review surfaced a safety finding that was put to Destin as a two-option
choice and **never answered before the limit hit**:

> In the **auto-edit** permission mode, hiring a helper is pre-approved outright -
> no card, no saved rule. Both of 1c's hire-grant protections (the `:file:<id>`
> subject and the suppressed Always-allow button) only operate when a card is shown
> or a stored rule is checked, so **neither runs in that mode**. Because 1c lets a
> helper be defined by a file *inside a repo you opened*, opening someone else's
> repo in auto-edit mode could let a helper that repo shipped run shell commands
> with no prompt at all. Pre-existing for the built-in Worker; new only in what can
> feed it.
>
> Options put to Destin: **(a)** ship it and file a ROADMAP bug, or **(b)** exclude
> file-defined helpers from auto-edit's blanket approval, so a repo's helper always
> shows a card.

`grep -nic 'auto-edit' ROADMAP.md` -> **0**. This question exists nowhere durable
except a truncated chat transcript. **Blocked on Destin - answer before merging.**

### What is done, what is not

- **Tasks 0-13: built.** Task 0 shipped separately as youcoded **PR #322**, merged
  to master (`bf55513e`).
- **Task 14 (hands-on): NOT run.** The checklist doc exists and is good, but all 15
  Result cells are blank, including the nine the plan asked an agent to run itself.
- **Task 15 Steps 1-2: done** (rule section, MAP row, ROADMAP status text).
  **Step 3 (post-merge cleanup/archive): not possible - nothing merged.**
- **No PR exists** for `feat/specialists-1c-ui`
  (`gh pr list --head feat/specialists-1c-ui --state all` -> `[]`).

### The three extra worktrees are redundant

`git merge-base --is-ancestor <b> feat/specialists-1c-ui` succeeds for
`feat/specialists-1c-defs`, `feat/specialists-1c-t12` and `feat/specialists-1c-t13`;
`git rev-list --count feat/specialists-1c-ui..<b>` is **0** for all three, and
`git status --porcelain` in `worktrees/specialists-1c-defs`, `-ipc` and `-ui2` is
empty. **Nothing is lost by removing all three** - but do NOT remove
`worktrees/specialists-1c`, which holds the uncommitted work above.

### Task 15 Step 1 was run against the branch, not master - workspace CI is red

`node scripts/audit-anchors.mjs` -> `MECHANICAL PASS: FAILURES`. Of the 18 failing
anchors, **11 are `.claude/rules/native-specialists.md`** pointing at files that
exist only on the unmerged branch (`catalog.ts`, `definition-files.ts`,
`frontmatter.ts`, five tests, plus the `private async mutate` and
`isSubagentDisplayEvent` regexes). Of the 20 missing MAP paths, **14 are the same
1c files**, and all 3 failing rule globs are 1c renderer globs. This has been red
on the daily workspace CI cron since 2026-08-16 and clears itself the moment the
branch merges - but until then it masks any *other* anchor drift.
