---
status: partly applied 2026-07-28 — Proposals 1 and 2 done; 3, 4 and 5 STILL OPEN and untracked (re-verified 2026-08-26)
scope: workspace conventions (CLAUDE.md, .claude/rules/, scripts/)
source: the menu-internals session, 2026-07-26 → 2026-07-28 (26 commits, PR #264)
---

# What went wrong this session, and what would have stopped it

> **Applied 2026-07-28.** Proposal 2 (shared guard scope + non-vacuity helpers) shipped as
> `desktop/tests/helpers/guard-scope.ts` — PR #267. Proposal 1 was folded into the EXISTING
> `CLAUDE.md` rule rather than added beside it, because three overlapping rules on search discipline
> already existed and length is part of why the first one got skimmed.
>
> **Still open: Proposals 3 (spec counts anchored or dated), 4 (staging hygiene) and 5
> (`run-dev.sh --list`).**
>
> **Re-verified 2026-08-26, 29 days on — all three are still unapplied, and none is on `ROADMAP.md`.**
> - Proposal 3: `grep -n "Re-measure|dated observation|stale by construction" CLAUDE.md
>   .claude/rules/*.md` → no match. The `verify:` anchor mechanism exists but the convention was
>   never extended to spec counts.
> - Proposal 4: `grep -n "git add -A|git add \.|Stage explicit paths" CLAUDE.md` → no match.
>   Neither staging line reached Working Rules.
> - Proposal 5: `scripts/run-dev.sh` still documents `--list` as "List registered worktrees (path +
>   branch)"; `grep -n "lsof|pgrep|ps -" scripts/run-dev.sh` → no match, so it still cannot show
>   what is *running*.
> - Section 4's five authoring papercuts never reached `docs/PITFALLS.md` either
>   (`grep -ni "papercut|heredoc|JSX comment" docs/PITFALLS.md` → no match).
> - **Nothing in the workspace references this document** (`rg -l
>   2026-07-28-session-retrospective-guardrails --glob '*.md'` → only itself), which is exactly the
>   invisibility that keeps these open.

Every item below is a real mistake from this session, not a hypothetical. The point of writing them
down together is that **seven of them are the same mistake**, and the workspace already has a rule
against it that did not work.

---

## 1. The dominant failure: claims made by reading instead of by counting

### What happened, seven times

| # | Claim | Reality |
|---|---|---|
| 1 | `SyncPanel` and `QuickChips` are "anchored popovers positioned against a trigger" | Both were centered modals — their `style` objects said `top:50%, left:50%, transform:translate(-50%,-50%)`. I read the `className` and stopped. |
| 2 | The dialog adoption guard covers the settings family | It globbed `components/*.tsx`, so it could not see `App.tsx` or **any** subdirectory. Five dialogs were hidden from it. |
| 3 | K6's exemptions are `QuickChips` and `RemoteUnsupportedNotice` | Wrong in **both** directions — `QuickChips` had no glyph at all, `RemoteUnsupportedNotice` needed migrating. |
| 4 | The K4 guard covers every callout surface | It required the tint to appear *before* `border`, so it scored `Button.tsx` as zero. That recipe reads `border border-destructive/50 … hover:bg-destructive/10`. |
| 5 | "Three main views still paint their own headers" | Six. |
| 6 | The dialog inventory is N dialogs | Miscounted twice — first by including `.test.tsx` files, then by counting `<Dialog>` inside comments I had written myself. |
| 7 | `SessionDrawer` is an exempt hand-rolled header | Its headers use `px-3 py-2`; the guard's recipe never matched them. An exemption for something the guard cannot see reads as coverage while providing none. |

### Why the existing rule did not catch it

`CLAUDE.md` already says **"Never assert a negative from a single search"**, at length, with two worked
examples. It is a good rule and it did not fire, for two reasons:

1. **Most of these are not negatives.** "Three views", "QuickChips is a popover", "the guard covers
   the family" are *positive* claims. The rule's title does not obviously reach them, and in the
   moment it did not.
2. **It is a prohibition with no procedure.** It says what not to do. It does not say what to do
   instead, so under time pressure the default (read, then assert) wins.

### What actually worked

Every single time I wrote a **counting script first and let it disagree with me**, it found more than
I had:

- The K4 guard found `Button.tsx` plus two tones the spec could not express.
- The K6 guard found a hand-rolled row in `AccountSection` that a `justify-between` survey had missed.
- The chrome guard confirmed six headers where I had said three.

That is the highest-leverage change available, and it is a procedure rather than a prohibition.

### Proposal 1 — replace the prohibition with a procedure

Rewrite the `CLAUDE.md` rule as:

> **A number is a command's output, not a recollection.**
>
> Any claim containing a count, the word "only", "every", "no longer", or a named exemption must come
> from a command run in this session whose output you can paste. Not from reading files, not from
> memory, not from a previous message — including your own.
>
> Write the command before the claim. If its output surprises you, the output is right.
>
> This binds hardest at the moment a claim becomes durable — a commit message, a PR body, a
> `ROADMAP` entry, an exemption list — because loose talk mid-investigation is self-correcting and a
> wrong claim in a durable place outlives the session.

Keep the existing negative-assertion text; this generalises it rather than replacing it.

### Proposal 2 — every guard must prove it is not vacuous

Failures 2, 4 and 7 were all guards that passed while covering nothing. Add to
`.claude/rules/README.md`:

> A new source-text guard must demonstrate it can see. Either assert a known-positive alongside the
> ban (the K7 guard matches a `<kbd>` carrying the field surface and correctly rejects it), or assert
> the size of what it scanned (`expect(files.length).toBeGreaterThan(80)`).
>
> A guard whose scope is a glob must state which directories that glob **cannot** reach.

---

## 2. The spec was authoritative and stale, four times

`docs/archive/specs/2026-07-26-menu-internals-design-system.md` asserted:

- `SettingsPopup` "is already correct" — it was the source of the scroll bug.
- The width ladder — circular, fitted to values that were themselves arbitrary.
- `max-h-[80vh]` — the wrong unit entirely.
- K12 "retires 5 mechanisms" — four already shared one renderer before the tranche started.
- K11 "retires 3 conventions" — nothing independent was left.
- K4 "3 geometries" and K6 "the last bare ✕" — both undercounts.

The spec's own §0 already recorded that **three of its numbers had been corrected once**. It happened
again anyway, because a corrected count is still a dated observation and nothing marked it as one.

### Proposal 3 — counts in specs are dated observations, or they are anchored

The mechanism already exists: `.claude/rules/README.md` documents `verify:` anchors, and
`scripts/audit-anchors.mjs` harvests them from `docs/`. Extend the convention:

> A count in a spec is either
> - **anchored** — `<!-- verify: {"path": "...", "contains": "..."} -->`, so `/audit` re-checks it, or
> - **dated inline** — "78 sites *(measured 2026-07-26)*".
>
> A bare number in a spec is read as a fact and will be trusted long after it stops being true.

And a line in `CLAUDE.md`:

> **Re-measure before you trust a spec's numbers.** Specs are written against a snapshot. If a tranche
> has shipped since, the counts are stale by construction — and stale in both directions, because
> work lands and scope grows.

---

## 3. Staging and push hygiene

Two real incidents:

- `git add -A docs/` swept in **another session's untracked file**
  (`2026-07-28-agent-harness-frontier-research.md`). Backed out with `git rm --cached` + `--amend`.
- `git push origin master` carried up **another session's local commit** (`d6bcdd8`). It was already
  on master and pushing it was the normal completion, but I did not know I was doing it.

### Proposal 4 — two lines in `CLAUDE.md` → Working Rules

> **Stage explicit paths. Never `git add -A`, `git add .`, or `git add <dir>/`.** Other sessions have
> uncommitted work in the same tree, and a directory add cannot tell your files from theirs.
>
> **Before pushing to master, run `git log --oneline origin/master..master` and confirm every commit
> is yours.** Concurrent sessions commit locally; your push publishes theirs too.

---

## 4. Small papercuts worth one line each

| What bit | Fix |
|---|---|
| Backticks in a `git commit -F -` heredoc were shell-interpreted (zsh), silently emptying part of the message | Always `<<'EOF'` (quoted), never `<<EOF` |
| A `{/* JSX comment */}` in an expression position (`{cond && (` … `)}`) is a syntax error | Use `/* */` there; `{/* */}` only where JSX children go |
| `&#9888;` in a **string prop** renders literally — entities only decode in JSX text | Use the character, or drop it |
| `<div>` inside my `<p>` body slot — invalid HTML the browser repairs by closing the paragraph early | Block-capable slots are `<div>` |
| Tailwind arbitrary values written through a Python escape (`content-['•']`) reach the file as literal `•` | Write the character |

These belong in `docs/PITFALLS.md` under a short "authoring papercuts" section, not in `CLAUDE.md`.

---

## 5. Concurrency: dev servers and worktrees

`run-dev.sh` has `--offset` and `--profile` precisely so instances coexist, and the rule to use them
is in `CLAUDE.md`. What is missing is discovery: this session found port 5223 held by the `plan-c`
worktree only by running `ss -ltnp` and reading `/proc/<pid>/cwd`.

### Proposal 5 — make `run-dev.sh --list` show what is *running*, not just what is registered

A line per live instance — worktree, offset, profile, PID — so a session can pick a free offset
without process forensics, and knows whose window it is about to collide with.

---

## 6. What is already working and should not change

Worth stating, because the list above is all failures:

- **Named exemptions with counts, never silent skips.** Every guard this session records what it
  excludes and why, as a per-file *count*. That turned three separate backlogs (the v1.3.1 error
  audit, surviving `#DD4444`, K5 candidates elsewhere) into live numbers that can shrink and never
  grow. This is the single best convention in the workspace.
- **`stripComments()` in every source-text guard.** Mandatory because WHY comments quote the idiom
  they replaced — a guard reading raw text fails on the explanation of its own fix.
- **WHY comments at the edit site.** Several times this session the comment left by an earlier tranche
  was the only reason a decision was not silently undone.
- **The knowledge hierarchy** (pinning test > WHY comment > path-scoped rule > lazy doc). The reason
  this session's lessons are mostly *tests* rather than prose is that the hierarchy says so.

---

## Ranked by leverage

1. **Proposal 1** — a number is a command's output. Seven of this session's mistakes; nothing else comes close.
2. **Proposal 2** — guards prove non-vacuity. Three of the seven were guards that passed while blind.
3. **Proposal 3** — spec counts are anchored or dated. Four wrong beliefs, each costing a re-derivation.
4. **Proposal 4** — staging hygiene. Two incidents, both recoverable, both avoidable.
5. **Proposal 5** — `--list` shows running instances. Minor, but pure friction.
