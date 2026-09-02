---
date: 2026-09-01
status: active
type: investigation
topic: A send() arriving during the one-macrotask window of a cross-device takeover runs a full turn before the handoff
---

# `NativeSessionHost.quiesce()` has a one-macrotask window in which `send()` is not refused

**Symptom.** During a cross-device takeover of a native session, a message sent in exactly the wrong instant runs a full uninterrupted turn on the old device before the handoff proceeds. Not a correctness bug — the flush still happens after — just a narrower race than the design intends. Found in the M2 final review.

## Mechanism (re-checked against master 2026-09-01)

`quiesce()` (`youcoded/desktop/src/main/harness/native-session-host.ts:3883`) clears the send queue synchronously, then awaits one macrotask before aborting — deliberate, so a `send()` issued in the same tick can finish its deferred dispatch:
<!-- claim: {"path": "youcoded/desktop/src/main/harness/native-session-host.ts", "contains": "setImmediate\\(r\\)\\);\\s+// \\(2\\) let a same-tick send dispatch"} -->

A `send()` that arrives DURING that macrotask is not refused (`rg -c quiescing native-session-host.ts` → 1, a comment; no flag exists), so it starts a turn that runs to completion before the abort lands.

## Fix shape

A `quiescing` flag set before the macrotask await, checked by `send()`, refusing honestly the way the existing queue-full case does.

## History

Added 2026-07-23. Re-verified 2026-09-01.
