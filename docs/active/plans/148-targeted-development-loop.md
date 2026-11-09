# Targeted development loop — offline planning and attribution

Status: active

## Scope and approved direction

The user approved proceeding with the small before/after workflow and offline tool-schema analysis, without another broad paid batch. This increment provides a safe offline planning entry point and content-free attribution, not an automatic paid execution service or a production tool/prompt optimization. Existing benchmark results/frozen cohorts remain untouched. No commits, merge or push.

## Design

Reuse the current task exporter, model panel and experiment planner. A targeted planner accepts exactly two explicit YouCoded desktop build directories (baseline and candidate), one model/provider, one to three named DEVELOPMENT tasks, a smoke or confirmation profile, explicit token assumptions and a spending ceiling. Smoke has one repetition (2–6trials); confirmation has three (6–18trials). Rotate baseline/candidate order by task/repetition. Refuse held-out or unknown tasks, duplicate selections, malformed assumptions and implicit selection of the full suite. Warn that one smoke repetition is a plumbing/regression check, not proof of an improvement.

Fingerprint actual build/runtime inputs and task definitions. Refuse symlinks and missing built runtime inputs. A same-build plan is explicitly an A/A calibration, never a demonstrated candidate change. Output contains exact cells, build paths/hashes, matching conditions, illustrative cost and coverage limits. It always says canRun:false and executionAuthorized:false. It cannot read a credential, start a gateway, create gateway tokens, reset accounting or invoke a provider. Fresh output directories only; preserve prior evidence.

Offline tool-schema attribution uses the existing SDK-boundary measurement definition: JSON UTF-8 bytes, not provider token counts. Determine whether frozen runtime tool definitions can be enumerated without network, live profiles or synthetic execution of real tools. If they can, reconcile the total against the existing30377-byte tool field before presenting per-tool shares. If not, report the observed aggregate and the precise attribution limitation rather than guessing. Do not remove capabilities or safety instructions based solely on byte share.

## Tasks

- [x] Add targeted planner and tests under scripts/harness-lab, reusing experiment-plan.mjs/suite.mjs. Cover two-arm ordering, bounded cell counts, rejected held-out tasks, explicit budget/assumptions, changed build hashes, same-build warning, overwrite/symlink refusal and no paid execution path.
- [x] Generate an actual offline A/A example from the available frozen build, labeled calibration, not improvement. Verify exported fixture integrity and reported counts/cost arithmetic.
- [x] Produce per-tool schema attribution if exact frozen SDK representation can be reconstructed offline; otherwise preserve the gap explicitly.
- [x] Fresh review of planner safety and measurement claims, run relevant/full workspace tests, document invocation and fit within the free-check → smoke → confirmation → occasional-benchmark workflow.

## Follow-on status

This planning/attribution increment is complete. The separate `148-targeted-execution-integration.md` work now provides prepare/check/run/report and has passed a tiny separately authorized live serial A/A calibration. The planner itself remains offline and unauthorized. Exact historical per-tool reconstruction remains a disclosed gap (30202reconstructed bytes versus30377historical;0hash matches). Current priorities are in `148-current-state.md`.

## Acceptance and remaining execution boundary

The assistant can preview a tightly scoped before/after experiment without exposing held-out answers or spending. A future paid run still requires verified immutable execution manifests, the existing shared budget gateway, matching settings and explicit authorization. This increment must not claim that the preview itself executes the A/B experiment or that tool bytes equal removable cost.
