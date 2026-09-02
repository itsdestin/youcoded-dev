---
date: 2026-09-01
status: active
type: investigation
topic: A session holder in lease-file fallback mode never notices it was taken over while the SyncHub is down
---

# Takeover holder can't detect lease loss while the SyncHub is down

**Symptom.** With the SyncHub unreachable, force-take-over a session from a second install. The original holder never interrupts, never flushes, never shows the "moved" pill, and keeps rewriting its lease file — two installs ping-pong the file. Confirmed from instrumented logs during the M2 dev repro (2026-07-23). Provider-agnostic (CC + native).

**Mechanism.** Lease *presence* has two transports — the hub, and the lease-file fallback (`youcoded/desktop/src/main/conversations/lease-client.ts`) — but loss *detection* lives only in the hub renew branch of `renewTick`: it inspects the reply from `opts.hubRequest('renew', …)` and tears down when the reply's holder is another device. When the hub is down that request resolves `null`, and by the never-block rule the client holds optimistically and rewrites its lease file every tick. Nothing in the fallback path reads the other install's lease file to notice the holder changed.

Loss detection hangs entirely off the hub renew reply:
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/lease-client.ts", "contains": "await opts\\.hubRequest\\('renew', sessionId, opts\\.deviceId\\)"} -->

Note: lease files moved out of the synced Personal space to `userData` (`fbc5d296`, 2026-07-30), so on *different* machines the file fallback can no longer see a peer's lease at all; the same-machine dogfood config (dev instance + built app sharing the dir) is where this still bites. Related parked idea: file-based takeover *request* signalling for the same-machine case (same roadmap file).

**Fix shape.** On a null hub reply, compare the on-disk lease file's holder against self before rewriting it; a foreign holder is a loss — tear down with attribution the same way the hub branch does.

**History.** Added 2026-07-23 (M2 dev repro; the misleading "isn't responding" dialog copy was fixed separately in PR #212). Re-checked 2026-09-01: renew branch unchanged, still open.
