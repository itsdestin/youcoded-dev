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
work: session/page-start-session, session/ha-pages-connection
vision: pages.agents.attached, pages.connect.files, pages.build.phone
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #91: 91 is the follow-up list for the YouCoded Pages work in 90.

Chats

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

