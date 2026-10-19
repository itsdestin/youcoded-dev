---
status: shipped
work_item: 87
---
# Browser tool clarity and robustness

Approved direction: Destin, 2026-10-18; independent proposal review incorporated. Destin subsequently authorized wrap-up, merge/push and close-out. No app release or paid evaluation was authorized.

## Contract

Keep BrowserNavigate for URL opening (`url`, optional `newTab`); add BrowserHistory (`direction: back|forward`) and BrowserZoom (`zoom: 25..100|auto`). Rewrite every Browser description and parameter description for purpose, prerequisites, minimum valid call, result and recovery. Explicitly describe refs as temporary, current-tab requirements, type replacing text, seconds:0, wait matching semantics, tab indices changing after closure, saved sign-ins, and BrowserZoom's hidden-browser limitation. Preserve safety and untrusted-page warnings.

Validate complete requests before queue admission, state mutations, startup or asks. Reject incompatible known fields as well as unknown fields with actionable guidance. Preserve empty typed text for clearing, zero-second waits and the existing empty wait's two-second default. Null remains invalid rather than globally stripping it. Browser-local code is shared by native and MCP; adapters remain transport only.

For callers with an older tool list, the shared runner may accept unambiguous legacy BrowserNavigate history-only, zoom-only and URL+zoom requests. Validate all fields first; never silently prioritize URL versus history. Current advertised schemas omit legacy fields. Compatibility does not guarantee SDK acceptance of obsolete fields against a refreshed schema; rejection must point to the current operations.

## Results and lifecycle

Report current tab/address when navigation fails where obtainable. Distinguish loading, blocked, HTTP failure and successfully opened. Action receipts distinguish unattempted, filled-but-not-submitted and attempted/uncertain operations. Never automatically replay or advise blind retries of potentially final actions. Cancellation is checked before dispatch and every mutation stage, particularly between fill and Enter.

Queued calls return promptly on cancellation/deadline without executing later. In-flight work retains its serialization barrier until its underlying operations settle even if a timeout/cancellation result has already returned. Other sessions remain independent. Bound observations where possible; do not claim cancellation reverses already-dispatched browser events.

Keep one consumable completed handoff outcome in session memory, correlated by message, so timeout -> user answer -> repeat call does not recreate the card. Changed pending messages receive explicit guidance. No disk persistence. Human answers and Stop remain outside the assistant queue; observation and close escape paths remain available.

Appearance waits mean any visible matching text; disappearance means no visible matching text. Return distinct condition-met and timeout wording. Continue the same bounded cached outline rather than slicing a regenerated outline at an old offset. Invalidate cached continuation when the active page/document or browser-changing operation changes; reject missing/out-of-range continuation explicitly. Fresh snapshots still regenerate refs.

## Verification

Test-first regression cases for conflicting inputs/no side effects, all operations and nulls, description/schema native-MCP parity, queue deadlines/cancellation/serialization, partial mutation receipts, late handoff done/cant, duplicate text waits, changing-outline continuation and legacy runner calls. Capture provider request bodies without paid calls where feasible; do not infer the incident provider or alter global strictness without evidence. Run focused unit and isolated fixture-browser tests, fresh code review and workspace desktop verification.

## Exclusions and review decisions

No uploads, phone support, browser panel redesign, cross-restart handoff journal, general tool-schema projection or global provider strictness change. Keep BrowserAct grouped rather than multiplying every action into another tool. The select-label concern from initial inspection is not a confirmed defect: installed Playwright types document string matching of values and labels; pin behavior in a fixture instead of adding speculative resolution logic. Real-model evaluation is offered separately and requires a user-selected spending cap before any paid run.
