---
id: 57
title: "No folder" chats and a built-in "Your Assistant" project
stage: planning
priority: P1
tags: native-harness, sessions, projects, feature
branch: 57-the-no-folder-choice-on
created: 2026-10-15
summary: Chats with no project folder: test the "No folder" choice, decide incognito rules, and maybe a built-in "Your Assistant" project.
area: Chat
side: both
vision: projects.folder.nofolder, projects.folder.builtin
work: session/android-ux-test
---
Progress
Done: Chats can start with "No folder," which runs the assistant in a clean, empty folder the app keeps (no files or instructions). Shipped in the September 2026 build. On the phone, a session with no folder now opens that same clean spot (shipped 2026-09-16).
Next: re-test the desktop "No folder" choice; decide what an incognito chat keeps and leaves out (not built yet); decide whether a built-in "Your Assistant" project gets built (not built yet). Also decide here (Destin, 2026-11-12, #251 deck R2-Q): YouCoded's own engine does not read the every-project rules file (~/.claude/CLAUDE.md) — it reads rules only from the project's folder up to the top of its repository, while Claude Code reads both. Whatever becomes the home for global instruction files must also be read into every chat on YouCoded's engine; the pop-up's Global context tab shows "No every-project rules" there until it is.
Blocked: the phone part is in an unmerged Android test branch (session/android-ux-test), waiting on card #213.

Chats
- 2026-11-08 session/android-ux-test: Phone stopgap (card #213, youcoded 47d32af06): the phone no longer offers its app-private Home as a project, shows the No folder row, and opens a new session with no folder there. Destin 2026-11-08: fold the phone into this card's rethink of presets and no-folder sessions.

From the old roadmap (native-harness › sessions, status needs-verify, seen on all, last checked 2026-09-19)
**v1.3.1 release blocker.** The "No folder" choice on the new-session form (shipped 2026-09-11) was never tested or thought through (Destin, 2026-09-19: "we didn't really like think that through… I didn't test it at all"). Test that it works, then turn it into an incognito mode; what incognito keeps and leaves out needs deciding. Goes with the "Your Assistant" item below

Merged in #58 "A built-in "Your Assistant" project on every install"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › sessions, status decision, seen on all, last checked 2026-09-19)
**v1.3.1 release blocker.** Every install should come with a built-in project, "Your Assistant" (name not final), in the Projects list and managed by YouCoded. Destin, 2026-09-19: the assistant itself is a project — "the rules it follows and the ways it behaves and the things it knows about you… is something that you get to build and design and change your way. It'll work fine if you don't change anything." It is the home for miscellaneous requests and where big-picture preferences, memory about the user and global instruction files live. The first-run tour points at it. Later it is the main assistant that takes a phone request and hands it to the right project (see the Mesh item below). Replaces the 2026-09-10 "Home folder" idea

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
