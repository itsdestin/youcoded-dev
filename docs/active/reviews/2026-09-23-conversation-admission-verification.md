---
status: active
date: 2026-09-23
---
# Conversation admission repair — implementation verification

Scope: the authorized bounded repair in `session/conversation-sync-investigation`, on app HEAD `6bc1a3a3684a5596d60bcd10a9201634bb0ff4ff`. Changes are uncommitted; nothing has been pushed, deployed or merged. The running production app was not used as a test target.

## Implementation

- Both Electron and remote session creation use one backend opening operation. The remote path cannot fall back to bypassing admission while wiring is unavailable.
- Confirmed denial creates no resumed writer. Offline/null acquisition remains usable without pretending the hub confirmed it.
- The native model picker precedes handoff. The renderer no longer owns claim/release cleanup; two bridge APIs and the old factory were removed.
- Concurrent/local duplicate resumes reuse the existing writer. Its owning window is focused without reassignment; `reused` prevents a duplicate new-window request from producing an empty window.
- Startup failure, unreadable saved headers, window closure, tab destruction during native startup, late acquisition and ordinary exit all have explicit cleanup ordering. An unsuccessful teardown retains protection rather than yielding a possibly live writer's lease.
- Try again retries creation, including repeated denial; it never silently turns into takeover consent. Known existing holders get the direct handoff question.
- Requester handoff prepares the transcript and returns `ready`; creation still checks ownership. Forced acquisition no longer reports null or denial as confirmed success.
- Shared explanatory copy distinguishes ownership from message freshness. The existing Git sync engine is unchanged.

Measured implementation delta versus the prior branch HEAD, including the new 113-line coordinator and excluding tests: **439 added / 589 removed, net −150 lines**. This is a reduction in implementation-file lines, not a claim of mathematically minimal code or a substitute for lifecycle tests.

## Observed checks

| Check | Observed result |
|---|---|
| `bash scripts/verify.sh <app-worktree> --base 436ec10e8` | Exit 0. Types, test types, related tests plus 53 source-scanning guards, knip, lint, design lint and ast-grep passed. The existing 47 test-file type exclusions remain; no exclusions were added. |
| Focused regression matrix | Exit 0: **16 files / 408 tests passed**. Includes actual IPC/remote handlers, admission, lease client, requester/holder, socket, bridge failures, gate, buddy caller, workbench and copy. |
| Worker `npm test -- test/sync-hub.test.ts` | Exit 0: **26 tests passed** in the actual Cloudflare Worker/Durable Object test environment. Installed locked dependencies only in the isolated Worker worktree. No Worker source/config/lockfile changes. |
| Android `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk ./gradlew --offline test -x bundleWebUi` | Exit 0. XML reports: **281 tests each** in debug, release, and release-test variants; zero failures/errors/skips. Gradle executed all three app test tasks (12 tasks executed overall, 91 up to date). |
| Workbench boot | Exit 0: **all 16 routes mounted cleanly** after the final mock change. |
| Actual renderer | Before/after captures in Midnight and Light, through actual Resume/Settings clicks; deck preview/contact sheet inspected at 1440×900 and 1024×768. Inline-card handoff independently reached an initialized `Permission ask timeout` chat after the UX tester's simulator stall was fixed. |
| Workspace | `audit-anchors.mjs` exit 0; `roadmap-check --fix` structure clean/index matches. Its historical claim scan separately reported 11 stale anchors outside this repair; that result is not represented as a clean claim audit. |
| Whitespace | App and workspace `git diff --check` passed. |

Logs for this run were captured under `/tmp/admission-final-{verify,targeted,boot}.log`, `/tmp/admission-worker-sync-hub.log`, `/tmp/admission-android.log`, and `/tmp/admission-workspace-anchors.log`. Test source and the retained review captures are the durable reproduction evidence.

## Red/green evidence

Before their fixes, focused runs demonstrated:
- synthetic hub confirmation on offline acquire; ignored takeover during acquisition; a released acquisition reporting success;
- gate startup not called, repeated denial behavior, and real BuddyResumeList missing the retry state;
- actual creation despite a closed requesting window, wrong duplicate-focus behavior, and unreadable native headers returning phantom sessions;
- native startup outliving destruction, failed teardown surrendering protection, ordinary exit releasing ahead of teardown;
- an unanswered remote creation exception and an unwired remote path bypassing admission;
- the remote shim treating startup failure as resolved data;
- mock inline-reference resumes retaining `Resuming...` and never emitting initialization;
- missing message-freshness qualification and an error toast promising opening despite denial.

The independent code review's original four findings were remediated. Its focused re-review found one additional no-live takeover route bypassing the ordinary-exit stop barrier; two new regression cases failed before the five-line barrier fix and passed afterwards. The reviewer then confirmed that blocker resolved, with no counterexample found in the corrected path. The final desktop gate and 408-test matrix were re-run after that last change. Static and functional UX findings/dispositions are in the adjacent review files.

## Not established by these checks

- No two-computer click-to-ready/network latency measurement was performed. Elapsed-ms logging is instrumentation, not that acceptance result.
- No claim of strict single-writer fencing while devices are disconnected, or final-upload acknowledgement. Forced/incomplete handoff can start from stale messages.
- Q-8's dynamic “Still syncing recent messages…” state remains unfinished; static explanatory copy is not equivalent.
- Q-6 was resolved after this initial verification: Destin chose `keep-short` in the submitted admission-repair deck. Finding/opening/resolving split conversation copies remains a separate recovery-UI decision in `docs/roadmap/sync.md`, explicitly requested again in his Q-6 note.
- Screenshots and workbench interaction use a simulated backend. They are not end-to-end proof of cross-device transfer.

This is a review handoff for the repaired ownership lifecycle, **not a shipping/merge recommendation or a claim that the broader handoff feature has finished acceptance**.

## Follow-up: explicit escalation after retry (2026-09-23)

Destin requested escalation after R-2 and approved the small-change route. First denial still offers Try again / Leave it; a denied retry now opens the existing normal takeover confirmation for the latest holder. Affirmative confirmation is required before requesting handoff; force remains a separate confirmation. A subsequent denied backend creation returns to the retry flow rather than bypassing admission. The helper shares the known-holder handoff logic instead of duplicating it; no dialog, bridge, backend, or mock API was added.

Fresh checks after the change:
- `bash scripts/verify.sh <app-worktree> --base 436ec10e8`: exit 0, all seven desktop gates passed (existing 47 test-type exclusions unchanged).
- Independent focused run: `resume-lease-gate`, `BuddyResumeList`, and `takeover-dialog-copy`: **3 files / 30 tests passed**, exit 0.
- Actual renderer at this session's isolated workbench on 5234: clicked Resume → Resume Session → Try again and verified Take over in Midnight and Light, with 150 ms simulated latency. Before screenshots reuse the earlier reviewed denial state; the attempted fresh before capture encountered the already-updated flow and was not used as before evidence.
- Preview/contact sheet read in both themes at three viewport sizes. Review: `docs/active/design/2026-09-23-conversation-admission/escalation-review.json`, new step R-4; the submitted R-2 record is preserved.
- Android and Worker were not rerun for this renderer-only follow-up. Earlier results above are not presented as fresh platform runs. Cross-device limits remain unchanged.

Logs: `/tmp/admission-escalation-verify.log`, `/tmp/admission-escalation-focused.log`; screenshot logs under `scratch/lease-handoff/escalation-runs/after/`. No commit, push, deployment, or production-app interaction.
