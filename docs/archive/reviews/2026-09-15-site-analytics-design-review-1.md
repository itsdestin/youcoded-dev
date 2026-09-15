---
status: shipped
---

# Website analytics technical-design review 1

Historical review; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization and verification limits.

Reviewer: fresh read-only specialist 95824d79-af13-432d-a0d0-6b7155c2d42f. No implementation started in this review round.

- D1 — accepted, resolved in design/plan without a scope amendment: remove the self-imposed 22-hour cutoff and <=24-hour server-deletion promise. Keep one document until close/reload; accept updates while its original visit day remains in the approved 90-day history, then stop without creating another visit. Maintenance deletes snapshots and aggregates outside that window. Server page nonces support once-per-page counts; client nonces remain memory-only. Reviewer wording check: R3 says “without identifying unique people or tracking them across days.” This is interpreted as no persistent returning-visitor identity across days/documents, not a promise that the server cannot correlate the same still-open page across midnight. Keep this distinction explicit in policy; no demonstrated contract conflict requires a new user question.
- D2 — accepted, incorporated in design/plan: finite 8-second attempt timeout releases the single-flight slot even for never-settling transport; abort, ignore late replies, retry the same snapshot at most twice and retain newer pending state. Tests cover lost start/update ACKs after commit, timeout, late completion and retry exhaustion.
- D3 — accepted, incorporated in design/plan: configurable total campaign capacity (initially 1,000) with a documented cost/storage review and authorized setting-increase path, not permanent exhaustion. Retain daily registration quota, idempotent existing-pair registration and immutable old links; test increasing capacity.
- D4 — accepted, incorporated in design/plan: initiate promised ClipboardItem write during the gesture where supported, resolving only after registration. Otherwise expose a second explicit Copy action and selectable manual-copy fallback after successful registration. Test delayed registration, unsupported API, activation loss and failure states.

No additional demonstrated defects in transactional maxima/deltas or the explicit activation gates. Public activation remains blocked on cost/allowance, edge abuse controls, provider retention behavior and final verification.
