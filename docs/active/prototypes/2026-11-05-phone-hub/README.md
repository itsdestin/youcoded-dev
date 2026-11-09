---
title: Phone "everything panel" (hub) — kept as a reference
status: active
---

# Phone "everything panel" — reference for a future mobile mode

Destin, round 3 of the narrow-screens design (`docs/active/design/2026-11-04-narrow-screens/`,
`narrow-screens-3.live.answers.json` L-2): *"for now it should stay today. but i want to keep a
version of hub as a reference for the future full buildout of an alternative mobile mode."*

So the phone ☰ keeps today's small menu, and this panel is NOT shipped. The narrow-screens status
page is `docs/active/design/2026-11-04-narrow-screens/README.md`. The broader idea of letting
people rearrange the main window (a sidebar of chats instead of the top bar) is card #222, and
this panel is a worked example for it. It is kept here because the
branch's workbench switch for it is deleted once the narrow-screens work settles.

## What it was

☰ opened one panel from the left (pictures beside this file):

- a full-width **New session** button on top;
- **Open now** — the open sessions, in the squeezed phone rows (status as a dot, model name only);
- **Earlier** — the five most recent past chats from the Resume list, with **See all**;
- **Games, Files, Pages, Projects, Settings** as a row of icon tiles along the bottom edge, keeping
  the menu's badges.

Tapping the session name still opened the plain session list.

## Not finished in the mockup

- A past chat under Earlier opened the Resume page, not the chat itself — a real build needs the
  app's resume call passed down to the header.
- Earlier dropped past chats whose NAME matched an open one, only because the workbench's practice
  list includes open sessions; the app's own list already leaves them out.

## The code

`round-3-code.patch` is the whole round-3 commit (`a0f6d501d` on youcoded
`session/narrow-screen-proposals`). The hub pieces are `PhoneRecent`, the `hub` cases in
`header/phone-session-menu.tsx`, `RowTiles` in `OverflowMenu.tsx` and the `hubMode` lines in
`SessionStrip.tsx`. Apply with `git apply` on a branch of that era, or read it as a recipe.

## Where it is meant to come back

Destin, round 4 (`narrow-screens-4.live.answers.json` Q-1, choosing no Appearance choice for now):
*"this would be a later thing to replace with the full screen/side panel hub and a different title
style. not a thing today."* So the future alternative mobile mode is this panel (as a full screen
or a side panel) plus its own top-bar title style, offered as a choice — not today's bar vs the
lights bar.
