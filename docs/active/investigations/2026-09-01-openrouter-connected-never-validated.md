---
date: 2026-09-01
status: active
type: investigation
topic: Settings says OpenRouter is "Connected" without ever validating the key, and its Test button cannot fail
---

# OpenRouter "Connected" is a string on disk, not a checked key

**Symptom.** Destin, 2026-08-31, live: every turn failed with a 401 from OpenRouter while Settings → Providers read "Connected" and the Test button came back green.

**Design already approved and behaviour-complete:** `docs/active/specs/2026-08-31-openrouter-connection-trust-design.md`. Not yet planned or implemented — Destin's call to hold. Desktop only (`provider:*` already refuses honestly on Android, `SessionService.kt`).

## Mechanism (re-checked against master 2026-09-01)

Four defects, each verified against `master` and the live API on 2026-08-31; all still present 2026-09-01.

1. **"Connected" = `enabled && hasKey`.** `youcoded/desktop/src/main/providers/provider-registry.ts:69-79` derives `ready` from whether a secret exists for the provider's `secretRef` — never from any response from OpenRouter.
2. **The Test button probes a public endpoint.** `testConnection`'s openrouter branch fetches `GET /api/v1/models`, which returns `200` for a fabricated key *and for no key at all*, so Test always says "Connected". The code's own comment says not to present this as key validation; the UI does exactly that.
<!-- claim: {"path": "youcoded/desktop/src/main/providers/provider-registry.ts", "contains": "CAVEAT: OpenRouter's /models endpoint is PUBLIC"} -->
3. **The Connect modal runs the same hollow test** and flashes green on entry (`ModelProvidersPopup.tsx`).
4. **A real rejection carries no action.** `AttentionBanner` gates its Open Settings button on the phrase `Settings → Providers`, which only *pre-flight* errors emit, so a 401 from OpenRouter renders as raw jargon in a red pill. The model picker stays full throughout because `model-catalog.ts` reads the same public endpoint unauthenticated.

OpenRouter is the only provider with a hollow test — Anthropic, OpenAI and Google all probe endpoints that require the credential.

**Two OpenRouter facts verified live 2026-08-31:** `GET /api/v1/credits` works with a plain inference key (so the balance is free — no second key), and keys carry an `expires_at` whose lapse returns the identical `User not found.` 401 as a deleted key. Expiry is the leading suspect for the reported key (created 2026-07-15, dead 2026-08-31) but unprovable after the fact. There is no purchase API — adding credit is a link.

## Fix shape

Per the spec: a persisted verdict (`verified` / `rejected` / `unchecked`) keyed by `secretRef`, written on entry, on Test, on a 30-min refresh and on a live turn failure; real validation via `/api/v1/key` + `/credits`; typed rejection reasons replacing the phrase match so every failure ends in an action; gear-badge warnings; balance widget; PKCE OAuth connect alongside manual key entry; `setKey` minting a new `secretRef`. Two review corrections already folded in (the gear's blue badge is the "Set Up Remote Access" nudge, not a warning channel; `widgetApplies` cannot yet express "OpenRouter sessions only"). Every visual decision is reserved for a workbench build + review deck (spec §5).

## History

Added 2026-08-31 (hit live by Destin). Re-verified against master 2026-09-01: no commits to `provider-registry.ts` or `ModelProvidersPopup.tsx` since.
