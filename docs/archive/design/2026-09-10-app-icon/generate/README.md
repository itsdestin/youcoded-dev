# How the app icon's mascot drawing was made

One-off generators, kept as the record of how `youcoded/desktop/assets/icon-mascot.svg` came to
be. They are not a build step: once that SVG exists, `youcoded/scripts/build-icons.mjs` makes
every app, installer and Android icon from it.

| file | what it did |
|---|---|
| `round4.mjs` | Built the round 4 deck pictures: the rig library's sticker skin recoloured purple, posed `welcome` (the wave, from `mascot-poses.ts`), faces from the theme-builder face kit `mascot-faces.mjs`, on the lavender tile. |
| `final.mjs` | Rendered the settled picks (white sparkle eyes, deep purple `#4A1F66` edge) as the app, Mac and installer icons; writes `r4lib.mjs` from `round4.mjs` so both use one `mascot()`. |
| `export-art.mjs` | Wrote the approved mascot drawing to `youcoded/desktop/assets/icon-mascot.svg`. |

Destin's decisions, in order, are the stamped answers files beside the deck:
round 1 (`.202609102321`) wanted the header's light tile; round 2 (`.202609102327`) picked the
arrow-strip installer and asked for the real mascot; round 3 (`.202609102334`) picked the wave,
lighter eyes, a smaller mascot and the sticker style; round 4 (`app-icon.design.answers.json`)
picked white sparkle eyes and the deep purple outline.

They read absolute paths from this machine's workspace (`wecoded-themes`, `wecoded-marketplace`,
the session worktree). To change the mascot later, edit `icon-mascot.svg` directly or adapt
`round4.mjs`, then rerun `build-icons.mjs`.
