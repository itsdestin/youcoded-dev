# The youcoded sound-effects kit

One small set of real, soft, close-up sounds (paper, felt, fabric, pens, soft keys, leather),
reused in every film and advert. They answer **actions** on screen; the music answers feelings.
None of them is a tune, chord, chime, bell, whoosh, zip, sweep, riser, clap or clack (the owner's
rulings in `../felt-and-pulse/RULES.md`).

**Listen:** every file is in `out/`. Three alternatives per sound (a, b, c); pick by ear.
**Re-make everything:** `scripts/campaign/sound/sfx-kit/render.sh` (downloads the recordings on
first run, about 15 seconds after that, identical files every time).

Every file: 48 kHz, 24-bit WAV, stereo that sums to mono without loss, starts on the touch
(no dead air) and starts and ends on exact silence.

## The sounds

★ = my recommended pick. "Real" = a recording, edited; "synth" = made by code.

### 1. key-press (one key; typing is many of them) — also `typing-demo-a/b/c.wav` (3 s each)
- **a ★** Real laptop keys, softened: the thin top "tick" removed, a little body added. Five
  different presses rotate in the demo, so it sounds like a person, not a loop. Natural, quiet.
- **b** Real soft-switch keyboard (two recordings), rounder and lower. Only three distinct
  presses exist (each in three slightly different sizes), so the demo is a touch more uniform.
- **c** A fingertip tap on felt with a tiny plastic "key" ring (half real, half synth). The
  softest and most "premium" of the three; may feel less like a real keyboard.
- All three sit about 13 dB quieter than the rest of the kit (peaks near -19 dB). Typing
  demos: humanised timing (bursts of 3-6 keys, pauses between words), strength varied,
  lighter presses slightly darker.

### 2. send (0.15-0.21 s)
- **a ★** A card pushed a few centimetres across a table: short, soft, paper.
- **b** A soft brush of cotton: gentler, more "hush" than "paper".
- **c** The little lift-and-flick at the end of a page turn: crispest of the three.

### 3. reply-arrives (0.26-0.28 s)
- **a** A sheet of paper laid down: a short slide into a soft landing.
- **b ★** Two soft fingertip taps on felt, the second lighter: a friendly "knock knock".
- **c** A small leather pouch set down: warmest, least "paper".

### 4. appear (0.27-0.30 s)
- **a ★** A card slid into place and settling.
- **b** A soft fold of cotton landing.
- **c** A puff of air under a sheet with a felt touch (synth air + real tap): the airiest.

### 5. change (0.5-0.75 s) — the hard one; nothing here moves in pitch
- **a ★** A cloth being flipped over (real): tactile, clearly "something turned".
- **b** A short rustle of cotton clothing (real): brighter and busier.
- **c** A breath of warm air through felt over a soft low body (synth): the calmest and the
  safest against "whoosh", but the least physical.

### 6. move (0.32-0.37 s)
- **a ★** A card pushed across felt and coming to rest (real).
- **b** Something soft sliding on felt then stopping with a tap (synth slide + real tap).
- **c** A hand smoothing a sheet of rough fabric (real).

### 7. grow (0.16-0.22 s) — a soft pop of emphasis, no boing
- **a ★** A fingertip pressing firmly into felt, with a little low "give" (real).
- **b** Soft leather squeezed (real).
- **c** A small soft "puk": a fingertip into a rubber dome, a felt tap and a little air
  (mostly synth). The most "pop"-like; most at risk of feeling like a UI sound.

### 8. marker-stroke — `marker-stroke-x.wav` = 0.6 s, `marker-stroke-short-x.wav` = 0.25 s
Real recordings this time, not filtered noise. Each keeps the real pen-down at the start and
the lift-off at the end; any length can be made (`sounds.marker(v, seconds)`). The top-end
hiss is pulled down and the gritty "drag" of felt tip on paper lifted.
- **a** A marker on paper (SSkiba88): grainy, uneven, very "pen".
- **b** One long, very even marker line (TubbsMedia): smoothest; the one most likely to
  read as "shh".
- **c ★** A marker on paper (Torikari): gritty stick-slip grain, the clearest "felt-tip pen".

### 9. handwriting (about 1 s of a word, then a full stop at +0.16 s)
The full stop is a real pen-down taken from the same recording, so pen, paper and table match.
- **a ★** Marker writing (same pen family as marker-stroke c, so the films stay consistent).
- **b** Ballpoint pen: finer and scratchier.
- **c** Pen writing, continuous and quieter in texture.

### 10. page-turn
- **a ★** A full book page lifted and laid over (1.0 s): the storybook one.
- **b** A crisp page turn, its sharp flick softened (0.46 s).
- **c** A quiet, slow page turn (0.40 s): the softest.

### 11. lock / 12. unlock (pairs: lock-a goes with unlock-a, and so on)
- **a** A book cover closing / opening (real): soft and papery, more "shut" than "latch".
- **b ★** A small metal latch heard as if inside a felt-lined box (real, heavily softened):
  closest to "latch" without any clack.
- **c** Two gentle contacts (lock) / one contact and a breath of release (unlock) (synth).

### 13. count-up (1.1-1.2 s at about 16 numbers a second; the last touch slightly firmer)
- **a** Fingertip taps on paper (real).
- **b ★** Fingertip taps on felt (real), slightly different sizes: the softest; same "felt"
  touch as the key-press and reply.
- **c** A trickle of tiny paper-grain puffs (synth): no resonance at all.

### 14. reveal (1.3-1.8 s) — the biggest sound in the kit, sitting 2 dB above the rest
- **a ★** A large sheet of fabric settling (real): opens at its fullest and only falls and
  settles; a "curtain", not a whoosh.
- **b** A deep soft bloom of air and low warmth (synth): no pitch at all; the most cinematic,
  the least physical.
- **c** A dozen paper cards laid down at once with a cloth and a little low warmth (real +
  synth): "many things land".

## Levels

- Each trio is matched for how loud it feels (the loudest 100 ms, K-weighted, the same filter
  that loudness meters use): every trio's spread is 0.00 LU.
- Each trio's loudest peak sits at -6 dB, **except** that no effect may feel louder than
  -18 LUFS (reveal -16), so steady sounds (marker, handwriting, page, reveal) peak lower,
  between -6 and -13 dB. WHY: a steady marker line peaking at -6 dB would feel far louder than a
  tap peaking at -6 dB; the ceiling keeps the kit sitting together.
- Key press: about -33.7 LUFS, roughly 13 dB under the rest (peaks -18 to -20 dB).

## What was measured (all 215 checks pass; `out/checks.txt`, raw numbers `out/measurements.json`)

- **Clean starts and ends:** the first and last sample of every file are exactly zero.
- **No clacks:** a "clack" is a sudden, loud burst in the 2-6 kHz band. Limit: no sudden onset
  (a jump of more than 18 dB within about 3 ms) louder than -18 dB relative to the sound's peak.
  For scale, hard UI clicks, switches, latches and casino chips measure -2 to -12 on this
  scale. The kit's worst is -20.1 (count-up c); most have no sudden onset at all.
- **No upward sweep** in change, move and reveal: the brightness (spectral centroid, 10 ms
  steps, smoothed over 80 ms) never rises by more than 0.29 octave anywhere (limit 0.35) and
  every one ends darker than it starts (net -0.19 to -2.9 octaves). The large downward numbers
  come from the last moment being only the soft low body dying away (a settle), not a glide.
  Pictures: `out/plots/sweep.png`.
- **Mono:** left and right are 99.96-99.99 % the same; folding to mono loses 0.00 LU.
- **No clipping:** highest true peak -5.9 dBTP.

## How it is made

`src/sounds.py` holds every sound (one function per sound, its sources named in comments);
`src/dsp.py` the tools; `src/build.py` levels, measures and writes; `src/measure.py` the
measurements; `src/plots.py` the pictures. Two tools do most of the "softness" work:
`round_attacks` never lets the treble get louder by more than 10 dB within 3 ms (soft touches
pass, clacks are rounded off) and `settle_brightness` (change, move and reveal only) never lets
the brightness rise once the first 25 ms touch is over.

## What is weakest (honest)

- **Nobody has listened yet.** I cannot hear; every choice was made from spectrograms and
  measurements. Expect to swap a pick or two after one listen.
- **lock-c / unlock-c** (synth latches) are the least convincing: small low resonances that may
  sound like a soft "bonk" rather than a latch.
- **count-up** in every version: any fast regular series risks reading as ticking. They are
  soft and uneven, but this is the sound I would test first in a film.
- **marker-stroke b** is the smoothest and most likely to read as "shh" again; a and c have the
  real pen grain the old synthetic marker lacked.
- **key-press b** has only three distinct presses (resized), so its typing is a little uniform.
- **The Freesound recordings are high-quality MP3 previews**, not the original files (originals
  need an account). After the softening filters this is hard to hear, but it is a small
  quality ceiling; signing in and swapping in the originals would remove it.
- **The two "safety" processors can dull things.** Where a recording naturally brightened
  (fabric lifting, a card starting to slide), the treble is held down instead; if a pick sounds
  a little muffled, that is why.
