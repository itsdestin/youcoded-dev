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

Destin saw the first full cut on 2026-09-03 and asked for a re-cut: more themes, the
backdrop and the mascot changing colour with them, a "manage your conversations" beat
instead of the drag beat, games "with friends" with a bounce to chess or Connect 4,
better-styled and more informative captions, better transitions, and the rigged golden
mascot instead of the old flat one. The re-cut is built and was reviewed by an agent with
no context (its findings are folded in). **The next session's job is Destin's notes on
the re-cut** — iterate, show him drafts early, do not open PRs until he is happy.

## The one-paragraph version

A ~72 s 1920×1080 video of the app, hosted by the mascot, cut to a synthwave track
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
| App branch (dev-only workbench fakes + fixtures) | `feat/promo-workbench-fakes`, worktree `/home/destin/youcoded-dev/worktrees/promo-fakes`, rebased on master 2026-09-03 — **PR itsdestin/youcoded#402 open**, the rebase + three later commits not yet pushed. Nothing in it ships to users |
| The latest draft | `scripts/promo/out/draft.mp4` (half size, with music); final renders land in `out/youcoded-promo.mp4` + `-silent.mp4` (all under `out/`, gitignored) |
| The music | `scripts/promo/public/promo.wav` + `.mp3` + `promo.grid.json` + `sfx-{pop,whoosh,chime}.wav` (gitignored; regenerate with `cd scripts/promo/music && python3 song.py promo ../public/promo.wav`, then `ffmpeg -i ../public/promo.wav -codec:a libmp3lame -q:a 2 ../public/promo.mp3`) |
| The footage | `scripts/promo/public/footage/<scene>.webm` + `.webp` poster + `.marks.json` (gitignored; regenerate with `film.sh`) |
| The theme art the overlays use | `scripts/promo/public/themes/<slug>/` (rig, companions, wallpaper, pre-blurred backdrop) + `src/theme-art.generated.ts`, both gitignored — `bash scripts/promo/theme-assets.sh` copies them from the `wecoded-themes` checkout beside the workspace |
| Scenes | `scripts/ui-review/scenes/promo-*.json` (thirteen) + `scenes/flappy-pilot.js` |
| Timeline | `scripts/promo/src/` — `timeline.ts` (bars, PRE/POST), `themes.ts`, `tracks.ts`, `Backdrop.tsx`, `Mascot.tsx`, `transitions.tsx`, `Caption.tsx`, `captions.ts`, `marks.ts`, `layout.ts`, `beats/beat.ts` (the beat contract) + `beats/Beat1…8.tsx`, `Promo.tsx` |
| Review evidence | `docs/active/prototypes/promo-2026-09/` — `footage-review.md` + `footage/*.webp` posters, `marks/<scene>-<mark>.png` (the frame at every mark) |
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
| a beat is too long / short / wrong order | `src/timeline.ts` `BEATS` (bars must tile 0–34) and the music sections in `song.py`'s `promo_track()` — the music and the storyboard are one grid | re-render music, `npm test`, draft render |
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

**Show him early.** A draft render is three and a half minutes. Show it before polishing.
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
