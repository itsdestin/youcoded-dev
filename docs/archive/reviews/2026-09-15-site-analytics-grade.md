---
status: shipped
---

# Website analytics — fresh grader report

Historical review; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization and verification limits.

**Scope:** signed `site-analytics.contract.json` (15 rows), amendment answer A-1, and the isolated dashboard only. This is a grading pass, not a new code review. Collection remains OFF; no live app, production endpoint, or production token was accessed.

## Contract verdict

Only deck row **R12** receives a mechanical grader verdict. It **passes**.

Fresh 1440 × 900 captures of `http://127.0.0.1:4792/?theme=meadow-mist` and `?theme=light` exactly match the approved S-1 after images byte-for-byte:

| Theme | Approved S-1 after image | Fresh isolated capture | SHA-256 |
| --- | --- | --- | --- |
| Meadow Mist | `docs/archive/design/2026-09-14-site-marketing-analytics/runs/after/shots-analytics/meadow-mist/overview.png` | `scratch/site-analytics-grade/overview-meadow-mist.png` | `a49a018a55beab12c0f1c62325c4c2f6f9d6ff5724521bb5e926875658b21d1f` |
| Light | `docs/archive/design/2026-09-14-site-marketing-analytics/runs/after/shots-analytics/light/overview.png` | `scratch/site-analytics-grade/overview-light.png` | `4370fa45f6de4c670dd7e321833669de43a6568f0a6d0aa7a9d651e462ca7fd0` |

The actual preview identifies itself as sample data with no tracking or upstream connection and visibly shows Website and App tabs, Website totals, and Website filters. This supports R12 only; it does not replace the human confirmations for the other rows.

## Amendment and no-opt-out regression inspection

- **R4 source changed only:** its source is now `site-analytics-privacy-amendment#A-1`, rather than the original questions deck. The submitted answer selected `remove`. No other contract-row source was changed.
- The approved A-1 proposal removes the visitor analytics toggle, dialog, and browser preference storage while retaining a Privacy link and a plain disclosure requirement. The analytics-specific sources `youcoded/docs/site-analytics.mjs` and `youcoded/docs/site-analytics-ui.mjs` have no opt-out/preference or browser-storage implementation; `site-analytics-ui.mjs` has `COLLECTION_ENABLED = false`.
- `node --test youcoded/docs/tools/site-analytics.test.mjs` includes and passed the static regression “website analytics never reads or writes browser storage,” covering the analytics client and UI modules. `index.html` has unrelated existing theme/release-cache `localStorage`; that is not an analytics opt-out implementation.
- Worker inspection: `wecoded-marketplace/worker/wrangler.toml` commits `SITE_ANALYTICS_ENABLED = "0"`; route logic enables collection only for the exact value `"1"`. The Worker test configuration has its own enabled fixture flag and is not a production activation claim.

## Tests run

```text
node --test youcoded/docs/tools/site-analytics.test.mjs youcoded-admin/skills/analytics/dashboard/website.test.mjs youcoded-admin/skills/analytics/dashboard/website-data.test.mjs youcoded-admin/skills/analytics/dashboard/server.test.mjs
ℹ tests 20
ℹ pass 20
ℹ fail 0
ℹ duration_ms 1102.985387
```

The dashboard endpoint is an isolated fake-data preview, as expected. The previously reported Worker typecheck/full-suite result (372 tests) was **not rerun** in this grading pass, so no new Worker typecheck/full-suite result is claimed. Workspace client-to-local-Worker integration was also not rerun because it is supplemental to the sole deck verdict and the required client/dashboard tests passed.

## Acceptance boundaries / blockers

There is no scoped grader blocker: R12 matches the signed review source exactly. R1–R11 and R13–R15 remain deliberately ungraded human rows and must remain honest confirmations on the generated acceptance deck. In particular, account allowance, storage cost, and activation checks have **not** been checked or claimed; collection stays OFF in both the site client and Worker configuration.
