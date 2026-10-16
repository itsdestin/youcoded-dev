---
id: 130
title: Themes: display faults, checks and ideas
stage: planning
priority: P3
tags: themes, bug
branch: 130-themes-rendering-wrong-3-faults
roadmap: themes: Themes rendering wrong: 3 faults.
created: 2026-10-15
summary: Themes: old drawn previews, hard-to-read brand colours, Android ignoring theme fonts, three things to check and three parked ideas.
area: Marketplace & library
side: screens
vision: yours.look.themes
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #51: Both are about theme preview pictures being unreliable (51b in the marketplace, 130a for themes you build yourself), and Destin asked to fix the whole class.

Chats

From the old roadmap (themes, status confirmed, seen on all, last checked 2026-09-01)
Themes rendering wrong: 3 faults. (a) Themes you build yourself still get the old drawn preview picture while built-in and community themes show a real screenshot; the desktop share/publish step, the theme builder's preview step and Android (no preview at all) still draw the old way. (b) On the light community themes (Kuromi Dreamer, Cotton Candy Sky, Meadow Mist, Strawberry Kitty, Morning Rounds) the provider brand colours, like the Claude orange on the model chip, are hard to read: 27 colour/theme pairs fail contrast (report: docs/active/investigations/2026-09-01-light-theme-brand-colours.md). (c) Android ignores a theme's chosen font (Morning Rounds asks for Nunito, the phone uses monospace); six of eight published themes specify a font.

Merged in #131 "Themes: three things to check"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (themes, status needs-verify, seen on all, last checked 2026-07-20)
Themes to verify, not build: 3 checks. (a) Unverified whether a theme's app icon reaches the dock on Ubuntu's default desktop (GNOME on Wayland reads the icon from an installed .desktop entry, which an AppImage has none of); Destin stopped testing ("i think this is fine"). (b) The session switcher's corners should follow the theme's rounding rule; probably already does, nothing to see until a differently-rounded theme is installed. (c) Settings → Appearance: the first theme pictures (Crème, Halftone Dimension) open cut off at the top of the theme list (a UX tester, 2026-10-05).

Merged in #132 "Themes: three parked ideas"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (themes, status parked, seen on all, last checked 2026-09-01)
Parked ideas: 3 theme ideas. (a) Destin's ask (2026-09-10): the taskbar and Dock icon should change with the theme, drawn from the new robot icon; today every theme shows the same lavender robot. (b) A theme's icon overrides are accepted and the Library shows a "custom icons" badge, but no icon ever changes; build it or remove the field (Destin: leave open — which icons, free-form or a fixed set; report: docs/active/investigations/2026-09-01-theme-icons-dead-field.md). (c) A third chrome layout with bare elements and no backgrounds or pills; the closest combination still leaves outlined ghost pills (report: docs/active/investigations/2026-09-01-chrome-style-bare.md).

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Now that the UI consistency work has landed (2026-10-16, youcoded#626): a broad review, across every theme, of the colours,
see-through levels and contrast used for each card level, then make the theme builder and
its checks fast and accurate enough that a new theme comes out usable, with good contrast,
on the first try (Destin, 2026-09-28). Starting point: on 2026-09-28 card fills measured
only a shade off their background in all 8 themes tested, and the theme's own faint
outline nearly vanished on three glass themes, so the app now forces a stronger shared outline
`settings/themes` `all` `confirmed` `P3` `checked 2026-09-28`

