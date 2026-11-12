---
status: draft
date: 2026-10-08
type: investigation
topic: master-plan
---

# Where every desktop file lives: parts, systems, layers

Rules: `scripts/command-center/parts.rules.json`. Checker: `node scripts/command-center/parts-check.mjs [--json|--summary]`; `bash scripts/command-center/parts-check.test.sh` fails if any file has no rule. Follow-on to `2026-10-08-system-map-groupings.md`, which found MAP.md covers only 39% of files.

## Method
1. Listed every `.ts/.tsx` file under `youcoded/desktop/src` (1311 files, 315,259 lines, tests included; tests are placed with the file they test) and every Kotlin file under the Android app (85 files).
2. Wrote ordered rules (first match wins, most specific first; folder-wide catch-alls last). Evidence, in this order: (a) the `paths:` lists in `.claude/rules/*.md`; (b) MAP.md row entry points; (c) the screen chain: the screens the UI workbench names (chat, settings, marketplace, pages, projects, app) and the components each mounts; (d) the bridge: `main/ipc/<domain>.ts` is one file per domain, and the domain names the part for its handler and its callers; (e) folder and file-name prefixes.
3. Each rule carries a one-line `why` starting with its evidence tag: [rules:...], [MAP:...], [screen...], [bridge], or [folder]. A rule tagged [folder] alone, or one where two sources pointed different ways, is "doubtful" and listed below.
4. Iterated until the checker reported 0 unmatched desktop files and 0 unmatched Android files.

Result: 124 parts (3 of them empty safety nets), 614 rules, 107 flagged doubtful. The checker prints 18 notes where a specific rule deliberately overrides a wider one; they are intended.

## Coverage
Desktop: 1311 files, 315,259 lines. Android: 85 files.

| System | Files | Lines |
|---|---|---|
| chat-agents | 588 | 156,274 |
| foundations | 281 | 61,970 |
| projects-files | 234 | 52,155 |
| workshop | 84 | 25,014 |
| marketplace | 80 | 19,766 |
| sync-devices | 76 | 19,670 |
| social | 33 | 7,008 |
| pages | 20 | 3,986 |

| Layer | Files | Lines |
|---|---|---|
| screens | 646 | 146,346 |
| backend | 488 | 131,523 |
| shared | 93 | 12,376 |
| android | 85 | 30,584 |
| devtools | 84 | 25,014 |

Per part (top 25 of 124):

| Part | Files | Lines |
|---|---|---|
| workbench | 59 | 19,952 |
| chat-view | 43 | 10,320 |
| artifact-views | 40 | 5,667 |
| app-shell | 38 | 9,731 |
| ui-primitives | 38 | 4,870 |
| harness-tools | 34 | 8,406 |
| chat-input | 32 | 7,327 |
| games-arcade | 28 | 6,250 |
| providers | 27 | 5,509 |
| attention-prompts | 25 | 3,410 |
| native-runtime | 24 | 9,678 |
| local-models | 23 | 10,328 |
| office | 23 | 5,072 |
| session-strip | 23 | 7,285 |
| marketplace-screens | 23 | 5,467 |
| projects-contract | 23 | 2,193 |
| android-runtime | 23 | 12,435 |
| claude-code-link | 22 | 4,071 |
| document-comments-ui | 22 | 4,978 |
| sync-spaces | 21 | 5,557 |
| session-manager | 20 | 5,849 |
| harness-eval | 20 | 4,604 |
| buddy-ui | 20 | 3,984 |
| project-view | 20 | 6,299 |
| chat-state | 20 | 7,844 |

Full per-part table: `node scripts/command-center/parts-check.mjs --summary`.

## Unsorted list
None. Every file was placed. Three empty catch-all parts exist (`unsorted-components`, `unsorted-state`, `unsorted-hooks`) so any new loose file in those folders lands visibly in an unsorted part ("no evidence; needs owner decision") instead of silently taking a guessed home. System and layer tables include the 85 Android files.

## Doubtful placements (for the owner deck)
Two kinds. Part A: two or more evidence sources disagreed. Part B: the only evidence is a folder or file name. Layer is never in doubt (it follows the folder: renderer = screens, main = backend, shared = shared).

## Part A: evidence disagreed

### 1. harness-eval (now: Workshop, 20 files)
- Candidates: Workshop / Chat and agents
- What it is: Scoring rig that compares how well different models drive the native assistant.
- Evidence: It is a scoring tool for the assistant engine: dev-only (workshop) by use, but lives inside the engine folder and tests the engine (chat-agents).
- Evidence trail on the current placement: [rules:harness-evaluator.md] paths: main/harness/eval/**

### 2. conversation-handoff (now: Sync and devices, 12 files)
- Candidates: Sync and devices / Chat and agents
- What it is: Moves a live conversation from one device to another.
- Evidence: These files hand a live conversation from one device to another, so they are about devices (sync-devices); but the thing being moved is a chat (chat-agents), and the MAP puts them in the same row as the chat store.
- Evidence trail on the current placement: [rules:conversations.md]+[MAP:Conversation handoff] handoff-*, lease, takeover move a chat between devices

### 3. providers (now: Chat and agents, 27 files)
- Candidates: Chat and agents / Foundations
- What it is: Sign-in and secret storage for cloud AI services, and the catalog of their models.
- Evidence: Keychain and secret-storage files hold passwords for everything, not just AI services, so they could count as app foundations. They are placed with AI sign-ins because every caller found is a provider sign-in.
- Evidence trail on the current placement: [folder] main/providers; IPC chatgpt/openrouter/provider

### 4. remote-access (now: Sync and devices, 13 files)
- Candidates: Sync and devices / Foundations
- What it is: Lets your phone or a web browser use the app running on your computer.
- Evidence: remote-server.ts is the door every phone and browser uses and sits beside the main bridge; placed under devices because its only purpose is remote access.
- Evidence trail on the current placement: [MAP:Remote access] remote-server/remote-config/remote-devices; phone-read-deny/upload-store serve phone reads

### 5. claude-code-link (now: Chat and agents, 22 files)
- Candidates: Chat and agents / Foundations / Marketplace
- What it is: Connects YouCoded to Claude Code: its settings, hooks, built-in commands and prompts.
- Evidence: Hook and MCP reconcilers install small files into Claude Code; they behave like installers (marketplace) or app plumbing (foundations), but their whole job is keeping Claude Code wired to the chat.
- Evidence trail on the current placement: [MAP:Claude Code hooks / prompts] file-name prefix claude-code-/hook-/command-

### 6. claude-code-link (now: Chat and agents, 22 files)
- Candidates: Chat and agents / Foundations
- What it is: Connects YouCoded to Claude Code: its settings, hooks, built-in commands and prompts.
- Evidence: Claude Code hook and prompt plumbing. MAP lists hooks as Foundations; the rules file groups them with Claude Code prompts which the chat screen shows.
- Evidence trail on the current placement: two evidence sources disagree

### 7. github-connection (now: Marketplace, 5 files)
- Candidates: Marketplace / Projects and files / Sync and devices
- What it is: Links your GitHub account so you can share your work.
- Evidence: Linking GitHub is used to publish skills (marketplace), to back up projects (devices) and to read repositories (files). It is placed with the marketplace because github-fork-publish.ts is the heaviest user.
- Evidence trail on the current placement: [bridge] ipc/github.ts; files github-auth/client/connect/fork-publish

### 8. conversation-store (now: Chat and agents, 13 files)
- Candidates: Chat and agents / Foundations
- What it is: Saves conversation titles, tags and records on disk.
- Evidence: Tiny helpers for turning folder paths into conversation ids; used by several backends.
- Evidence trail on the current placement: [folder] conversation slug/path helpers

### 9. app-shell-backend (now: Foundations, 9 files)
- Candidates: Foundations
- What it is: Starts the app, makes the windows, handles quitting and the operating system.
- Evidence: Generic file-writing and request-sharing helpers with no feature of their own.
- Evidence trail on the current placement: [folder] generic main-process helpers; no domain

### 10. buddy-ui (now: Chat and agents, 20 files)
- Candidates: Chat and agents / Foundations
- What it is: The small floating companion window that shows your assistant and its mascot.
- Evidence: The mascot drawing code is also used by themes (a theme can bring its own mascot) so it could be theming (foundations).
- Evidence trail on the current placement: [rules:buddy-floater.md]+[screen] settings/buddy

### 11. guide-tour (now: Foundations, 8 files)
- Candidates: Foundations / Chat and agents
- What it is: The tips and walkthrough that teach new people the app.
- Evidence: The tips tour points at parts of the chat window, but teaches the whole app.
- Evidence trail on the current placement: [folder] components/guide; HelpPopup launches it

### 12. development-popups (now: Foundations, 8 files)
- Candidates: Foundations / Marketplace
- What it is: Report a bug and contribute, from inside the app.
- Evidence: Bug report and contribute popups are about improving the app itself. Contribute also publishes to GitHub, tying it to the marketplace.
- Evidence trail on the current placement: [screen] settings/development/*; bug-report

### 13. chat-input (now: Chat and agents, 32 files)
- Candidates: Chat and agents / Projects and files
- What it is: The box where you type and send a message, plus attachments, queued messages and the stop button.
- Evidence: FolderSwitcher chooses the folder a chat works in (files) but is opened from the chat input.
- Evidence trail on the current placement: [screen] chat/quick-chips; InputBar mounted only by chat

### 14. bridge-contract (now: Foundations, 7 files)
- Candidates: Foundations / Chat and agents
- What it is: The single list of requests between screens and the app, and their shapes.
- Evidence: shared/types.ts mixes chat message shapes with app-wide ones; the bridge list is app-wide. Placed in foundations because the bridge serves every system.
- Evidence trail on the current placement: [rules:ipc-bridge.md] lists shared/backend-contract.ts; channel-types files named by bridge table

### 15. shared-utils (now: Foundations, 3 files)
- Candidates: Foundations
- What it is: Small helpers used everywhere: versions, time, text.
- Evidence: Small helpers (text matching, plural, time) used by several systems.
- Evidence trail on the current placement: [folder] shared/ loose files without a domain

### 16. games-arcade (now: Social, 28 files)
- Candidates: Social / Foundations
- What it is: The built-in games, leaderboards and playing against friends.
- Evidence: The arcade (four games, leaderboards, playing a friend) is a social feature to the owner, but no screen family in the preview tool mounts it and its files sit in their own folders. Social: leaderboards and head-to-head play are about other people. Foundations: nothing else in the app depends on it. Chat: none.
- Evidence trail on the current placement: two evidence sources disagree

### 17. marketplace-account (now: Marketplace, 2 files)
- Candidates: Marketplace / Social / Foundations
- What it is: Your community account: sign-in tokens and profile.
- Evidence: Your community account is needed to like, review, publish and (maybe) join the arcade. Marketplace: the account screens and sign-in tokens are created by the marketplace server calls. Social: the same account identifies you to friends. Foundations: Settings has an Account page.
- Evidence trail on the current placement: two evidence sources disagree

### 19. skill-library (now: Marketplace, 5 files)
- Candidates: Marketplace / Chat and agents
- What it is: Finds, shares and stores the skills installed on this computer.
- Evidence: Installed skills are browsed in the marketplace and run inside chat. Marketplace: the code scans, shares and stores skills that came from the marketplace. Chat: a skill is only used by typing it into a conversation.
- Evidence trail on the current placement: two evidence sources disagree

### 20. office (now: Projects and files, 23 files)
- Candidates: Projects and files / Marketplace
- What it is: Runs the Office document editor.
- Evidence: Word, Excel and PowerPoint editing is an add-on download. Projects and files: the owner sees it as opening a document. Marketplace: it is a separate add-on that is fetched and pinned like a plugin.
- Evidence trail on the current placement: two evidence sources disagree

### 21. voice-engine (now: Chat and agents, 6 files)
- Candidates: Chat and agents / Foundations
- What it is: Turns speech into text on your computer.
- Evidence: Speech-to-text is a microphone feature. Chat: the only screen that uses it is the message box. Foundations: it is a general capability with its own downloads and settings.
- Evidence trail on the current placement: two evidence sources disagree

### 23. settings-screens (now: Foundations, 15 files)
- Candidates: Foundations / Chat and agents / Sync and devices
- What it is: The Settings window and its pages.
- Evidence: The Settings window mixes pages for every system. Foundations: one window, one shell. Chat: the biggest pages (Assistant, Permissions, Models) are about the assistant. Devices: Sync and Remote pages. The file placement follows the window; the pages inside could be split per system.
- Evidence trail on the current placement: two evidence sources disagree

### 24. sync-service (now: Sync and devices, 6 files)
- Candidates: Sync and devices / Projects and files
- What it is: The older sync and backup machinery and its error handling.
- Evidence: Older sync/backup files outside the sync-spaces folder. Sync-spaces rule file lists them, so they are devices; but they also handle snapshots of project files.
- Evidence trail on the current placement: two evidence sources disagree

### 25. status-data (now: Chat and agents, 3 files)
- Candidates: Chat and agents / Foundations
- What it is: Collects the usage and health numbers shown in the status bar.
- Evidence: Usage and cost numbers. Status-bar rule file lists main/harness/pricing.ts; pricing data is engine-side (chat) but displayed in a bar that every conversation has.
- Evidence trail on the current placement: two evidence sources disagree


## Part B: placed by name only

### 18. marketplace-account (now: Marketplace, 2 files) - folder or file-name only
- What it is: Your community account: sign-in tokens and profile.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/marketplace-auth-store.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 22. voice-engine (now: Chat and agents, 6 files) - folder or file-name only
- What it is: Turns speech into text on your computer.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/voice/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 26. harness-askpass (now: Chat and agents, 6 files) - folder or file-name only
- What it is: Safely asks you for an admin password when the assistant needs one.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/harness/askpass/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 27. harness-search (now: Chat and agents, 8 files) - folder or file-name only
- What it is: Web search for the native assistant and where its search keys are kept.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/harness/search/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 28. harness-prompts (now: Chat and agents, 5 files) - folder or file-name only
- What it is: The standing instructions the native assistant is given.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/harness/prompts/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 29. chatsearch-index (now: Chat and agents, 11 files) - folder or file-name only
- What it is: Builds the searchable index of all your past conversations.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/chatsearch-index/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 30. document-comments (now: Projects and files, 16 files) - folder or file-name only
- What it is: Reads and writes comments inside Word, Excel and other documents.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/doc-comments/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 31. git-service (now: Projects and files, 6 files) - folder or file-name only
- What it is: Reads the state of a project git history.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/git/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 32. page-runtime (now: Pages, 4 files) - folder or file-name only
- What it is: Stores, serves and refreshes Pages and keeps their data.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/pages/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 33. project-context (now: Projects and files, 8 files) - folder or file-name only
- What it is: Understands a project: its folders, repository and instructions.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/project/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 34. updates (now: Foundations, 11 files) - folder or file-name only
- What it is: Downloads and installs new versions of the app.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/__tests__/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 35. theming-backend (now: Foundations, 6 files) - folder or file-name only
- What it is: Loads, watches and converts theme files.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/theme-*.ts`, `main/local-theme-synthesizer.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 36. app-logging (now: Foundations, 6 files) - folder or file-name only
- What it is: Logs, crash reports and timing marks.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/logger.ts`, `main/crash-diagnostics.ts`, `main/perf-marks.ts`, `main/performance-config.ts`, `main/startup-dialog-log.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 37. platform-support (now: Foundations, 7 files) - folder or file-name only
- What it is: Differences between Windows, Mac and Linux.
- Placed by name alone, no rules-file, MAP or screen evidence: `main/platform.ts`, `main/electron-platform.ts`, `main/kde-dbus.ts`, `main/kwin-helper.ts`, `main/mac-icon-look.ts`, `main/windows-taskbar-icon.ts`, `main/app-icon.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 38. context-menu (now: Foundations, 9 files) - folder or file-name only
- What it is: The right-click menu.
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/components/context-menu/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 39. voice-input (now: Chat and agents, 4 files) - folder or file-name only
- What it is: The microphone button that turns speech into a message.
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/components/VoiceButton.tsx`, `renderer/voice-capture.ts`, `renderer/hooks/useVoiceInput.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 40. app-shell (now: Foundations, 38 files) - folder or file-name only
- What it is: The window itself: header, menus, startup, errors and layout on narrow screens.
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/components/MovedGate.tsx`, `renderer/components/InitializingCover.tsx`, `renderer/components/TrustGate.tsx`, `renderer/components/RuntimeBinding.tsx`, `renderer/state/startup-dialog-store.ts`, `renderer/state/welcome-back.ts`, `renderer/state/drawer-*.ts`, `renderer/state/hook-dispatcher.ts`, `renderer/state/on-screen-context.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 41. attention-prompts (now: Chat and agents, 25 files) - folder or file-name only
- What it is: The banners and cards that stop and ask you something (pick an option, approve a plan, answer a question).
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/utils/blocked-send-toast.ts`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 42. renderer-utils (now: Foundations, 9 files) - folder or file-name only
- What it is: Small shared helpers for screens: time, sounds, announcements.
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/utils/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 43. marketplace-state (now: Marketplace, 6 files) - folder or file-name only
- What it is: Remembers what the marketplace screens have loaded and what you favorited.
- Placed by name alone, no rules-file, MAP or screen evidence: `renderer/data/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 44. android-parser (now: Chat and agents, 7 files) - folder or file-name only
- What it is: Android reading of conversation files.
- Placed by name alone, no rules-file, MAP or screen evidence: `app/src/main/kotlin/com/youcoded/app/parser/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 45. android-skills (now: Marketplace, 13 files) - folder or file-name only
- What it is: Android version of skills and the marketplace.
- Placed by name alone, no rules-file, MAP or screen evidence: `app/src/main/kotlin/com/youcoded/app/skills/**`, `app/src/main/kotlin/com/youcoded/app/marketplace/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

### 46. android-app (now: Foundations, 13 files) - folder or file-name only
- What it is: The Android app built around the same screens.
- Placed by name alone, no rules-file, MAP or screen evidence: `app/src/main/kotlin/com/youcoded/app/*.kt`, `app/src/main/kotlin/com/youcoded/app/ui/**`, `app/src/main/kotlin/com/youcoded/app/util/**`, `app/src/main/kotlin/com/youcoded/app/analytics/**`, `app/src/main/kotlin/com/youcoded/app/social/**`
- Other candidate: whichever system owns the feature whose name the files share; confirm the part is where the owner expects.

