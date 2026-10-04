---
status: active
---
# YouCoded brand identity — final decisions (rounds 5–18, 2026-10-01 → 10-02)

Every line below is a submitted deck answer (`brand-identity-v<N>.answers.json` beside this file).
Nothing here has been applied to the app or the website yet.

## Name
- Lowercase **youcoded** in the logo; **YouCoded** in sentences. (v10 L3)
- Font: **Outfit SemiBold (600)**, tracking −3.5%. (v9 FONT f2)
- Colours: "you" gradient `#9D5BD0 → #D25AA0`, "coded" ink `#21152C`; white/lavender on dark. (v16 COLOUR c0 — the
  sampled-from-icon alternatives were rejected as too dark.)
- Tagline: "agents for everyone", JetBrains Mono, capitals, wide spacing. (v10 L1–L4)
- Logo set: lockups, colour versions, rules (clear space = half the icon height; minimums icon 16px, lockup 96px,
  name 64px, "yc" 12px), and in-use examples — all approved. (v10 L1–L4; boards in `runs/v10`, redrawn with the final
  icon in `runs/v14`)

## App icon
- White frosted-glass tile; the mascot's face panel (the body's 14×12 proportions) shows the theme's wallpaper at
  heavy blur, with a soft light behind the eyes. (v11 GLASS gs3, v12 ICON r1)
- Shadow on all sides; a thin rim in the theme's deep colour. (v11 ICON note, v13 CONTRAST cc)
- Eyes: the existing dark-oval style with one sparkle, coloured per theme; ~20% larger in the 16–48px files. (v11 EYES, v12 notes)
- Mouth: **soft smile, medium** (`soft2` in `src17/icons.html`). (v18 MOUTH sm2)
- The icon re-dresses per theme (wallpaper, eye colour, rim colour). (v12–v13)
- Second version: the same face on **mid-grey glass** (`gy2`). (v16 GREY)
- Reference asset (not the app icon): the face with "youcoded" below (`r2`). (v12 ICON note)

## Installer icon
- The face (same as the app icon: theme picture inside, theme eyes, rim), straight, slightly smaller, rising out of an
  open white-glass box with its flaps spread wide, a download symbol on the box, three short speed streaks, on the
  theme's colourful background. (`fv2` in `src16/icons.html`; v16 INSTALLER yes)

## Where the drawings live
- Final icon renderer: `src17/icons.html` (`face2`, `frost`, `smoke`, `box3`), shot by `src17/shoot-icons.sh`.
- The final icon with the chosen mouth is `?i=sm2` (add `&t=<theme>` for a theme, `&small=1` for the 16–48px drawing).
- Installer: `src16/icons.html?i=fv2`. Grey version: `src16/icons.html?i=gy2` (add the soft smile when building).

## Not yet done
- Producing the shipping files (`.ico`, `.icns`, Android icons, favicons) and putting the icon, installer icon and
  logo into the app and website — waiting on Destin's go-ahead.
