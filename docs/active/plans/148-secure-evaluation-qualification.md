---
status: active
work_item: 148
---
# Secure acceptance and whole-matrix qualification

Authority: `148-evaluation-product-contract.md`. Offline implementation only; no provider calls, installs, image pulls, commits or historical evidence edits.

## Design (before implementation)

A trusted host controller owns the baseline, independent behavioral oracle, receipt and reward. Submitted source is never imported into that process. A separate disposable Docker executor receives only a copied source tree, a public invocation adapter and JSON requests. It receives no oracle, baseline, source checkout, Docker socket, credentials, inherited environment or host-writable bind. The runtime has no network, read-only root, dropped capabilities, no-new-privileges, non-root UID, CPU/memory/PID/file/output/time bounds and bounded tmpfs. Fresh invocations prevent monkeypatched globals surviving between checks. Node vm is only a compatibility loader inside that executor, not isolation.

JSON responses are untrusted observations, not acceptance decisions. The controller checks exact framing/completion, independently computed expected behavior, submitted-test mutation controls and protected input hashes. Early exit, forged pass sentinels, oracle/temp-file tampering, infinite loops, traversal/symlinks, wrong outputs and malformed protocols fail with reward zero. Equivalent correct implementations remain acceptable. Runtime cleanup errors fail closed.

Whole-matrix qualification runs before key metadata, gateway acquisition or budget admission. It inspects the exact already-local pinned image (never pulls), every selected adapter version and every distinct native package-lock dependency directory, and exercises fixture/reset, executor isolation and positive/negative acceptance controls. Every planned arm/build/task remains in the result even if an earlier probe fails. Legacy verifier lifecycles must be independently supported or explicitly block that cell; neither an image digest nor a caller's `verified:true` qualifies it. Receipts bind raw prepared manifest, frozen source/build/task hashes, runtime image identity, capabilities and check evidence. Production admission repeats current preflight instead of trusting caller receipts. Unsupported lifecycle integrations remain blocked rather than silently switching modes.

## Test order and evidence

Write failing controller/protocol/isolation/admission tests first, then implementation. Run injected-backend tests separately labeled from actual Docker qualification. Probe existing local Docker access/images; if dependencies or lifecycle are unavailable, record precise per-arm/build/image blockers. Preserve all existing attempts/ledgers. Full reports remain usable without runtime qualification and read frozen evidence rather than rerunning current planners.

## Implemented surfaces and remaining boundary

- `secure_evaluation.py` is the trusted host oracle; `submission-executor.cjs` is only a public, untrusted invocation adapter inside fresh Docker containers. The real `verify_against` API now requires `DockerExecutor` explicitly; the old trusted-fixture helper and Harbor shell never silently fall back to host execution.
- `evaluation_qualification.py` probes the complete selected matrix, retaining per-arm/build/lock/image/task/cell results and binding receipts to raw prepared manifest, frozen snapshot hashes, current controller source, actual image identity and test evidence. Current preflight is repeated; receipts are not authorizations.
- Schema-2 admission is guarded at the mode workflow, legacy workflow and direct serial/parallel execute entry points. These are admission-only changes; no timing/report analysis module was edited.
- `evaluation_workflow.report` now calls the parent's full original-evidence loader/renderer and writes `summary.json` / `report.md` with all 13 families, retaining the inventory only as a compatibility supplement. Reporting never calls today's planner or qualification.
- **Not implemented/qualified:** Harbor extraction of a completed agent's state into the host controller and trusted reward transport back into Harbor. Current task exports still use shared verifier environments; standalone controller qualification must not be presented as their lifecycle qualification. Installed Harbor supports separate environments, so this is an explicit integration gap, not an assertion that Harbor cannot do it. Legacy task verifier lifecycles also remain unqualified and block thorough/basic selections that include them. Existing image probes, not assumptions, determine dependency/version availability below.

## Independent security review correction design (unprivileged only)

The latest reviewer file `fb8bc697-45dc-42ae-a294-f50ee875cc3b.report.md` was absent; the parent's supplied three HIGH findings are authoritative task input. Earlier positive Docker observations DO NOT establish secure task acceptance: serializer/FS monkeypatching can forge in-memory side-effect observations. We retract that interpretation. No hostile JS will run on the host; no container, elevated command, signals or paused-job operations are authorized in this correction unit.

1. Every execution entry point must check controller authority regardless of caller schema. Schema-1 historical reports/dry construction remain readable, but no newly requested execution is grandfathered by `executionAuthorized:true`. Until a current trusted observation/lifecycle qualification exists, all new execution is refused before keys/gateway/runner. Exact frozen-scope comparison remains required and must not be selected by untrusted schema flags.
2. Protocol frames establish only syntactic observations. `unchanged`, store mutation counts/config and filesystem observations from the submitted-code process are NOT trusted measurements. Do not capture builtin references or use vm/workers as a claimed fix. Acceptance is explicitly unverified/reward zero until independent enforcement/observation exists; simulated correct-looking forged frames test that containment without executing malicious code.
3. Ingestion first performs descriptor-relative, no-follow bounded metadata enumeration of all entries (including directories), size/count/depth/deadline preflight before any content read. Then stream hashes/copies from verified ordinary-file descriptors under the SAME overall deadline; reject metadata/inode/size changes and clean incomplete destinations. Tests use sparse files, mocked read counters, symlink/FIFO/link races, count/deadline bounds and no large allocations.

## Initial environment observation

Requested specialist report `787d7153-6f47-4f40-96ce-3b017c53e4ba.report.md` is absent; containment findings were read in `148-activity-collection-results.md` and pinned review tests. Docker access requires command-scoped `sudo setpriv --reuid=1000 --regid=1000 --groups=1000,956`; no permanent permission changes. Existing image `sha256:65cff6f1e1ed586ff9322c3b31405ecc44386d6db5af1e5b55b2e577dea34248` reports Node v22.23.3 and `stripTypeScriptTypes` available under network-none/read-only capability-dropped execution. These observations alone do not qualify any arm.
