---
status: merged
---
# Passwordless admin approvals — implementation plan

**Goal:** Connect approved review `passwordless-admin-review-2` steps 2 and 3 without changing other permission flows.

**Architecture:** Keep the existing confirmation. Validate its scope selector against a pending admin ask in the broker. Reuse existing literal exact-command Bash approvals. Use a distinct remembered rule subject for broad Full Auto admin consent so a mode baseline or wildcard Bash grant cannot accidentally disable the admin floor. Store Full Auto admin consent in the existing all-projects permission bucket, exact-command consent in its project, and session consent only on the running HarnessSession. Keep password handling on the existing verified askpass route: an admin allowance skips the speculative up-front password question, not a real sudo password request.

## Implementation
- [x] Add failing broker tests: accept the three selectors on admin allow only; refuse them on deny, other tools, other floors and invalid selectors.
- [x] Add failing rule tests: saved Full Auto consent works only in Full Auto and across projects; exact consent is literal and project-scoped; neither bypasses a deny, unrelated risky command or protected-path floor.
- [x] Add failing session tests: a session allowance covers subsequent sudo calls in any mode, is not persisted, resets with a new session, and skips only the up-front password question. The actual askpass password flow stays intact.
- [x] Implement shared admin scope/rule helpers in `desktop/src/shared/admin-approval.ts`, thread the selector through `permission-broker.ts`, and evaluate remembered admin consent in `native-session-host.ts`.
- [x] Apply admin consent in `harness-session.ts`, retaining refusal, secret-path and removal checks. Persist specialist grants through the existing specialist-scoped router; do not loosen specialist charters.
- [x] Describe saved admin entries in the existing Settings → Permissions list so they remain recognizable and revocable; add store/host revocation tests.
- [x] Run focused tests, then `bash scripts/verify.sh <app-worktree>`; inspect the final diff.

**Verification scope:** shared desktop/Android backend and renderer unit/transport checks; no live app access or real elevated commands. Android packaging is not claimed verified by desktop checks.

## Independent review follow-up
- Fixed broad-consent leakage across shell operators and executable wrappers. The host-only guard now reads shell syntax, preserves other dangerous-action asks, and asks conservatively for known interpreter/shell families regardless of attached flags, stdin or script-file invocation. Literal exact-command approvals remain separate; protected-path floors and denies still win.
- Fixed discarded scope selections on later no-floor destructive asks in both root sessions and routed specialist asks. Connected broker/session tests cover persistence and session memory, not just the renderer payload.
- Regression runs observed the reported failures before the fixes. Final focused suites: 356 tests passed; full desktop verification passed (`scratch/verify-20261019-100344-2102362`). Independent final recheck: P1 and P2 addressed; no concrete remaining findings within these fixes (read-only source/test review).

## Shipped
App PR [#650](https://github.com/itsdestin/youcoded/pull/650) merged to remote master as `5fa56a2ee6b94b6980cbb478dc7f65ee60e526fc`. Integrated local verification passed 5,923 tests (36 skipped), types, dead-code checks, both lints, invariants, all screen/Escape checks and click journeys. Linux desktop and Android PR CI passed; Windows/macOS were skipped by PR policy. The final merged tree differs from the CI-tested source only by the already-published changelog. Review records are archived beside `docs/archive/design/2026-10-19-passwordless-admin/`. Workspace card #66 remains open for its unrelated requests. No app release, installed-app replacement, live restart or paid evaluation was performed.
