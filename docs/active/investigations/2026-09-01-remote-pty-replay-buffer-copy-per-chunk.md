---
date: 2026-09-01
status: active
type: investigation
topic: the remote server's rolling PTY replay buffer does an O(4 MB) string copy per output chunk, with zero clients connected
---

# PTY replay buffer: a 4 MB string copy on every chunk, client or no client

**Symptom.** Desktop CPU cost that scales with terminal output volume even when nobody is
connected remotely — the remote server is always on.

**Mechanism.** `youcoded/desktop/src/main/remote-server.ts` `onPtyOutput` keeps one
string per session (`PTY_BUFFER_SIZE = 4 MB`): `buf += data`, then `buf.slice(…)` when
over the cap. Once a busy session's buffer is full, every chunk re-allocates and copies
~4 MB — and this runs unconditionally, whether or not any WebSocket client exists.
<!-- claim: {"path": "youcoded/desktop/src/main/remote-server.ts", "contains": "buf \\+= data;"} -->

**Fix shape** (from the 2026-07-10 review): keep a chunk array with a running byte
count, trim whole chunks from the head, join only at connect time, and early-return in
`broadcast()` when there are no clients. The hook-event replay buffer (10k events per
session) has the same unbounded-ish growth and takes the same treatment.

**History.** 2026-07-10 remote-access review Finding 2 (item 2 of the 2026-07-15 rework
umbrella); re-verified open 2026-08-26 in the handoff. Re-checked against `master`
2026-09-01: unchanged.
