---
name: wrap-up
description: End-of-session workspace retrospective — replay what this session actually did (context loaded, searches forced by missing docs, tooling used, wrong turns), then turn that friction into durable workspace improvements. Use whenever Destin says "wrap up", "wrap this up", "close out this session", "let's finish up", "we're done", "anything to improve?", or asks what this session taught us about the workspace. Produces a numbered list with a plain-language why, and lands every item as applied, a ROADMAP entry, or explicitly dropped.
---

# /wrap-up — turn this session into a better workspace

Run this at the end of a working session, before the context is lost. A session is the
only thing that knows where the workspace failed it; once the transcript closes, that
knowledge is gone. Two prior retrospectives proved the failure mode: their findings were
written down, never closed, and independently rediscovered twice.

**This is a PROCESS, not a report generator.** A numbered list nobody actions is the
failure mode, not the output. Every recommendation ends this session as one of three
things: **applied**, **a dated roadmap entry** (`docs/roadmap/<area>.md` — `ROADMAP.md` → "Filing an item"), or **dropped with a reason.**

## Step 0 — ASK about pushing, first thing

**Open the wrap-up by asking Destin "Ready to push?"** — before the retrospective, not
buried at the end of it. Give him three things in one or two lines each:

1. **A yes/no recommendation**, and why.
2. **Whether each branch is actually ready** — does it build, did `scripts/verify.sh`
   pass, has anything about it been proved on a real run, and what is still unverified.
3. **What pushing does and does not do** — pushing is not a PR and not a merge.

He asked for this on 2026-09-03, after a session ended with two finished, verified,
committed branches sitting unpushed on one machine because the skill said "do not push"
and nobody asked. Deciding is his; surfacing the decision is yours. A branch that exists
in exactly one place is the thing wrap-up is supposed to prevent, not produce.

**Then default to: do not merge, do not push, do not open a PR** unless he answers yes. Destin routinely says *wrap
up* or *close out* meaning "do the docs and workspace hygiene" while the branch stays
open — he often has a FRESH session review the PR before he merges, precisely because
the session that wrote the code is the worst reviewer of it. Merge only when he says so
in words, this turn. Never end a turn suggesting it either (`CLAUDE.md` → iteration mode).

**You run the commands, not Destin.** He does not run commands; that is the whole point
of this workspace. Never hand him something to type — run it and act on the output.

```bash
bash scripts/close-out.sh <branch> [<repo>]     # repo: a sub-repo name, or `workspace`
```

Read-only, always exits 0, and it has **two modes** — it checks whether the branch
landed and reports accordingly:

- **Pre-merge** (the common case): it skips branch, worktree and dead-name checks,
  because all three would tell you to delete things still in use. What remains is real:
  is it pushed so someone can review it, and the docs/roadmap/MAP hygiene below.
- **Post-merge:** the full cleanup — delete the remote branch, the local branch, remove
  the worktree, and fix docs that now name a dead branch.

**Finish every line it reports.** A `TODO` is yours to do now. A `--` line is a judgement
the script deliberately refuses to make — make it:

- Close the roadmap item for this work **if the work actually shipped** (delete it from its
  `docs/roadmap/<area>.md`, append one line to `docs/roadmap/shipped.md`, archive its report,
  run `node scripts/roadmap-check.mjs --fix`); if the PR is still open, leave it and say so.
- Does the subsystem have a `docs/MAP.md` row and a hot-path entry? "No rule" is an
  acceptable answer; "no row" is not.
- Move docs whose `status:` is now `shipped` to `docs/archive/`, and repoint cross-links.
- A doc that describes work still in review stays in `docs/active/` — archiving it early
  makes it invisible to the reviewing session.

Skip this step only if the session touched no branch at all.

## Step 1 — replay the session honestly

Answer these for yourself first. Be specific; "the docs were unclear" is not an answer,
"`CLAUDE.md` said X and the code did Y" is.

1. **What context did you load in with?** Which rules fired, which did not and should
   have, what did the session-start hook tell you, what did you have to be told twice?
2. **What did you have to search for or investigate?** Every `rg`/Serena/file-read sweep
   that existed only because something was not written down, or was written down
   somewhere you did not look. Where did you look first, and was the answer there?
3. **What workflows, processes or tooling did you use, and for what purpose?** Include
   the ones you had to reconstruct from memory or from reading `CLAUDE.md` mid-task.
4. **What went wrong, and what would have caught it earlier?** Wrong turns, wasted
   calls, a claim you had to retract, a command that failed because of this environment.

## Step 2 — verify before you recommend

**A recommendation about a document is a claim about that document.** Check it, and paste
what the check returned:

- "`CLAUDE.md` doesn't say X" → `rg -n 'X' CLAUDE.md` before you write it.
- "there's no rule for Y" → `ls .claude/rules/` and `rg -l Y .claude/rules/`.
- "this doc is stale" → verify the claim against the CODE, and cite the verification.

A recommendation built on an unchecked memory of a document is how a workspace acquires
a *wrong* rule, which is worse than a missing one — rules auto-inject and are believed.

## Step 3 — place each finding on the knowledge ladder

`CLAUDE.md` → Where Knowledge Lives ranks these, and the ranking is the recommendation:

**a pinning test > an ast-grep rule > a WHY comment at the edit site > a path-scoped rule
in `.claude/rules/` > the lazy doc the rule points to.**

The top two *execute*; the rest only ask to be read and honored. So:

- Is it a code shape? → an ast-grep rule in `scripts/ast-grep/`, not a sentence.
- Is it mechanically checkable about the workspace itself? → a check in
  `scripts/audit-anchors.mjs` with a unit test, shown red before green.
- Is it a repeated multi-step sequence? → a script in `scripts/`, or a command in
  `.claude/commands/`. A command executes; a paragraph asks to be honored.
- Is it knowledge about specific files? → a **path-scoped** rule, and give it `paths:`
  globs starting `**/` so it fires inside worktrees too.
- Only if none of the above fits does it become prose — and prose goes in the narrowest
  scope that will still be read, never a new always-loaded doc.

**Prefer subtracting.** An improvement that deletes an unread paragraph beats one that
adds a read paragraph. `CLAUDE.md` and `docs/PITFALLS.md` are budgeted for a reason
(`node scripts/audit-anchors.mjs` enforces it).

## Step 4 — the output

A numbered list. For each item, three short lines:

1. **What to change** — the concrete edit, file named.
2. **Why, in plain terms** — one or two sentences, no jargon. What went wrong this
   session that this prevents, and what a future session will experience differently.
3. **Where it lands** — `applied now` / `roadmap` / `dropped: <reason>`.

Order by how much friction it removes, not by how easy it is. Say "nothing worth
changing" if that is the honest answer — a session that found no friction is a real
outcome, and inventing recommendations to fill a list poisons the ones that matter.

## Step 5 — land them

- **Applied now:** make the edit, then run `node scripts/audit-anchors.mjs` yourself
  (budgets and anchors are enforced) plus `node --test scripts/*.test.mjs
  .claude/hooks/*.test.mjs` if you touched either. Never report a change as done on the
  strength of having written it — run the check and quote what it returned.
- **Roadmap:** add an entry to the area file whose `Filing test:` says yes (`ROADMAP.md` →
  "Filing an item"; a symptom in Destin's words, tokens on the last line) — and **dedupe by file or symbol name,
  not by symptom** first; a 2026-08-31 session filed a duplicate by searching `flaky`
  instead of `sync-spaces-engine`.
- **Dropped:** say so in your reply, with the reason. An unrecorded "we considered and
  rejected this" gets rediscovered and re-argued.

Do not open a PR or push as part of this command unless Destin asks — report what
changed and stop.
