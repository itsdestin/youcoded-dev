---
status: shipped
---

# Website analytics — implementation plan

Historical plan; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization, delivery state and verification limits. Original gates below record the planning stage, not a new approval request.

Authority: [signed contract R1–R15](../design/2026-09-14-site-marketing-analytics/site-analytics.contract.json). Architecture and all counting/security rules: [technical design](../specs/2026-09-15-site-analytics-technical-design.md). This is a task breakdown, not completed implementation. No production traffic, activation, paid evaluation or deploy is part of this plan's current authorization.

## 0. Review the design and close gates before public activation

1. Parent session obtains fresh technical review, records accepted/rejected/already-handled findings under `docs/archive/reviews/2026-09-15-site-analytics-design-review-<n>.md`; stop on a round accepting nothing, maximum three. Resolve correctness/security blockers before backend coding. Each build task gets its own reviewer; do not let reviewers mutate the builder's worktree.
2. Preserve one document until close/reload while its original visit day remains in the approved 90-day window. Review the design's explicit R3 interpretation (no returning-visitor identity, not an inability to correlate the same open page across midnight), limits and retention wording. Resolve self-imposed technical constraints by honoring approved scope, not by asking for new scope; escalate only a genuine contradiction with an exact contract quote through the required one-step question deck.
3. Privacy amendment A-1 removes the proposed footer analytics-choice modal and visitor opt-out. Preserve the existing footer Privacy link and truthful policy disclosure; collection remains OFF pending the separate activation gates.
4. Keep `SITE_ANALYTICS_ENABLED="0"` committed. Record account allowance, D1 writes/reads/storage, edge-rule availability/cost, alert thresholds, cleanup health and provider backups/Time Travel retention before any separate activation decision. No secret values in reports. Verify deletion of all analytics records outside the same 90-day window and disclose provider backup expiry/operational delays; do not introduce a sub-day deletion gate.

## 1. Worker: durable model and exact arithmetic

**Files:** new `wecoded-marketplace/worker/src/site-analytics/` validation, attribution, snapshot, query and maintenance modules; next available migration under `worker/migrations/`; `src/types.ts`; tests under `worker/test/`. Choose the migration number from the actual tree at implementation time.

- Implement owner campaign registry, journey snapshots and daily cells in the same 90-day history, admitted-domain buckets, quotas and maintenance health. Total registry capacity is configurable (initially 1,000); document storage/cost review and authorized setting increase, test new registration above the former limit and preserve immutable old pairs plus the daily quota. Add parameter-bound SQL and database CHECK constraints/indexes.
- Derive an irreversible, domain-separated HMAC pageKey from the transient raw client nonce before any lookup, storage, logging or capability issue; pin a test that raw nonce text cannot appear in snapshot rows or responses. Add INSERT/UPDATE triggers so daily count deltas and snapshot maxima commit atomically. A missing update never creates a visit; maintenance deletes expired snapshots and aggregates without subtracting retained counts. No JS read/modify/write split, no raw event table, no app AE changes.
- Pin exact examples: one visit + three clicks gives visits=1, clickedVisits=1, clicks=3, rate=100%; two visits, one clicking three times gives rate=50%; two instruction opens give instructions=1. Multiple installer platforms still yield one clicked visit.
- Prove concurrent duplicate starts, duplicate/reordered updates, lost acknowledgments, trigger rollback and quota races with the actual D1 test runtime. Include failed-start retry admission, old-start replay after deletion, expired tokens, mutable attribution attempts and UTC-midnight behavior.

**Exit:** exact arithmetic invariants pass with real local D1 migrations; no sampling, negative counters, duplicate deltas, or persistent identity fields. Reviewer inspects SQL rather than only helper mocks.

## 2. Worker: public ingestion, owner endpoints and maintenance

**Files:** new site route module, `src/index.ts`, `src/types.ts`, `wrangler.toml`, website cleanup invoked by existing daily `maintenance.ts` alongside account cleanup. New authenticated routes may live under `src/admin/website.ts`.

- Wire exact public paths, OFF-first gate, dedicated CORS, HTTPS/custom-host and exact-origin enforcement, streaming 4 KiB cap, JSON/event-field allowlists, no query/body credential acceptance, signed capability validation and static error codes.
- Add signing secret by name to the deployment workflow only when approved; never add a placeholder secret in `[vars]`. Mirror new ordinary test variables in `[env.test.vars]`; preserve omitted wrapped AI/AE bindings. Tests must exercise OFF as well as explicitly enabled test configuration, not mutate `env` hoping to change `c.env`.
- Add owner-only registration and aggregate read endpoints, with 401 vs 403 behavior, pair validation, registry bounds and complete paginated daily responses. No raw page query/export.
- Add website cleanup to daily maintenance, deleting snapshots and aggregates plus day/domain/budget rows outside the same 90-day cutoff. Test query/update cutoff independently of successful cleanup, failed-sweep diagnostics/recovery, and no resurrection after expiry. No separate hourly job or sub-day deletion promise. Add daily budgets atomically with changed snapshots. Edge limits remain an account/activation prerequisite, not an assumption about the existing cache counter.
- Add a workload fixture that records D1 rows read/written and maximum cells/response size. Check repeated rejected traffic separately from accepted-row budgets; document residual Worker/read billing exposure.

**Exit:** app analytics guard tests unchanged and passing; public endpoint cannot write when OFF or via workers.dev; body/schema/auth/replay/retention tests pass; no raw data leaks through global error handling. No remote migration/deployment performed.

## 3. Website client and privacy disclosure

**Files:** `youcoded/docs/index.html`, new non-generated `youcoded/docs/site-analytics.mjs` (not `docs/site/`, which build:site deletes), `youcoded/PRIVACY.md`; new Node tests adjacent to the client or under `youcoded/docs/tools/`.

- Build a dependency-free page-memory state machine with injected clock/transport for tests. Strictly top-level canonical landing host only; no demo iframe, local preview or app telemetry. Start once, buffer cumulative changes, bounded coalescing/retries/keepalive; enforce an 8-second deadline per attempt, abort/release the slot on timeout, ignore late replies, retry the same snapshot at most twice and retain newer pending state. Test never-settling requests, lost start/update ACKs after commit, retry exhaustion and late completions. No persistent retry queue, visitor ID, cookies, fingerprint or periodic heartbeat.
- Instrument successful `openModal` once per visit. Instrument final resolved installer navigation once per actual activation before the existing initiated-button UI change; collapse package variants to four target platforms. Reopening then clicking again counts again. Release-list fallback and iOS information do not fabricate a download. Analytics failure never cancels navigation or prevents opening instructions.
- Do not change generated media/embed/theme switching, install asset resolution or existing GPU-based suggestion logic. Analytics reads only selected installer target, never hardware detection.
- Per privacy amendment A-1, do not add a visitor opt-out, analytics footer control/dialog, browser preference storage, or storage-event support. Preserve the existing Privacy link, keep collection OFF, and keep the website disclosure separate from the unchanged app opt-out.
- Site and policy copy describes only implemented/verified collection. Scope edits to website analytics; unrelated historic privacy wording is not a cleanup project.

**Exit:** unit tests show reload/new tab gets new nonce, BFCache preserves the same document visit, no client identifiers persisted, same-page updates across midnight and beyond 24 hours remain on the original retained visit day, and history expiry stops measurement without a new visit. Retry failure never blocks a download. Static/browser tests cover real hooks, target variants, no browser-storage reads/writes, and no requests from the embed. No footer analytics-control approval is required because amendment A-1 removes that surface.

## 4. Dashboard integration and protected proxy

**Files:** `youcoded-admin/skills/analytics/dashboard/{server.mjs,website.mjs,website-helpers.mjs,index.html,website.test.mjs,preview-server.mjs,preview-fixtures.mjs}`; CSS only for accepted states, not a layout redesign.

- Add only the two explicit proxy mappings/methods; bound JSON and params, validate loopback Host, same-origin writes and per-process CSRF token. Never return or log `gh` credentials. Refactor startup behind an import-safe function if necessary so tests inject fake credential/upstream readers; no test invokes real `gh auth token` or production fetch.
- Load all website response pages before presenting a complete result; verify schema/integer invariants and row uniqueness, retain sequence cancellation and honest loading/empty/error states. Keep date/source/campaign semantics and platform-only breakdown behavior byte-for-byte equivalent to approved helpers where possible.
- Capture the source/campaign pair and initiate promised `ClipboardItem` write during the gesture where supported, resolving text only after successful registration. Otherwise offer the registered frozen link through a second explicit Copy action and selectable manual-copy fallback. Preserve instant live preview and punctuation; validate all layers consistently. Test delayed registration/activation loss, unsupported ClipboardItem, failed registration, changed input, repeated Copy, auth refusal and clipboard failure without false success.
- Populate filters from retained measured rows, not every registered campaign. Preserve separate App section and existing query restrictions. Add status for disabled/gapped collection without pretending an empty report means no visitors; any visible addition goes through review.
- Fixture server remains entirely local and separate from production server. Update fake registration and pagination for review without activating ingestion.

**Exit:** dashboard/proxy Node tests pass; no fixtures in production response; unregistered public labels are not stored; one-pair registration needs no deployment; complete filter arithmetic and Copy states verified.

## 5. Verification commands and evidence

Run from `/home/destin/youcoded-dev/worktrees/sessions/site-marketing-analytics`. Commands below use inspected existing tooling; newly named tests are deliverables of the tasks above, not files claimed to exist already.

**Worker** — package scripts are `typecheck: tsc --noEmit`, `test: vitest run`; Workers Vitest plugin loads migrations from `worker/migrations` in `vitest.config.ts`:

```sh
cd wecoded-marketplace/worker
npm run typecheck
npm test
```

Run in that component working directory, record each exit code independently. Current read-only package inspection found **no installed Worker vitest/typescript/wrangler packages** in this worktree. Provision isolated dependencies through the approved workspace workflow before executing these tests; do not run an installer against shared/hardlinked dependencies and do not use npx's implicit network install. No Worker test result is claimed by this documentation task.

**Existing dashboard Node test:**

```sh
node --test youcoded-admin/skills/analytics/dashboard/website.test.mjs
```

Add proxy/client tests to this tooling rather than introducing a new browser framework. Proposed client and proxy commands, valid only after those files are created:

```sh
node --test youcoded/docs/tools/site-analytics.test.mjs
node --test youcoded-admin/skills/analytics/dashboard/server.test.mjs
```

Run static syntax checks for the new client and updated dashboard with `node --check <file>`. Website-only source changes do not require a desktop app launch/build. If implementation unexpectedly touches desktop sources, run `bash scripts/verify.sh youcoded` from the workspace and review platform consequences. No IPC or Android implementation changes are planned; do not imply Android runtime verification from website tests.

**Contract provenance and docs:**

```sh
python3 scripts/ui-review/review-cards.py contract-check docs/archive/design/2026-09-14-site-marketing-analytics/site-analytics.contract.json
node scripts/audit-anchors.mjs
git diff --check
```

The provenance checker is not acceptance; incomplete acceptance at this stage is expected. Audit failures must distinguish missing component checkouts/existing drift from these two new documents. Record actual commands/output, never a planned test as passed.

**Local browser acceptance:** use existing review/probe tooling and isolated fixture servers with synthetic data and intercepted network; do not open the live credential-holding production dashboard merely to take screenshots. Inspect desktop/narrow footer choice and the existing Website/App panels in the approved themes, inspect coverage, then preview/read the new deck contact sheet before serving it. No production calls, live-app attachment, account changes or paid evals.

## 6. Acceptance and handoff

| Contract | Evidence required |
|---|---|
| R1–R3 | Page lifecycle/state storage inspection; exact D1 journey tests; separate tables and untouched device/app telemetry guards. |
| R4 | Privacy disclosure, preserved footer Privacy link, collection-OFF guard, and no-browser-storage/client-preference tests. |
| R5–R7, R15 | Owner registration/proxy tests; live preview/Copy/error operation; unknown-tag rejection; domain-only body and carried-label tests. |
| R8–R9 | 90-day query/update/deletion boundaries for snapshots and aggregates, cleanup/recovery and provider backup disclosure, cost/account check and OFF-by-default tests. |
| R10–R12 | Approved Website/App visuals, all date/source/campaign controls; app guard suite and no fixture data in production. |
| R13–R14 | Repeats vs once-per-visit outcomes, sum-based rate, zero denominator, platform-only filter and share-denominator tests. |

After implementation, obtain fresh code reviewer and context-free UX tester 2 under the feature-flow briefs, triage every finding, then a fresh grader and acceptance deck. Grader must inspect tests' actual assertions, not merely file existence. Include the new privacy surface and accepted review findings; contract amendments must have proper review sources. Do not silently mark all rows mechanical or rewrite signed answers.

Stop before public activation until cost/retention/abuse and privacy-review gates are satisfied. Shipping/merging and deployment remain separate owner decisions; no `wrangler deploy`, remote migration, secret read/write or feature-flag flip is part of this implementation authorization. Preserve the session's existing decks and incoming branch separation.
