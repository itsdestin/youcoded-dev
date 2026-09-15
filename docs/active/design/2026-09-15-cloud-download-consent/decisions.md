---
status: active
date: 2026-09-15
---

# Cloud download consent — decisions and investigation checkpoint

## Status

Investigation completed at source/documentation level; UI design next. No download protection or responsiveness fix implemented yet. No Windows/OneDrive reproduction and no regression tests executed during investigation.

## User's report

Downloads were noticed immediately after opening Project/Files; chat startup may also have been involved. Windows identified the downloading app as YouCoded. Destin no longer has access to that Windows machine.

## Approved decisions

- Opening/selecting a project must not authorize YouCoded to download cloud-only files.
- Slow file operations must not freeze the rest of the app. Show understandable waiting states.
- Folder-level download permission for the current session, not repeated per-file approval: `cloud-download-consent.questions.answers.json`, Q-1 `folder-session`.
- Pause affected chat startup and ask when necessary project instructions need downloading; do not silently omit them: Q-2 `pause-and-ask`.
- External programs are OUT OF SCOPE for new restrictions or compensating behavior. Q-3 was answered Other / confused, then explicitly corrected in chat: “we shouldnt try to restrict or compensate for external tools. i just want youcoded itself to stop downloading shit and freezing without the user understanding what's happening”. The assistant restated that scope and Destin approved: “okay, looks good.”
- YouCoded-owned reads remain in scope even when supporting a Claude Code chat (for example its context banner). Independent Claude Code, shell, Git and MCP behavior is not subject to a new sandbox, wrapper or launch restriction.

Preserve the original submitted answers unchanged. Carry the scope correction visibly into the next review deck; do not manufacture a Q-3 selection. Any contract requiring deck provenance must use that review's submitted scope step, not falsely cite the original Q-3 as approval.

## Confirmed code findings (app-relative paths)

- `desktop/src/renderer/components/ArtifactThumbnail.tsx`: intersection-triggered image/text content requests without selecting a file; text slicing happens after reading. No shared thumbnail concurrency limiter or cancellation of already-started backend reads.
- `desktop/src/renderer/components/project-view/ProjectView.tsx`: project opening requests context and repository information, plus enhanced counts across saved/managed projects.
- `desktop/src/main/project-context.ts`: full rule/context reads for descriptions; slices are not disk-read limits. `project-repo.ts` reads `.git/config`.
- `desktop/src/main/artifacts/project-file-discovery.ts`: asynchronous metadata walk, nominal 1.5-second budget checked between portions of traversal, not a hard deadline for pending I/O. Finished-result cache does not deduplicate in-flight scans.
- `desktop/src/main/artifacts/project-watcher.ts`: synchronous `.git` access inside ignore predicate; awaiting chokidar ready itself yields the event loop and is NOT proof of a main-thread freeze.
- `desktop/src/main/harness/prompt-assembly.ts`: synchronous instruction reads and automatic synchronous Git snapshot (two 3-second command timeouts, not a total startup deadline).
- `desktop/src/main/harness/injection/path-triggers.ts`: synchronous directory enumeration, existence checks and rule-file reads. Parent verified with binary-tolerant `rg -a -n` after specialist Read rejected file as binary.
- Native startup also discovers skills and specialists using synchronous reads; `claude-code-context.ts` performs app-owned synchronous instruction/skill reads even for Claude Code sessions. `nextTick` does not move those reads off main.

The older investigation in the OTHER `onedrive-download-bug` worktree contains disproven blanket negatives about previews, synchronous project reads and automatic Git. It has not been edited or adopted. Do not use it as the implementation plan.

## Windows documentation findings and limits

- Online-only visibility is not the same as content availability. Content opens can download files; cloud-directory enumeration may fetch directory metadata.
- Recall/partial attributes matter; a separate attribute check followed by a read is not atomic protection against state changes.
- A small content read can trigger a larger or full download depending on provider hydration policy.
- Cancellation and process termination are not guarantees that already-started I/O has instantly stopped. A UI timeout must not claim “download canceled” without evidence.
- No universal consumer-process/child-process hydration opt-out was established. Do not pursue external-tool containment: explicitly excluded by Destin.

Primary references:
- https://learn.microsoft.com/en-us/windows/win32/fileio/file-attribute-constants
- https://learn.microsoft.com/en-us/windows/win32/api/cfapi/nf-cfapi-cfgetplaceholderstatefromattributetag
- https://learn.microsoft.com/en-us/windows/win32/api/cfapi/ne-cfapi-cf_hydration_policy_primary
- https://learn.microsoft.com/en-us/windows/win32/fileio/canceling-pending-i-o-operations

## Current design — specific-download approval (supersedes ALL folder grants)

Destin explicitly approved in chat: “I think I want to proceed with the simpler design.” This followed the recommendation to ask for the specific file needed by the current action, without overarching project permissions.

- No folder grants, persisted authorization, session permission, reset controls, or permission-management UI.
- Browsing online-only files shows a small cloud icon, never downloads for previews, descriptions or counts.
- Clicking an online-only file asks about that file: Download and open / Not now. Fully local files open normally; do not ask simply because the app restarted.
- Required instruction downloads ask inside the affected new conversation: Download and continue / Not now. No silent instruction omission.
- Approval covers only the named download(s) for the current operation. One action needing multiple files gets one prompt listing those specific files. Concurrent requests for the same file should share the pending prompt/read, not multiply prompts.
- After authorization, show compact honest waiting. File opening continues automatically ONLY while the user is still waiting on its popup. Closing that popup suppresses automatic opening; the download may continue, and clicking the file again is a fresh request to view it. Required-instruction continuation stays as approved inside the conversation. Do not steal focus from newer work.
- If a file becomes online-only again, its next purposeful access requires approval again. No durable permission follows it.
- External tools remain outside new restrictions. No cancel-download promises; stop-waiting control remains deferred.
- Prior questions/review answer files remain untouched historical records. Revised visual review will record the replacement design; do not silently rewrite earlier selections.

The interrupted folder-grant revision was replaced by the specific-download prototype. `scratch/cloud-simple-verify.log` records passing desktop verification; backend download prevention remains unimplemented.

### Specific-download review feedback (submitted 2026-09-15 08:58)

Source: `cloud-download-consent.review-2.answers.json`.
- UI-6 cloud-icon browsing approved.
- UI-7 specific-file permission: center a popup modal instead of top banner/card.
- UI-8 file waiting: same centered popup placement.
- UI-9 conversation instruction card approved with shortening to roughly two lines; suggested source sentence: “This conversation requires project instructions stored only in your OneDrive.” Use provider-specific wording only when known.
- UI-10 conversation waiting approved with same two-line simplification.
- Proposed necessary modal accommodation: dismiss waiting notice to keep working without canceling the provider download or abandoning the pending action; show this behavior in the revision review. Consent dismissal is Not now. No new cancellation contract.

### Final visual approval (submitted 2026-09-15 09:24)

Source: `cloud-download-consent.review-3.answers.json`; UI-7/8/9/10 all yes, UI-8 with binding correction:
- Remove Keep working button.
- File waiting copy: “Downloading file. You may wait or leave this page.”
- Closing the waiting popup suppresses automatic opening; only open on completion if the user is still waiting on the popup, or on a later explicit click of the file. Closing does not promise cancellation of provider I/O.
- These corrections supersede earlier automatic-continuation and dismiss-keeps-open-intent wording. Conversation cards remain approved unchanged.

## Earlier decisions — historical, folder duration superseded above

Source: `cloud-download-consent.review.answers.json` submitted 2026-09-15 08:15, followed by explicit chat correction.

- UI-1: explain that files are stored only on OneDrive when that provider is known. Permission persists indefinitely per folder across restarts (Q-duration); replaces original session-only choice.
- UI-2 approved. UI-3 approved with request to reduce lines/empty space in the wide waiting card.
- UI-4 rejected in Projects: instructions permission/waiting belongs inside the new conversation that is waiting.
- Automatic continuation approved; app-owned-only scope confirmed; abandon/stop-waiting control deferred.
- Subsequent explicit correction: NEVER initiate downloads solely for previews, including with saved permission. Online-only files show a small cloud icon. Download specific files only when clicked or needed for another substantive app purpose such as required assistant instructions.
- Persistent authorization is not a reason for automatic background reads. No cloud content reads solely for thumbnails, descriptions or counts. Optional skill/rule discovery must not be mislabeled as required startup instructions.

## Next design/implementation boundaries

Show updated cloud placeholders, on-demand permission at actual access, compact selected-file waiting, and required-instructions card inside the conversation. Keep original decks/answers unchanged. No true progress percentage or cancellation claim. No external-tool permission gate. Explain each UI element's trigger in the review deck. Permission need not interrupt passive browsing because browsing alone must not download.

Additional safeguards for implementation: automatic completion without stealing focus or overwriting a newer selection, clear local-content-only search results, neutral unknown availability, honest prolonged-wait/retry behavior. Saved-permission controls are explicitly obsolete. Do not expand to external-tool containment or new cancellation controls.

Separate protected-file detection and consent from responsiveness isolation. Native automatic Git snapshot may need to stop blocking main, but this is not permission to restrict user-requested Git or other external tools.

A Windows test path is still needed before claiming actual OneDrive hydration behavior verified. The documented quickemu Windows files were absent at expected paths and quickemu/qemu/virsh were not on PATH at inspection. Linux unit/DOM tests can pin attempted access and responsiveness contracts, not prove Windows hydration behavior.
