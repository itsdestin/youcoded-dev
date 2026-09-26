---
status: active
feature: admin-password
review-round: task2
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
commit: 607945d9420f4b469dc647a20315e59c6fe300e7
---

# Admin password card — task 2 (askpass helper + packaging) — security review

Scope: `desktop/scripts/askpass/youcoded-askpass`, `desktop/scripts/askpass/askpass.cjs`,
`desktop/electron-builder.yml`'s `asarUnpack` addition, `desktop/tests/askpass-helper.test.ts`,
all as of commit `607945d94`. Threat model: the model runs arbitrary shell code as the same
user and wants the password this helper briefly holds (or wants to defeat the "the user is
asked" guarantee). `AskpassServer` (§2.2/§3 verification chain) is task 3, not yet built —
findings below note where task 2's own file is the only thing standing between the model and
an outcome, versus where task 3 is expected to close the gap.

`npx vitest run tests/askpass-helper.test.ts`: 7 passed, 1 skipped (the packaged-layout
sub-test, skipped with an on-record reason — `@electron/asar` is not a devDependency;
confirmed with `grep -i asar desktop/package.json`, no hits). All experiments below were run
against the real, unmodified shipped files under `/tmp/claude-1000/`.

**Checked and matching (no finding):** the wrapper's `env -i ELECTRON_RUN_AS_NODE=1
YOUCODED_ASKPASS_SOCKET="$YOUCODED_ASKPASS_SOCKET" "$YOUCODED_ASKPASS_RUNTIME" "$dir/askpass.cjs"`
does produce a process whose environment is exactly `{ELECTRON_RUN_AS_NODE,
YOUCODED_ASKPASS_SOCKET}`, matching design §3 item 1's literal requirement. Because `env -i`
is an exact allowlist rather than a blocklist, no Electron-specific env var (`NODE_OPTIONS`,
`LD_PRELOAD`, `ELECTRON_*`, etc.) can ride through regardless of name, as long as the
allowlist itself isn't tampered with — see T2-1 and T2-2 for where that "as long as" breaks.
`electron-builder.yml`'s `node_modules/koffi/**` addition matches design review 3 (F1)'s
proven fix exactly.

---

## T2-1 rejected (the helper only RECEIVES a password; a rogue socket can feed sudo a password but never learn one — a command that knew the password could already pipe it to `sudo -S`, and wrong tries toward the lockout are equally reachable that way) — Critical: `YOUCODED_ASKPASS_SOCKET` is read from the same untrusted, per-command
overridable environment that D1 already proved hostile, silently redirecting the *real,
verified* helper to a socket the model owns

**File:** `desktop/scripts/askpass/youcoded-askpass:62`

**Problem:** The wrapper's own `env -i` allowlist forwards `YOUCODED_ASKPASS_SOCKET` through
by reading it from `$YOUCODED_ASKPASS_SOCKET` — i.e., from the wrapper's *own* inherited
environment, which is exactly the same "sudo forks askpass with its own unsanitised process
environment" surface D1 (review 1) already proved hostile for `NODE_OPTIONS`. `env -i`
protects the *set of variable names* that can reach the runtime, but for the one name whose
*value* is itself security-relevant (which socket to trust), the wrapper takes that value
from the attacker-influenced ambient environment, no differently than a naive script would
have taken `NODE_OPTIONS`.

The design's own §2.3 acknowledges the general shape of this ("a command can still override
[`SUDO_ASKPASS`, `YOUCODED_ASKPASS_SOCKET`, `YOUCODED_ASKPASS_RUNTIME`] for itself") but its
"nothing leaks" conclusion is drawn only from the `SUDO_ASKPASS=x` example, where the
*attacker's own script* runs instead of ours — trivially harmless because that script was
never going to touch our infrastructure anyway. Overriding **only** `YOUCODED_ASKPASS_SOCKET`
while leaving `SUDO_ASKPASS` pointed at our real wrapper is a different case the design never
separately reasons about: our real, unmodified, fully-hardened `askpass.cjs` — the exact
binary that will pass every one of §3's real-exe/argv/env checks — ends up connecting to a
socket the model chose, not the app's real `AskpassServer` socket. The real `AskpassServer`
never receives a connection at all, so none of §3's verification is ever exercised for this
case (it isn't a bypass *of* §3 — it's a way to never reach it).

Concretely, this means: no card is ever shown to Destin; the model can feed sudo an arbitrary
string as "the password" and observe sudo's own exit code/stderr to test password guesses,
as many times and as fast as it likes, entirely outside the UI/consent flow the whole feature
exists to provide (defeats R7/R16/R20's "visible sudo" and R9/R17's tries/withdrawal
banners — there's simply no card). It does not hand the model the *real* password (the model
only sees what it itself put in its own fake reply), but it does turn the feature into a
silent, invisible channel for repeatedly attempting sudo authentication — worse than the
`SUDO_ASKPASS`-override case because a process inspection (`ps`, `/proc/<pid>/exe`,
`/proc/<pid>/cmdline`) of the resulting process looks *exactly* like the legitimate flow (real
binary, real argv, real allowlisted env) — an auditor comparing "did the real helper run"
would see yes, while the actual socket it talked to was the attacker's.

**Evidence:** reproduced end-to-end against the real, unmodified `youcoded-askpass`:

```
$ env SUDO_ASKPASS="$WRAPPER" YOUCODED_ASKPASS_SOCKET="$REAL_SOCK" \
      YOUCODED_ASKPASS_RUNTIME="$(which node)" sh -c '
    YOUCODED_ASKPASS_SOCKET="'"$EVIL_SOCK"'" "$SUDO_ASKPASS"
  '
EVIL SERVER: got a connection instead of the real AskpassServer!
GUESS-attempt-42
EVIL SERVER received handshake: {"v":1}
wrapper exit=0
```

The "real" socket (standing in for `AskpassServer`) never received a connection. The wrapper,
run completely unmodified, connected to the rogue socket and printed the rogue server's
chosen string to stdout — exactly what sudo would treat as the user's password, with no card
ever involved. (First confirmed the underlying shell semantics in isolation: `export
FOO=real; sh -c 'FOO=evil env | grep FOO'` → `FOO=evil` — a per-command prefix assignment
always wins over an already-exported value of the same name, for that command's own process
tree, which is exactly the relationship between the harness's `spawnEnv` and the model's own
command text.)

**Fix:** don't derive the trusted socket path from anything read out of a shell environment
variable at askpass-run-time at all — that namespace is, by this design's own D1 finding,
fully attacker-writable for any single invocation regardless of what the harness exports
around it. Bake the socket path into the wrapper's own script *content* instead (have
`AskpassServer` write/template a per-run `youcoded-askpass` — or a tiny per-run stub it
execs — with the socket path as a literal string in the file, not read from `$VAR`); file
content is not something the model's command text can override the way an env var can. If a
literal per-run file isn't feasible, at minimum treat this as a residual risk that must be
named explicitly (it currently isn't, anywhere in the design or its reviews) rather than
folded silently into the already-accepted, differently-shaped `SUDO_ASKPASS`-override case.

---

## T2-2 accepted — High: the wrapper resolves its own directory via `dirname`, an external command
looked up through the same untrusted, unscrubbed PATH — before `env -i` ever runs

**File:** `desktop/scripts/askpass/youcoded-askpass:34` (`dir=$(dirname "$0")`)

**Problem:** `dirname` is not a POSIX shell builtin (confirmed: `type dirname` → `/usr/bin/dirname`,
an external binary). It is invoked by bare name, resolved through `PATH`, which at that point
in the script is still the model's own unsanitised, inherited `PATH` — `env -i` doesn't run
until the final line. A `PATH` entry planted ahead of the real `dirname` (trivial for the
model: it already has arbitrary shell execution) makes the wrapper's `$dir` — and therefore
the very file it `exec`s as "askpass.cjs" — attacker-chosen, before any of the wrapper's own
hardening logic (which all lives inside `askpass.cjs`, not the wrapper) has a chance to run.

This is the same *class* of bug as D1 (untrusted ambient state reaching the process that ends
up running as the verified helper), just via `PATH`/external-command-lookup instead of
`NODE_OPTIONS`, and it is not named anywhere in the design's enumerated attacker moves
(a)–(e) or the accepted residual risk. Today it is only stopped by `AskpassServer`'s
real-argv check (§3 item 1, "P's argv is EXACTLY `[execPath, <realpath of bundled
askpass.cjs>]`") — a check that lives entirely in task 3, not yet built, and that this task's
own file does nothing to make redundant. If that check is ever loosened (e.g. to a basename
or prefix match — a plausible-looking simplification for a future editor) this becomes a full
bypass with zero additional attacker capability required.

**Evidence:** reproduced against the real, unmodified wrapper:

```
$ env -u YOUCODED_ASKPASS_SOCKET PATH="/tmp/claude-1000/fakepath:$PATH" \
      YOUCODED_ASKPASS_RUNTIME="$(which node)" "$WRAPPER"
EVIL RAN, argv=["/usr/bin/node","/tmp/claude-1000/evil/askpass.cjs"] env={"ELECTRON_RUN_AS_NODE":"1","YOUCODED_ASKPASS_SOCKET":""}
```

where `/tmp/claude-1000/fakepath/dirname` is a two-line script that ignores its argument and
prints `/tmp/claude-1000/evil` unconditionally. The wrapper `exec`'d
`/tmp/claude-1000/evil/askpass.cjs` — an entirely different file — under the *correct* runtime
path and the *correct* 2-variable allowlisted environment.

**Fix:** remove the PATH dependency entirely; POSIX parameter expansion needs no external
command: `dir=${0%/*}` (falls back to `.` when `$0` has no `/`, which `cd "$dir" && pwd -P`
already handles). This is a one-line change with no behavior difference on any path that
currently works, and it closes the gap unconditionally rather than relying on a
not-yet-implemented downstream check.

---

## T2-3 accepted — Medium: no test proves the resulting process environment is *exactly* the
two-variable allowlist — only one specific bypass attempt is tested

**File:** `desktop/tests/askpass-helper.test.ts` (describe block iii, `env -i blocks a
caller-set loader hijack`)

**Problem:** The suite's only environment-scrubbing test sets `NODE_OPTIONS` and asserts a
`--require` hook didn't run. That is a real regression test for *that* variable, but design
§3 item 1's actual invariant is stronger: the helper's environment must be **exactly**
`{ELECTRON_RUN_AS_NODE, YOUCODED_ASKPASS_SOCKET}` — no more, no less. Nothing in the suite
spawns the wrapper with a pile of other ambient variables set (`LD_PRELOAD`, `SSH_AUTH_SOCK`,
cloud-credential-shaped names, `HOME`, `TERM`, …) and asserts none of them survive into the
child's `process.env`. A future edit to the wrapper that reintroduces *any other* variable
(e.g. a well-intentioned `env -i $(printf ...)` refactor, or an added `--allow` name) would
pass every test in this file today.

**Fix:** add a test that spawns the wrapper with a handful of additional ambient variables set
(including at least one loader-hook-shaped one other than `NODE_OPTIONS`, e.g. `LD_PRELOAD`),
and independently proves the resulting environment set — e.g. have `askpass.cjs` (behind a
test-only debug env var name that itself isn't part of the production allowlist, or via a
harness that inspects `/proc/<pid>/environ` while the process is alive and blocked on the
socket read) is exactly the two names, not merely that one named attack didn't fire.

---

## T2-4 accepted — Medium: no test proves hardening runs *before* the socket is ever touched

**File:** `desktop/tests/askpass-helper.test.ts`; `desktop/scripts/askpass/askpass.cjs:136-148`
(`main()`'s `if (!hardenSelf()) { process.exit(1); return; }` before `net.createConnection`
is ever reached)

**Problem:** This ordering is exactly what "the hardening happens truly first" means in
practice, and it's a real, testable, currently-*correct* property — but nothing in the suite
pins it. I verified it empirically outside the test suite (see Evidence): with `koffi`
unreachable from `askpass.cjs`'s resolution path, the process exits 1 and a listening fake
server never sees a connection attempt. No test in the shipped file does this. A future
refactor that reorders the code (e.g. connects first and checks hardening state inside the
`data` handler, or swallows `hardenSelf()`'s return value) would not be caught by anything
here — every existing test runs with hardening succeeding.

**Evidence:**

```
$ ELECTRON_RUN_AS_NODE=1 YOUCODED_ASKPASS_SOCKET="$SOCK" node <copy of askpass.cjs, no
  node_modules/koffi two levels up>
SERVER: listening
askpass.cjs exit code: 1
SERVER: timeout, no connection received
```

**Fix:** add a test that makes `requireKoffi()` fail (e.g. run the wrapper/askpass.cjs from a
directory copy with no `node_modules/koffi` sibling, as above) against a fake server that
records whether it ever received a connection, and assert both: exit code 1, and the fake
server's connection handler was never invoked.

---

## T2-5 accepted — Low/Medium: `ulimit -c 0` — the specific fix E1 named as primary — has no test

**File:** `desktop/scripts/askpass/youcoded-askpass:24-31`; `desktop/tests/askpass-helper.test.ts`

**Problem:** Review 2 (E1)'s blocker was specifically about `RLIMIT_CORE` surviving
`fork()+exec()` unchanged (a same-uid `SIGQUIT`/`SIGABRT` core-dumping the plaintext
password). The fix landed as a one-line `ulimit -c 0` in the wrapper, which is exactly the
kind of line a later edit (reordering, a merge conflict, a "cleanup" that moves it after the
`dirname` block) could silently drop, and nothing here would notice — there is no test that
(a) starts the wrapper with an inherited `ulimit -c unlimited` (the design's own attack
scenario) and confirms the resulting process's `RLIMIT_CORE` is 0 (e.g. via
`/proc/<pid>/limits`), or (b) sends the process a core-dumping signal at a moment it holds the
password and confirms no core file is produced.

**Fix:** add a regression test that sets `ulimit -c unlimited` in the spawning shell before
launching the wrapper (mirroring review 2's own repro), reads `/proc/<pid>/limits` for "Max
core file size" on the resulting `askpass.cjs` process, and asserts it is `0`.

---

## T2-6 accepted — Low: `isTraced()`'s refusal path (a pre-attached tracer) is untested

**File:** `desktop/scripts/askpass/askpass.cjs:120-134`; `desktop/tests/askpass-helper.test.ts`

**Problem:** `isTraced()` exists specifically to catch a tracer that attached *before*
`hardenSelf()`'s `prctl(PR_SET_DUMPABLE, 0)` call takes effect (a persisted ptrace attachment
is not retroactively severed by later setting the dumpable flag — confirmed against documented
Linux ptrace/dumpable semantics). This is exactly the race review 2 was concerned with, and
it's the one check in this file with no coverage at all, in either direction (no test proves
it refuses when traced, and — more subtly — no test proves it does *not* false-positive and
refuse an untraced process under Vitest's own process supervision, though the existing
passing suite is implicit evidence against that particular false positive).

**Fix:** at minimum, a unit test that calls `isTraced()` directly (it's a plain, dependency-free
function) with a monkey-patched/injected `/proc/self/status` content is cheap and would catch
a regression in the parsing logic (e.g. the `!== '0'` string comparison, or the regex). A full
process-level test (actually attach a tracer before hardening runs) is a genuine race to
construct reliably and is reasonable to accept as a documented gap rather than build, but the
pure-function-level test is free and currently missing.

---

## T2-7 accepted — Low: the buffer-scrub comment claims more than the code delivers

**File:** `desktop/scripts/askpass/askpass.cjs:169-172` (`finish`'s `received.fill(0)` comment:
"this Buffer is the only place raw wire bytes ... sat as mutable memory we control");
`askpass.cjs:194` (`Buffer.concat` growth), `askpass.cjs:205` (`JSON.parse(lineBuf.toString('utf8'))`)

**Problem:** The claim is not accurate for the general case. `received = Buffer.concat([received,
chunk])` (line 194) allocates a **new** buffer and copies into it on every `data` event; if the
reply arrives in more than one TCP/unix-socket chunk (not guaranteed for a small payload on a
local socket, but not guaranteed *not* to happen either — no `setNoDelay`/framing forces single-
chunk delivery), every earlier `received` buffer holding a prefix of the wire bytes (which may
include a prefix of the password) is simply dropped, never explicitly zeroed, and is only
`.fill(0)`'d for the *final* value. Separately, `lineBuf.toString('utf8')` and `JSON.parse(...)`
(line 205) both materialize the password as immutable V8 strings — the code's own later comment
(lines 221-224) correctly acknowledges JS strings can't be zeroed, but the *earlier* comment at
line 170 asserts the Buffer is "the only place" mutable memory holding these bytes sat, which
contradicts the later, more careful comment two screens down. Given the process exits almost
immediately after the write (`finish(0)` right after `fs.writeSync`), V8's GC very likely never
runs before the process's memory is reclaimed by the OS at exit, so in practice this is mostly
theoretical — but the comment should not overstate what's actually covered, since it's exactly
the kind of claim a future auditor would trust without re-deriving it themselves.

**Fix:** correct the line-170 comment to acknowledge the same limitation the line-221 comment
already states, and (optional, defense in depth) pre-allocate a single fixed `Buffer.alloc(MAX_LINE_BYTES)`
and copy into it in place rather than repeated `Buffer.concat`, so there is at most one Buffer
to scrub instead of a chain of abandoned ones.

---

## T2-8 already handled (design text updated) — Informational: design text doesn't match the shipped implementation (no security
impact, but worth fixing so a future audit doesn't chase a non-existent code path)

**File:** design §2.1 ("It never receives sudo's prompt argument over the wire (it ignores
`argv[2]`, R14)"); `desktop/scripts/askpass/youcoded-askpass:62`

**Problem:** The wrapper's `exec` line never forwards sudo's prompt argument (`$1` inside the
wrapper) to the runtime/`askpass.cjs` at all — the final argv is `[runtime, "$dir/askpass.cjs"]`,
with no third element. `askpass.cjs` therefore has no `argv[2]` to ignore; the design's wording
("it ignores argv[2]") describes a defensive check that doesn't exist in the code because the
value it would check is never passed in the first place. Functionally equivalent and arguably
better (nothing to ignore beats correctly ignoring something), but worth reconciling so the
design document doesn't imply a runtime check that isn't there.

**Fix:** update design §2.1's wording to say the wrapper drops the prompt argument rather than
that `askpass.cjs` ignores it.

---

## Summary

| ID | Severity | One-line |
|----|----------|----------|
| T2-1 | Critical | `YOUCODED_ASKPASS_SOCKET` trusted from attacker-overridable ambient env — silently redirects the real, verified helper off the real `AskpassServer` socket; no card, no §3 check ever runs |
| T2-2 | High | `dirname "$0"` resolved via untrusted `PATH` before `env -i` runs — a poisoned `PATH` makes the wrapper `exec` an arbitrary file under the correct execPath/env |
| T2-3 | Medium | No test proves the exact 2-variable env allowlist end to end, only a targeted `NODE_OPTIONS` bypass |
| T2-4 | Medium | No test proves hardening happens before the socket is ever touched |
| T2-5 | Low/Medium | No test proves `ulimit -c 0`'s actual effect (E1's primary vector) |
| T2-6 | Low | `isTraced()`'s refusal path is untested even at the pure-function level |
| T2-7 | Low | Buffer-scrub comment overstates coverage vs. `Buffer.concat`/JSON.parse string copies |
| T2-8 | Informational | Design text ("ignores argv[2]") doesn't match implementation (prompt arg never forwarded) |
