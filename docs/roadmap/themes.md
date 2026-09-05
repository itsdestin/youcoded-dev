# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).

- [ ] The Golden Sunbreak the app ships is older than the registry's (2026-09-04): the promo film
      used the registry's 1.2.0 rig and companions (the sun that floats beside the mascot) because
      the vendored copy has neither; a user who installs Golden Sunbreak today does not get the
      character the film shows. Open question from the promo: update the vendored theme to 1.2.0?
      `all` `decision` `checked 2026-09-04`

- [ ] Rebase every theme's mascot faces on the promo's "warm" face set (2026-09-04): the
      welcome eyes on every expression, expression carried by brows, lids and mouth; surprised
      is not two black discs, curious has two brows of different shapes, blink is nearly flat
      with the welcome mouth, dizzy is swirl eyes with stars circling above the head, plus new
      happy, smug and shutdown (eyes closed, limbs tucked under) faces. Destin: "these will
      also be the new guidelines to rebase all other themes on in the live app", 2026-09-04
      `all` `decision` `checked 2026-09-04`

- [ ] On the four light community themes (Kuromi Dreamer, Cotton Candy Sky, Meadow Mist,
      Strawberry Kitty) the provider brand colours — the Claude orange on the model chip and
      friends — are still hard to read; 25 of 70 colour/theme pairs fail contrast, seen 2026-08-31
      `all` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-light-theme-brand-colours.md

- [ ] A community theme's custom CSS can run a never-ending animation on the always-visible
      chrome, costing every user a chunk of a CPU core with no setting — not even Reduced
      Effects — that turns it off; no shipped theme does this yet, noted 2026-08-07
      `all` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md

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
