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

**Where to start next session:** the plan's `## Status` block, then Task 6.

## What this is

Destin opened a 2.3 MB PNG and got *"This file is 2.3 MB — too large to open in the
artifact pane."* The message was false: images are governed by a 50 MB ceiling, and the
2 MB limit that refused it belongs to the **text editor**, which images never use. The
work fixes that, and turns the text limit from a wall into a readable partial view that
can never be saved over the original.

## State: Stage 1 + Stage 2A shipped to a branch, reviewed, not merged

Eight commits on `feat/artifact-size-limits`, worktree at `worktrees/artifact-size-limits`
(`node_modules` hardlinked with `cp -al` — never symlink it, `CLAUDE.md`).

```
e7f2d42b  cap to 3 MB, terser banner copy
8c098c84  over-cap files read-only everywhere; banner → bottom bar
94a05602  checkpoint fixes: truncated plumbing, real footer size, mp4 fixture
cc3537ed  honest handoff copy
3aea7e76  partial-view banner
69143023  Workbench over-cap fixtures
0aeb4d7a  hook + watcher skip the text read for byte-only files
d1d10687  rendersFromBytesOnly
```

**Working today, in the app:** photos, PDFs, spreadsheets and Word docs no longer touch
the text editor's size gate, so the reported bug is fixed; the duplicate whole-file disk
read for under-cap binaries is gone; the "can't show this" messages state the true reason
(size / unsupported format / a text-extension file whose bytes aren't text) instead of one
false sentence; the over-size message finally renders the button it always named.

**Working only in the Workbench:** the partial-view bar. The real backend does not serve
`truncated` yet — that's Stage 2B. Until then the desktop app still refuses over-cap text
with the old message, and `tooLarge` is still live (7 references, listed in Task 8).

## Verification state

- `bash scripts/verify.sh worktrees/artifact-size-limits` — all green **except**
  `tests/harness-eval-orchestrator.test.ts`, which fails identically on a clean
  `origin/master` worktree. **Pre-existing, verified, not this work.** Don't chase it.
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
  `artifacts:*`" as unbridged — so **append a line to that entry, do not create a new one.**

## What remains

**Stage 2B — the backend** (plan Tasks 6–8). Unblocked; the decisions it needed are made.

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

**Stage 2C — Android** (Task 9). `EDIT_MAX_BYTES` is already 3 MB there; the head-sniff,
`textPrefix`, `readFully`, the two other constants and the `full` flag are outstanding.
Gradle is safe to run in this worktree (hardlinked `node_modules`, not a symlink).

**Stage 3 — remote.** Cancelled, see above.

**On merge:** move spec + plan to `docs/archive/`, flip the ROADMAP item, remove the
worktree, delete the branch locally and remotely. Nothing is pushed yet — Destin decides
when it lands.
