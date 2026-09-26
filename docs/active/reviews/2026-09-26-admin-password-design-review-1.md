---
status: active
feature: admin-password
review-round: 1
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
---

# Admin password card — design review 1

D1 accepted — helper runs under `env -i` with an exact allowlist; the server verifies the helper's full argv AND its environment (Linux /proc/P/environ, macOS `ps -Eww`) against that allowlist; bash spawn also drops NODE_OPTIONS-class vars. **Blocker.** The verified askpass process can be made to run attacker-controlled
JavaScript, defeating §3's whole verification model. `sudo_askpass()` in sudo's own
source (`src/tgetpass.c`) does `child = sudo_debug_fork(); … execl(askpass, askpass,
prompt, NULL)` with **no environment sanitization** — the askpass child inherits
sudo's full process environment as-is (confirmed by fetching sudo-project/sudo's
`tgetpass.c`). Sudo's own environment, at the point it forks askpass, is whatever
the *command's own* environment was (env_reset only scrubs the environment handed to
the eventual authorized command, not sudo's own process env used to spawn askpass).
The design's `youcoded-askpass` wrapper (§2.1) is `#!/bin/sh: ELECTRON_RUN_AS_NODE=1
exec "$YOUCODED_ASKPASS_RUNTIME" ".../askpass.cjs"` — a plain `exec`, inheriting
everything. And `bash.ts` (`spawnEnv = { ...process.env, ...shellEnvIn, NO_COLOR,
FORCE_COLOR }`, `desktop/src/main/harness/tools/bash.ts:495`) lets the model's own
command set arbitrary env vars ahead of `sudo` (`NODE_OPTIONS='--require=/tmp/x.js'
sudo id`, or a `persistent_env`-carried `NODE_OPTIONS` from an earlier call). That
var rides: command env → sudo's env → askpass child's env → the Node runtime
running `askpass.cjs` (still same UID, no setuid on askpass itself, so Node's
setuid-disables-NODE_OPTIONS guard does not trigger). The injected code runs
*inside* the exact binary/argv §3.1 verifies, so it passes every check trivially,
sees the real password the instant `{ok:true,password}` arrives, and can exfiltrate
it (network call, write to a file, or just answer the socket handshake honestly and
copy the buffer before the 0-fill). This is a direct route to "the model … obtain[s]
the password" — the top item in the review brief — and it defeats R13/R15 without
needing to spoof the helper or the socket at all.
**Fix:** the wrapper (or `askpass.cjs`'s first line) must scrub `NODE_OPTIONS`,
`NODE_V8_COVERAGE`, `NODE_REPL_EXTERNAL_MODULE`, and any other Node/Electron
loader-hook env var *before* anything else runs — ideally by having `AskpassServer`
launch/verify against a spawn environment it controls rather than trusting sudo to
have inherited a clean one, and by never letting Bash's `spawnEnv` (attacker-
influenced) become the ancestor environment of a real sudo invocation at all (e.g.
scrub the same hijack vars from `spawnEnv` whenever the admin floor fires, not just
from the 3 askpass-specific vars named in §2.3).

D2 accepted — pkexec, run0, su and doas are refused outright (never run), with a message telling the assistant to use sudo; no OS dialog can appear. **Blocker.** §4 says `doas/su/pkexec/run0` "get the stop band but no password
card (they can't use askpass; they fail as today)," and R20 defines "visible sudo"
narrowly as the `sudo` command word. This is false for `pkexec` on most real desktop
Linux sessions. Per polkit's own docs and multiple upstream bug threads (freedesktop
`pkexec(1)`, NixOS/nixpkgs#18012, Ubuntu policykit-1#976638): pkexec "will use the
authentication agent registered for the calling process or session, but if no
authentication agent is available, pkexec will register its own textual
authentication agent" — i.e. it *only* fails when no agent exists (headless/minimal
WM). Any GNOME/KDE/XFCE desktop session normally has a polkit authentication agent
already running for the user. A model-issued `pkexec whoami` would trigger **that
session's native OS authentication dialog**, entirely outside YouCoded — exactly the
"separate system pop-up" R1 promises will never happen, and with wording (R14) the
app never controls. The design's blanket "fails as today" is the opposite of the
common case. `run0` (systemd ≥256) has a comparable agent/`systemd-ask-password`
path that needs the same verification before shipping the same claim.
**Fix:** either treat `pkexec`/`run0` as fully out of scope and *block* them outright
(deny, not "ask then let the OS dialog appear") until a real mitigation exists, or
explicitly test on a stock GNOME/KDE session with polkit running before claiming
"fails as today."

D3 accepted — kernel peer credentials via koffi: Linux getsockopt(SO_PEERCRED), macOS getsockopt(LOCAL_PEERPID); the self-reported pid is dropped. **Major.** §3's stated residual risk ("a second connection claiming a pid …
racing (d) … Node has no API for [SO_PEERCRED] — noted as a follow-up, not a
blocker") is exactly the gap between "genuine sudo" and "something faking it" —
R15's whole promise, and the one row on the contract marked `checkedBy: human`
alongside R13/R14. The pid a connecting helper claims (`{v:1, pid: process.pid}`) is
**self-reported**, not kernel-verified; the only defense is "one claim per pid,"
which stops a *second* claimant, not a *first* malicious one that wins the race. This
is closable now, in this codebase: `koffi` is already a dependency
(`desktop/package.json:52`, denied only for install *scripts* at `:105` because it
ships prebuilt N-API binaries) and is already used for exactly this kind of raw
syscall FFI (`desktop/src/main/window-exclude-capture.ts:57-61`, loading `user32.dll`
via koffi with no native build step). The same technique loads `libc` and calls
`getsockopt(fd, SOL_SOCKET, SO_PEERCRED, …)` on Linux (macOS has `LOCAL_PEERCRED`
via `getpeereid()`), closing the race outright — no new native dependency, no
node-gyp step, nothing the "denied install scripts" policy would object to.
**Fix:** implement the peer-credential check with koffi before shipping, and stop
calling it a deferred follow-up on the review's highest-stakes row.

D4 accepted — password asks ride PermissionBroker's pending map, 3 s re-announce and reconnect replay; §6 corrected: sudo never times out an askpass read. **Major.** There is no re-announce or reconnect-replay path for `PasswordRequest`,
and — now verified — sudo applies **no timeout at all** to an askpass read. Fetching
sudo's `tgetpass.c`: the `TGP_ASKPASS` branch returns via `sudo_askpass(askpass,
prompt)` *before* the `if (timeout > 0) alarm(...)` / `getln()` / `alarm(0)` block
that implements `passwd_timeout` — that alarm only ever wraps the direct-terminal
read path. So the design's own "verify … whether passwd_timeout applies to askpass"
question (§6) has a definite answer: **it does not**; sudo will block on the
helper's stdout forever if nobody answers. `PermissionBroker` exists in its current
form precisely because an ask with no timeout is a permanently hung turn the moment
delivery fails once — its own comment (`permission-broker.ts:129-145`) names three
real ways a card gets lost (overwritten by a later event, lost to a transcript
replay after reload/session-switch, dropped when every webContents target is gone)
and fixes them with a 3s heartbeat (`ASK_REANNOUNCE_MS`) plus `pendingEventsFor()`
replay on reconnect. §2.2's `AskpassServer` keeps its *own* pending map (`requestId
→ {socket, sudoPid, callRoot}`), separate from `PermissionBroker`, with no mention of
either mechanism. Combined with D4's now-confirmed "sudo never times out," a single
missed delivery (a renderer reload mid-approval, a remote client reconnecting) hangs
the approved sudo command — and every foreground/background call chained behind it —
with nothing to recover it.
**Fix:** route `PasswordRequest`/`PasswordResolved` through the same
heartbeat-and-replay machinery `PermissionBroker` already has (generalize its
`pending` map, or give `AskpassServer` an equivalent), not a fresh ad hoc map.

D5 accepted — no path allowlist: the parent's real executable is trusted by its properties (root-owned regular file, setuid, every directory up to / root-owned and not group/other-writable), basename sudo; a startup self-check logs when no sudo on PATH qualifies. **Major.** The trusted-sudo set is 3 hardcoded paths
(`/usr/bin/sudo`, `/bin/sudo`, `/usr/local/bin/sudo`), computed once at startup.
Real systems the design claims to support ("desktop Linux") put `sudo` (or `sudo-rs`,
increasingly the default on some distros) somewhere else entirely — Nix/Guix systems
resolve it to a `/nix/store/…` or `/gnu/store/…` path with no stable prefix, and it
is common for `sudo` to only be reachable via `$PATH`, not at any of the three fixed
locations. On such a system, verification step 2 never matches anything: the feature
silently never offers a password card, and every `sudo` inside a model command just
fails ("no askpass program available" / no controlling terminal) with no diagnostic
pointing at the real cause. Nothing in the design detects or surfaces this.
**Fix:** resolve the real `sudo` the same way the command word would be resolved
(walk `$PATH`, or ask the OS, e.g. `command -v sudo`), verify *that* file against the
uid-0/setuid/non-writable checks, and log (not silently degrade) when no candidate
passes.

D6 accepted — forget runs when the LAST admin-using call ends (a count), not on every exit. **Major.** §5's forgetting step runs `sudo -K` on any registered call's exit.
Per `sudo -K`'s own man text: it "removes every cached credential for the user,
**regardless of the terminal or parent process ID**" — i.e. process-wide, not scoped
to the call that just finished. §5 accepts "the user's own terminal forgets too" as
the cost, but misses the same effect *within the feature itself*: two concurrent
Bash tool calls each running an approved admin command, or a `run_in_background`
admin run still executing per §7, will have their cached sudo timestamp wiped the
instant *any other* registered call exits — forcing an unexpected re-authentication
(another askpass round, another card) in the *middle* of a command the user thinks
they already approved and authenticated, with no relationship to what they just did
in a different tab/call.
**Fix:** either scope the forget step to the exiting call's own timestamp record
(sudo's `-K`/`-k` are both all-or-nothing per sudoers(5), so this likely needs a
targeted `sudo.conf`/`timestamp_type` choice, or accepting the cross-call effect
explicitly on the deck) or serialize admin calls so only one is ever outstanding.

D7 already handled — a second sudo under a new parent re-asks through the mid-command card (R3/R11); stated explicitly in §5. **Minor.** `timestamp_type` defaults to `tty`, which "if no terminal is present,
[behaves] the same as ppid" (sudoers(5), confirmed above) — every native Bash call
has no terminal (§1), so every sudo invocation is cached by the **pid of its direct
parent process**, not by the command as a whole. A pipeline stage or subshell
(`echo x | sudo tee f`, `(sudo x)`) forks a *new* parent pid for that particular
`sudo`, so it gets its own, separate timestamp record even within one approved
command. §9 claims `admin-command.test.ts` covers "the hostile shapes above" (which
includes `echo x|sudo tee`) but that only tests *floor detection*, not the
runtime consequence: a single approved multi-`sudo` command can re-prompt (via the
R11 mid-script card) once per distinct parent pid, not once per command. Worth
confirming this is the intended UX (it plausibly is, given R11 exists) rather than
an unstated surprise.

D8 already handled — moot under D2: su/doas/run0/pkexec are refused. **Minor.** `doas`/`su` are asserted to have no askpass-equivalent and "fail as
today" — plausible for vanilla `su`/`doas`, but neither claim is verified here the
way sudo and pkexec were, and `su` in particular can be configured via PAM (e.g.
`pam_ssh_agent_auth`, or a site-local conversation module) to source a password from
something other than the tty on some systems. Given D2 already shows one of these
four assumptions was wrong, verify `doas`/`su`/`run0` with the same rigor before
shipping the blanket sentence, rather than asserting all three by analogy to `sudo`.

D9 rejected — decided on the confirm deck (S-remote-risk, accepted) and the server already binds only to the Tailscale address (remote-server.ts:733). **Minor.** R6/§2.5 route `native:submit-admin-password` over the same
WebSocket `remote-server.ts` already carries transcripts and hook events on, and
`desktop/CLAUDE.md` already documents that channel as **not TLS-encrypted** ("use
Tailscale … rather than plain network access for sensitive conversations"). R6
accepts this in principle, but the technical design adds no mitigation specific to
the one channel that carries a plaintext password rather than conversation text —
e.g. refusing `native:submit-admin-password` on a connection that isn't
Tailscale-trusted, even though everything else on that connection is allowed. Worth
a deliberate yes/no on the deck rather than silent inheritance of the general remote
posture.
