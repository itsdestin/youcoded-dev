---
date: 2026-09-02
status: shipped
type: handoff
---

# Overnight session A — Tier 0 desktop batch

Headless throughout. No Electron window was opened, no dev server started, the live app was
never touched. Worktree `worktrees/tier0-desktop`, hardlinked `node_modules`, no `npm ci`,
no Gradle.

## The short version

**Eight of the ten items I was given were already done.** The difficulty ranking I worked
from is dated 2026-08-31, and a session on **2026-09-01 shipped exactly that batch**
(youcoded#376 and #373). I re-verified each one against current code before touching
anything, which is the only reason this did not become eight duplicate commits.

So I worked the two that were real, then kept going down Tier 1 and closed three more.

| | Item | Outcome |
|---|---|---|
| 1 | Button `hidden` never hides | Already shipped (`758deb5d`, with a pinned test) |
| 2 | Kotlin `removeProject` is test-only | **Deliberately KEPT** — see below |
| 3 | `sendChatMessage` overloads | Already shipped (`70a635f5`) |
| 4 | Artifact repair over-reclassify counter | Already shipped (`283f71ce`) |
| 5 | Terminal Opacity slider floor | Already shipped |
| 6 | Skip Permissions tooltip copy | Already shipped |
| 7 | Adopt the `FieldError` primitive | **Done — youcoded#385, merged 2026-09-03** |
| 8 | Three hand-rolled badges → `Badge` | **Skipped** — needs a decision, see below |
| + | L264 `missedSteers` unbounded | **Done — youcoded#382** |
| + | L259 stale run push rewinds a card | **Done — youcoded#382** |
| + | L696 concurrent sidecar creation | **Done — youcoded#382** |
| + | L241 orphaned "Preparing…" card | **Done — youcoded#382** |

## What merged

**youcoded#382 — four main-process robustness fixes.** Merged to master once CI was green.
Nothing here needs your eye: three change nothing on screen at all, and the fourth removes a
spinning card that should never have been there.

- **A helper you keep steering after it has gone can no longer grow its record file without
  limit.** Each parked note is trimmed to the same 2,000 characters a delivered one gets, and
  the app keeps the most recent 50.
- **A helper card that says "completed" can no longer flip back to "running".** Updates now
  carry a counter, so an old one arriving late is ignored instead of applied.
- **Two files saved at the very same moment, in a project that had never saved one before, no
  longer lose one of them.** This one was closed on 2026-09-01 as "no longer reproduces" —
  that closure was wrong, and I have corrected the record. See below. **Android had the exact
  same defect and is fixed in the same PR** — it writes the same file, so fixing only the
  desktop would have left the two of them disagreeing, which is worse than the bug.
- **A "Preparing…" card left behind by a garbled tool call now disappears immediately** instead
  of spinning next to real work until the reply ends.

## Where the PRs landed

All four PRs are merged. #385 was held back overnight because it touches 11 screens, shown to
Destin on 2026-09-03, and merged on his say-so (`2b65be60`). #382, #386 and #387 merged
unattended — all three invisible to the eye, all green on all four legs. Nothing from this
session is left open.

### youcoded#386 — the silent sign-out

One rejected server call clears your account session. That is correct and stays — leaving the
token would strand you "signed in" while every call failed. What was wrong is that it happened
in **complete silence**: no toast, no log line. Presence drops with the session, so friends see
you offline forever and you only find out by opening the friends panel. Worse, the symptom is
indistinguishable from a separate known bug, so afterwards nobody could tell which had happened.

It now writes one line naming the subsystem and the server's own reason. **That is half the fix
and the code says so** — the spec asks for a log line *and* a user-facing notice, and the notice
needs a copy and surface decision on an auth screen. Yours, not a 3am one. The roadmap item
stays open for that reason.

Found while writing it: the logged reason is the 401 **response body, verbatim**. A proxy or
captive portal answering with an HTML page would have written that whole page into a log that
keeps only 500 lines, evicting everything useful around it. Capped at 200 characters. Same
shape as the ledger bug in #382 — I would have shipped it if I had not looked.

### youcoded#387 — a test that raced itself

Not a product bug: a CI test wrote to a spawned server's stdin, waited on its *stdout*, then
asserted on its *stderr* — two pipes with nothing synchronising the second. It cost a red leg on
#386 and had never been logged. The assertion is unchanged; only the waiting is. Mutation-checked
that it still fails if the server stops reporting, so it tolerates lateness without hiding
absence.

### youcoded#385 — the field-error sweep

Twenty-two places that drew an inline error message by hand now use the shared piece. Both
warnings on the roadmap entry turned out to be real, and both became options on the shared
piece rather than judgment calls: six of those messages were a size larger than the shared
piece drew (so it can now draw both sizes), and twenty-one were block elements carrying their
own spacing (so it can now be one). Without either, six messages would have shrunk and
twenty-one would have lost the gap under their field.

**There is no review deck, on purpose.** Nothing on screen changes — so a deck would have been
twenty-two identical Before/After pairs, which trains you to click through decks without
looking. Instead the PR carries a per-site table: the old tag and classes read out of the
parent commit against the new ones computed from what the shared piece is actually passed,
compared as sets so ordering is not mistaken for a difference. 22 of 22 identical. **If you
would rather have the deck anyway, say so and I will build it.**

Seven more places matched the same pattern and were deliberately left, each with its reason
recorded in a test that fails if the reason stops being true. The one worth knowing about:
**the "Claude will execute tools without asking" caption exists in four separate copies.**
That is a real duplication, but it wants a shared warning component, not this one — the shared
piece announces itself to screen readers, and that caption is always-on text, not an error.

## What I skipped, and why

- **Item 8, the three badges → `Badge`.** Filed as "mechanical". It is not. Of the three sites
  named, `SessionStrip`'s `+N` overflow counter is a **button** and the specialists chip is
  a **button**, while `Badge`'s own documentation says in as many words that it is not a
  control — no click target, no hover, no focus ring. The third (`SessionStrip`'s "YouCoded ·
  Coder" tag) is a genuine badge but would visibly change: bigger text, a border it does not
  have, wider padding, inside an already-tight pill. So this is a question about what `Badge`
  should be, which is yours. It was also the item most likely to collide with
  `worktrees/session-motion`, which has 14 unmerged commits on `SessionStrip.tsx`.
- **Item 2, Kotlin `removeProject`.** The code says keep it, and says why, in a comment dated
  **2026-09-01** — one day after the ranking said delete it. It is a 1:1 port of desktop's
  version, which is live; Android stubs that channel until mobile Project View. Trusting the
  code.
- **Tier 1, the rest of "UI / renderer small".** Every remaining item needs a decision from
  you or is bigger than filed:
  - *Field surfaces invisible on matching backgrounds* — a decision about the shared field
    piece, explicitly not a fourth patch.
  - *"Jump to bottom" collides with other floats* — what remains is an audit of every floating
    element, not a fix.
  - *Resumed sessions show "Resuming…"* — the entry itself says it is held on a copy decision.
  - *Chat file chips refuse extensions* — three candidate shapes, all with user-visible blast
    radius, none chosen.
  - *Provider brand colours on light themes* — two candidate fixes, one of which breaks the
    "nothing moves on your themes" promise you approved on 2026-08-31.
  - *Notes not interleaved in a helper's Activity trail* — **bigger than filed.** Interleaving
    needs a timestamp on every row; only note rows have one today. Adding one changes a type
    every producer and consumer reads.
  - *Session switcher rounding* — an idea, and it collides with `worktrees/session-motion`.

## One item I audited rather than fixed — and why that was the right call

**"Every replayed chat bubble is stamped with the moment you opened the session."** Its
report said "check the consumers before flipping it". I did that audit in full and then
stopped, because it turned up something that changes the answer:

**Doing the fix as filed would make the timeline worse, not better.** The parser change
fixes *your* bubbles, the skill cards and the clear markers — but the assistant's bubbles
get their time somewhere else entirely, and would keep saying "now". A replayed
conversation would read half-right, alternating between the real time and the moment you
opened it. Uniformly wrong at least does not look like data. Fixing it properly means a
second change in a different file, in the same PR.

There is also a second decision underneath it: the same number is what the app uses to
decide which device's copy of a conversation is newer when they disagree. It is written to
disk and synced. On the one path that re-reads a whole transcript (after a `/clear` or a
`/compact`), the change could move that marker **backwards** and lose a merge — so a
conversation edited on your phone could be silently beaten by an older desktop copy. That
wants your call, not mine, at 3am.

Everything else about it is safe, and the strongest argument for doing it is one nobody had
written down: **Android has been sending the correct times all along**, through the same
channel, for its entire life. So this is a parity restoration, not a new idea.

The whole audit — every consumer, with line numbers, the two decisions, and one trap that
would let a stale file auto-open if someone "simplifies" it — is now in
`docs/active/investigations/2026-09-01-replayed-bubbles-stamped-with-replay-time.md`. The
roadmap item is re-tagged `decision`, so it now shows up in the "For Destin" section of
`roadmap-check` instead of looking like ordinary work. **The next session should not have to
redo that reading.**

## Things I found that were filed wrong

1. **A roadmap item was closed on a false negative, and I have reopened it.**
   `docs/roadmap/shipped.md` closed the concurrent-sidecar-creation race on 2026-09-01 with
   "no longer reproduces — `casWrite` reads the on-disk `updatedAt` inside the lock on every
   write including creation." It does not, on that path: the caller passes the extractor as
   `undefined` whenever the expectation is null (a side effect of the 2026-08-27 memory fix),
   so the whole check is skipped and the write is unconditional. The second half of that
   closure — that the write queue makes two creators impossible — is true of `appendVersion`
   but not of `appendVersionsDirect`, which is what a **second process** uses, and the codebase
   elsewhere calls "dev instance and built app sharing one project" a normal state, not a
   rarity. I reproduced it with a test that is mutation-verified: disable the new guard and it
   fails. The old shipped line now carries a correction and points at the real fix.

2. **The item pointed at the wrong file.** It blamed `cas-write.ts`. The defect was one file
   over, in the caller. Worth knowing because the named file looked innocent on inspection,
   which is probably how the false closure happened.

3. **The same bug existed on Android and nobody had noticed.** Android writes the same file
   with the same design and skipped the same check for the same reason. It is fixed in the
   same PR, mutation-verified, 218 Android tests green. Two things fell out of doing it:
   Android's project-index writer genuinely *does* mean "overwrite whatever is there", so it
   now says so explicitly — without that, every index write after the first would have been
   refused; and a branch in Android's version could never be reached, with a comment claiming
   the opposite of what it did.

4. **The difficulty ranking is stale by a full batch** (2026-08-31 vs the 2026-09-01 work).
   Worth re-running before anyone works from it again.

## One mistake worth knowing about

I based the field-error PR on the batch branch so its diff would read as one commit instead
of five. When the batch merged with `--delete-branch`, **GitHub auto-closed the second PR** —
and a closed PR whose base branch is gone can be neither reopened nor retargeted. It is
re-opened as **youcoded#385** with the same commit rebased onto master, and the old one
(#383) points at it. Nothing was lost; the link you may have seen earlier is dead.

The lesson for the next session: stacking a PR on a branch you intend to delete on merge
costs you the PR. Either base on master and accept the noisier diff, or merge without
`--delete-branch` and clean up afterwards.

## The CI suite is noisy, and that cost real time

**Three of the four PRs tonight hit a flake — three subsystems, three platforms, two of them
never logged before.** None was caused by the change under test; each was established rather
than assumed (named from CI annotations, checked against the diff, full suite run locally).

| Where | What failed | Verdict |
|---|---|---|
| macOS, twice | `git-watcher > emits one debounced event` | Known FSEvents flake — but **on a watcher that entry never named** |
| ubuntu | `claude-code-link-mcp > survives an unparseable line` | New. Diagnosed and **fixed** (#387) |
| local | two tests, names lost | Unreportable — the log was deleted. Fixed (`verify.sh`) |

Two things worth carrying forward:

**The macOS watcher fault is wider than "sync-spaces".** That entry has always named one suite.
Tonight the *same different* watcher failed twice, on two unrelated branches, hours apart, both
observing zero events. That is now the strongest evidence that the fault is the FSEvents layer
itself, and the next investigation should reproduce against a bare chokidar watcher instead of
`sync-spaces/engine.ts`. It matters beyond CI: that report warns files written just after a
space is added may be silently missed on macOS **in production**, and the git surface watches
`.git/` the same way. I did not touch it — its own report is explicit that a test tweak going
green while the engine still misses early writes would hide the real defect.

**I made the load worse before I made it better.** My create-race test looped 30 times, each
iteration doing a mkdtemp, two lock-guarded fsync'd writes and a recursive delete, in parallel
with the watcher suites that go red under exactly that load. The race is deterministic and
reproduces on iteration 1; the loop is now 3. I did not cause the flake, but adding churn to the
machine it fires on was mine and it bought no coverage.

## One loose end

During one `scripts/verify.sh` run, **two tests failed and then passed on a re-run and in a
full-suite run** (7,903 passed, 0 failed). I lost their names: `verify.sh` writes its test log
to a temp directory that is removed when it exits, so by the time I looked the log was gone.
That is consistent with the open "intermittent flake in three named suites" item, and it is a
small tooling gap worth closing — **`verify.sh` should keep its log on failure**, otherwise a
flake is unreportable by construction.

## Verification

- `bash scripts/verify.sh worktrees/tier0-desktop` green on both branches separately
  (types, related tests + 33–34 source-scanning guards, knip, eslint, ast-grep).
- One full-suite run: 7,903 passed, 42 skipped, 0 failed.
- Android: `./gradlew test -x bundleWebUi` — 218 tests, 0 failed.
- 30 new pinning tests across four PRs. **Five are mutation-verified** — the guard is removed,
  the test is confirmed to fail, the guard is restored: the artifact create-race (desktop and
  Kotlin), the Preparing-card withdrawal, the FieldError exemption counter, and the MCP stderr
  wait.
- Every CI red tonight was named from its annotations and checked against the diff before being
  called a flake. None was re-rolled on hope.
- `node scripts/roadmap-check.mjs` clean after the bookkeeping.
