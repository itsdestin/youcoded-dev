---
id: 33
title: Release blocker: search stops early in big projects
stage: planning
priority: P1
tags: files, projects, desktop, bug
release: v1.3.1
report: docs/active/specs/2026-09-18-project-files-background-index.md
branch: 33-v1-3-1-release-blocker
roadmap: files: v1.3.1 release blocker: searching a big project stops early,
created: 2026-10-15
summary: In big projects, file search stops at 2,000 files and text search at 200 matches, with no way to see the rest.
area: Files & documents
side: both
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on desktop, last checked 2026-09-18)
v1.3.1 release blocker: searching a big project stops early, for file names and for text inside files. (a) File search stops at the first 2,000 files with "This folder is large — showing the first batch of files", and counts read "2,000+" (Destin, 2026-09-18: "i just want everything to work, even if it requires a smidge more backend work"). Folder browsing at any depth is already fixed; the remaining work is one background helper that keeps a list of every file per project, kept fresh, so search and counts cover everything and fill in progressively. Four questions for Destin come first (spec "Open questions" 2–4: excluded folders, "still looking" wording, background indexing of a home folder). (b) Text search inside files stops at 200 matches ("200+") with no way to see the rest. Wanted: matches stream in, more load as you scroll, and an unfinished search says it is still looking, not "no results".
