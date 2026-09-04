---
status: active
created: 2026-09-03
type: handoff
topic: The Reddit promo video — how it was built, where everything lives, what state it is in, and how to iterate on Destin's feedback.
spec: docs/active/specs/2026-09-03-promo-video-design.md
plan: docs/active/plans/2026-09-03-promo-video-plan.md
---

# Promo video — START HERE

Destin has seen the first full cut once (2026-09-03, 17:00) and will have notes. **The next session's job is to take his notes and iterate — not to render, review or open PRs until he is happy.** The build session got that order wrong (it polished for an hour before showing him anything).

## The one-paragraph version

A ~69 s 1920×1080 video of the app, hosted by the mascot, cut to a synthwave track composed in code. Three layers: (1) `scripts/promo/music/song.py promo` renders the track and exports its beat grid as JSON; (2) `scripts/promo/film.sh` films ten scenes of the real renderer in the UI Workbench through headless Chrome, writing a **marks file** beside each clip (the video time of every scene action); (3) a Remotion project in `scripts/promo/src/` lays the clips, captions, mascot and sound on the grid, trimming every clip by a mark label, and `scripts/promo/render.sh` produces the MP4 at −14 LUFS. Every cut and the theme flip land on a downbeat by construction, and a test pins it.

## Where things are

| What | Where |
|---|---|
| Workspace branch (everything below except the app fakes) | `feat/promo-video`, worktree `/home/destin/youcoded-dev/worktrees/promo` — **17 commits, never pushed** |
| App branch (dev-only workbench fakes + fixtures the scenes need) | `feat/promo-workbench-fakes`, worktree `/home/destin/youcoded-dev/worktrees/promo-fakes` — pushed, **PR itsdestin/youcoded#402 open, CI green, not merged**. Nothing in it ships to users |
| The cut Destin saw | `scripts/promo/out/youcoded-promo.mp4` (with music), `…-silent.mp4`; `out/draft.mp4` is the half-size preview. All under `out/`, gitignored |
| The music | `scripts/promo/public/promo.wav` + `promo.mp3` + `promo.grid.json` + `sfx-{pop,whoosh,chime}.wav` (gitignored; regenerate with `cd scripts/promo/music && python3 song.py promo ../public/promo.wav`) |
| The footage | `scripts/promo/public/footage/<scene>.webm` + `.webp` poster + `.marks.json` (gitignored; regenerate with `film.sh`) |
| Scenes | `scripts/ui-review/scenes/promo-*.json` (ten) + `scenes/flappy-pilot.js` |
| Timeline | `scripts/promo/src/` — `layout.ts`, `timeline.ts`, `marks.ts`, `captions.ts`, `grid.ts`, primitives, `Mascot.tsx`, `beats/Beat1…8.tsx`, `Promo.tsx`, `Root.tsx` |
| Review evidence | `docs/active/prototypes/promo-2026-09/` — `layout.png` (the approved geometry), `footage/*.webp` posters, `footage-review.md`, `draft-notes.md` (five review rounds: what was measured, what changed) |
| Spec / plan | `docs/active/specs/2026-09-03-promo-video-design.md` (storyboard, captions, music table) · `docs/active/plans/2026-09-03-promo-video-plan.md` (nine tasks + two revision notes at the top) |
| Build ledger | `.superpowers/sdd/progress.md` (gitignored) — one line per task with commits and review verdicts; reports and review packages beside it |

## State at hand-off (2026-09-03 17:14)

- **Tasks 1–6 and 8 complete and reviewed** (music, recorder, app fakes ×3, scenes/filming, render.sh). Task 7 (the timeline) is implemented and reviewed; its **fix round 5 was mid-edit** when Destin called a stop — uncommitted changes on disk in `scripts/promo/src/` (`Backdrop.tsx`, `Mascot.tsx`, `Root.tsx`, `beats/sfx.tsx`, `grid.ts`, `poses.ts`, `timeline.ts` + test, new `starts.ts`). A background agent may have finished and committed them since; check `git log`/`git status` first. What round 5 fixes: the theme-flip chime was cut to 0.4 s of 1.3 s (a 12-frame Sequence around every effect); beat 6 trimmed from a hand-counted `+11` (now the `resumed` mark); the music's 2.5 s tail was chopped at frame 2075 (composition becomes 2149 frames, beat 8 holds real footage under it); beat 1's `+6` → `+CUT`; beat 8's in-beat anchors one frame short; backdrop drift restarting at every cut; dead props; `render.sh` pipefail on the info line.
- **The cut Destin saw predates round 5**, so it has the short chime and the chopped tail. Do not re-report those.
- Task 9 (close-out: archive docs, close roadmap, delete branches) has **not** been done and must wait for merge — which is Destin's call.
- The workbench for filming may still be running on port 5473 (started with `YOUCODED_PORT_OFFSET=300 VITE_NO_WATCH=1 setsid bash scripts/run-workbench.sh /home/destin/youcoded-dev/worktrees/promo-fakes`). Find it with `ss -ltnp "sport = :5473"`, kill by its process group, never by pattern.

## How to iterate on feedback

**Which layer a note lands in:**

| Destin says… | Change | Then |
|---|---|---|
| a caption / wording | `src/captions.ts` — but the test pins captions to the spec's storyboard table, so change the spec row too | `npm test`, draft render |
| a beat is too long / short / wrong order | `src/timeline.ts` `BEATS` (bars must tile 0–34) and the matching music sections in `song.py`'s `promo_track()` — the music and the storyboard are one grid | re-render music, `npm test`, draft render |
| the mascot does something wrong | the beat's `CUES` (frames relative to the beat, positions from `layout.ts`'s `perch()`), poses in `src/poses.ts` | draft render |
| where the window / caption / phone sits | `src/layout.ts` only — then `npm run still:layout` and look at `out/layout.png` | draft render |
| what the app is doing on screen | the scene JSON (`scripts/ui-review/scenes/promo-<x>.json`) — actions, marks, reply fixtures (`youcoded/desktop/src/renderer/dev/workbench/fixtures/replies/`) | re-film that scene: `bash scripts/promo/film.sh /home/destin/youcoded-dev/worktrees/promo-fakes promo-<x>`; the timeline picks up the new marks with no edit |
| the music (levels, section feel, tempo) | `scripts/promo/music/song.py` `promo_track()` / `render_promo()`; per-bar lift in `LIFT_DB` | `python3 -m unittest test_song`, re-render to `public/`, draft render |
| the trim inside a beat | the beat file — only ever `markFrame(scene, label, edge, offset)`; if the frame you want has no mark, add a `"mark"` to the scene action and re-film | draft render |

**Commands** (from `scripts/promo/`): `npm run typecheck && npm test && npm run render:draft` (half size, ~3 min) → look at `out/draft.mp4` (frames via `ffmpeg -i out/draft.mp4 -vf "select='eq(n,N)'" -vsync 0 -frames:v 1 f.png`; a contact sheet: `-vf "select='not(mod(n,30))',scale=320:-1,tile=6x12" -frames:v 1`). Final: `bash scripts/promo/render.sh` (~10 min; writes `out/youcoded-promo.mp4` + silent). Hand files over as plain paths in chat.

**Show him early.** A draft render is three minutes. Show it before polishing.

## Things learned the hard way (do not re-learn)

- **The Flappy autopilot cannot run from the recorder.** Polling the DOM over CDP reacts 30–60 ms late; ten takes never passed one pipe. `scenes/flappy-pilot.js` runs inside the page (rAF loop, flap rule from the engine's constants: rise 18.8 units, gap 38, hit radius 4.6 → flap 8 units below the gap centre), injected by the recorder's `evalFile` action; 7 pipes in 9.5 s every take since.
- **Marks, never measured frames.** Every trim is `markFrame(...)`. When a beat needs a frame nobody marked (the theme paint, the dialog's dismissal), add an in-page observer action to the scene that resolves on the DOM change (`promo-theme.json` `gold`, `promo-takeover.json` `resumed`) — not a constant in the beat. `record.mjs` corrects the marks for the screencast's ~100 ms capture lag; the theme paint still lands ~1.5 frames after its mark, hence the documented `+2` in `Beat7.tsx`.
- **`assertClipCovers`** (`src/marks.ts`) throws at bundle time if a beat would outrun its clip — a frozen last frame is otherwise invisible. Re-film longer (a bigger final `hold`) rather than looping stills.
- **Transitions pad the sequence that precedes them** by exactly the transition's length (`timeline.ts`); a different pad drifts every later beat. `timeline.test.ts` pins every beat's start to its downbeat.
- **Push-ins scale from the window's top edge** so the mascot's perch does not float; `MAX_PUSH_IN = 0.03` is enforced by a throw.
- **`VITE_NO_WATCH=1` serves stale modules**: restart the workbench after any change in the app worktree before filming.
- **`film.sh <path>`**: pass the app worktree as an absolute path from this worktree (there is no `worktrees/` folder inside it). It refuses a port serving a different tree and only kills a workbench it started.
- **The zsh Bash tool mangles `loudnorm=…:linear=true`** (`$TH:l` is a history modifier). Run `render.sh` (bash shebang); do not hand-type its ffmpeg line.
- **The reply fixtures were never tested until this branch** — `workbench-fixture-actions.test.ts` now enumerates `fixtures/replies/` (in PR #402).
- Remotion 4.0.520 + Node 26: `node --test` runs the `.ts` tests directly, so `timeline.ts` and `captions.ts` import nothing. `@remotion/google-fonts/Inter` fetches at render.

## Open decisions for Destin

- Merge of youcoded#402 and of `feat/promo-video` (workspace) — both after his notes are in.
- Beat 7's first two bars show the reply streaming, not the request being typed (the recording has 7.5 s between them and the spec forbids a cut inside that beat). If he wants the typing, the scene needs a faster fixture or the spec a cut.
- Beat 4's on-screen counter reaches 4 only in the last 0.3 s; the bird visibly passes four pipes. A longer flight means a shorter Games-menu shot.
