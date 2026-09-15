---
status: shipped
---

# Website analytics — rollout closure record

Archived 2026-09-15 at the owner's explicit direction to merge, activate and finalize; all acceptance answers are affirmative. No further approval round is required. This archive closes design and review work, not an assertion that every operational check passed.

## Delivery

- Backend: [wecoded-marketplace#94](https://github.com/itsdestin/wecoded-marketplace/pull/94), merge `4dfabb29ef2d592724b80a4659aa85f46bace006` (feature `55ef99e`).
- Owner dashboard: [youcoded-admin#8](https://github.com/itsdestin/youcoded-admin/pull/8), merge `abc0311` (feature `1f3982a`).
- Website: [youcoded#473](https://github.com/itsdestin/youcoded/pull/473), merge `8336f54498d6b36d4faf9f44379536ed231c9f1c`; Pages run **34955950306** succeeded. No desktop changes.

Page-only visits, instruction opens and installer-link clicks are separate from app analytics. The owner dashboard provides Website reports and registered campaign links. Privacy amendment A-1 removes the proposed visitor opt-out/dialog and retains the existing Privacy link.

## Deployment correction — rollout update

The rollout session reports that first Worker deployment **34954994734** failed **before deploy**, applying migration 0008: remote D1 `/query` returned `incomplete input`, despite passing local migrations. The bare `CASE … END` parser issue (workers-sdk#4727) was corrected with parenthesized expressions; the new schema guard failed before the fix and passed afterward. Correction [wecoded-marketplace#95](https://github.com/itsdestin/wecoded-marketplace/pull/95) merged and deployed successfully in run **34955728923**, including migration, Worker and all secrets. The final rollout handoff supersedes the earlier pending-deployment status; the original failed run remains part of the evidence.

The rollout session also verified website #473 contains only five docs/client files, using GitHub's file list and the three-dot diff. Its unrelated desktop Ubuntu CI failure was `remote-download.test.ts:314`, “file replaced between mint and GET (different inode)”: returned 200 rather than 404; 11,418 tests passed. No desktop changes are part of this PR. The regression is outside this closure's implementation scope; this note records the handoff rather than claiming it was fixed or filed.

## Live verification — final rollout handoff

The main rollout session confirmed private report **200**, `enabled: true`, and preflight **204** with the correct origin. Two isolated browser visits labeled `internal-verification` / `rollout-2026-09-15` persisted exact results: **visits 2, instructions 2, clicked visits 1, Windows clicks 1**. Report assertions checked those values. These are labeled verification traffic, not organic visitor results.

The first browser's unauthenticated GitHub release fetch hit the machine IP's API **403** limit; its releases-list fallback correctly counted no installer click. The second used authenticated-GitHub-fetched **public released installer metadata** in an isolated browser, with no authentication injected into that browser. It exercised the actual modal click; navigation was prevented after the analytics handler, so no installer was downloaded. This verifies accepted click measurement, not completed downloads or installs.

The live dashboard screenshot `/tmp/site-rollout-live-dashboard.png` and companion `/tmp/site-rollout-live-dashboard.json` showed real **2 / 2 / 1 / 50%** results with no console errors, per the rollout handoff. They are local temporary evidence, not archived assets. Delivery at `http://127.0.0.1:4751` runs from immutable `/tmp/youcoded-analytics-live.QIwVcH`, not the app or worktree; this is a delivery-time location, not a permanent endpoint.

Maintenance health remains transparently **unknown**, `lastSweepAt: null`, until the first daily prune. Successful ingestion is not proof of a successful scheduled cleanup. Follow-up billing, alerts and operational-retention monitoring are filed in `docs/roadmap/marketplace.md`; they are not new rollout approval gates.

## Evidence and limits

The initial rollout handoff reported Worker typecheck and 372 passing tests, 20 client/dashboard tests and one actual-client → local Worker/D1 integration test. A subsequent rollout update reports **373 passing Worker tests**, a clean local migration and actual-client integration passing after the migration-parser correction described above. These are rollout-session results, not reruns by this documentation closure. The durable integration runner and fixture remain at `scripts/tests/site-analytics/` in the workspace; they were not archived or changed.

The handoff records the signing secret stored in GitHub without exposing its value and the corrected CI deployment step with YAML verification. It does **not** establish full billing or operational-retention verification:

- The zone's **Free Website** plan was verified. The Workers subscription API returned **403**, so the Workers account subscription/allowance is not established by that zone result.
- An active **rate-limit** rule was shown in a screenshot; it is not a blanket block or proof of a monetary ceiling, nor a measured abuse-effectiveness result.
- Provider backup documentation says **Free: 7 days; Paid: 30 days**. This is provider documentation, not account-specific proof of the applicable backup window or completed operational deletion/recovery verification. Scheduled deletion can be delayed; active-database history and provider backups are distinct.
- No plan upgrade was made. Full billing/allowance, alerting and operational-retention verification remain unproven; no guaranteed-free claim is made.

## Historical records

- [Technical design](../../specs/2026-09-15-site-analytics-technical-design.md)
- [Implementation plan](../../plans/2026-09-15-site-analytics-implementation.md)
- [Code review](../../reviews/2026-09-15-site-analytics-code-review.md) and [grader report](../../reviews/2026-09-15-site-analytics-grade.md)
- [Signed contract](site-analytics.contract.json), [acceptance answers](site-analytics.contract.acceptance.answers.json), and neighboring questions/reviews/amendment records.

Review bodies, answers, verdicts, screenshots and generated decks preserve their original evidence and time-specific statements (including collection-OFF and pending-approval statements). This closure record supersedes those historical authorization/status statements only; it does not rewrite their results. Original absolute paths or embedded `docs/active/` references inside immutable deck/evidence files identify their capture-time locations; the corresponding files now live under the same suffix in `docs/archive/`. Relative sibling image/deck links retain their layout. Scratch evidence remains local-only, as the reviews originally disclosed.

The workspace roadmap was searched for website/site analytics, campaign, traffic and marketing scope. No matching open implementation item was found; unrelated app analytics issues and general ideas remain untouched.
