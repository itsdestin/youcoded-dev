---
status: shipped
date: 2026-09-22
---
# Sync safety restart

## Objective and current authorization

Make sync safer and simpler without dropping features or changing the familiar interface. On September 22 Destin approved bringing the completed small fixes forward to current master, reassessing remaining findings, and determining the best next batches. This is not permission to import the old backup architecture or implement unreviewed recovery controls.

The four existing decisions remain authoritative: staged safety fixes before consolidation; secure existing deletion semantics without new delete-everywhere/local-eviction controls; preserve the last verified recovery copy beyond ordinary expiration when necessary; improve existing screens rather than redesign navigation.

## Preserved checkpoints and approvals

The original workspace remains untouched at `../sync-safety-audit-20260908`.

- Old app baseline: `6bf34ad57`; preserved app checkpoint: `ccd80bfa69aae29992c9bf1eb06f59a8575865c3` (September 11, also on the remote session branch).
- Preserved workspace checkpoint: `13a21258`.
- In that workspace checkpoint: `docs/active/design/2026-09-08-sync-safety/sync-safety.questions.answers.json` records all four decisions, submitted September 9 08:19:06 UTC.
- `docs/active/design/2026-09-08-sync-safety/sync-safety.review-2.answers.json` records approval of the simplified conflict copy, submitted September 9 09:14:42 UTC. Earlier rejected local/remote-device explanations must not return.
- Old `docs/active/specs/2026-09-09-sync-safety.md` remains the source of approved direction, not approval of every draft algorithm.
- The old execution ledger is stale about uncommitted state and some completed work. Its historical verification does not establish compatibility with today's master.

Restart workspace: `sync-safety-restart-20260922`, workspace baseline `8d0b8a1ee92040431e55161c0aeb0f6d62113d04`, app baseline `70830d672bdcc0ca69a38c1624ea6ab7944a7d8d`. New isolated worktrees created through workspace-start; original checkpoint is not merged or rebased.

## Bounded carry-forward work

Only these completed changes are being adapted initially:

1. Automatic space-backup target selection honors `syncEnabled === true`. Preserve explicit manual backup to a paused destination; this does not stop an in-flight copy.
2. Conversation conflict healing preserves unreadable/unparseable evidence and removes valid copies only after successful incorporation. Preserve the existing convergence contract.
3. The approved conflict notice: “Conflicting changes were saved in separate files. Look for ‘(from …)’ in their names.” Help additionally explains the same-folder location. No new interface or navigation.

Carry-forward implementation evidence: `../reviews/2026-09-22-sync-restart-port.md`. The deleted old panel test was adapted into `SyncPanel.test.tsx`; the backup helper tests live in `sync-spaces-daily-backup.test.ts`. No old workbench fixture was restored.

Current status: three changes ported; 80 focused tests passed after 23 failures in the initial run (57 passed). Note: the initial backup-helper failures were missing-module failures, not direct proof of the consent predicate; that guard still merits a mutation check. Parent independently ran `bash scripts/verify.sh <restart-app>` after the builder stopped: exit 0, all seven gates passed; evidence `scratch/sync-port-parent-verify.log`. This is the related-test gate, not the full desktop test suite; Android and Worker remain unverified. Parent inspected current-renderer notice and help captures in midnight and halftone; text is visible and unclipped. The old broader UX issues (green All synced alongside conflict attention, no affected-file actions) were not silently expanded into this copy-only port. Fresh review returned two blockers to validate: an in-flight healer can recreate a canonical after the unlocked `remove()` deletes its claims, and a valid claim is repeatedly renamed while an invalid canonical blocks incorporation. The actual `remove()` caller found is phantom-record cleanup (`conversations/service.ts:333`), not a general Delete chat action; do not conflate this with global user deletion. The builder is reproducing/classifying these findings and will correct narrow verified issues before fresh verification/re-review. Earlier green gates remain evidence for the pre-review patch, not final acceptance.

## Status 2026-09-23 (supersedes the "Current status" paragraph above)

App branch `session/sync-safety-restart-20260922`, rebased on master `7247ad7eb`, all pushed. Every
item in the risk map below was reproduced (real git, disposable data) or ruled out, and each
reproduced one has a red-then-green regression test:

| Risk | Outcome |
|---|---|
| Carried heal change froze writes on an unreadable canonical | fixed: bytes set aside as `<id>.json.damaged-<uuid>` |
| Secrets overridden by user `.gitignore` | fixed: `stageAll` (also a two-sided secret conflict — review blocker) |
| First sync / merge overwrote ignored local files | fixed: `holdUnmanaged`/`restoreUnmanaged` |
| Failed backup pruned + consumed the day (both paths) | fixed: prune after full success, newest kept, per-destination marker |
| Shared dated backup folder | fixed: newer-wins copies |
| Conflict command failures as absence/success | fixed: checked `ls-files -u`, abort on failure |
| Repair Tier 1 pushed an unapplied fetch as deletions/resurrections | fixed: keep readable local tip, else adopt keeping local copies |
| Device forget left a copy on lock | fixed: retry then report |
| Stopped name reattached / case-only names shared a repo | fixed: refused at create, import and discovery |
| Cross-drive import race | not present (EXDEV recheck already refuses) |
| Cross-process settings lost update | real only between two app processes within microseconds; left (roadmap: dev-copy race) |

Two independent review rounds; round-2 findings fixed or filed. `verify.sh --full` green
(`scratch/verify-final.log`). Android/Worker not run (no Kotlin/Worker change). Deliberately left
items are filed in `docs/roadmap/sync.md` (2026-09-23 entries). Nothing merged.

## Reassessment criteria

Every previous finding must be classified as still present, addressed upstream, changed/partly addressed, or not yet established. Historical positive bug-presence tests are not regression tests. Direct invocation of repair proves repair's behavior, not that a particular real-world corruption necessarily reaches it.

Recheck both data-loss and disclosure risks, including mandatory secret exclusions overridden by a user's `.gitignore`. Separate local file deletion, remote deletion propagation, retention deletion, and cleanup of redundant metadata; they are not one policy.

Rank next batches by user harm and confidence, not by where the old session stopped. Prefer small independently testable changes. Backup publication, dataset-aware retention and unknown-ancestry recovery need explicit compatibility/retry designs; do not implement the old overcomplicated ownership/coordination draft. Existing case collisions are distinct from preventing new collisions, and preflight checks do not provide distributed uniqueness.

An independent read-only source reassessment returned the findings below. These are source findings, not present-day runtime reproductions or new-batch algorithm approvals. Parent spot-checked the mandatory-exclusion/staging path and the entire DailyBackup copy/marker/prune sequence. A focused follow-up is checking repair's fetched-but-unapplied baseline hazard and which older findings upstream actually closed.

### Current risk map (source-derived)

Paths are relative to `youcoded/desktop/src/main/` unless stated otherwise.

| Risk | Current evidence | Next proof / boundary |
|---|---|---|
| Secret exclusions overridden by user `.gitignore` | `sync-spaces/guards.ts:20–40`, `git-transport.ts:341–343,367–381`: default exclusions only in `info/exclude`, followed by unrestricted `add -A` | Real-Git `!.env` regression; protect both new staging and outgoing history without rewriting already-published history. No claim that Destin's secrets were exposed. |
| First-contact checkout overwrites ignored local collision | `git-transport.ts:594–609,632–669`: unborn local branch adopts remote; ignored files lack a local snapshot | Real-Git collision test; preserve local bytes or refuse safely, without treating all ignored content as uploadable. |
| Failed dated backup prunes and consumes day | `sync-spaces/daily-backup.ts:42–59`: copy errors caught, prune still runs, global marker and completion still written | Fault-injected copy + old good snapshot + same-day retry assertions. Fixing marker alone does not make publication safe. |
| Shared dated destination and age-only retention | `daily-backup.ts:62–100`: no run/device isolation; every old date can be pruned | Compatibility-aware publication design before claiming a verified replacement or last-good retention. Android legacy `Backup/personal` is distinct from desktop `Backup/spaces`. |
| Conflict command failure mistaken for absence/success | `git-transport.ts:313–324,682–725`: stage read errors become null; intermediate commands unchecked | Fault-inject each stage/enumeration/checkout/add/remove operation; preserve retryability and convergence, not permanent blockage. |
| Cross-drive import may touch another writer's destination | `sync-spaces/import-project.ts:154–176`: existence precheck followed by copy and unowned recursive cleanup | Race-injected destination ownership test; existing precheck remains useful but is not exclusive ownership. |
| Case-equivalent projects share remote identity | `sync-spaces/space-manager.ts:14–25`, `managed-roots.ts:37–43` | Guard new known local/registry collisions; separate existing collisions and offline peers. Do not change remote naming. |
| Exact stopped identity can attach on fresh local creation | `sync-spaces/service.ts:646–660`, `project-registry.ts:194–209` | Folder-absent stopped record fixture; preserve local creation versus activation distinction. |
| Cross-process settings overwrite each other | `sync-spaces/space-manager.ts:74–115`: atomic rename without serialized read-modify-write | Deterministic two-writer test and smallest shared mutation boundary. |
| Device forget can leave or regain conflict copies | `sync-spaces/device-registry.ts:201–235` | Failed removal / late-copy tests; a live device re-registering is intentional, not authorization for permanent tombstones. |

Do not prioritize preservation of arbitrary index-only deletion as an established user contract: this hidden sync repository normally snapshots the worktree. Repair's never-applied-remote-file deletion and stale-file resurrection are the stronger historical claims to revalidate.

## Upstream work to credit, not redo

Git history between the old baseline and restart baseline includes:

- `7809ff46b`: false-success backup UI corrections.
- `b2178fdb5`, `cdd831dfd`: oversized upload handling, awaited retry and subsequent independent-review fixes.
- `85b2b06fe`: sync recency among other correctness fixes.
- `71b46eaa5`: lease/remote correctness fixes, including transport remote inspection.
- `971f95e31`, `66b993588`, `1d20d5013`: periodic sync-health checks and warning refresh.

These commit subjects identify work to inspect, not proof every related old finding is closed. Current source/tests and the independent reassessment determine closure.

## Completion gates for this restart

- Three carried fixes adapted and current focused tests run.
- Fresh independent code review; no concurrent mutation-testing against a builder's files.
- Current desktop verification, with failures addressed and limitations stated.
- Approved copy visually checked in the current renderer before calling the UI carry-forward complete.
- Ranked next batches and explicit remaining uncertainty presented to Destin; no bulk rewrite, automatic migration of user data, or blanket sync-safety completion claim.
