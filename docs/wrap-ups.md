# Wrap-up ledger

What each session's `/wrap-up` found, and where it landed. **Newest at the bottom** — read
it with `tail -n 80 docs/wrap-ups.md`, append your entry with `>>`.

It exists because a wrap-up with no memory cannot see recurrence, and recurrence is the
strongest signal in the whole process: a finding that shows up twice means the first fix
was prose that nobody honored. `/audit` has had a paper trail in `docs/audits/` since
2026-04; this is the same thing for the half of the job only a live session can do.

One entry per session, kept to a handful of lines:

```
## YYYY-MM-DD — what the session was doing (branch, or "no branch")
- <finding, one line> → applied: <file> | roadmap: <area file> | dropped: <reason>  [cost, if measured]
- deleted/merged: <what got smaller>, or "none found"
```

Do not edit past entries. A finding that recurs gets a NEW line saying so, on the day it
recurred — the repetition is the data.

---

## 2026-09-05 — reviewed the wrap-up skill itself (chore/wrap-up-retrospective-first)
- Wrap-up had no memory of itself: could not see whether past findings landed, or recurred → applied: `docs/wrap-ups.md` (this file), read at Step 1
- Replay questions only asked about Claude's friction, never about product intent Destin voiced mid-session → applied: fifth replay question in `SKILL.md`
- Findings were ranked by feel because nothing was ever counted → applied: "quantify or qualify where you honestly can" in `SKILL.md`
- "Prefer subtracting" was a preference with no mechanism; instruction files kept growing → applied: each wrap-up must name one deletion or say it found none
- Push/close-out ran first and ate the attention the retrospective needed → applied: retrospective is now Steps 1–5, push/close-out is Step 6
- Retrospective edits had no stated home, so they risked a separate branch → applied: Step 5 lands them on the session's own branch
- Cross-repo sweep pushed other sessions' branches to public repos without a secrets scan → applied: scan now explicitly covers swept branches
- Goals were implicit; the two that matter (fewer tokens next session, more automation + preferences captured once) were never stated → applied: "What better means here" section
- Roadmap entries filed by wrap-up are not tagged, so the next wrap-up cannot check whether they moved → dropped: Destin deferred; revisit once the ledger has run a few sessions
- deleted/merged: `SKILL.md` narrative trimmed hard enough to absorb a new section, a new step and a fifth question and still come out smaller — 1504 → 1492 words

## 2026-09-05 — guidance cleanup (session/guidance-serena-cleanup)
- Native path-rule support was initially uncertain from static guidance; source inspection confirmed it, but delivery follows the tool step → applied: accurate wording in CLAUDE/MAP; roadmap: first-write timing, hook compatibility and runtime capability facts in native-harness.
- Retired checkout-pinned search setup competed with the isolated-worktree rule → applied on branch: empty workspace MCP registry, removed app index config, branch-local search guidance and CI regression test; live/shared registration deliberately untouched.
- Always-loaded recipes and incident narratives crowded out core guidance → applied: CLAUDE.md 6,186 → 1,985 whitespace-delimited words; detailed recipes moved to docs/workspace-workflows.md. Existing approval/verification gates retained.
- Instruction provenance overlaps an existing context-and-knowledge idea → roadmap: expanded that item rather than creating a second project. Full workflow/skill routing consolidation deferred in dev-workspace.
- A helper stopped on provider credit limits; work continued directly. Runtime also refused simultaneous write-capable helpers → applied: qualify parallelism by available runtime support rather than assuming it.
- Roadmap validator downgraded stale workbench-sync and file-chip claims to needs-verify; no product fix claimed. Full anchor audit is blocked by absent sibling component repos; desktop verify and focused workspace tests passed.
- Close-out mistook the untouched branch tip's ancestry for completed work despite uncommitted edits → roadmap: dev-workspace. Its deletion suggestions were not followed; these worktrees hold the actual changes.
- deleted/merged: retired setup instructions and active handoff removed from current guidance; historical handoff archived with its unresolved ideas preserved in the roadmap. No global cache deletion, live-app changes or runtime implementation.

## 2026-09-05 — competitive review of the native prompt, then shipped it (feat/prompt-doctrine, feat/prompt-capability, feat/prompt-plain-language)
- Paid for an 8-cell before/after eval at one run per arm, reported the gap as a finding, retracted it when a re-run of the SAME builds swung 2-3 points on the same judged items → applied: `harness-eval.mjs` warns at the estimate when a ≥2-arm plan has `repeats: 1`, guard `harness-eval-comparison-noise.test.ts`  [$1.90 spent, one wrong conclusion Destin acted on]
- `builds` (the code-version axis) had no worked example and no key-file guidance; learned it from `matrix.ts` source and searched five places for a key that does not exist → applied: `prompt-doctrine.json` committed as the example, three bullets in `.claude/rules/harness-evaluator.md`  [~10 tool calls + one blocked turn]
- Built two review surfaces Destin rejected (a card matrix, then an 11k-word reading page — "a fuck ton of poorly formatted text") before the workbench landed. `feedback-review-page-format` already recorded that a prose page and a card board were rejected for UI reviews; nobody had generalised it beyond UI → applied: `~/system/me/README.md`  [2 build/screenshot/commit cycles, 2 rounds of his time]
- Rebuilt the question deck's loopback answer server because its spec has no diff card → roadmap: `docs/roadmap/dev-workspace.md` (rigs)
- Edited the roadmap in the shared stale checkout first, hit another session's already-fixed error, spent ~6 calls diagnosing it. RECURRENCE: `CLAUDE.md` warns about this explicitly → dropped: a hook blocking edits (not commits) in the shared checkout would break legitimate work by other sessions; the pre-commit hook already catches the commit
- His "a closing offer to act is good behaviour" contradicted the eval rubric that scored it as padding → applied: `prose-rubric.ts` carve-out, so the case stops arguing against a shipped intention
- Clickable URLs in chat: he asked for a handoff mid-session, a fresh session built and merged `markdown-linkify.ts` before this one ended → nothing to file; the handoff worked
- deleted/merged: `.claude/rules/harness-evaluator.md` went 778 → 547 words — three invariants about *changing* the evaluator moved into the depth doc it already points at, leaving the rule to cover *running* one
- Ran `audit-anchors.mjs` in the shared checkout and got two failures that were both already FIXED upstream (a doc reported as living in active AND archive; a word-budget violation) — spent calls on each before checking against `origin/master`. RECURRENCE of the stale-checkout trap, twice in one session → applied: the auditor now prints how many commits behind the checkout is, before its findings

## 2026-09-05 — the helpers chip counts Claude Code subagents (session/cc-subagent-chip)
- Shipped the whole feature — renderer edits, a new test, a review deck — with ZERO path-scoped rules loaded, because reading/editing via shell `cat`/`sed`/heredocs never triggers them → applied: the measured reason next to CLAUDE.md's existing "prefer dedicated file tools"; roadmap: `docs/roadmap/dev-workspace.md` (a hook could name the rule that did not load)  [6 rules matched my edits, 0 fired — counted in `~/.claude/instructions-loaded.log`]
- Copied `probe: false` into a new review plan from an existing one, which switched off the painted-pixel contrast probe; `contrast.md` came out EMPTY and I read that as "no data" rather than "you turned it off" → applied: `contrast-report.mjs` now states what it checked, `contrast-report.test.mjs` pins it (red before green), `probe` dropped from `plans/cc-subagents.json`  [4 extra six-theme sweeps + 2 hand-rolled pixel scripts to measure a failure the rig gives free; I also stated wrong ratios mid-turn and retracted them]
- `UI_REVIEW_PLANS=<name>` naming a plan absent from that checkout's `plans/` selected nothing and the sweep still printed "0 covered · 0 partial · 0 missed" and exited 0 — a clean bill for a run that screenshotted nothing → applied: `run-review.sh` exits 2 and lists the available plans  [1 wasted sweep]
- Destin: "why is working blue? should be green" — the app HAS one status-colour vocabulary (`StatusDot.tsx` STATUS_LABEL) and nothing pointed other surfaces at it, so the specialists popup shipped saying the opposite of the session pills → applied: `.claude/rules/react-renderer.md`, with the contrast half (a fixed status colour must never be the word) and its measured ratios
- Wrote a new review plan into the SHARED checkout, and the deck folder into `youcoded/desktop/docs/`, both from cwd drift with relative paths. RECURRENCE: the stale/shared-checkout trap is already in this ledger twice from 2026-09-05 → dropped: both were caught and moved within a call; the pre-commit hook is the real backstop and it held
- Reconstructed the deck spec format from `spec.py`/`crops.py`/`boxes.py` + an example deck → dropped: `.claude/rules/review-deck.md` already exists on the unmerged `feat/deck-consistency` branch, with an `AUTHORING.md`. Filing it again would duplicate in-flight work
- Windows CI was already red on master before this branch (`runtime-default.test.tsx` compared `join()` paths to forward-slash literals); a second Windows run then flaked on `chatgpt-auth.test.ts` and passed on re-run → applied: the separator fix, on the feature branch; roadmap: `docs/roadmap/dev-workspace.md` for the flake
- Claimed the ≤600-word rule budget was an unenforced convention and shipped `react-renderer.md` over it. It is enforced, and CI failed — I had run the auditor locally but filtered its output to two lines and never saw the budget line. RECURRENCE of `feedback-read-check-output-before-merging` → applied: the rule's status-colour detail moved to `youcoded/docs/renderer-chrome.md`, leaving a pointer
- deleted/merged: `react-renderer.md`'s whole "UI iteration tooling" section — CLAUDE.md carries it (twice) and points BACK at this rule, and `docs/workspace-workflows.md` carries the full version. The rule ends at 582 words, 14 BELOW the 596 it started at, having gained a new invariant
- Master went red twice under me from other sessions' pushes: a Windows path-separator bug in a source guard, and two roadmap entries using a `local-models` token that is not one of the 29 surfaces → applied: both fixed, each in its own commit saying it was not this branch's work
