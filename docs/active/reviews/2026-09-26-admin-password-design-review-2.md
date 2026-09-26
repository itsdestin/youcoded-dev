---
status: active
feature: admin-password
review-round: 2
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
prior-review: docs/active/reviews/2026-09-26-admin-password-design-review-1.md
---

# Admin password card — design review 2

E1 accepted — wrapper sets `ulimit -c 0`; askpass.cjs first calls prctl(PR_SET_DUMPABLE, 0) (Linux) / ptrace(PT_DENY_ATTACH) (macOS) via koffi, then refuses to connect if TracerPid ≠ 0; the server re-checks TracerPid. This also closes the ancestor-ptrace residual. **Blocker.** `env -i` (D1's fix) scrubs environment *variables* only. It does nothing to
rlimits, cwd, umask or inherited fds, all of which pass unchanged through
`fork()`+`setuid()`+`exec()` from the model's own command, through sudo, into the askpass
child — and the askpass child ends up as an ordinary, fully unprivileged process of the
model's own uid, not specially protected.

Confirmed against sudo's actual source (`sudo_askpass()` in `src/tgetpass.c`, fetched
2026-09-26): the child forks, then does
`setuid(ROOT_UID)` → `closefrom(...)` → `setgid(cred->gid)` → `setuid(cred->uid)` →
`execl(askpass, askpass, prompt, NULL)`. After that sequence, real uid == effective uid ==
the invoking user's own uid. Per Linux's dumpable-flag rule (`fs/exec.c`,
`SUID_DUMP_USER`/`SUID_DUMP_ROOT` logic — confirmed via kernel docs/commit history): a
process is only forced non-dumpable across exec when its effective and real uid *differ*;
here they're equal, so the askpass process is dumpable=1 — a completely ordinary process,
subject to `RLIMIT_CORE` and to same-uid `ptrace`/signal delivery exactly like anything else
the user runs. Nothing sudo does, and nothing `env -i` does, changes this.

A command run **before** the approved `sudo` line — in the same script, or in a separate
Bash tool call, since RLIMIT_CORE/umask/cwd are shell/session state, not per-command — can
do:
```
ulimit -c unlimited
cd ~/tmp-i-can-read      # core file lands here (default core_pattern is "core" in cwd)
sudo -A the_approved_command
```
Then, once the card is showing and the model wants the password, it locates the live
askpass process (trivial: `pgrep -P "$(pgrep -f the-approved-sudo-pid)"`, or just scan
`/proc/*/comm` for the runtime's basename under the known sudo pid — same-uid `/proc` is
fully readable to the model) and sends it a core-dumping signal (`SIGQUIT`/`SIGABRT`/
`SIGSEGV`) — permitted because signal delivery only requires matching uid, **not**
ancestry, and the model already knows its own process tree. The resulting core file
contains the just-received plaintext password (the window between `{ok:true,password}`
arriving and the buffer's `.fill(0)` is not synchronously atomic with signal delivery — a
crash lands before, during, or shortly after the JSON parse) and the model reads it back
with its own Bash/Read tools. No socket forgery, no `/proc` spoofing, none of §3's five
checks are ever touched — this defeats R13/R15 entirely from the *outside* of the
verification model.

This is **not** the residual risk the design already accepts. §3's "S-real-sudo" note
names only *ptrace of the helper by its own ancestor* — the mechanism here needs no
`ptrace` call at all (plain signal delivery, same-uid, ancestor or not) and, separately,
`ptrace`-by-ancestor is not even guaranteed to be the binding constraint here; the design's
own residual-risk framing undersells how ordinary this attack surface is.

**Fix:** the askpass wrapper (or `AskpassServer` before it ever execs the runtime) must
reset `RLIMIT_CORE` to 0 unconditionally — `ulimit -c 0` is a shell builtin, costs nothing,
and is not cleared by `env -i` (rlimits are a separate namespace). Also worth doing
regardless of ulimit: call `process.setgroups`? — no JS API exists for `prctl`, so this
needs a koffi `prctl(PR_SET_DUMPABLE, 0)` call as the very first thing `askpass.cjs` does
(same technique OpenSSH's agent uses for exactly this threat), which additionally blocks
same-uid ptrace and core dumps regardless of what the wrapper/ulimit did or didn't do —
belt AND suspenders, since the wrapper's `ulimit -c 0` can itself be bypassed if the model
finds another way to invoke the runtime that skips the wrapper (it can't, per §3, but
`PR_SET_DUMPABLE` doesn't depend on that argument at all). Zero the password buffer
*before* doing anything else observable (already true) but also treat "signaled or
core-dumped while holding the password" as the primary threat, not "ptrace by an ancestor."

E2 accepted — macOS reads argv/env via sysctl(KERN_PROCARGS2) through koffi, never `ps`; it must be proven on a real Mac before the Mac half is switched on, and any unreadable result fails closed with a logged reason. **Blocker.** D1's fix (verify the helper's environment exactly, via `/proc/P/environ` on
Linux, `ps -Eww` on macOS) **cannot be evaluated on macOS with System Integrity Protection
enabled** — which is the out-of-the-box, unmodified state of every consumer Mac. Confirmed
by search: with SIP on, `ps -Eww`/`ps auxwwe` shows environment **only for the caller's own
process**, never another process's, even at the same uid; SIP is specifically the mechanism
enforcing this (turning SIP off, which requires Recovery Mode and is not something the app
can do or ask Destin's users to do, restores the old permissive behavior). `AskpassServer`
is a different process (Electron main) than the askpass child it's trying to inspect, so
`ps -Eww -p <askpass-pid>` returns **no environment field at all** for that pid on the
overwhelming majority of real Mac installs.

This directly breaks the one check D1 was written to add. Two ways this plays out, both
bad:
1. If the implementation treats "ps produced no ENVIRON column" as "environment does not
   match the allowlist" → **fail closed** → the admin-password feature silently never works
   on macOS (every `sudo` fails with "no askpass program available"), contradicting R19
   ("this is for Mac and Linux") with no diagnostic pointing at the real cause (the same
   class of silent-degradation risk D5 already flagged for the sudo-path lookup).
2. If the implementation treats "no data" as "nothing to disagree with" and passes the
   check by default (the natural bug for whoever ports the Linux `/proc/P/environ`
   parser to macOS and finds `ps` returns an empty environment field instead of an error) →
   the entire NODE_OPTIONS-injection defense D1 added is **silently absent on every real
   Mac**, and E1-style code-injection-via-inherited-env (the original D1 blocker) is back,
   full strength, on the platform the design explicitly claims to cover.

**Fix:** don't use `ps` for this on macOS at all — read the raw argv/envp block directly via
`sysctl(KERN_PROCARGS2)` (the same primitive `ps` itself uses internally), through koffi,
exactly as the design already reads `/proc/P/environ` directly on Linux rather than
shelling out to a Linux `ps`. This sidesteps the SIP-gated *display* path (SIP restricts
what `ps` will *print*, not necessarily what a same-uid process can query via the syscall
directly for its own descendants — but this must be verified empirically before shipping,
not assumed; if `sysctl(KERN_PROCARGS2)` is *also* gated for non-ancestor processes, the
whole environment-exactness check needs a different design on macOS, and that must be
stated rather than silently degrading).

E3 accepted — same fix as E2 (NUL-separated KERN_PROCARGS2, no text parsing). **Major.** Even where `ps -Eww` *does* return data, its environment dump is unescaped,
space-joined `KEY=VALUE KEY=VALUE …` text with no delimiter for a value that itself
contains a space or an `=`. An "environment is EXACTLY these two entries" check implemented
by splitting that text on whitespace has no way to distinguish one variable with an
embedded `KEY=VALUE`-shaped substring in its value from two separate variables — the parse
is fundamentally ambiguous, not just fiddly. The design's own Linux side avoids this
correctly (`/proc/P/environ` is NUL-separated, unambiguous); the macOS side as specified
(`ps -Eww`) reintroduces exactly the class of parsing hazard the Linux side was designed to
avoid. Same fix as E2: read `KERN_PROCARGS2` directly rather than parsing `ps` text.

E4 accepted — §2.2 now specifies the broker change: `PendingAsk` gains `kind`, `requestEventFor` takes the event type, `pendingEventsFor` replays both kinds; the socket write-back stays in AskpassServer keyed by the same requestId. **Major.** D4 ("route `PasswordRequest`/`PasswordResolved` through `PermissionBroker`'s
existing heartbeat-and-replay machinery") was marked accepted, but the round-2 design's
§2.2 still only says pending asks "live in `PermissionBroker`'s pending map as a new kind" —
one sentence, unchanged in substance from what D4 objected to. Reading the actual broker
(`desktop/src/main/harness/permission-broker.ts`): `PendingAsk` is not a variant type, it is
one concrete shape — `{ sessionId, raisedBy?, resolve: (d: AskDecision) => void,
announcement }` — and `resolve` is typed to `AskDecision` (`behavior: 'allow'|'deny'|
'canceled'`, `grantScope`, `dismissed`, …), which has no field that means "here is the
password" or "here is the socket to write it to." `requestEventFor()`/`emitAnnouncement()`
hardcode `type: 'PermissionRequest'` — the ONE place that shape is built, per its own
comment — and `pendingEventsFor()`'s reconnect replay reuses that same hardcoded builder.
None of this is "a new kind" of an existing polymorphic structure; it is monomorphic code
that would need to branch three separate places (the entry shape, the emitted event type,
and the replay path) to carry a password ask at all, and the design doesn't say how. The
practical risk is exactly what D4 was raised to prevent: whoever implements "as a new kind"
without reconciling this ends up bolting on a **second, parallel pending map** next to
`PermissionBroker`'s (which is what §2.2 elsewhere literally proposes: "The server keeps
only `requestId → {socket, sudoPid, callRoot}` for the write-back" — a distinct map, not the
broker's) — reintroducing the exact un-recovered-hang failure mode D4 named, just with the
broker's `pending` map sitting unused right next to it.

**Fix:** make the reuse concrete before implementation starts — e.g. generalize
`PendingAsk.resolve` to a union (`AskDecision` ask | password-delivery ask with its own
resolve shape), parameterize `requestEventFor`'s `type` field, and thread
`PasswordRequest`/`PasswordResolved` through `pendingEventsFor`'s existing replay loop. If
that refactor is out of scope for this feature, say explicitly that `AskpassServer` gets its
*own* heartbeat+replay (a real implementation, not "ride the broker's"), sized the same way,
rather than leaving the sentence from review 1 unresolved.

E5 accepted — a Set of toolCallIds, not a counter. **Major.** §5's "forget on last exit" fix for D6 (accepted) is described only as "a
count across calls." The design doesn't say whether that count is incremented once per
*call* that receives a password, or once per *password delivery* — and those differ the
moment a single call authenticates more than once, which §5 itself says is expected and
intended (D7, "a sudo under a different parent … asks again through the mid-command card").
A pipeline like `echo x | sudo tee a; sudo tee b` inside one approved command produces two
separate askpass rounds under two different parent pids, i.e. two password deliveries, for
one call. If the counter increments per-delivery (2) but decrements per-call-exit (1, when
that one call finally exits), it never returns to zero for the rest of the app's lifetime —
`sudo -K` silently stops firing forever after the first multi-`sudo` call, quietly breaking
R5 ("the app makes your computer forget the password") for every subsequent admin command,
with nothing in the UI or logs to say so.

**Fix:** track membership, not a count — a `Set<toolCallId>` of calls that have received at
least one password, added to (once, idempotently) on first delivery per call, removed on
that call's exit; run `-K` when the set becomes empty. This can't drift regardless of how
many times one call re-authenticates.

E6 accepted — startup self-test over a real loopback connection; the feature fails closed (never falls back to a self-reported pid). **Major.** §2.2 says AskpassServer gets the peer pid "the way `window-exclude-capture.ts`
already calls into system libraries" — but that file's koffi use only ever calls into
`user32.dll` given a native `HWND` Electron itself hands over
(`win.getNativeWindowHandle()`); it never needed a raw fd from a Node object, and is not
evidence this is easy. `net.Socket` (what `AskpassServer`'s unix-socket server hands the
`'connection'` listener) has **no public API for its underlying fd** — confirmed by
searching Node's own tracker: getting a native handle out of an existing `net.Socket`
"doesn't seem possible … via addons" through documented means. The only real route is the
undocumented `socket._handle.fd` (a common, but explicitly unstable/private, technique this
design's own text never mentions using). Two consequences the design doesn't address:
1. It can silently stop working on a future Electron/Node bump (`_handle` internals are not
   covered by semver), with no test in §9 that would catch it — `askpass-server.test.ts` as
   scoped ("real unix socket, stub verifier") tests the server's own logic with a *stubbed*
   verifier, not that `_handle.fd` still resolves to a valid, correct fd on the shipped
   Electron/Node build.
2. The design never says what happens if `_handle.fd` is ever `undefined` or wrong at
   runtime. If the fallback is (or silently becomes, under a "best effort" implementation)
   trusting the connection's self-reported `pid` from `{v:1, pid}` instead, that is a full
   regression to exactly the D3 vulnerability review 1 already closed.

**Fix:** add a startup self-test (not just a stubbed-verifier unit test) that opens a real
loopback connection to the real socket and asserts `_handle.fd` is a valid small integer
whose `SO_PEERCRED`/`LOCAL_PEERPID` matches `process.pid`'s own known peer — fail the whole
feature loudly (never silently degrade to the self-reported pid) if it doesn't.

E7 accepted — Linux pins processes with pidfd_open and re-checks /proc starttime after the chain; macOS compares kinfo_proc start times; RunningCalls stores the root's start time too. **Major** (the review brief's own focus item). `getsockopt(SO_PEERCRED)` on Linux is
latched to the pid that called `connect()` and doesn't change for the life of that
connection, so it is *not* independently re-readable/racy — good, and it correctly answers
"who connected," closing D3's original gap. But every check *after* that (P's real exe,
argv, environ; P's parent's identity; walking P's ancestors to a `RunningCalls` root) reads
live `/proc` state by that bare pid number, sequentially, with no verification that pid P
(or any ancestor pid found along the way) is still the *same process instance* it was when
first read — none of the code checks `/proc/<pid>/stat` field 22 (`starttime`), which is the
standard way to detect that a pid number has been recycled between two reads of it. The
same bare-pid trust also appears in `RunningCalls` (`root pid → {sessionId, toolCallId}`,
keyed purely by pid, cleared "on exit" with no atomicity guarantee against a same-tick
respawn reusing that exact pid) and in the up-front password hand-off (§2.4), which resolves
via the ancestor walk's `callRoot` pid.

In practice this needs the attacker to win a race that's hard to engineer deliberately
(spawn, connect, die, and have a *new* process recycle the exact freed pid, all before a few
synchronous `/proc` reads complete) — I don't have a working exploit for it, and the
severity should be read as "real gap, low measured exploitability" rather than an
open door. But it's cheap to close outright and the review brief specifically asked for it
to be checked, so it shouldn't ship unaddressed.

**Fix:** record each pid's `starttime` (`/proc/<pid>/stat` field 22) the first time it's
read (peer pid, each ancestor, `RunningCalls` root) and re-check it against a fresh read
after finishing the check chain, discarding the whole verification if any pid's incarnation
changed mid-check. On Linux 5.3+, `pidfd_open()` (reachable via koffi) is the cleaner
primitive — it pins the exact process instance and can be polled for exit — and would also
let `RunningCalls` detect "this pid died and was reused" without a separate starttime
comparison.

E8 rejected — the copy is contract-approved and already hedged ("may lock you out"); it is true on Destin's system (Arch/CachyOS ship pam_faillock deny=3 unlock_time=600). **Minor.** R10/R17 promise "another wrong password may lock you out of admin actions for
about 10 minutes." That specific behavior (a timed lockout after repeated failures) is a PAM
policy (`pam_faillock`/`pam_tally2`, `deny=3 unlock_time=600`-style config) — it is not
something `sudo` itself does, and it is **off by default** on stock Ubuntu/Debian, Arch, and
macOS (which doesn't use PAM faillock for local sudo at all). §6 only discusses
`passwd_tries`/`triesLeft` counting; nothing in the design detects whether the running
system's PAM stack would actually lock the account out. On most systems this contract row's
"~10 minutes" warning is simply not true — a fourth attempt just prompts again (a new
`triesLeft` cycle) rather than locking anything.
**Fix:** either soften the copy to something that holds everywhere ("sudo will stop trying
after 3 wrong passwords for this command" — true regardless of PAM config) or explicitly
detect the configured PAM lockout policy before showing a specific duration, and say on the
deck which systems the "~10 minutes" wording was actually verified against.

E9 accepted — stated in §4 as the known limit of every floor (an interpreter can still exec pkexec). **Minor.** D2's fix (refuse `pkexec`/`run0`/`su`/`doas` outright, by literal command
word, before spawning) correctly prevents the OS polkit dialog for every case the floor can
see — but it is the same class of floor as every other Bash guard in this codebase, which
this workspace's own doctrine already states plainly is "honest friction, NOT a sandbox":
`shell-words.ts` parses shell syntax, not the body of an interpreter script. A command that
invokes `pkexec` indirectly — `python3 -c "import os; os.execvp('pkexec', ['pkexec', …])"`,
a compiled helper, `perl -e` — never contains the literal word `pkexec` as a shell simple
command and passes `admin-command.ts`'s floor undetected, letting the real desktop polkit
dialog appear despite R1's "never a separate system pop-up" promise. Not a regression from
D2 and not worth a blocker (it's the accepted limitation of every floor in this codebase),
but worth stating explicitly against R1/R14 rather than letting D2's "refused outright"
read as an unconditional guarantee.
