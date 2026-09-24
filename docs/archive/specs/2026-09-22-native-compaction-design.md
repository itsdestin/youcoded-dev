---
status: shipped
date: 2026-09-22
owner: Destin (product decisions) / YouCoded Assistant (engineering proposals)
component: youcoded/desktop
related:
  - docs/active/plans/2026-09-22-native-compaction-plan.md
  - docs/active/specs/2026-09-17-local-context-cuts-design.md
  - docs/roadmap/native-harness.md
---

# Native compaction — near-limit, single-operation, durable handoffs

## Status and authority

Destin approved the product direction below on 2026-09-22 and revised it after a review on 2026-09-23 (U3 revised; U8–U11 added). This is a draft; constants, schemas, UI copy and code are not approved. No app code has changed. Anything labeled **recommendation** is an engineering proposal, not a user decision.

## 1. Goal

Use most of a model's available context, then make one substantial reduction into a useful handoff and a small recent tail. Continue the task without losing the user's instructions, inventing approvals, repeatedly compacting nearly unchanged history, or undoing compaction on resume.

Compaction changes **what the model receives**, not the original conversation the user can read. This must work for research, writing, planning, personal conversations, and coding.

## 2. User decisions

These summarize explicit choices or approvals in the design conversation, not implementation choices inferred by an assistant.

| ID | Approved direction | Conversation evidence |
|---|---|---|
| U1 | Pi-like near-limit triggering, not a blanket 75% occupancy trigger. Reserve for the configured response plus a safety margin; 16,384 is not a universal constant. | Destin: “75% is too low”; a 270k model should get closer to capacity. Accepted the reply-based-reserve clarification. |
| U2 | One normal compaction operation, close to Pi. No separate prune-only stage initially. | Destin questioned “try the cheap option first” and then asked for row 3 to be closer to Pi; accepted the revised single-operation outline. |
| U3 | Retain a small token-bounded recent tail, not two arbitrarily large turns or half a large window. Safely split long active/first turns. **Revised 2026-09-23:** the summary alone carries the user's request and corrections; no user message is pinned or copied word-for-word outside the recent tail. | Accepted the revised outline; in the 2026-09-23 review Destin rejected verbatim request/correction copies as duplicating the summary: “the summary is sufficient.” |
| U4 | Concise structured handoffs: short bullets for constraints and decisions where possible, no padding or repetition. | Explicit request for formatting/styling/token-count guidelines. |
| U5 | “User decisions” includes only choices directly made or explicitly approved by the user. Unreviewed AI implementation choices are not user decisions. | Explicit correction: decisions are “only those made directly by the user.” |
| U6 | Pi-like summary generation allowance, roughly 13k on ordinary large-window models, scaled down as needed. Not a 1–2k target or 4k universal cap; do not fill unused allowance. | Accepted the competitor-budget comparison and revised allowance. |
| U7 | Preserve useful cache-aware request shaping, durable compacted history, bounded recovery, and ongoing-turn/UI continuity. | Accepted the revised design outline; requested formalization and planning. |
| U8 | The summary includes up to 3 short, exact quotations of the user's own words under Goal, Constraints and User decisions, only where useful. Still-valid quotes carry forward through later compactions; superseded ones are replaced. No automated quote verifier. | 2026-09-23: Destin proposed the quotations; accepted the tweaks; declined a verifier as overcomplicating. |
| U9 | When the summary request would not fit, oversized tool outputs are shortened **in the summarizer's copy only**, with a marker, instead of stopping the conversation with a context-limit error. The real transcript is untouched. | 2026-09-23 review: accepted the reviewer's suggestions (“looks good”). |
| U10 | Ship in two releases: first the in-session fixes (near-limit trigger, first-turn compaction, one summary, no false turn end); then durable restoration on reopen, using a simple saved record (summary + one resume point). | 2026-09-23 review: accepted the reviewer's suggestions. |
| U11 | Switching to a model the conversation no longer fits is blocked with a popup offering **Summarize and switch** (summarize on the current model so the chat fits the new one, then switch) or dismiss with X/Esc (stay on the current model). | 2026-09-23: Destin: “fine if we block, but it should be a popup with a ‘summarize and switch’ button or an x/esc button.” |

### Rejected or replaced directions

- Keep the current 75% trigger indefinitely merely to minimize change.
- A separate normal prune-only stage that may leave context nearly full.
- Deliberately retain about half a large context window after compaction.
- A universal 1,000–2,000-token summary target or 4,000-token generation cap.
- Treat AI-selected implementation details, silence, or permission to investigate as user approval.
- Copy the active request and corrections word-for-word next to the summary (replaced by U3 revision and U8 quotations).
- An automated check that summary quotations appear in the transcript.
- Stop with a context-limit error when the summary request cannot fit (replaced by U9).
- Adopt all of Hermes's retrieval, maintenance, and recovery machinery as a prerequisite.

## 3. Scope

One compaction mechanism for native cloud and local model sessions. Window/provider capabilities affect budgets and request adaptation, not independent compaction algorithms.

**Engineering recommendation, not a separately approved product decision:** specialists that already use the same runtime should reuse the mechanism, without new parent-facing markers. Confirm specialist lifecycle compatibility before enabling it there.

Claude Code's own compaction implementation is unchanged. Shared renderer handling must preserve the manual/Claude Code paths while fixing native automatic compaction. This work does not implement an Android-native harness; shared transcript/rendering consequences must still be checked on Android and remote surfaces.

**Engineering recommendation:** automatic and manual native compaction should share checkpoint construction and durability rather than maintain two algorithms. Manual compaction would bypass only the occupancy trigger, not safe-fit, completion, pairing, or persistence checks. Preserve manual command focus/clear/no-op semantics unless a change is explicitly reviewed; this reuse recommendation is not new user approval of a manual-command redesign.

### Relation to the local-only draft

The 2026-09-17 local-context-cuts draft records the first-turn failure and useful request protection requirements. For this new design, its local-only/cloud-unchanged policy, 85%-to-50% policy, and prune/drop ladder are replaced by U1–U3. Its proposed toast, special cut marker, fading, and settings actions are **not automatically approved by this conversation**. They need reconciliation in the UI phase rather than silently inheriting the older draft's interface.

Tool-result sizing remains necessary input safety, particularly on small windows. It must not reintroduce a normal prune-only compaction ladder or silently delete the user's task.

## 4. Lifecycle

### 4.1 Measure the next request

- Check before each model request, including between completed tool steps and after newly appended user/steering input.
- Account for system instructions, actual tool schemas, history, images, and provider-specific continuation representation.
- Prefer the latest valid provider usage anchor plus an estimate of additions since that anchor. Do not count already-accounted assistant output twice.
- Bind the anchor to the history revision and provider/model request identity. Rebase after compaction, changed prompt/tools, model switch, or fallback reconstruction.
- Track per-request occupancy separately from cumulative token billing. Cached tokens still occupy context.
- Use an explicit estimate when no valid usage anchor exists; do not display it as a provider measurement.

### 4.2 Trigger near the usable limit

Trigger from the effective window minus response headroom and a safety margin. Respect a provider's separate input limit if it has one. Unknown window/unsupported output controls require an explicit conservative policy, not an invented capacity.

**Recommendation:** the reply reserve is a fixed planning amount, not the configured maximum reply length; near the limit, shrink that one request's reply cap to what fits. Otherwise raising a model's maximum reply (for example, to 64k for reasoning models) would drag the trigger back toward 75%.

For comparison only: Pi's default 16,384 reserve yields a 255,616 trigger for a 272,000 window (about 94%). This is **not** the specified YouCoded threshold for every model.

Summary generation has its own output allowance. The normal reply allowance, summary allowance, retained-tail allowance, and context safety margin are distinct quantities. A ~13k summary output allowance is not safe merely because the ordinary reply fits. The planner must budget the summary request itself before making it.

### 4.3 Select retained context

- Choose a small recent tail by token allowance; prefer whole turns where they fit.
- When a turn is oversized, split it between complete tool groups. Never orphan calls or results, including parallel tool batches.
- Everything before the tail is retired into the summary; nothing else is pinned (U3).
- The summarizer's input distinguishes the user's own messages from app-generated ones (background completion notices, injected rules, summaries, synthetic continuations), so the latter are never quoted as the user or treated as approvals. Reuse existing markers where they exist.
- An older still-active request across background notices must survive in the summary's Goal; this is a required test.

### 4.4 Generate one replacement handoff

- One normal summary model call, on the current model/provider; no separate summarization agent or unrequested cheaper-model routing.
- Include the previous handoff and newly retired history. One updated handoff replaces the old one.
- Preserve the original warm prefix where compatible and feasible. Cache optimization must not outrank safe input fit or summary integrity.
- Do not silently remove the oldest summary input to fit the request.
- Use the handoff contract in §5. No AI grading call.
- Budget the summary allowance and instruction overhead before the near-limit trigger. If the summary input still cannot fit (for example, after a giant tool result), shorten the largest tool outputs in the summarizer's copy only, with a visible "[output shortened]" marker, until it fits (U9). No multi-pass summary ladder.
- **Smaller-model switch (U11):** when the conversation would not fit the chosen model, the switch waits behind a popup. **Summarize and switch** runs one summary on the current model, sized so the result fits the new model, then switches; X/Esc keeps the current model. If the summary fails or still cannot fit, stay on the current model and say so. Popup copy and layout go through the UI review step.

### 4.5 Validate and commit once

Until validation and persistence succeed, the candidate is not the session's accepted working history.

Validate completed generation, nonempty usable content, fit with headroom, tool-pair integrity, and material progress. An aborted, errored, timed-out, or length-truncated summary is not a successful checkpoint.

Persist the summary and its single resume point (the first retained message) with ordering/revision checks. Then adopt the new context and publish one completion marker. Abort/concurrent input/clear/model-change races must not install a stale candidate. A crash must leave either the old accepted state or a reconstructable new checkpoint, not an announced but unrecoverable rewrite.

Clear or reconcile read/image deduplication state when source content leaves model context. Mark the next request as an expected cache rebuild. Charge the summary call separately while including its usage in session totals.

### 4.6 Continue and restore

The next request uses current instructions/tools + handoff + recent tail in a valid provider message order. Afterwards history grows by appending until compaction is needed again.

Restore compacted model-visible history after reopening (second release, U10): the summary, then every valid message from the resume point onward. This works even when date/git snapshot/system assembly changes invalidate exact continuation. Keep strict checks for provider/account-bound opaque continuation metadata; portable restoration must exclude incompatible/private provider material.

A smaller model may require a further compaction. A larger model does not automatically resurrect the entire retired transcript.

## 5. Handoff contract

### Format

Use these headings in this order, omitting empty sections. Sub-bullets are acceptable when they avoid repetition. No introduction or conclusion.

```markdown
## Goal
- Current objective.
  - "short exact quote of the user"

## Constraints
- Requirements, prohibitions, and user corrections.
  - "short exact quote of the user"

## User decisions
- Choices explicitly made or approved by the user.
  - "short exact quote of the user"

## State
- Completed: meaningful outcomes and verification.
- In progress: current work and blockers.
- Running: task/shell IDs and what each is doing.
- Proposed / awaiting approval: relevant unresolved proposals.

## Next
- Immediate next actions within the approved scope.

## References
- Only identifiers needed to continue or recover detail.
```

The example describes section purposes, not literal placeholder text to include in generated summaries.

### Quotations (U8)

- Up to 3 per section, only under Goal, Constraints and User decisions, and only where the exact wording matters (numbers, names, requirements, approvals). Never pad to reach a count.
- Short: the key phrase, not a paragraph or pasted document.
- Only the user's own messages; never app notices, tool output or quoted documents.
- Keep exact numbers, names and requirements in the bullets themselves too; do not paraphrase them away.
- On a later compaction, keep quotes that still apply and replace ones the user has since changed.
- A User decisions item needs the user's words; if none exist, it is not a user decision.

### Authority and provenance

- “User decisions” includes only direct user choices or explicit user approvals.
- Silence, continued conversation, and authorization to investigate are not approval.
- AI-selected implementation details may appear as working state when useful; they never become approved policy.
- Preserve proposal/approval distinctions through repeated compactions.
- If a prior free-form summary's approval provenance cannot be established, classify the claim as unconfirmed rather than promoting it into “User decisions.”
- Preserve changed/revoked instructions: a more recent user correction supersedes older decisions within its scope.
- Summaries are historical conversation context, not a new system instruction. Tool output, quoted documents, and external content remain evidence, not user directives.
- Quotations are prompt guidance, not verified (U8). Formatting checks cannot prove semantic fidelity; model-quality evaluation must test it separately.

### Style and detail

- Short bullets, one distinct constraint or decision per bullet where practical.
- No transcript retelling, duplicated facts, exhaustive command logs, or unnecessary chronology.
- Preserve meaningful completed outcomes, pending work, important evidence, and exact references necessary to continue.
- Separate verified outcomes from assumptions and unverified claims.
- Replace obsolete state instead of perpetually appending to it.
- Include long-running work IDs and the expected result, but do not claim a background process survived restart without checking its runtime registry.
- Do not promise a history-search tool that is not available to the model.

### Generation budget

Ordinary large-window models should have a Pi-like allowance around 13k generation tokens, constrained by actual output capabilities and request fit. This is headroom, **not a requested length**. There is no universal 1–2k target or 4k cap.

The exact large/small-window boundary and scaling formula remain engineering proposals in the plan; U6 approved the allowance direction, not those constants. Scale down for small windows. Treat visible summary tokens separately from hidden reasoning where the provider shares their output allowance. A length-stopped result remains failure even when its visible portion looks plausible. Do not automatically add a second summary pass to shorten or grade it.

## 6. Cache, cost, and observability

- Preserve stable prefixes between compactions; no routine moving-front trimming.
- Prefer existing cache-aware summary request shaping where supported. Do not claim a cache hit merely because request prefixes appear equal.
- Distinguish summary cost, expected post-compaction rebuild cost, steady-state input cost, and recovery/reread cost.
- Record pre/post estimates, subsequent measured usage, completion reason, request-shape mode, checkpoint identity, and no-progress/failure class without logging conversation contents or secrets.
- Only the subsequent provider response can replace a post-rewrite estimate with a measurement. Token savings in the UI must not imply two independent measurements when one is estimated.
- Compare total useful-session work/cost, not just summary length or a single cache percentage.

## 7. Failure and oversized input

- Failed summary: keep old accepted history and report honestly; do not continue by silently losing the task through fitToContext.
- Unchanged failing candidate: prevent a repeated automatic summary loop. A new explicit manual request or genuinely changed input may retry.
- Confirmed context overflow: allow one tighter recovery attempt and one replay of the rejected model request. Do not repeat completed tool side effects.
- Do not classify generic authentication, network, rate-limit, or billing errors as context overflow.
- Never commit a successful-but-ineffective candidate merely to suppress future compaction with a cooldown.
- A giant newly appended result may legitimately cause another compaction soon after the last one. Tests distinguish this from repeated summaries without useful progress.
- An oversized user message, attachment, fixed prompt, or indivisible tool group requires explicit fit handling or a clear stop—not fabricated context capacity. The summarizer-copy shortening (U9) applies to tool output only.
- Small windows: if a compaction cannot reach the required headroom (for example, a fixed prompt plus a long recent message on an 8k model), say so clearly rather than retrying forever or appearing stuck.

## 8. User experience

- One marker per committed checkpoint; duplicates/replay are idempotent.
- Automatic compaction inside an ongoing native turn does not call endTurn or clear its activity state.
- Preserve scroll position, visible transcript, tool cards, and background activity.
- Manual native compaction and Claude Code behavior retain their own lifecycle semantics.
- Summaries on slow local models can take minutes: show that compaction is in progress and keep Stop working.
- No new settings dashboard, compaction-policy selector, or extra normal-operation toast is part of this initial scope.
- Existing fading must not falsely claim that retained messages were removed; exact UI treatment and estimated-count copy require the UI review step before implementation.

## 9. Non-goals

Cross-conversation memory, new history search/indexing, provider-native opaque compaction, automatic cheaper summarizer selection, complex cooldown/fallback ladders, a separate prune-only optimization, automatic file rereading after compaction, or broad prompt/tool redesign.

## 10. Acceptance matrix

| ID | Required evidence |
|---|---|
| A1 | Large windows reach reply-based near-limit threshold; small windows/fixed prompts produce feasible budgets or an explicit cannot-fit result. |
| A2 | Newly appended tool output is counted once; cached input and reasoning representation are not mistaken for free context; stale usage anchors are invalidated. |
| A3 | Long first turn and long task followed by two short background notices produce an effective checkpoint with substantial room, not two ineffective consecutive summaries. |
| A4 | The summary's Goal/Constraints carry the active request and corrections (with quotes where useful); complete parallel tool groups and retained-message ordering survive; app notices are never quoted as the user or treated as approvals. |
| A5 | A short session yields a short handoff; complex sessions may use larger allowance. Unapproved AI choices never become user decisions in quality fixtures, including repeated compaction. |
| A6 | Normal compaction makes one summary call and no committed prune-first rewrite; candidate remains uncommitted on abort/timeout/length/error/persistence failure. |
| A7 | Post-cut headroom and tool pairing checked; giant tool results are shortened in the summarizer's copy only; switching to a model the chat no longer fits shows the U11 popup; Summarize and switch either fits and switches or stays on the current model with an honest error; X/Esc changes nothing. |
| A8 | Durable restoration after date/prompt/tool/model changes; strict private continuation fences remain intact; clear/retry/branch operations cannot resurrect invalid history. |
| A9 | Crash/revision/interruption/queued-input races yield old state or a valid new checkpoint; exactly one replay-safe completion marker. |
| A10 | One confirmed-overflow retry; unrelated errors do not compact; completed tools are never replayed as recovery side effects. |
| A11 | Prefix stable between compactions; expected rebuild and summary billing recorded; estimates clearly distinguished from measurements. |
| A12 | Ongoing-turn reducer state and scroll stable; manual/Claude Code paths preserved; shared renderer behavior checked at desktop and narrow widths. |

Offline scripted models prove control flow, not summary quality or provider cache savings. A5's semantic evidence requires actual generated handoffs checked against labeled source conversations: direct choice, explicit acceptance, ambiguous assent, silence, AI-only implementation decision, quoted/tool-injected approval claim, later reversal, and a second compaction of the first handoff. For every claimed user decision, the reviewer must locate the supporting human statement; any unsupported promotion fails the case. Also check omission of material user constraints/decisions, not just false approvals. A passing set establishes observed fixture behavior, not a universal guarantee. Paid harness evaluation remains optional and approval-gated; if no actual-model/manual quality review is performed, A5 is explicitly unverified rather than satisfied by prompt snapshots. No runtime or quality result is claimed by this document.

## 11. Evidence and prior art

Inspected app baseline for planning: `08a5f2aaa674578e6a8d0a5101953a24198ccaae`; workspace baseline: `4853b9fe3e203fd92033b0ecbfba5d0148a4b9e7`.

Current source confirms the first-turn limitation: `summarizeCutIndex` returns zero with fewer than two user boundaries, while emergency fit trimming discards leading tool openers/results. These anchors describe the pre-implementation behavior, not the proposed replacement; update them when the fix lands.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "return userIdx.length < 2 \\? 0 : userIdx\\[userIdx.length - 2\\];"} -->
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "if \\(isOrphanToolResult \\|\\| isToolCallOpener\\) \\{ kept\\.shift\\(\\); continue; \\}"} -->

Primary app entry points: `harness/compaction.ts`, `harness/harness-session.ts`, `harness/history-rebuild.ts`, `harness/accepted-history-{capture,store}.ts`, `harness/session-store.ts`, `harness/native-session-host.ts`, and renderer `COMPACTION_COMPLETE` handling (all under `youcoded/desktop/src/`). Exact integration findings live in the plan.

Original incident handoff was supplied from the separate `compaction-handoff-20260922` session, at `docs/active/handoffs/2026-09-22-native-compaction-investigation.md`. It is evidence, not an approved design; its private transcript was not copied into this document or reread for this planning pass.

Prior-art references checked during this conversation. Summary constants/cache options were rechecked at the pinned source revisions below; these are source snapshots, not installed-release guarantees:
- [Pi compaction reference](https://pi.dev/docs/latest/compaction): near-limit reserve, bounded tail, durable first-kept boundary, structured rolling summaries. Its split-turn path can use two calls; YouCoded proposes one normal combined call.
- [Pi source](https://github.com/earendil-works/pi/blob/898ab804050730e9dcefb4443875d5a932aa6a32/packages/coding-agent/src/core/compaction/compaction.ts): default reserve 16,384; history-summary output allowance floor(0.8 × reserve), further limited by model output; this is not an actual-length target.
- [Hermes compressor](https://github.com/NousResearch/hermes-agent/blob/5f47c35d37a40fb651e4a00571d03e12b23d11f9/agent/context_compressor.py): richer anchors/retrieval/recovery; inspected large-session base summary guidance up to 10k plus 4k lean log; no summary-specific max_tokens in that request. Not a design to copy wholesale.
- [OpenCode V2 compaction](https://github.com/anomalyco/opencode/blob/18ef3cc7c5a25b82114c953a80ccc09f4988f74e/packages/core/src/session/compaction.ts): bounded suffix and 4,096 output cap in inspected source. The low cap was not selected for YouCoded.

Pin any upstream implementation borrowed during coding to the actual inspected commit before adopting code or constants. Our product decisions above do not depend on treating moving upstream defaults as authority.
