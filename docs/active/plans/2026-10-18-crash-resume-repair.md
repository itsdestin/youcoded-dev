---
status: active
work_item: 163
---
# Crash resume repair implementation plan

**Goal:** Resume histories damaged by failed disk writes without unmatched tool outputs, and retain emergency context recovery for reconstructed sessions. Separately repair the specifically affected local conversations for the existing installed build.

**Approved design:** The user's request to implement the proposed history-preserving repair approves model-facing pairing normalization and correcting reconstructed-resume classification. Never invent missing tool inputs. Original transcripts remain unchanged by normal app reconstruction. Exact accepted checkpoints retain their prefix-preservation behavior.

## 1. Model-facing pairing repair

Files: `youcoded/desktop/src/main/harness/history-rebuild.ts`, `youcoded/desktop/tests/harness-history-rebuild.test.ts`.

- Add regression cases for a lone saved result, an unmatched result mixed with valid parallel results, and a result separated from its call by a user-message/clear barrier. Check messages/origins alignment, unchanged valid pairs and existing missing-result backfills.
- Run `npx vitest run tests/harness-history-rebuild.test.ts` and observe failures before implementation.
- Normalize the result direction as well as the missing-result direction. Match only the immediately preceding assistant call group, consume each expected ID once, remove empty tool messages, preserve unchanged object identities, and mark transformed message origins unbacked rather than falsely citing whole events. Preserve source events.
- Run rebuild, portable compaction and accepted-history tests.

## 2. Reconstructed resume context recovery

Files: `youcoded/desktop/src/main/harness/harness-session.ts`, `native-session-host.ts`, `youcoded/desktop/tests/harness-compaction.test.ts`, host resume tests as needed.

- Extend the existing oversized reopened-history regression to pass the UUID/origin seed that production actually supplies. Verify raw/portable reconstructed histories recover, exact accepted restore stays protected, and unsummarizable live histories are not silently trimmed.
- Observe failing regression before changing code.
- Keep a validated portable summary when its suffix requires synthetic pairing repair; preserve null origins so repairs cannot falsely prove a later portable cut. A missing tail result must not resurrect the entire retired prefix.
- Clear reconstructed-resume fitting eligibility after `/clear` or a successfully committed manual summary, just as automatic summary already does.
- Classify restore mode independently from the existence of event-reference capture metadata; pass that distinction explicitly from the host and retain default compatibility for older test callers.
- Preserve request-only fitting, complete call groups, newest user input and in-memory accepted history. No provider requests in verification.

## 3. Current-build transcript recovery

Workspace repair tooling and private backup/candidate files, not app runtime files.

- Inspect measured restored-history budgets and compaction witnesses before deciding each transcript transformation.
- For exact missing-call results, preserve their text as injected `app-recovery` information instead of fabricating tool-use arguments; retain original event data in recovery metadata. Back up originals and retain all unaffected lines byte-for-byte.
- Measured context failure: an unfinished Bash call in `23650e77…` makes installed portable replay reject an otherwise validated summary, expanding model history to 1,086,056 estimated tokens. Persist only an explicit completion-unknown result for that existing call. No context-clear insertion or summary rewrite is necessary.
- Validate candidate transcripts through the installed-version reconstruction/portable replay and pairing/budget checks, with no cloud calls.
- Any compaction record affected by changed bytes must be revalidated, never blindly retained. Do not replace a recent history with an older mirror.
- Replacement runs only after the built app has exited, and refuses a source changed since candidate generation. Keep backups and an explicit outcome log. Do not signal or control the app. If context repair would require discarding un-summarized meaningful history, obtain a user decision rather than doing so silently.

## 4. Verification and review

- Run focused tests, then `bash scripts/verify.sh <absolute app worktree>`.
- Obtain a fresh source review and address defects with regression tests.
- Verify Android tooling presence before making any Android build claim; no IPC changes are planned.
- Report separately: source fixes verified, transcript candidates validated, replacements staged/applied, and any user action still needed. No commit, push, merge or production installation is authorized.

## Verified checkpoint before user exit

- Full desktop verification passed: 3,889 tests, types, knip, lint and invariants; fresh code review has no remaining actionable findings.
- Workspace/hook tests: 449 passed, including 20 recovery-tool tests. Mechanical anchor audit passed (574 anchors, 1,086 MAP paths); unrelated warnings were not represented as a clean semantic audit.
- Android: 36 unit tests in each of three variants passed and the final backend compiled/packed. Full native-runtime packaging failed its environment-dependent apk-version redistribution gate; no APK claim.
- Actual original histories reconstruct safely through the fixed source, with portable summaries retained for all three root conversations. Current-build candidates also pass installed 1.3.1 reconstruction/pairing/budget checks with 100,000 tokens of assumed fixed overhead.
- Private backups/candidates/audits: `~/.local/state/youcoded-recovery/20261018-crash-resume/final/`. Three root histories plus affected specialist `521d8ccc…`; no context clears or summary rewrites. Orphan results become injected recovery notes retaining original data; the known unfinished Bash call receives one completion-unknown result. All other original lines are byte-exact.
- Original jobs were superseded without applying: the user really quit, but orphan Chromium helpers kept the overly broad executable-name guard waiting. Follow-up 2026-10-19: process-role/held-transcript-descriptor checks now distinguish the main app from harmless surviving helpers; known protected OS daemons are independently identified, unknown inspection failures refuse, and deleted Electron binary names remain guarded. Five added guard regressions passed (25 focused recovery tests total); actual-host read-only simulation confirmed no remaining blocker when excluding the sole live main PID.
- Current batch is `~/.local/state/youcoded-recovery/20261018-crash-resume/refreshed-2/`; new messages in affected chats are preserved and candidates revalidated against installed 1.3.1. `youcoded-session-recovery-163-refresh2.service` runs a privately copied, checksum-verified corrected applier and is waiting for main-app exit. Originals remain unchanged. User must keep YouCoded closed until completion notification. Changed source/candidate/backup hashes refuse replacement; inspect `refreshed-2/apply.log` and `outcome-*.json` before claiming application completed.
- App/workspace source changes are staged only on `session/163-crash-resume-repair`, not committed, pushed, installed or shipped. Inspect the deferred outcome before claiming transcript replacement completed.
