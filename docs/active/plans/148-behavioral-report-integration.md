---
status: active
work_item: 148
---
# Bounded behavioral evidence integration

## Boundary

Offline only; no startup helper, provider/network, installation, elevated commands, commits, live app or paused resources. Preserve independent outcomes and existing clock/scope accounting. No historical reconstruction or model behavior changes.

## Implementation sequence (TDD)

1. Pin controller evidence validation and report propagation with failing tests. A versioned controller-owned envelope binds run/task/checkpoint, adapter, raw capture hash and evidence hash. Import authority is supplied separately by the controller, never inferred from an agent file or prose. Reject stale, duplicate, mismatched or tampered envelopes without discarding independent task failures or other activity.
2. Add bounded common controller hooks for input/clarification/approval receipts, semantic labels plus same-checkpoint state, actual test exits, fixture-triggered recovery and continuation receipts. Existing runtime scripted fixtures/observer hooks remain the source for native demonstrations. No continuous scheduler coverage inferred from heartbeats.
3. Route validated rows through behavioral oracles, outcome scoring and interactions into the shared evaluation importer and targeted renderer in basic, compare and thorough modes. Keep provisional judge assessments separate. Missing semantic labels remain unknown; empty evidence is not a zero failure rate. Scripted burden is not human burden.
4. Demonstrate actual executable failure/repair/test, waiting positive/negative, verification positive/negative, premature stop/blocker, clarification/nudge/correction/approval and existing no-nudge helper/shell controls. Exercise collector -> import -> score -> printed cells, retaining failures and denominators.
5. Run focused then full offline Python/Node suites if stable. Run desktop verification only if app seam changes. Inspect changed files and record exact outputs, sample report paths and remaining unavailable signals.

## Real-run producer completion plan (reserved follow-on)

Read-only reviewer report was missing at its requested report path; recovered its final text from the same specialist transcript (`38ec1f4f-4c9f-4ad9-8ad0-8327504aa1ff`) before implementation. Preserve the parent's checkpoint receipt-count/observation-time fence and matching recovery-check repair.

1. TDD the ordinary serial controller producer and protected host callback channel, failure/interrupt envelopes, child-journal receipt retention and scorecard forwarding. Never promote agent-side SDK/permission observations into controller authority.
2. Connect host verifier callbacks and prospective inputs to a private sibling evidence directory before outcome journal append. Bind run/task/adapter/raw capture, retain host facts separately from agent observations, and leave semantic labels/complete registries unknown unless a trusted defined fixture supplies them.
3. Reuse existing native scripted runtime profiles through an explicitly host-owned launch wrapper for eligible observer/input/continuation callbacks; preserve native helper versus protocol shell scope. Do not modify legacy verification protocol/executors.
4. Exercise ordinary execute through scripted backend into serial/parallel immutable loaders, importer, scorecard and basic/compare/thorough Markdown. Include malformed/forged/stale evidence and failure precedence. Save a small raw receipt/summary/report proof bundle.
5. Hold source stable for full Python and Node suites, including loopback fixtures; no external/provider calls, installs, daemon access, startup, live app, paused resources or commits. Desktop verification only if an app seam is edited.

## Native ordinary-runtime telemetry completion (current bounded unit)

1. Add failing tests for ordinary (not smoke-profile gated) SDK/tool/decision/shell/queue receipts and their `runtime-observed` analysis. Keep controller-verified outcomes and validated-semantic assessments separate; no secure-authorship claim for container processes with arbitrary Bash access.
2. Attach bounded content-minimal callbacks in the existing lab worker for all runs, using current NativeSessionHost execution diagnostics, broker decisions, transcript boundaries, shell/specialist registry changes and queue events. Preserve monotonic clocks and capture fences. State samples/transitions do not imply continuous scheduler coverage.
3. Exercise the ordinary config/createRuntime path with an explicit no-provider scripted SDK transport. Add a genuine background Bash followup via native tools/notices, same-command fail/rerun observation, independent output verification and missed-followup/Stop-held negatives. No additional harness framework or paid path.
4. Feed runtime-observed metrics through the existing host publication/import/report route without promoting raw agent JSON to safety/human/semantic authority. Verify actual measurements plus forgery/missing-hook counterexamples; report remaining comparative coverage.
5. Run native runner/module tests, full harness Node/Python suites and desktop verify with stable source. Do not edit cleared engine/qualification/legacy acceptance paths.

## Implemented integration

- `scripts/harness-lab/behavior-evidence.mjs` owns the version-1 collector envelope and validation. Run/task/adapter identity, monotonic receipt ordering, raw-capture SHA-256, unique checkpoint ranges, cited semantic labels, distinct execution/repair receipts and evidence-integrity SHA-256 are validated. Model-judge verdicts remain provisional.
- `evaluation-import.mjs` derives behavioral rows before shared activity/outcome scoring. Invalid optional evidence leaves usable activity and independent task failure intact. Untrusted `raw.controllerEvidence` / `raw.continuation` cannot certify controller behavior.
- `targeted_report.py` selects only an outcome journal's `controllerBehavior: {path, sha256}` receipt. The path must be an ordinary canonical file directly under the manifest's `controller-behavior/` sibling, outside jobs/agent trees. Serialize the envelope with `JSON.stringify(envelope)` (no added newline) before journal-pinning its bytes. A hash proves integrity, not authorship: the execution controller must own the journal/directory and keep them outside agent mounts. Do not promote arbitrary agent files by hashing them.
- The shared renderer prints supervision counts/waits, checkpoint-cited semantic assessments, actual named test exits (including earlier failures), scored safety/recovery rows, SDK-attempt/token overhead and precise missing capabilities in all three modes. Empty trigger observations become not-applicable only with an explicit complete trigger monitor; missing monitoring remains unknown.
- `behavior-fixtures.mjs` executes an owned delayed child, actual failing/rerun checks around a repair, a real shared SDK observer callback with a local scripted model, existing clarification and scenario dispatchers, and a protected-file readback. It is a controller protocol control, not a competitor or native-model measurement.
- `behavior-collection-example.mjs` additionally launches the existing native background-followthrough, waiting-after-report, lost-report, clarification and activity-timing profiles. It consumes genuine collector receipts only from those known controller-launched offline fixtures, never arbitrary historical agent files. The compact sample distinguishes shell/controller-protocol from helper/native-parent continuation, and the scorer refuses to pool those consumer scopes.

### Future run producers versus measured controls

The ordinary serial execution controller now creates a private host callback policy/journal outside agent mounts, seals an envelope before outcome append, and attaches `controllerBehavior` on completed, failed and interrupted attempts where capture is possible. Host Harbor verification callbacks contribute actual named sandbox exits and independent protected-input readbacks. The parallel loader retains the validated serial child's receipt and keeps parent failure precedence. The scorecard forwards task/envelope/authority and shares both derived outcome and budget safety accounting with the common importer. Host callback clocks and the existing answer checkpoint fence prevent post-run tests from retroactively validating an answer.

`native-behavior.mjs` / `controller_behavior.run_owned_native_profile` reuse existing fixed native smoke profiles through a trusted host-owned launch (empty disposable cwd, fixed synthetic prompt, no provider credentials). Their real SDK observer, scripted permission/clarification and native-helper continuation hooks feed the collector only under that launch's capture binding. Ordinary production **container** SDK/permission/continuation fields remain explicitly untrusted `agentObservations`, never human/safety/registry authority; a plain hash of them is not authorship. The producer names these limits in every new envelope/report.

### Native ordinary-runtime instrumentation now connected

`lab-worker.mjs` attaches `lab-runtime-telemetry.mjs` for every run, including provider-backed ordinary configs, without a synthetic/smoke-profile gate. It records SDK starts/ends and reported usage, actual execution start/end status and tool-result errors, exact Bash command hashes, actual permission-policy decisions plus scripted broker answers, native ShellRegistry status/exit/Stop reason, model-facing notice delivery attempts and transcript injections, specialist changes, root-input/send and queue changes, and deduplicated scheduler state observations. `runtime-observed.mjs` derives observed spans, same-command fail/rerun episodes and their in-window SDK counts/tokens, and shell completion → injection → request/subsequent-tool timing. No foreground numeric exit code is parsed out of stdout; foreground status is actual runtime execution completed/failed. Background numeric exits come from ShellRegistry.

The ordinary config path has an explicit `--offline-script` SDK transport for no-provider tests; it does not set `synthetic` or use a smoke profile. It refuses keys/gateway/live flags, bounds scripts and denies fetch. The actual createRuntime, native tools, permissions, ShellRegistry, background notices and task files are unchanged by that transport. The native shell fixture holds its process on a file until the actual parent terminal event, then native notice delivery triggers a subsequent required Write. Missing-followup and explicit Stop-held controls retain missing output and never manufacture false-waiting verdicts. These are native assistant shell controls, not the old controller-protocol shell emulator.

**Trust boundary:** runtime code and arbitrary task Bash share the container uid/process namespace. A dedicated pipe/log or capture hash cannot establish unforgeable observer authorship there without host execution or a separately isolated trusted observer. That is not a prerequisite to useful diagnostic telemetry: ordinary callbacks are explicitly `runtime-observed`; host acceptance/protected-input results remain `controller-verified`; semantic labels still need validated fixture/human evidence. Runtime observations do not enter the controller collector's safety/human/semantic rows. The native SDK request list is cross-checked for correlation, and independent gateway counts stay a separate scope.

`analyzeActivity` and both report entry points now retain and print this observed lane independently. The existing all-mode ordinary-controller test uses an actual native agent run with ordinary config/scripted SDK inside real Harbor fake-backend Trials (not an after-the-run synthetic capture replacement). Host publication, serial/parallel loader, importer and printed reports preserve runtime metrics alongside independently verified task results and intentional protected-input failures. Defined required shell-output bytes are independently read by the host fixture; generic final pass or an unrelated check cannot establish recovery.

**Remaining coverage limits, not unfinished native callback wiring:** same-container telemetry is not tamper certification; scheduler event/sampled intervals are not continuous dependency coverage; same-command passing after failure is not causal semantic repair or honest test coverage. True human supervision and general false-waiting/verification labels are not inferred from policy decisions or prose. Competitor-internal SDK/decision/queue/shell registries need instrumentation in those external products; no historical backfill or universal comparability is claimed. No paid/model judge, real backend qualification or performance comparison was run.

## Verification and sample evidence

Final focused command:

```bash
node --test scripts/harness-lab/behavior-evidence.test.mjs scripts/harness-lab/behavior-oracles.test.mjs scripts/harness-lab/outcome-scores.test.mjs scripts/harness-lab/interactions.test.mjs scripts/harness-lab/continuation-metrics.test.mjs scripts/harness-lab/activity-normalize.test.mjs scripts/harness-lab/evaluation-report.test.mjs
```

Actual output: `tests 79`, `pass 79`, `fail 0` (`/tmp/148-behavior-focused-v4.log`). `python3 -m unittest discover -s scripts/harness-lab -p 'test_mode_reporting.py'` produced `Ran 7 tests in 2.085s`, `OK` (`/tmp/148-behavior-modes-v4.log`); its behavioral test traverses the complete journal/manifest/raw capture loader, importer, derivation and printed cells in basic/compare/thorough, including optional evidence tampering and N/A versus unknown.

Broad Node command selects `scripts/harness-lab/*.test.mjs` except `openrouter-gateway.test.mjs` (HTTP fixtures excluded under the no-network boundary), then invokes `node --test` on that exact array. Actual output: `tests 206`, `pass 206`, `fail 0` (`/tmp/148-node-offline-v4.log`). Syntax/whitespace verification printed `Node syntax/added-file whitespace: 8 passed; Python AST: 2 passed`.

Final dependency-complete broad Python run used `PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B` with unittest discovery over `scripts/harness-lab/test_*.py`, flattening the discovered suite and excluding exactly `test_anthropic_gate.GateHttpTests.test_invalid_auth_never_reaches_upstream` and `test_anthropic_gate.GateHttpTests.test_local_upstream_stub_auth_streaming_and_safe_ledger` (the two HTTP fixtures). Actual output: `Ran 227 tests in 332.223s`, `OK`; command `python_exit=0` (`/tmp/148-python-offline-v4.log`). Source stayed unchanged throughout this final run. Expected refusal messages from negative admission tests are retained in its log, not treated as successful evaluations.

`node scripts/harness-lab/behavior-collection-example.mjs scratch/behavioral-collection-v4` exited 0. Read-back sample: `scratch/behavioral-collection-v4/sample-report.md`; complete shared-renderer examples are `basic.md`, `compare.md`, `thorough.md` alongside raw captures, controller envelopes, derived JSON and source hashes. Six controls demonstrate actual process/test and native lifecycle receipts. The sample retains two native continuation failures, the initial test exit 1, one false verification claim, one false waiting assessment, one premature stop and an unlabeled waiting observation. It does not relabel a later repair as erasing earlier failures. Native clarification/approval wait spans retain their worker clock identity separately from controller clocks.

A real review red control found that the first new checkpoint validator accepted a child display copy (`actual 'partial'`, expected `'unsupported'`; `/tmp/148-parent-quote-red.log`). The final tests pin exclusion of both child markers and retracted text, and causal receipt ordering when monotonic timestamps tie. Earlier system-Python broad collection lacked Harbor; the already installed dependency-complete interpreter is `/tmp/yc-harbor-check-148/bin/python`, without installation. An earlier source-pinning test correctly refused source changes made during a broad run; final broad runs hold source unchanged. An initial diagnostic fail-fast command inadvertently included the existing two **loopback-only HTTP** tests; final broad commands exclude these, with no provider or external network call.

No app diagnostic seam, product tool behavior, IPC or Android code was edited; no desktop verification run is claimed. No startup helper, elevated command, installation, commit, paid evaluation, live-app operation or paused-resource action was used. The separate legacy-task unit remains untouched and needs its next sequential brief.

## Ordinary-controller producer verification

Final stable-source commands (no exclusions, loopback fixtures allowed):

```bash
/tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p 'test_*.py'
node --test scripts/harness-lab/*.test.mjs
```

Actual results: `Ran 242 tests in 397.560s`, `OK` (`/tmp/148-behavior-stable-full-python.log`); Node `tests 250`, `pass 250`, `fail 0`, `skipped 0` (`/tmp/148-behavior-stable-full-node.log`). The complete Python run includes the parent's legacy Fraction/exception-family parity fixes; those legacy protocol/executor files were not edited in this unit. Focused controller/mode/coordinator/real-Harbor tests also produced `Ran 64 tests in 34.742s`, `OK` before the final full suite.

`YC_BEHAVIOR_PROOF_DIR=<workspace>/scratch/behavior-producer-v4 /tmp/yc-harbor-check-148/bin/python -B -m unittest test_mode_reporting.ModeReporting.test_ordinary_controller_produces_protected_behavior_for_serial_and_parallel_modes` saved actual controller-produced callback journals/envelopes/captures, outcome journals and printed basic/compare/thorough summaries under `scratch/behavior-producer-v4/`. Read back the Markdown and exact counts: compare-parallel retains one passed task, one intentional protected-input verification failure, one interrupted cell and three unstarted cells; thorough-parallel retains the same observations plus twelve unstarted cells. These are the existing reporting-fixture matrices, not a full thorough benchmark or competitor/model performance measurement. The native helper observation is the existing synthetic host-owned profile. No receipt is injected after execution; the actual parallel coordinator creates/validates child manifests and journals.

The new tests cover serial success/failure/interruption publication, forged agent evidence, raw capture mismatch, validated child receipt retention, parent failure precedence and child-journal hash changes. Scorecard tests verify shared derived outcome and budget safety rather than rescoring raw records. The parent's delayed-claim checkpoint fence and matching recovery-test negative remain passing. Existing native clarification/approval and helper success/two failures feed the same collector through the fixed host wrapper; shell/controller-protocol coverage stays separate. No app files or diagnostic seams were edited, so desktop verification is not claimed or required by this unit.

## Native ordinary-runtime final verification

Stable-source checks after the ordinary native hooks/transport/report integration:

```bash
node --test scripts/harness-lab/*.test.mjs
node --test youcoded/desktop/test-engine/lab-*.test.mjs
/tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p 'test_*.py'
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded
```

Actual output: harness Node `tests 251`, `pass 251`, `fail 0`, `skipped 0` (`/tmp/148-native-stable-full-node.log`); native lab `tests 59`, `pass 59`, `fail 0`, `skipped 0` (`/tmp/148-native-stable-lab-tests.log`); Python `Ran 242 tests in 380.332s`, `OK` (`/tmp/148-native-stable-full-python.log`); desktop verification PASS types, test types, related tests, knip, lint, design lint and ast-grep, `OK — all checks passed` (`/tmp/148-native-stable-desktop-verify.log`). No arbitrary test exclusions; no installs, daemon/provider calls, live app or paid evaluation. Source stayed unchanged throughout the final full checks. Only app lab-worker/runner/test/helper files were edited, not packaged runtime logic, IPC or Android.

Retained ordinary invocation proof: `scratch/native-runtime-observed-v1/README.md`, six all-mode serial/parallel `report.md` + `summary.json` folders with host-published captures/envelopes/journals, and `native-shell-controls/{ordinary-positive,missed-followup,stop-held}/{raw.json,analysis.json,fixture-checks.json}`. The ordinary all-mode native task observes nine SDK attempts, one failed actual execution, one exact-command passing rerun, real clarification/answer callbacks and a native background-shell notice followed by required Write. Compare-parallel retains the intentional protected-input failure and interrupted/unstarted cells. The standalone native positive has eight SDK attempts and independently checked required output; both shell negatives retain missing output. Stop-held has an exited shell but no automatic turn delivery and is not scored as false waiting. These are offline diagnostic controls, not comparative model-performance claims or a full thorough benchmark.

## Honest limits

Semantic evidence requires a declared fixture/human label citing captured text, not regex interpretation. Real human supervision, live model behavior, competitor-internal complete scheduler/work-state and continuous dependencies cannot be established by scripted controls. The report must name the missing hook/label for each such signal rather than presenting an unknown cell as completed measurement.
