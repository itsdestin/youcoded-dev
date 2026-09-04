---
status: active
created: 2026-09-03
updated: 2026-09-04
type: handoff
topic: The Reddit promo video — how it is built, where everything lives, what state it is in, and how to iterate on Destin's feedback.
spec: docs/active/specs/2026-09-03-promo-video-design.md
plan: docs/active/plans/2026-09-03-promo-video-plan.md
---

# Promo video — START HERE

**Round three is in progress (2026-09-04) and the next session continues it.** The process
Destin chose: fixed check-ins, nothing rendered past one until he says go — (1) the question
deck (answered, `docs/active/prototypes/promo-2026-09/deck/promo-v3.answers.json`), (2) the
storyboard page (`storyboard-v3.html`, approved with notes, all applied), (3) the mascot /
captions check-in (`checkin-3.html`, his notes below), (4) one half-size draft of the whole
film, (5) the final. **We are between 3 and 4.**

## Destin's notes on check-in 3, still to build (in this order)

1. **Captions = one top-line section label, and the sub-text as a SPEECH BUBBLE from the
   mascot** that follows it as it moves. The three A/B/C designs on the page are superseded by
   this; keep the payoff-word accent and the theme font. Build it as a still or a 5-second
   clip first (a bubble that pops in beside the host, tail toward it, moves with it), then
   the film.
2. **The hop between beats feels odd — find a better theme transition.** Candidates to show
   him as a short study clip, one after another on the same cut: (a) the host rides the
   accent wipe band across the screen and slides into its perch; (b) a poof-teleport — it
   vanishes in a puff at the old perch and reappears in a puff at the new one, already in the
   new costume; (c) a spin in place — a fast twirl with a squash, the costume changing
   mid-spin, no travel. Keep the landing/settle feel from the study; drop the arc.
3. **Eyes a smidge less dark** — done: `inkFor()` keeps 32 % of the body colour (was 22 %).
4. Then the draft (check-in 4): `npm run render:draft` → `out/draft.mp4`, plus a context-free
   review agent before he sees it (see "Show him early").

Everything else he asked for in round three is built and committed: the punch intro (black,
silent, peek from the left edge, walk, punch, burst into Cotton Candy, "Assistant" rolling
out, music from the hit), the model beat on four favourites (Claude, DeepSeek, Grok, GPT, no
prices), project view folded into the files beat (Econ 201), the phone asking to take over
from Desktop, the marketplace beat on drop 2, the 44-bar track, the classic eyes with a dark
ink on every theme. The full film assembles and renders (self-checked, ~100 s).

## The one-paragraph version

A ~100 s 1920×1080 video of the app (a 7.9 s silent prelude + 44 bars), hosted by the mascot, cut to a synthwave track
composed in code. Three layers: (1) `scripts/promo/music/song.py promo` renders the track
and exports its beat grid as JSON; (2) `scripts/promo/film.sh` films the scenes of the real
renderer in the UI Workbench through headless Chrome, one theme per beat, writing a
**marks file** beside each clip; (3) a Remotion project in `scripts/promo/src/` lays the
clips, captions, the host and its companions, and the sounds on the grid, trimming every
shot by a mark label, and `scripts/promo/render.sh` produces the MP4 at −14 LUFS. Every
cut lands on a downbeat by construction and a test pins it. The backdrop and the host are
one continuous track each across the whole film: the host hops across every cut and
changes costume with the theme.

## Where things are

| What | Where |
|---|---|
| Workspace branch | `feat/promo-video`, worktree `/home/destin/youcoded-dev/worktrees/promo` — **never pushed** |
| App branch (dev-only workbench fakes + fixtures) | `feat/promo-workbench-fakes`, worktree `/home/destin/youcoded-dev/worktrees/promo-fakes` — **PR itsdestin/youcoded#402 open**; the round-three fakes (favourites, install, Econ 201, phone take-over, student mode) are committed but **not yet pushed**. Nothing in it ships to users |
| The latest draft | `scripts/promo/out/draft.mp4` (half size, with music); final renders land in `out/youcoded-promo.mp4` + `-silent.mp4` (all under `out/`, gitignored) |
| The music | `scripts/promo/public/promo.wav` + `.mp3` + `promo.grid.json` + `sfx-{pop,whoosh,chime}.wav` (gitignored; regenerate with `cd scripts/promo/music && python3 song.py promo ../public/promo.wav`, then `ffmpeg -i ../public/promo.wav -codec:a libmp3lame -q:a 2 ../public/promo.mp3`) |
| The footage | `scripts/promo/public/footage/<scene>.webm` + `.webp` poster + `.marks.json` (gitignored; regenerate with `film.sh`) |
| The theme art the overlays use | `scripts/promo/public/themes/<slug>/` (rig, companions, wallpaper, pre-blurred backdrop) + `src/theme-art.generated.ts`, both gitignored — `bash scripts/promo/theme-assets.sh` copies them from the `wecoded-themes` checkout beside the workspace |
| Scenes | `scripts/ui-review/scenes/promo-*.json` (fifteen) + `scenes/flappy-pilot.js`, `scenes/market-chip-sync.js` |
| Timeline | `scripts/promo/src/` — `timeline.ts` (PRELUDE, bars, PRE/POST), `themes.ts` (+ `inkFor`), `host/engine.ts` (the motion engine: actions evaluated per frame), `host/Host.tsx` (the renderer), `host/faces.ts`, `intro/Intro.tsx` (the punch intro, also the study clip), `intro/HostStudy.tsx`, `Backdrop.tsx`, `transitions.tsx`, `Caption.tsx` + `CaptionStudy.tsx`, `captions.ts`, `marks.ts`, `layout.ts`, `beats/beat.ts` (the contract: host actions in local frames) + `beats/Beat1…10.tsx`, `Promo.tsx` |
| Review evidence | `docs/active/prototypes/promo-2026-09/` — the deck + answers, `storyboard-v3.html`, `checkin-3.html` (+ `study/*.mp4`, `storyboard-v3/*.png`), `footage-review.md`, `footage/*.webp`, `marks/<scene>-<mark>.png` |
| Spec / plan | the spec is the storyboard, captions, themes and music table; the plan is the original nine tasks |

## After a fresh clone (or a new machine)

```
cd scripts/promo && npm ci
bash theme-assets.sh                       # rigs, companions, wallpapers → public/themes + the generated module
cd music && python3 song.py promo ../public/promo.wav && cd ..
bash film.sh /path/to/app-worktree         # ~10 min, all scenes
npm run typecheck && npm test && npm run render:draft
```

## How to iterate on feedback

| Destin says… | Change | Then |
|---|---|---|
| a caption / wording | `src/captions.ts` — the test pins every string to the spec's storyboard table, so change the spec row too | `npm test`, draft render |
| the mascot's motion | the beat's `host` actions (`beats/BeatN.tsx`, local frames via `L(id, bar)`), the action library in `host/engine.ts` (hop, walk, punch, look, blink, pose, wave, costume); the arrival hop between beats is generated in `Promo.tsx` | `npx remotion render src/index.ts HostStudy out/host-study.mp4` (~1 min) to judge it alone |
| the intro | `src/intro/Intro.tsx` (`introActions`, IMPACT = timeline PRELUDE) | `npx remotion render src/index.ts Intro out/intro-study.mp4` |
| a beat is too long / short / wrong order | `src/timeline.ts` `BEATS` (bars must tile 0–44) and the music sections in `song.py`'s `promo_track()` — the music and the storyboard are one grid | re-render music, `npm test`, draft render |
| a different theme on a beat | the beat's `slug` (and its `Caption theme=`), the scene's `"theme"`, the spec | re-film that scene, draft render |
| the host does something wrong | the beat's `cues` (LOCAL frames — `L('bN', bar)` for anything on the grid), poses in `src/poses.ts`; the hop/costume/burst mechanics in `Mascot.tsx` | draft render |
| where the window / caption / phone sits | `src/layout.ts` only | draft render |
| what the app is doing on screen | the scene JSON — actions, marks, reply fixtures (`youcoded/desktop/src/renderer/dev/workbench/fixtures/replies/`) | re-film that scene: `bash scripts/promo/film.sh <app-worktree> promo-<x>`; the timeline picks up the new marks with no edit |
| the music (levels, section feel, tempo) | `song.py` `promo_track()` / `render_promo()`; per-bar lift in `LIFT_DB` | `python3 -m unittest test_song`, re-render to `public/`, draft render |
| a transition or the backdrop wash | `src/transitions.tsx` (the slanted accent wipe; `wipeEdge` is shared with the backdrop so both sweep as one), `src/Backdrop.tsx` (circle wash for in-beat flips) | draft render |
| the trim inside a beat | the beat file — only ever `markFrame(scene, label, edge, offset)`; if the frame you want has no mark, add a `"mark"` to the scene action and re-film | draft render |

**Commands** (from `scripts/promo/`): `npm run typecheck && npm test && npm run render:draft`
(half size, ~3.5 min) → look at `out/draft.mp4` (frames via `ffmpeg -i out/draft.mp4 -vf "select='eq(n,N)'" -vsync 0 -frames:v 1 f.png`; a contact sheet: `-vf "select='not(mod(n,30))',scale=320:-1,tile=6x12" -frames:v 1`).
Final: `bash scripts/promo/render.sh` (~10 min). Hand files over as plain paths in chat.

**Show him early — at the check-ins he chose, and not otherwise.** A draft render is four minutes. Destin, 2026-09-04: "i don't want you to keep wasting time rendering and re-rendering without giving me any opportunities to redirect you." Study clips (Intro, HostStudy: one minute each) are how motion is judged; stills are how designs are judged.
**Then have an agent with no context review it** (a general-purpose agent, the draft path,
"watch it as a first-time muted viewer, list findings with frame numbers") — it found nineteen
things on 2026-09-03 that the session that built the cut had stopped seeing.

## Things learned the hard way (do not re-learn)

- **The vendored Golden Sunbreak in the app is stale.** The registry (`wecoded-themes/themes/golden-sunbreak`, 1.2.0) has a rig and four companions; `youcoded/desktop/src/renderer/themes/community/golden-sunbreak` is the 1.0 stills. The workbench fixture was updated on the fakes branch; the app's own vendored copy was not (it may ship to users — a separate decision).
- **A theme's companions keep their own aspect ratio** (`size` is width relative to the mascot; height follows the SVG viewBox). Halftone's bars are 100×6 — drawn square they were a solid box on the mascot's head. A companion named "ghost" is invisible at rest and fades in with motion, like the app.
- **A transition's entering presentation stays mounted at progress 1** for the rest of its sequence. Anything still inside the frame at p = 1 is parked there for the whole beat.
- **The wipe straddles the downbeat** (`PRE` 6 frames before, `POST` 4 after). Every beat but the first therefore starts before its own downbeat; in-beat anchors go through `L(id, bar)`, never `barFrame(bar) - barFrame(start)`.
- **The Flappy autopilot cannot run from the recorder.** `scenes/flappy-pilot.js` runs inside the page (rAF loop, flap rule from the engine's constants), injected by the recorder's `evalFile` action.
- **Marks, never measured frames.** Every trim is `markFrame(...)`. When a beat needs a frame nobody marked, add an in-page observer action to the scene that resolves on the DOM change (`promo-theme.json` `paintN`, `promo-takeover.json` `resumed`). `record.mjs` corrects for the screencast's ~100 ms capture lag; a theme paint still lands ~1.5 frames after its mark, hence `+2` in `Beat7.tsx`.
- **A `drag` mark spans the recorder's whole gesture**, and on a wallpaper-heavy page the ~70 pointer steps run slow (6 s for an 1100 ms drag): anchor the shot on the mark's START.
- **Multiplayer in the workbench** needs `&signedIn=1` (fake opponent "Jake" answers Connect 4 drops; `&bot=passive` keeps him in column 7 so a scripted game cannot end early); `&autoplay=0` keeps the friends lobby. Chess accepts one human move and no reply.
- **`assertClipCovers`** throws at bundle time if a shot would outrun its clip — a frozen last frame is otherwise invisible.
- **`VITE_NO_WATCH=1` serves stale modules**: restart the workbench after any change in the app worktree before filming. `film.sh <path>` refuses a port serving a different tree and only kills a workbench it started.
- **`theme-assets.sh` runs under `set -euo pipefail`**: a `$(ls … | head -1)` for a file that does not exist aborts the script silently — it now has `|| true`.
- Remotion 4.0.520 + Node 26: `node --test` runs the `.ts` tests directly, so `timeline.ts` and `captions.ts` import nothing. The fonts (`@remotion/google-fonts`) fetch at render.

## Open decisions for Destin

- Merge of youcoded#402 (needs a push of the rebased branch first) and of `feat/promo-video` — both after his notes are in.
- The Settings list in the phone beat shows "Backup & Sync — Sync failing" with a red dot for ~1.4 s (a workbench fixture state). Left as is; a fixture flag or a trim would remove it.
- Beat 7 keeps the chat visible through all three looks, so "build me a theme with the vibe of outdoor anime art" sits above Strawberry Kitty and Kuromi; the sub-line "Or pick one from the community." is what explains them.
- The opening: bars 0–1 are the wordmark, the peek and the window rising; a Reddit autoplay preview shows exactly that. A faster open would mean moving drop 1.
- Should the app's vendored Golden Sunbreak be updated to the registry's 1.2.0 (rig + companions)?
