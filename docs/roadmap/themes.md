# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).

- [ ] Unverified on Linux: whether a theme's app icon reaches the dock on Ubuntu's default desktop
      (GNOME on Wayland reads an app's icon from its installed .desktop entry, and an AppImage
      double-clicked from Downloads has none). The test build was loaded on the Ubuntu VM on
      2026-10-04 but Destin stopped testing there ("i think this is fine"); window icon and tray
      changes are expected to work
      `desktop` `needs-verify` `checked 2026-10-04`

- [ ] Themes you build yourself still get the old DRAWN preview picture (a mock chat page
      made from the theme's colours), while the built-in and community themes now show a
      real screenshot of the app (2026-09-24, `scripts/ui-review/theme-previews.py`). So on
      the Appearance cards and in the Marketplace, your own theme looks different from the
      rest. Three places still draw the old way: the desktop app when you share or publish
      a theme (`main/theme-preview-generator.ts`), the theme builder's optional preview step
      (`generate-previews.js`), and Android, which makes no preview at all
      `settings/themes` `all` `confirmed` `checked 2026-09-24`

- [ ] Before the official 1.3.1 release, test the Minimalist layout on a Windows computer: it
      gives every small button its own blur, and on Windows a screen full of separately
      blurred cards has twice stopped drawing (blank cards). Destin chose to ship it as is
      (2026-09-24); if it breaks, Reduce Visual Effects turns the blur off
      `window-chrome` `desktop` `needs-verify` `checked 2026-09-24` `v1.3.1`

- [ ] On the light community themes (Kuromi Dreamer, Cotton Candy Sky, Meadow Mist,
      Strawberry Kitty, and since 2026-09-22 Morning Rounds) the provider brand colours — the
      Claude orange on the model chip and friends — are still hard to read; 27 colour/theme
      pairs fail contrast (25 on 2026-08-31, Morning Rounds added two), seen 2026-08-31
      `all` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-light-theme-brand-colours.md

- [ ] Destin's ask (2026-09-10): the app's taskbar and Dock icon should change to match the
      theme, drawn from the new robot icon. Until then, every theme shows the same lavender robot
      icon, because the old theme matching redrew the retired "YC" square. The Mac Dock
      already shrinks edge-to-edge theme art onto Apple's grid (app-icon.ts, 2026-09-27)
      `window-chrome` `desktop` `parked` `checked 2026-09-10`

- [ ] A theme's icon overrides are accepted, and the Library shows a "custom icons" badge for
      them, but no icon anywhere in the app ever changes; build the feature or remove the
      field — Destin's call, deferred 2026-07-22
      Destin 2026-09-02: leave open for consideration — which icons may change, and free-form vs a fixed set, still to think through
      `library` `all` `parked` `checked 2026-09-02` → docs/active/investigations/2026-09-01-theme-icons-dead-field.md

- [ ] Destin's ask (2026-07-19): a third chrome layout with bare elements — session switcher,
      header icons, status chips, input — and no backgrounds or wrapping pills at all; the
      closest current combination still leaves outlined ghost pills
      `all` `parked` `checked 2026-09-01` → docs/active/investigations/2026-09-01-chrome-style-bare.md

- [ ] Destin's ask: the session switcher's corners should follow the active theme's rounding rule.
      Checked 2026-07-20 and it probably already does — nothing to see until a differently-rounded
      theme is installed, so this is verify, not build
      `session-drawer` `all` `needs-verify` `checked 2026-07-20`

- [ ] Android ignores a theme's chosen font: Morning Rounds specifies Nunito, but the phone
      uses the app's built-in monospace instead. Six of the eight published themes specify a
      font, so this affects the wider theme library too. Seen while publishing Morning Rounds,
      2026-09-22
      `settings/themes` `android` `confirmed` `checked 2026-09-22`

- [ ] Settings → Appearance: the first theme pictures (Crème, Halftone Dimension) open cut off at
      the top of the theme list (found by a UX tester, 2026-10-05)
      `settings/themes` `desktop` `needs-verify` `checked 2026-10-05`
