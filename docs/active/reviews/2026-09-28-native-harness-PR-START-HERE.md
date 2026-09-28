---
status: active
---

# Native harness audit fixes — PR review entry point

This work is being committed and proposed for review at Destin's request. **Do not merge yet.** User acceptance covers the implemented scope, not a release or an assertion that all audit findings were fixed.

## Review order

1. Decisions: `../design/2026-09-26-native-harness/native-harness.decisions.md` — original approvals, native-only question transport choice, denied credential cleanup and deferred process-group stopping.
2. Accepted results: `../design/2026-09-26-native-harness/native-harness.contract.verdicts.json` and `native-harness.contract.acceptance.answers.json` beside it. **17 pass; R17/C2 is deferred and explicitly not passed.**
3. Original audit: `../investigations/2026-09-26-native-harness-audit.md` — findings are historical observations, not claims that every item is repaired.
4. Implementation plans: `../plans/2026-09-26-native-harness-approved-fixes.md` and its three linked batch plans.
5. Per-task implementation reports in this folder; final corrections in `2026-09-28-native-harness-final-review-fixes.md`; independent grading in `2026-09-28-native-harness-acceptance-grading.md`.

The app and workspace repositories have companion branches named `session/native-harness-audit-20260926`. The app PR contains runtime/renderer changes, desired-behavior regression tests, dev-only fixtures and native-runtime documentation. The workspace PR contains this review record, decisions/decks, evidence, the rule reference update and the narrowly scoped shoot-driver/test repair.

## Implemented scope

- Permission failure result pairing and continued usable history.
- Reliable host FIFO draining and ordinary busy input delivered at safe in-turn boundaries. **One send flow, existing queued Edit/Cancel, no new urgent-send or follow-up-mode controls.**
- Automatic retry attempt retraction across visible output, effective replay and accepted history.
- Full ancestor instruction-file inventory, immutable startup facts and accurate multi-file context display.
- Git-root-bounded inherited project rules with owner-relative pattern matching; supported parser/glob fixes; retained-context rule deduplication.
- A first Write/Edit encountering new rules is deferred for a new model decision. Omission-only guidance cannot authorize a write; an unfittable group ends with a truthful not-run refusal.
- Bash-enabled specialist companion tools share the advertised/authorized effective allowlist.
- Failed background handoff settles accurately and retains best-effort cleanup ownership.
- Effective MCP configuration generations preserve old holders while serving new settings to new acquisitions, including overlapping close/destroy handling.
- DNS wait cancellation under the existing total web deadline.
- Byte-verified repeated text Read freshness without renewing stale write authorization on refusals.
- Independent native question identities; unchanged legacy Claude Code question behavior.

## Exclusions and limits

- **Deferred C2/R17:** no process supervisor or stronger post-leader-exit group termination. Existing process-cleanup limitations remain. C3 does not claim to resolve them.
- **Denied Q10/F07:** no stale credential-bearing Claude Code MCP projection cleanup.
- **Q22 native-only:** identical question wording in Claude Code still cannot carry independent answers through its legacy format. No new disabled-Submit warning is shipped.
- Other unapproved audit findings are not silently included.
- Linux desktop automated and isolated-renderer evidence only. No live app or paid model evaluation; no native Windows/macOS or Android execution claim. Desktop verification does not cover the marketplace Worker.
- Source and test typechecks pass under the project's existing configuration; the test typecheck still excludes the files reported by verify.sh.

## Evidence packaging

Submitted deck JSON, historical HTML and answer files are retained. The contract's verification metadata was updated after tests existed, but the original signed HTML/answers were not rebuilt. Acceptance is a separate submitted deck.

Screenshots retained under `native-harness-implementation-evidence/` show the real renderer with isolated fake data. Generated deck previews, serving state, intermediate diff packages and other scratch files are not part of the commits.

The three remaining defect-observation probes are **not shipping regression tests**. They assert unresolved/deferred behavior and remain untracked in the app worktree. Copies are retained under `../investigations/2026-09-26-native-harness-audit-evidence/probes/` solely as historical audit evidence; do not interpret their passing assertions as proof those defects are fixed. Tests run before publication include these local probes in addition to the tracked suite; the original reports state their roles.

## Verification and integration status

Multiple full desktop verification runs passed after implementation and final grading. The publication run's retained result is `../investigations/2026-09-26-native-harness-audit-evidence/pre-pr-verify-full.log`. Workspace driver tests are separately run before the workspace commit. Each evidence file reports its actual scope.

The branches preserve the audited baseline rather than integrating unrelated changes that landed during this long session. At publication preparation, the app branch was 48 commits behind fetched `origin/master`, and the workspace branch was 53 behind. These are observations at preparation time, not permanent counts. Final review must inspect current mergeability and integration consequences; no upstream merge/rebase, force push or release is authorized by the PR request.
