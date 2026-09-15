---
status: active
---
# OneDrive downloads/freezes — paused, not ready to merge

<!-- claim: onedrive-paused -->

## User's problem and why this work is paused

Destin reported that YouCoded silently downloads OneDrive files and freezes. He wanted normal local-file behavior preserved, no downloads for passive browsing, and minimal, explicit consent when a particular action genuinely needs online-only content.

The assistant spent hours iterating on UI and standalone infrastructure before connecting production readers, and progress reports obscured that gap. The eventual implementation introduced **unapproved Windows regressions**: filename-only search and disabled recursive project watching. Destin explicitly objected that fixing this bug did not authorize removing existing functionality. These are not accepted product decisions or approved compromises.

On 2026-09-15 Destin instructed: document what happened, what remains and his concerns; link the roadmap; commit/push the branch; create a draft PR outlining known issues; resume later. **Do not continue implementation, broaden the wrap-up, merge, or ship under that instruction.**

## Where the work is

- Workspace: `worktrees/sessions/onedrive-no-auto-download`
- Component: that workspace's `youcoded/`
- Branch in both repositories: `session/onedrive-no-auto-download`
- App repository: `itsdestin/youcoded`; workspace/documentation: `itsdestin/youcoded-dev`.
- This handoff is the current status authority. Earlier design decks and the implementation plan are historical context, not evidence that implementation is complete.
- No changes were installed into or applied to Destin's running app. Draft branches are for preservation, not release approval.

## Approved behavior to preserve on resume

- No persistent, folder-wide or session-wide download grants. Approval covers specific files for one operation; batch genuinely required files into one request.
- No downloads for passive browsing, thumbnails, descriptions, counts or optional discovery. Online-only files get a small cloud indicator; local files continue working normally.
- Actual file click: centered dialog naming the file(s) and source, **Download and open / Not now**.
- Required project instructions: compact two-line card in the affected new conversation, **Download and continue / Not now**. Never silently omit required instructions; only that conversation waits.
- File waiting copy: **“Downloading file. You may wait or leave this page.”** No “Keep working” button or new cancellation controls.
- Dismissing the waiting dialog suppresses automatic opening, without claiming to cancel OneDrive. Instruction-dependent conversation continuation remains automatic when its files arrive.
- Unknown availability/provider must remain unknown, not be labelled local, missing or OneDrive based on its pathname.
- External Claude Code, user-requested Git, shell and MCP tools are explicitly excluded from new sandbox/permission wrappers. YouCoded-owned supporting reads remain in scope.
- Local-content search and automatic folder updates must be preserved. Their current Windows restrictions below were **not approved**.

## What was implemented

1. Real-renderer consent prototypes; policy/operation coordinator; supervised utility worker and Windows metadata probe.
2. Production artifact text/binary reads now apply Windows preflight after existing resolved-path authorization. Passive intent is the default; explicit approval uses expiring one-use tokens bound to transport owner, resolved target, observed metadata and read window. Probes/content reads run off Electron main.
3. File viewers and Context editor have exact-operation consent. Dismissed dialogs discard late opening; thumbnails fall back rather than authorizing downloads. Desktop/remote bridge shapes were updated; Android retains local behavior/unsupported responses where applicable.
4. Passive project descriptions/repository metadata and sidecar handling were guarded. Discovery returns availability/incomplete status. Review fixes added per-file deadlines with bounded waits, preserved unavailable context-rule allowlisting, and restored bounded text-prefix/full-read semantics.
5. Native startup no longer runs automatic synchronous Git snapshots. Required root instructions are loaded asynchronously through the guarded reader; approved bytes are reused by prompt assembly and the context panel. Project-skill description discovery is asynchronous/passive. Claude Code's context banner no longer reads instruction bodies just to name them.
6. Required-instruction consent is connected to an inline per-conversation card. Not now parks the wait. Close, Stop and takeover handling reject stale instruction waits so late completion cannot resurrect a root conversation or start a stopped specialist.

Key app locations: `desktop/src/main/cloud-files/`, `artifacts/{read-service,project-file-discovery,content-search,project-watcher}.ts`, `project-context.ts`, `project-read-service.ts`, `project-repo.ts`, `harness/{prompt-assembly,native-session-host}.ts`, `skill-scanner.ts`; renderer `CloudReadDialog`, `RequiredInstructionsCard`, `ContextEditorOverlay`, artifact-view hooks and thumbnails. Component implementation notes: `youcoded/docs/artifacts.md`.

## Known issues and remaining work — merge blockers

- **Unauthorized search regression:** Windows project search is filename-only, including locally downloaded files. Restore local-content searching while skipping/disclosing unavailable contents; do not accept the current downgrade as the fix.
- **Unauthorized automatic-update regression:** Windows recursive project watching is disabled. Restore safe automatic file-list updates instead of retaining a blanket platform disable.
- **Incomplete internal-reader coverage:** older native rule/nested-instruction indexing (`buildTriggerIndex`), specialist discovery (`specialistCatalog.ensureFresh`) and other legacy app-owned readers remain outside the protected slice. No exhaustive claim that all reads are covered; these paths may still download or stall. Review before declaring the original bug fixed.
- **No real Windows/OneDrive validation:** automated metadata observations were simulated. Path/size/mtime tokens are not stable file identity or atomic no-recall protection. Availability can change between metadata preflight and content read. A Windows VM was discussed, not approved or a prerequisite to integrating the fix.
- **Behavioral gaps:** reopening retries rather than joining an existing download; unavailable directories/sidecar records may be omitted from passive listings; full multi-file action integration is not demonstrated merely by the UI prototype.
- **Platform verification:** no Android build was run (SDK absent on the last check; Java 26 alone present). Bridge shape tests are not an Android runtime test.
- Preserve existing functionality and surface proposed tradeoffs before implementing them. Passing tests does not authorize a regression or prove the original OneDrive symptom resolved.

## Verification recorded before pause

Latest parent run: `bash scripts/verify.sh <isolated-app-worktree>` passed production types, test types (57 files still excluded by the existing configuration), related tests, knip, lint and ast-grep. Log: local `scratch/integration-final-parent-verify.log`. This was the desktop gate, not Windows-provider or Android verification.

- Reviewer-fix regression run: 11 files / 341 tests passed, covering discovery budgets, Context consent/allowlisting, worker prefix reads, IPC parity and session ownership ordering.
- Native lifecycle/context/specialist regression run: 3 files / 242 tests passed.
- All 16 workbench routes mounted. The approved instruction-card screenshot was inspected; that preview does not prove production OneDrive behavior.
- Fresh native and file-access reviewers cleared their reported scoped findings after corrections. Neither performed a whole-app protection audit.
- Earlier failed verification (three async ownership tests, then a missing `grantScope` in a parent test fixture) was corrected before the final green gate.

Scratch logs/screenshots are local diagnostics, not required to understand the preserved branch. Existing design/review records and `docs/active/plans/2026-09-15-cloud-download-protection.md` are preserved alongside this handoff. No paid model evaluations were run.

## Resume boundary

Read this handoff and inspect both draft branches first. Do not restart design rounds or treat temporary restrictions as consent. The immediate unfinished product work is restoring Windows search/watching without recall, completing app-owned reader coverage, then validating real OneDrive behavior. Resume only on Destin's next instruction; do not merge this draft as a completed bug fix.
