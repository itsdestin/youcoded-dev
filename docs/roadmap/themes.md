# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).

- [ ] Themes rendering wrong: 3 faults.
      (a) Themes you build yourself still get the old drawn preview picture while built-in and
      community themes show a real screenshot; the desktop share/publish step, the theme builder's
      preview step and Android (no preview at all) still draw the old way. (b) On the light community
      themes (Kuromi Dreamer, Cotton Candy Sky, Meadow Mist, Strawberry Kitty, Morning Rounds) the
      provider brand colours, like the Claude orange on the model chip, are hard to read: 27
      colour/theme pairs fail contrast (report: docs/active/investigations/2026-09-01-light-theme-brand-colours.md).
      (c) Android ignores a theme's chosen font (Morning Rounds asks for Nunito, the phone uses
      monospace); six of eight published themes specify a font.
      `all` `confirmed` `P3` `checked 2026-09-01`

- [ ] Themes to verify, not build: 3 checks.
      (a) Unverified whether a theme's app icon reaches the dock on Ubuntu's default desktop (GNOME on
      Wayland reads the icon from an installed .desktop entry, which an AppImage has none of); Destin
      stopped testing ("i think this is fine"). (b) The session switcher's corners should follow the
      theme's rounding rule; probably already does, nothing to see until a differently-rounded theme
      is installed. (c) Settings → Appearance: the first theme pictures (Crème, Halftone Dimension)
      open cut off at the top of the theme list (a UX tester, 2026-10-05).
      `all` `needs-verify` `P3` `checked 2026-07-20`

- [ ] Parked ideas: 3 theme ideas.
      (a) Destin's ask (2026-09-10): the taskbar and Dock icon should change with the theme, drawn
      from the new robot icon; today every theme shows the same lavender robot. (b) A theme's icon
      overrides are accepted and the Library shows a "custom icons" badge, but no icon ever changes;
      build it or remove the field (Destin: leave open — which icons, free-form or a fixed set;
      report: docs/active/investigations/2026-09-01-theme-icons-dead-field.md). (c) A third chrome
      layout with bare elements and no backgrounds or pills; the closest combination still leaves
      outlined ghost pills (report: docs/active/investigations/2026-09-01-chrome-style-bare.md).
      `all` `parked` `P3` `checked 2026-09-01`
