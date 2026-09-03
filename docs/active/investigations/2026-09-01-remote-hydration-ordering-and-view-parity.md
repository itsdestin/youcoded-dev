---
date: 2026-09-01
status: active
type: investigation
topic: finish the remote-hydration work — live/replay ordering and view-state parity (commits 2 and 3 of the 2026-07-20 plan)
---

# Remote hydration: the two unshipped commits

**Symptom.** A remote browser can land on a different session or view than the desktop
window is showing, and events that arrive during connect can be applied twice or dropped.

**Mechanism.** youcoded `2f8132cf` (2026-07-20) shipped only commit 1 of the three in
`docs/active/plans/2026-07-20-remote-hydration-pr-spec.md` (collision-proof `msg-` ids +
empty-snapshot rejection). Still open in today's code:

- **Commit 2 — ordering.** `remote-server.ts` `replayBuffers()` still guesses with a
  hardcoded 500 ms `setTimeout` before replaying PTY/hook buffers (detail and anchor in
  `docs/active/investigations/2026-09-01-remote-first-connect-dead-time.md`). The plan:
  buffer push events in the shim between `auth:ok` and `chat:hydrate` with a bounded
  timeout, then delete the guess. **Must NOT gate first paint** — Android's
  `LocalBridgeServer` never sends `chat:hydrate` and would hang forever.
- **Commit 3 — view-state parity.** `serializeChatState` (`chat-types.ts`) carries no
  `activeSessionId` or `viewModes` (`rg` for either in that file: 0 hits, 2026-09-01),
  and `App.tsx` `handleToggleView` only broadcasts `switch-view` on Android — the
  remote browser never learns which session/view the desktop is on.
  <!-- claim: {"path": "youcoded/desktop/src/renderer/App.tsx", "contains": "On Android, tell the native side to switch views"} -->

**Open question that decides the order.** Destin reported connect "significantly
better" after commit 1 alone, so commit 2 may be smaller than specced. Whether remote
still lands on a different session/view than the desktop window decides whether 2 or 3
matters more — ask him before starting.

**History.** Added 2026-07-20; the ordering half is Finding 4 of the 2026-07-10
remote-access review (item 4 of the 2026-07-15 rework umbrella). Re-checked against
`master` 2026-09-01: both commits unshipped.
