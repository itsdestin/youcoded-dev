---
status: shipped
---

# Native harness audit — decisions

Authoritative submission: `native-harness.questions.answers.json`, submitted `2026-09-26T20:32:01Z`. **Later decisions win: the PR-review amendments at the end of this file replace Q-17 (Send now) and the earlier "refuse when rules cannot fit" behaviour.** Original question IDs and the submitted deck are preserved; no answered deck is rebuilt.

## Original deck — 11 approved items

| Original question | Scope | Audit source |
|---|---|---|
| Q-1 | Preserve usable history when a permission decision fails; no unauthorized execution | F01 |
| Q-2 | Drain accepted messages after background-report processing; normal busy-send timing is additionally amended by Q-16 below, while Stop still preserves submitted messages | F02 |
| Q-3 | Reload applicable rules when context clearing/summarization removes them | F03 |
| Q-4 | Correct rule-file parsing and folder-pattern boundaries | F10 |
| Q-5 | Load newly applicable guidance before a dedicated file-changing action, then let the model reconsider; not arbitrary shell interpretation | D01 |
| Q-7 | Give Bash-enabled specialists their own BashOutput/KillShell controls; no broader shell grants | F04 |
| Q-9 | Make foreground-to-background command handoff fail safely | F06 |
| Q-11 | New conversations use updated MCP configuration/credentials; preserve existing-session snapshots | F08 |
| Q-12 | Replace abandoned partial output consistently on automatic retry; never replay completed actions | F09 |
| Q-14 | Verify content freshness before suppressing repeated file reads | F12 |
| Q-15 | Independent answer identity for duplicate-worded questions across native/Claude Code compatibility | F13 |

Approval of an item is not a release, merge, paid evaluation or live-configuration authorization. Implementation has not started.

## Denied — do not implement

**Q-10 / F07:** remove the stale, previously YouCoded-owned MCP projection when a credential becomes unavailable. The user selected Deny without an additional note. Do not infer permission to make an alternative credential-cleanup change. The audit finding remains an observation, not approved work.

## Follow-up decisions — resolved

Authoritative second submission: `native-harness.follow-up.questions.answers.json`, submitted `2026-09-26T21:10:47Z`. Q-18 was left as Other in that submission and then resolved by explicit chat approval below; do not rewrite the historical answers file to pretend it contained that approval.

| Question | Decision | Authorized scope |
|---|---|---|
| Q-16 (Q-2 extension) | Automatic safe-boundary delivery — simplified by explicit chat instruction | One normal send flow: a message submitted while busy appears as queued, then is automatically delivered as soon as safely possible within the ongoing turn rather than waiting for the whole turn to end. No separate After this finishes option, steering-mode picker or urgent-send control. Preserve the existing queued-message presentation and Edit/Cancel controls unless a specific change is needed for correctness. No concurrent turn, implicit permission approval, or cancellation of a running action merely because a message arrives. An active long command or unresolved approval may still delay the next safe boundary. |
| Q-17 (Q-2 extension) | `no-urgent-action` — **superseded 2026-09-28, see PR-review amendments** | Do not add Send now, automatic background-on-send, or a new Stop and send action. Existing Stop remains. |
| Q-18 (Q-6, instruction files) | Full ancestor chain — explicit chat approval | Read instruction files through all parent folders, broadest first and nearest last, rather than stopping at the Git root. Preserve one selected file per folder: AGENTS.md preferred, otherwise CLAUDE.md. This is Pi/Claude-Code-like search breadth, not a promise of full compatibility or automatic resolution of conflicting prose. Dedicated personal-global locations and import expansion are not added by this decision. |
| Q-19 (Q-6, folder rules) | `approve` | Inherit applicable path-scoped project rules from the Git project root to the working folder, including narrowed specialist tasks. Match relative to each rule's owning folder. This remains project-bounded even though Q-18's instruction-file ancestry is broader; no new personal-global, cross-project or unscoped/eager-rule behavior. |
| Q-20 (Q-8) | **Deferred by subsequent user instruction** | Originally approved graceful-group behavior, but C2's ownership review found it requires a broader command-supervisor design to avoid recycled process-group IDs. After being offered deferral versus including that larger change, the user said “lets defer for now”. No supervisor or unsafe delayed-kill workaround in this batch. Existing stopping limitation remains; contract R17 must not be marked fixed. |
| Q-21 (Q-13) | `approve` | Extend cancellation and the existing request deadline across website-address lookup; ignore late results and cancel underlying work where supported. No new permissions, site restrictions or automatic retries. |

### Q-16 simplification — latest instruction overrides the proposed extra option

User: **“i don't want a separate \"after this finishes\" option. that just seems tedious. a message should just appear as queued, then send as soon as safe/possible instead of waiting all the way until the end of a long turn. should be straightforward.”**

This removes the separate follow-up choice previously described in Q-16 and the assistant's proposed UI preview. Keep one send flow and the familiar queue; change delivery timing, not the number of controls. The historical deck answers remain untouched. This correction is authoritative over the earlier proposal, research recommendations and UX summary.

### Q-22 — native-only question identity fix

Submitted `native-harness.cc-duplicate.questions.answers.json` at `2026-09-28T10:22:02Z`: **Q-22 pick native-only**. Keep independent duplicate-wording answers for native conversations; remove the proposed Claude Code duplicate-question warning and Submit block. Preserve Claude Code's prior legacy behavior and unique-wording payloads rather than inventing an upstream answer field or silently renaming questions. The Claude Code duplicate-wording limitation remains unfixed and must be explicit in final acceptance. This supersedes any implementation report describing the unapproved refusal as the completed compatibility behavior; signed contract R12 is native-only under this amendment.

### Q-18 clarification and approval provenance

The user asked to clarify the approaches and competitors. The assistant used a nested Workspace → App Git repository → desktop example, comparing nearest-only, Git-root-chain and all-parent-folder loading. It then explicitly recommended **the full ancestor chain, like Pi and Claude Code, for this nested workspace**, explaining that this preserves workspace guidance above an individual repository but can also load unrelated parent instructions.

The user's direct response was: **“okay, i'm fine with your recommendation”**. This approves the full-ancestor recommendation, superseding the earlier project-root-only recommendation in the deck. It does not approve every feature of either competitor.

Research: `native-harness.follow-up-research.md`. The original deck, follow-up deck and both submitted answer files remain unchanged. No question in these two rounds remains open; implementation planning and any required UI/contract review are still separate from shipping. Q-10 remains denied, and audit findings outside the approved scopes are not implicitly authorized.

## PR-review amendments (2026-09-28) — these replace earlier answers where they conflict

Source: `native-harness.pr-review.questions.answers.json` (submitted `2026-09-28T19:42:07Z`), follow-up chat, and the five Send now review rounds (`native-harness.send-now{,-2,-3,-4,-5}.review.answers.json`).

| Step | Answer | What it means now |
|---|---|---|
| Q-1 | `after-batch` | A message sent mid-task is read after the assistant's current batch of actions finishes; planned actions are not cancelled. Destin's note asked for a Send now button, since this can mean a short wait. |
| Q-2 | `reset` | A message that joins the running turn resets the "keep going?" step count. |
| Q-3 | `buttons-only` | Keep the waiting-message buttons; no Up-arrow recall, no pickup delay. |
| Q-4 | `nearest-only` | The session folder's own instruction file takes the room it needs first; broader parent files get what is left and are still named to the model if squeezed out. |
| Q-5 | `other` → chat | "Simplest/most robust" resolution: rules that cannot fit are shown shortened once, then the model re-plans. **No refusal.** Replaces the earlier "an unfittable group ends with a not-run refusal" (see `2026-09-28-native-harness-final-review-fixes.md`). |
| Q-6 | `panel-only` | A same-folder CLAUDE.md skipped because AGENTS.md wins is noted in the context panel only. |
| Q-7 | `other` → chat | Unchanged repeat Reads are verified by a piecewise fingerprint of the file's bytes before loading it, not by modified time. |
| Send now | 5 review rounds, approved | **Replaces Q-17.** A waiting message gets a Send now control that stops the current task like Stop and sends that message next. Accent send-style button with an up arrow that reveals "Interrupt and Send Now" on hover; trash icon for Cancel; plain pencil for Edit. |
