# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).

- [ ] On the four light community themes (Kuromi Dreamer, Cotton Candy Sky, Meadow Mist,
      Strawberry Kitty) the provider brand colours — the Claude orange on the model chip and
      friends — are still hard to read; 25 of 70 colour/theme pairs fail contrast, seen 2026-08-31
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

- [ ] In the theme editor, a particle preset that isn't one of the listed choices shows as unset and
      gets overwritten on the next save. Bug 5 of the 2026-07-19 input-migration family (bugs 2–4
      shipped in PR #297)
      `themes-screen` `desktop` `needs-verify` `checked 2026-09-01`

- [ ] Destin's ask: the session switcher's corners should follow the active theme's rounding rule.
      Checked 2026-07-20 and it probably already does — nothing to see until a differently-rounded
      theme is installed, so this is verify, not build
      `session-drawer` `all` `needs-verify` `checked 2026-07-20`

- [ ] Android ignores a theme's chosen font entirely: every installed theme renders in the app's
      built-in monospace, so a theme whose whole identity is its typeface (Nunito, Comfortaa,
      Space Grotesk) looks like the theme on desktop and like the default on a phone. Desktop
      injects the theme's font link; nothing on Android reads the field at all. Five of the
      seven published themes set a font, so this is every font theme, not one pack. Seen while
      publishing Morning Rounds, 2026-09-22
      `settings/themes` `all` `confirmed` `checked 2026-09-22`

- [ ] A wallpaper theme that doesn't declare its background's average colour gets its contrast
      audited against flat tokens, which understates the real ratios and only warns — so a theme
      can go green while its dim and faint text is genuinely below the bar. The theme-builder
      writes the field; nothing makes it, and the publishing path doesn't either. Found on
      Morning Rounds, where declaring the real average dropped two tiers below their hard
      thresholds, 2026-09-22
      `settings/themes` `all` `confirmed` `checked 2026-09-22`
