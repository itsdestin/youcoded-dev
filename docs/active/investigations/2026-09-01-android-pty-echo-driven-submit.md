---
date: 2026-09-01
status: active
type: investigation
topic: Android PtyBridge still submits long messages on a 600 ms timer
---

# Android PtyBridge: echo-driven submit

**What it is.** Desktop submits a long message by writing the body, waiting for the PTY to
echo its tail back, then sending `\r` — no timing assumption. Android still uses the older
scheme: for any send over `SAFE_ATOMIC_LEN` (56 bytes) `PtyBridge.writeInput` writes the
body, then sends `\r` from a 600 ms timer
(`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt` ~:195–246). The file's
own TODO at ~:206 describes the desktop path to mirror (observe the body's tail in
`_rawByteFlow` before sending `\r`).
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt", "contains": "\\}, 600\\)"} -->

**Why it matters.** A timer cannot know the text landed; a slow phone or a busy TUI can get
the Enter before the body, or on top of a menu that appeared during the gap (the deferred-
Enter gate at ~:232 is a patch on that second case). PITFALLS "PTY Writes → Android".

**History.** Added 2026-07-15 (PITFALLS sweep). Re-checked 2026-09-01: the 600 ms split and
its TODO are unchanged.
