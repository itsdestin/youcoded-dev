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
understand what YouCoded is. It shows the app doing eight things, one after another,
with the assistant mascot as the through-line: it peeks in at the start, flies in the
game, changes costume with the theme, and waves out at the end.

Tone: whimsical (the mascot, the game, the theme transformation) over a badass spine
(fast cuts, the app doing several things at once, one-line captions, no narration).

Not a landing-page replacement. The landing page's loops stay as they are; this borrows
the same rig and the same fixtures.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Footage | The real renderer in the UI Workbench (fake backend), filmed by `scripts/ui-review/record.mjs` | It is how every landing-page loop is made; nothing touches Destin's live app |
| Assembly | **Remotion** (React-in-video, free for individuals) in a new `scripts/promo/` folder | Frame-accurate transitions, captions, overlays and music in code; ffmpeg alone looks basic, and a hand-rolled frame stepper would be a worse Remotion |
| Output | 1920×1080, 30 fps, H.264 MP4, stereo AAC (silent track if no music) | What Reddit accepts and autoplays; the promo scenes are filmed at 30 fps so no frame is doubled |
| Sound | **Composed in code** (`scripts/promo/music/`, a numpy synthesizer + sequencer) at a fixed tempo, structured to the storyboard's sections. The sequencer exports the beat grid as JSON and Remotion places every cut, caption hit and the theme drop on it. Small UI-style sounds (a pop when the mascot lands, a whoosh on cuts) come from the same synth. Captions still carry the video for muted autoplay | Destin: music must feel integrated, beats matched, not dropped in (2026-09-03). A generated track is the only kind whose grid we know exactly |
| Spreadsheet beat | **Assistant-only.** The user asks; the panel shows the sheet change | In-grid editing does not exist (roadmap: `docs/roadmap/files.md`, filed 2026-09-03). Not faked |
| Theme beat | **One-shot.** The theme applies the moment the assistant finishes | Promo fudge Destin approved; the real flow goes through the marketplace card |
| Takeover beat | The real "This session is active on {device} — take over here?" dialog, triggered by a workbench fake | The dialog and copy are real; only the trigger is faked |
| Mascot | The app's default buddy rig (`default-buddy-rig.ts`, the same parts and pivots the app poses) driven by Remotion springs with the app's constants; Golden Sunbreak's still SVGs for the costume change | The rig is a plain SVG string with named parts, so posing it outside the app is CSS transforms; Golden Sunbreak ships stills, not a rig |
| Copy | Short captions, plain words; the landing page's banned list applies (no "real app", "real files", "actually", "does real work", "self-improving") | `.claude/rules/landing-page.md` |

## Storyboard

Times are bar boundaries of the music (118 BPM, one bar = 2.03 s) — see "Music" below.
Every beat is one recorded scene plus Remotion overlays. "Caption" is the one line on
screen; the mascot column says what the host does.

| # | Time | On screen | Caption | Mascot |
|---|---|---|---|---|
| 1 | 0–4 s (bars 0–1) | Dark backdrop. The app window rises into frame. Wordmark. | **YouCoded** — Useful. Fun. Yours. | Peeks up over the bottom edge (peek pose), looks around (curious), hops onto the window's title bar |
| 2 | 4–12 s (bars 2–5) | Empty new session (midnight). Cursor taps the **Briefing** quick chip, the prompt fills, Enter, tool cards tick past. | Start with one click. | Sits on the title bar, watching |
| 3 | 12–20 s (bars 6–9) | Attach `Q3-sales.xlsx`, type "sort by amount and add a totals row", the Session Files panel opens and shows the changed sheet. | Your files, right beside the chat. | Leans in (inquisitive) as the panel opens |
| 4 | 20–28 s (bars 10–13) | Type a bigger task, open **Games → Flappy**, the mascot-bird flaps through pipes while the chat keeps working behind it. | Play while it works. | *Is* the bird (in the footage). The host copy on the title bar is hidden for this beat so there is one mascot on screen |
| 5 | 28–33 s (bars 14–15) | Session strip. A pill is dragged two places left; the others step aside. | Drag your conversations into order. | Watches the pill go by, head turns |
| 6 | 33–43 s (bars 16–20) | Settings → Remote Access popup (QR + link). Cut: a phone frame slides in, the same conversation continues there. Cut back: the laptop shows the takeover dialog "This session is active on Pixel 9 — take over here?", cursor hits **Take over**, the chat catches up. | Start on your laptop. Finish on your phone. | Hops from the laptop frame onto the phone frame and back |
| 7 | 43–59 s (bars 21–28) | Type "build me a theme with the vibe of outdoor anime art" under the build (bars 21–22). The reply lands and the whole app becomes Golden Sunbreak on the downbeat of bar 23 (47 s) — one continuous clip, no cut. | Describe a look. It's yours. | Changes costume to the Golden Sunbreak mascot on the flip (shocked pose, then welcome) |
| 8 | 59–69 s (bars 29–33) | The window settles, backdrop tints to the theme. Wordmark, platforms, link. | Free. Open source. Windows · Mac · Linux · Android. github.com/itsdestin/youcoded | Waves (welcome pose), then hops out of frame |

Transitions: a fast slide or a hard cut between beats, always on a downbeat, never a
crossfade longer than 250 ms. Each beat may hold a gentle push-in (2–4 %) on the region
that changed.

## Music

**Arcade synthwave** — Destin's pick from two sketches, 2026-09-03 ("a BANGER"). 118 BPM,
A minor, chiptune pulse arps and a lead hook on top of a four-on-the-floor kick, a saw
bass and a supersaw pad that pump with every kick. Rendered by `scripts/promo/music/song.py`
from `synth.py`; the sketch that was approved is `arcade_synthwave()` and the full track
is the same material arranged to the storyboard:

| Bars | Time | Section | What the video does there |
|---|---|---|---|
| 0–1 | 0.0–4.1 | Intro: arp + pad, hats, riser | Beat 1, the mascot peeks in; the window rises on the riser |
| 2–5 | 4.1–12.2 | **Drop 1**: full groove | Beat 2; the quick chip is tapped on the downbeat of bar 2 |
| 6–9 | 12.2–20.3 | Groove | Beat 3, spreadsheet |
| 10–13 | 20.3–28.5 | Groove + lead hook | Beat 4, Flappy; the hook is the bird's theme |
| 14–15 | 28.5–32.5 | Break: drums out, arp + pad | Beat 5, the drag; quiet so the motion reads |
| 16–17 | 32.5–36.6 | Build: riser, snare roll | Beat 6 opens on the Remote Access popup, phone slides in |
| 18–20 | 36.6–42.7 | Groove (half-time snare) | Phone continues, takeover dialog, Take over |
| 21–22 | 42.7–46.8 | Groove continues, riser | Beat 7 begins: the theme request is typed, the tool cards tick |
| 22, last beat | 46.3 | Fill + silence gap | The reply lands |
| 23–28 | 46.8–59.0 | **Drop 2**: full groove + hook, brighter filter | Beat 7; the theme applies on the downbeat of bar 23 |
| 29–32 | 59.0–67.1 | Outro: pad and arp thin out | Beat 8, wave-out |
| 33 | 67.1 | Final hit, tail to ~69.5 | Wordmark holds |

The sequencer writes `<track>.grid.json` (every bar and beat time, section marks) and the
Remotion timeline reads it, so every cut, caption and mascot hop is placed on the grid.
UI-style sounds from the same synth: a soft pop when the mascot lands, a whoosh on each
cut, a chime when the theme applies. Delivered at -14 LUFS integrated (loudness-normalised
by ffmpeg at the final mux) so Reddit does not turn it down.

## Footage: one scene file per beat

All under `scripts/ui-review/scenes/promo-*.json`, filmed at **1440×900, 30 fps** (shown at
98 % — 1:1 pixels, so the app's text is as crisp as the app — inside a fixed layout: headroom
above the window for the host, a caption band below it) except the phone scene at 390×844
with `platform=android`. The layout is one file (`src/layout.ts`) approved from a still
before any beat is built. Each clip comes with a **marks file** (the video time of every
scene action), and the timeline trims to those labels — a re-film never breaks the edit.

| Beat | Scene | Needs |
|---|---|---|
| 2 | `promo-quick-chip` | `scenario=site&seed=none&reply=briefing` — a new reply fixture, 1 turn |
| 3 | `promo-sheet` | The spreadsheet fixture and writable-artifacts mock from `feat/landing-demo-clips` (`ef38bfc0`, worktree `grok-clip`) cherry-picked to master, plus a reply fixture whose tool card rewrites the sheet |
| 4 | `promo-flappy` | `record.mjs` learns `Space` as a key and an `autopilot` action that reads the bird and the next gap off the DOM and flaps when needed (the game has no autopilot of its own). `reply=flappy-task`, a ~10 s multi-tool fixture |
| 5 | `promo-strip` | `scenario=default`; the existing `drag` action |
| 6a | `promo-remote` | A workbench fake for `remote.*` (enabled, a link, one connected phone) so the popup renders |
| 6b | `promo-phone` | Same as `row5-phone` (`platform=android`, `autoplay=`) |
| 6c | `promo-takeover` | A workbench fake for `syncSpaces.leaseQuery/leaseTakeover` behind `?lease=held:Pixel%209`, so resuming the session raises the dialog |
| 7 | `promo-theme` | `reply=theme-builder` plus a one-shot apply: the scene's last action switches the theme through the workbench's appearance hook when the final turn lands |

Every workbench fake is dev-only code (the workbench never ships to users) and lands on
`youcoded` master through a normal PR. The rig changes (`Space`, `autopilot`, `fps`, the marks file) land in
`youcoded-dev`.

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
