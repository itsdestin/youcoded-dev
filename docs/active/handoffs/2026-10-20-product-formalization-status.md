---
status: active
date: 2026-10-20
research_date: 2026-09-03
---

# Product formalization — current status and remaining work

## Signing is complete; release is deferred

- **Apple membership is active.** Developer ID signing and notarization are merged and verified for Intel and Apple Silicon (app PR #655; card #28 is closed). Do not restart enrollment or treat Apple signing as blocked.
- Windows release/master-beta signing is established. Credential-free development builds are intentionally different; see `docs/build-and-release.md` for the exact signing boundaries.
- Public **1.3.1** installers remain unchanged until a separately approved release. The signed **1.3.2-beta.3** files are preserved test installers, not a public release.
- Current technical authority: `docs/build-and-release.md`. Verification record: `docs/archive/plans/2026-10-19-apple-signing.md`.
<!-- verify: {"path": "youcoded/desktop/electron-builder.mac-sign.yml", "contains": "notarize: true"} -->

## Work still recorded elsewhere

- **Card #31:** company/store paperwork, trademark and Google Play listing, plus the recorded payment-service/token follow-ups.
- **Card #45:** shared downloads and Gemma licence notice/terms.

This signing/documentation cleanup does not close those cards, choose their next actions or revalidate legal advice, prices or store rules. Read their current progress before acting.

## Historical research

The full September research and dated status blocks are preserved in `docs/archive/investigations/2026-09-03-formalization-costs-and-risks.md`. Its Apple account failures, unsigned-installer tables and older recommendations are historical, not current setup instructions.

The resolved Mac incident is `docs/archive/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md`. Its old updater-integrity claim is superseded by signed-manifest/hash verification. The separate announcement finding remains in card #86(c); neither this cleanup nor signing claims to fix it.
