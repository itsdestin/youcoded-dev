---
status: shipped
---

# Website analytics code review and verification

Historical review; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization and verification limits.

Status: implementation candidate, collection OFF. No production activation or shipping authorized.

## Accepted and corrected

- Public POST CORS applies to success and fixed errors, exact website origin only.
- Duplicate starts and registrations reserve quota once, including concurrent retries.
- Page labels are HMAC-derived before persistence and returned capabilities; raw nonce never stored.
- Cumulative maxima and transactional aggregate deltas prevent repeated/reordered updates inflating visits.
- Daily domain admission is transactional and skips duplicate page keys; overflow maps to Other referring sites.
- Update quotas apply to the current UTC date while statistics remain on the original visit date.
- Report pagination uses validated internal tuples, not punctuation-sensitive label concatenation; retention anchored to today.
- Owner campaign requests are bounded and streamed; partial/invalid public campaign tags become untagged without retaining rejected labels.
- Reports include collection-start/retention-start and honest unknown/stale/failed maintenance health.
- Dashboard complete-report loading rejects partial/corrupt/looping reports, and registered link copying has a user-activation fallback.
- New localhost campaign writes require same-origin, CSRF token, bounded JSON; all dashboard routes reject unexpected Host values.

Fresh reviewers: 05e23c48-dc11-424a-a296-56df98c6024a (backend spec), 06bef848-6c0a-421d-813f-d23984c4b0b6 (backend quality), bae0ca00-ffbc-4e5b-9057-e65e919533ef (client/dashboard).

## Rejected finding with evidence

Client/dashboard reviewer claimed legacy workers.dev default breaks admin reports/registration because public ingestion requires api.youcoded.ai. This is false: guard() is invoked only in /site-analytics/start and /update; /admin/analytics/website and /website-campaigns have owner authentication but no host guard. Existing admin default remains supported; no endpoint change needed. Public website client already targets api.youcoded.ai.

## Verification

- Full Worker types and 372 tests passed before workspace integration fixture.
- Website client: `node --test youcoded/docs/tools/site-analytics.test.mjs` passed 12/12 after amendment; it guards that the website client/UI neither reads nor writes browser storage, `createAnalytics` has no preference dependency, and `stop` remains exposed.
- Actual website createAnalytics client → local Worker/D1 → owner report integration passed: one visit, instructions reached, two Windows clicks, one clicked visit, correct registered campaign and referrer hostname; `client.stop()` prevents further requests. Workspace runner: `node scripts/tests/site-analytics/run-integration.mjs`.
- Isolated `ui-probe` checks: website on 4793 reported footer `GitHub / Built by Destin / Privacy / Terms`, with no `#analytics-privacy-dialog` or `#analytics-privacy-open`; dashboard on 4792 reported title `YouCoded Analytics` and an available Website tab. No popup was present. The headless site’s intro scroll lock prevented a native full-footer viewport shot, so the footer-content assertion—not the hero screenshot—is the visual evidence.
- Website-specific source scan found no `opt-out`, `optout`, `createPreference`, `STORAGE_KEY`, `localStorage`, or storage-event support in `youcoded/docs/{site-analytics.mjs,site-analytics-ui.mjs,index.html}`. This is not an app-wide opt-out claim.
- Desktop renderer and Android app source are unchanged; no desktop/Android runtime verification claimed.

## Remaining acceptance/activation boundaries

Privacy amendment A-1 removed the new footer dialog and visitor opt-out; the original Privacy link remains and user-facing collection remains disabled in both client and Worker. The contract still needs the acceptance deck. Production account allowance, signing secret, edge abuse controls and provider backup behavior remain unchecked. Database quotas do not cap malicious rejected-request compute/read costs. No claim of guaranteed-free production operation.
