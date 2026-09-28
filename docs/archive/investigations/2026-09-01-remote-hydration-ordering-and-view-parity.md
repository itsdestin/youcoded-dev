---
date: 2026-09-01
status: resolved
type: investigation
topic: finish the remote-hydration work — live/replay ordering and view-state parity (commits 2 and 3 of the 2026-07-20 plan)
---

**RESOLVED 2026-09-10.** Both commits shipped, plus the double-apply/drop concern, all in
the "remote batch 2/3" work:
- **Commit 2 (ordering) — `youcoded@4f9320217`** ("the phone says when it is ready, and the
  host holds everything until then"). The phone sends `client:ready` once React has mounted;
  the host gates everything behind a queue (`runRestore`'s "THE CUT LINE") until that ack
  arrives, instead of a hardcoded 500 ms guess. This also closes the double-apply/drop half
  of the symptom — the queue-index bookkeeping (`snapshotIndex`, `hookPassIndex`) is what
  makes replay exactly-once. Pinned by `remote-readiness.test.ts`.
- **Commit 3 (view-state parity) — `youcoded@9b02964f6`** and **`youcoded@e7e2282c3`**. Not
  the specced shape (broadcasting `activeSessionId`/`viewModes`) but the same goal reached a
  different way: `e7e2282c3` adds a `focus: { sessionId }` field to `serializeChatState` so a
  phone with no session of its own opens where the desktop is, and `9b02964f6` is a deliberate
  reversal of the OTHER half — contract R4 decided the chat/terminal view toggle stays
  per-screen and is never broadcast at all (it used to broadcast on Android and move every
  other client), which is what the old
  `On Android, tell the native side to switch views` line did. Pinned by
  `view-switch-stays-local.test.ts`.

Closed on `docs/roadmap/remote-access.md`; see `docs/roadmap/shipped.md`.

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
