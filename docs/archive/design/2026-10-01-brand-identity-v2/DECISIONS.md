---
status: shipped
---
# YouCoded brand identity — every pick (rounds 5–32, 2026-10-01 → 10-04) and where it is built

**Every piece approved, one deck at a time** (last answers: `brand-identity-v31`, then the website's `brand-website-v2`, 2026-10-04). Every line
below is a submitted deck answer (`brand-identity-v<N>.answers.json` beside this file). Applied to the app
and themes on `session/brand-identity-v2`, and to the website on `session/brand-website` (see the end).

## Name
- Lowercase **youcoded** in the logo; **YouCoded** in sentences. (v10 L3)
- Font: **Outfit SemiBold (600)**, tracking −3.5%. (v9 FONT f2)
- Colours: "you" gradient `#9D5BD0 → #D25AA0`, "coded" ink `#21152C`; white/lavender on dark. (v16 COLOUR c0 — the
  sampled-from-icon alternatives were rejected as too dark.)
- Tagline: "agents for everyone", Outfit 400, lowercase, soft grey. (v20 TAGLINE tc)
- Icon + name: gap a quarter of the icon's height; name raised 3.5% of the icon's height. (v20 SPACING sd)
- Side by side with the tagline: tagline at 0.33× the name's size, tucked up beside the "y"'s tail (its top 0.42× the
  name's size above the bottom of the name's line, starting 0.8× the "y"'s width in), and the whole text block 2px
  lower than the name-only lockup at a 64px icon. (v24 hb, v25, v26 HORIZ hc; drawn by `round26()` in `src22/boards.html`)
- Stacked: today's icon-to-name gap; tagline at 0.34× the name's size, 6px tighter under the name than before
  (−6px margin at a 36px name). (v25 STACK note, v26 STACK sc)
- Logo pages (colour versions, rules, in use) approved with every pick applied. (v23 L2–L4)
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

## Theme icons, tray, Mac (round 27)
- All eight marketplace themes get the app icon recipe; Cotton Candy Sky wears the default. Halftone Dimension and
  Morning Rounds use the **same recipe** (not the night look, not the dog ears). Built-in themes keep the default. (v27 THEMES yes, HALFTONE ha, MORNING ma)
- The main app icon (window, taskbar button, Dock) changes with the theme, as well as the tray icon. (v27 HALFTONE note)
- Mac: build the icon as three Liquid Glass layers (background, face, eyes+smile); older Macs get the flat version. (v27 GLASS yes)
- Mac Dock with a theme on: picked "never swap", but asked for a middle ground (theme face on glass, not white) — settled in v28, next line. (v27 DOCK da + note)
- Mac Dock with a theme on, by the Mac's icon look: **Default** → the theme's normal icon (white tile, theme face);
  **Dark and Clear** → the theme face on see-through clear glass (`mid1`); **Tinted** → no swap, the Liquid Glass icon stays.
  The app reads the look from the Mac's `AppleIconAppearanceTheme` setting; confirmed in the macOS 26 VM
  (Destin: "icon switching works fine on mac!"). (v28 DOCK note)
- Tray icon: **the app icon, shrunk** (`trT`), switching with the theme; red "needs you" dot stays. (v27 TRAY tc)
- Mac menu bar: **one colour** (Apple's template style), **J1**: an outline face with full-size solid eyes, a sparkle cut into each eye's top right, and the eyes and
  smile raised 0.35 of the 12-unit face (`tmplJ(h, color, 'tr')` in `src27/boards.html`). (v28–v30 notes, v31 EYES j1) (v27 MENUBAR ka + note)
- Drawings: `src27/icons.html` (themes `cotton`, `halftone`, `morning`; `lgPanel`/`lgFeat` layers; `mid1`/`mid2`), boards `src27/boards.html`.

## Windows taskbar (round 32, tested in the Windows 11 VM)
- Windows draws the taskbar button from YouCoded's shortcut, not the window, so the app points its own
  shortcuts at the theme's icon and — when not pinned — rebuilds the button: live. A pinned button
  changes at the next Windows sign-in (or re-pin); no flicker. Destin: "windows seems fine." Restarting
  Explorer to force it was rejected (it closes the user's windows).

## Built (2026-10-04, branches `session/brand-identity-v2` in youcoded, wecoded-themes, workspace)
- youcoded: `scripts/build-icons.mjs` + `scripts/icons/brand-icons.html` generate every icon (the shipping
  renderer — the `src*/` folders here are the design rounds); Liquid Glass `icon.icon`; theme icon bundle
  → window, Windows taskbar, Mac Dock (by icon look, `mac-icon-look.ts`), tray, via `window:set-icon`
  (`desktop/src/main/ipc/window.ts` → `theme-icon-swap.ts`); J1 menu-bar template; Android launcher.
  Brought up to date with master's one-core refactor on 2026-10-04 (verify.sh --full green).
- wecoded-themes: seven themes carry `assets/app-icon/` + `appIconVariants`; versions bumped.
- Tested by Destin in VMs: Windows (taskbar, Alt+Tab, tray), macOS 26 (theme icons in the Dock, the four
  looks). Not tested: Ubuntu dock (roadmap themes.md), Android launcher on a device.
- Not applied yet: the grey icon and the "yc" initials (no surface uses them yet).
- Merge order and what is left: `docs/archive/handoffs/2026-10-04-brand-merge-START-HERE.md` (all merged 2026-10-04).

## Website (2026-10-04, branch `session/brand-website` in youcoded + workspace; decks `brand-website-v1/v2`)
- Top bar: icon + name WITH the tagline (side-by-side lockup, 44px icon; 40px on a phone). (v1 HEADER note, v2 HEADER yes)
- Footer: icon + name, no tagline. (v1 FOOTER note, v2 FOOTER yes)
- About / Features / FAQ in Outfit. (v1 SHARE note, v2 LINKS yes)
- Tab icon: the app icon per site theme; tab title "youcoded — agents for everyone". (v1 TAB note, v2 TITLE b)
- Name colours per theme as THEMECOL cc; Halftone pair (#C95A86 to #7A7BC8) picked the same way; dark themes
  use the theme's own light text for "coded". Icons: `youcoded/scripts/build-icons.mjs --site docs/brand`.

## Where the drawings live
- What ships: `youcoded/scripts/icons/brand-icons.html` (run by `youcoded/scripts/build-icons.mjs`). Change
  an icon there, never in the round folders below.
- Design rounds (history only): final icon `src17/icons.html` (`?i=sm2`, `&t=<theme>`, `&small=1`), installer
  `src16/icons.html?i=fv2`, grey `src16/icons.html?i=gy2`, logo boards `src22/boards.html`, theme/tray/menu-bar
  boards `src27/`.
