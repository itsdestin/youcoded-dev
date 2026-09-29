---
status: shipped
---

# R14 — rendered busy queue and existing Stop affordance

Scope: evidence test only. No product UI edits, no grader-verdict change, no C2/R17 change, no commits, pushes, live app or paid calls. This pins an already-correct *nonaddition* promise; it does not claim a failing pre-change product behavior or manufacture a RED.

## Mounted UI and assertions

In existing `youcoded/desktop/src/renderer/components/InputBar.test.tsx`, the new test mounts real `InputBar` (`provider="native"`) and `QueuedMessagesStrip` under the same `ChatProvider` and `SkillProvider`, with the existing fake `window.claude` bridge. A small test adapter reads `useChatState('sess-1').queuedMessages`, mirroring ChatView's state-to-strip prop; `SESSION_INIT`, `USER_PROMPT` and `QUEUED_MESSAGE_ADDED` enter the *real reducer* to establish an active turn with a queued follow-up. This is not a source-text search or a hard-coded queue prop.

- Asserts the existing **Stop generating** control is enabled beside **Send message** while busy; clicking Stop calls only `native.interrupt('sess-1')`, never the Claude Code PTY path. After a pending `PERMISSION_REQUEST` for Bash (the ongoing action cannot yet safely pause), Stop remains enabled and the queued action inventory remains unchanged.
- Takes an **exact inventory of every button in the rendered queued strip**: `['Edit queued message', 'Cancel queued message']`. Both callbacks receive the actual queue ID (and text for Edit). Appending a controlled test-only `Send now` button into the mounted strip makes the same inventory assertion throw, then the decoy is removed. This establishes that the inventory guard detects an extra control regardless of name; it does not mutate production code.
- Searches all mounted buttons for forbidden new paths labelled `Send now`, `After this finishes`, `Stop and send`, `steer`, `urgent`, or `priority` (case insensitive). The exact strip inventory also detects unfamiliar urgent labels inside the queue row. The test does not purport to prove the entire application has zero similarly named controls in every other screen: its contract is this mounted busy native queue/composer surface.

## Verification

- `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run src/renderer/components/InputBar.test.tsx -t 'keeps Stop beside native busy queued input' > /tmp/r14-focused2.log 2>&1`: exit **0**, `Test Files 1 passed (1); Tests 1 passed | 58 skipped (59)`.
- `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run src/renderer/components/InputBar.test.tsx src/renderer/components/QueuedMessagesStrip.test.tsx src/renderer/components/StopButton.test.tsx tests/native-send-unconfirmed.test.tsx > /tmp/r14-suites.log 2>&1 && npm run typecheck > /tmp/r14-typecheck.log 2>&1`: exit **0**, `Test Files 4 passed (4); Tests 73 passed (73)`; typecheck ran `tsgo --noEmit -p tsconfig.json && tsgo --noEmit -p tsconfig.tests.json`. The suites' expected negative-send case printed `native send invoke rejected: Error: invoke rejected` but exited green.
- `cd /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926 && bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded > /tmp/r14-verify.log 2>&1`: exit **0**, types, test types, related tests, knip, lint, design lint, invariants, screens and journeys all PASS.

Changed file: `youcoded/desktop/src/renderer/components/InputBar.test.tsx` plus this report. This is additional R14 evidence, not a repair to the UI, and has no bearing on the explicitly deferred C2/R17 failure.
