---
name: wrap-up
description: End-of-session workspace retrospective — replay what this session actually did (context loaded, searches forced by missing docs, tooling used, wrong turns, what Destin said he wants), turn that friction into durable workspace improvements, then push and ask about merging. Use whenever Destin says "wrap up", "wrap this up", "close out this session", "let's finish up", "we're done", "anything to improve?", or asks what this session taught us about the workspace. Every finding ends the session applied, filed as a dated roadmap entry, or explicitly dropped.
---

# /wrap-up — turn this session into a better workspace

A session is the only thing that knows where the workspace failed it; once the transcript
closes, that knowledge is gone. Two prior retrospectives proved the failure mode: findings
written down, never closed, rediscovered twice.

**This is a PROCESS, not a report generator.** Every recommendation ends this session
**applied**, **a dated roadmap entry** (`docs/roadmap/<area>.md` — `ROADMAP.md` → "Filing
an item"), or **dropped with a reason**.

Retrospective first, while the session is fresh. Pushing and closing out (Step 6) is a
checklist that survives a tired session; honest self-replay is not.

## What "better" means here

Two goals. Rank findings by how much they serve these, and name which one each serves.

1. **The next session spends fewer tokens reaching the same place.** Every sweep, `rg`,
   file read and wrong turn this session made because something was unwritten — or written
   where you did not look — is the raw material. A finding that does not reduce future
   exploration is probably not worth the words it costs.
2. **More of the work happens without a session deciding to do it, and what Destin wants
   is written down once.** A check, script, hook or test executes; a paragraph only asks
   to be honored. A preference he had to state twice is a defect, not a note.

**Quantify or qualify each finding where you honestly can** — wasted calls, minutes,
tokens, repeat sessions. Never invent one. A real number is what makes findings rankable.

**Prefer subtracting.** Deleting an unread paragraph beats adding a read one, and
consolidating overlapping tooling or docs beats adding beside them. Each wrap-up names one
thing it deleted or merged — or says plainly it looked and found none.

## Step 1 — read the ledger, then replay this session

```bash
tail -n 80 docs/wrap-ups.md      # what recent sessions found, and where it landed
```

**A finding already in there is the important one.** Recurrence means the previous fix did
not execute — do not re-file it, move it UP the ladder in Step 3 and say that it recurred.

Then answer these. Be specific: "the docs were unclear" is not an answer, "`CLAUDE.md` said
X and the code did Y" is.

1. **What context did you load in with?** Which rules fired, which should have and did not,
   what did the session-start hook tell you, what did you have to be told twice?
2. **What did you have to search for?** Every sweep that existed only because something was
   unwritten, or written somewhere you did not look. Where did you look first?
3. **What tooling did you use, and for what?** Including anything reconstructed from memory
   or from reading `CLAUDE.md` mid-task.
4. **What went wrong, and what would have caught it earlier?** Wrong turns, wasted calls, a
   claim you retracted, a command that failed because of this environment.
5. **What did Destin say that is filed nowhere?** Product ideas, priorities, a reaction to a
   design, "next time do X" — these leak exactly like findings do; five of his ideas once sat
   unpushed on one machine. A preference goes to `~/system/` or a rule; a product idea to
   `docs/roadmap/<area>.md`, in his words, this session.

## Step 2 — verify before you recommend

**A recommendation about a document is a claim about that document.** Check it, paste what
the check returned: "`CLAUDE.md` doesn't say X" → `rg -n 'X' CLAUDE.md` first; "there's no
rule for Y" → `ls .claude/rules/` and `rg -l Y .claude/rules/`; "this doc is stale" → verify
against the CODE and cite it.

An unchecked memory of a document is how a workspace acquires a *wrong* rule, which is worse
than a missing one — rules auto-inject and are believed.

## Step 3 — place each finding on the knowledge ladder

**a pinning test > an ast-grep rule > a WHY comment at the edit site > a path-scoped rule in
`.claude/rules/` > the lazy doc the rule points to.** The top two execute; the rest ask.

- A code shape? → an ast-grep rule in `scripts/ast-grep/`, not a sentence.
- Mechanically checkable about the workspace itself? → a check in
  `scripts/audit-anchors.mjs` with a unit test, shown red before green.
- A repeated multi-step sequence? → a script in `scripts/`, or a command in
  `.claude/commands/`. A command executes; a paragraph asks.
- Knowledge about specific files? → a **path-scoped** rule, `paths:` globs starting `**/`
  so it fires inside worktrees.
- Something Destin wants everywhere? → `~/system/global.md` or `~/system/me/`, not memory.
- Only if none fit does it become prose, in the narrowest scope still read — never a new
  always-loaded doc.

## Step 4 — the output

A numbered list, ordered by friction removed. Per item, three short lines:

1. **What to change** — the concrete edit, file named.
2. **Why, in plain terms** — no jargon: what went wrong this session, what a future session
   will experience differently, and the cost where you measured it.
3. **Where it lands** — `applied now` / `roadmap` / `dropped: <reason>`.

Say "nothing worth changing" when that is honest — inventing recommendations to fill a list
poisons the ones that matter. A short session can end here.

## Step 5 — land them, on the session's branch

Retrospective edits ship WITH the work, so everything pushes and merges together:

- Sub-repo edits (a pinning test, an ast-grep rule, a WHY comment) → the session's feature
  branch in that repo.
- Workspace edits (rules, scripts, `docs/`, roadmap, this skill) → the session's workspace
  branch, or one worktree off `origin/master` if it has none. **Never commit in the shared
  `youcoded-dev` checkout — a pre-commit hook refuses it.**

Then:

- **Applied:** make the edit, then run `node scripts/audit-anchors.mjs` (budgets and anchors
  are enforced) plus `node --test scripts/*.test.mjs .claude/hooks/*.test.mjs` if you touched
  either. Never report a change as done on the strength of having written it — quote what
  the check returned.
- **Roadmap:** the area file whose `Filing test:` says yes; **dedupe by file or symbol name,
  not by symptom** — searching `flaky` instead of `sync-spaces-engine` filed a duplicate.
- **Dropped:** say so in your reply, with the reason. An unrecorded rejection gets re-argued.
- **Always:** append this session's entry to `docs/wrap-ups.md` — its header explains the
  format. That file is Step 1 for the next session; skipping it is how the same friction
  gets rediscovered.

## Step 6 — push everything, then ask about merging

**Push every branch this session touched. Do not ask.** A push is a backup, not a release:
it ships nothing, and `git push -d` undoes it. An unpushed branch is the only state where
work can actually be lost.

Then sweep for anything else local-only — other sessions leave branches behind, and one
sweep found seven across four repos:

```bash
for r in . youcoded youcoded-core youcoded-admin wecoded-themes wecoded-marketplace; do
  git -C "$r" fetch -q origin
  git -C "$r" for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads
done          # anything with no upstream, or [ahead N], needs pushing
```

**Secrets-scan any branch before its first push to a PUBLIC repo — including swept ones you
never read.** `youcoded` and `youcoded-dev` are public; `youcoded-admin` is not.

Then run the close-out check per branch — read-only, always exits 0, and it detects whether
the branch landed and checks accordingly:

```bash
bash scripts/close-out.sh <branch> [<repo>]     # repo: a sub-repo name, or `workspace`
```

**Finish every line it reports.** A `TODO` is yours to do now. A `--` line is a judgement it
deliberately refuses to make — make it: close the roadmap item **if the work actually
shipped** (delete it from its area file, one line in `docs/roadmap/shipped.md`, archive its
report, `node scripts/roadmap-check.mjs --fix`); give the subsystem a `docs/MAP.md` row
("no rule" is an answer, "no row" is not); move `status: shipped` docs to `docs/archive/`
and repoint cross-links — but a doc describing work still in review stays in `docs/active/`,
or it goes invisible to the reviewing session.

**Then ask Destin one question: "Ready to merge?"** With a recommendation and, per branch,
what is actually proven — did `scripts/verify.sh` pass, has any of it run for real, what is
unverified. **Default to NOT merging** unless he says yes; he decides. Never end a turn
suggesting a merge (`CLAUDE.md` → iteration mode), and do not open a PR unless he asks.

**You run the commands, not Destin.** Never end a turn handing him something to type.
