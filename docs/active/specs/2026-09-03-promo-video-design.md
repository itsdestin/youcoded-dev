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

Times are bar boundaries of the music (118 BPM, one bar = 2.03 s) — see "Music" below.
Every beat is one or more recorded shots plus Remotion overlays. "Caption" is the
headline and the sub-line; the mascot column says what the host does.

| # | Bars | Theme | On screen | Caption | Mascot |
|---|---|---|---|---|---|
| 1 | 0–2 | Midnight | Dark backdrop. Wordmark. The app window rises into frame on bar 1. | **YouCoded** / Useful. Fun. Yours. | Peeks up over the bottom edge, looks around, hops onto the window's title bar |
| 2 | 2–5 | Midnight | Empty new session. Cursor taps the **Briefing** quick chip on the downbeat, the prompt fills, Enter, tool cards tick past. | **One tap to start.** / Briefing, inbox, journal. Quick actions you set up once. | Sits on the title bar, watching |
| 3 | 5–8 | Meadow Mist | Attach `Q3-sales.xlsx`, type "sort by amount and add a totals row", then on bar 7 the Session Files panel shows the changed sheet. | **Your files, beside the chat.** / Attach a spreadsheet. Ask. Watch it change. | Hops over to peer at the sheet (curious) |
| 4 | 8–14 | Halftone Dimension | Bar 8: the Games friends lobby, a friend online, **Challenge**. Bars 9–10: Connect 4, pieces dropped both ways. Bar 11: a chess move. Bars 12–13: the Flappy bird flies through pipes while the chat keeps working behind it. | **Play while it works.** / Chess and Connect 4 with friends. Flappy on your own. | Cheers at the challenge; on bar 12 dives INTO the window and becomes the bird (no host on screen during the flight) |
| 5 | 14–18 | Cotton Candy Sky | Bars 14–15: All Sessions → Resume; the Resume browser with dates, tags and notes; a search narrows it. Bar 16: the Organize sheet — a tag and a note go on a conversation. Bar 17: a pill on the session strip is dragged into order. | **Every conversation, findable.** / Search, tag, note, drag into order. | Pops back out of the window onto the title bar; follows the pill along the strip |
| 6 | 18–22 | Devil's Garden | Settings → Remote Access popup (QR + link). Bar 19: a phone frame slides in, the same conversation continues there. Bar 21: the laptop shows "This session is active on Pixel 9 — take over here?", cursor hits **Take over**. | **Start on your laptop. Finish on your phone.** / Same conversation, picked up where you left it. | Hops from the laptop onto the phone and back |
| 7 | 22–29 | Midnight → Golden Sunbreak → Strawberry Kitty → Kuromi Dreamer | Bar 22: "build me a theme with the vibe of outdoor anime art" is sent, the reply lands. Bar 23 (the drop): the whole app becomes Golden Sunbreak. Bar 25: Strawberry Kitty. Bar 27: Kuromi Dreamer. The backdrop washes with each. | **Describe a look. It's yours.** / Or pick one from the community. (the sub-line arrives with the second look) | Shocked, then a new costume with each flip (welcome, cheer, welcome) |
| 8 | 29–33 + tail | Golden Sunbreak | The window settles smaller. Wordmark line, platforms, link. | **Free. Open source.** / Windows · Mac · Linux · Android · github.com/itsdestin/youcoded | Waves, then hops out of the top of frame on bar 32 |

Transitions: the hop-and-wipe above, on every beat boundary. Cuts inside a beat are
straight cuts on a downbeat. Each beat may hold a gentle push-in (2–3 %) on the region
that changed.

## Music

**Arcade synthwave** — Destin's pick from two sketches, 2026-09-03 ("a BANGER"). 118 BPM,
A minor, chiptune pulse arps and a lead hook on top of a four-on-the-floor kick, a saw
bass and a supersaw pad that pump with every kick. Rendered by `scripts/promo/music/song.py`;
`promo_track()` is the approved material arranged to the storyboard:

| Bars | Time | Section | What the video does there |
|---|---|---|---|
| 0–1 | 0.0–4.1 | Intro: arp + pad, hats, riser | Beat 1, the mascot peeks in; the window rises on the riser |
| 2–4 | 4.1–10.2 | **Drop 1**: full groove | Beat 2; the quick chip is tapped on the downbeat of bar 2 |
| 5–7 | 10.2–16.3 | Groove | Beat 3, spreadsheet |
| 8–13 | 16.3–28.5 | Groove + lead hook | Beat 4, games; the hook is the bird's theme on 12–13 |
| 14–15 | 28.5–32.5 | Break: drums out, arp + pad | Beat 5 opens on the Resume browser; quiet so the UI reads |
| 16–17 | 32.5–36.6 | Build: riser, snare roll | The tag, the note, the drag |
| 18–21 | 36.6–44.7 | Groove (half-time snare) | Beat 6: Remote Access, phone, takeover |
| 22 | 44.7–46.8 | Groove, riser, fill + silence gap | The theme request is sent; the reply lands |
| 23–28 | 46.8–59.0 | **Drop 2**: full groove + hook, brighter filter; an accent on 25 and 27 | Beat 7; the flips land on the downbeats of 23, 25 and 27 |
| 29–32 | 59.0–67.1 | Outro: pad and arp thin out | Beat 8, wave-out |
| 33 | 67.1 | Final hit, tail to ~71.6 | Wordmark holds |

The sequencer writes `promo.grid.json` (every bar and beat time, section marks) and the
Remotion timeline reads it, so every cut, caption and hop is placed on the grid.
Delivered at −14 LUFS integrated (loudness-normalised by ffmpeg at the final mux).

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
