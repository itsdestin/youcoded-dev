---
status: shipped
date: 2026-07-22
artifact: https://claude.ai/code/artifact/f1ea405a-dc76-4128-9e72-0e107ba8229b
pr: https://github.com/itsdestin/youcoded/pull/200 (commit 5e036080)
---

# Drawer icon refresh — reveal / expand-contract / copy-path

Icon mockup session 2026-07-22 (two rounds; round 1's 4–9 rejected for glyph
collisions and misreads — the artifact keeps all rejected variants for
reference). Decisions, by mockup number:

| # | Action | Decision |
|---|---|---|
| 2′ | Reveal in folder | Folder + eye at bottom-right corner, folder outline notched around the eye. Eye stroke **1.5** (folder stays 2) + **solid** pupil. |
| 12′ | Expand / Contract | Four standalone corner arrows (chevron heads + stems), stems shortened one notch from the mockup default. Replaces the bare corner brackets. |
| 13 | Copy path | Clipboard + small slash. Replaces the chain link (read as "hyperlink"). |

## Where they live

- `youcoded/desktop/src/renderer/components/SessionDrawer.tsx` — `PATHS.expand`,
  `PATHS.shrink`, `PATHS.copypath` (Ic path strings) and `RevealFolderIc` (its
  own component: the mixed stroke width + filled pupil cannot be expressed in
  the uniform-stroke `Ic` helper; `IconBtn` grew an optional `glyph` prop for it).
- `youcoded/desktop/src/renderer/components/project-view/detail-tool-icons.tsx`
  — `FolderIcon` (reveal) and `LinkIcon` (copy path) updated to the SAME glyphs
  so the ProjectDetailOverlay tools match the drawer. `LinkIcon`'s export name
  was kept to avoid call-site churn; both call sites are Copy-path buttons.

## Process note (worth keeping)

Round 1 shipped six visually broken glyphs because the SVG paths were written
blind. Round 2 rasterized every candidate locally (`rsvg-convert` at 96px AND
true 15px) and inspected the renders before publishing — that caught a
wrong-direction arrow stem and two misreading glyphs before Destin saw them.
Do this for any future icon work: render at the real target size first.
