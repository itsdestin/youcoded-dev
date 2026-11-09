---
status: active
work_item: 148
---
# Bounded content-free activity collection

Implement future collection, not retrofit historical evidence. The requested plan path was absent at initial read; this records the authorized implementation boundary before source edits.

- Native lab captures an explicit run observation window, process monotonic clock identity, SDK request lifecycle, first chunk and actual reasoning/text/tool-argument stream receipts. Stream envelopes mean observed delivery, never cognitive duration.
- Add an optional, exception-isolated diagnostic callback at native tool execution and approval boundaries. It carries identifiers/status only. Absent callbacks must not change production execution/permission behavior or transcript types.
- Shared gateway captures protocol-parsed phase receipts keyed by durable ledger reservation ID for every adapter, with first-byte, request close/error/cancellation and incomplete coverage. Preserve backpressure, usage accounting and per-line SSE bounds; no content retention or whole-transport-chunk limit.
- Normalize these records into scoped intervals on declared monotonic clocks; do not align separate process clocks without an explicit mapping. Compute endpoint-split unions/overlap, request phase unknowns, inter-call gaps and censored unknown outside time. Historical artifacts retain their partial status.
- Targeted Markdown consumes execution and observed-stream metrics, with exact coverage/reasons. Other modes/tasks and semantic claims/human calibration remain outside this unit.

Acceptance: failing-first collector tests, scripted native runtime executing actual tools/approval flows with external fetch disabled, local gateway stubs for both protocols, raw collector → shared analysis → printed cells, final offline sample in a fresh scratch directory, relevant Node/Python tests and desktop verify. No paid calls, production app experiments, installs, commits or merges.

## Bounded-unit result

Future native/gateway receipt collection, optional execution diagnostics, authoritative broker waits, explicit worker/launcher windows and shared printed consumption are implemented. Final verification: 284 Node tests; 148 Python tests; desktop verify green (3882 related tests passed, 36 skipped). Actual collected sample: `scratch/harness-lab/activity-collection-offline-v3/`. Historical A/A remains partial in `targeted-live-aa-v2-enriched-evidence-v5/`. Detailed evidence, exact commands, review containment and remaining boundaries: `docs/active/investigations/148-activity-collection-results.md`.

The subsequent verifier review was contained by blocking untrusted submission verification and retaining only explicitly trusted fixture qualification. Whole-matrix paid admission remains blocked by the parent. Secure untrusted acceptance, full modes/report integration, continuous scheduler/dependency/background-lifetime collection and semantic/human calibration remain incomplete; this result is not acceptance of the whole evaluation product.
