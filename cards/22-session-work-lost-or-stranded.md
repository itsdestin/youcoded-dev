---
id: 22
title: Six ways a work session's progress can go missing
stage: planning
priority: P1
tags: dev-workspace, knowledge, regression, bug
branch: 22-session-work-lost-or-stranded
roadmap: dev-workspace: Session work lost or stranded: 6 ways a session's work or wo
created: 2026-10-15
summary: Unfinished work can vanish or be stranded on one computer, and the cleanup step has offered to delete folders holding unsaved edits.
area: Workspace
vision: together.added.closeout
work: session/162-linux-update-feedback, session/93-file-viewer-freezes, session/welcome-back-recovery
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats
- 2026-10-18 session/welcome-back-recovery: Close-out recurrence verified again: both unchanged base tips were called landed while recovery implementation is uncommitted. No deletion/archive/card closure followed; /tmp/recovery-close-{app,workspace}.log preserve evidence. Existing #22 covers the required dirty-worktree guard; no duplicate item.
- 2026-10-18 session/93-file-viewer-freezes: Read-only close-out recurrence: both unchanged base tips were called landed despite this session's uncommitted implementation, and deletion was suggested. Worktrees retained; no card closure, archive, or cleanup followed that false verdict. Tooling repair remains outside this performance task.
- 2026-10-18 session/162-linux-update-feedback: Read-only wrap-up recurrence: close-out falsely says landed and recommends deletion for both workspace/app branches whose tips are unchanged base commits while approved #162 implementation is uncommitted. Both worktrees retained; logs /tmp/162-app-closeout.log and /tmp/162-workspace-closeout.log. No tooling fix or cleanup performed.

From the old roadmap (dev-workspace › knowledge, status confirmed, seen on n/a, last checked 2026-09-13)
Session work lost or stranded: 6 ways a session's work or worktree goes missing. (a) a finished session's manifest is never removed (179 of 198 stale), poisoning its key; (b) a worktree vanished mid-session with its branch and manifest, taking the only copy of the work; it recurred 2026-09-23 (report: docs/active/investigations/2026-09-20-session-worktree-disappeared-mid-session.md); (c) workspace-start will not resume after post-merge cleanup removed a component worktree; (d) a fresh worktree came up missing a package its lockfile names (fifth time; cause unknown); (e) close-out says "the work landed" and suggests deleting a worktree that holds uncommitted edits (recurred 2026-10-06 on voice-custom-vocabulary; no cleanup performed); (f) work still lives on one disk only: a complete implementation sat uncommitted 14 hours, and a committed but unpushed branch was lost across machines
