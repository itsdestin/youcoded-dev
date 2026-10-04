---
status: active
---
# YouCoded brand identity — picks so far (rounds 5–18, 2026-10-01 → 10-02)

**Not fully signed off.** Every line below is a submitted deck answer (`brand-identity-v<N>.answers.json`
beside this file). Icon, grey version, installer and initials are approved; the logo pages with every
pick applied are on `brand-identity-v23`. Nothing here has been
applied to the app or the website.

## Name
- Lowercase **youcoded** in the logo; **YouCoded** in sentences. (v10 L3)
- Font: **Outfit SemiBold (600)**, tracking −3.5%. (v9 FONT f2)
- Colours: "you" gradient `#9D5BD0 → #D25AA0`, "coded" ink `#21152C`; white/lavender on dark. (v16 COLOUR c0 — the
  sampled-from-icon alternatives were rejected as too dark.)
- Tagline: "agents for everyone", Outfit 400, lowercase, soft grey. (v20 TAGLINE tc)
- Icon + name: gap a quarter of the icon's height; name raised 3.5% of the icon's height. (v20 SPACING sd)
- In other themes, the name's colours come from that theme's mascot face, toned down. (v20 THEMECOL cc)
- Initials: plain white glass tile, "yc" in Outfit, only the "y" in the purple-to-pink gradient, letters large and centred high (`w6` in `src22/icons.html`). (v21 w5, v22 yes)
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
- App icon and grey version approved as a whole. (v19 SM2 yes, GYF yes)
- Reference asset (not the app icon): the face with "youcoded" below (`r2`). (v12 ICON note)

## Installer icon
- The app icon's face (with its smile) rising out of an open box on the plain white glass tile with a pale
  theme-colour fade; the box, flaps and outline drawn as one piece with one theme-coloured outline and shadow, a
  download symbol on the front, three short streaks (`ip` in `src22/icons.html`). (v20 id, v21 if2, v22 yes)

## Where the drawings live
- Final icon renderer: `src17/icons.html` (`face2`, `frost`, `smoke`, `box3`), shot by `src17/shoot-icons.sh`.
- The final icon with the chosen mouth is `?i=sm2` (add `&t=<theme>` for a theme, `&small=1` for the 16–48px drawing).
- Installer: `src16/icons.html?i=fv2`. Grey version: `src16/icons.html?i=gy2` (add the soft smile when building).

## Not yet done
- Producing the shipping files (`.ico`, `.icns`, Android icons, favicons) and putting the icon, installer icon and
  logo into the app and website — waiting on Destin's go-ahead.
