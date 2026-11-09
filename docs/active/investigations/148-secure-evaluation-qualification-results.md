---
status: active
work_item: 148
---
# Secure acceptance, whole-matrix preflight and full-report entry point

## Security correction — earlier acceptance interpretation retracted

Latest independent review (parent supplied findings; `fb8bc697-45dc-42ae-a294-f50ee875cc3b.report.md` absent) proved three HIGH gaps: schema downgrade bypassed admission, compromised JS serialization could forge correct-looking side-effect observations, and hashing preceded resource bounds. The earlier runtime diagnostics below are historical observations, **NOT proof of secure submission acceptance**. Current code universally blocks ALL new execution regardless of schema and returns unverified/reward zero for submissions until genuine independent observation/enforcement and Harbor authority/lifecycle exist. See `148-secure-evaluation-review-corrections.md` for current source/test evidence. No container/elevated runtime verification is authorized for this correction.

## Earlier unit verdict and boundaries

**basic: NOT QUALIFIED; compare: NOT QUALIFIED; thorough: NOT QUALIFIED.** No mode or image is approved for paid execution. The current standalone secure-controller implementation is substantive and exercised with actual free Docker runs, but this does **not** complete Harbor artifact extraction/trusted reward transport or the full evaluator contract. Those missing integrations are explicitly blocking, not replaced with canned qualification or omitted cells.

No provider calls, provider-key loading, image pulls, network-dependent builds, installs, implementation commits, merges or production-app experiments were performed. Matrix runs used a fresh dummy ledger, not the historical spending ledger. Historical attempts, manifests, ledgers and earlier diagnostic outputs were retained.

The user subsequently revoked further elevated operations because of repeated password prompts. No additional elevated command was issued after that steer. Three already-running controller processes were paused with unprivileged SIGSTOP to preserve evidence while preventing them from issuing more Docker operations. No elevated cleanup was attempted. Current final-source qualification is therefore incomplete; earlier successful tests must not be relabeled as a current completed receipt.

## Implementation

- Design was written first in `docs/active/plans/148-secure-evaluation-qualification.md`; tests-first red baseline: `/tmp/148-secure-red.log` (`ModuleNotFoundError: secure_evaluation`).
- `scripts/harness-lab/secure_evaluation.py`: trusted host oracle, independent Python behavior/crypto/optimization checks, strict untrusted JSON protocol, copied/read-only inputs, no host import of submitted JS, fresh non-root Docker executor per invocation, network-none/read-only/capability-dropped/no-new-privileges execution, bounded CPU/memory/PID/file/tmpfs/output/time and cleanup. Symlinks, hardlinks and traversal are refused. The loader's vm is not a security boundary.
- `submission-executor.cjs`: public invocation adapter only; no oracle/baseline is mounted. Returned values are independently checked observations, not success sentinels. Generated throwaway release-signing keys are not provider secrets; only the final isolated signing invocation receives the disposable private key.
- `comparison_tasks.verify_against(..., executor=DockerExecutor(...))`: real isolated submission API. Without an explicit isolated executor it remains fail-closed. The old `verify` / explicitly flagged `comparison-verify.cjs` helper remains trusted-fixture-only. Exported Harbor shells are still reward-0/fail-closed; no trusted-fixture flag or Docker socket was added to them.
- `evaluation_qualification.py`: all arms, distinct native lock keys, tasks and cells retained; exact local image identity/version/dependency/runtime checks, actual reference and negative controls, fixture/reset and isolation probes, explicit lifecycle blockers. Receipts bind raw prepared manifest, immutable snapshot hashes, controller source, image and observations; admission repeats current preflight rather than accepting caller booleans or stale receipts. Source drift during qualification demonstrably refused `/tmp/148-matrix-qualification-v3.log`.
- Admission-only guards in `evaluation_workflow.py`, `targeted_workflow.py`, `run_objective_comparison.py` and `run_parallel_comparison.py` prevent compatibility/direct schema-2 launchers from bypassing qualification. No timing/report analysis module was edited by this unit.
- Full report bridge in `evaluation_workflow.report`: parent's `targeted_report.load_targeted_report` / `render_markdown` now produce `summary.json` and `report.md`; old inventories are supplemental only. No current planner or runtime qualification is required to report frozen evidence. `MODES.md` documents the interfaces and remaining limits.

## Actual free Docker evidence (before access revocation)

Existing image identity: `youcoded-harness-competitors@sha256:65cff6f1e1ed586ff9322c3b31405ecc44386d6db5af1e5b55b2e577dea34248` (same actual image ID). Node reported **v22.23.3**, `stripTypeScriptTypes` available.

`/tmp/148-secure-docker-v2.log` and `scratch/secure-boundary-qualification-v2/results.json`: **27/27 expected control outcomes**, 285 actual isolated invocations, 0 provider calls: three references and two alternatives accepted; 16 named mutations and six hostile/link controls rejected. This was an earlier implementation revision, not an immutable final-source receipt.

`/tmp/148-secure-docker-v3.log`: additional actual direct infinite-loop rejection (`category: timeout`, `reason: executor timeout`), output forgery/flood rejection, independent removed-hash rejection (`hash bypass`) and removed-size rejection (`size bypass`). The run then refused source drift, so it is retained diagnostic evidence, **not qualified**. The corrected stdin handling was verified against a real reference before these runs; the initial v1 failure is retained.

Actual isolation observation: UID 65534; environment exactly HOME/NODE_NO_WARNINGS/PATH; writes to `/input`, `/adapter` and `/etc` rejected EROFS; no oracle or Docker socket visible. Actual bounded preflight stdout test returned `version: v22.23.3` and `flood rejected: runtime probe failed: ...`.

### Whole selected matrix diagnostics

Completed earlier diagnostic: `scratch/secure-mode-qualification-v1/{basic,compare,thorough}-qualification.json` and `/tmp/148-matrix-qualification-v1.log` (all cells retained: 6 / 6 / 110). This predates final hardening and is not an admission receipt for current code.

| Arm/build/image probe | Observed result | Qualification consequence |
|---|---|---|
| Native baseline and candidate | Both retained builds fingerprint `a9e0ea93e99476556a74db349d045284a9d2f5935097e59e334635d345fbe1a8`; lock key `8c53569be8e12cb7a1831fd5b90d5a7e8d86e3dec1086934e88e5188e8e91976`. Initial bind probe hit EACCES on private 0600 package-lock.json. Implementation now uses only a disposable permission-normalized copy. Corrected complete probe was not finished before pause. | **NOT QUALIFIED**; do not invent a dependency-availability verdict from the earlier permission failure. These retained builds are the same identity, not a demonstrated before/after optimization. |
| Claude Code | `2.1.302 (Claude Code)` | Installation version probe passed; whole arm **NOT QUALIFIED** pending lifecycle/native matrix requirements. |
| Pi | `1.3.0` | Installation version probe passed; whole arm **NOT QUALIFIED**. |
| OpenCode | `1.19.3` | Installation version probe passed; whole arm **NOT QUALIFIED**. |
| Hermes | `hermes: no dependency environment is committed for this install; run hermes pm repair` | **NOT QUALIFIED**; no repair/install was attempted. |
| Image as trusted verifier runtime | Actual probe `dockerCli=127 cryptoModule=1`; separate manual Python import reported `ModuleNotFoundError: cryptography`; Docker executable lookup produced none. | Image lacks those controller dependencies; no installs/pulls attempted. Host controller uses existing `/tmp/yc-harbor-check-148/bin/python`. |
| Harbor lifecycle | Frozen exports use shared verifier environments. Installed Harbor supports separate environments, but host-controller extraction/reward transport is not implemented. | Every affected cell **NOT QUALIFIED**; do not give shared agent environments an oracle or Docker socket. Legacy verifier task lifecycles remain explicitly unsupported. |

Current-final-source runs paused: `scratch/secure-mode-qualification-v4/` and `scratch/secure-boundary-qualification-v5/`. Their partial logs are `/tmp/148-matrix-qualification-v4.log` and `/tmp/148-secure-docker-v5.log`; the latter records an accepted release reference and rejected forbidden-state mutation before pause. No complete final-source receipt is claimed.

## Unprivileged tests and full-report output

Commands all used the already-installed interpreter (no reinstall):

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_secure_evaluation.py
Ran 9 tests in 0.034s
OK

... -p test_evaluation_workflow.py
Ran 10 tests in 103.654s
OK

... -p test_run_objective_comparison.py
Ran 25 tests in 1.407s
OK

... -p test_run_parallel_comparison.py
Ran 21 tests in 1.336s
OK

... -p test_targeted_workflow.py
Ran 18 tests in 4.748s
OK

... -p test_mode_reporting.py
Ran 6 tests in 1.134s
OK

... -p test_comparison_verifier_review.py
Ran 4 tests in 5.013s
OK

node --test scripts/harness-lab/comparison-loader.test.mjs scripts/harness-lab/evaluation-modes.test.mjs
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

Logs: `/tmp/148-secure-final-unit-v3.log`, `/tmp/148-workflow-final-v2.log`, `/tmp/148-serial-final-v2.log`, `/tmp/148-parallel-final-v2.log`, `/tmp/148-targeted-final-v2.log`, `/tmp/148-mode-report-final-v2.log`, `/tmp/148-verifier-review.log`, `/tmp/148-secure-node.log`. AST parsing of ten touched Python files, `node --check submission-executor.cjs` and `git diff --check` also completed without errors. Untracked source means the own-diff review additionally used retained immutable source snapshots and no-index new-file diffs, not only Git's tracked diff.

Current full report entry point was exercised again unprivileged against all three original frozen bundles. Output in `scratch/secure-evaluation-full-reports-v1/`; `/tmp/148-report-entrypoint-final.log`:

```json
{"mode":"basic","families":13,"cells":6,"adapters":["youcoded"],"outcomes":["unstarted"],"providerCalls":0}
{"mode":"compare","families":13,"cells":6,"adapters":["claude-code","youcoded"],"outcomes":["unstarted"],"providerCalls":0}
{"mode":"thorough","families":13,"cells":110,"adapters":["claude-code","hermes","opencode","pi","youcoded"],"outcomes":["unstarted"],"providerCalls":0}
```

Read the generated compare Markdown directly: task/adapter rows, unknown costs/tokens/times and all family headings are retained; no measurements were fabricated. The parent's report module still has generic “Baseline versus candidate” subcopy under compare's correct mode title; this unit did not edit that parent-owned renderer.

## Paused resources / required parent follow-up

No new elevated commands or cleanup are authorized. Exact paused owned controller PIDs verified before SIGSTOP:

- **3712419**: older boundary v4, shell `sh-fabd`, output `scratch/secure-boundary-qualification-v4/`, `/tmp/148-secure-docker-v4.log`.
- **3779047**: final boundary v5, shell `sh-a33f`, output `scratch/secure-boundary-qualification-v5/`, `/tmp/148-secure-docker-v5.log`.
- **3779816**: final mode matrix v4, shell `sh-e1cc`, output `scratch/secure-mode-qualification-v4/`, `/tmp/148-matrix-qualification-v4.log`.

Each had an already-exited child Docker client (3807939 / 3807937 / 3807938 respectively); unprivileged proc inspection returned empty command lines. Exact current container IDs/names could not be recovered without Docker access and were not guessed. Potential pending resources use **`yc-accept-`** / **`yc-qualify-`** name prefixes; the qualifier issued no network/gateway/volume-creation commands (its writable execution state uses tmpfs). A parent-authorized bounded inspection/cleanup or resumption decision is needed; do not broadly kill Docker or touch the live app. Held temporary fixture directories should not be removed underneath paused controllers. There is no provider job/gateway to stop.
