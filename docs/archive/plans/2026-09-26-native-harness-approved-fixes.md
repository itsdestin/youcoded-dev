---
status: shipped
---

# Approved native harness fixes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute the linked tasks with review checkpoints. Checkboxes describe work still to perform unless marked complete.

**Goal:** implement the user's approved native harness reliability and instruction-loading changes while keeping one simple queued-send flow and excluding denied/unapproved work.

**Architecture:** preserve the host-owned FIFO, fixed system prompt, grouped tool-call/results, lease-owned MCP connections and shared renderer. Add safe in-turn receipt of ordinary queued input; reuse a paired-result boundary for permission failures and first-write instruction replanning. Keep instruction-file ancestry and project-rule ancestry distinct, and retain subprocess/connection generation ownership until cleanup.

**Tech stack:** existing TypeScript/Node/Electron runtime, React shared renderer, AI SDK, Zod and Vitest. No new paid service, live integration change or dependency is assumed.

## Authority and current state

- Session branch in workspace and app: `session/native-harness-audit-20260926`.
- Workspace: `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926`.
- App worktree: `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded`.
- Audited and still-current app revision: `6c4411faa66fcf000b0d5e711ba095c0aa20be6d`.
- Decisions: `docs/archive/design/2026-09-26-native-harness/native-harness.decisions.md`.
- Contract: `docs/archive/design/2026-09-26-native-harness/native-harness.contract.json`, drafted by a fresh contract agent from the submitted decks and the two explicit direct-user amendments. **Not yet signed. Production edits wait for that sign-off.**
- Existing probe files assert observed defects. They are not implementations or desired-behavior regressions. The recorded backend/UI/probe results describe the audit baseline, not a completed fix.

## Authorized behavior constraints

1. **One normal send flow:** submitted input appears queued and is delivered automatically at the earliest safe boundary. No separate After this finishes option, steering picker, urgent send action, new status mode, automatic background-on-send or implicit permission answer.
2. Running work is not interrupted solely because a message arrives. Stop keeps submitted messages eligible for delivery; existing background survival policy remains.
3. Instruction FILES: all ancestors from filesystem root to cwd, one preferred AGENTS.md or fallback CLAUDE.md per folder, broadest first. No new dedicated personal-global directories or import expansion.
4. Project RULES: inherit applicable path-scoped rules from the nearest Git project root through cwd, including narrowed specialists; owner-relative globs. No new personal/global/cross-project/eager-rule policy.
5. Newly applicable rules must be seen by a NEW model request before the first Write/Edit they govern. Appending rules after argument generation and immediately executing those old arguments does not satisfy approval.
6. Graceful process termination keeps the existing two-second grace and targets only the verified owned group; deliberately detached programs remain outside the guarantee.
7. Updated MCP settings affect NEW acquisitions; existing sessions retain their leases. No mutation of active user registry/credential files as a test.
8. Preserve the question-card look and ordinary Claude Code compatibility; fix native per-question identity rather than redesigning the card.

## Explicit exclusions

- **Denied Q-10 / F07:** stale credential-bearing Claude Code MCP projection cleanup. No implementation of that behavior in `mcp-reconciler.ts`.
- F14 option-label comma provenance and F15 nested grant-width buttons were not selected. Do not add them as drive-by repairs.
- R01 teardown/send race, R02 model-switch race, R03 grant/revoke ordering, R04 underlying MCP timeout cleanup, R05 unreadable instruction fallback, and the background report at-most-once-attempt tradeoff were not approved as additional fixes. If an approved change exposes a genuine prerequisite, report the specific dependency before expanding product scope.
- No commits, pushes, merge, release, live-app experiment or paid model run is authorized by this plan alone.

## Delivery batches and dependencies

| Order | Plan | Independently testable deliverables | Contract rows |
|---|---|---|---|
| A | [Turn lifecycle](2026-09-26-native-harness-turn-lifecycle.md) | A1 permission-failure pairing; A2 stable-idle queue drain; A3 safe in-turn user input; A4 automatic retry retraction | R1, R2, R3, R10, R13, R14 |
| B | [Instruction lifecycle](2026-09-26-native-harness-instructions.md) | B1 full ancestor inventory/snapshot; B2 inherited correct rule matching; B3 context-aware dedupe; B4 first-write replan barrier | R4, R5, R6, R15, R16 |
| C / D | [Tools and connections](2026-09-26-native-harness-tools-and-connections.md) | C1 specialist companions; C2 process-group escalation; C3 transactional handoff; D1 MCP generations; D2 DNS cancellation; D3 byte-verified reads; D4 independent question identity | R7, R8, R9, R11, R12, R17, R18 |

A1's paired-result helper is shared by A3 and B4. B4 also depends on B2/B3. C2 precedes C3's failure cleanup. Other leaf tasks can be researched independently, but only one write-capable specialist edits at a time; the shared host/driver changes are serialized to prevent overlapping edits.

## Test and implementation cycle per task

- [ ] Move the relevant defect reproduction into its established feature suite with a **desired-behavior assertion**. Use scripted providers/temp fixtures; no real model account.
- [ ] Run the task's named test commands and retain the red failure that demonstrates the actual defect.
- [ ] Implement the smallest bounded repair; preserve WHY explanations for nontrivial control flow.
- [ ] Rerun the same tests, relevant adjacent suites and typecheck; record actual results.
- [ ] Request fresh review of the changed code, its failure exits and the approved-scope mapping. Address accepted findings before starting a dependent task.
- [ ] Replace/retire only this session's obsolete defect-expecting scratch probes once desired-behavior coverage exists. Preserve the original audit evidence files.

Task detail is in the linked plans. They follow the workspace's description-first planning convention: source locations, concrete state transitions, interfaces, exact failure cases and test commands, rather than pretending a large unreviewed code patch is an approved implementation.

## Verification and acceptance

From the workspace root, final desktop verification is:

```bash
bash scripts/verify.sh --full /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded
```

Its option parser accepts `--full` before the absolute checkout argument (verified in `scripts/verify.sh:41–49`). It covers desktop, not Android or the Worker.

- [ ] Run full desktop verification after integration, not just the passing audit probes. Retain logs and address test failures within the authorized development work.
- [ ] Run IPC parity/shared renderer checks for question-answer and session-context shape changes. Check available Android SDK/JDK before claiming Android verification; never build shared hardlinked web dependencies in place.
- [ ] Verify Linux process group behavior with owned disposable children; obtain Windows/macOS CI evidence for platform cleanup branches rather than claiming parity from Linux.
- [ ] Use the existing isolated runtime/workbench tooling to check queue timing and the unchanged queue controls, multi-file context facts, and independent question answers. No new interactive testing rig or attachment to the live app.
- [ ] Fresh code and UX reviews, then update contract rows with real mechanical guards/evidence once those guards exist. Do not label a source-string match or a defect-expecting probe as a passing behavior guard.
- [ ] Fresh grading and acceptance deck report what passed and what remains unverified. No “all fixed” claim while an approved requirement lacks evidence.
- [ ] Offer an optional spending-capped harness evaluation after offline verification. Paid execution needs a separate user decision; no real-model run was included in the audit or these approvals.

## Pre-implementation completion checklist

- [x] Approved, denied and undecided audit scopes resolved in the decision record.
- [x] Latest simple queued-send correction supersedes the optional follow-up control from the old deck.
- [x] Plans cover each contract row and identify task dependencies.
- [x] Fresh plan review complete and its group-ID reuse safety finding incorporated into C2; record: `docs/archive/reviews/2026-09-26-native-harness-plan-review.md`. Runtime verification remains outstanding.
- [ ] Contract sources validated, preview inspected, and scope signed by the user.
- [ ] Begin A1; do not describe plan/deck preparation as a shipped repair.
