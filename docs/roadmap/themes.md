# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).


- [ ] A theme whose mascot has companions (sun, motes, sparkles around it on the welcome
      screen) still animates them smoothly at the screen's full refresh rate. The mascot
      itself moved to 30 redraws a second on 2026-09-26 (youcoded#573: idle welcome screen
      36% -> ~12-17% of the graphics chip on Destin's 180 Hz screen); the companions are the same
      kind of cost, unmeasured because his theme has none. Measure a companion theme first
      `all` `needs-verify` `checked 2026-09-26` `performance` → docs/active/investigations/2026-09-26-startup-resume-real-scale.md
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

- [ ] A community theme's custom CSS can run a never-ending animation on the always-visible
      chrome, costing a chunk of a CPU core for anyone who has NOT turned on Reduced Effects
      (Reduced Effects now stops it — see shipped.md 2026-09-10). Open decision: whether to
      cap always-on theme animation for users who never touch the setting, which would change
      what theme authors shipped; options in the investigation's "Fix shape". Known gaps in
      the Reduced Effects half (review, 2026-09-10): an animation written as nested CSS
      (`.x { &:hover { animation: … } }`) or inside `@layer` with `!important` is not
      cancelled; cancelling a one-shot fade-in that ends visible (`animation-fill-mode:
      forwards` from `opacity: 0`) would leave that element invisible; and a theme that
      animates a broad selector (`svg`, `*`) would also freeze the app's own spinners. No
      shipped theme does any of this yet, noted 2026-08-07
      `all` `confirmed` `checked 2026-09-10` `performance` → docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md

- [ ] Destin's ask (2026-09-10): the app's taskbar and Dock icon should change to match the
      theme, drawn from the new robot icon. Until then, every theme shows the same lavender robot
      icon, because the old theme matching redrew the retired "YC" square
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
