---
id: 17
title: Test copies of the app can change the real one
stage: planning
priority: P2
tags: dev-workspace, rigs, housekeeping
branch: 17-dev-instance-11-faults-where
roadmap: dev-workspace: Dev instance: 11 faults where it touches the real app or its
created: 2026-10-15
summary: A test copy of the app can change your real app's themes, providers, pinned pages and settings, and its launcher often fails to start.
area: Developer tools
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #127: 127's item (d), a dev copy of the app syncing the same Personal folder as the real app, is one of the dev-instance-touches-the-real-app faults listed in 17.

Chats

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-09-05)
Dev instance: 11 faults where it touches the real app or its launcher fails. (a) a dev instance writes its pinned-pages list into the real Personal folder under a fake device id, which can sync to other devices; (b) removing a provider in a dev window removes it from the real app; (c) picking a theme in a dev window (or a connected phone) changes the live app's next theme; (d) the cross-device sync state file is shared, so two apps can write it at once; (e) a dev window silently rewrote the real app's engine settings (backend flipped to "rocm" overnight); Destin decides which files a dev instance shares before any build; (f) wanted: a dev instance that starts signed in with the real app's keys and a borrowed ChatGPT sign-in; Destin: "it's sometimes annoying to add separate api keys and such for a quick test"; (g) Stop lists the dev instance's own `claude` children without marking them; (h) the launcher has no reliable stop and leaves its Vite server (even on port 5173) holding a port, so the next launch dies; (i) a bad `--offset` fails late with a bare "Port in use" naming nobody; (j) three copies of "which checkout?" each know different layouts; the launcher's own copy is the odd one
