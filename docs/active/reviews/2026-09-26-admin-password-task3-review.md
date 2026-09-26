---
status: active
feature: admin-password
review-round: task3
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
commit: a3a3aae43
---

# Admin password card — task 3 (AskpassServer + verification) — security review

Scope: `desktop/src/main/harness/askpass/{peer-cred,proc-info,verify,running-calls,askpass-server}.ts`
and their tests, commit `a3a3aae43`. Threat model: the model runs arbitrary shell code as the
same user and wants either the password or admin rights without the user seeing the real
command. Task 4/5 wiring (`bash.ts`, `PermissionBroker`, IPC) is out of scope — not built yet.

`npx vitest run tests/askpass-verify.test.ts tests/askpass-server.test.ts
tests/askpass-helper.test.ts`: 47 passed, 1 skipped (the same pre-existing packaged-layout skip
task 2 already explained — no regression).

**Empirically verified** (real koffi + a real child process, `/tmp/claude-1000/askpass-exp/`,
not against Destin's account): after `prctl(PR_SET_DUMPABLE, 0)`, `/proc/<pid>/exe`
(`readlink` → exit 1) and `/proc/<pid>/environ` (`EACCES`) become unreadable to **both** the
direct parent and an unrelated same-uid sibling (`setsid bash -c 'cat /proc/<pid>/environ'`),
while `/proc/<pid>/stat` and `/proc/<pid>/cmdline` **stay readable** throughout. This
validates: (a) design §2.7's whole premise that item-1 reads must happen before hardening; (b)
`askpass-server.ts`'s step-5 ordering — TracerPid, then startTime, then environ — is the right
order, because a helper that has actually **exited** (rather than hardened) fails at the
TracerPid read (`/proc/<pid>/status` gone → `linuxTracerPid` returns `-1`, fail-closed) or the
startTime read, before the code ever reaches the environ-EACCES check; a bare "environ read
failed" can't by itself be misread as "hardening succeeded" the way the review brief asked to
check, because stat/TracerPid staying readable is exactly what distinguishes "hardened, still
alive" from "gone, pid maybe recycled." **This decision (#4) is sound as implemented.**

**Checked and matching (no finding):**
- **Genuine-sudo check never touches `PATH`.** Unlike the helper wrapper's `dirname "$0"` bug
  (task 2, T2-2), `verify.ts`'s parent-is-sudo check resolves the peer's actual OS-level parent
  via `ppid()` → `exePath()` (kernel `/proc/<pid>/exe`, never a `PATH` search), so attacker move
  (a) ("plant a fake sudo earlier in PATH") has no surface here at all.
- **No secret/env value is ever logged.** Every `log(...)` call in `askpass-server.ts` passes
  only fixed `VerifyReason` strings or generic text — never argv, env, or password content.
  `deliver()`'s only write is the socket line itself.
- **Socket dir/file safety against a genuinely different-uid attacker holds**, because
  `chmod(dir, 0o700)` (called unconditionally after `mkdir`) requires the calling process to
  *own* the directory; a different-uid attacker pre-creating (or symlinking) the target path
  first leaves it owned by them, `chmod` throws `EPERM`, and `start()` bails with `available`
  false — it does not silently proceed into an attacker-controlled directory. Against the
  stated threat model (same-uid model), directory ownership provides no boundary either way —
  the attacker already has full read/write on anything the app's own uid can touch, socket
  file included, with or without a symlink trick.
- **Handshake order and timeouts match design §2.7 exactly**: v2 (no claimed identity trusted)
  → kernel peer pid → full item-0–5 chain while exe/argv/environ are still readable → harden
  request → harden confirmation → re-check (TracerPid, startTime, environ-EACCES) → only then
  `'ask'`. `HANDSHAKE_TIMEOUT_MS`/`HARDEN_TIMEOUT_MS`/`VERIFY_TIMEOUT_MS` (5s each) individually
  guard steps 1, 2 and 4; step 5's own reads and the post-ask UI wait are correctly left
  unbounded, matching the stated intent (sudo itself never times out an askpass read).
- **`main-blocking-calls.test.ts`'s ratchet does not, and structurally cannot, see the
  synchronous koffi `getsockopt`/`prctl`/`sysctl` FFI calls in `peer-cred.ts`/`proc-info.ts`**
  (its AST scan matches `fs`/`child_process` `*Sync` syntax, not FFI call expressions) — but
  these are single local-kernel syscalls with no disk/network wait, not the multi-second stalls
  the rule exists to catch, so this is a coverage gap in the *guard*, not a live perf bug.
  Worth a one-line mention to whoever next extends the allowlist tooling, not a blocker here.

---

## T3-1 accepted — Severity: Medium. The pidfd pin — the primitive meant to defeat pid recycling — is released before the highest-latency part of the protocol even starts

**File:** `desktop/src/main/harness/askpass/verify.ts:168-303` (the `finally` blocks that
`closeAll([helperPin])`/`closeAll([sudoPin])`/`closeAll([callRootPin])` as soon as
`verifyAskpassPeer()` returns); `desktop/src/main/harness/askpass/askpass-server.ts:415-506`
(steps 3-5: harden request, up to `HARDEN_TIMEOUT_MS` = 5s wait for the reply, then the
TracerPid/startTime/environ re-check).

**Problem:** `proc-info.ts`'s own doc comment says the pin exists to "prevent the KERNEL from
recycling the pid number for as long as it stays open" and that "callers MUST close() every
handle they open... regardless of verification outcome" — i.e., it's presented as the strong
protection, with the startTime comparison as the fallback for when it's unavailable. In
practice the helper's pin is opened, used, and closed entirely *inside* `verifyAskpassPeer()`
(item 0/1/2/3, `verify.ts`), all of which finishes before `askpass-server.ts` ever sends
`{"harden":true}`. From the moment `verify()` returns `ok:true` until step 5's final re-check —
spanning the full harden round trip, up to `HARDEN_TIMEOUT_MS` (5s) by design — **nothing pins
`cred.pid` at all.** Whatever protection exists in that window is *only* the unpinned
`startTime` comparison (`helperStartTimeBeforeHarden` vs. `startTimeAfter`), exactly the
weaker fallback the pin was built to avoid relying on.

In practice the exposure is narrower than "the whole 5s window" — the real helper is blocked
reading the same socket for the `{"harden":true}` line, so if it genuinely exited, the socket
would close and `readLine()` at `askpass-server.ts:456-461` would reject before step 5's proc
reads ever run, catching the case in a different way. The residual is the sub-window between
the helper's own `{"hardened":true}` write and this server's step-5 reads a few instructions
later — not "the whole round trip" as the pin's absence might suggest at first read. But: (a)
that narrower argument appears nowhere in a comment — a future editor reading "pin every
process the chain reads" (verify.ts's own header) would reasonably assume the pin covers the
whole ask, not just the pre-harden third of it; (b) the fix is nearly free — thread the
`PidHandle` verify.ts already obtained back out to the caller (or have `askpass-server.ts`
re-`pidfdOpen(cred.pid)` itself before step 3 and close it after step 5) — and would close even
that narrow residual for the cost of one extra syscall.

**Test gap:** no test in `askpass-server.test.ts` ever supplies a `reader.pidfdOpen` that
returns a real (non-null) handle, so nothing exercises whether a pin survives, or is expected
to survive, past `verify()`'s own return — the fake reader in that file always returns
`pidfdOpen: async () => null`, so this code path is entirely untested from the server's side.

**Fix:** either extend `VerifyOk` with the still-open `PidHandle` for the caller to hold and
close after step 5, or have `askpass-server.ts` independently `pidfdOpen(cred.pid)` right after
`verify()` succeeds and close it only after the step-5 re-check settles (pass/fail either way).
Document the actual (narrower) exposure once fixed, so residual risk claims in the design stay
accurate.

---

## T3-2 accepted — Severity: Medium. `attemptsBySudoPid` is keyed by a bare pid number with no starttime pinning — a recycled sudo pid across two *concurrently alive* calls misattributes the tries-left count

**File:** `desktop/src/main/harness/askpass/askpass-server.ts:125` (`attemptsBySudoPid = new
Map<number, { count: number; callRoot: number }>()`), `:512-517` (sweep + increment).

**Problem:** every other identity this feature tracks (the helper, sudo's own parent, the call
root) is checked against a pinned/recorded `startTime`, specifically because a bare pid number
is known to be reusable (design §3 item 0, review 2 E7). `attemptsBySudoPid` is the one place
that identity discipline isn't applied: it's keyed by `sudoPid` alone. The sweep at
`:512-514` only evicts an entry when *that entry's own* `callRoot` is no longer a registered
call — it does nothing to protect against the case where `sudoPid` N belonged to a call that
already finished and had its entry evicted... no wait: correctly, once evicted it's gone. The
real gap is the case the sweep *doesn't* catch: sudo process N under call root A is still alive,
recorded in the map; sudo process N number happens to also get reused for a brand-new,
unrelated sudo invocation under a *different, also still-alive* call root B (plausible in a
long-running app juggling many concurrent Bash sessions — this is normal pid churn, not an
adversarial recycling race). Since the sweep only removes entries whose `callRoot` has *exited*,
and A is still running, the stale `{count, callRoot: A}` entry for pid N survives; when B's sudo
also lands on pid N, `this.attemptsBySudoPid.get(N)` returns A's stale entry, and B's brand-new,
first-ever ask reports `attempt: <A's count>` instead of `0` — corrupting the "tries left"
banner the user sees for an entirely unrelated command. This doesn't grant the model extra sudo
attempts (sudo's own `passwd_tries` counter is authoritative and untouched by this), but it is
a genuine, non-adversarial correctness bug in exactly the mechanism this file names as one of
its own callouts (`review 2 E5`) as needing careful lifecycle handling.

**Test gap:** `askpass-server.test.ts`'s only attempt-counting test ("counts attempts per sudo
pid...") exercises the single intended case — the *same* callRoot, *same* sudoPid, retried
after a refusal. No test constructs two different call roots that end up sharing a sudo pid
number, and no test exercises the sweep actually firing (a callRoot exiting between two asks).

**Fix:** record `startTime` alongside `count`/`callRoot` in `attemptsBySudoPid` (the same
`RunningCallEntry`-style shape used elsewhere) and require a fresh `reader.startTime(sudoPid)`
match before treating a lookup as "the same sudo, retried" — a mismatch should be treated as a
brand-new `attempt: 0`, not a continuation.

---

## T3-3 accepted — Severity: Medium. `via` only reports the ONE process directly above sudo, silently dropping deeper wrapper chains, and silently falls back to "no script" when that one hop is unreadable

**File:** `desktop/src/main/harness/askpass/verify.ts:260-277`.

**Problem:** design §2.2's stated purpose of `via` is naming what's "between the approved call
and this particular sudo" so the user isn't shown a plain sudo command that's actually being
run by a script they didn't approve directly. The implementation computes `via` from exactly
one hop: `shellPid = ppid(sudoPid)`, then reads *that* process's argv. When the real chain is
call-root → script1.sh → script2.sh → sudo (two layers of indirection, easy to construct: a
downloaded installer that itself `source`s or execs a second helper script before calling
`sudo`), `via` reports only `script2.sh` — the existence of `script1.sh` is invisible to the
card entirely. `askpass-verify.test.ts`'s only `via` test (`accepts with via set when a script
sits between sudo and the call root`, line 159) constructs exactly one intermediate hop, so
this gap has zero coverage.

Separately, when `shellPid` itself can't be read (`reader.ppid(sudoPid)` returns `null` — e.g.
a transient proc-read failure, or a process that exited a moment after being walked), the code
takes the `else` branch and sets `via = undefined` (`:274-276`) — the same value used for the
genuinely direct, no-script case. A caller/card reading `via === undefined` as "the approved
shell ran sudo directly, nothing else was involved" cannot distinguish that from "we don't know
whether a script was involved" — the failure mode is silently indistinguishable from the safe
case, when it should be visibly distinguishable (this is display-only, not itself a security
boundary, but it is exactly the transparency guarantee R20 exists for).

**Fix:** walk the full chain from `sudoPid`'s parent up to (not including) `callRoot`,
collecting every hop's script basename, and show the whole chain (or at minimum a count/"…and
more" indicator) rather than only the nearest one. For the unreadable-hop case, return a
distinct sentinel (e.g. `via: '…'` or a boolean "unknown intermediate" flag) instead of
silently reusing the same `undefined` the direct case uses.

**Test gap:** no test constructs two or more intermediate script hops; no test makes the
intermediate hop's `ppid`/`cmdline` read fail to exercise the silent-`undefined` fallback.

---

## T3-4 accepted — Severity: Low. A timed-out `verify()` keeps running in the background, still holding its pidfd pins, after the connection has already been refused

**File:** `desktop/src/main/harness/askpass/askpass-server.ts:415-421` (`withTimeout(this.verify(cred.pid), VERIFY_TIMEOUT_MS, 'verify')`), `:549-563` (`withTimeout`'s implementation).

**Problem:** `withTimeout` races the real promise against a `setTimeout`, but never cancels or
even references the original promise on timeout — it just stops waiting on it. If `verify()`
(which, per T3-1, is doing real pidfd opens and sequential ancestor-walk /proc reads) is still
mid-flight when `VERIFY_TIMEOUT_MS` elapses, `askpass-server.ts` immediately writes the refusal
and moves on, but the abandoned `verifyAskpassPeer()` call keeps executing — its own `pin()`
calls and `closeAll()` cleanup still run to completion later, on their own schedule, invisible
to the caller. This is not a growing leak (the abandoned call does eventually clean up its own
handles via its `finally` blocks) but it is wasted work on a connection already decided, and —
combined with T3-1 — means the true, worst-case pin-hold time for a slow/hung ancestor walk is
longer than `VERIFY_TIMEOUT_MS` implies from reading `askpass-server.ts` alone.

**Test gap:** none of the three timeouts (`HANDSHAKE_TIMEOUT_MS`, `HARDEN_TIMEOUT_MS`,
`VERIFY_TIMEOUT_MS`) or the `MAX_LINE_BYTES` byte cap have a test that actually triggers them —
every existing test drives the happy or immediately-refused path. A slow/hanging fake `verify`
or a client that never sends a line would be cheap tests to add.

**Fix:** low priority given the eventual self-cleanup; if addressed, thread an `AbortSignal`
(or a cancellation flag checked between awaits) through `verifyAskpassPeer()` so a timed-out
caller can actually stop the walk rather than merely stop waiting on it.

---

## T3-5 accepted — Severity: Low. `deliver()` materializes the password as an un-zeroable JS string before writing it — same class of gap task 2 flagged on the helper's own side (T2-7)

**File:** `desktop/src/main/harness/askpass/askpass-server.ts:256` (`JSON.stringify({ ok:
true, password: password.toString('utf8') }) + '\n'`).

**Problem:** `password.fill(0)` (`:263`, in the `finally`) zeroes the original `Buffer` the
caller handed in, but `password.toString('utf8')` and the subsequent `JSON.stringify(...)`
each allocate a new, immutable V8 string holding the plaintext password; neither is reachable
to zero afterward. Task 2's review (T2-7) already accepted this exact tradeoff on the helper
side ("the process exits almost immediately... so in practice this is mostly theoretical") —
the same reasoning applies here (the socket write and `password.fill(0)` happen back-to-back,
long before any GC would run), so this is not a new risk, just the same accepted residual now
present on both ends of the wire. Noted for completeness since the review brief asked
specifically about resource handling around the password buffer; no action needed beyond what
T2-7 already recommended (correct the class of claim in comments if any exist here — none do
in this file, so nothing to fix at the comment level).

---

## Judging the four stated decisions

1. **`via` derivation** — directionally right (walks up from sudo, labels the intervening
   script), but incomplete: single-hop only, and silently indistinguishable-from-"direct" on a
   read failure. See T3-3.
2. **Attempt counter lifecycle** — the *eviction* half (sweep on exited call roots) is correct;
   the *identity* half is not pinned the way every other pid in this feature is, so a
   coincidental pid-number collision between two live calls misattributes the count. See T3-2.
3. **Pre-harden starttime baseline** (`helperStartTimeBeforeHarden`, read in
   `askpass-server.ts` independently of `verify.ts`'s own internal starttime check) — this is
   *correct and necessary*: because `verify.ts` never exposes the helper's starttime to its
   caller, and because a race between `askpass-server.ts`'s baseline read and `verify.ts`'s own
   first internal read would, if it ever substituted a different process, make the two values
   disagree (not coincidentally agree) — so step 5 fails closed on that race rather than passing
   vacuously. No finding here.
4. **Null environ as EACCES proof** — validated empirically against real `/proc` (see the top
   of this review): the step-5 ordering (TracerPid, then startTime, then environ) means a
   helper that simply exited and had its pid recycled is caught by the TracerPid/startTime
   reads before the environ check is ever reached, so a bare "environ read failed" cannot by
   itself be mistaken for "hardening succeeded." Sound as implemented.

---

## Summary

| ID | Severity | One-line |
|----|----------|----------|
| T3-1 | Medium | Pidfd pin closes as soon as `verify()` returns, before the harden round-trip and step-5 re-check — the strong anti-recycling primitive doesn't cover the window it's most needed for, though live-socket semantics narrow the real exposure; untested and undocumented as such |
| T3-2 | Medium | `attemptsBySudoPid` keyed by bare pid with no starttime check — a pid reused across two concurrently-alive calls misattributes the tries-left count (UX/correctness, not privilege escalation) |
| T3-3 | Medium | `via` only reports one hop above sudo and silently reports "direct" when that hop is unreadable — multi-layer wrapper scripts and read failures both lose the transparency R20 exists for |
| T3-4 | Low | Timed-out `verify()` keeps running and holding pins in the background; no test exercises any of the three timeouts or the byte cap |
| T3-5 | Low | `deliver()`'s `password.toString('utf8')`/`JSON.stringify` create un-zeroable string copies — same accepted class as T2-7, now on the server side too |

No Critical/High findings. The four design decisions singled out for judgment: #3 (pre-harden
starttime baseline) and #4 (null-environ-as-EACCES-proof) are sound as built and now
empirically confirmed against real `/proc` semantics; #1 (`via`) and #2 (attempt counter) have
real, fixable gaps (T3-3, T3-2). The verification chain's core claims — genuine setuid sudo by
properties not PATH, exact exe/argv/env matching, ancestor-walk-to-registered-root, fail-closed
on every unreadable/`null`/exception path I traced — held up under review; the one place the
"pin everything" primitive doesn't quite live up to its own doc comment is T3-1.
