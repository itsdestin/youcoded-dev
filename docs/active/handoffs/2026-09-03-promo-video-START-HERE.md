---
status: active
created: 2026-09-03
updated: 2026-09-04
type: handoff
topic: The Reddit promo video — where it stands, how it is built, how to iterate on Destin's notes, and what he has already decided.
spec: docs/active/specs/2026-09-03-promo-video-design.md
plan: docs/active/plans/2026-09-03-promo-video-plan.md
---

# Promo video — START HERE

## Where we are (2026-09-04, end of the fourth session)

The whole film exists as a **half-size draft with music**: 99 s, ten beats, the mascot narrating.
Destin reviews it **live** — he watches the draft and gives notes with timestamps in chat. The next
session takes his notes, applies them, re-renders the draft, and repeats until he says go; then
the final render (full size, loudness pass) and the wrap-up.

- The draft he is looking at: `docs/active/prototypes/promo-2026-09/study/draft.mp4`
  (and `scripts/promo/out/draft.mp4`, the same file). The page around it, with his five notes on
  the fourth draft and what changed for each: `docs/active/prototypes/promo-2026-09/checkin-5.html`.
- **Open choices:** the caption style — nine animated variants in `study/label-reel.mp4` and the
  settled looks in `storyboard-v3/caption-variants-2.png` (G X P O K S W B R; the film uses G, no
  underline, while he picks; port his pick from `src/LabelStudy.tsx` into `src/Label.tsx` and delete
  the study) — and the script: `narration-v2.md` is written to the footage with a word budget per
  line; he edits the lines there and the beats are updated to match (the beats are the truth).
- The branch: `feat/promo-video` in worktree `/home/destin/youcoded-dev/worktrees/promo`
  (pushed). The app's fixture branch `feat/promo-workbench-fakes`
  (`/home/destin/youcoded-dev/worktrees/promo-fakes`, PR itsdestin/youcoded#402, pushed) holds
  the dev-only workbench fakes the scenes need; nothing in it ships to users. Merge both only
  on his say-so, after the final.

## How Destin wants this to go (his words, this project)

- **Check-ins, not renders.** "i don't want you to keep wasting time rendering and re-rendering
  without giving me any opportunities to redirect you." Nothing goes into the film before he has
  seen it as a still or a short study; the draft is the check-in for the whole.
- **No context-free reviewers any more.** "you can stop using no-context reviewers. i'm
  literally here reviewing it live." Do your own frame check (contact sheet + the frames you
  changed), then hand him the path.
- **Files as plain paths in chat**, never artifacts or file cards.
- **The mascot is a presenter, not a distraction.** "each animation should be obviously tied to
  something in the demo or in his speech." It hops to the feature it talks about (inside the
  window when that is where the feature is), points while its bubble is up, holds still otherwise.
- **Premium, not "cheap phone game".** Anticipation, weight, settle; the warm faces; no jump
  between beats (the three theme-change moves instead).
- **Copy:** short, concrete, no AI-isms, no invented numbers ("There are hundreds." was a lie —
  the theme registry is small). Bubbles must be readable: ≥ 1.2 s + a quarter second a word.
- The close ends with the host standing left of the Y in "YouCoded", like the start — inside a big modal in the middle of the window, which has grown to fill the frame (2026-09-04).

## What is approved

The punch intro (black, silent 6.5 s, the peek — the APP's docked side-peek, mittens on the edge and the body leaning 75° between them, then a step out with its own arms, a look around, the walk — the punch on bar 0, the burst
into Cotton Candy Sky, "Assistant" wiping on, the group centred, the window rising) · the warm
face set (`faces-warm.png`; also the guideline for the app's own rigs, filed under
`docs/roadmap/themes.md`) · the three theme-change moves rotating across the cuts (quick-change,
poof, twirl) · the presenter model with speech bubbles · the app filmed 25 % zoomed in · the
games beat in Golden Sunbreak (the golden Flappy bird) · the in-key sparkle on theme flips ·
112 BPM, 42 bars · the narrator script `docs/active/prototypes/promo-2026-09/narration-v1.md`
(edit it and mirror the lines into the beats — the beats are the truth).

## The pipeline in one paragraph

Three layers. (1) **Music**: `scripts/promo/music/song.py promo` renders the track from code
(112 BPM, 42 bars: punch on bar 0, drop 1 on 6, drop 2 on 33, outro 38–40, final hit 41, 2.5 s
tail) and writes `public/promo.grid.json` + every `sfx-*.wav`. (2) **Footage**:
`bash scripts/promo/film.sh <app-worktree> [scene…]` films the real renderer in the UI Workbench
through headless Chrome, one JSON scene per clip (`scripts/ui-review/scenes/promo-*.json`,
`zoom: 1.25` on the desktop ones), writing a **marks file** beside each clip; every trim in the
timeline is a mark, never a measured frame. (3) **Remotion** (`scripts/promo/src/`): the beats
lay the clips on the bar grid, the host is one continuous action list across the film, the
backdrop one theme track, the bubbles one cue list. `npm run render:draft` → `out/draft.mp4`
(half size, ~4 min). `bash scripts/promo/render.sh` → `out/youcoded-promo.mp4` at −14 LUFS
(+ a silent copy).

## How to iterate on his notes

| He says… | Change | Then |
|---|---|---|
| a line the host says, or when | the beat's `present('bN', [...])` lines in `src/beats/BeatN.tsx` (`say`, `at` in local frames, `until`, `face`, `side`); keep `narration-v2.md` in step. **A line that cannot be read in its slot fails the build** (`present()` throws with the line, the slot and the shortfall — Destin's rule, 1.2 s + ¼ s a word; the old presenter pushed lines later silently, which put "Golden hour" on the wrong theme). A one-bar shot fits two words | `bash scripts/promo/cues.sh` (2 s, no browser: every bubble with its frame, theme, costume and stand — or the first timing error), then the draft |
| the host should stand somewhere else / point at something | the line's `target: inWindow(fx, fy)` — the THING the line is about — plus `stand: 'L' \| 'R' \| 'above' \| 'bar'` (which side of it to stand on); `present()` computes the spot, aims the arm at the true angle (engine `aim`), turns the eyes, and puts the bubble on the far side. `stay: true` = aim from where he is (no hop); `spot` = an explicit box position. **Measure targets on a FULL frame or the top-left tile of a 2×2 sheet** — the model-list target was measured a whole tile off once and stood him on the dialog | draft render, then `bash scripts/promo/line-sheets.sh <dir>` — one still per line, four per sheet — and LOOK at them |
| a move looks wrong / add a gesture | `src/host/engine.ts` — `A.point/tada/cheer/clap/nod/startle/wave/walk/hop/twirl/vanish+appear/quickChange/shutdown/wake`; the presenter rule itself is `present()` in `src/beats/beat.ts` | `npx remotion render src/index.ts HostStudy out/x.mp4` or the draft |
| the intro | `src/intro/Intro.tsx` (`introActions`; `IMPACT` must equal `PRELUDE` in `timeline.ts`). The peek is `A.peekIn(at, dur, y, size, reveal)` + `A.stepIn` in `engine.ts`, drawn by `Host.tsx` as the app's docked side-peek (mittens pinned on the edge, the body's own arms hidden, a 75° lean about the box centre — the numbers are BuddyMascot's PeekHands + buddy.css). Two earlier peeks (a lone hand rectangle; a long reaching arm) were both rejected as "cooked" — do not reinvent it, match the app | `npm run study -- Intro out/intro-study.mp4` (1 min) |
| a face | `src/host/faces.ts` `WARM` (SVG in the rig's viewBox; `warmEye`, `warmBrow`); the sheet: `node faces-sheet.mjs <out.png> warm` | the sheet |
| the headline | `src/Label.tsx` (glow only, no underline); the strings in `src/captions.ts` (the test pins them to the spec's storyboard table — change the spec row too); the nine animated variants are `src/LabelStudy.tsx` (`LabelReel`, `Label<D>` stills in `Root.tsx`) | `npm test`, draft; `npm run study -- LabelReel out/label-reel.mp4` |
| a bubble's look | `src/Bubble.tsx` (pinned to the host's head; side locked per cue) | draft |
| the music (tempo, bars, levels) | `music/song.py` `promo_track()`; bars and sections must match `src/timeline.ts` `BEATS` and both tests (`music/test_song.py`, `src/timeline.test.ts`) | `python3 song.py promo ../public/promo.wav && python3 test_song.py`, `npm test`, draft |
| a beat longer/shorter/reordered | `BEATS` in `timeline.ts` (bars must tile 0–42) + the song's sections | as above |
| what the app does on screen | the scene JSON (actions by selector, `mark`s, reply fixtures in `youcoded/desktop/src/renderer/dev/workbench/fixtures/replies/`); a different theme = the scene's `theme` + the beat's `slug` | `bash scripts/promo/film.sh /home/destin/youcoded-dev/worktrees/promo-fakes promo-<x>` (one scene ~1 min; the marks flow through with no edit), draft |
| a shot shows loading / the wrong moment | the beat's `*_FROM` (`markFrame(scene, mark, edge, offset)`) and `rate` (a static screen can run at 0.6–0.8× to fit; `assertClipCovers` throws at bundle time if a shot outruns its clip) | draft |
| the theme-change move on a cut | `CYCLE` / `arrival()` in `src/Promo.tsx`; Beat3's in-place flips in `Beat3.tsx` | draft |
| the sound on a moment | `<Sfx at name volume>` in the beat; new sounds in `music/synth.py` + `SFX` in `song.py` + `SECONDS` in `src/beats/sfx.tsx` | re-render the track |
| the close | `src/beats/Beat10.tsx`: the window grows to `SCALE` 1.15 (fills the frame), a scrim, the `MODAL` box in the middle holding the wordmark, the platforms and the site (Destin, 2026-09-04: "a nice big popup modal in the middle of that youcoded window"), `Y_SPOT` beside the Y inside it, the wave/cheer/shutdown; `TAIL_FRAMES` in `timeline.ts` | `npm run study -- CloseStudy out/close-study.mp4 --scale 0.5` (1 min), then the draft |

**Commands** (from `scripts/promo/`): `npm run typecheck && npm test && npm run render:draft`.
Frames: `ffmpeg -i out/draft.mp4 -vf "select='eq(n\,N)'" -frames:v 1 f.png`; contact sheet:
`-vf "select='not(mod(n\,24))',scale=320:-1,tile=8x16" -frames:v 1 sheet.jpg`. Hand him paths.

## File map

| What | Where |
|---|---|
| Timeline & grid | `src/timeline.ts` (PRELUDE 196, PRE 6 / POST 4, BEATS, TAIL_FRAMES 74), `src/grid.ts` (reads the grid JSON) |
| Assembly | `src/Promo.tsx` — `assemble(ids)` builds any subset of beats (the film, or a study), the arrival moves, the band overlay, the bubbles; `Film`, `Promo` |
| A beat | `src/beats/BeatN.tsx` — shots (`Footage` from marks), the `Label`, `present([...])` lines, extras with a cause; the contract and the presenter rule in `src/beats/beat.ts` |
| The host | `src/host/engine.ts` (state + actions, evaluated per frame), `src/host/Host.tsx` (draws the rig, the blur on a twirl, the peek hand, the rim on dark themes; falls back to a face the rig has), `src/host/faces.ts` (the warm set), `src/poses.ts` (Face type, pivots) |
| The intro | `src/intro/Intro.tsx` (+ `HostStudy.tsx`, `studies/TransitionStudy.tsx` — older studies) |
| Captions | `src/Label.tsx` (the headline), `src/Bubble.tsx` (the host's lines), `src/captions.ts` (headline strings), `src/LabelStudy.tsx` (the five variants), `src/Caption.tsx` (the close's wordmark lines + the fonts) |
| Look | `src/themes.ts` (colours, fonts, `inkFor`), `src/Backdrop.tsx`, `src/transitions.tsx` (the wipe, `bandHitFrame`, `BandOverlay`), `src/layout.ts` (the window rect, `perch`, the phone), `src/Window.tsx`, `src/Phone.tsx`, `src/Footage.tsx`, `src/marks.ts` |
| Music | `music/song.py`, `music/synth.py`, `music/test_song.py`; outputs in `public/` (gitignored) |
| Footage | `public/footage/<scene>.webm` + `.marks.json` (gitignored; `film.sh` regenerates); posters and one still per mark under `docs/active/prototypes/promo-2026-09/footage/`, `…/marks/` |
| Theme art | `public/themes/<slug>/` + `src/theme-art.generated.ts` (gitignored; `bash theme-assets.sh`) |
| Review evidence | `docs/active/prototypes/promo-2026-09/` — `checkin-3*.html`, `checkin-4.html`, `study/*.mp4`, `storyboard-v3/*.png` (faces, captions), `narration-v1.md`, the deck + answers |

## After a fresh clone

```
cd scripts/promo && npm ci
bash theme-assets.sh
cd music && python3 song.py promo ../public/promo.wav && cd ..
bash film.sh /home/destin/youcoded-dev/worktrees/promo-fakes      # ~10 min, all scenes
npm run typecheck && npm test && npm run render:draft
```

## Things learned the hard way (do not re-learn)

- **One render at a time.** Two parallel `remotion render`s hung one of them at 0 % CPU for
  twelve minutes. Do not render while `film.sh` is recording either (the screencast drops frames).
- **The Bash tool's `cd` persists.** A `cd out` or `cd music` in one command leaves the next
  command there; a whole batch of edits once silently "applied" to files that were not there.
  Use absolute paths or lead with `cd /home/destin/youcoded-dev/worktrees/promo/scripts/promo`.
- **`ffprobe -count_frames … -of csv=p=0` prints a trailing comma**; `| tr -d ','` before arithmetic.
- **Loading screens are on camera unless you cut them.** The model picker shows "Loading models…"
  for 1.6 s; the Projects page shows empty then "Loading files…"; a theme's wallpaper lands ~10
  frames after its paint mark. Open a shot after the load (`markFrame(..., +N)`) or split it.
- **A static shot can run slower than 1×** to fit its bars (Beat3's last theme, Beat9's grid);
  at 1× it runs into the next click (the marketplace dialog opened, shut and reopened).
- **A shot's first frame at rate 1.6× reaches the clip's next event sooner than you think** —
  the sort in Beat5 was never on camera in the first shot; the lines had to follow the footage.
- **A theme's own rig has only the contract's five faces.** `happy`, `smug`, `shutdown` (and
  sometimes `dizzy`) exist only in the warm set on the default rig; Host falls back, but a
  custom-rig costume will never show them.
- **The bubble's side is decided once per cue** from the host's position on the cue's first
  frame and whether the text fits; a per-frame choice flipped it mid-word. A line's minimum
  reading time can push the NEXT line later — that is deliberate.
- **The word "Assistant" must be revealed by a wipe over a stationary word.** Sliding it out
  from behind "YouCoded" always led with its last letters.
- **A first line with a stand cannot hop before the arrival move has landed** (frame 46): if it
  starts earlier, `present()` makes that stand the beat's `home`, so the arrival lands there
  directly (one move, not two). Extras a beat adds (twirls, the dive) are timed to marks and use
  `P.where(frame)` for the spot the host is on at that frame.
- **Never `str.replace(a, b)` with an `a` that might be empty.** A slice whose end marker sat
  before its start came back `''`, and Python's replace then inserted the new block between every
  character of `Host.tsx` (85,000 lines). Assert the slice is non-empty, or use the Edit tool.
- **`zoom` in a scene** lays the page out at W/zoom × H/zoom CSS px at `zoom` device pixels per
  CSS px — real pixels, selectors unchanged; the phone scenes stay at 1.
- The older lessons still hold: marks, never measured frames; the wipe straddles the downbeat
  (`L(id, bar)` for anything on the grid); `assertClipCovers` at bundle time; a transition's
  entering presentation stays mounted at progress 1; companions keep their own aspect; the
  Flappy autopilot runs inside the page; `VITE_NO_WATCH=1` serves stale modules — restart the
  workbench after any app change; `theme-assets.sh` runs under `pipefail`.

## Open decisions for Destin

- The caption style (G X P O K S W B R — `label-reel.mp4`), then port it into `Label.tsx`.
- The script: his edits to `narration-v2.md` (word budget per line), mirrored into the beats.
- The Golden Sunbreak sun companion floats above-left of the golden host; a first-time viewer
  read it as a stray particle. Keep (theme identity) or drop it from the film's companions.
- The Flappy bird is the game's own size (~20 px at full frame); nothing in the film can
  enlarge it without changing the app's game.
- The phone beat's Settings list shows "Backup & Sync — Sync failing" for ~1.4 s (a fixture state).
- Merge of youcoded#402 and of `feat/promo-video`, after the final.
- Should the app's vendored Golden Sunbreak be updated to the registry's 1.2.0 (rig + companions)?
