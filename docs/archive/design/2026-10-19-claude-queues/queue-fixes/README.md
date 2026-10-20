# Queue fixes — approved implementation

status: shipped

Merged in app PR #657. Final verification and behavior: `docs/archive/investigations/2026-10-19-claude-queue-timing/FINAL.md`. Preview-only labels, server addresses and verification below are historical; submitted answers are preserved unchanged. The later explicit user override is authoritative.

**Latest explicit user override (after the submitted answers):** simplify and allow dismissal of the warning, remove the danger confirmation, and restore the conversation **and reusable queue**. Preview 1/2 are approved; 2a's popup and 2b's permanent blocked replacement below are superseded. No further design round was requested. The historical preview mechanics/evidence below describe the old proposal, not current behavior.

Current dismissal revokes the exact worker token, invalidates native fence/admission authority, cleans only owned staging, drops buffered old input, and durably tombstones the discarded intent before restoring fresh authority. No dismissed message is resent and no pre-existing paused waiting work is automatically flushed. New deliberate idle sends and subsequent queue cycles remain usable. This is explicit abandonment of delivery ambiguity, not a claim that delivery never happened.

## Change ledger

| Number | Proposed change | Rule held | State |
|---|---|---|---|
| 1 | Idle-ready delivery keeps internal tracking without a transient queue row | Only genuinely waiting/uncertain work is visible; no hide timer/debounce | Preview only |
| 2 | Unconfirmed row gets Dismiss… beside the existing delivery check | Never replay an unknown delivery | Preview only |
| 2a | Existing narrow confirmation with Dismiss without resending / Keep message | Warn that delivery may already have happened; Escape/× keeps the record | Detail of 2, preview only |
| 2b | Removed row is replaced by the existing ErrorState when cleanup is unproven | Dismissal never unlocks unsafe input or resumes the queue | Detail of 2, preview only |

## Existing surfaces used as references

1. `QueuedMessagesStrip.tsx`: current native queue strip, send/check control, edit and trash controls. Before means this session's existing queue implementation, not master before #169.
2. `chat/rename-session`: Dialog + OneJobCard, one job, stacked full-width actions, Escape/×.
3. `chat#openrouter-key-rejected`: real ErrorState notice in the conversation; the blocked result reuses this primitive. `project-view/RemoveProjectDialog.tsx` supplies the destructive one-job confirmation pattern.

All three were opened via shoot and their real rendered surfaces inspected. The deck is not hand-drawn HTML.

## Historical safety proposal (superseded by the explicit override above)

- Classify immediate delivery separately from actual queue waiting. Keep existing send identities, durable tracking, receipts and unknown handling. A formerly immediate send that genuinely becomes waiting or uncertain must become visible. Do not use elapsed-time concealment.
- Dismiss resolves the user's saved queue intent without resending. Preserve a durable terminal resolution/tombstone so reconnect, retry and restart cannot replay it. Do not delete delivery/safety evidence along with the visible message record.
- Composer quarantine/ownership is separate from the message record. Dismiss does not clear it. Only classified cleanup with positive native/input-safety evidence may release input. No blanket quarantine removal and no release based on a user's acknowledgment alone.
- The proposed historical-unknown route does not promise recovery. If cleanup cannot be proven, remove the queue row but keep input and remaining queued work blocked, with the shown notice. Diagnose must use the app's supported diagnostic route without replaying this message; that action is not wired in the preview.
- An existing confirmed conversation message is untouched. Dismiss does not undo a delivery or remove transcript history.

## Preview mechanics / fidelity

- `workbenchQueuePreview()` gates the renderer fixtures to workbench/photo builds; production returns null. No IPC contracts, host journals, native input, production package, fixture HOME, dev offset 485, or backend sources were edited here.
- `queuePreview=idle-before|idle-after|uncertain-before|uncertain-after|waiting-after|blocked-after` poses the actual strip. The dismissal confirmation changes only component-local fixture state.
- Pictures: `runs/screens/` from shoot, Light/Dark/Halftone Dimension, plus the confirmation at 390×844. `runs/before` and `runs/after` copy pixels unchanged under common screen names for the two before/after slides; manifests retain `sourceScreen` and `sourceFile`. Reproduce normalization with `node scratch/169-queue-preview-runs.mjs`.
- Screenshot capture uses latency 0 so community theme hydration is complete. A separate Dark/stress/150ms explore walk opened Dismiss, confirmed it, and showed the disabled textbox/Send message and Diagnose action with no page errors. Empty/150ms was also opened without page errors. These are UI fixture checks, not actual queue timing or native cleanup verification.
- During capture review, storage-only theme preparation produced Light images labelled Dark/Halftone. `scripts/shoot/shoot.mjs` now also supplies the renderer's existing explicit workbench `theme` query parameter. Light/Dark/Halftone captures were repeated and inspected; non-zero-latency community theme startup was not repaired as part of this small queue preview.
- Deck: `queue-fixes.review.json`, four slides (two changes with two safety details). The first turn hit the provider's image-delivery cap before visual inspection. On the following notification turn the contact sheet was delivered: inspection caught oversized full-window comparisons hiding the queue strip under the feedback bar. The deck now uses actual renderer close-ups of the composer/strip and confirmation panel, without changing app behavior. Re-ran `preview` successfully and visually Read final `contact-light.png`, `contact-dark.png` and `contact-halftone-dimension.png` in `preview/queue-fixes.review/`. The queue differences and confirmation are readable; supporting explanatory cards may require scrolling at smaller deck heights. User approval is still pending.

## Optional live preview

Renderer-only workbench, port 5659 (offset 486), background shell `sh-31d1`:

`http://127.0.0.1:5659/?mode=workbench&child=1&scenario=stress&latency=150&theme=dark&queuePreview=uncertain-after`

Click Dismiss…, then Keep message or Dismiss without resending. The latter removes only the fake row; sending stays blocked. Diagnose is intentionally not connected. For the posed quiet-send appearance, change `queuePreview` to `idle-after` (this is not a real send test).

## Verification evidence

- `cd youcoded/desktop && npx vitest run tests/QueuedMessagesStrip.test.tsx tests/claude-queue-submit.test.ts tests/claude-queue-plugin.test.ts tests/claude-queue-transport.test.ts`: 4 files passed, 36 tests passed. `scratch/169-queue-preview-tests.log`.
- Shoot: 30/30 pictures; median 2.9s, all listed captures `ok`. `scratch/169-queue-preview-shoot.log`.
- Full verification first found InputBar 1502 lines above the 1500 default; extracting its preview predicate left it one line over. The final predicate call has its WHY comment inline, leaving exactly 1500 lines with no budget increase. Final focused command added `tests/line-budgets.test.ts` to the four files above: **5 files / 42 tests passed**, `scratch/169-queue-preview-focused-final.log`. The subsequent full run correctly flagged idle-after looking identical to ordinary chat; its screen now explicitly declares that intended `sameAs`. Final-source full verification is `scratch/169-queue-preview-verify-final-source.log`: types, related tests, knip, lint, design lint, invariants and journeys PASS; screens FAIL on `pages/page/page-kit-pieces#menu-open` (Escape closed the whole Built in panel instead of only the dropdown). No page-menu implementation was changed here. Do not claim a fully green verification.
- Final-source related tests: **423 passed / 1 skipped files; 8552 passed / 36 skipped tests**, `scratch/verify-20261019-164911-3698753/tests.log`.
- Recheck command `node scripts/shoot/shoot.mjs 'pages/page/page-kit-pieces#menu-open' --check --worktree /home/destin/youcoded-dev/worktrees/sessions/169-claude-message-queues/youcoded --out scratch/169-queue-preview-menu-recheck` actually checks ALL screens (`--check` overrides the name filter): **411/411 pictures**, median 1.5s, completed 129.2s. `scratch/169-queue-preview-menu-recheck.log`. The earlier page-menu Escape failure remains unexplained; do not describe it as fixed or claim the preceding combined verify command passed.
- `node --test scripts/shoot/tests/*.test.mjs`: **53 passed, 0 failed**, `scratch/169-queue-preview-shoot-tests.log`.
- Served-deck probe returned `images:5, broken:[]`; this checks loading, not the outstanding visual contact-sheet gate. `scratch/169-queue-preview-deck-probe.log`.
- No commits or pushes by this agent. `workspace-start --item 169` itself recorded the item/session link on workspace master, as its prescribed startup behavior.
