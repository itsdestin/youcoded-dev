---
date: 2026-09-01
status: active
type: investigation
topic: Plan-approval buttons send arrows and Enter in one PTY write — the shape CC 2.1.220 drops
---

# Plan-approval buttons send arrows + Enter in ONE write

**Symptom.** Clicking any plan-approval button other than the first may still confirm
option 1 ("Yes"), on Claude Code 2.1.220 and later.

**Cause (present in today's code).** `PlanApprovalButtons` in
`youcoded/desktop/src/renderer/components/ToolCard.tsx` (~:804–820) builds
`DOWN.repeat(optionIndex) + '\r'` and hands it to a single `session.sendInput`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ToolCard.tsx", "contains": "DOWN\\.repeat\\(optionIndex\\) \\+ '\\\\r'"} -->

That is exactly the shape `.claude/rules/pty-io.md` forbids and that
`youcoded/desktop/src/renderer/parser/ink-select-parser.ts` measured on CC 2.1.220
(2026-07-26, the Resume Session root cause): Ink drops arrow keys that share a write with
the Enter and confirms the HIGHLIGHTED option. Every other menu button in the app has since
moved to the number-typing path (`55e1a0f9`, 2026-08: a bare digit selects and submits, read
off the option's own line — see `youcoded/docs/pty-io.md`). `PlanApprovalButtons` is the one
straggler still sending arrows.

**Fix shape.** Either type the option number like `PromptCard` does, or split into two writes
(`input` then `submitInput`). First step is a quick dev-instance check that the 2.1.220
measurement holds for the plan menu. Independent of the permission-timeout redesign
(youcoded PR #278).

**History.** Added 2026-07-30 (found in the permission-ask-timeout spec's third review).
Re-checked 2026-09-01: the single-write send is unchanged.
