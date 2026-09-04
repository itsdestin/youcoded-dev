---
status: draft
created: 2026-09-03
type: spec
topic: A ~70-second promo video of YouCoded for Reddit — the running app, filmed by the demo-clip rig, hosted by the mascot, assembled with free tools.
measured_at:
  youcoded-dev: 9b9fa65
  youcoded: 4224fb85
---

# YouCoded promo video — design

## What it is

One 16:9 video, about 70 seconds, that a Reddit viewer can watch **muted** and still
understand what YouCoded is. It shows the app doing seven things, one after another,
each in a different theme, with the assistant mascot as the through-line: it peeks in
at the start, hops from beat to beat and changes costume with every theme, dives into
the window to become the Flappy bird, and waves out at the end.

Tone: whimsical (the mascot, the games, the theme transformations) over a badass spine
(cuts on the beat, the app doing several things at once, short captions, no narration).
The video gets more colourful as it goes: two beats in plain Midnight, then a new theme
on every cut, and a run of three looks at the drop.

Not a landing-page replacement. The landing page's loops stay as they are; this borrows
the same rig and the same fixtures.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Footage | The real renderer in the UI Workbench (fake backend), filmed by `scripts/ui-review/record.mjs` | It is how every landing-page loop is made; nothing touches Destin's live app |
| Assembly | **Remotion** (React-in-video, free for individuals) in `scripts/promo/` | Frame-accurate transitions, captions, overlays and music in code |
| Output | 1920×1080, 30 fps, H.264 MP4, stereo AAC (silent track too) | What Reddit accepts and autoplays; the scenes are filmed at 30 fps so no frame is doubled |
| Sound | **Composed in code** (`scripts/promo/music/`) at a fixed tempo, structured to the storyboard. The sequencer exports the beat grid as JSON and Remotion places every cut, caption hit and theme flip on it. UI-style sounds (a pop on every landing, a whoosh on cuts, a chime on each flip) come from the same synth | Destin: music must feel integrated, beats matched, not dropped in (2026-09-03) |
| Themes | **One theme per beat**, each from the theme registry the app installs from: Midnight → Meadow Mist → Halftone Dimension → Cotton Candy Sky → Devil's Garden → (Midnight, then) Golden Sunbreak → Strawberry Kitty → Kuromi Dreamer → Golden Sunbreak for the close. The conversations beat gets the calmest light theme because its point is a browser full of text; the loud one goes where the point is the look. The backdrop behind the window is the theme's canvas with its wallpaper blurred; the host wears the theme's own rigged mascot where it ships one (Golden Sunbreak, Halftone, Kuromi, Strawberry) and the app's default rig tinted with the theme accent elsewhere, with the theme's companions (sun, motes, sparks) floating beside it | Destin, 2026-09-03: a wider variety of themes; background and mascot change colour with the theme |
| Transitions | The host **hops** across every cut: it takes off before the beat, the window swaps under it with a slanted wipe whose leading edge is the incoming theme's accent colour, the backdrop washes to the new theme from the window's centre, and it lands with a squash and a pop two frames after the downbeat, already in the new costume. Wipes straddle the beat (200 ms before, 133 ms after) rather than starting on it | Destin, 2026-09-03: improve the transitions; a wipe that starts on the beat reads late |
| Captions | A headline whose words pop in on the beat, an accent rule, and a quieter sub-line, set in the theme's own display font (Comfortaa for the cute themes, Nunito for Meadow, Space Grotesk for Devil's Garden, Inter otherwise); the landing page's banned list applies (no "real app", "real files", "actually", "does real work", "self-improving") | Destin: more interesting, better styled, a tad more informative |
| Games beat | Friends lobby with a Challenge, Connect 4 against a friend with moves both ways, one chess move, then the Flappy flight | Destin: emphasise "with friends", bounce to chess or Connect 4 |
| Conversations beat | The Resume browser with a search, a tag and a note added, then the strip drag — replaces the drag-only beat | Destin: a "Manage your conversations" cut |
| Spreadsheet beat | **Assistant-only.** The user asks; the panel shows the sheet change | In-grid editing does not exist (roadmap: `docs/roadmap/files.md`) |
| Theme beat | **One-shot.** The theme applies the moment the assistant finishes; two more looks follow on the next downbeats | Promo fudge Destin approved; the real flow goes through the marketplace card |
| Takeover beat | The real "This session is active on {device} — take over here?" dialog, triggered by a workbench fake | The dialog and copy are real; only the trigger is faked |

## Storyboard

Round three (2026-09-04). The film opens with a silent prelude — black, a white
"YouCoded", the host walking in from the left edge and punching the wordmark — and the
music starts on the hit, which is bar 0. Times are bar boundaries of the music (118 BPM,
one bar = 2.03 s), 44 bars. "Caption" is the headline and the sub-line; the mascot column
says what the host does. The page `docs/active/prototypes/promo-2026-09/storyboard-v3.html`
is the illustrated version of this table and the record of Destin's sign-off.

| # | Bars | Theme | On screen | Caption | Mascot |
|---|---|---|---|---|---|
| 1 | prelude + 0–2 | black → Cotton Candy Sky | Black, silent, "YouCoded" in white. The host peeks in over the left edge, looks around, walks across to stand left of the Y, looks at it, punches. The screen bursts into colour from the fist, "Assistant" rolls out of the wordmark, the window rises on bar 1. | **YouCoded Assistant** / Useful. Fun. Yours. | Peek, walk, punch, costume change in the burst, hops onto the title bar |
| 2 | 2–5 | Cotton Candy Sky | A request is typed and sent, the assistant pulls the notes, the brief lands (1.6×). | **Just ask.** / Type what you need. It pulls your notes and gets to work. | Watches the reply |
| 3 | 5–10 | Cotton Candy → Golden Sunbreak (6), Strawberry Kitty (7), Kuromi Dreamer (8) | "build me a theme with the vibe of outdoor anime art" is sent under bar 5; the app turns golden on the drop, two community looks follow one bar apart. | **Describe a look.** / It's yours. · then: Or pick one from the community. | Shocked and a jump for joy with each look, a new costume each time |
| 4 | 10–13 | Crème | The status-bar model chip, the popup's favourites (Claude, DeepSeek, Grok, GPT), Grok picked, the chip changes, a question, Grok answers (1.35×). | **Your model, your call.** / Claude, a cloud model, or one running on your machine. | Peers at the popup |
| 5 | 13–18 | Meadow Mist | Attach the spreadsheet, ask for the sort and the totals row; the sorted sheet on bar 15; on 16 project view: Econ 201's hero and files, one click to Context. | **Your files, beside the chat.** / Attach a spreadsheet. Ask. Watch it change. · then: Every file, chat and note lives in its project. | Hops over to peer at the sheet, back for the project |
| 6 | 18–24 | Halftone Dimension | Friends lobby and a Challenge; Connect 4 with moves both ways; a chess move; the Flappy flight on 22–23. | **Play while it works.** / Chess and Connect 4 with friends. Flappy on your own. | Cheers the challenge; dives into the game and becomes the bird |
| 7 | 24–28 | Midnight | All Sessions → Resume; "econ" narrows the list; a note in the Organize sheet; "plan my week" dragged into place. | **Every conversation, findable.** / Search, tag, note, drag into order. | Follows the pill along the strip |
| 8 | 28–33 | Devil's Garden | The chat on the laptop; the phone slides in with its session list, taps the session, the PHONE asks "active on Desktop — take over here?", Take over, the chat loads; on 32 the phone's project files show the same spreadsheet. | **Pick up on any device.** / Chats and project files sync across all your devices. | Hops onto the phone; cheers the files |
| 9 | 33–38 | Light | The marketplace opens on drop 2; the Remember card and its detail page; Install; back in the chat with the new Remember chip. | **Add what you need.** / Plugins from the WeCoded marketplace. One click to install. | Wow at the marketplace; cheers the install |
| 10 | 38–43 + tail | Golden Sunbreak | The window settles smaller; the wordmark, the platforms line, the link; a fade to black under the tail. | **YouCoded** · **Free. Open source.** / Windows · Mac · Linux · Android · www.youcoded.ai | Waves, cheers on the final hit, stays to the fade |

Transitions: the host hops across every beat boundary, landing on the downbeat in the
new costume, while the window swaps under it with a slanted wipe in the incoming theme's
accent. Cuts inside a beat are straight cuts on a downbeat.

## Music

**Arcade synthwave** — Destin's pick from two sketches, 2026-09-03. 118 BPM, A minor;
`scripts/promo/music/song.py` `promo_track()`, 44 bars, starting from silence on the punch:

| Bars | Section | On screen |
|---|---|---|
| 0–1 | An impact hit on 0, then arp + pad, riser | The burst, the window |
| 2–4 | Groove | Just ask |
| 5 | Riser, fill, silence gap | The theme request is sent |
| 6–9 | **Drop 1**: hook, accents on 7 and 8 | The three looks |
| 10–12 | Groove | Pick your model |
| 13–17 | Groove, lead on 16 | Files, then project view |
| 18–23 | Hook | Games |
| 24–25 / 26–27 | Break / build | Conversations |
| 28–32 | Half-time groove, riser on 31–32 | Any device |
| 33–37 | **Drop 2** | Marketplace |
| 38–42 | Outro | Close |
| 43 | Final hit, tail ~2.5 s | Wordmark, fade |

UI sounds from the same synth: pop (landings), whoosh (wipes), chime (theme flips),
punch, poof (costume changes), step (the walk). Delivered at −14 LUFS.

## Footage: one scene file per shot

All under `scripts/ui-review/scenes/promo-*.json`, filmed at **1440×900, 30 fps** (shown at
96 % inside a fixed layout: headroom above the window for the host, a caption band below)
except the phone scene at 390×844 with `platform=android`. Each clip comes with a **marks
file** (the video time of every scene action), and the timeline trims to those labels —
a re-film never breaks the edit. `scripts/promo/film.sh <app-worktree> [scene…]` films them.

| Beat | Scene | Theme | Marks the timeline cuts on |
|---|---|---|---|
| 1 | `promo-idle-midnight` | midnight | — |
| 2 | `promo-quick-chip` | midnight | `chip` |
| 3 | `promo-sheet` | meadow-mist | `attach`, `reply`, `after` |
| 4 | `promo-games-lobby` (`signedIn=1&autoplay=0`) | halftone-dimension | `challenge` |
| 4 | `promo-connect4` (`signedIn=1`) | halftone-dimension | `drop1` |
| 4 | `promo-chess` (`signedIn=1`) | halftone-dimension | `move` |
| 4 | `promo-flappy` | halftone-dimension | `fly` (the in-page pilot, `scenes/flappy-pilot.js`) |
| 5 | `promo-conversations` | cotton-candy-sky | `menu`, `tag`, `drag` |
| 6 | `promo-remote`, `promo-phone`, `promo-takeover` | devils-garden | `popup`, `reply`, `resumed` |
| 7 | `promo-theme` | midnight, flipping | `sent`, `paint1`, `paint2`, `paint3` (in-page observers on `data-theme`) |
| 8 | `promo-idle-golden` | golden-sunbreak | — |

Every workbench fake is dev-only code (the workbench never ships to users) and lands on
`youcoded` master through a normal PR (itsdestin/youcoded#402). The theme art the overlays
use (rigs, companions, wallpapers) is copied from the `wecoded-themes` registry by
`scripts/promo/theme-assets.sh`, which also pre-blurs each wallpaper for the backdrop.

## Assembly: `scripts/promo/`

```
scripts/promo/
  package.json          remotion, @remotion/cli, @remotion/transitions, @remotion/google-fonts
  remotion.config.ts
  src/Root.tsx          registers the one composition: Promo, 1920×1080, 30 fps
  src/Promo.tsx         the timeline, built from timeline.ts (tested: every beat starts on its downbeat)
  src/grid.ts           reads the exported beat grid; bar → frame helpers
  src/marks.ts          reads every clip's marks file; label → frame
  src/layout.ts         the one set of screen coordinates (window, caption band, host perch, phone)
  src/captions.ts       the caption strings, pinned to this document by a test
  src/beats/*.tsx       one component per beat: footage in a window frame + caption + mascot cues
  src/Mascot.tsx        the host: the app's default buddy rig, posed by springs; Golden Sunbreak stills for the costume
  src/Caption.tsx, Window.tsx, Phone.tsx, Backdrop.tsx, Footage.tsx
  src/rig.ts, golden.ts the mascot art copied from the app
  music/                synth.py + song.py (the track and the UI sounds), test_song.py
  film.sh, render.sh    film every scene; final render + loudness
  public/               the track, grid and SFX, and footage/ — the recorded WebMs + marks (gitignored)
  out/                  renders (gitignored)
```

Render: `npx remotion render Promo out/youcoded-promo.mp4`. A draft at half size
(`--scale 0.5`) renders in a couple of minutes for review; the final at full size.

Font: Inter via `@remotion/google-fonts` (fetched at render). Backdrop: a slow-moving
gradient in the active theme's colours, switching to Golden Sunbreak's at beat 7.

## Review

1. **Storyboard sign-off** — this document.
2. **Layout still** — one frame with the window, a caption, the host and the phone; the
   geometry is approved before a beat exists.
3. **Footage check** — each scene's poster and a frame sheet of its clip
   (`docs/active/prototypes/promo-2026-09/footage-review.md`). Anything that looks off is
   re-filmed before assembly starts.
4. **Draft render** at half size, reviewed frame by frame at every cut. Notes become a
   list; a second draft follows — repeated until nothing is left on the list. (Destin,
   2026-09-03: Claude iterates until it is proud of it; Destin sees the result.)
5. **Final render.** Handed over as a path in chat. Two files: with music and without, plus the track as an MP3.

The storyboard order and captions are Destin's to change at any step. Timing is mine.

## Out of scope

- A vertical or square cut for mobile feeds (easy to add later as a second composition).
- Voice-over or narration.
- Changing the landing page or its loops.
- Any change to the shipped app. The only app-repo changes are workbench fakes and fixtures.

## Risks

- **The Flappy beat depends on keyboard timing** through CDP; if flaps land late the bird
  dies. The scene records several attempts and the best one is used.
- **A viewer tries to type into a spreadsheet** and cannot. The video never shows it, and
  the roadmap item exists.
- **The takeover dialog's device name** is whatever the fake says; "Pixel 9" is a
  placeholder, not a claim about supported phones.
- **Remotion's licence** is free for individuals and companies of up to three people. The
  workspace is one person.
