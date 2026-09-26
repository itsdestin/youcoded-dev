---
date: 2026-09-26
status: active
type: handoff
topic: specialists stage two — plans (spending rework, stage 1 of 3)
branch: feat/specialists-plans-ui
---

# Specialists plans — START HERE

Read this before touching anything. It assumes no prior context. Rewritten 2026-09-26; the
2026-09-19 version described a budget system that no longer exists.

## What the feature is

The assistant proposes a **plan**: steps run by specialists (child AI sessions), as structured data.
The user sees a card in the chat, approves it, and the app runs it — waves of specialists, pausing
and resuming safely, surviving a restart.

## Where it lives

| What | Where |
|---|---|
| App branch | `feat/specialists-plans-ui` (youcoded repo), worktree `worktrees/specialists-plans` |
| Docs branch | `docs/specialists-plans-decisions` (youcoded-dev), worktree `worktrees/specialists-plans-decisions` |
| **Decision log (read first)** | `docs/active/design/2026-09-05-specialists-plans/decision-log.md` — decisions 1–40; 33–40 are this stage |
| Stage-1 backend design | `docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md` (+ Revisions 1–3 at its end) |
| Reviews (all triaged) | `docs/active/reviews/2026-09-24-plans-spending-*.md` (design ×3, T1–T6, whole-branch code review, UX run 1) |
| Old contract (83 rows, UNSIGNED, pre-dates stage 1) | `…/2026-09-05-specialists-plans/specialists-plans.contract.json` |
| The card | `desktop/src/renderer/components/plans/PlanCard.tsx` |
| Grammar | `desktop/src/main/harness/plans/schema.ts` + `validator.ts` |
| Spend | `plans/plan-spend.ts`, `pricing.ts` (`billedEquivalentTokens`), hooks in `harness-session.ts` |
| Estimate | `plans/specialist-usage-history.ts`, `plans/plan-estimate.ts` |
| Executor / service / host | `plans/plan-executor.ts`, `plans/plan-service.ts`, `plans/plan-host-bridge.ts`, `native-session-host.ts` |

## Stage 1 — the spending rework (BUILT, reviewed, cost-audited; not yet signed off)

Destin's problem (2026-09-19): every specialist hit its per-step budget almost immediately, even on
simple web searches; Add budget re-hit the same limit and froze the window. His rulings:

- **No per-step budgets; no limit by default** (decision 34). `budget_tokens` left the grammar.
- **Estimate** on the proposed card from his past specialist runs: "Usually $0.40–$2"; unpriced →
  "About 300k tokens · included in your ChatGPT plan / runs on your computer" (34 Q-4/Q-5).
- **Live spend** "Spent $X" (of $Y if a limit is set) beside Stop the plan — same number as the
  conversation's cost chip (one `PlanSpend` object feeds both; design Revision 3 F1).
- **Plan settings popup** (gear; titled with the plan's name, styled like ModelPickerPopup):
  optional whole-plan limit (dollars; tokens when unpriced) + each step's model (35, 37).
  Models default to the specialist type's default; the assistant sets `model` only on explicit
  user direction; the user can change steps that haven't started.
- **At the limit**: pauses once, "Reached your $X limit." with Stop · Continue; Continue opens
  "$ [box] Continue ×" and calls `resume(limit)` atomically (34 Q-2, 37). No Add budget anywhere.
- **Auto-start** = "when the estimate is under $X" (dollars; unpriced plans never auto-start).
- The setup-cost probe (`resolveManifest` building a session per specialist — suspected cause of
  the Add budget freeze and slow Continue) is **gone**; approve/continue do only identity checks.
- **Assistant notices** (38): on approval it replies with a one-line confirmation and may do other
  work if asked; on completion it receives the final step's reports and presents the result.
- **Combine/verify `of` accepts several steps** ("← from steps 1, 2 and 3"); guidance says
  independent work goes in ONE split step (39). Destin's rerun confirmed: parallel, and the
  combiner got all reports.
- Local-engine plan specialists run one at a time (shared context pool).

Verified: full desktop suite green (~14k), Android `./gradlew test -x bundleWebUi` 954 green at
T7, and an independent literal-dollar audit (`tests/plan-cost-audit*.test.*`) — 7 scenarios pass,
real-data token cross-check within ≤4 tokens of 103k (per-request ceiling vs per-turn sum). One
ast-grep check (`app-prompt-show-starts-only-on-ready`) fails only because master added its guard
AFTER this branch's last master merge — clears on the next catch-up.

## Next session's job (in order)

1. **Catch up with master.** The branch already contains a master MERGE (`ce2f500a6`), so bring
   master in with another merge (the same way), not a rebase — rebasing would replay ~150 commits
   across that merge. ~143 master commits behind as of 2026-09-26. Then `scripts/verify.sh`.
2. **One clickable UI deck** of every new/changed UI surface (decision 40: "a deck with like the
   click throughable like full UI elements") — a **Live** deck of real workbench panes, not
   screenshots, Before/After where a Before exists. Surfaces: proposed card (estimate line, gear;
   priced / ChatGPT / local; heavy fixture), Plan settings popup (limit off/on, low-limit warning,
   step models, started-step locked), running card (Spent $X / of $Y / tokens), paused at limit +
   Continue box, completed card with assistant completion reply, "← from steps 1, 2 and 3",
   Settings → Specialists auto-start row. Fixtures: `desktop/src/renderer/dev/workbench/fixtures/bubbles/plan-*`.
3. **Explain the logic and user flows** the branch created or changed — in plain words for Destin
   (propose → settings → approve → confirm line → run → spend → limit pause → Continue → complete
   → result; Stop; restart/recovery; auto-start; estimate source; what the assistant is told).
4. **After his feedback:** implement changes, then a FRESH independent correctness/bug review of the
   whole branch (code reviewer brief `scripts/ui-review/code-reviewer.md`), fix, verify.

Later, not this job: sign-off (the contract needs rewriting for decisions 33–40 before Destin signs;
a fresh grader; acceptance) and his merge call. Stage 2 (coordinator step that can rewrite later
steps, asking again only when the plan grows — decisions 35–36) and stage 3 (parallel builders in
separate project copies; saved plans) are agreed, not started.

## Open questions for Destin (built with the recommended default)

- Change a step's model while the plan runs? — built: only steps not yet started.
- Auto-start plans with no dollar price? — built: never.
- Did he ask for "GPT-6-Sol" on the first test plan's last step, or did the assistant pick it?

## Standing constraints

Never touch Destin's live built app — dev instances only (`bash scripts/run-dev.sh --path
worktrees/specialists-plans --label "Plans spending" --profile plansdev`; plans there use REAL
models and create real conversations). No `npm install`/`npm ci` (hardlinked node_modules). Stage
explicit paths. Never merge or suggest merging. A failing/flaky test is fixed when found. Several
concurrent capture tools use the default CDP port 9978 — pass `CDP_PORT=<unique>` to `shot.mjs`.
