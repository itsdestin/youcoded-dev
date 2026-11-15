---
id: 235
title: Phone-width and narrow-window layout: the decided screens, built for real
stage: build
tags: user-interface, narrow-viewport, android, remote-access, feature
branch: 235-phone-width-and-narrow-window
finish: Every screen decided on the narrow-screens decks works in the real app at phone width and in a narrow desktop window, and the status page in that design folder says done for each.
created: 2026-11-10
why: Four rounds of live decks answered 2026-11-04/05 (docs/active/design/2026-11-04-narrow-screens/, phone-hub prototype). Built only in the workbench so far. Destin 2026-11-10: 'also currently in progress'. Branch session/narrow-screen-proposals in the app and workspace. Related: #139 phone-width polish, #222 sidebar chat list, #225 phone marketplace, #213 Android findings.
work: session/narrow-screen-proposals
---
Progress
Done: Design finished 2026-11-14 after nine deck rounds; final decisions in docs/active/design/2026-11-04-narrow-screens/README.md. Workbench-only on branch session/narrow-screen-proposals (app tip 8c6bb291f); the real app is unchanged except a 340px window minimum on the branch.
Next: Rebase both branches onto master (far behind), then build the decided layout for real, delete the practice switches, run verify.sh, show a final deck. Short route: no automatic reviewers. Waiting on Destin to say start.
Blocked: nothing

Chats
- 2026-11-10 session/narrow-screen-proposals: phone layout rounds 1-4 answered; build continues here (Destin 2026-11-10)
