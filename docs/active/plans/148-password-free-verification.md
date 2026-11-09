---
status: active
work_item: 148
---
# Password-free external-behavior verification

## Bounded implementation plan (before code edits)

Use the existing `/usr/bin/bwrap`, without sudo, Docker, installs, network or provider calls. The trusted Python controller remains outside the submission's user/PID/mount/network namespaces. It stages bounded no-link copies, mounts source and public invocation adapters read-only, clears the environment, mounts no home, credentials, oracle, socket or controller files, and independently compares functional outputs and post-execution persisted files. The public adapter is not trusted: a submission may replace its JSON serialization and claim any return value. Only external outputs satisfying every independent host case count. Exit zero, a nonce, or a `passed` field is not acceptance.

Preserve `comparison-contracts.json` (substantial-development-v1) and all historical freezes. Add a separately named v2 external-behavior contract and require explicit v2 selection at the submission API. V1 remains unverified. V2 does NOT assert unobservable in-memory input purity, actual lock invocation counts, patch alias timing or internal concurrent execution. Instead it enforces read-only persisted inputs, normalized public API results, and persisted state after a serial API transaction sequence. It retains real parser/publisher/verifier/store/cloud/CLI entry points, original-defect regression-test controls, signatures, host-computed optimizer variants, exclusive/atomic CLI output and deterministic/idempotent batches. Authentic native runtime concurrency is a different capability, not inferred from a child field.

Execution limits: per-call wall/CPU/address-space/file-descriptor/file-size/output bounds, small tmpfs scratch, bounded host output-directory enumeration and aggregate-byte checks during execution and after quiescence. Deny process creation using a Linux x86-64 seccomp filter (threads allowed for Node); host launches CLI and submitted regression tests as separate sandboxes, so they cannot spawn unmanaged descendants. This is a deliberately restricted offline Node execution API, not a general shell or kernel-escape security claim. Unsupported platforms/features fail closed. Output-directory count/byte checks are observation/kill bounds, not filesystem quotas; acceptance requires the final bounded tree to validate. No live or paused process is signalled; cleanup signals only each newly created test-owned process group.

Add real offline tests for references and alternatives; unchanged/mutated source; early exit and forged valid frames; JS stdlib tampering; protected filesystem and proc tampering; home/socket/network absence; deadlines/output floods; oversize input preflight and output limits. Use separate disposable copies for original-defect controls, never execute submitted tests on the host. Run complete relevant Python suites under the existing Harbor environment and Node suites, correcting admission-fixture drift rather than filtering tests to green.

The whole selected matrix, image/native/adapter dependencies, immutable authority and trusted Harbor reward/extraction lifecycle remain independent blockers. A passing v2 rootless check must NOT unlock execution or paid runs. Do not edit parent timing/report modules, history, ledgers or paused resources. No implementation commits in this unit.

## Implemented and verified

- Added `scripts/harness-lab/{bwrap_executor.py,external_verification.py,external-invocation.cjs,comparison-external-v2.json,test_external_verification.py}`; integrated explicit version/backend selection in `comparison_tasks.py`; documented the separate v2 route in `MODES.md`.
- Existing v1 contract, Docker-unqualified acceptance and all production admission guards remain unchanged. No privileged commands, installs, Docker invocations or provider calls were used for the new executor. All new hostile JS executes inside bubblewrap. Legacy trusted-fixture tests retain their existing host-only fixture helpers; those are not the v2 submission path.
- Actual full pinned-source references passed: release 36 completed checks, migration 24, planner 24. Every verdict retained `matrixQualified:false`, `providerCalls:0`. Log: `/tmp/148-bwrap-full-source.log`. The separate functional test fixture uses a smaller real pinned dependency slice for repeated alternatives/mutants; the full-source run confirms all three against the complete snapshot.
- Node 26 TypeScript requires WebAssembly. A jitless/1 GiB-address-space attempt failed visibly; the final tested executor uses 16 GiB **virtual** address space, a 2 GiB writable-data limit, 128 MiB old heap and reduced Wasm code reservation. These are resource bounds, not a claim of 128 MiB total process memory. Output count/aggregate-byte checks are monitored rejection/kill bounds, not hard disk/inode quotas. Scratch has an 8 MiB tmpfs byte limit; no separate scratch inode quota is claimed.
- Actual hostile module preserves the valid public store frame while patching `JSON.stringify` to corrupt `/output/config.json`. Independent post-exit Python inspection rejects it for changed persisted state. Empty success, fake passed/reward JSON, early exit, original source, all 16 registered source/output mutations, same-length bad update bytes, independently signed wrong sizes, and resource/isolation controls also reject. Equivalent reference implementation variants pass.

### Final commands and actual output

```text
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p test_external_verification.py
Ran 9 tests in 22.748s
OK

PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -B -m unittest discover -s scripts/harness-lab -p 'test_*.py'
Ran 182 tests in 109.717s
OK

PATH=/tmp/yc-harbor-check-148/bin:$PATH PYTHONDONTWRITEBYTECODE=1 node --test scripts/harness-lab/*.test.mjs
ℹ tests 234
ℹ pass 234
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Logs: `/tmp/148-bwrap-final-controls.log`, `/tmp/148-bwrap-final-python.log`, `/tmp/148-bwrap-full-node.log`. The full Python command includes legacy lifecycle/admission and child-signal tests, not a filtered selection; all pass under the existing Harbor environment. No legacy test source changes were needed in this unit. `node --check scripts/harness-lab/external-invocation.cjs`, the external controller `--help`, and `git diff --check` returned exit 0. New implementation files and changed sections were read back before handoff.

Operational disclosure: the mandatory startup command `workspace-start --session 148-harness-performance-lab --item 148` itself reported an automatic card-link save to master (`0450dcbb`). No `git commit` or push was issued by this implementation; no implementation files were committed. Nothing was undone in the shared workspace.

This delivers runnable offline v2 functional acceptance, **not** an enabled basic/compare/thorough paid workflow or trusted Harbor reward transport. The no-kernel-escape-guarantee, restricted no-subprocess Node API, monitored filesystem bounds and unverified internal concurrency remain explicit limitations.
