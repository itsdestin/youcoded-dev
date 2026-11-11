---
id: 17
title: Test copies of the app can change the real one
stage: planning
priority: P2
tags: dev-workspace, rigs, housekeeping, bug
branch: 17-dev-instance-11-faults-where
created: 2026-10-15
summary: A test copy of the app can change your real app's themes, providers, pinned pages and settings, and its launcher often fails to start.
area: Developer tools
side: behind
---
Progress
Done: Landed on master 2026-11-10 (workspace PR #356): the test-copy launcher now runs the session's own code (a fault introduced and caught the same night), checks its port offset early, and lists running test copies. Nothing about sharing was changed.
Next: DECIDED by Destin 2026-11-11 (his words, condensed): the test-app launch script should let the model configure what is kept. ALWAYS: test conversations go to a private throwaway folder; neither the folder nor the conversations may show up in his real live app; his real conversations are never changed. DEFAULT: his sign-ins (Claude Code, ChatGPT and such) are kept because they are useful for tests, but each one can be switched off per launch by the model. No prompt to Destin is wanted.
Blocked: Destin's choice of A, B or C.

See also #127: 127's item (d), a dev copy of the app syncing the same Personal folder as the real app, is one of the dev-instance-touches-the-real-app faults listed in 17.

Chats

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-09-05)
Dev instance: 11 faults where it touches the real app or its launcher fails. (a) a dev instance writes its pinned-pages list into the real Personal folder under a fake device id, which can sync to other devices; (b) removing a provider in a dev window removes it from the real app; (c) picking a theme in a dev window (or a connected phone) changes the live app's next theme; (d) the cross-device sync state file is shared, so two apps can write it at once; (e) a dev window silently rewrote the real app's engine settings (backend flipped to "rocm" overnight); Destin decides which files a dev instance shares before any build; (f) wanted: a dev instance that starts signed in with the real app's keys and a borrowed ChatGPT sign-in; Destin: "it's sometimes annoying to add separate api keys and such for a quick test"; (g) Stop lists the dev instance's own `claude` children without marking them; (h) the launcher has no reliable stop and leaves its Vite server (even on port 5173) holding a port, so the next launch dies; (i) a bad `--offset` fails late with a bare "Port in use" naming nobody; (j) three copies of "which checkout?" each know different layouts; the launcher's own copy is the odd one

Merged in #218 "Dev instances share the real youcoded-defaults.json"
Progress
Done: nothing yet.
Next: decide with Destin whether this folds into card 17 (the dev-copy isolation card). If kept separate, plan how a test copy gets its own settings file.
Blocked: nothing.

Chats
