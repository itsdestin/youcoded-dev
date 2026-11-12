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
work: session/17-private-test-copies
---
Progress
Done: Built on branch session/17-private-test-copies (not merged), 2026-11-11: run-dev.sh runs every test copy in a private home (~/.cache/youcoded-test-copies/<profile>/home); Claude Code, ChatGPT and saved API keys are lent by default and each can be switched off per launch (--without); only the short-lived pass is lent, never the renewal key. Proven with a real window: a chat answered in the test copy while the real chat list, settings, providers, themes and keychain entries stayed identical.
Next: Destin reviews the branch. Open choices for him: GitHub is OFF by default (--with github lends it); a test copy starts like a fresh install (no real themes or plugins). Not proven: a ChatGPT message (status showed signed in), a pass running out mid-test, Windows/macOS.
Blocked: nothing

See also #127: 127's item (d), a dev copy of the app syncing the same Personal folder as the real app, is one of the dev-instance-touches-the-real-app faults listed in 17.

Chats
- 2026-11-12 session/17-private-test-copies: chat started
- 2026-11-12 session/17-private-test-copies: chat started

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-09-05)
Dev instance: 11 faults where it touches the real app or its launcher fails. (a) a dev instance writes its pinned-pages list into the real Personal folder under a fake device id, which can sync to other devices; (b) removing a provider in a dev window removes it from the real app; (c) picking a theme in a dev window (or a connected phone) changes the live app's next theme; (d) the cross-device sync state file is shared, so two apps can write it at once; (e) a dev window silently rewrote the real app's engine settings (backend flipped to "rocm" overnight); Destin decides which files a dev instance shares before any build; (f) wanted: a dev instance that starts signed in with the real app's keys and a borrowed ChatGPT sign-in; Destin: "it's sometimes annoying to add separate api keys and such for a quick test"; (g) Stop lists the dev instance's own `claude` children without marking them; (h) the launcher has no reliable stop and leaves its Vite server (even on port 5173) holding a port, so the next launch dies; (i) a bad `--offset` fails late with a bare "Port in use" naming nobody; (j) three copies of "which checkout?" each know different layouts; the launcher's own copy is the odd one

Merged in #218 "Dev instances share the real youcoded-defaults.json"
Progress
Done: nothing yet.
Next: decide with Destin whether this folds into card 17 (the dev-copy isolation card). If kept separate, plan how a test copy gets its own settings file.
Blocked: nothing.

Chats
