# Claude queues — merged result

status: shipped

App PR: https://github.com/itsdestin/youcoded/pull/657
Remote master merge: `a00cb691604c4013d50f1b15f96011bb1d37a27c`.
Verified feature head: `605f0d4977d050bd2a9fc70a536b88234da522fd`; ancestry to remote master verified.

## Delivered

- Existing native queue strip/composer reused for host-owned durable Claude queues; FIFO action-boundary delivery, attachment-preserving edits, removal and interrupt/send-now.
- Stop retains waiting intent; Clear and restart retain it paused. Exact request identities survive unknown replies and renderer reload. No automatic replay of uncertain delivery.
- Authenticated direct-control foundation integrated, retaining Escape Stop and legacy file handling where needed. Queued files use explicit read-file instructions rather than pretending contents were preloaded.
- Rapid identical-send races repaired: no reuse of active intent IDs, no quarantine of definitively unstaged input, no replacement of live native fences, no late ACK revoking newer flow.
- Durable original-attempt/actual-transcript-UUID evidence enables read-only Check Delivery. Missing proof remains uncertain, never guessed from matching historical text.
- Direct Dismiss, with no confirmation popup: invalidate the old input authority, retire the dismissed intent, preserve human drafts and let new conversation/queue cycles proceed. Old paused messages do not automatically flush; late evidence cannot resurrect the dismissed attempt.
- Idle-ready delivery does not flash a Sending row. Identical delivered text cannot hide a separate paused item. Already-visible tutorial tips remain stable across queued turns; new tips still defer while busy.
- Integrated current master's crash recovery and IPC acknowledgement teardown, with a regression protecting crash-recovered text/files from late queue edits.

## Verification

- Final integrated required desktop verification: 424 test files passed, 1 skipped; 8,614 tests passed, 36 skipped. Types, knip, lint, design lint, invariants, screen-open checks and journeys all passed.
- Stable screenshot-tool suite: 58 passed, zero failed.
- Local Android debug JVM: 36 tests, zero failures/errors/skips. Aggregate local Gradle test encountered the runtime redistribution comparator gate; the targeted JVM result is not claimed as a local APK build.
- Exact-head CI run 39357377684 passed selected Linux test shards, Android JVM and debug/releaseTest APKs, all four Linux package formats, evidence and required Ubuntu completion.
- Public app history gitleaks scan: two commits scanned, no leaks found.
- Actual isolated CLI acceptance: genuine unknown Dismiss, fresh send, restart, then 30 physical-key submissions at 79–93ms intervals produced 30 receipts, unique UUIDs and actual native rows. Two older paused messages remained untouched and visible. No page errors.
- Actual earlier GUI: ordering, edit/remove/attachments, Stop, Send now and Clear/resume. Deterministic tests cover fresh task plus two queued messages after dismissal. Additional slow-tool post-dismiss walkthrough was not run after its isolated listener stopped; do not upgrade that limitation into a pass.
- Final tutorial repair was observed RED before implementation; four focused files / 32 tests passed twice, required desktop verification passed, and the same tip DOM node survived simulated busy/idle transitions in the isolated workbench.

## Evidence lookup after worktree removal

Workspace archive: https://github.com/itsdestin/youcoded-dev/pull/283. Card #169 is merged; both session worktrees and their feature branches were removed after remote ancestry checks. Do not resume the deleted `session/169-claude-message-queues` worktree or treat the original plan's unchecked boxes as pending work.

Local-only evidence is preserved under `~/YouCoded-Test-Builds/claude-queues-169-evidence/`:

- `session-evidence.tar.gz`: original active-design/investigation paths, raw captures, probes and intermediate evidence. The remaining 784 untracked evidence files were checked byte-for-byte against this archive before cleanup.
- `final-integration-evidence.tar.gz`: final scratch reports, integrated verification output and the archived design/investigation records. Both archives passed gzip integrity validation.
- Key members include `scratch/169-dismiss-final/REPORT.md`, `scratch/169-buddy-flicker/REPORT.md`, and `scratch/verify-20261019-190923-189575/`. Earlier documents' scratch, runtime and capture paths refer to archive members, not files shipped in this repository. These archives are private evidence, not release downloads.

## Boundaries and retained evidence

The separate Linux test copies are not production updates. Version `1.3.1-cc-queues.2` predates the final tutorial-only repair and upstream integration. No release tag, installed production update or new paid evaluation was performed. Windows/macOS runtime and Android device interaction were not exercised here; CI APK production is distinct from device acceptance.

Earlier files in this archive are historical experiments/plans, not outstanding work. Submitted answer JSON is retained unchanged; the later explicit direct-dismiss override supersedes the danger popup and permanently blocked-composer proposal. Raw captures, private fixture state, scratch reports and executable probes are retained locally outside the disposable worktree, not published. Deferred broader direct-control follow-ups stay with #11/#12; unrelated native queue work stays with #62. Attachment-cache aggregate garbage collection was not added.
