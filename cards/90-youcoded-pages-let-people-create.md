---
id: 90
title: Pages: the next phases and seven follow-ups
stage: build
priority: P2
tags: other-features, misc, window-chrome, needs-repro, feature
release: v1.3.2
report: docs/active/plans/2026-09-16-youcoded-pages-phasing.md
branch: 90-youcoded-pages-let-people-create
roadmap: other-features: YouCoded Pages: let people create and install their own nati
created: 2026-10-15
summary: Pages work today; next comes letting pages run assistant tasks, use files and be shared, plus seven follow-ups and decisions.
area: Pages
side: both
work: session/page-start-session, session/ha-pages-connection, session/google-connections-planning, session/90-pages-post-release, session/page-custom-icons, session/90-work-board-loading
vision: pages.agents.attached, pages.connect.files, pages.build.phone
---
Progress
Done: YouCoded 1.3.1 released with Pages chats/program/startSession abilities. Held connections, start-session and chats/program skill updates published in wecoded-marketplace#110 (Page Builder 0.2.0), with corrected permission examples and source-reviewed home-device/socket/video reference. Work board tests passed 9/9; current app master CI passed Linux, macOS, Windows and Android.
Next: Work board installation is queued after natural YouCoded exit via user unit youcoded-work-board-postrelease-131; receipt: /home/destin/.cache/youcoded-postrelease-131/install-result.json. After reopening, approve its chat/program/session permissions and check the board and status-bar repo chip visually. Broader Pages phases/follow-ups remain open.
Blocked: No merge blocker. Work board runtime verification awaits after-exit installation and user approval; no live app mutation performed.

See also #91: 91 is the follow-up list for the YouCoded Pages work in 90.

Chats
- 2026-10-19 session/90-work-board-loading: chat started
- 2026-10-19 session/90-work-board-loading: chat started
- 2026-10-19 session/page-custom-icons: Shipped purpose-designed Page icons: app/source and live embed in youcoded#645 (f1d11a4c9), Page Builder 0.3.0 in wecoded-marketplace#111 with successful registry rebuild. Public browser verified the pinned Home house; public skill source requires new custom artwork. Approved I-1/I-2; final local verifier passed 4,462 related tests, all 403 screens, types/lints/knip/invariants/journeys; required app Linux/Android and plugin CI passed. Real Home manifest already has the approved artwork with a private backup; installed older app keeps its fallback until updated. No app release or installed-plugin mutation. This icon subtask is complete; leave other #90 follow-ups open.
- 2026-10-19 session/page-custom-icons: Custom Page icons implemented locally and visually approved (I-1/I-2). Page metadata now supports validated per-page vector artwork with legacy fallback; Home has the approved house in source/demo and icon-only metadata in its real manifest (older installed app displays fallback until updated). Page Builder 0.3.0 source requires a new purpose-designed icon for every new Page. Integrated verification passed 4,461 related tests plus all other gates; plugin reference/example checks passed. Repo changes are uncommitted and not published; no app release or installed-plugin update.
- 2026-10-19 session/page-custom-icons: Working on the existing Page-icons follow-up: Destin clarified that agents must design a new purpose-specific icon for every Page in the app’s iconography style, not choose from a fixed stock list. Include Home house icons in the actual app and website embed, plus page-builder guidance. No installed-app update or release is authorized by this note.
- 2026-10-18 session/90-pages-post-release: chat started
- 2026-10-18 session/google-connections-planning: Recovered later idea, not implemented scope: unified calendar/to-do Pages across providers, with a local holding space that can show an action waiting for another device (for example Apple Reminders waiting for the Mac). User requested this as a later follow-up; exact queue/sync design is unapproved. Depends on relevant connection capabilities (#156/#158/#159), NOT on syncing credentials. Source: 109a2161:docs/active/design/2026-09-26-everyday-actions/questions.answers.json Q-actions; proposal.md section 6. Preservation only; this session is not building Pages.

From the old roadmap (other-features › misc, status in-flight, seen on all, last checked 2026-09-23)
YouCoded Pages: let people create and install their own native-looking pages, from dashboards and paint studios to specialized assistants, and pin favorites beside Projects. Scope approved (live themes, personal and project pages, marketplace pages, controlled outside access); desktop and paired remote first. Phase 1 (shell, page view, pins, creator skill, page data, floating themes) and Phase 2 (connections and refresh) are on master; Destin tested a live dashboard and a keyed weather page. 2026-10-07: a page's home-device connection (approval with address + key), a live connection for pages, camera video played by the app, see-through page glass and the hand-installed Home Assistant Home page merged (youcoded#611, youcoded-dev#244) (record: docs/archive/handoffs/2026-10-05-home-page-state.md). Next: Phases 3–4 (model tasks, files, marketplace); later, chat-alongside visual editing and durable automation. 2026-10-08: the Money page (Plaid bank connection for pages, bills and subscription review) merged (youcoded#615), kept as Destin's personal page, not for the marketplace. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#16): next phases postponed — "finsih in 1.3.2/1.3.3"

Merged in #91 "Pages: seven follow-ups and decisions"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

See also #90: 91 is the follow-up list for the YouCoded Pages work in 90.

Chats

From the old roadmap (other-features › misc, status needs-verify, seen on all, last checked 2026-10-08)
YouCoded Pages follow-ups: 7 decisions and sightings. (a) The page-builder skill's connections update (plugin 0.2.0) is finished and held until an app release carries Pages Phase 2; merge it in the same step. It must also learn the home-device connection, the live connection, camera video and the see-through background (merged 2026-10-07) before that release. (b) Home page (Home Assistant) follow-ups deferred at the 2026-10-07 merge, never designed: search across devices; selecting several devices at once in Edit; a scenes button on rooms with a single light; see-through glass for Framed-layout themes such as Golden Sunbreak ("i want it to peek through to the real theme background"; only Floating/Minimalist frost today). (c) A page allowed "any website" can rarely still reach a home-network device through a hostile name server; the fix adds a package, so it waits for Destin's OK. (d) A web browser as a page: most big sites refuse to show inside another page, so the app would need a website view. (e) Pages on a phone: nobody designed the narrow layout, and connected pages were never tried over remote access. (f) Pages once turned accent-coloured (Golden Sunbreak, Halftone: "a weird yellow shade") and "its fine now. idk what happened"; not reproduced. (g) Page icons: "page builder skill needs better instructions to build a unique icon for each page that matches its purpose at-a-glance. users utilize these to tell pages apart." The set is nine glyphs, money included; it needs many more, and the skill a rule to pick one no other page uses.

Updated on the old roadmap after the move (master, merged in 2026-10-16)
YouCoded Pages: let people create and install their own native-looking pages, from dashboards
and paint studios to specialized assistants, and pin favorites beside Projects. Scope approved
(live themes, personal and project pages, marketplace pages, controlled outside access);
desktop and paired remote first. Phase 1 (shell, page view, pins, creator skill, page data,
floating themes) and Phase 2 (connections and refresh) are on master; Destin tested a live
dashboard and a keyed weather page. 2026-10-07: a page's home-device connection (approval with
address + key), a live connection for pages, camera video played by the app, see-through page
glass and the hand-installed Home Assistant Home page merged (youcoded#611, youcoded-dev#244)
(record: docs/archive/handoffs/2026-10-05-home-page-state.md). Next: Phases 3–4 (model tasks, files, marketplace); later,
chat-alongside visual editing and durable automation. 2026-10-08: the Money page (Plaid bank
connection for pages, bills and subscription review) merged (youcoded#615), kept as Destin's
personal page, not for the marketplace. 2026-10-14: a page can open the new-session window
with a message waiting (youcoded#623; spec docs/archive/specs/2026-10-14-page-start-session-design.md).
Destin 2026-10-05 triage (roadmap-triage-2026-10-05#16): next phases postponed — "finsih in 1.3.2/1.3.3"
2026-10-08, follow-up (Destin, after the Pages kit took the app's new slider): "we are going to
rebuild/rework the pages kit at some point to be directly tied to the real app ui, so page guidance
doesn't drift. i also want to provide more pre-built sets of buttons, menus, etc."
`window-chrome` `all` `in-flight` `P2` `checked 2026-09-23` `v1.3.2` → docs/active/plans/2026-09-16-youcoded-pages-phasing.md


YouCoded Pages follow-ups: 8 decisions and sightings.
(a) The page-builder skill's connections update (plugin 0.2.0) is finished and held until an
app release carries Pages Phase 2; merge it in the same step. It must also learn the home-device
connection, the live connection, camera video and the see-through background (merged 2026-10-07)
before that release. The skill's startSession section (wecoded-marketplace branch
`session/page-skill-start-session`) is held until a release carries youcoded#623. (b) Home page (Home Assistant) follow-ups deferred at the 2026-10-07 merge,
never designed: search across devices; selecting several devices at once in Edit; a scenes button
on rooms with a single light; see-through glass for Framed-layout themes such as Golden Sunbreak
("i want it to peek through to the real theme background"; only Floating/Minimalist frost today).
(c) A page allowed "any website" can rarely still reach a home-network device through a hostile
name server; the fix adds a package, so it waits for Destin's OK. (d) A web browser as a page:
most big sites refuse to show inside another page, so the app would need a website view.
(e) Pages on a phone: nobody designed the narrow layout, and connected pages were never tried
over remote access. Found by three guide-test builders (2026-10-15): at phone width, opening a
Page from the Pages list keeps the list beside it and squeezes the Page to ~170px; the pinned
view works (Destin: "roadmap item"). (f) Pages once turned accent-coloured (Golden Sunbreak, Halftone: "a weird
yellow shade") and "its fine now. idk what happened"; not reproduced. (g) Page icons: "page
builder skill needs better instructions to build a unique icon for each page that matches its
purpose at-a-glance. users utilize these to tell pages apart." The set is nine glyphs, money included; it needs
many more, and the skill a rule to pick one no other page uses. (h) Charts in Pages: no guide
recipe or kit colours; the guide-test PC-build and trip pages each invented one (Destin,
2026-10-16: "will want eventually, add to roadmap for now").
`window-chrome` `all` `needs-verify` `P2` `checked 2026-10-08` `needs-repro`

Held for the next app release (2026-10-16): the page-builder skill's chats/program section is on wecoded-marketplace
branch `session/page-skill-chats-programs`, built on top of the held `session/page-skill-start-session`; merge that
one branch (it carries both) once a release carries youcoded's chats/program abilities and startSession.

From the 2026-10-16 document sweep
- Pages on a phone (phone width, pages over the remote connection) and a page deleted while open. Source: docs/active/plans/2026-09-16-youcoded-pages-phasing.md
- Publish the page-builder skill's connections update. Source: docs/active/plans/2026-09-16-youcoded-pages-phasing.md
