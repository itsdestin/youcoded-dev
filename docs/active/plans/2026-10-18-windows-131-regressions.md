# Windows 1.3.1 regression repair

status: active

## Result

App branch: `session/85-windows-131-regressions`, commit `6df630783`.
One local app commit contains all fixes. No push or merge. A merge-tree check against fetched `origin/master` completed without conflicts. The app worktree is clean.

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
- Real Windows filesystem test passed: immediate file in a new directory emits add, later edit emits edit, nested repository files stay excluded.
- **Not verified:** authenticated OneDrive hydration or every cause of whole-computer slowdown. This fixes a concrete blocking watcher path; it does not implement the old unfinished cloud-download consent design or claim to prevent all automatic downloads.

## Signing

- Actual v1.3.1 CI log: installer and application Authenticode signatures Valid, publisher Destin Moss.
- The downloaded installer in the Windows VM also returned Authenticode Status 0 (Valid), with the same publisher; its internet-zone stream was present.
- Exact SmartScreen warning UI was not captured. Shell launch was refused without a usable warning screenshot; direct VM-only installation was used for runtime tests.
- Microsoft documents reputation as separate from valid signing. No Defender or SmartScreen policy was disabled, and no guaranteed removal of SmartScreen warnings is claimed.

## Verification

- `bash scripts/verify.sh youcoded --full`: exit 0; 1,162 test files passed, 3 skipped; 20,402 tests passed, 47 skipped. Types, knip, lint, design lint, ast-grep, screen opening and journeys passed.
- Full logs: `scratch/verify-20261018-124656-2474783/`.
- Backend and final renderer builds succeeded. Renderer build retains existing optimizer/chunk-size warnings.
- Independent reviews of buddy, terminal changes and final watcher revision found no remaining actionable defects.
- `git diff --check` passed. Merge compatibility was checked without performing a merge.
- Android builds and macOS runtime were not run. Shared behavior is covered by desktop unit/integration tests, not claimed as device verification.

## Retrospective disposition

Applied: real Windows captures and event-order tests replace reliance on Linux-shaped mocks; removed the obsolete synchronous watcher exemption; corrected the dependency doc's false claim that Send anyway always works.

Dropped from this product-fix branch: broad VM tooling repair. The existing `vm-exec.sh` prints a guest failure without propagating it to the host shell, and a stopped-process failure initially left the old archive in use. This session changed approach: explicit guest exit inspection, exact process-tree termination, archive-size verification and a fresh restart before accepting runtime results. No claim relies on the earlier failed package swap.
