---
date: 2026-09-01
status: active
type: investigation
topic: sync-spaces-engine.test.ts recurring macOS CI failure — the watcher event is never delivered; the timeout knobs are already maxed and are not the answer
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

**History.** Filed 2026-07-22; escalated 2026-07-23; walked back 2026-07-25; hypothesis disproven
2026-08-12; new evidence 2026-08-31 and 2026-09-01. Cause still unknown.
