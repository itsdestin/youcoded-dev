# perf ledger

| # | original first ~70 characters | new entry |
|---|---|---|
| 1 | Opening a long conversation in the background can still interrupt typ | The app still feels sluggish: chat-switch pauses and typing interruptions (b) |
| 2 | Switching chats or resizing the window sometimes pauses much longer t | The app still feels sluggish: chat-switch pauses and typing interruptions (c) |
| 3 | The first Find query in a long loaded chat can still take about a sec | The app still feels sluggish: chat-switch pauses and typing interruptions (d) |
| 4 | The app still feels sluggish across sessions and over time. Historica | The app still feels sluggish: chat-switch pauses and typing interruptions (a) |
| 5 | Session switching in terminal view may redraw more than necessary on  | Measuring rig: scenarios not yet measured (a) |
| 6 | Sustained terminal output and typing remain unmeasured together. Pri | Measuring rig: scenarios not yet measured (b) |
| 7 | File-pane content changing while a different file is open remains un | Measuring rig: scenarios not yet measured (c) |
| 8 | Standard native-stream runs use a fresh chat and cannot represent ev | Measuring rig: scenarios not yet measured (d) |
| 9 | The blank-on-switch detector has not demonstrated sensitivity: a fi | Measuring rig: instruments that can mislead (a) |
| 10 | Scrollblank sampling itself can slow the renderer it is judging: th | Measuring rig: instruments that can mislead (b) |
| 11 | Identical-code native-chat screenshots can differ more than the com | Measuring rig: instruments that can mislead (c) |
| 12 | The artifacts rig sometimes shows an empty session-files drawer (rou | Measuring rig: instruments that can mislead (d) |
| 13 | Comparison controls are only partial: compare.mjs now rejects missi | Measuring rig: instruments that can mislead (e) |
| 14 | Software-rendered runs do not establish what happens on a real high | Measuring rig: instruments that can mislead (f) |
| 15 | The rig has no recurring same-machine startup-mark and idle-CPU tre | Measuring rig: instruments that can mislead (g) |
| 16 | The repeatable performance suite does not yet cover long soak and r | Measuring rig: scenarios not yet measured (e) |
| 17 | A very large Markdown file still pauses visibly when opened: a meas | Files and Office editors: slow and memory-hungry cases (a) |
| 18 | Editing a file, copying code or navigating an HTML preview can stut | Files and Office editors: slow and memory-hungry cases (b) |
| 19 | Starring, tagging or renaming a chat triggers a later full search-i | Main process: freezes and resource growth (b) |
| 20 | Theme mascot companions may animate at the full display refresh rat | Theme and animation costs on screen (a) |
| 21 | Large synced projects still consume more file watches than necessar | Sync: growth and duplication decisions (a) |
| 22 | Synced code projects that already keep Git history receive a second | Sync: growth and duplication decisions (b) |
| 23 | Personal sync history keeps growing: 1.7 GB on GitHub and 2.5 GB on | Sync: growth and duplication decisions (c) |
| 24 | A device far behind on a slow connection may repeatedly time out it | Sync: growth and duplication decisions (d) |
| 25 | A phone receives output and chat events for every open computer ses | Phone and remote: wasted work and slow starts (a) |
| 26 | First remote connect can leave a phone showing white before sign-in | Phone and remote: wasted work and slow starts (b) |
| 27 | Phone reconnect still transfers a full copy of conversations and bu | Phone and remote: wasted work and slow starts (c) |
| 28 | Android still reads an entire long conversation on open instead of | Phone and remote: wasted work and slow starts (d) |
| 29 | Marketplace refresh sends the whole ~1 MB catalog (~5,000 rows) and | Phone and remote: wasted work and slow starts (e) |
| 30 | Community CSS may keep an always-visible theme animation running at | Theme and animation costs on screen (b) |
| 31 | After 73 minutes and ~15 helpers changing files, a dev instance's m | Main process: freezes and resource growth (c) |
| 32 | Git refresh for a file can start up to three git processes per file | Main process: freezes and resource growth (d) |
| 33 | The old ~250,000 file-watch count exhausted available watches when  | Main process: freezes and resource growth (e) |
| 34 | Remaining main-process blocking work can still interrupt every wind | Main process: freezes and resource growth (a) |
| 35 | v1.3.1 blocker, blocked on simplification phase 5: two small reads | v1.3.1 blocker: leftover whole-file reads and memory waste |
| 36 | Fresh perf worktrees re-download ~490 MB of fixture assets when a  | Measuring rig: instruments that can mislead (h) |
| 37 | Restoring a kept version of an open Office document copies all its  | Files and Office editors: slow and memory-hungry cases (c) |
| 38 | If one project's file list hangs on the Office page, pressing New c | Files and Office editors: slow and memory-hungry cases (d) |
| 39 | On a big Excel workbook (a 20 MB test sheet), typing freezes for ab | Files and Office editors: slow and memory-hungry cases (e) |
| 40 | Every open Office document keeps its editor loaded, so memory grows | Files and Office editors: slow and memory-hungry cases (f) |
| 41 | Other card grids may repeat the per-tile blur cost previously found | Theme and animation costs on screen (c) |
| 42 | Animation frame budgets have not been checked on actual phones or r | Phone and remote: wasted work and slow starts (f) |
