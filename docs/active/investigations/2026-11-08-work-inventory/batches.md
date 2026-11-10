---
status: draft
---
# Open cards sorted three ways (2026-11-10)

**Status:** Destin called this "roughly right" in chat on 2026-11-10 and chose to work through it slowly, wave by wave. Individual placements may still change. It replaces the 14-area sorting in `workstreams.md`, which he did not approve.

## What Destin said about grouping and supervisors

- Opening request (2026-11-09): consolidate open cards into session-scoped tasks for agents working in the same subject area, and hand related work to supervisor agents with strong helpers.
- Deck answer Q-13: changes that affect the same code, screens or user flows belong together so one supervisor can weigh them; split a grab-bag card only if its contents are genuinely unrelated.
- Chat, 2026-11-10: a handful of mostly autonomous sessions should clear most cards (fixes, pre-approved improvements, optimisations, research). Major screen or flow changes and big features that need iterative design stay out. Bigger feature builds that are mostly finished are also held until he has tested them, even when no product choice is left.
- Chat, 2026-11-10: the one-branch rule means a feature he names at the start of a session stays on one branch inside that session unless he approves otherwise.
- Chat, 2026-11-10: quick work that is vital to a safe next release is split out and started first.

Not from him, and not adopted: one supervisor per broad area, per-area briefs, an area label on cards, and landing everything at the end.

## Order

| Wave | Sessions | Why together |
|---|---|---|
| 1 | Batch 1, Batch 7, Batch 5 | Three separate places: the chat, the developer tools, the servers. |
| 2 | Batch 2, Batch 4 | Chat fixes build on what Batch 1 confirmed; files and sync are separate from chat. |
| 3 | Batch 3, Batch 6 | Speed numbers mean something only after the fixes; wording goes last so it does not collide with fixes on the same screens. |
| Later | Phone follow-ups | After the held Android branch lands. |

Each session works on one branch, reports every user-visible change, leaves MIXED parts on the card, and lands nothing without his word. A held branch is best tested before the batch that overlaps it starts.

## The sort

The test applied to each card, as agreed in chat on 2026-11-10:

1. Does it need a new design or a product choice from Destin? Then it is **design-first**.
2. If not, would it noticeably change how the app looks or behaves in a way he has not seen or approved? Then it is **hold for testing**.
3. If neither, it goes in an **autonomous batch**.

**MIXED** marks a card with both kinds of work: the batch does the plain part and leaves the rest on the card for him.

Sorted from each card's own notes. Sizes were not re-measured.

| Group | Cards |
|---|---|
| Batch 1 — Release safety (start first) | 9 |
| Batch 2 — Chat and engine fixes | 11 |
| Batch 3 — Speed and measuring | 6 |
| Batch 4 — Files and sync reliability | 10 |
| Batch 5 — Security and server | 6 |
| Batch 6 — Look and wording, to the approved guide | 4 |
| Batch 7 — Workspace tools and tests | 16 |
| Phone follow-ups — after the Android branch lands | 6 |
| HOLD — built, waiting for you to test | 6 |
| HOLD — design approved, not built yet | 3 |
| DESIGN-FIRST — stays out of the batches | 64 |
| YOUR CALL OR YOUR HANDS — no agent work yet | 12 |

## Batch 1 — Release safety (start first)

**Done 2026-11-10** (session `release-safety`; app PR #726 and the workspace branch of the same name, landed on Destin's word). Fixed: #146, the #35 log part, #220's one confirmed fault. Retested and passed: #10, #7's long-message case, #88's warning (cards stay open for the parts no retest could cover). #62's queued-message edit still fails on YouCoded's own engine and was handed to the #246 session. #176 waits for Destin (explanation: `docs/active/investigations/2026-11-10-unknown-model-size-explained.md`); #238 waits for the Mac tester. His answers came through the wave-1 deck, so the session's own questions deck (`docs/archive/design/2026-11-10-release-safety/`) has no answers file.

Quick checks and small fixes that protect the next release. No screen is redesigned. Touches: chat view, custom models, Office error log, updates. Checked against the code on 2026-11-10. The crash-recovery change left over from #163 is NOT here: it is a 6-file change to how a reopened chat is repaired, not a wording fix, and belongs in Batch 2 after a review.

- **#7** Chat view glitches: vanishing, stuck or misdrawn messages — Retest the long-message case. The reload case is #146. The floating-item overlap has no test, so this card will not fully close on a retest.
- **#10** Question and approval cards that stick or vanish — Retest; close or confirm.
- **#62** Chat on YouCoded's own engine: eight small faults — Retest the queued-message edit; the other small faults go to Batch 2.
- **#88** Two small items: a warning and a community link — Retest the stray warning (hard to stage: needs many chats arriving at once); the website-link choice stays yours.
- **#220** Check native sessions for commands stuck showing Running — Nothing fixed yet. Check restored and never-ending background commands on the native engine; fix what is found.
- **#146** Reload returns to the wrong chat — Fix: after a reload, return to the chat you were on. Checked 2026-11-10: still open, cause at App.tsx:1909, one to two hours.
- **#176** Custom AI models: long chats fail, and the app can't offer to shorten them — MIXED. Gap 1 (unknown hosted models assume a 250k size): a lower default means summaries arrive sooner, so the number is your choice. Gap 2 needs a real endpoint's error text and stays parked until one is captured.
- **#35** Office editor: faults, safety and privacy gaps — Only the part where the error log copies document text. The rest is in Batch 4.
- **#238** A Mac that tested the betas landed on 1.3.1 after 1.3.3 was out, and has stayed there — Checked 2026-11-10: reading the code cannot settle it; the code says that Mac should have been offered 1.3.3. Needs that Mac's log, so the session only prepares what to ask the tester for.

## Batch 2 — Chat and engine fixes

Faults in chats and in YouCoded's own engine. Touches: chat view, permissions, native engine.

- **#4** Conversation names: four loose ends — Retests only. Item (a) is your product choice and is left alone.
- **#11** Claude Code connection: five small faults — Items (a), (b), (e): tell the user when a settings file is replaced or a change is skipped; refresh the old Claude Code test recordings.
- **#66** Assistant tools and permissions: faults and unclear "Always allow" — The four code faults. MIXED: adding a Skip Permissions option to local and OpenRouter chats is a new control, so it comes to you first.
- **#69** Cut cloud model costs in long chats — Measuring and research only. MIXED: any new warning in the model picker is yours to approve.
- **#148** Native sessions stop before the job is done, and say it is still going — Retest. Needs a small paid run, so your OK on spending first.
- **#190** Resume and Welcome back preview: the pinned title card covers the first line of a short chat — Fix: the pinned title card covers the first line of a short chat.
- **#194** Message-box attachment cards show no image preview in the dev window, on phones and on Android — Fix: attachment cards show no picture preview.
- **#106** Terminal: rough edges and lag with many sessions open — Retest the three terminal faults, then fix what is confirmed.
- **#45** Downloads: one shared downloader, with Gemma's licence shown — MIXED: showing Google's Gemma licence on the download screen is small and may be required, but it is a visible addition, so you approve the wording. Merging the three downloaders stays on hold by you.
- **#210** Buddy tray icon stays after turning Minimize to tray off (Linux) — Linux: the buddy tray icon stays after it is turned off. Cause known; the fix adds a small library.
- **#143** Small missing conveniences and wording fixes — Check each item still happens. MIXED: new conveniences (right-click menu, recent folders) are small features; listed for your yes/no, not built.

## Batch 3 — Speed and measuring

Measure first, then fix only what the numbers show. Nothing here should change how a screen looks.

- **#94** Switching sessions and typing still feel slow — Re-measure switching and typing. MIXED: the switch animation look is yours and is not touched.
- **#96** Speed testing: unmeasured cases, misleading tools, other systems — Fill the unmeasured cases that can be run here; Windows, Mac and phone need real machines.
- **#100** Themes and animations may cost too much power — Cap runaway theme animations; measure the card-grid cost. MIXED: default effects on weaker computers is your decision.
- **#101** Files and Office editors: slow cases — Re-measure the slow Office and file cases, then fix the worst two or three.
- **#109** Make the app open faster — Re-measure launch time, then load rarely used screens later.
- **#173** Explore loading long chat history in smaller pieces — Research only: report whether loading long chats in pieces is still worth it.

## Batch 4 — Files and sync reliability

Lost-work and sync faults. Touches: file viewer, Office editor, sync.

- **#34** Files and Office saving: ways work can be lost — Investigate and plan first, then fix the cases with one obvious right answer. MIXED: anything that adds a prompt or changes saving behaviour comes to you.
- **#33** Search stops early in big projects — MIXED: making search complete is plain work; how results past 200 are shown is a design choice for you.
- **#35** Office editor: faults, safety and privacy gaps — The safety and privacy gaps. The seven cosmetic faults are retested and listed.
- **#39** Document comments: two small gaps — Show the exact time on hover (small). The phone part waits for a real phone.
- **#161** Keep malicious Word files from freezing document previews — Update or cap the Word preview parser so a crafted file cannot hang the app.
- **#227** OneDrive files on Windows: opening a folder downloads online-only files and freezes the app — OneDrive on Windows: plan and fix the freeze. Needs a Windows machine to confirm.
- **#229** The 'Syncing…' sign disappears before the sync has actually finished — Fix: the "Syncing…" sign goes away too early.
- **#127** Sync: six leftover cleanups and rare edge cases — The decided cleanups (ignore stray temporary files, stop reading the old index).
- **#98** Sync: growth, very long chats and the first download — Piece 1 has a written plan and waits for your go-ahead; no screen change.
- **#121** Sync conflicts and the Backup & Sync panel's wording — Retests only. MIXED: how you choose between conflicting copies is a design choice for you and is left on the card.

## Batch 5 — Security and server

Security gaps with no intended screen change. Touches: sync server, marketplace server, connectors.

- **#124** Sync security: three gaps that could expose secrets — Close the gap where one device could pose as another in sync.
- **#43** Games: a cheater can fake a win when you go offline — The rate-limit fix now. MIXED: how to stop fake forfeit wins is your decision.
- **#51** Marketplace: listing, install and admin faults, and the "Likely safe" badge — Split into three as the card says; fix install faults. MIXED: listings and the "Likely safe" badge change what users see and come to you.
- **#55** Accounts: sign-in loophole and silent sign-outs — Fold the remaining part into #216 and close.
- **#216** Phone sign-in expiry: owner notice and retry after an 'expired' answer — MIXED: whether the owner is told when a phone is signed out is your decision; the build is small after that.
- **#223** Google Messages connector: rebuild its Windows program with the patched security library — Rebuild the Google Messages connector with the patched library.

## Batch 6 — Look and wording, to the approved guide

Only changes the design guide and the error-message standard already call for. These ARE visible, so the report lists every one. Touches: settings, marketplace, project view, error messages across the app.

- **#135** Shared look: app hover hints, readable contrast, screens that don't match — Convert the remaining plain hover hints. MIXED: contrast colours and button alignment are your deferred decisions.
- **#134** Error messages still guess at causes — Error-message batches 2 onward, to the written standard. Large. Every changed message is listed for you.
- **#130** Themes: display faults, checks and ideas — Fix the drawn preview for self-built themes; re-run the contrast check. Ideas are left alone.
- **#142** Dialogs, help bubbles and window drag: three fixes — Check the help bubbles. MIXED: the dialog closing behaviour is your choice.

## Batch 7 — Workspace tools and tests

Tools that agents and tests use. Nothing here ships to users.

- **#13** Unreliable tests and test cleanup — Fix the unreliable tests; clean up leftovers.
- **#15** Eight behaviors no automatic test protects — Turn the gaps that still matter into tests. Two items need your call.
- **#16** First-time setup untested on Linux, Windows, Mac — First-run checks on the Linux packages; speed up the Mac test machine.
- **#17** Test copies of the app can change the real one — MIXED: you decide what a test copy may share with your real app; then the fix. Now includes the old #218 (test copies writing your real new-session defaults).
- **#18** Screenshot and review-page tools: ten faults — Retest the review-tool faults; fix what is confirmed.
- **#19** Workspace tools: annoyances, docs upkeep and ideas — Close finished items; move the rest to the right cards.
- **#22** Six ways a work session's progress can go missing — The remaining ways session work can be stranded.
- **#29** Release pipeline: faster test runs, bug-fix releases, build upkeep — MIXED: keep or drop the test-speed experiments (PR #272) is your decision; one real timing run first.
- **#151** Code tidy-ups left from older reviews — Tidy-ups 3 and 4. Item 5 needs your delete-or-keep.
- **#175** Make the website's idea pictures refresh themselves on each release — Website idea pictures refresh on release.
- **#178** Made-up demo chats show "Jul 29, 2025" under every message — One shared date for the made-up demo chats.
- **#195** A checked secrets-scan command to run before every push — A push cannot run unless the secrets scan passes.
- **#196** shoot --check: Pages kit menu-open screen still times out under machine load — Retest; fix if it still times out.
- **#209** A script to drive a real dev window's Claude Code chat for testing — A script to drive a test window's Claude Code chat.
- **#239** The Analytics page has no change history and no shared test stand-in — Change history and a test stand-in for the Analytics page.
- **#186** List YouCoded in the Arch package collection (AUR) — Arch package: say "update with your package manager"; publishing waits on an AUR account.

## Phone follow-ups — after the Android branch lands

Autonomous-type work, but it touches the same phone screens as the held Android branch (#213) and most of it needs a real phone. Starting it earlier would collide.

- **#99** Phone watching a chat: wasted work, slow and garbled starts — Real-phone checks, then fixes.
- **#113** Remote access: three ideas left as they are — Real-phone checks only.
- **#182** Phone app keeps disconnecting; can't refresh or send — Real-phone test. MIXED: the status messages ("your computer is asleep") are yours to approve.
- **#139** Phone-width and touch screen polish: three groups — Whatever #213 and #235 did not already cover.
- **#205** Phone access: the assistant's browser asks for approvals you can't see — Rebuild the phone approval card on current code; the old branch is stale.
- **#117** Phone voice and microphone: three gaps — Part (b) retest. Part (a) waits on #115.

## HOLD — built, waiting for you to test

Finished or nearly finished on its own branch. Nothing lands until you have tried it. While it waits, the batches named keep changing the same parts of the app, so the longer the wait the more catching-up it needs.

- **#213** Android test findings: startup crash, sync, attach, phone screens and polish — Android test fixes, 60 changes. Collides with: Batch 6, Phone follow-ups.
- **#177** Android shows the Local models settings page, which can't work on a phone — Ships inside #213.
- **#226** Local engine fixes and improvements — Local engine fixes. Collides with: Batch 2.
- **#232** The assistant tells you when it needs you (notify user) — The assistant tells you when it needs you. Collides with: Batch 2.
- **#235** Phone-width and narrow-window layout: the decided screens, built for real — Phone-width and narrow-window screens. Collides with: Batch 6, #213.
- **#219** Rebuild the Android app once Alpine patches its Node.js — Done on master; only the real-phone check at the 1.4 release remains.

## HOLD — design approved, not built yet

You already answered the design questions, so no new choice is needed, but each is a big visible change. Each gets its own session and waits for your test before landing.

- **#47** Model picker: empty on new devices, and speed/cost tags — Speed and cost tags in the model picker (decks answered 2026-09-11).
- **#236** Working offline, sign-in expiry and the startup menu: the decided behaviour — Working offline, sign-in expiry and the startup menu, as decided.
- **#217** Move file previews and Pages to their own walled-off address — File previews and Pages on their own walled-off address (you said yes 2026-10-31). Should look the same, but it is deep enough to test first.

## DESIGN-FIRST — stays out of the batches

Needs a design or product choice from you, or is a big feature. Each is its own session with you in the loop.

- **#1** Rebuild the Android app to match desktop — Android rebuild, next phases. Running in its own session.
- **#90** Pages: the next phases and seven follow-ups — Pages next phases; waits on your step-4 deck.
- **#202** Sharing pages, phase 2: publish without GitHub, versions and forks, update-my-version, AI reviewer — Waits on #90.
- **#203** Pages on the Android app: folder and all-files access
- **#204** Pages file chooser: real thumbnails for every picture — Waits on #90.
- **#3** Past conversations: browse, search and organize
- **#230** Manage a past chat from its search result: rename, tags, note, mark complete
- **#222** Rearrange the main chat window (e.g. a sidebar list of chats instead of the top bar)
- **#12** Ideas: five more Claude Code features
- **#92** Offer a plain terminal when starting a session
- **#38** File viewer and files pane: missing file kinds and ideas
- **#41** Track files Claude changes by running commands — Waits on your deck.
- **#154** Keep unseen deliverables easy to find
- **#57** "No folder" chats and a built-in "Your Assistant" project
- **#59** YouCoded's own engine matches Claude Code, with a tool-connections screen
- **#75** Choose skills and tools per project — Backend can be reused; the screens get redone.
- **#77** A home for skills when you don't use Claude Code
- **#61** Agents & Automations: work that runs on a schedule
- **#63** Ideas for the assistant, its helpers and its tools
- **#64** Ideas: YouCoded Mesh and Cloud — Waits on your round-3 deck.
- **#70** Settings you can't change yet, including the helper limit
- **#71** Helpers: permissions, reports, cost and leftover records
- **#74** Helper plans: approve a multi-step job up front — Waits on your answer to the rev-3 plan.
- **#86** Parked ideas: seven features not started
- **#197** Easy version history and separate working folders for each session
- **#198** Fully isolated zero-context chats and helpers (incognito, independent reviewers)
- **#199** Many more helpers per session, working in parallel
- **#164** Continue one conversation across Claude Code and the native engine
- **#87** Assistant's web browser: eight follow-ups
- **#112** Phone and computer parity: four gaps left
- **#114** Remote setup: clearer screen and why the phone can't connect — Needs your Keep awake design.
- **#115** Build the approved secure phone connection option
- **#118** Phone browser: missing theme pictures and blank loads
- **#119** Reach your computer by signing in, without Tailscale
- **#225** Marketplace that fits a phone, like an app store
- **#89** Explore a YouCoded app for iPhone
- **#125** Same chat on two computers: warnings and takeover ideas
- **#155** Connect Google and work with selected Drive files — Paused on rclone versus own sign-in.
- **#156** Add Google Calendar to connected accounts
- **#157** Add Gmail without delaying Google files
- **#158** Extend connected accounts to Microsoft and Apple
- **#159** Add contacts and tasks to connected accounts
- **#160** Explore assistant control of desktop apps
- **#206** Bring Signal into YouCoded
- **#133** Make one settings screen for desktop and phone — On hold by you since 2026-09-18.
- **#145** Motion, voice and chat images: five parked ideas
- **#149** Design passes for surfaces left out of the guide work
- **#150** Design guide: six open questions, and tooling so chats follow it
- **#152** App background follows the desktop wallpaper
- **#214** Rebuild and improve the first-run tour
- **#147** Management surface: the next round — Your own work board; needs a review with you.
- **#231** Usage stats: one place that adds up what you used, by day, provider and model
- **#233** X-ray tools for seeing what the assistant is doing (rebuild from scratch)
- **#234** A better assistant persona: adopt the hybrid prompt that won the blind test — Changes how the assistant talks to everyone.
- **#184** Gradual rollout: new versions reach a few installs first
- **#188** Automatic updates: later improvements
- **#174** A public roadmap powered by work cards
- **#228** Google Ads: a small beginner experiment to see whether paid search brings people to YouCoded
- **#52** Marketplace ideas, including the assistant searching it
- **#44** Idea: a laptop's AI key opens the games panel
- **#240** System notifications, built together: a Notifications menu replacing Sound
- **#241** Cloud backup choices: back up chats at all, and lock backups with a passphrase — Waits on #64.
- **#242** Alerts on every device, and notifications you can customise (including automations)
- **#243** A better view for managing and resolving versions of a forked chat — Waits on #64.

## YOUR CALL OR YOUR HANDS — no agent work yet

My addition to your three bins: nothing an agent can do until you decide or do something yourself.

- **#189** Try automatic updates on a real Mac and Windows computer before the next release — Try automatic updates on a real Mac and Windows computer. Release-critical.
- **#221** Server: traffic limits on sign-in, stats and usage-count addresses — One Cloudflare rule, about 10 minutes, guided.
- **#31** Public launch: company paperwork and the Google Play listing — Company paperwork and the Play account.
- **#27** Remove a personal memo from the Office add-on history — Ask GitHub to purge the old memo, or not.
- **#24** Project rules don't always reach work sessions — Accept the workaround and close, or build a reminder.
- **#25** Learn which features people actually use — Scope a usage plan, or close.
- **#104** Slowdown recorder: settings and privacy choices — Two slowdown-recorder choices.
- **#60** Split up the oversized code (chat engine and app shell) — Splitting the oversized code; paused by you.
- **#208** Move Destin's 5 roundup comments to the outside-file store after the #207 update — Move your five comments; needs the app closed or updated.
- **#80** Automate moderating the r/youcoded subreddit
- **#185** YouCoded credit on commits made through the app — Waits on the GitHub account appeal.
- **#82** Share Destin's Z13 tablet setup as a free kit — Not YouCoded; move out.
