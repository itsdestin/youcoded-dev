---
status: active
date: 2026-09-08
topic: App-wide error recovery, reporting, and contribution setup
---

# Error states and Development settings — audit in progress

## Scope and approval boundary

Destin requested ALL error states across screens, chats, settings and menus: consistent, friendly explanations; Retry for recoverable operations; GitHub reports for app-side defects, with logs/images where possible. Also requested a managed/synced contribution workspace, a non-developer-friendly information walkthrough, an improved report/feature-request interface, and an always-current roadmap entry pinned on GitHub Issues.

Initial questions and workspace clarifications are submitted under `../design/2026-09-08-error-states-development/` (both `.answers.json` files). Approved: full audit scope; minimal report evidence with optional logs; GitHub browser attachment completion; optional AI; contribution walkthrough; canonical roadmap link; existing folders left untouched; local work allowed with an honest backup warning. UI-only design work has begun for Before/After review. Backend implementation and GitHub publication have not begun. The existing misleading-error audit remains open; this investigation expands its evidence rather than declaring it complete.

## Evidence and limits

- Isolated app revision at investigation start: `37340a29`; workspace revision: `9ab3ec01`.
- Source inspections cover shared renderer families plus reporting and workspace installation. The resumed backend/Android reviewer returned a prioritized source inventory, including Worker boundary/parser checks. This is not an exhaustive backend census: Worker route-specific messages, Durable Objects, provider mapping, updater/installer paths, sync and Android PTY/JNI failures still need deeper inspection.
- Baseline: `scratch/error-review-before/coverage.md`, generated with the isolated workbench on port 5953. Boot check passed all 16 routes.
- Capture result: **223 covered, 0 partial, 71 missed, out of 294 planned surfaces**, in six themes. These are capture-plan entries, NOT 294 unique product screens or 294 error branches.
- The plan directory includes historical before/after design rounds; many misses expect superseded settings navigation. Coverage must distinguish obsolete plans, replacement captures, and truly unreviewed current surfaces. Do not simply delete misses to improve the total.
- Source audit is not visual verification. Successful baseline screenshots are not proof that the screen's failure branch was exercised.
- Targeted synthetic capture plan `scripts/ui-review/plans/error-audit-current.json` now covers 10 current states. Final `scratch/error-audit-current/coverage.md`: **8 covered, 0 partial, 2 missed** across six themes. Covered: ChatGPT status failure, OpenRouter verification failure, damaged/interrupted/paused local models, resume failure, permissions load failure, and diagnostic workspace setup failure.
- The two targeted misses are report-summary and report-submission rejection: the expected injected error text never appeared. The capture worker inspected the final Midnight images and reported the forms remained visible with no failure explanation. Keep these as failed error-display assertions, not successful visual coverage. They corroborate E-02 under synthetic workbench injection, not a real GitHub/Claude outage. Expectations were not weakened to count the unchanged form as an error state.
- The capture worker changed only the new plan, reported clean app status and `git diff --check`, and verified its workbench port 5963 was no longer listening. No product fix or full desktop verification was performed.
- No production/live-app interaction, installations into user projects, or GitHub mutations occurred.

## Accepted follow-up from fresh UX review 1b

`../reviews/2026-09-09-error-states-development-ux-review-1b.md` U1/U4 are accepted for this app-wide audit, not the current contribution mockup revision. Existing Backup & Sync's narrow failure tells the user to navigate to Settings → Development and shows dense small red copy. Review a direct report action beside Retry and concise neutral error copy under the error-message standard. Evidence: `scratch/ux1b-narrow2/midnight/backup.png`. No Sync implementation or copy changes authorized in the revision-deck task.

## Confirmed report-flow findings

Paths below are relative to `youcoded/desktop/src/`.

| ID | Finding | Evidence | Required design consequence |
|---|---|---|---|
| E-01 | Originating failure is lost when entering reporting | `renderer/components/development/BugReportPopup.tsx:12–15` accepts only open/close, and `:30–38` starts with empty description | A reviewed, sanitized error context must reach the draft |
| E-02 | Continue and Submit can reject without showing a local failure | Same file `:57–109`, try/finally with no catch | Reporting must have its own recovery path independent of the failing app operation |
| E-03 | Logs are sent to Claude before editable review | Same file `:69–78`; `main/dev-tools.ts:411–455` invokes Claude with collected log text | Review/consent must precede AI transmission, not merely GitHub submission |
| E-04 | Existing redaction is narrow | `main/dev-tools.ts:51–60`, home path plus GitHub/Anthropic token patterns | Do not call it comprehensive sanitization; preview and exclusion controls remain necessary |
| E-05 | No image/file attachment payload in current report flow | `main/dev-tools.ts:487–494`; `BugReportPopup.tsx:91–98` | Choose a supported ordinary-user upload path, not an undocumented API assumption |
| E-06 | Reporting depends on an automatic Claude summarization attempt | `BugReportPopup.tsx:76`; `main/dev-tools.ts:411–434` has text fallback | A report must remain editable/submittable without AI; optional AI assistance is a pending choice |
| E-07 | Issue text can be truncated by browser fallback | `main/dev-tools.ts:133–168` | Preserve the full local draft/export and disclose truncation rather than silently losing evidence |
| E-08 | Contribution failure offers Done rather than scoped recovery | `renderer/components/development/ContributePopup.tsx:91–98` | Show installation state and safe recovery; do not reset away partial progress |
| E-09 | Existing workspace install updates a fixed working checkout | `main/dev-tools.ts:588–616`, home directory, pull, setup | Never adopt/move/update an in-use workspace automatically; managed setup needs separate design |
| E-10 | Error primitive forces a recoverable/general split | `renderer/components/ui/states.tsx:90–108` | Recoverability and reportability are independent: an app fault may need both actions |

## Audit classification (proposal, not blanket migration approval)

1. **Transient reads/connections:** Retry the exact read/reconnect, retaining inputs and previously loaded data.
2. **User-resolvable configuration/validation:** Name the actual remedy—sign in, edit a key, select a supported option, resolve a conflict. A blind Retry is not a substitute.
3. **App-side or unknown defects:** Neutral explanation, preserved diagnostic detail, Report bug. A safe local Retry may coexist.
4. **Uncertain mutation outcome:** Check the authoritative state before offering repetition. Applies to sending, commenting, reporting, publishing, importing/moving, deleting, committing, and cross-device handoff.
5. **Intentional fallback:** Label degraded/stale/local-only results without treating an optional image/cache failure as an app-wide incident.

## Source inventory still requiring branch-by-branch verification

Renderer source sweep identified the following families for the migration ledger. No family is marked complete by this list:

- Root, subtree, and document-viewer crash boundaries; setup; remote connection and unsupported-feature notices.
- Chat send, stalled/provider/dead-session banners, model changes, resume/handoff, older history pages, session previews, metadata and composer attachments.
- Assistant defaults, provider load/key/test/save/delete, model catalog, local engine installation/configuration, downloads and per-model settings, permissions and specialists, microphone/voice.
- Accounts/sign-in/profile/delete/export; preferences/theme saves; performance and relaunch; remote access; GitHub connection; sync/backup setup and fix actions; app updates.
- Marketplace section loads, install/update/uninstall, feedback/comments/likes, moderation reports, publishing and sharing, skill edits.
- Projects, file/conversation/search lists, project metadata, create/import/move, context edits, file read/decode/edit/save, concurrency conflicts, Git review and mutations.
- Games/social connection and friend actions; score publication and intentionally local/stale fallbacks.

### Independent source verification

A separate read-only reviewer checked the high-risk findings; no runtime tests were performed.

| ID | Verdict | Evidence and qualification |
|---|---|---|
| E-11 | Accepted: uninstall/update errors labelled install failures | `InstallingFooterStrip.tsx:55` uses “Failed to install”; `state/marketplace-context.tsx:270–271,330–331,354–355` records uninstall/update exceptions in that map |
| E-12 | Accepted: backup retry can falsely report Uploaded | `SyncPanel.tsx:655–656` ignores the resolved result; `main/sync-state.ts:675,685` returns `{success:false,error}`; sibling handler `SyncPanel.tsx:603–604` correctly checks success |
| E-13 | Accepted with qualification: failed edit-start refresh can bypass conflict protection | `artifact-views/ActiveArtifactView.tsx:300–301,324–325`; `main/artifacts/write-authorization.ts:143–146`. If no prior modification-time token exists, saving proceeds without that conflict check. Path authorization and partial-content guards remain intact; a retained token can still protect some cases |
| E-14 | Accepted: remote reporting cannot reach review | `remote-shim.ts:1585–1592` invokes dev report channels; `main/remote-server.ts:2725–2728` returns unsupported for unmatched channels, with no dev handlers found in the routing file; shim `:265–269` rejects. The report awaits log/summary without catching rejection |
| E-15 | Accepted documentation correction: normalization helper already exists | `renderer/utils/ipc-error.ts:28–37`; its test guards four consumers, not app-wide adoption |
| E-16 | Rejected as a current implementation target: RatingSubmitModal | App filename and TS/TSX searches found only stale comment references. Do not migrate a nonexistent current component or assert when it disappeared without history |

Component paths in this table are under `youcoded/desktop/src/renderer/components/` unless otherwise qualified. These accepted findings are audit requirements, not permission to skip the design/implementation gates.

## GitHub options researched

- GitHub pins issues, not Markdown files; up to three pinned issues are documented. A pinned Roadmap issue can link to `https://github.com/itsdestin/youcoded-dev/blob/master/ROADMAP.md` for the latest committed version. A mirrored issue body requires custom synchronization and rewritten relative links.
- Read-only GitHub queries confirmed the workspace repository is public and the app repository had no pinned issues at investigation time.
- Current official CLI attachment documentation describes image/video upload with repository push access. This is not a general upload solution for ordinary users filing bugs in someone else's repository.
- GitHub's browser attachment flow supports screenshots and log files. Upload occurs when attaching, before final submission: local review must precede upload.
- Native text submission can remain separate from browser-assisted attachments. A fully in-app public upload service is a separate storage, abuse-prevention and privacy decision.

Sources:
- https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/pinning-an-issue-to-your-repository
- https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files
- https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli
- https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files
- https://docs.github.com/en/rest/issues/issues#create-an-issue

## Backend/Android source-review findings (not runtime-tested)

The resumed review identified additional boundaries requiring tests before implementation:

- `youcoded/desktop/src/renderer/remote-shim.ts:135–161`: a timeout removes the pending response but not its pre-authentication queued request. A reconnect can therefore execute it later; a timeout cannot promise no change occurred.
- `youcoded/desktop/src/main/session-manager.ts:381–387`: unexpected worker exit emits exit code zero rather than preserving its code/signal.
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:318–321,934–958`: unguarded coroutine handlers, including session creation, lack a shared correlated exception response.
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/ServiceBinder.kt:40–54`: service startup outside the catch, ignored bind return, and unbounded wait are gaps beyond the existing Retry surface.
- Android artifact reading at `SessionService.kt:3715–3719` converts a read exception into successful orphan/missing content.
- Android marketplace response parsing loses some server details while its existing `extractMessage()` already supports JSON message/error and plain text. Compare `MarketplaceApiClient.kt:106,147–153,369–380,401–406,462–467` under the Android source tree.
- Desktop `renderer/state/marketplace-api-client.ts:259–279` supports both Worker shapes. `main/handler-utils.ts:17–23` maps non-API exceptions to status zero, which can include parsing failures as well as network failures: zero is not proof of offline status.
- Production renderer death, native Android WebView failure and next-launch crash reporting require explicit coverage; React error boundaries do not address those failures.

These findings establish source-level risks, not reproduced production incidents. Mutation timeout, crash recovery and Android exception boundaries need focused behavioral tests.

## Next gates

1. Complete backend/Android evidence and targeted error captures; reconcile misses without claiming historical plans represent current screens.
2. Read submitted design-question answers; do not treat a generic Continue as approval of unselected options.
3. Produce Before/After UI designs and run the context-free UX tester before the first mockup review.
4. Convert approved decisions and accepted findings into a contract, then implementation tasks and rejection/result-shape tests.
5. Verify desktop, Android and Worker separately; do not equate shared React or channel-name parity with working cross-platform behavior.
