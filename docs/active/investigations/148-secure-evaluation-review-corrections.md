---
status: active
work_item: 148
---
# Independent security review corrections — unprivileged unit

## Authority, scope and verdict

The supplied reviewer path `fb8bc697-45dc-42ae-a294-f50ee875cc3b.report.md` was absent. Corrections use the parent's explicit three HIGH findings. Design corrections were recorded before edits in `148-secure-evaluation-qualification.md`.

**basic / compare / thorough: NOT QUALIFIED. All NEW execution, including schema-1 historical replay, is blocked. Submission acceptance remains unverified/reward zero.** This unit fixes bypass/containment and ingestion bugs; it does not implement the genuinely independent in-memory observation boundary or Harbor artifact/reward lifecycle. A correct-looking JSON frame is not proof that a function preserved its input or used the actual store state. No captured builtin references, Node vm or workers are claimed as a security fix. Previous Docker diagnostic outcomes are retained as historical evidence but their secure-acceptance interpretation is explicitly retracted.

No elevated/container commands, installs, paid calls, paused-job resumption/cleanup, production-app interaction or implementation commits were issued. Paused controllers were not inspected, signalled or resumed. Historical manifests, ledgers and attempts were not edited. The full-report bridge and parent reporting/timing modules remain intact.

Operational limitation: an initial broad legacy-regression command was mistakenly selected before auditing its test bodies; those suites contain real child-signal tests. That command is not used as current restricted-unit verification evidence. Subsequent legacy verification explicitly selected no-signal fake-backend/dry/report tests. No explicit process signal/cleanup command or paused-controller operation was issued by this unit. The real-signal/bootstrap test changes noted below were not rerun under this restriction.

## 1. Universal execution admission (schema downgrade)

`run_objective_comparison.execute` and `run_parallel_comparison.execute` now always call `admit_execution`, not only for schema 2. Their CLI execute paths do so before validation reads trial tokens/budget state. `targeted_workflow.run` checks authority before its snapshot/token/ledger validation, receipt parsing, key metadata or backend acquisition. The mode workflow's admission also precedes its check path. Report/dry paths do not invoke execution admission.

`evaluation_qualification.admit_execution` and `admit` universally refuse while the independent observation boundary is missing. No caller schema, downgraded limits, authorized boolean or old receipt can select a legacy spending path. The frozen prepared/execution equality check is retained behind the hold; this is not a new authorization mechanism or grandfathered execution allowance. Future execution needs exact immutable controller authority AND current independently qualified observations/lifecycle.

TDD counterexample uses a schema-1 downgraded manifest retaining arm/rows/token hashes with restored native 20/180 settings. It patches the authority refusal, runner, backend and key boundary and asserts all entry points call admission and none reaches runner/gateway/key. Separate tests exercise the **actual** universal hold for schema values absent/1/2/3/string-2, and CLI admission before token/ledger validation.

Legacy orchestration tests now explicitly mock the authority boundary inside their fixtures. These mocks are labeled injected lifecycle tests, never proof of production authorization. A child bootstrap in the legacy parallel signal test has the same explicit fixture injection; it was syntax-checked, not executed again under this unit's signal prohibition.

## 2. Forged side-effect observations

`secure_evaluation.observation_boundary()` documents the missing trusted observation/enforcement layer. `verify` performs only bounded protected-state ingestion and returns:

```text
passed: false
reward: 0
submissionAcceptance: false
category: unverified-observation-boundary
functionalChecks: null
```

No submitted-code executor call occurs. `functional` also refuses at its own entry rather than retaining an alternate diagnostic-to-acceptance bypass. `LocalProbe.acceptance` marks every task unqualified without executing its reference/negative controls through the compromised protocol. `submission-executor.cjs` now warns explicitly that status/errors/config/mutations/unchanged and every serialized field can be forged by submitted code.

The regression models the requested attack using a trusted Python frame: the returned migration result exactly equals the independent expected output and the frame says `unchanged:true`, while the modeled implementation has actually mutated its input and patched serialization. The frame is syntactically valid; nevertheless it cannot grant acceptance and the executor is never called. No hostile JS was executed on the host. Adversarial runtime behavior is **unverified**, not promoted to qualified from this simulation.

Required future architecture: independent filesystem observation can inspect a quiesced isolated submission state from trusted descriptors; it cannot authenticate in-memory mutation facts reported by a compromised JS worker. Input purity/store-operation checks require independently enforced semantics or a genuinely trusted observation mechanism outside that worker. Merely relocating expected-value computation to Python does not supply it. Harbor state extraction and trusted reward transport remain separate missing lifecycle work.

## 3. Bounded ingestion before content reads

New `scripts/harness-lab/bounded_inputs.py` is used by `comparison_tasks.hashes` and `secure_evaluation.safe_copy`:

- Entire metadata preflight finishes before any file content read. Limits: 10,000 entries including directories, 64 levels, 8 MiB/file, 128 MiB total, shared 90-second default deadline.
- Bounded unsorted `scandir` iteration, no unbounded recursive glob/list/sort. Reject symlinks, hardlinks, special files and escaped names. Open every root/ancestor/child component using descriptor-relative no-follow/nonblocking ordinary-file/directory opens. Unsupported descriptor platforms fail closed.
- Content streamed in at most 64 KiB reads; no `read_bytes` of submitted files. `fstat` verifies device/inode/type/mode/link count/size/mtime/ctime before, during and after reads. Unexpected growth/shortening/replacement fails. A final metadata-only bounded re-enumeration detects added/replaced entries.
- Copy cleanup closes file/directory descriptors and removes its newly created incomplete destination on read/metadata/deadline errors. Destination is a fresh controller-owned private tree, not an agent-writable output mount.
- The same deadline passes from `hashes`/`safe_copy` metadata through streaming/re-enumeration, and from verification ingestion into the dormant executor call API. Executor setup commands are deadline-limited; cleanup retains its separate bounded allowance rather than skipping cleanup on expiry. Current submission verification never starts that executor.

Tests create a sparse 129 MiB metadata-only file, assert both `os.read` and whole-file `Path.read_bytes` are untouched on rejection, count directories against entry bounds, reject FIFO/symlink/hardlink entries, simulate growth during reading and link replacement after scan, enforce total-byte/deadline limits, compare streamed SHA/copy content and confirm a read error leaves no partial copy or descriptor leak. No huge in-memory allocation or hostile runtime code is required.

## Test evidence

Tests-first red command:

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_security_corrections.py
Ran 6 tests in 0.137s
FAILED (failures=2, errors=4)
```

`/tmp/148-corrections-red.log`: sparse oversize was not rejected; the schema downgrade did not reach admission (fell into unguarded launcher code); forged-observation containment lacked the required verdict; bounded ingestion module was absent. These are real-site regressions rather than source-text guards.

Final current tests:

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_security_corrections.py
Ran 10 tests in 0.053s
OK

PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_secure_evaluation.py
Ran 9 tests in 0.026s
OK
```

Logs: `/tmp/148-corrections-final.log`, `/tmp/148-corrections-final-existing.log`. Explicit selected legacy regression command retained in the tool transcript builds a `unittest.TestSuite` of 19 serial tests excluding `real_local`, `signal_between`, `docker`; five named parallel dry/resource/budget cases; and 15 workflow fake/report cases excluding `signal`/`acquisition_window`. `/tmp/148-corrections-legacy-nosignals.log`:

```text
Ran 39 tests in 3.729s
OK
```

The broad legacy suites are NOT claimed wholly verified under this restriction; real process-signal/container-cleanup cases were excluded from the final selection. The parent's full report loader tests ran separately:

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_mode_reporting.py
Ran 6 tests in 0.899s
OK
```

`node --check scripts/harness-lab/submission-executor.cjs` and `git diff --check` returned exit 0. No new runtime qualification receipt is claimed.

Final current-source rerun after own-diff cleanup review and strengthening the simulated mutation:

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_security_corrections.py
Ran 10 tests in 0.025s
OK

PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_secure_evaluation.py
Ran 9 tests in 0.027s
OK

PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_evaluation_workflow.py
Ran 10 tests in 85.283s
OK
```

Logs: `/tmp/148-corrections-final-v3.log`, `/tmp/148-corrections-final-existing-v3.log`, `/tmp/148-corrections-modes-final.log`. The all-mode suite exercised planning, preparation, frozen checks, command dry output and the full-report entry point for all three modes. An initial rerun failed only its expected refusal-message regex (`qualification`); the refusal now retains that word and the rerun passed. No paid/runtime admission was enabled to make tests green.

Own diff was read in full from `/tmp/148-corrections-own-review.diff` (against the retained earlier source; new files treated as additions). Final source hashes are in `/tmp/148-corrections-source-hashes.json`; these identify code, not qualified runtime receipts. The final small cleanup moves scan-root fstat into its descriptor-closing try/finally, and tests assert simulated input mutation actually happens despite forged `unchanged:true`. No report/timing analysis file was changed. Remaining blockers are genuine independent observation/enforcement, immutable controller execution authority with current qualification, native/image/adapter capabilities and Harbor extraction/trusted reward transport.
