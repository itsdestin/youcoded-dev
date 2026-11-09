---
status: active
work_item: 148
---
# Legacy trusted verification implementation

Scope: the existing 19 legacy tasks (15 data-only, four executing Python), without changing task/check/fixture definitions, frozen attempts, external-v2 or behavioral/report analysis.

1. Pin a new legacy protocol to actual full task definitions and verifier/invocation implementation hashes. Add failing protocol/reference tests before implementing it.
2. Retain data checks in an isolated `python3 -I -S` trusted namespace, bounded read-only snapshot and output/deadline. Controller orchestrates separate restricted Python sibling invocations for submitted modules/tests; no oracle or reward mount reaches those invocations. Preserve existing functional and unittest criteria, without treating stdout as honest coverage proof.
3. Dispatch the host plugin; fail closed fresh exports without it. Bind fresh plans/preparations and qualify every selected legacy task with reference/negative controls. Keep runtime qualification pending.
4. Exercise all references, semantic parity, hostile submissions, and fake-backend Harbor lifecycle through controller reward and reporting. Run relevant complete Python/Node suites offline (loopback fixtures allowed), inspect diff, and report actual results. No startup, installations, network/provider calls, daemon access, commits or live-app interaction.

## Implemented boundary

- `legacy-protocol.mjs`: `legacy-trusted-v1` / `restricted-python-v1`, full original definition/check/fixture identities and verification implementation binding.
- `legacy_verification.py`: original data-check source retained; executable spans replaced by controller comparisons of separate sibling observations. Qualification includes unchanged, missing/wrong output and each protected input.
- `python_executor.py` / `python-invocation.py`: independent rootless Python namespaces, isolated startup, read-only source, no proc/oracle/reward/home mount, process filter, bounded output and deadline with owned process cleanup.
- Host verifier dispatch, fresh fail-closed exports, mode preparation and selected-task qualification are connected. Fake-backend real Harbor Trials cover a data task and a Python task, both reference and forged-reward outcomes through the parent journal and full report.

Runtime/adapter/daemon qualification remains pending. Historical unittest stdout criteria are preserved, not upgraded to an honest-coverage claim; coherent multi-location still has no minimum test-count requirement. External-v2 task definitions and execution path remain unchanged.
