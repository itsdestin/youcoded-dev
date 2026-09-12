# Making a YouCoded video

The Reddit promo (2026-09-03 → 04) was built here, and everything it took stays, so the next
film starts from this folder and not from scratch. The finished film, its spec, plan, hand-off
and every check-in page are in `docs/archive/` (`…/handoffs/2026-09-03-promo-video-START-HERE.md`
is the blow-by-blow of how the first one was iterated with Destin). The final renders of the
first film live outside the repo at `~/Videos/youcoded-promo/` with the filmed footage beside them.

The second cut (2026-09-09, `docs/archive/design/2026-09-09-promo-second-draft/` holds its five
decks and his answers) is in `~/Videos/youcoded-promo/2026-09-09/`: 120 BPM on 49 bars (1:45, was
2:03), a three-part walk-in, frosted one-path speech bubbles with a curled tail, Devil's Garden as
the third look, the conversations beat in four bars, the app filmed at 1.35 zoom, and a reworked
synthwave track (a four-bar melody, keys, a second progression, real dynamics) beside two
alternates — `promo-lofi` and `promo-pop` — on the same bar plan, so a swap changes no cut.

## The pipeline in one paragraph

Three layers. (1) **Music**: `music/song.py promo` renders the track from code (112 BPM, 53 bars
for the first film: punch on bar 0, drop 1 on 7, drop 2 on 21, outro 49–51, final hit 52, 2.5 s
tail) and writes `public/promo.grid.json` + every `sfx-*.wav`. (2) **Footage**:
`bash film.sh <app-worktree> [scene…]` films the real renderer in the UI Workbench through
headless Chrome, one JSON scene per clip (`scripts/ui-review/scenes/promo-*.json`, `zoom: 1.25`
on the desktop ones), writing a **marks file** beside each clip; every trim in the timeline is a
mark, never a measured frame. (3) **Remotion** (`src/`): the beats lay the clips on the bar grid,
the host is one continuous action list across the film, the backdrop one theme track, the bubbles
one cue list. `npm run render:draft` → `out/draft.mp4` (half size, ~6 min). `bash render.sh` →
`out/youcoded-promo.mp4` at −14 LUFS (+ a silent copy).

## How Destin works on a film (his rules, from the first one)

- **Check-ins, not renders.** Nothing goes into the film before he has seen it as a still or a
  short study. **A draft or final render is HIS call, every time** (2026-09-09: "STOP doing full
  video renders without my approval … iterate with only screenshots and partial elements") —
  render the affected frames as stills (`npx remotion still src/index.ts Promo out/x.png --frame N`,
  or one `remotion bundle` and stills off the bundle) and put them on a deck; ask before a draft.
- **He edits the script himself** on the script editor (below): one card per line with the
  frame from the draft, a word budget per slot, drag-reorderable sections. His submit is the
  source; the session applies it (and re-cuts the timing to it, not the other way round).
- **No context-free reviewers** when he is reviewing live. Do your own frame check (a contact
  sheet + one still per line, `line-sheets.sh`), then hand him paths — plain paths in chat, never
  artifacts or file cards.
- **The mascot is a presenter, not a distraction.** Every line names the thing it is about; the
  host stands beside it and points at it, and holds still otherwise. Premium, not "cheap phone
  game": anticipation, weight, settle; the warm faces; no jump between beats.
- **Copy:** short, concrete, no AI-isms, no invented numbers. A bubble must be readable:
  1.2 s + a quarter second a word — enforced, a line that does not fit fails the build.

## The tools

| Tool | What it does |
|---|---|
| `bash film.sh <app-worktree> [scene…]` | films the scenes (~1 min each, ~10 min all) into `public/footage/` with a marks file each; posters + one still per mark under `out/review/` |
| `npm run render:draft` · `bash render.sh` | the half-size draft · the final with the loudness pass. One render at a time (`flock /tmp/promo-render.lock`): two at once hung one for 12 min. Run a render with `run_in_background` and act on its completion notice; to wait for one from another command, `flock /tmp/promo-render.lock true` — never an `until ! pgrep -f …` loop, which matches its own shell and never ends |
| `npm run study -- <Composition> out/x.mp4 [--scale 0.5]` | any single composition: `Intro`, `CloseStudy`, `PresentStudy`, `HostStudy`, `LabelReel`, the `End*` stills |
| `bash cues.sh [out.json]` | every speech bubble with its frame, theme, costume, stand and visibility — or the first timing error — in 2 s, no browser |
| `bash still-sheets.sh <dir>` | the same sheets WITHOUT a draft: one bundle, then one still per line off it (~2 s a still) — the check-in for stands and bubbles since drafts became Destin's call (2026-09-09) |
| `bash line-sheets.sh <dir>` | one still per line from `out/draft.mp4`, four per sheet, in film order — the check that every line stands beside its thing on its own theme |
| `python3 script-editor.py [--fresh]` | Destin's editor: serves on 127.0.0.1:8791, saves as he types to `out/script-editor/`, prints every changed line, note and the section order on Submit. Run it in the background; its exit is his Submit. NEVER restart it or delete its answers while he may be typing |
| `music/song.py promo ../public/promo.wav` · `python3 -m unittest test_song` | the track and its pinned bar plan; `promo-lofi` / `promo-pop` render the alternates, and `npm run render -- --props '{"track":"promo-lofi"}'` films with one |
| `npm run typecheck && npm test` | types; the timeline tiles its bars; every caption is a string from the spec |

## How to change things

| To change… | Edit | Then |
|---|---|---|
| a line, or when | the beat's `present('bN', [...])` lines in `src/beats/BeatN.tsx` (`say`, `at` in local frames, `until`, `face`, `side`). A line that cannot be read in its slot throws with the line, the slot and the shortfall; a one-bar shot fits two words | `bash cues.sh`, then the draft |
| where the host stands, what it points at | the line's `target: inWindow(fx, fy)` — the THING the line is about — plus `stand: 'L' \| 'R' \| 'above' \| 'bar'`; `present()` computes the spot, `aim` turns the arm to the true angle, the bubble goes on the far side. `stay: true` = aim from where he is; `spot` = an explicit box. Measure targets on a FULL frame or the top-left tile of a 2×2 sheet | the draft, then `line-sheets.sh` and LOOK |
| a move or gesture | `src/host/engine.ts` — `A.aim/point/tada/cheer/clap/nod/startle/wave/walk/hop/twirl/vanish+appear/quickChange/shutdown/sitTuck/wake/peekIn/stepIn`; the presenter rule is `present()` in `src/beats/beat.ts` | a study, or the draft |
| the open | `src/intro/Intro.tsx` (`introActions`; `IMPACT` must equal `PRELUDE`). The peek is the APP's docked side-peek (mittens on the edge, the body leaning 75° between them) — do not reinvent it | `npm run study -- Intro out/intro-study.mp4` |
| the close | `src/beats/Beat10.tsx`: the window grows to fill the frame, a scrim, the modal, `Y_SPOT`, the cheer → ta-da; `POWER_DOWN` and `studies/EndPoseStudy.tsx` hold sixteen end-pose candidates he has not picked from | `npm run study -- CloseStudy …` |
| a face | the RIG's own faces first: every theme rig and the app's default rig carry idle, welcome, curious, shocked, dizzy, happy and shutdown. `src/host/faces.ts` `withFilmFaces` adds only what a rig lacks (smug, asleep, dozy, drawn from `WARM`) in that rig's ink. The default rig is a copy of the app's (`src/rig.ts`) painted by `themes.ts` `mascotPaint` — re-copy both when the app's change | a still (`npx remotion still …`) |
| the headline | `src/Label.tsx` (glow, no underline — his pick); strings in `src/captions.ts` (pinned to the spec's storyboard table) | `npm test` |
| a bubble's look | `src/Bubble.tsx` — pinned to the head, side locked per cue, wraps to the room on its side, width measured word by word | the draft |
| the music | `music/song.py` `promo_track()`; bars and sections must match `src/timeline.ts` `BEATS` and both tests | re-render the track, `npm test` |
| a beat longer/shorter/reordered | `BEATS` in `src/timeline.ts` (bars must tile; the list's ORDER is the film's order and `src/beats/index.ts` must match) + the song's sections. Beats name their moments with `B('bN', k)`, bars relative to their own start, so a reorder never touches a beat | as above |
| what the app does on screen | the scene JSON (actions by selector, `mark`s, reply fixtures under `youcoded/desktop/src/renderer/dev/workbench/fixtures/replies/`) | `film.sh <worktree> <scene>` |
| a shot shows loading / the wrong moment | the beat's `*_FROM` (`markFrame(scene, mark, edge, offset)`) and `rate` (a static screen may run at 0.6–0.8×; `assertClipCovers` throws when a shot outruns its clip) | the draft |

## Things learned the hard way

- One render at a time; never render while `film.sh` is recording.
- **Scenes rot against the app.** Every re-film after a few days of app work broke a scene or three:
  a reworded tool line (`waitForText`), a picker that lost its field, a title that became a Rename
  control. `record.mjs` now keeps the frame it died on as `<scene>.fail.png` — read it before
  guessing; the app's source names the new selector. 2026-09-10: eight of fifteen scenes broke at
  once because the app's hover hints replaced `title=` — a hinted control carries its words as
  `data-hint=` now, so address it `[title='X'], [data-hint='X']`.
- The bubble's tail is drawn ON the corner arc when the bubble is short (`attach()` in Bubble.tsx):
  a straight edge that no longer exists at that height cannot be attached to — three decks of
  "there's still a gap" before that was understood.
- The push-in zooms the footage, never the panel: a panel scaled by a creeping value shimmers at
  its edges (the ring, the rounded clip and the shadow re-rasterise every frame).
- The Bash tool's `cd` persists between calls — lead every command with an absolute path.
- Loading screens are on camera unless you cut them; a theme's wallpaper lands ~10 frames after
  its paint mark; a shot's first frame at 1.6× reaches the next event sooner than you think.
- A face a rig lacks draws NOTHING (a blank head), so Host falls back to one it has. Never
  replace a rig's own faces with the film's: the rigs took the warm set on 2026-09-05, and the
  film's copies are the older drawings.
- The bubble's side is decided once per cue; a long line wraps to the room on its side.
- A first line with a stand cannot hop before the arrival lands (frame 46): start it earlier and
  the arrival lands there directly. The move after the Flappy dive must be the poof (the only
  move that starts from nothing).
- `pgrep -f`/`pkill -f` a pattern in your own command line matches the shell running it (an
  `until ! pgrep …` wait loop never ends; `pkill -f script-editor` killed the server AND the
  shell). Kill by pid.
- Never `str.replace(a, b)` with an `a` that may be empty: it inserts `b` between every character.
- The music's structure is keyed by bar in `song.py` (`LIFT_DB`, the risers, the fills, the gap,
  the hook entries): a re-cut edits all of them.
- The arms hang from the body's mid-sides; a pose that needs hands lower (the sit-and-tuck) has
  to slide them (`tuck`).

## After a fresh clone

```
cd scripts/promo && npm ci
bash theme-assets.sh
cd music && for t in promo promo-lofi promo-pop; do python3 song.py $t ../public/$t.wav; done && cd ..
bash film.sh <app-worktree>            # ~10 min, all scenes — or copy ~/Videos/youcoded-promo/footage/ into public/footage/
npm run typecheck && npm test && npm run render:draft
```
