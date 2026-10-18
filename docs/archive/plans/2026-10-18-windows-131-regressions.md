# Windows 1.3.1 regression repair

status: shipped

## Result

Merged to remote app master through [youcoded PR #632](https://github.com/itsdestin/youcoded/pull/632), merge commit `1e8797ec30b98ad4cd43f87231dc0e7ab21cd8aa`, on 2026-10-18 after Destin's explicit merge/close approval. Implementation commits: `6df630783` and the pre-merge watcher ordering repair `5eaa86165`, on one app branch.

Windows and macOS CI passed, and required Linux and Android PR checks passed. Remote ancestry of the tested tip was confirmed. This merged source changes; it did not publish a new installer release. Card #85's three older buddy items remain open, and remaining cloud-file validation is recorded against #93.

Destin authorized autonomous Windows VM testing/building/iteration without questions. Testing stayed in the disposable VM and isolated worktree; no host production-app access or credentials copied. Claude Code tests used a local fake API, not paid calls.

## Buddy

- Confirmed on the released Windows build: the visible SVG inherited `pointer-events: none`; browser body-hit queries returned no shapes.
- `MascotRig.hitTestable` defaults false. Only `BuddyMascot` opts in, preserving decorative mascots' click-through behavior.
- New real-rig computed-style test failed before the edit and passed afterward; related click/drag/pose tests passed.
- After confirming the VM loaded the compiled package (not the original archive), real Windows input opened buddy chat, dragged its window from `(521,576)` to `(321,568)`, and produced zero buddy pointerdowns for an empty-area click.
- Electron mouse forwarding works. No speculative mouse-vs-pointer rewrite was needed.

## Refused sends and Send anyway

Three defects were proven:

1. ConPTY wrap flags joined a full-width divider to the input/footer rows. Preserve these physical boundaries while retaining ordinary wrapped-prose joining.
2. A normal Windows desktop launch draws the ASCII `>` prompt. Accept it only within the existing paired-rule message-box structure.
3. `SessionManager` published `session-created` before storing spawn dimensions. The host reader was born at 80x24 while the child used 100x35. Store one spawn-size object before the event and use the same values for the worker.

Four real Windows 11 / Claude Code 2.1.302 captures were added: Unicode and ASCII idle typing plus permission/ESC flows. The original serializer failed both Unicode captures; the original ASCII matcher and initial-geometry ordering failed their dedicated tests. A retry regression failed with only ESC sent under the old serializer and passes with the correction.

Actual packaged-app test, local fake API:
- Before: normal Send showed the reported generic refusal; Send anyway reported that Claude Code did not close the prompt.
- After: composer → PTY → fake API → transcript completed, draft cleared, reply visible.
- A real `/help` popup still blocked the next send. Send anyway produced host `input-block` events `[popup, null]`, preserved the draft until retry, and received the next reply.

The capture bootstrap now uses slash-normalized Windows trust keys and recognizes ASCII prompts. Existing corpus tests remain intact; accidental exploratory recaptures of 17 old fixtures were backed up and restored before final verification.

## Filesystem freeze path

- Removed synchronous `.git` metadata probes from chokidar's matcher.
- At most two actual metadata accesses run process-wide; closing watchers removes queued work but does not release an in-flight slot prematurely.
- Deferred scanning preserves initial/live event semantics, original-root depth, nested-repository exclusions, refcounts and close behavior.
- Fresh review caught and tests pinned two additional requirements: files populated while a directory probe waits must emit add events; internal re-adds must balance chokidar readiness accounting.
- Pre-merge CI exposed cross-platform test flaws and led to a real ordering-race diagnosis: re-adding a directory before its parent's filtered snapshot finishes can cause chokidar to remove it again. The final implementation waits for parent snapshot cleanup, rechecks overlapping scans, reserves readiness before waiting, and cancels pending startup on shutdown. Faithful startup/live/stop tests fail when the barrier is bypassed. Windows path comparisons and bounded test waits prevent cascading test failures; initial-scan assertions forbid new-file adds without suppressing legitimate edits.
- Real Windows filesystem test passed: immediate file in a new directory emits add, later edit emits edit, nested repository files stay excluded.
- **Not verified:** authenticated OneDrive hydration or every cause of whole-computer slowdown. This fixes a concrete blocking watcher path; it does not implement the old unfinished cloud-download consent design or claim to prevent all automatic downloads.

## Signing

- Actual v1.3.1 CI log: installer and application Authenticode signatures Valid, publisher Destin Moss.
- The downloaded installer in the Windows VM also returned Authenticode Status 0 (Valid), with the same publisher; its internet-zone stream was present.
- Exact SmartScreen warning UI was not captured. Shell launch was refused without a usable warning screenshot; direct VM-only installation was used for runtime tests.
- Microsoft documents reputation as separate from valid signing. No Defender or SmartScreen policy was disabled, and no guaranteed removal of SmartScreen warnings is claimed.

## Verification

- Final `bash scripts/verify.sh youcoded --full`: exit 0; 1,163 test files passed, 3 skipped; 20,434 tests passed, 47 skipped. Types, knip, lint, design lint, ast-grep, screen opening and journeys passed.
- Final cross-platform CI: [run 39165972346](https://github.com/itsdestin/youcoded/actions/runs/39165972346). At merge, Windows/macOS were green and the PR's Linux/Android checks were green; a duplicate Linux dispatch build was still running. Session-local verification logs lived under `scratch/verify-20261018-135606-3014742/` and are not a permanent archive.
- Backend and final renderer builds succeeded. Renderer build retains existing optimizer/chunk-size warnings.
- Independent reviews of buddy, terminal changes and final watcher revision found no remaining actionable defects.
- `git diff --check` passed. Merge compatibility was checked without performing a merge.
- Android CI passed before merge. A macOS interactive app test and an Android device test were not run; CI is not claimed as device verification.

## Retrospective disposition

Applied: real Windows captures and event-order tests replace reliance on Linux-shaped mocks; removed the obsolete synchronous watcher exemption; corrected the dependency doc's false claim that Send anyway always works.

Dropped from this product-fix branch: broad VM tooling repair. The existing `vm-exec.sh` prints a guest failure without propagating it to the host shell, and a stopped-process failure initially left the old archive in use. This session changed approach: explicit guest exit inspection, exact process-tree termination, archive-size verification and a fresh restart before accepting runtime results. No claim relies on the earlier failed package swap.
