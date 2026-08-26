---
status: active
date: 2026-08-25
spec: docs/active/specs/2026-08-25-artifact-pane-size-limits-design.md
plan: docs/active/plans/2026-08-25-artifact-pane-size-limits-plan.md
branch: feat/artifact-size-limits
worktree: worktrees/artifact-size-limits
tags: [renderer, artifacts, ux, ipc, android]
---

# Handoff: artifact pane size limits

**Where to start next session:** all nine tasks are done. The only thing left before
merge is Destin looking at the finished feature against the real backend — see
"What remains". The plan's `## Status` block has the commit table.

## What this is

Destin opened a 2.3 MB PNG and got *"This file is 2.3 MB — too large to open in the
artifact pane."* The message was false: images are governed by a 50 MB ceiling, and the
2 MB limit that refused it belongs to the **text editor**, which images never use. The
work fixes that, and turns the text limit from a wall into a readable partial view that
can never be saved over the original.

## State: ALL NINE TASKS DONE on a branch. Not merged, not pushed.

Thirteen commits on `feat/artifact-size-limits`, worktree at `worktrees/artifact-size-limits`
(`node_modules` hardlinked with `cp -al` — never symlink it, `CLAUDE.md`).

```
3619d93e  workbench mock refuses a full read above the ceiling, like main
5c797056  Android mirrors the head sniff and text prefix        (Task 9)
7e14cca1  every content update carries its metadata; tooLarge retired (Task 8)
42906ca1  artifacts:get sniffs the head; { full } through both transports (Task 7)
0b6707e2  textPrefix + decideOverCapRead, pure and pinned       (Task 6)
e7f2d42b  cap to 3 MB, terser banner copy
8c098c84  over-cap files read-only everywhere; banner → bottom bar
94a05602  checkpoint fixes: truncated plumbing, real footer size, mp4 fixture
cc3537ed  honest handoff copy
3aea7e76  partial-view banner
69143023  Workbench over-cap fixtures
0aeb4d7a  hook + watcher skip the text read for byte-only files
d1d10687  rendersFromBytesOnly
```

**Working in the real app now, on both platforms:** photos, PDFs, spreadsheets and Word
docs no longer touch the text editor's size gate (the reported bug); the duplicate
whole-file disk read for under-cap binaries is gone; the handoff messages state the true
reason instead of one false sentence; a big text file opens as a readable prefix with the
**Large File** bar rather than a refusal; **Load the whole file** works up to 12 MB and is
not offered above it; an over-cap file that turns out not to be text routes to the format
handoff instead of the text editor's error; and a file served as a prefix is read-only at
every entry point, including after a full load and including a file that grows past the
cap while it is open.

`tooLarge` is gone from all three trees — desktop source, desktop tests, and Kotlin.

**The one thing left: Destin has not looked at any of this against the REAL backend.**
Everything he reviewed was the Workbench's fake one, and that review found four defects
that every test had passed. See "What remains".

## Verification state

- `bash scripts/verify.sh worktrees/artifact-size-limits` — all green. (The known
  `tests/harness-eval-orchestrator.test.ts` failure reproduces identically on a clean
  `origin/master` worktree — **pre-existing, verified, not this work.** Don't chase it.)
- Android: **176 tests, 0 failures across 19 classes** on a forced rerun, including the
  six `textPrefix` cases mirrored from the TS suite so the two cannot drift.
  `./gradlew` needs `ANDROID_HOME=~/.android-sdk`,
  `JAVA_HOME=/usr/lib/jvm/java-21-openjdk` (AGP's jlink transform rejects the machine's
  default JDK 26) and `-x bundleWebUi` (that task packages the *desktop* app and wants
  `rpmbuild`). None of that is caused by this change; `node_modules` in the worktree and
  the main checkout were both confirmed intact at 640 entries afterwards.
- `node scripts/workbench-boot-check.mjs 5243` — 12/12 routes clean. Note the default port
  5233 is held by another session's workbench; this branch's runs on **5243**
  (`YOUCODED_PORT_OFFSET=70 bash scripts/run-workbench.sh worktrees/artifact-size-limits`).
- Every regression test added here was verified to **fail without its fix**, by reverting
  the fix and watching it go red.

## What the review process actually produced

Worth preserving, because it is the argument for both gates.

**An independent subagent review of the plan** caught: five *additional* content-update
paths that leave metadata stale (I had found one), a draft-restore path that bypassed
every guard, several code blocks that would not have compiled (a constant not exported
from the main process, a prop never passed, a React hook placed after early returns), two
test files that don't exist, and size arithmetic in tests that disagreed with the code.

**Destin looking at it in the Workbench** caught four more, all of which passed every test
that existed at the time:

1. `truncated` was dropped when copying the response into `contentInfo` → the banner never
   rendered for any file. Nothing errored; it was simply absent.
2. The drawer footer measured the string in memory → an 8.4 MB file served as a prefix
   reported `400 B`.
3. The mock answered `orphan: true` for any fixture with no text body → the `.mp4`
   rendered "no longer on disk" instead of the format handoff.
4. **The Edit button still showed on a truncated file** — the data-loss hole the design
   exists to close, under a banner reading "Read-only".

## Decisions (superseding parts of the spec)

- **`EDIT_MAX_BYTES` = 3 MB**, mirrored in Kotlin. Revises spec **D1**, which had recorded
  2 MB as settled *by measurement*. Honest framing: p99.5 of real text files is 206 KB, so
  any value in this range serves ~100% of first reads whole — 3 MB is chosen headroom, not
  a measured requirement.
- **`FULL_READ_MAX_BYTES` = `4 × EDIT_MAX_BYTES`** = 12 MB. A stated multiple, not a magic
  number. The planned "measure it" task was dropped: it could not be run as written (the
  Workbench serves content from memory, never disk) and it measured the wrong costs.
- **Editing above the cap: never**, including after "Load the whole file". The cap exists
  because CodeMirror blocks the renderer on a multi-MB string; loading the text doesn't
  change that.
- **Banner**: panel-width bar floating over the *bottom* of the pane, in the spot the Edit
  pill vacates, action as a pressable pill on the right end. Copy: *"Large File — Showing
  3.0/8.4 MB"*. "Read-only" was dropped because the absent Edit button says it.
- **D3/D4 (remote ask-first) retired on evidence.** `remote-server.ts` bridges only
  `artifacts:list-projects-index`; `artifacts:get` and `artifacts:read-binary` fall to its
  `default:` case and answer `{ unsupported: true }`. The artifact pane cannot open **any**
  file over remote access on a desktop host, so a size prompt there would guard an
  unreachable path. Already-known gap — `ROADMAP.md:526-529` lists "the rest of
  `artifacts:*`" as unbridged — so a line was appended to that entry (commit `273e834`
  in `youcoded-dev`); no duplicate was created.

## What remains

**Destin looks at it against the real backend.** This is the only work left before merge:

```bash
bash scripts/run-dev.sh worktrees/artifact-size-limits --label "Artifact Size Limits"
```

Four things to open: a >3 MB log (partial bar + **Load the whole file**), a >12 MB one
(no load action, **Open externally** instead), a >3 MB file that isn't text (format
handoff, not the text refusal), and the originally-reported 2.3 MB PNG.

**Everything below is DONE — kept for the record.**

**Stage 2B — the backend** (plan Tasks 6–8). ✅

- **Task 6** — `shared/artifacts/over-cap-read.ts`: `textPrefix()` (trim to the last
  newline; fall back to a UTF-8 character boundary when there is no newline, or when the
  newline would throw away more than half the window) + `decideOverCapRead()`. Pure, so
  the handler calls it and the test exercises the shipped branch rather than a copy.
- **Task 7** — `artifacts:get` sniffs the first 8 KB above the cap and returns either the
  binary handoff or a trimmed prefix; `sizeBytes` on every response; `{ full }` threaded
  through preload **and** the remote shim (which uses an *object* payload, not positional
  args); `ArtifactThumbnail.tsx:141` slices, or every visible tile parks a 3 MB string in
  React state. Use a read-fully loop — `fs.read` is not required to fill its buffer.
- **Task 8** — *half done.* `canEditArtifact` ships and is enforced at four entry points.
  Remaining: `applyDiskRead` + the `onDiskRead` prop wired by both hosts, routing the five
  content-update paths through it, and retiring `tooLarge`. **The predicate alone is not
  the fix** — every guard reads `contentInfo`, and the watcher can swap the pane's text
  without refreshing it, so a file that *grows* past the cap while open keeps its Edit
  button and saving truncates it.

**Stage 2C — Android** (Task 9). ✅ Head sniff, `textPrefix`, `readFully`, both constants
and the `full` flag all landed, with the shared cases pinned on both sides.

**Stage 3 — remote.** Cancelled, see above.

**On merge:** move spec + plan to `docs/archive/`, flip the ROADMAP item, remove the
worktree, delete the branch locally and remotely. Nothing is pushed yet — Destin decides
when it lands.
