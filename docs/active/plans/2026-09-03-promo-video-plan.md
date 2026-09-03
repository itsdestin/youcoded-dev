---
status: draft
created: 2026-09-03
type: plan
topic: Build the Reddit promo video — music, rig changes, workbench fakes, footage, Remotion assembly, final render.
spec: docs/active/specs/2026-09-03-promo-video-design.md
measured_at:
  youcoded-dev: 6148756 (origin/master)
  youcoded: 4224fb85 (origin/master)
---

# Promo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ~69-second 1920×1080 MP4 of the running YouCoded app (filmed in the UI Workbench), hosted by the mascot, cut to a synthwave track composed in code, ready to post on Reddit.

**Architecture:** Three layers. (1) `scripts/promo/music/` composes the track and exports its beat grid as JSON. (2) `scripts/ui-review/record.mjs` films ten scenes of the workbench (with three dev-only fakes added to `youcoded`'s mock backend) into WebM footage, and writes a **marks file** beside each clip — the video time of every scene action — so the timeline never hand-measures a frame. (3) A Remotion project in `scripts/promo/` lays footage, captions, the animated mascot rig and the audio on the grid and renders the MP4; ffmpeg loudness-normalises at the end.

**Revision 2026-09-03 (this session, before execution):** eight defects found in review and fixed in the text below — no room on screen for captions or the host (the window now films at 1440×900 and sits in a fixed layout with a caption band and headroom, approved from a still before any beat is built); the Flappy autopilot picked a pipe as the bird (pipe columns carry the same `will-change` marker); the theme drop landed 4 frames late (a 2-frame fade after 6-frame padding — the two theme beats are now one continuous clip, no transition); hand-measured trim frames (replaced by the marks file); 24 fps footage in a 30 fps video (the recorder takes `fps` per scene); the spec's storyboard disagreed with the plan on beats 6–7 (spec updated); the recorder action was named `autoplay`, colliding with the workbench's `?autoplay=` URL switch (now `autopilot`); and captions were a hard constraint with no test (now `captions.test.ts`).

**Tech Stack:** Python 3 + numpy (music), Node 26 + raw CDP (filming), Remotion 4.0.520 + React (assembly), ffmpeg 8 (mux), vitest (youcoded tests), `node --test` and `unittest` (workspace tests).

## Global Constraints

- Output: **1920×1080, 30 fps, H.264 MP4, AAC stereo**; total length = 34 bars at 118 BPM ≈ 69.2 s (2075 frames) plus a 2.5 s audio tail rendered under the last frame hold.
- Music: **118 BPM, A minor**, arcade synthwave (`arcade_synthwave()` in `scripts/promo/music/song.py` is the approved sound); delivered at **-14 LUFS integrated**.
- Captions: exactly the strings in the spec's storyboard table. Banned words anywhere on screen: "real app", "real files", "actually", "does real work", "self-improving".
- Footage is filmed at **1440×900, 30 fps** (device scale 1) and the phone at **390×844** with `platform=android`. 1440×900 shown at 98 % is 1:1 pixels — the app's 14 px text stays 14 px in the video — and leaves a 100 px caption band below the window and headroom above it for the host. (The earlier 1920×1200 plan filled the whole 1080 px frame: captions covered the app's typing box and the mascot sat over the session strip.)
- **Layout is fixed and approved from a still before any beat is built** (`src/layout.ts`, Task 7 Step 0): window 1411×882 at (254, 100), caption band y 982–1080, mascot 120 px sitting on the window's top edge. Every beat uses these constants; nothing positions itself ad hoc.
- **Every trim comes from the marks file**, never from a hand-measured frame: `record.mjs` writes `<clip>.marks.json` (video-time start/end of each action, labelled with the action's `mark`), and `src/marks.ts` turns a label into a frame. A re-film never breaks the timeline.
- **Never touch Destin's live app.** All filming is `run-workbench.sh` against a worktree, headless, on port 5473 (`YOUCODED_PORT_OFFSET=300`).
- **No shipped-app behaviour changes.** Every `youcoded` edit is under `desktop/src/renderer/dev/workbench/` or a `tests/` file. `bash scripts/verify.sh <worktree>` must pass before that PR merges.
- Workspace commits are made from a linked worktree (the shared checkout refuses commits); stage by explicit path, never `git add -A`.
- `scripts/promo/out/` and `scripts/promo/public/` (generated: the track, grid, SFX and `public/footage/` with the clips and marks) are gitignored; `scripts/promo/node_modules` is covered by the root ignore.
- **Review is the session's own until the final hand-over.** Destin asked (2026-09-03) for the video to be iterated by Claude until it is something to be proud of: every "hand to Destin" step below means *look at it yourself as the reviewer* (frames via `ffmpeg -ss … -frames:v 1`, read as images), fix, re-render; hand over paths at the end, with the listen-check MP3 alongside.
- Every non-trivial code edit carries a WHY comment.

---

## File map

| Path | Responsibility |
|---|---|
| `scripts/promo/music/synth.py` (exists) | DSP primitives. Gains three sound-effect makers (`pop`, `whoosh`, `chime`). |
| `scripts/promo/music/song.py` (exists) | Sequencer. Gains `promo_track()` (the full arrangement) and a `promo` CLI target that writes the WAV, the grid JSON and the three SFX WAVs. |
| `scripts/promo/music/test_song.py` | `unittest` for grid shape, section positions, length, peak, NaN. |
| `scripts/ui-review/record.mjs` (exists) | Gains the `Space` key, the `autopilot` action, a per-scene `fps`, and the `<out>.marks.json` file. |
| `scripts/ui-review/autopilot.mjs` | Pure loop: poll a JS predicate, press a key when true. |
| `scripts/ui-review/autopilot.test.mjs` | `node --test` for the loop and for the marks-file shape. |
| `scripts/ui-review/scenes/promo-*.json` (10 files) | One scene per storyboard beat (beat 6 has three, beats 1 and 8 one idle each). |
| `scripts/promo/film.sh` | Boots the workbench for a worktree, records every promo scene into `scripts/promo/public/footage/`, writes the footage-review page. |
| `scripts/promo/package.json`, `remotion.config.ts`, `tsconfig.json` | The Remotion project. |
| `scripts/promo/src/index.ts`, `Root.tsx`, `Promo.tsx` | Entry, composition registration (the `Promo` video and the `Layout` still), the timeline. |
| `scripts/promo/src/grid.ts` | Reads the exported grid JSON; bar → frame helpers. |
| `scripts/promo/src/marks.ts` | Reads every clip's marks file; `markFrame(scene, label, 'start'\|'end')` → frame at 30 fps. |
| `scripts/promo/src/layout.ts` | The one set of screen coordinates: window box, caption band, mascot perch, phone slot. |
| `scripts/promo/src/captions.ts` + `captions.test.ts` | The eight caption strings, pinned to the spec's storyboard table and the banned-word list by `node --test`. |
| `scripts/promo/src/timeline.ts` + `timeline.test.ts` | The beat list (bars, transition after each) and `startFrames()`; the test pins that every beat starts on its downbeat. |
| `scripts/promo/src/Backdrop.tsx`, `Window.tsx`, `Phone.tsx`, `Caption.tsx`, `Footage.tsx` | Visual primitives. |
| `scripts/promo/src/Mascot.tsx`, `src/rig.ts`, `src/poses.ts` | The host: the app's default buddy rig, posed by springs. |
| `scripts/promo/src/beats/Beat1.tsx … Beat8.tsx`, `LayoutStill.tsx` | One component per storyboard beat, plus the layout still. |
| `scripts/promo/render.sh` | Draft/final render + loudnorm mux. |
| `youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts` (exists) | Gains the `remote` fake, the `syncSpaces.lease*` fake, and xlsx bytes for `readBinary`. |
| `youcoded/desktop/src/renderer/dev/workbench/fixtures/sheets.ts` + `fixtures/sheets/make.mjs` | Two base64 workbooks (before / after) and the script that generates them. |
| `youcoded/desktop/src/renderer/dev/workbench/fixtures/replies/{briefing,sheet,flappy-task}.jsonl` | Reply fixtures for beats 2, 3, 4. |
| `youcoded/desktop/tests/workbench-promo-fakes.test.ts` | vitest for the three fakes. |

Task order: 1 → 2 (workspace, independent of each other) · 3 → 4 → 5 (youcoded, one branch, one PR) · 6 (needs 2 + 5) · 7 (needs 1, can start after 2) · 8 (needs 6 + 7) · 9.

---

### Task 1: The full track, the grid, and the sound effects

**Files:**
- Modify: `scripts/promo/music/synth.py` (append after `vinyl()`)
- Modify: `scripts/promo/music/song.py` (append after `render_b`, extend `__main__`)
- Create: `scripts/promo/music/test_song.py`

**Interfaces:**
- Produces: `python3 song.py promo <out.wav>` → writes `<out>.wav`, `<out>.grid.json` (shape `{bpm, bars, bar_seconds, beat_seconds, beats:[{bar,beat,t}], sections:[{name,bar,t}]}`), and `<dir>/sfx-pop.wav`, `<dir>/sfx-whoosh.wav`, `<dir>/sfx-chime.wav` beside it. Section names, in order: `intro, drop1, groove, hook, break, build, groove2, drop2, outro, end` at bars `0, 2, 6, 10, 14, 16, 18, 23, 29, 33`.

- [ ] **Step 1: Write the failing test**

`scripts/promo/music/test_song.py`:
```python
import json, os, subprocess, sys, tempfile, unittest, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

class PromoTrack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.wav = os.path.join(cls.tmp, "promo.wav")
        subprocess.run([sys.executable, os.path.join(HERE, "song.py"), "promo", cls.wav], check=True, cwd=HERE)
        with open(os.path.join(cls.tmp, "promo.grid.json")) as f:
            cls.grid = json.load(f)

    def test_grid_shape(self):
        g = self.grid
        self.assertEqual(g["bpm"], 118)
        self.assertEqual(g["bars"], 34)
        self.assertAlmostEqual(g["bar_seconds"], 240 / 118, places=4)
        self.assertEqual(len(g["beats"]), 34 * 4)
        self.assertEqual([s["name"] for s in g["sections"]],
                         ["intro", "drop1", "groove", "hook", "break", "build", "groove2", "drop2", "outro", "end"])
        self.assertEqual([s["bar"] for s in g["sections"]], [0, 2, 6, 10, 14, 16, 18, 23, 29, 33])

    def test_audio_is_sane(self):
        with wave.open(self.wav) as w:
            n, sr = w.getnframes(), w.getframerate()
            d = np.frombuffer(w.readframes(n), "<i2").astype(float) / 32767
        self.assertEqual(sr, 44100)
        self.assertAlmostEqual(n / sr, 34 * 240 / 118 + 2.5, delta=0.05)
        self.assertFalse(np.isnan(d).any())
        self.assertLessEqual(np.abs(d).max(), 10 ** (-1 / 20) + 1e-3)   # peak ≤ -1 dBFS
        self.assertGreater(np.abs(d).max(), 0.5)                            # not silent

    def test_break_is_quieter_than_drop(self):
        g = self.grid; bar = g["bar_seconds"]
        with wave.open(self.wav) as w:
            d = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32767
        rms = lambda a, b: np.sqrt(np.mean(d[int(a * bar * 44100 * 2):int(b * bar * 44100 * 2)] ** 2))
        self.assertLess(rms(14, 16), rms(2, 4) * 0.8)   # the break drops the drums

    def test_sfx_exist(self):
        for name in ("pop", "whoosh", "chime"):
            p = os.path.join(self.tmp, f"sfx-{name}.wav")
            self.assertTrue(os.path.exists(p), p)
            with wave.open(p) as w:
                self.assertLess(w.getnframes() / w.getframerate(), 2.0)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/promo/music && python3 -m unittest -v test_song`
Expected: FAIL — `KeyError: 'promo'` from `song.py`'s dispatch (the target does not exist yet).

- [ ] **Step 3: Add the sound effects to `synth.py`**

Append after `vinyl()`:
```python
# ---------- UI-style sound effects (for the video's cuts and the mascot) ----------
def sfx_pop():
    """A soft 'boop' for the mascot landing: a short downward sine blip with a tiny click."""
    n = secs(0.16)
    f = 300 + 400 * np.exp(-np.arange(n) / (0.03 * SR))
    body = sine(f, n) * exp_decay(n, 0.05)
    body[:secs(0.002)] += noise(secs(0.002)) * 0.3
    return soft_clip(body, 1.2) * 0.8


def sfx_whoosh():
    """A cut whoosh: noise through a rising then falling one-pole, 260 ms."""
    n = secs(0.26)
    t = np.linspace(0, 1, n)
    cutoff = 400 + 5000 * np.sin(np.pi * t) ** 2
    e = np.sin(np.pi * t) ** 1.5
    return onepole_hp(onepole_lp(noise(n), cutoff, 2), 300) * e * 0.9


def sfx_chime():
    """The theme-applied chime: a bright major-ish triad, 1.3 s, with reverb."""
    n = secs(1.3)
    out = np.zeros(n, dtype=np.float32)
    for i, m in enumerate((81, 88, 93)):        # A5 E6 A6
        out += sine(midi(m), n) * exp_decay(n, 0.35 - 0.05 * i) * (0.6 - 0.12 * i)
        out += sine(midi(m) * 2, n) * exp_decay(n, 0.12) * 0.12
    return reverb(soft_clip(out, 1.1), 0.9, 0.3, 0.35) * 0.8
```

- [ ] **Step 4: Add the arrangement and the `promo` target to `song.py`**

Append after `render_b`:
```python
# ---------------------------------------------------------------- the promo track
def promo_track() -> Song:
    """The approved arcade-synthwave material arranged to the storyboard (spec → Music table).
    34 bars: intro 0-1 · drop1 2-5 · groove 6-9 · hook 10-13 · break 14-15 · build 16-17 ·
    groove2 18-22 (half-time snare, fill on 22) · drop2 23-28 (hook, brighter) · outro 29-32 · end 33."""
    s = Song(118, 34, tail=2.5)
    chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]]     # Am F/A C/G G
    roots = [45, 41, 48, 43]
    KICK, SNR, HAT = "x...x...x...x...", "....x.......x...", "x.x.x.x.x.x.x.xo"
    HOOK_A = [(0, 76, 2), (2, 79, 2), (4, 81, 3), (8, 79, 2), (10, 76, 2), (12, 72, 4)]
    HOOK_B = [(0, 74, 3), (4, 76, 3), (8, 79, 6)]
    for name, bar in (("intro", 0), ("drop1", 2), ("groove", 6), ("hook", 10), ("break", 14), ("build", 16),
                      ("groove2", 18), ("drop2", 23), ("outro", 29), ("end", 33)):
        s.section(name, bar)

    def section_of(bar):
        return [sec["name"] for sec in s.sections if sec["bar"] <= bar][-1]

    for bar in range(34):
        sec = section_of(bar)
        ch, root = chords[bar % 4], roots[bar % 4]
        drums = sec in ("drop1", "groove", "hook", "groove2", "drop2") or (sec == "outro" and bar < 31)
        hook = sec in ("hook", "drop2")
        bright = sec == "drop2"
        # --- drums
        if drums:
            s.hits("kick", KICK, bar, S.kick)
            snare_pat = SNR
            if sec == "groove2": snare_pat = "........x......."            # half-time
            if bar in (13, 22, 28): snare_pat = "....x.......xxxX"          # fills before a section change
            s.hits("snare", snare_pat, bar, S.snare, gain=0.8)
            s.hits("clap", SNR if sec != "groove2" else "........x.......", bar, S.clap, gain=0.5)
            s.hits("hat", HAT, bar, S.hat, gain=0.55 if not bright else 0.65)
        elif sec == "build":
            s.hits("hat", "x.x.x.x.x.x.x.x." if bar == 16 else "xxxxxxxxxxxxxxxx", bar, S.hat, gain=0.45)
            s.hits("snare", "x...x...x...x..." if bar == 16 else "x.x.x.x.xxxxxxxx", bar, S.snare, gain=0.55)
        elif sec in ("intro", "break"):
            s.hits("hat", "..x...x...x...x.", bar, S.hat, gain=0.4)
        elif sec == "end":
            s.hits("kick", "x...............", bar, S.kick)
            s.hits("clap", "x...............", bar, S.clap, gain=0.7)
            s.hits("hat", "o...............", bar, S.hat, gain=0.6)
        # --- bass
        if drums or sec == "build":
            for i in range(8):
                n = root + (12 if i in (3, 7) else 0)
                s.note("bass", bar, i * 2, S.bass_saw(n, s.beat / 2 * 0.9, cutoff=700 + (400 if bright else 0), sweep=1600), 0.9)
        # --- arp (everywhere except the final bar)
        if sec != "end":
            seq = ch + [m + 12 for m in ch] + [ch[2] + 12, ch[1] + 12]
            thin = sec in ("intro", "break", "outro")
            for i in range(16):
                if thin and i % 2 == 1: continue
                s.note("arp", bar, i, S.chip_pulse(seq[i % len(seq)] + 12, s.beat / 4 * 0.85, duty=0.5 if thin else 0.25), 0.4 if thin else 0.5)
        # --- pad
        pad_notes = [m + (12 if sec in ("intro", "break") else 0) for m in ch]
        s.note("pad", bar, 0, S.pad_supersaw(pad_notes, s.bar * (2.4 if sec == "end" else 1.02), cutoff=2600 if bright else (1200 if sec in ("intro", "break", "outro") else 2200)), 0.8)
        # --- lead hook (two-bar phrase, repeats)
        if hook:
            prev = None
            for step, n, ln in (HOOK_A if bar % 2 == 0 else HOOK_B):
                s.note("lead", bar, step, S.lead_pulse(n + (12 if bright and bar % 4 >= 2 else 0), s.beat / 4 * ln * 0.95, glide_from=prev), 0.55); prev = n
        # --- lead: one long resolving note on the end bar
        if sec == "end":
            s.note("lead", bar, 0, S.lead_pulse(81, s.bar * 1.6), 0.5)
    # risers: into drop1 (bar 1) and into drop2 (bars 16-17 → landing at 23 is the fill; the build's riser spans 21-22)
    for start, length in ((1, 1), (21, 2)):
        n = S.secs(s.bar * length)
        sw = S.onepole_hp(S.noise(n), 800 + 6000 * np.linspace(0, 1, n) ** 2) * np.linspace(0, 1, n) ** 2
        s.note("riser", start, 0, sw.astype(np.float32), 0.35)
    # the "gap": the last beat of bar 22 is silent except the riser tail, so drop 2 lands from nothing
    gap_from, gap_to = s.at(22, 12), s.at(23, 0)
    for name in ("kick", "snare", "clap", "hat", "bass", "arp", "lead"):
        if name in s.tracks: s.tracks[name][gap_from:gap_to] = 0
    return s


def render_promo(out: str):
    s = promo_track()
    pump = S.sidechain(s.n, s.kicks, depth=0.65, recover=0.26)
    fx = {
        "arp": lambda x: S.delay(x, s.beat * 0.75, 0.3, 0.28),
        "pad": lambda x: S.reverb(x * pump, 0.9, 0.35, 0.35),
        "bass": lambda x: x * pump,
        "snare": lambda x: S.reverb(x, 0.7, 0.2, 0.22),
        "clap": lambda x: S.reverb(x, 0.8, 0.2, 0.3),
        "lead": lambda x: S.delay(S.reverb(x, 0.8, 0.3, 0.25), s.beat * 0.5, 0.35, 0.3),
    }
    gains = {"kick": 1.0, "snare": 0.8, "clap": 0.5, "hat": 0.5, "bass": 0.7, "arp": 0.42, "pad": 0.5, "lead": 0.55, "riser": 0.5}
    pans = {"arp": (0.6, 0.2), "pad": (1.0, 0.0), "hat": (0.3, -0.25), "lead": (0.5, -0.1)}
    S.write_wav(out, s.mix(gains, fx, pans))
    d = os.path.dirname(os.path.abspath(out))
    for name, make in (("pop", S.sfx_pop), ("whoosh", S.sfx_whoosh), ("chime", S.sfx_chime)):
        S.write_wav(os.path.join(d, f"sfx-{name}.wav"), S.master(S.to_stereo(make()), -3.0))
    return s
```
Add `import os` to the top of `song.py`, and change the dispatch line in `__main__` to:
```python
    song = {"sketch-a": render_a, "sketch-b": render_b, "promo": render_promo}[which](out)
```

- [ ] **Step 5: Run the tests**

Run: `cd scripts/promo/music && python3 -m unittest -v test_song`
Expected: 4 tests, `OK`. The render takes ~15 s.

- [ ] **Step 6: Listen-check file**

Run: `cd scripts/promo/music && python3 song.py promo ../public/promo.wav && ffmpeg -y -loglevel error -i ../public/promo.wav -codec:a libmp3lame -q:a 2 ../public/promo.mp3`
Check the section times against the grid (`python3 -c "import json;print([(s['name'],round(s['t'],1)) for s in json.load(open('../public/promo.grid.json'))['sections']])"`) — they must match the Interfaces line above. The MP3 is handed over with the final video (paths in chat), not as a gate.

- [ ] **Step 7: Commit (from a linked worktree)**

```bash
git add scripts/promo/music/synth.py scripts/promo/music/song.py scripts/promo/music/test_song.py
git commit -m "feat(promo): the full arcade-synthwave track, its beat grid, and three UI sound effects"
```

---

### Task 2: The recorder learns `Space`, `autopilot`, `fps`, and writes a marks file

**Files:**
- Create: `scripts/ui-review/autopilot.mjs`
- Create: `scripts/ui-review/autopilot.test.mjs`
- Modify: `scripts/ui-review/record.mjs` — the `KEYS` table (line ~131), the action dispatch loop (line ~159-181), the ffmpeg `fps=24` filter (line ~196), and the success line
- Modify: `scripts/ui-review/README.md` — the actions table under "Recording a loop" (three rows: `autopilot`, `mark`, the scene-level `fps`)

**Interfaces:**
- Produces: scene action `{"autopilot": {"ms": 9000, "every": 25, "when": "<js expression → boolean>", "key": "Space", "minGap": 120}}` — for `ms` milliseconds, evaluate `when` every `every` ms and press `key` when it returns true, never more often than `minGap` ms. `{"key": "Space"}` now works. The name is `autopilot`, not `autoplay`: the workbench already has a `?autoplay=<ms>` URL switch (auto-sends the first message), and the phone scene uses that one.
- `autopilot.mjs` exports `runAutopilot({ evaluate, press, sleep, now, ms, every, when, minGap })` → resolves `{ presses: number, polls: number }`, and `marksFile({ fps, width, height, duration, actions })` → the object written as JSON (pure, so the shape is testable).
- Scene-level `"fps": 30` (default 24) sets the encode frame rate.
- **Marks file:** `record.mjs` writes `<outBase>.marks.json` beside the WebM: `{ fps, width, height, duration, actions: [{ i, kind, mark, start, end }] }` — `kind` is the action's key (`click`, `clickText`, `typeSlow`, `hold`, `autopilot`, …), `mark` is the action's optional `"mark": "<label>"` (null otherwise), `start`/`end` are **video seconds** (wall-clock at action start/end minus the wall-clock at which the first screencast frame arrived; `end` is before the action's `settle`). Any action may carry `"mark"`.

- [ ] **Step 1: Write the failing test**

`scripts/ui-review/autopilot.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutopilot, marksFile } from './autopilot.mjs';

// A fake clock: sleep advances it, now reads it. No real waiting.
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('presses when the predicate is true, respecting minGap', async () => {
  const c = clock(); const presses = [];
  let calls = 0;
  const r = await runAutopilot({
    ...c, ms: 1000, every: 25, minGap: 100,
    evaluate: async () => { calls++; return true; },   // always wants to flap
    press: async (k) => { presses.push([k, c.now()]); },
    key: 'Space', when: 'true',
  });
  assert.equal(r.polls, 40);                    // 1000 / 25
  assert.equal(r.presses, presses.length);
  assert.equal(presses.length, 10);             // one per 100 ms, not one per poll
  assert.ok(presses.every(([k]) => k === 'Space'));
});

test('never presses when the predicate stays false', async () => {
  const c = clock(); let n = 0;
  const r = await runAutopilot({ ...c, ms: 500, every: 50, minGap: 0,
    evaluate: async () => false, press: async () => { n++; }, key: 'Space', when: 'false' });
  assert.equal(n, 0); assert.equal(r.polls, 10); assert.equal(r.presses, 0);
});

test('a throwing predicate counts as false and does not abort the loop', async () => {
  const c = clock(); let n = 0; let i = 0;
  await runAutopilot({ ...c, ms: 200, every: 50, minGap: 0,
    evaluate: async () => { if (i++ === 0) throw new Error('not mounted yet'); return true; },
    press: async () => { n++; }, key: 'Space', when: 'x' });
  assert.equal(n, 3);
});

test('marksFile turns wall-clock stamps into video seconds and keeps the label', () => {
  const m = marksFile({ fps: 30, width: 1440, height: 900, firstFrameAt: 1000, duration: 4.2,
    stamps: [{ i: 0, kind: 'hold', mark: null, start: 1000, end: 1900 }, { i: 1, kind: 'clickText', mark: 'chip', start: 1900, end: 2300 }] });
  assert.equal(m.fps, 30); assert.equal(m.width, 1440); assert.equal(m.duration, 4.2);
  assert.deepEqual(m.actions[1], { i: 1, kind: 'clickText', mark: 'chip', start: 0.9, end: 1.3 });
  assert.equal(m.actions[0].mark, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/ui-review/autopilot.test.mjs`
Expected: FAIL — `Cannot find module './autopilot.mjs'`.

- [ ] **Step 3: Write `autopilot.mjs`**

```js
// Autopilot for record.mjs: poll a JS predicate inside the page and press a key
// when it says so. Exists for the Flappy beat of the promo — the game exposes no
// autopilot and a fixed flap rhythm dies on the first low gap, but the DOM knows
// where the bird and the next gap are, so the recorder can "play" by reading it.
// Pure (clock, evaluate and press are injected) so node --test can drive it.
export async function runAutopilot({ evaluate, press, sleep, now, ms, every = 25, when, key = 'Space', minGap = 120 }) {
  const end = now() + ms;
  let lastPress = -Infinity, presses = 0, polls = 0;
  while (now() < end) {
    polls++;
    let want = false;
    try { want = Boolean(await evaluate(when)); } catch { want = false; }   // the page may not be ready yet
    if (want && now() - lastPress >= minGap) { await press(key); lastPress = now(); presses++; }
    await sleep(every);
  }
  return { presses, polls };
}

// The marks file: where every scene action sits in the finished clip, in video
// seconds. The Remotion timeline trims footage by these labels instead of by a
// hand-measured frame, so a re-film never breaks the edit. `firstFrameAt` is
// the wall-clock ms at which the first screencast frame arrived — the clip's
// time zero — and each stamp's start/end are wall-clock ms too.
export function marksFile({ fps, width, height, duration, firstFrameAt, stamps }) {
  const sec = (ms) => Math.round(ms - firstFrameAt) / 1000;
  return { fps, width, height, duration,
    actions: stamps.map((s) => ({ i: s.i, kind: s.kind, mark: s.mark ?? null, start: sec(s.start), end: sec(s.end) })) };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/ui-review/autopilot.test.mjs`
Expected: 4 passing.

- [ ] **Step 5: Wire it into `record.mjs`**

Add the import at the top, after the `cdp-helpers.mjs` import:
```js
import { runAutopilot, marksFile } from './autopilot.mjs';
```
Record the wall-clock of the first screencast frame: in the `Page.screencastFrame` handler, `if (frames.length === 0) firstFrameAt = Date.now();` (declare `let firstFrameAt = 0;` beside `frames`).
Extend `KEYS` (the line starting `const KEYS = {`) so it reads:
```js
// Space is the Flappy flap key. It needs `code: 'Space'` and a literal ' ' as
// both key and text — the app's handler checks e.key === ' ', and the generic
// fallback below would have sent key 'Space', which it ignores.
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
};
```
Rewrite the action loop so every action is stamped (the `hold`/`wait` `continue`s must go through the stamp too — they are the marks a beat trims to most often):
```js
const stamps = [];   // one per action: wall-clock start/end, for the marks file
for (const [i, a] of scene.actions.entries()) {
  const kind = Object.keys(a).find((k) => !['settle', 'mark', 'tag', 'ms', 'cps', 'to', 'timeout', 'modifiers'].includes(k)) ?? 'noop';
  const start = Date.now();
  if (a.hold != null) await sleep(a.hold);
  else if (a.wait != null) await sleep(a.wait);
  else if (a.moveTo) { … unchanged … }
  … every existing branch unchanged …
  else if (a.autopilot) {
    const r = await runAutopilot({
      evaluate, press: (k) => key(k), sleep, now: () => Date.now(),
      ms: a.autopilot.ms, every: a.autopilot.every, when: a.autopilot.when, key: a.autopilot.key, minGap: a.autopilot.minGap,
    });
    console.error(`autopilot: ${r.presses} presses over ${r.polls} polls`);
  }
  else if (a.eval) await evaluate(a.eval);
  stamps.push({ i, kind, mark: a.mark ?? null, start, end: Date.now() });
  if (a.hold == null && a.wait == null) await sleep(a.settle ?? 400);
}
```
(`hold`/`wait` keep their old semantics — no `settle` after them — so existing landing-page scenes film identically.)

The encode filter becomes `fps=${scene.fps ?? 24}`. After the WebM is written, write the marks file and name it on the success line:
```js
const marks = marksFile({ fps: scene.fps ?? 24, width: W, height: H, duration, firstFrameAt, stamps });
writeFileSync(`${outBase}.marks.json`, JSON.stringify(marks, null, 1));
console.log(`frames=${frames.length} duration=${duration.toFixed(1)}s out=${outBase}.webm marks=${outBase}.marks.json`);
```
Add to the README's actions table:
```
| `autopilot` (`ms`, `when`, `key`, `every`, `minGap`) | poll `when` (a JS expression evaluated in the page) every `every` ms for `ms` ms and press `key` when it is true — the recorder "plays" a game by reading the DOM. (Not `autoplay`: that is the workbench's own `?autoplay=<ms>` URL switch, which auto-sends the first message.) |
| `mark` (on any action) | a label for this action in `<out>.marks.json`, which lists every action's start/end in video seconds — a timeline trims to a label, never to a hand-measured frame |
```
and, under the scene-level keys, `fps` (default 24; the promo films at 30 so no frame is doubled in a 30 fps edit).

- [ ] **Step 6: Verify nothing else broke**

Run: `node --check scripts/ui-review/record.mjs && node --test scripts/ui-review/autopilot.test.mjs && node scripts/check-doc-commands.mjs --list | head -3`
Expected: no syntax error, 4 passing, the doc-command lister runs.

- [ ] **Step 7: Commit**

```bash
git add scripts/ui-review/autopilot.mjs scripts/ui-review/autopilot.test.mjs scripts/ui-review/record.mjs scripts/ui-review/README.md
git commit -m "feat(ui-review): record.mjs learns Space, an autopilot action, per-scene fps, and writes a marks file beside every clip"
```

---

### Task 3: Spreadsheet bytes in the workbench (youcoded)

Work in a `youcoded` worktree: `cd youcoded && git fetch origin && git worktree add ../worktrees/promo-fakes -b feat/promo-workbench-fakes origin/master && cp -al desktop/node_modules ../worktrees/promo-fakes/desktop/node_modules`. Tasks 3, 4, 5 share this branch.

**Files:**
- Cherry-pick: `ef38bfc0` from `feat/landing-demo-clips` (adds `SITE_FILES`, `artifacts.save`, `chart.jsonl`)
- Create: `desktop/src/renderer/dev/workbench/fixtures/sheets/make.mjs`
- Create: `desktop/src/renderer/dev/workbench/fixtures/sheets.ts` (generated)
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` — `readBinary` (line ~1337-1362)
- Test: `desktop/tests/workbench-promo-fakes.test.ts`

**Interfaces:**
- Produces: `readBinary('/…/Q3-sales.xlsx')` → `{ ok: true, base64, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }`, serving `SHEET_BEFORE` unless `(globalThis as any).__workbenchSheet === 'after'`, then `SHEET_AFTER`. Exports from `fixtures/sheets.ts`: `SHEET_BEFORE: string`, `SHEET_AFTER: string` (base64).

- [ ] **Step 1: Cherry-pick the fixture commit**

Run: `cd worktrees/promo-fakes && git cherry-pick ef38bfc0`
Expected: clean apply (4 files). If `mock-shim.ts` conflicts, keep both sides: the `HAND_WRITTEN` entry `'artifacts.save'` and the `EDITED_ARTIFACTS` overlay.

- [ ] **Step 2: Write the failing test**

`desktop/tests/workbench-promo-fakes.test.ts`:
```ts
// The promo video's three dev-only fakes. None of this ships: mock-shim.ts is
// the workbench's fake backend. Each `describe` pins one URL/global switch.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Workbook } from 'exceljs';

// Same construction as workbench-shim-semantics.test.ts, but the module is
// re-imported per test because the URL switches are read at module scope.
async function shim(search = '') {
  vi.resetModules();
  vi.stubGlobal('location', { search });
  const { createStore } = await import('../src/renderer/dev/workbench/mock-store');
  const { createMockShim } = await import('../src/renderer/dev/workbench/mock-shim');
  return createMockShim(createStore('site')) as any;
}

async function rows(base64: string): Promise<string[][]> {
  const wb = new Workbook();
  await wb.xlsx.load(Buffer.from(base64, 'base64'));
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws.eachRow((r) => out.push((r.values as unknown[]).slice(1).map((v) => String(v ?? ''))));
  return out;
}

describe('spreadsheet bytes', () => {
  beforeEach(() => { delete (globalThis as any).__workbenchSheet; });

  it('serves an .xlsx for the site session and the "before" sheet is unsorted with no total', async () => {
    const c = await shim('?scenario=site');
    const r = await c.artifacts.readBinary('/home/you/Documents/Q3-sales.xlsx');
    expect(r.ok).toBe(true);
    expect(r.mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const rs = await rows(r.base64);
    expect(rs[0]).toEqual(['Region', 'Rep', 'Amount', 'Month']);
    const amounts = rs.slice(1).map((x) => Number(x[2]));
    expect(amounts.length).toBe(15);
    expect([...amounts].sort((a, b) => b - a)).not.toEqual(amounts);
    expect(rs.some((x) => x[0] === 'Total')).toBe(false);
  });

  it('serves the "after" sheet when __workbenchSheet is "after": sorted by amount, with a Total row', async () => {
    (globalThis as any).__workbenchSheet = 'after';
    const c = await shim('?scenario=site');
    const r = await c.artifacts.readBinary('/home/you/Documents/Q3-sales.xlsx');
    const rs = await rows(r.base64);
    const body = rs.slice(1, -1);
    const amounts = body.map((x) => Number(x[2]));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    expect(rs.at(-1)?.[0]).toBe('Total');
    expect(Number(rs.at(-1)?.[2])).toBe(amounts.reduce((a, b) => a + b, 0));
  });
});
```
- [ ] **Step 3: Run it to verify it fails**

Run: `cd worktrees/promo-fakes/desktop && npx vitest run tests/workbench-promo-fakes.test.ts`
Expected: FAIL — `r.ok` is `false` (`not-an-image`).

- [ ] **Step 4: Write the generator**

`desktop/src/renderer/dev/workbench/fixtures/sheets/make.mjs`:
```js
#!/usr/bin/env node
// Generates fixtures/sheets.ts: two small workbooks as base64, for the promo's
// spreadsheet beat. BEFORE is the file "the user attached"; AFTER is what the
// assistant's Edit tool card leaves behind (sorted by amount, a Total row,
// the top three amounts bold). Run from desktop/:  node src/renderer/dev/workbench/fixtures/sheets/make.mjs
import { Workbook } from 'exceljs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROWS = [
  ['West', 'Priya', 128, 'Jul'], ['East', 'Marcus', 96, 'Jul'], ['North', 'Lena', 41, 'Jul'],
  ['South', 'Diego', 151, 'Jul'], ['Central', 'Aisha', 88, 'Jul'], ['West', 'Priya', 112, 'Aug'],
  ['East', 'Marcus', 134, 'Aug'], ['North', 'Lena', 57, 'Aug'], ['South', 'Diego', 122, 'Aug'],
  ['Central', 'Aisha', 91, 'Aug'], ['West', 'Priya', 143, 'Sep'], ['East', 'Marcus', 108, 'Sep'],
  ['North', 'Lena', 63, 'Sep'], ['South', 'Diego', 167, 'Sep'], ['Central', 'Aisha', 99, 'Sep'],
];

async function book(rows, { total, bold }) {
  const wb = new Workbook(); const ws = wb.addWorksheet('Q3');
  ws.columns = [{ width: 12 }, { width: 12 }, { width: 10 }, { width: 8 }];
  ws.addRow(['Region', 'Rep', 'Amount', 'Month']).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  if (total) {
    const t = ws.addRow(['Total', '', rows.reduce((a, r) => a + r[2], 0), '']);
    t.font = { bold: true };
  }
  for (const i of bold) ws.getRow(i + 2).getCell(3).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

const before = await book(ROWS, { total: false, bold: [] });
const sorted = [...ROWS].sort((a, b) => b[2] - a[2]);
const after = await book(sorted, { total: true, bold: [0, 1, 2] });
const out = `// GENERATED by fixtures/sheets/make.mjs — do not edit. Two workbooks for the
// promo's spreadsheet beat: the file as attached, and the file after the
// assistant sorts it and adds a Total row. Base64 so the workbench can serve
// real xlsx bytes to XlsxView without a disk.
export const SHEET_BEFORE = '${before}';
export const SHEET_AFTER = '${after}';
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sheets.ts'), out);
console.log('wrote fixtures/sheets.ts');
```
Run: `cd worktrees/promo-fakes/desktop && node src/renderer/dev/workbench/fixtures/sheets/make.mjs`
Expected: `wrote fixtures/sheets.ts` (file ≈ 12 KB).

- [ ] **Step 5: Serve the bytes from `readBinary`**

In `mock-shim.ts`, add the import near the other fixture imports:
```ts
import { SHEET_BEFORE, SHEET_AFTER } from './fixtures/sheets';
```
In `readBinary`, before the `if (ext === 'pdf')` branch:
```ts
      // Promo: the site session's spreadsheet. `window.__workbenchSheet = 'after'`
      // (set by the recording scene once the assistant's Edit card completes)
      // swaps in the sorted workbook; the viewer re-reads when its file is
      // re-opened, and the video cuts across that re-open.
      if (ext === 'xlsx') {
        const after = (globalThis as any).__workbenchSheet === 'after';
        return { ok: true, base64: after ? SHEET_AFTER : SHEET_BEFORE,
                 mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      }
```

- [ ] **Step 6: Run the tests**

Run: `cd worktrees/promo-fakes/desktop && npx vitest run tests/workbench-promo-fakes.test.ts tests/workbench-mock-contract.test.ts`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/dev/workbench/fixtures/sheets/make.mjs src/renderer/dev/workbench/fixtures/sheets.ts src/renderer/dev/workbench/mock-shim.ts tests/workbench-promo-fakes.test.ts
git commit -m "feat(workbench): real xlsx bytes for the site session, with a before/after switch for the promo"
```

---

### Task 4: The Remote Access fake and the takeover fake (youcoded)

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` — `HAND_WRITTEN` (line ~64), the `syncSpaces` namespace (line ~989-1041), the returned bridge literal (line ~1674)
- Test: `desktop/tests/workbench-promo-fakes.test.ts` (append)

**Interfaces:**
- Produces: `?remote=setup` → `remote.getConfig()` enabled + password, `detectTailscale()` connected with a URL, `getClientList()` empty (the QR banner state). `?remote=connected` → same plus one client. No param → unchanged (catch-all).
- `?lease=held:<device>` → `syncSpaces.leaseQuery()` → `{ held: true, device, self: false, source: 'workbench' }`, `leaseTakeover()` → `{ outcome: 'acquired' }`, `leaseForce()` → `{ ok: true }`. Without the param, `leaseQuery` → `{ held: false }`.

- [ ] **Step 1: Append the failing tests**

```ts
describe('remote access fake', () => {
  it('is untouched without ?remote= (catch-all answers [])', async () => {
    const c = await shim('');
    expect(await c.remote.getConfig()).toEqual([]);
  });
  it('?remote=setup renders the QR state: enabled, password set, Tailscale url, no clients', async () => {
    const c = await shim('?remote=setup');
    const cfg = await c.remote.getConfig();
    expect(cfg).toMatchObject({ enabled: true, hasPassword: true, clientCount: 0 });
    const ts = await c.remote.detectTailscale();
    expect(ts).toMatchObject({ installed: true, connected: true });
    expect(ts.url).toMatch(/^https?:\/\//);
    expect(await c.remote.getClientList()).toEqual([]);
  });
  it('?remote=connected lists one phone', async () => {
    const c = await shim('?remote=connected');
    const cls = await c.remote.getClientList();
    expect(cls).toHaveLength(1);
    expect(cls[0]).toMatchObject({ id: expect.any(String), ip: expect.any(String), connectedAt: expect.any(Number) });
    expect((await c.remote.getConfig()).clientCount).toBe(1);
    expect(await c.remote.getClientCount()).toBe(1);
  });
});

describe('takeover (lease) fake', () => {
  it('reports no holder without ?lease=', async () => {
    const c = await shim('?scenario=site');
    expect(await c.syncSpaces.leaseQuery('any')).toEqual({ held: false });
  });
  it('?lease=held:Pixel%209 reports another device and lets the takeover succeed', async () => {
    const c = await shim('?scenario=site&lease=held%3APixel%209');
    expect(await c.syncSpaces.leaseQuery('wb-past-1')).toEqual({ held: true, device: 'Pixel 9', self: false, source: 'workbench' });
    expect(await c.syncSpaces.leaseTakeover('wb-past-1')).toEqual({ outcome: 'acquired' });
    expect(await c.syncSpaces.leaseForce('wb-past-1')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/workbench-promo-fakes.test.ts`
Expected: the four new tests FAIL (`[]` / `undefined`).

- [ ] **Step 3: Implement the `remote` namespace**

In `mock-shim.ts`, next to the `signedInSwitch` line (~1117), add:
```ts
  // Promo switches (dev-only, like ?signedIn=1). `?remote=setup|connected` makes
  // the Settings → Remote Access popup render a real state instead of the
  // catch-all's [] (which reads as "Disabled"); `?lease=held:<device>` makes a
  // resume raise the "active on another device" takeover dialog.
  const remoteSwitch = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('remote') : null;
  const leaseSwitch = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lease') : null;
  const leaseHolder = leaseSwitch?.startsWith('held:') ? leaseSwitch.slice(5) : null;

  // Shapes: SettingsPanel.tsx RemoteConfig / TailscaleInfo / ClientInfo.
  const remoteClients = remoteSwitch === 'connected'
    ? [{ id: 'c-phone', ip: '100.92.14.9', connectedAt: Date.now() - 600_000 }] : [];
  let remoteConfig = { enabled: true, port: 7842, hasPassword: true, trustTailscale: true, keepAwakeHours: 4, clientCount: remoteClients.length };
  const remote: Ns<'remote'> | undefined = remoteSwitch ? {
    getConfig: async () => remoteConfig,
    setConfig: async (updates: Partial<typeof remoteConfig>) => { remoteConfig = { ...remoteConfig, ...updates }; return remoteConfig; },
    setPassword: async () => { remoteConfig = { ...remoteConfig, hasPassword: true }; return remoteConfig; },
    detectTailscale: async () => ({ installed: true, connected: true, ip: '100.92.14.3', hostname: 'destin-laptop', url: 'http://destin-laptop:7842' }),
    getClientCount: async () => remoteClients.length,
    getClientList: async () => remoteClients,
    disconnectClient: async () => undefined,
  } : undefined;
```
In the `syncSpaces` namespace object, add three members:
```ts
    // Promo: the conversation-lease gate App.tsx runs before a resume.
    leaseQuery: async () => leaseHolder ? { held: true, device: leaseHolder, self: false, source: 'workbench' } : { held: false },
    leaseTakeover: async () => ({ outcome: 'acquired' as const }),
    leaseForce: async () => ({ ok: true }),
```
In the returned bridge literal, add `remote` only when defined — change `arcade,` at the end of the literal to:
```ts
    arcade, ...(remote ? { remote } : {}),
```
Add to `HAND_WRITTEN`:
```ts
  'remote.getConfig', 'remote.setConfig', 'remote.setPassword', 'remote.detectTailscale',
  'remote.getClientCount', 'remote.getClientList', 'remote.disconnectClient',
  'syncSpaces.leaseQuery', 'syncSpaces.leaseTakeover', 'syncSpaces.leaseForce',
```
If `Ns<'remote'>` fails to type (the `remote` key is `any`-typed in `useIpc.ts`), type the object as `Record<string, (...a: any[]) => Promise<unknown>>` instead and say so in the WHY comment.

- [ ] **Step 4: Run the tests and the contract**

Run: `npx vitest run tests/workbench-promo-fakes.test.ts tests/workbench-mock-contract.test.ts tests/workbench-shim-semantics.test.ts`
Expected: all passing. If the contract test rejects a `remote.*` entry, the member name is not in `preload.ts`'s `remote:` block — check `src/main/preload.ts:760-772` and match the name exactly.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/dev/workbench/mock-shim.ts tests/workbench-promo-fakes.test.ts
git commit -m "feat(workbench): ?remote= and ?lease= switches so the promo can film Remote Access and the takeover dialog"
```

---

### Task 5: Three reply fixtures (youcoded), then the PR

**Files:**
- Create: `desktop/src/renderer/dev/workbench/fixtures/replies/briefing.jsonl`
- Create: `desktop/src/renderer/dev/workbench/fixtures/replies/sheet.jsonl`
- Create: `desktop/src/renderer/dev/workbench/fixtures/replies/flappy-task.jsonl`

`tests/workbench-fixture-actions.test.ts` already loads every `.jsonl` in the folder (`it.each(all)`), so the fixtures are tested by existing.

- [ ] **Step 1: Write `briefing.jsonl`** (beat 2; the user types after the chip's `brief me on `)

```jsonl
{"type":"assistant_text","text":"Pulling your notes and the syllabus for tomorrow's econ midterm.","delay":400}
{"type":"tool_use","id":"b1","name":"Skill","input":{"skill":"encyclopedia-librarian"},"delay":300}
{"type":"tool_result","tool_use_id":"b1","content":"Loaded: 3 lecture notes, syllabus, 2 problem sets","delay":900}
{"type":"tool_use","id":"b2","name":"Read","input":{"file_path":"School/Econ 201/notes-week-9.md"},"delay":300}
{"type":"tool_result","tool_use_id":"b2","content":"Elasticity, tax incidence, deadweight loss","delay":700}
{"type":"tool_use","id":"b3","name":"Read","input":{"file_path":"School/Econ 201/problem-set-4.md"},"delay":250}
{"type":"tool_result","tool_use_id":"b3","content":"6 questions, 2 marked wrong","delay":700}
{"type":"assistant_text","text":"Here's your brief. Three things to have cold: elasticity formulas, who bears a tax, and reading a deadweight-loss triangle off a graph. You missed both incidence questions on problem set 4, so that's where the hour goes.","delay":300}
{"type":"turn_complete","delay":300}
```

- [ ] **Step 2: Write `sheet.jsonl`** (beat 3)

```jsonl
{"type":"assistant_text","text":"On it.","delay":300}
{"type":"tool_use","id":"s1","name":"Read","input":{"file_path":"Q3-sales.xlsx"},"delay":300}
{"type":"tool_result","tool_use_id":"s1","content":"15 rows, 4 columns","delay":800}
{"type":"tool_use","id":"s2","name":"Edit","input":{"file_path":"Q3-sales.xlsx"},"delay":400}
{"type":"tool_result","tool_use_id":"s2","content":"Sorted by Amount, added a Total row, bolded the top three","delay":1100}
{"type":"assistant_text","text":"Sorted by amount, highest first. Total is 1,600. Diego's September is your biggest single month.","delay":300}
{"type":"turn_complete","delay":300}
```

- [ ] **Step 3: Write `flappy-task.jsonl`** (beat 4; a ~10 s turn that keeps ticking behind the game)

```jsonl
{"type":"assistant_text","text":"Building the study guide. This will take a minute.","delay":400}
{"type":"tool_use","id":"f1","name":"Glob","input":{"pattern":"School/Econ 201/notes-*.md"},"delay":600}
{"type":"tool_result","tool_use_id":"f1","content":"9 files","delay":900}
{"type":"tool_use","id":"f2","name":"Read","input":{"file_path":"School/Econ 201/notes-week-7.md"},"delay":700}
{"type":"tool_result","tool_use_id":"f2","content":"ok","delay":1100}
{"type":"tool_use","id":"f3","name":"Read","input":{"file_path":"School/Econ 201/notes-week-8.md"},"delay":700}
{"type":"tool_result","tool_use_id":"f3","content":"ok","delay":1100}
{"type":"tool_use","id":"f4","name":"Read","input":{"file_path":"School/Econ 201/notes-week-9.md"},"delay":700}
{"type":"tool_result","tool_use_id":"f4","content":"ok","delay":1100}
{"type":"tool_use","id":"f5","name":"Write","input":{"file_path":"School/Econ 201/study-guide.md"},"delay":900}
{"type":"tool_result","tool_use_id":"f5","content":"Wrote 2,140 words, 24 practice questions","delay":1400}
{"type":"assistant_text","text":"Study guide is in your files: 24 practice questions with answers, grouped by week.","delay":300}
{"type":"turn_complete","delay":300}
```

- [ ] **Step 4: Run the fixture tests and the full verify**

Run: `npx vitest run tests/workbench-fixture-actions.test.ts && cd /home/destin/youcoded-dev && bash scripts/verify.sh promo-fakes`
Expected: every `promo` fixture "parses with no error" / "uses only line kinds the loader handles" / "produces a non-empty timeline"; `verify.sh` green.

- [ ] **Step 5: Boot check, commit, PR**

```bash
cd worktrees/promo-fakes && git add desktop/src/renderer/dev/workbench/fixtures/replies/briefing.jsonl desktop/src/renderer/dev/workbench/fixtures/replies/sheet.jsonl desktop/src/renderer/dev/workbench/fixtures/replies/flappy-task.jsonl
git commit -m "feat(workbench): reply fixtures for the promo's briefing, spreadsheet and study-guide turns"
git push -u origin feat/promo-workbench-fakes
gh pr create --title "workbench: dev-only fakes and fixtures for the promo video" --body "$(cat <<'EOF'
Everything here lives under desktop/src/renderer/dev/workbench/ or tests/ — nothing reaches users.

- cherry-pick of ef38bfc0 (site session's own two files, artifacts.save overlay, chart.jsonl)
- real xlsx bytes for Q3-sales.xlsx with a before/after switch
- ?remote=setup|connected and ?lease=held:<device> switches
- three reply fixtures

Spec: youcoded-dev docs/active/specs/2026-09-03-promo-video-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Then boot the workbench for the worktree and run `node scripts/workbench-boot-check.mjs 5473` from the workspace root; it must pass before merge. Merge after Destin's review (a fresh session usually reviews).

---

### Task 6: Scenes and the filming script

**Files:**
- Create: `scripts/ui-review/scenes/promo-quick-chip.json`, `promo-sheet.json`, `promo-flappy.json`, `promo-strip.json`, `promo-remote.json`, `promo-phone.json`, `promo-takeover.json`, `promo-theme.json`, `promo-idle-midnight.json`, `promo-idle-golden.json`
- Create: `scripts/promo/film.sh`
- Modify: `.gitignore` (append `scripts/promo/out/`, `scripts/promo/public/`)

**Interfaces:**
- Produces: `scripts/promo/public/footage/<scene>.webm` + `.webp` + `.marks.json` for every scene, and `docs/active/prototypes/promo-2026-09/footage-review.md` linking the posters.
- Every action a beat trims to carries a `"mark"` (Task 7 names them): `chip`; `attach`, `reply`, `after`; `games`, `play`, `fly`; `drag`; `popup`, `setup`; `reply` (phone); `dialog`, `takeover`; `flip`.

The workbench must serve the **merged** `youcoded` master (or the `promo-fakes` worktree until merged): `bash scripts/run-workbench.sh promo-fakes` with `YOUCODED_PORT_OFFSET=300 VITE_NO_WATCH=1`.

- [ ] **Step 1: Write the scenes**

`promo-quick-chip.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&seed=none&reply=briefing&title=new+session",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 900},
    {"clickText": "Briefing", "tag": "button", "settle": 500, "mark": "chip"},
    {"typeSlow": "tomorrow's econ midterm", "cps": 26},
    {"key": "Enter", "settle": 400},
    {"waitForText": "that's where the hour goes", "tag": "p", "timeout": 25000, "settle": 1200},
    {"hold": 1200}
  ] }
```
`promo-sheet.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&seed=none&reply=sheet&title=Q3+sales",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "storage": { "youcoded-drawer-width": 820 },
  "actions": [
    {"hold": 600},
    {"eval": "dispatchEvent(new CustomEvent('buddy:attach-file',{detail:{filePath:'/home/you/Documents/Q3-sales.xlsx'}}))", "settle": 900, "mark": "attach"},
    {"click": "button[title='Session Files'], button[aria-label='Session Files']", "settle": 900},
    {"clickText": "Q3-sales.xlsx", "settle": 1600},
    {"click": "[placeholder^='Message']", "settle": 200},
    {"typeSlow": "sort it by amount and add a totals row", "cps": 28},
    {"key": "Enter", "settle": 400},
    {"waitForText": "biggest single month", "tag": "p", "timeout": 25000, "settle": 300, "mark": "reply"},
    {"eval": "window.__workbenchSheet='after'", "settle": 100},
    {"clickText": "Q3-sales.html", "settle": 500},
    {"clickText": "Q3-sales.xlsx", "settle": 1400, "mark": "after"},
    {"hold": 2200}
  ] }
```
`promo-flappy.json`. The `when` expression is the autopilot. It reads the DOM: the bird is the `will-change: transform` div that **contains the rig's SVG** (the pipe columns carry the same `will-change` marker and come first in the page, so "first will-change div" picks a pipe — the bug this replaces); each visible pipe slot is a direct child of the field with exactly two children (the top and bottom columns) and inline `visibility: visible` (the game sets it per frame), and the gap is the space between the lower edge of the higher column and the upper edge of the lower column. It flaps when the bird is falling and its centre is below the next gap's centre (minus 2 % of the field height):
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&seed=none&reply=flappy-task&title=study+guide",
  "theme": "halftone-dimension", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "storage": { "youcoded-drawer-width": 600 },
  "actions": [
    {"hold": 500},
    {"click": "[placeholder^='Message']", "settle": 200},
    {"typeSlow": "turn my lecture notes into a study guide with practice questions", "cps": 30},
    {"key": "Enter", "settle": 700},
    {"click": "button[title='Games']", "settle": 900, "mark": "games"},
    {"clickText": "Flappy", "tag": "button", "settle": 900},
    {"waitForText": "Play", "tag": "button"},
    {"clickText": "Play", "tag": "button", "settle": 700, "mark": "play"},
    {"waitFor": "[data-game-keys='space']", "settle": 300},
    {"click": "[data-game-keys='space']", "settle": 50},
    {"mark": "fly", "autopilot": {"ms": 9000, "every": 25, "minGap": 140, "key": "Space",
      "when": "(()=>{const f=document.querySelector(\"[data-game-keys='space']\");if(!f)return false;const fr=f.getBoundingClientRect();const bird=[...f.querySelectorAll('div')].find(d=>d.style.willChange==='transform'&&d.querySelector('svg'));if(!bird)return false;const br=bird.getBoundingClientRect();const by=br.top+br.height/2;const slots=[...f.children].filter(d=>d.children.length===2&&d.style.visibility==='visible');let next=null;for(const s of slots){const a=s.children[0].getBoundingClientRect(),b=s.children[1].getBoundingClientRect();if(a.width===0||a.right<br.left-2)continue;const top=Math.min(a.bottom,b.bottom),bot=Math.max(a.top,b.top);const gapCenter=(top+bot)/2;if(!next||a.left<next.left)next={left:a.left,center:gapCenter}}const target=next?next.center:fr.top+fr.height*0.45;const prev=window.__flapPrevY??by;window.__flapPrevY=by;const falling=by>=prev;return falling&&by>target-fr.height*0.02})()"}},
    {"hold": 900}
  ] }
```
`promo-strip.json` (scenario `default` has six pills; drag the fifth onto the second):
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=default&latency=150",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 900},
    {"moveTo": "[data-session-idx='4']", "ms": 500, "settle": 300},
    {"drag": "[data-session-idx='4']", "to": "[data-session-idx='1']", "ms": 1100, "settle": 400, "mark": "drag"},
    {"hold": 1600}
  ] }
```
`promo-remote.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&remote=setup",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 500},
    {"click": "[title=Settings]", "settle": 800},
    {"click": "[title='Remote Access']", "settle": 1200, "mark": "popup"},
    {"waitForText": "Set Up Remote Access", "tag": "button", "timeout": 8000},
    {"clickText": "Set Up Remote Access", "tag": "button", "settle": 1200, "mark": "setup"},
    {"hold": 2600}
  ] }
```
If the QR does not appear after "Set Up Remote Access", read `SettingsPanel.tsx:1089-1115` for the exact `showSetupQR` trigger and adjust the click; the gate is `tailscale.installed && tailscale.url && config.hasPassword && showSetupQR`.

`promo-phone.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&reply=week-sync&autoplay=2500&platform=android",
  "theme": "midnight", "width": 390, "height": 844, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 2600},
    {"waitForText": "synced to your other devices", "tag": "p", "settle": 800, "mark": "reply"},
    {"eval": "(document.querySelector('[data-testid=chat-scroll],main')||document.scrollingElement).scrollBy({top:800,behavior:'smooth'})"},
    {"hold": 2500}
  ] }
```
`promo-takeover.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&reply=week&lease=held%3APixel%209",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 500},
    {"click": "[title='All Sessions']", "settle": 700},
    {"clickText": "Resume", "settle": 1000},
    {"clickText": "compare two laptops", "settle": 900},
    {"clickText": "Resume Session", "tag": "button", "settle": 600},
    {"waitForText": "take over here", "timeout": 8000, "settle": 1500, "mark": "dialog"},
    {"clickText": "Take over", "tag": "button", "settle": 1200, "mark": "takeover"},
    {"hold": 2600}
  ] }
```
`promo-theme.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&reply=theme-builder&seed=none&title=new+theme",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [
    {"hold": 900},
    {"click": "[placeholder^='Message']", "settle": 200},
    {"typeSlow": "build me a theme with the vibe of outdoor anime art", "cps": 24},
    {"key": "Enter", "settle": 400},
    {"waitForText": "Golden Sunbreak installed", "timeout": 25000, "settle": 700},
    {"eval": "window.__workbenchAppearanceSync({theme:'golden-sunbreak'})", "settle": 200, "mark": "flip"},
    {"hold": 3800}
  ] }
```
`promo-idle-midnight.json` and `promo-idle-golden.json` (beats 1 and 8 — a still window; Remotion does the motion):
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&seed=none&title=new+session",
  "theme": "midnight", "width": 1440, "height": 900, "fps": 30, "boot": 3000,
  "actions": [ {"hold": 2500} ] }
```
The golden copy is identical with `"theme": "golden-sunbreak"`.

- [ ] **Step 2: Write `film.sh`**

```bash
#!/usr/bin/env bash
# Films every promo scene against a workbench serving <worktree>, into
# scripts/promo/footage/, and writes the footage-review page for Destin.
# Usage: bash scripts/promo/film.sh <worktree-or-path> [scene ...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
TARGET="${1:?worktree name or path}"; shift || true
if [[ -d "$WS/worktrees/$TARGET/desktop" ]]; then TDIR="$WS/worktrees/$TARGET"
elif [[ -d "$TARGET/desktop" ]]; then TDIR="$(cd "$TARGET" && pwd)"
else TDIR="$WS/youcoded"; fi
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-300}" VITE_NO_WATCH=1
export WB_PORT=$((5173 + YOUCODED_PORT_OFFSET))
OUT="$HERE/public/footage"; mkdir -p "$OUT"   # Remotion serves public/ — the clips and marks live there directly
REVIEW="$WS/docs/active/prototypes/promo-2026-09"; mkdir -p "$REVIEW/footage"

# The workbench we start is killed by process GROUP on exit (setsid gives it
# its own), never by a pkill pattern — a pattern can match the shell running it.
WB_PGID=""
trap '[ -n "$WB_PGID" ] && kill -- -"$WB_PGID" 2>/dev/null || true' EXIT
if ! curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null; then
  setsid bash "$WS/scripts/run-workbench.sh" "$TDIR" >"$OUT/workbench.log" 2>&1 &
  WB_PGID=$!
  for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null && break; sleep 1; done
fi
# Same guard as site-assets.sh: whatever answers must be serving THIS tree.
VITE_PID="$(ss -ltnp "sport = :$WB_PORT" 2>/dev/null | rg -o 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
VITE_CWD="$(readlink "/proc/${VITE_PID:-0}/cwd" 2>/dev/null || true)"
[[ "$VITE_CWD" == "$TDIR/desktop" ]] || { echo "[film] REFUSING: :$WB_PORT serves '${VITE_CWD:-nothing}', not '$TDIR/desktop'" >&2; exit 1; }
node "$WS/scripts/workbench-boot-check.mjs" "$WB_PORT"

SCENES=("$@"); [[ ${#SCENES[@]} -gt 0 ]] || SCENES=(promo-idle-midnight promo-quick-chip promo-sheet promo-flappy promo-strip promo-remote promo-phone promo-takeover promo-theme promo-idle-golden)
i=0; FAILED=()
for s in "${SCENES[@]}"; do
  echo "[film] $s"
  if CDP_PORT=$((10360 + i)) node "$WS/scripts/ui-review/record.mjs" "$WS/scripts/ui-review/scenes/$s.json" "$OUT/$s"; then
    cp "$OUT/$s.webp" "$REVIEW/footage/$s.webp"
  else FAILED+=("$s"); fi
  i=$((i+1))
done
{
  echo "# Promo footage — review"; echo; echo "Filmed $(date -I) from \`$TDIR\`. One poster (the last frame) per scene; the clips and marks are in \`scripts/promo/public/footage/\`."; echo
  for s in "${SCENES[@]}"; do echo "## $s"; echo; echo "![$s](footage/$s.webp)"; echo; done
  [[ ${#FAILED[@]} -eq 0 ]] || { echo "## Failed"; printf -- '- %s\n' "${FAILED[@]}"; }
} > "$REVIEW/footage-review.md"
echo "[film] done — ${#FAILED[@]} failed; review: $REVIEW/footage-review.md"
[[ ${#FAILED[@]} -eq 0 ]]
```

- [ ] **Step 3: Film, and fix selectors until every scene records**

Run: `bash scripts/promo/film.sh promo-fakes`
Expected: ten `frames=… duration=… out=…` lines and `0 failed`. For any `MISSING <selector>` or `TIMEOUT`, find the right selector with `node scripts/ui-probe.mjs "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site" --eval "<js>"` and fix the scene; never widen a `settle` to paper over a race — use `waitFor`.
For `promo-flappy`, the `autopilot:` stderr line reports presses. Check the clip's frames (`ffmpeg -i scripts/promo/public/footage/promo-flappy.webm -vf "select='not(mod(n,15))',scale=360:-1,tile=6x6" -frames:v 1 flappy-sheet.png`, read as an image) — the bird must clear at least four pipes. If it dies early, tune the `when` expression's `0.02` altitude margin (raise to flap earlier) and the `minGap` (lower for quicker recovery); re-film only that scene: `bash scripts/promo/film.sh promo-fakes promo-flappy`.

- [ ] **Step 4: Review the footage yourself**

Read every poster in `docs/active/prototypes/promo-2026-09/footage/` as an image, and a 6×6 frame sheet of each clip (the ffmpeg command above). Each scene must show what its storyboard row says, with no error card, no empty panel, no cursor parked over the thing being shown. Then check every marks file has the labels Task 7 needs: `for f in scripts/promo/public/footage/*.marks.json; do echo "$f: $(jq -r '[.actions[].mark | select(.)] | join(",")' "$f")"; done`. Re-film anything that fails before Task 7.

- [ ] **Step 5: Commit** (scenes, script, gitignore, the review page and its posters — the WebMs stay out)

```bash
git add scripts/ui-review/scenes/promo-*.json scripts/promo/film.sh .gitignore docs/active/prototypes/promo-2026-09/footage-review.md docs/active/prototypes/promo-2026-09/footage/
git commit -m "feat(promo): ten recording scenes and film.sh, one poster per scene for review"
```

---

### Task 7: The Remotion project

**Files:** everything under `scripts/promo/` listed in the file map except `music/` and `film.sh`.

**Interfaces:**
- Consumes: `scripts/promo/public/promo.wav`, `promo.grid.json`, `sfx-*.wav` (written there by Task 1's render), `scripts/promo/public/footage/<scene>.webm` + `<scene>.marks.json` (written there by Task 6), `scripts/promo/src/rig.ts` (copied from the app).
- Produces: composition `Promo` (1920×1080, 30 fps, `durationInFrames = TOTAL_FRAMES` = 2075) and still `Layout` (one frame, for approving the screen geometry).
- Order inside this task is load-bearing: **Step 1 (the layout still) is approved before any beat is written.**

- [ ] **Step 0: Scaffold**

```bash
cd scripts/promo && cat > package.json <<'EOF'
{
  "name": "youcoded-promo",
  "private": true,
  "type": "module",
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "still:layout": "remotion still src/index.ts Layout out/layout.png --browser-executable /usr/bin/google-chrome-stable",
    "render:draft": "remotion render src/index.ts Promo out/draft.mp4 --scale 0.5 --browser-executable /usr/bin/google-chrome-stable",
    "render": "remotion render src/index.ts Promo out/promo-video.mp4 --codec h264 --crf 18 --browser-executable /usr/bin/google-chrome-stable",
    "test": "node --test src/timeline.test.ts src/captions.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@remotion/cli": "4.0.520",
    "@remotion/google-fonts": "4.0.520",
    "@remotion/transitions": "4.0.520",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "remotion": "4.0.520"
  },
  "devDependencies": {
    "@types/react": "19.1.0",
    "typescript": "5.8.3"
  }
}
EOF
cat > remotion.config.ts <<'EOF'
import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx", "lib": ["ES2023", "DOM"],
    "strict": true, "skipLibCheck": true, "resolveJsonModule": true, "noEmit": true, "allowImportingTsExtensions": true }, "include": ["src"] }
EOF
npm install
mkdir -p src/beats out
cp ../../youcoded/desktop/src/renderer/components/mascot/default-buddy-rig.ts src/rig.ts
```
Check `src/rig.ts` has no imports (it exports one string constant); if it imports anything, inline what it needs. Then create `src/golden.ts` by pasting the contents of the app's `themes/community/golden-sunbreak/assets/mascot-welcome.svg` and `mascot-shocked.svg` as `export const GOLDEN_WELCOME = \`…\`; export const GOLDEN_SHOCKED = \`…\`;` (backticks inside the SVGs, if any, escaped).

`node --test` runs the two `.ts` tests directly (Node 26 strips types natively) — so `timeline.ts` and `captions.ts` **must not import anything** (no JSON, no remotion); they are plain data + pure functions.

- [ ] **Step 1: `src/layout.ts`, the `Layout` still, and approval**

```ts
// src/layout.ts — the ONE set of screen coordinates. Every beat positions the
// window, the caption, the host and the phone from here; nothing is ad hoc.
// The window is filmed at 1440×900 and shown at 0.98 (1:1 pixels, so the
// app's 14 px text is 14 px in the video), leaving headroom for the host and a
// caption band below. Approved from the `Layout` still before any beat existed.
export const FRAME = { w: 1920, h: 1080 };
export const CLIP = { w: 1440, h: 900 };                       // what record.mjs films
export const WINDOW = { scale: 0.98, cx: 960, cy: 541 };       // centre; 1411×882 at scale 0.98 → x 254–1665, y 100–982
export const windowRect = (scale = WINDOW.scale) => {
  const w = CLIP.w * scale, h = CLIP.h * scale;
  return { x: WINDOW.cx - w / 2, y: WINDOW.cy - h / 2, w, h };
};
export const CAPTION = { top: 990, h: 90, size: 44 };          // the band below the window
export const MASCOT = { size: 120, feetIn: 34 };               // feet `feetIn` px into the window's title bar
/** Where the host sits on the window's top edge, for a given window scale and a 0–1 position along it. */
export const perch = (along = 0.3, scale = WINDOW.scale) => {
  const r = windowRect(scale);
  return { x: r.x + r.w * along - MASCOT.size / 2, y: r.y - MASCOT.size + MASCOT.feetIn };
};
export const PHONE = { w: 390, h: 844, scale: 0.86, x: 1445, y: 130 };   // over the window's right edge, clear of the caption band
```
`src/beats/LayoutStill.tsx` — one frame with everything on it: `Backdrop`, the `Window` holding frame 0 of `promo-idle-midnight`, the mascot at `perch()`, a caption (`CAPTIONS.b3`), and the `Phone` holding frame 0 of `promo-phone`. Register it in `Root.tsx` as `<Still id="Layout" component={LayoutStill} width={1920} height={1080} />`.

Run: `npm run still:layout` and **look at `out/layout.png`** (Read it as an image). Approve only when: the caption sits wholly inside the band with clear space above and below; the mascot's feet rest on the title bar and its head is fully in frame; the phone does not touch the caption; the window's shadow does not clip. Adjust `layout.ts` until all four hold. Save the approved still as `docs/active/prototypes/promo-2026-09/layout.png` (it is the record of what was approved).

- [ ] **Step 2: `src/grid.ts` and `src/marks.ts`**

```ts
// src/grid.ts
import grid from '../public/promo.grid.json';
export const FPS = 30;
export const BAR_S = grid.bar_seconds as number;
export const BEAT_S = grid.beat_seconds as number;
export const TOTAL_BARS = grid.bars as number;
/** First frame of bar `b` (fractional bars allowed: 2.5 = the third beat of bar 2). */
export const barFrame = (b: number) => Math.round(b * BAR_S * FPS);
export const TOTAL_FRAMES = barFrame(TOTAL_BARS);
```
```ts
// src/marks.ts — every trim in the timeline comes from here, never from a
// hand-measured frame. record.mjs writes <scene>.marks.json beside each clip:
// the video-time start/end of every scene action, labelled by its `mark`.
import { FPS } from './grid';
import quickChip from '../public/footage/promo-quick-chip.marks.json';
import sheet from '../public/footage/promo-sheet.marks.json';
import flappy from '../public/footage/promo-flappy.marks.json';
import strip from '../public/footage/promo-strip.marks.json';
import remote from '../public/footage/promo-remote.marks.json';
import phone from '../public/footage/promo-phone.marks.json';
import takeover from '../public/footage/promo-takeover.marks.json';
import theme from '../public/footage/promo-theme.marks.json';
import idleMidnight from '../public/footage/promo-idle-midnight.marks.json';
import idleGolden from '../public/footage/promo-idle-golden.marks.json';
type Marks = { fps: number; duration: number; actions: { i: number; kind: string; mark: string | null; start: number; end: number }[] };
const MARKS = { 'promo-quick-chip': quickChip, 'promo-sheet': sheet, 'promo-flappy': flappy, 'promo-strip': strip, 'promo-remote': remote,
  'promo-phone': phone, 'promo-takeover': takeover, 'promo-theme': theme, 'promo-idle-midnight': idleMidnight, 'promo-idle-golden': idleGolden } satisfies Record<string, Marks>;
export type Scene = keyof typeof MARKS;
export function markSec(scene: Scene, label: string, edge: 'start' | 'end' = 'start'): number {
  const a = MARKS[scene].actions.find((x) => x.mark === label);
  if (!a) throw new Error(`no mark "${label}" in ${scene}.marks.json — add "mark": "${label}" to that action in the scene and re-film`);
  return a[edge];
}
/** Clip frame (at the composition's 30 fps) of a labelled action, plus an offset; never negative. */
export const markFrame = (scene: Scene, label: string, edge: 'start' | 'end' = 'start', offset = 0) =>
  Math.max(0, Math.round(markSec(scene, label, edge) * FPS) + offset);
export const clipFrames = (scene: Scene) => Math.round(MARKS[scene].duration * FPS);
```

- [ ] **Step 3: `src/timeline.ts`, `src/captions.ts`, and their tests (write the tests first)**

`src/timeline.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, CUT, sequenceFrames, transitionFrames, startFrames } from './timeline.ts';
const barFrame = (b: number) => Math.round(b * (240 / 118) * 30);
test('beats tile bars 0–34 with no gap or overlap', () => {
  assert.equal(BEATS[0].bars[0], 0); assert.equal(BEATS.at(-1)!.bars[1], 34);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].bars[0], BEATS[i - 1].bars[1]);
});
test('every beat starts exactly on its downbeat once transitions overlap', () => {
  assert.deepEqual(startFrames(barFrame), BEATS.map((b) => barFrame(b.bars[0])));
});
test('a sequence is padded by exactly the transition that follows it', () => {
  for (const b of BEATS) assert.equal(sequenceFrames(b, barFrame), barFrame(b.bars[1]) - barFrame(b.bars[0]) + transitionFrames(b));
  assert.equal(transitionFrames(BEATS.at(-1)!), 0);
  assert.equal(CUT, 6);
});
```
`src/timeline.ts`:
```ts
// The beat list and the one piece of arithmetic that keeps every cut on a
// downbeat. A TransitionSeries transition OVERLAPS its neighbours by its
// length, so each sequence is padded by exactly the transition that FOLLOWS
// it — pad by anything else and every later beat drifts (the first draft of
// this plan padded a 2-frame fade by 6 and landed the theme drop 4 frames late).
export const CUT = 6;                                   // frames: a 200 ms slide; the spec caps transitions at 250 ms
export type Transition = 'slide' | 'slide-up' | 'none';
export type Beat = { id: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8'; bars: [number, number]; after: Transition };
export const BEATS: Beat[] = [
  { id: 'b1', bars: [0, 2], after: 'slide' },           // cold open
  { id: 'b2', bars: [2, 6], after: 'slide' },           // quick chip
  { id: 'b3', bars: [6, 10], after: 'slide' },          // spreadsheet
  { id: 'b4', bars: [10, 14], after: 'slide-up' },      // Flappy
  { id: 'b5', bars: [14, 16], after: 'slide' },         // the drag (the break)
  { id: 'b6', bars: [16, 21], after: 'slide' },         // remote → phone → takeover (the build + half-time groove)
  { id: 'b7', bars: [21, 29], after: 'slide' },         // ONE continuous clip: the theme request typed under bars 21–22, the flip on bar 23's downbeat
  { id: 'b8', bars: [29, 34], after: 'none' },          // close
];
export const transitionFrames = (b: Beat) => (b.after === 'none' ? 0 : CUT);
export const sequenceFrames = (b: Beat, barFrame: (bar: number) => number) => barFrame(b.bars[1]) - barFrame(b.bars[0]) + transitionFrames(b);
/** First frame of each beat in the finished composition. */
export function startFrames(barFrame: (bar: number) => number): number[] {
  let t = 0;
  return BEATS.map((b) => { const s = t; t += sequenceFrames(b, barFrame) - transitionFrames(b); return s; });
}
```
`src/captions.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPTIONS, BANNED } from './captions.ts';
const spec = readFileSync(new URL('../../../docs/active/specs/2026-09-03-promo-video-design.md', import.meta.url), 'utf8');
test('every caption is a string from the spec storyboard table', () => {
  for (const [k, text] of Object.entries(CAPTIONS)) assert.ok(spec.includes(text), `${k}: "${text}" is not in the spec`);
});
test('no caption uses a banned landing-page phrase', () => {
  for (const text of Object.values(CAPTIONS)) for (const w of BANNED) assert.ok(!text.toLowerCase().includes(w), `"${text}" contains "${w}"`);
});
```
`src/captions.ts`:
```ts
// The eight lines on screen — exactly the spec's storyboard strings, pinned by
// captions.test.ts against the spec file and the landing page's banned list.
export const CAPTIONS = {
  b1a: 'YouCoded',
  b1b: 'Useful. Fun. Yours.',
  b2: 'Start with one click.',
  b3: 'Your files, right beside the chat.',
  b4: 'Play while it works.',
  b5: 'Drag your conversations into order.',
  b6: 'Start on your laptop. Finish on your phone.',
  b7: "Describe a look. It's yours.",
  b8: 'Free. Open source. Windows · Mac · Linux · Android.',
  link: 'github.com/itsdestin/youcoded',
} as const;
export const BANNED = ['real app', 'real files', 'actually', 'does real work', 'self-improving'];
```
Run: `npm test` → 5 passing.

- [ ] **Step 4: Visual primitives (all positioned from `layout.ts`)**

`src/Backdrop.tsx` — a slow gradient in the theme's colours; `switchAt` flips midnight → golden on a frame (beat 7):
```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
export const THEMES = {
  midnight: { canvas: '#0D1117', glow: '#1f2a3a', accent: '#B1BAC4', onAccent: '#0D1117' },
  golden:   { canvas: '#08080e', glow: '#3a2410', accent: '#ffc030', onAccent: '#000000' },
};
export const Backdrop: React.FC<{ theme: keyof typeof THEMES; switchAt?: number }> = ({ theme, switchAt }) => {
  const f = useCurrentFrame();
  const t = THEMES[switchAt != null && f >= switchAt ? 'golden' : theme];
  const x = interpolate(f, [0, 900], [30, 70], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: `radial-gradient(60% 80% at ${x}% 40%, ${t.glow} 0%, ${t.canvas} 70%)` }} />;
};
```
`src/Window.tsx` — the app window: a shadowed rounded panel centred at `WINDOW`, scaled around its centre (`scale` overrides the layout scale for beat 8's smaller window; `pushIn` grows it by that fraction over the first 8 s; `dy` offsets it for beat 1's rise):
```tsx
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { CLIP, WINDOW } from './layout';
export const Window: React.FC<{ scale?: number; pushIn?: number; dy?: number; opacity?: number; children: React.ReactNode }> =
  ({ scale = WINDOW.scale, pushIn = 0, dy = 0, opacity = 1, children }) => {
  const f = useCurrentFrame();
  const s = scale * (1 + interpolate(f, [0, 240], [0, pushIn], { extrapolateRight: 'clamp' }));
  return (
    <div style={{ position: 'absolute', left: WINDOW.cx, top: WINDOW.cy + dy, width: CLIP.w, height: CLIP.h, opacity,
      transform: `translate(-50%, -50%) scale(${s})`, transformOrigin: 'center',
      borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)' }}>
      {children}
    </div>
  );
};
```
`src/Footage.tsx` — a clip inside the window, trimmed by frame, optionally sped up (`rate`) so a long recording fits its bars:
```tsx
import { OffthreadVideo, staticFile } from 'remotion';
import { Window } from './Window';
import { CLIP } from './layout';
import type { Scene } from './marks';
export const Footage: React.FC<{ file: Scene; from?: number; rate?: number; pushIn?: number; scale?: number; dy?: number; opacity?: number }> =
  ({ file, from = 0, rate = 1, pushIn = 0, scale, dy, opacity }) => (
    <Window pushIn={pushIn} scale={scale} dy={dy} opacity={opacity}>
      <OffthreadVideo src={staticFile(`footage/${file}.webm`)} trimBefore={from} playbackRate={rate} muted style={{ width: CLIP.w, height: CLIP.h }} />
    </Window>
  );
```
`src/Phone.tsx` (from `PHONE`, `x` overridable for the slide-in) and `src/Caption.tsx` (centred in the `CAPTION` band, springing up on its cue frame; `top` and `size` overridable for beat 8's two lines):
```tsx
// Caption.tsx
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { CAPTION } from './layout';
const { fontFamily } = loadFont();
export const Caption: React.FC<{ text: string; at: number; top?: number; size?: number; color?: string }> = ({ text, at, top = CAPTION.top, size = CAPTION.size, color = '#fff' }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, height: CAPTION.h, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily, fontSize: size, fontWeight: 700, letterSpacing: '-0.02em', color, textShadow: '0 4px 24px rgba(0,0,0,.6)',
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)` }}>
      {text}
    </div>
  );
};
```

- [ ] **Step 5: `src/poses.ts` and `src/Mascot.tsx`** — the host

`src/poses.ts` (values from the app's `mascot-poses.ts`; pivots from the rig's `data-pivot`s):
```ts
export type Face = 'idle' | 'welcome' | 'curious' | 'shocked' | 'dizzy';
export type Pose = 'idle' | 'welcome' | 'curious' | 'shocked' | 'flap' | 'peek';
export const PIVOT = { 'rig-arm-left': '2.5px 9px', 'rig-arm-right': '21.5px 9px' } as const;
export const POSES: Record<Pose, { arms: [number, number]; face: Face; wave?: boolean }> = {
  idle:    { arms: [0, 0],       face: 'welcome' },
  welcome: { arms: [0, -160],    face: 'welcome', wave: true },
  curious: { arms: [0, 0],       face: 'curious' },
  shocked: { arms: [130, -130],  face: 'shocked' },
  flap:    { arms: [150, -150],  face: 'welcome' },
  peek:    { arms: [-160, 160],  face: 'welcome' },
};
```
`src/Mascot.tsx` — cues are absolute frame + position + pose; position and limb angles spring from the previous cue with the app's constants (k=170, d=16); the raised arm waves at ~3 Hz in `welcome`; a 2 % idle bob is always on; `costume: 'golden'` swaps in the Golden Sunbreak still (shocked or welcome). Same code as the earlier draft of this plan, with `size` defaulting to `MASCOT.size` and positions supplied by the beats from `perch()`.

- [ ] **Step 6: The beats — every trim from `markFrame`, every position from `layout.ts`**

All frames inside a beat are relative to the beat's first frame (TransitionSeries resets `useCurrentFrame`). `P = perch()` is the host's home. Whoosh/pop sound effects are 12-frame `Sequence`s of `Audio`.

- **Beat1** (bars 0–2): `Backdrop midnight`; `Footage promo-idle-midnight` with `dy` springing from +700 to 0 and opacity from the rise spring, starting at `barFrame(1)`; `Caption b1a` at 4 (size 84, `top` = centre of the frame while the window is still off-screen, then it moves up… simpler: `b1a` shows at 4 and hides when the window arrives — render it only while `f < barFrame(1) + 6`), `Caption b1b` at `barFrame(1) + 10` in the band; cues: peek from `{x: 880, y: FRAME.h}` → `{y: FRAME.h - 90}` at 10 → curious at 34 → `P` idle at `barFrame(1)`; a pop at 10 and at `barFrame(1) + 12`.
- **Beat2** (2–6): `Footage promo-quick-chip from={markFrame('promo-quick-chip', 'chip', 'end', -3)} pushIn={0.02}` — the chip's click releases on frame 3 of the beat, i.e. on bar 2's downbeat; `Caption b2` at 10; cue `P` idle.
- **Beat3** (6–10): two `Sequence`s of one recording — `0…barFrame(3)`: `from={markFrame('promo-sheet', 'attach', 'start', -6)}` at `rate` chosen so the request and the first tool card fit three bars (compute: `(markSec('promo-sheet','reply','end') - markSec('promo-sheet','attach','start')) / (3 * BAR_S)`, clamped to `[1, 1.6]`); from `barFrame(3)`: `from={markFrame('promo-sheet', 'after', 'end', -6)} pushIn={0.04}` — the re-opened, sorted sheet. `Caption b3` at 12; cues `P` idle → at 30 `perch(0.62)` curious (leans toward the panel).
- **Beat4** (10–14): the host is hidden (the bird is the mascot). `Footage promo-flappy from={markFrame('promo-flappy', 'games', 'start', -4)} pushIn={0.04}`; `Caption b4` at 12.
- **Beat5** (14–16): `Footage promo-strip from={markFrame('promo-strip', 'drag', 'start', -12)}` (no push-in; the break is quiet so the motion reads); `Caption b5` at 8; cues `P` idle → 24 curious.
- **Beat6** (16–21, five bars): `T1 = barFrame(1.5)` (phone slides in), `T2 = barFrame(3)` (cut to the takeover recording). `Sequence 0…T2`: `Footage promo-remote from={markFrame('promo-remote', 'popup', 'start', -6)}`; `Sequence T2…end`: `Footage promo-takeover from={markFrame('promo-takeover', 'dialog', 'start', -24)}` (the dialog appears ~0.8 s in, then **Take over**); `Sequence T1…end`: `Phone` sliding from `x: 1980` to `PHONE.x` on a spring, holding `OffthreadVideo footage/promo-phone.webm trimBefore={markFrame('promo-phone', 'reply', 'start', -40)}`; `Caption b6` at `T1 + 8`; cues `P` idle → `T1 + 8` hop onto the phone `{x: PHONE.x + 40, y: PHONE.y - 60, size: 96}` curious → `T2 + 10` back to `P` idle; pops on both hops.
- **Beat7** (21–29, eight bars, one continuous clip): `FLIP = barFrame(2)`; `from = markFrame('promo-theme', 'flip', 'start') - FLIP` — **throw at module load if negative** (`the theme recording has less than two bars before the flip; re-film with a longer hold`); `Backdrop midnight switchAt={FLIP}`; `Footage promo-theme from={from}`; `Caption b7` at `FLIP + 14`; chime `Sequence from={FLIP}`; cues `P` idle → `FLIP` shocked golden → `FLIP + 18` welcome golden. (The build's riser and the fill run under the typing; the reply lands and the whole app turns gold on the downbeat of bar 23.)
- **Beat8** (29–34): the window settles smaller — `Footage promo-idle-golden scale={0.82} dy={-60}`; `Backdrop golden`; `Caption b8` at 6 with `top` computed from `windowRect(0.82)` (`r.y + r.h + 36`); the link line (`CAPTIONS.link`, size 30, colour `#ffc030`) 62 px below it from `barFrame(1)`; cues `perch(0.3, 0.82)` adjusted for `dy` welcome golden → `barFrame(3)` `{y: -320}` (hops out of the top); a pop at `barFrame(3)`.

`src/beats/index.ts` exports the eight components keyed by beat id: `export const COMPONENTS: Record<Beat['id'], React.FC> = { b1: Beat1, … }`.

- [ ] **Step 7: `src/Promo.tsx`, `Root.tsx`, `index.ts` — the timeline is built from `BEATS`, not written by hand**

```tsx
// src/Promo.tsx
import { AbsoluteFill, Audio, staticFile, Sequence } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { barFrame } from './grid';
import { BEATS, CUT, sequenceFrames } from './timeline';
import { COMPONENTS } from './beats';

export const Promo: React.FC = () => {
  const nodes: React.ReactNode[] = [];
  for (const b of BEATS) {
    const C = COMPONENTS[b.id];
    nodes.push(<TransitionSeries.Sequence key={b.id} durationInFrames={sequenceFrames(b, barFrame)}><C /></TransitionSeries.Sequence>);
    if (b.after !== 'none') nodes.push(
      <TransitionSeries.Transition key={`${b.id}-t`} timing={linearTiming({ durationInFrames: CUT })}
        presentation={slide({ direction: b.after === 'slide-up' ? 'from-bottom' : 'from-right' })} />);
  }
  return (
    <AbsoluteFill style={{ background: '#0D1117' }}>
      <Audio src={staticFile('promo.wav')} />
      {/* a whoosh on every cut, on the cut's first frame */}
      {BEATS.filter((b) => b.after !== 'none').map((b) => (
        <Sequence key={b.id} from={barFrame(b.bars[1]) - 2} durationInFrames={10}><Audio src={staticFile('sfx-whoosh.wav')} volume={0.35} /></Sequence>
      ))}
      <TransitionSeries>{nodes}</TransitionSeries>
    </AbsoluteFill>
  );
};
```
`Root.tsx` registers `<Composition id="Promo" … durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />` and `<Still id="Layout" … />`; `index.ts` calls `registerRoot`.

- [ ] **Step 8: Typecheck, tests, draft render**

Run: `cd scripts/promo && npm run typecheck && npm test && npm run render:draft`
Expected: clean types, 5 passing, `out/draft.mp4` (960×540) in a few minutes.

- [ ] **Step 9: Review the draft yourself, then iterate**

Extract and READ (as images):
- a contact sheet, one frame per second: `ffmpeg -y -loglevel error -i out/draft.mp4 -vf "select='not(mod(n,30))',scale=320:-1,tile=6x12" -frames:v 1 out/contact.png`
- the first frame of every beat and the frame before it, from `startFrames(barFrame)` (`for f in …; do ffmpeg -y -loglevel error -i out/draft.mp4 -vf "select='eq(n,$f)'" -frames:v 1 out/cut-$f.png; done`) — each pair must show the cut landing exactly there.
- the flip: frames `barFrame(23) - 1`, `barFrame(23)`, `barFrame(23) + 1` — gold must first appear on the middle one.

Judge against the checklist: every cut on a downbeat; the flip on bar 23's first frame; captions wholly inside the band and readable at 960 px wide; the host never covers a tool card that is being read; the phone never covers the takeover dialog; the Flappy bird clears at least four pipes on screen; no clip runs out (a frozen last frame) before its beat ends — `clipFrames(scene) - from` must exceed the beat's frames (add this as a runtime check in each beat: throw with the scene name and the shortfall). Fix and re-render until every item holds; note each round's findings in `docs/active/prototypes/promo-2026-09/draft-notes.md`.

- [ ] **Step 10: Commit** (sources only)

```bash
git add scripts/promo/package.json scripts/promo/package-lock.json scripts/promo/remotion.config.ts scripts/promo/tsconfig.json scripts/promo/src docs/active/prototypes/promo-2026-09/layout.png docs/active/prototypes/promo-2026-09/draft-notes.md
git commit -m "feat(promo): the Remotion timeline — eight beats on the beat grid from a tested layout, marks-driven trims, the mascot host, captions, sound"
```

---

### Task 8: Final render, loudness, hand-over

**Files:**
- Create: `scripts/promo/render.sh`

- [ ] **Step 1: `render.sh`**

```bash
#!/usr/bin/env bash
# Final render + loudness normalisation. Usage: bash scripts/promo/render.sh [draft]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
if [[ "${1:-}" == "draft" ]]; then npm run render:draft; exit; fi
npm run render
# Two-pass loudnorm to -14 LUFS (what streaming players expect; Reddit does not
# re-level, so a quiet track just sounds quiet). Video stream copied untouched.
M=$(ffmpeg -hide_banner -i out/promo-video.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
I=$(jq -r .input_i <<<"$M"); TP=$(jq -r .input_tp <<<"$M"); LRA=$(jq -r .input_lra <<<"$M"); TH=$(jq -r .input_thresh <<<"$M")
ffmpeg -y -hide_banner -loglevel error -i out/promo-video.mp4 -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$I:measured_TP=$TP:measured_LRA=$LRA:measured_thresh=$TH:linear=true" -c:a aac -b:a 192k out/youcoded-promo.mp4
ffmpeg -y -hide_banner -loglevel error -i out/youcoded-promo.mp4 -an -c:v copy out/youcoded-promo-silent.mp4
ffmpeg -hide_banner -i out/youcoded-promo.mp4 -af ebur128 -f null - 2>&1 | grep -E "I:|LRA:" | tail -2
ls -la out/youcoded-promo.mp4 out/youcoded-promo-silent.mp4
```
`jq` must exist (`which jq`); if not, parse with `python3 -c "import json,sys;…"`.

- [ ] **Step 2: Render and verify**

Run: `bash scripts/promo/render.sh`
Expected: `I: -14.x LUFS`, two files. Check with `ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -of compact out/youcoded-promo.mp4`: `h264 1920×1080 30/1` and `aac`. Size well under 1 GB (expect 20–60 MB).

- [ ] **Step 3: Hand over**

Paths in chat, nothing else:
`/home/destin/youcoded-dev/scripts/promo/out/youcoded-promo.mp4` (with music) and `…/youcoded-promo-silent.mp4`.

- [ ] **Step 4: Commit**

```bash
git add scripts/promo/render.sh
git commit -m "feat(promo): render.sh — final H.264 render with two-pass loudnorm and a silent variant"
```

---

### Task 9: Close out

- [ ] Spec `status: draft` → `shipped`; move spec and this plan to `docs/archive/{specs,plans}/`; move `docs/active/prototypes/promo-2026-09/` to `docs/archive/prototypes/`.
- [ ] `docs/MAP.md`: add a row for `scripts/promo/` (music + Remotion) under dev tooling, pointing at `scripts/ui-review/README.md` → "Recording a loop" for the filming half.
- [ ] `docs/roadmap/dev-workspace.md` under `## rigs`: one line — "promo video is re-renderable: `bash scripts/promo/film.sh <worktree> && bash scripts/promo/render.sh`; re-film after any UI change the video shows — trims come from the marks files, so a re-film needs no timeline edits".
- [ ] `youcoded`: close-out for `feat/promo-workbench-fakes` — `bash scripts/close-out.sh feat/promo-workbench-fakes youcoded`, delete branch and worktree.
- [ ] `bash scripts/close-out.sh` for any workspace branch used; `node scripts/roadmap-check.mjs --fix`; commit from a linked worktree; push.
- [ ] Shut down the workbench on :5473 (`pgrep -af "vite --port 5473"` → `kill <pid>`).
