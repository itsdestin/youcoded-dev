---
id: 92
title: Offer a plain terminal when starting a session
stage: planning
priority: P3
tags: other-features, misc, feature
report: docs/archive/design/2026-09-04-local-engine-upgrades/local-engine-upgrades.questions.answers.json
branch: 92-a-plain-terminal-choice-when
roadmap: other-features: A plain "Terminal" choice when starting a new session — a ba
created: 2026-10-15
summary: The new-session form can't start a bare terminal with no assistant, even though the app can already open one.
area: Chat
side: screens
vision: chat.converse.multi
---
Progress
Done: Idea decided by Destin (local-engine-upgrades deck 2026-09-04, Q-1: add 'Terminal' to the new-session provider list; Q-2: keep it friendly for non-developers, anything confusing behind an (i) explainer). Back end exists: Settings' 'Run in terminal' already opens a bare shell session (desktop/src/main/session-manager.ts shell resolution ~line 93; comment in renderer App.tsx ~1287). Checked 2026-11-19, ready to build, ~small.
Next: Find the new-session form (SessionStrip / ModelPicker / BuddyNewSessionForm), add a Terminal choice that starts that same shell session; build in workbench, Before/After deck. Desktop first; note any Android gap in the deck.
Blocked: Nothing; Destin parked it 2026-11-19 to pick up later

Chats

From the old roadmap (other-features › misc, status in-flight, seen on all, last checked 2026-09-06)
A plain "Terminal" choice when starting a new session — a bare terminal as a YouCoded session, no assistant attached. The local engine's "Run in terminal" button already opens exactly that session; the new-session form never offers it. Destin on the local-engine deck: it would win over developers.
