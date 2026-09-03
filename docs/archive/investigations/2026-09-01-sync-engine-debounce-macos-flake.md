---
date: 2026-09-01
status: shipped
type: investigation
topic: RESOLVED — macOS fs.watch returns before the OS watch is armed, so changes in that window are never reported; both watchers now reconcile on subscribe (youcoded#399)
---

# `sync-spaces-engine.test.ts` on macOS: 0 pushes, forever

**Symptom.** Desktop CI's macOS leg fails intermittently in `tests/sync-spaces-engine.test.ts`
(`debounces file changes into one sync`, `emits error events`, and since 2026-08-31 `still syncs real
lockfiles a user keeps in a project (Cargo.lock)`), on branches that touch nothing in sync-spaces and
on untouched master. Ubuntu and Windows pass the same commits. Latest sightings: youcoded#366 three
reds on one unchanged tree (2026-08-31), youcoded#369 twice in a row then green on rerun, master run
33553913621 (2026-09-01). The decisive control: master `2af35eff` failed (run 33380550181) and passed
two hours later (run 33391871531) with no change. Every fire also skips macOS packaging, which is
gated behind `npm test`.

**What is known.**
- The failing run polls the full budget and observes **0 pushes** — no event at all, not a slow one.
- The prescribed timeout fix is **already the code** and must not be re-applied: the file carries
  `WAIT_MS = 60_000` on the `vi.waitFor` poll and `vi.setConfig({ testTimeout: 120_000 })`, since the
  #180/#181 round.
<!-- claim: {"path": "youcoded/desktop/tests/sync-spaces-engine.test.ts", "contains": "const WAIT_MS = 60_000"} -->
- The first hypothesis (a watcher-arming race: `addSpace` resolves before FSEvents is armed, so
  writes in that window are missed) is **disproven as stated**: `sync-spaces/engine.ts` has awaited
  `watcher.once('ready')` since `c898c046` (2026-07-08), before the entry was filed. Chokidar's
  `ready` is evidently not the same as FSEvents being genuinely armed — the next hypothesis needs to
  be a post-`ready` settling window or something else, not this one re-applied.
- Load correlates: #369 went from green to red after adding one small jsdom test file, and #366's
  ~40 added tests tipped it three times.

**Why it matters beyond CI.** If the mechanism is a post-ready window, files written immediately
after a space is added are silently missed in production on macOS too — data-loss-shaped, not a CI
annoyance. Confirm the production path before touching the test; a test tweak that goes green while
the engine still misses early writes hides the defect. Do not "fix" it by weakening the test.

## New evidence 2026-09-02: it is NOT confined to sync-spaces

youcoded#382, macOS leg of run `33638580427` (job `100275586082`), failed **two** suites in one
run, and the second one has never been on this entry's list:

```
FAIL tests/sync-spaces-engine.test.ts > SpaceSyncEngine > emits error events instead of throwing
FAIL tests/git/git-watcher.test.ts   > git-watcher   > emits one debounced event for a burst of .git changes
                                                       AssertionError: expected +0 to be 1
```

`git-watcher` is a different subsystem with its own chokidar instance and its own debounce, and it
observed **zero** events — the same signature this entry records for sync-spaces ("0 pushes, no
event at all, not a slow one"). Ubuntu and Windows passed the same commit, and the desktop tree was
**byte-identical** to a commit whose macOS leg had already passed (`git diff --name-only 413a4668
fix/tier0-desktop-batch -- desktop/` → empty; the only delta was four Kotlin files).

**Why this matters for the hypothesis.** The remaining suspect was "a post-`ready` settling window"
in chokidar/FSEvents. A second, independent watcher failing the same way in the same run makes
anything sync-spaces-specific much less likely and points squarely at the FSEvents layer itself —
so the next investigation should reproduce against a bare chokidar watcher, not against
`sync-spaces/engine.ts`. It also means the production risk noted above ("files written immediately
after a space is added are silently missed on macOS") is **wider than sync-spaces**: the git surface
watches `.git/` the same way.

**Load correlation, confirmed again — and one cause removed.** This run's tree added a
30-iteration filesystem loop (`artifact-store.test.ts`, the ROADMAP L696 create-race test), each
iteration doing mkdtemp + two lock-guarded fsync'd writes + a recursive delete, running in parallel
with these watcher suites. The race it pins is deterministic and reproduces on iteration 1, so the
loop was cut to 3 in `c80f4045` — same coverage, ~90% less churn. Recording it here because it is
the third datapoint for this entry's "load correlates" line, and because the previous two (#369's
one jsdom file, #366's ~40 tests) were both *additions* nobody could take back; this one was
removable, and its removal is a cheap natural experiment for whoever picks this up.

**Second `git-watcher` sighting, same day.** youcoded#386 run `33643620764` (job
`100292634932`) failed the identical test — `git-watcher > emits one debounced event for a burst
of .git changes`, `expected +0 to be 1` at `tests/git/git-watcher.test.ts:56` — on an unrelated
branch (an auth log line) whose diff touches no watcher and no sync code. Two independent
sightings of the same non-sync watcher in one day, on two different branches, is the strongest
evidence yet that this is the FSEvents layer and not `sync-spaces/engine.ts`.

**History.** Filed 2026-07-22; escalated 2026-07-23; walked back 2026-07-25; hypothesis disproven
2026-08-12; new evidence 2026-08-31 and 2026-09-01. Cause still unknown.

---

## RESOLVED 2026-09-03 — macOS `fs.watch` returns before the watch is armed

**Cause.** `fs.watch()` on macOS returns *before* the OS-level watch exists. libuv hands the
request to a CoreFoundation run loop on another thread; anything that changes between the call
returning and the arming completing is never reported — not late, never. Linux (inotify) and
Windows (ReadDirectoryChangesW) register the watch inside the call and have no such window.

**Evidence.** `desktop/scripts/diag/fswatch-probe.mjs` — bare `fs.watch`, no app code — on a
3-core macos-latest runner:

| condition | macOS | Linux |
|---|---|---|
| idle, write 0–100 ms after the call | 0 missed / 100 at every gap | 0 / 100 |
| under CPU load, write immediately | **4 missed / 200** | 0 / 200 |
| under CPU load, write 5 ms later | 1 / 200 | 0 / 200 |
| under CPU load, write 25 ms later | 0 / 200 | 0 / 200 |

Linux's measured event latency equals the injected gap exactly (armed inside the call); macOS
carries ~10 ms of machinery regardless of the gap.

This accounts for every property this entry recorded, including the ones that made it look
mysterious: macOS only; **zero** events rather than slow ones; load-correlated (contention widens
the window); and two unrelated subsystems hit at once — chokidar 5 no longer uses fsevents, so
`sync-spaces/engine.ts` and `git/git-watcher.ts` both bottom out in `fs.watch`.

It also explains the standing hypothesis rather than merely disproving it. "Chokidar's `ready` is
not the same as being genuinely armed" was **correct**; it could not be confirmed because `ready`
is a chokidar-level signal that cannot observe an OS-level window at all.

**Fix** (youcoded#399). There is no "armed" event to wait for — `fs.watch` has none, so no amount
of waiting on a signal can close this. Both watchers instead make missing the window harmless:
subscribing schedules ONE event through the same debounce a real change uses, so a change lost to
the window still causes consumers to re-read. A real change during the debounce coalesces into it.

The production risk this entry flagged was real and is what the fix addresses: on macOS a commit
made just after a project opens went unnoticed, and a file written just after a space was added
stayed unsynced until something else changed. Both suites' headline tests would now pass against a
dead watcher, so each gained one that cannot be faked (the change is made after the startup event
has drained).

**Measured on a real macOS runner under identical CPU load:** `git-watcher.test.ts` 4/15 red
before, 0/15 after; `sync-spaces-engine.test.ts` 0/15 after. The probe reported misses in the same
run as the green suites, so the load condition was genuinely present.

**Still exposed, filed separately.** Of eight watcher call sites, four are already covered by
existing safety-net polls (`transcript-watcher`, both `subagent-watcher` watches, `outbox-drain`).
Three have neither poll nor reconcile: `artifacts/project-watcher.ts` (Files panel),
`theme-watcher.ts`, and the topic-file watch in `ipc-handlers.ts`.
