---
status: shipped
---

# Website analytics technical-design review 2

Historical review; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization and verification limits.

- D2 — resolved before Worker implementation: a raw client nonce is never persisted, logged, or echoed in a capability. The Worker derives `pageKey = HMAC(server secret, domain-separated raw nonce)` before snapshot lookup/insert and capability signing; only the raw random label remains in client memory and transient request processing. This permits retry lookup for one page without a cross-page identity. The technical design now explicitly avoids claiming that hashing removes all correlation, and the Worker suite pins absence of the raw nonce in snapshot storage and response capability.
