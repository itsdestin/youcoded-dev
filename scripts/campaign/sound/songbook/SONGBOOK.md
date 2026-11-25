# The youcoded songbook

Every film's music is composed in code, here. This page is the composer's whole guide: read it
top to bottom once, then follow **The procedure**. Nobody here can listen; you judge by note dumps
and measurements, and you never claim something sounds good.

## What is fixed (the identity) and what is wanted

**Fixed: "Felt and pulse."** A soft, close felt piano (the person) over quiet, clean electronics
and strings (the machine doing what the person asks); E-flat major and its relative C minor; one
tune built on three notes in the rhythm of "you-co-ded" (B-flat, G, F); the sound logo as every
piece's last phrase; no drums, claps or clacks; soft pens only; one song per film.

**Wanted: the owner's gold standard is game pause/map menu music**, "the perfect blend of subtle
and engaging. quiet, not distracting, easy to listen to indefinitely without it becoming annoying,
but still varied and interesting to listen to. also quite soothing." Research into how that music
is made (`~/Documents/youcoded-campaign/music-research/`) gives the method this page teaches:

- **Write the bed first, the tune last.** A soft, steady bed works on its own; the tune comes in
  only one to three places.
- **Something held always sounds underneath** (a pad, held strings, a pedalled chord).
- **The pulse stays on the same few notes while the chords change.**
- **Variety comes from loops of unequal length and from layers drifting in and out**, not from
  new notes. Repetition in the background is welcome; surprises are rationed.
- **Few chords, changed slowly, each keeping a note of the last.**
- **Dark and soft.** Phrases shaped like a pianist's, not notes nudged at random.
- **Under a narrator: fewer notes, not just quieter ones.** **Hit very few picture moments.**

What went wrong before, in the owner's words: round 6 "extremely repetitive and poorly put
together" (the tune's opening bar seven times over one chord loop); round 7 "odd/choppy/
inconsistent", "too busy/harsh", "piano notes ... oddly thrown in", slow music under a fast
narrator (novelty forced everywhere); round 8 composers bent their music to pass automatic checks.
That is why measurements are now **gauges on a dashboard, never goals** (see Measurement).

## The procedure (brief to score)

Every film follows these steps in order. Commands are run from anywhere:
`scripts/campaign/sound/songbook/render.sh ...` (shown below as `render.sh`).

1. **The brief, measured before any note.** In the film file write a `recipes.Brief`: film type
   (type-only / app demo / narrated), length, 3-5 adjectives, "subtle" or "present", and the 1-3
   moments that matter as `(seconds, label)`, one labelled `"peak"`; the cut list (`picture`), the
   text cards (`cards`: each must stay up 0.2 s a word + 2 s, +3 s at 10 words), the name's time
   (`logo_at`). Narrated: map her words with `films.speech_from_words(words.json, t_from,
   start_at=1.5)` (1-2 s of music before her first word).
2. **The tempo.** `render.sh --brief <film>` prints the brief, the cards' hold times, and
   `fit_tempo`: the 3 best tempi with every moment's error in ms and frames, an odd bar if one
   helps, and the motion grid JSON for the editor. Under a narrator it prints her pace, her tempo
   band (a beat every 2-3 syllables) and the value nearest 120, then fits around it with her
   sentence ends as soft hits. Write the tempo it gives. One tempo per film.
3. **Pick a recipe** (below) and call it with the brief's numbers. Do not invent a new form for
   one film; if none fits, add a fourth recipe to `src/recipes.py` and say so.
4. **Write the change plan** (`changes=`): one entry per turn of the picture, 8-16 s apart, plus
   the peak (see The change plan).
5. **The bed alone.** `render.sh --bed <film>` renders sustain + pulse + cycles with no tune and
   prints its dashboard. Read the bed's gauges (sustain, pulse-rate, pulse-sim, groups,
   common-tone) before writing a tune note.
6. **The tune and the lift.** Place 1-3 phrases from the bank (`tune=[(bar, "name")]`), name the
   peak. `render.sh --notes <film>` (1 s, no audio) prints the bar table, the bed, the hard checks
   and the dashboard.
7. **Two sketches.** `render.sh --sketch <film> [switch=value]` renders the first 20 s twice: A as
   written, B with ONE switch changed (default: the sustain pad against held strings; or e.g.
   `pulse=chord`, `chords=plain`, `bed.cutoff=1200`, `sec.fig_touch=0.35`, or any sound switch:
   `pad_timbre=triangle`, `piano=salamander`, `air_db=11`). A misspelt switch stops with the list
   of known ones. The owner picks.
8. **Render and report.** `render.sh <film>`. Every render also writes `<name>-bed.wav`, the
   no-melody mix. Report the numbers: the hard checks, every out-of-range gauge with its one-line
   explanation, and the answers to "Before reporting" below. Never claim it sounds good.

## The three recipes

Each recipe is a function in `src/recipes.py` that returns a complete, steady `Piece` from only
`name, length, land, bpm`; every other argument has a working default you then replace with what
your film needs. `recipes.land_after(bars, bpm, ending)` tells you where the name lands.

### Recipe A: type-only short (10-20 s) - `recipes.type_short(...)`

| Item | Setting (default) |
|---|---|
| Tempo | 100-120 bpm from `fit_tempo`; a card about every 2-bar phrase |
| Harmony | 2 chords alternating, one per 2 bars (`"Ebmaj9 Ebmaj9 Abmaj9 Abmaj9"`), the same top note |
| Sustain | the pad from frame 0 |
| Pulse | the pedal pulse in eighths, pool B-flat 4, G4, F4, E-flat 4, 10 of 16 steps, touch 0.42 |
| Cycles | none, or one |
| Tune | none (the pulse already says B-flat G F; the logo is the statement) or the cell once |
| Changes | 0-1 (e.g. `(3, "brightness", 1.25)`) |
| Lift | none, or at most 1.5 dB |
| Ending | `ending="short"` (2 beats), the quiet logo if subtle; at least 1.5 s of ring after the name |
| Level | -16.5 LUFS subtle, -15 present |

### Recipe B: app demo, no narrator (30-75 s) - `recipes.app_demo(...)`

| Item | Setting (default) |
|---|---|
| Tempo | 104-120 bpm from `fit_tempo` (116) |
| Harmony | one chord per 2 bars from the vocabulary (`Ebmaj9 Cm9 Abmaj9 Bb9sus`), each change sharing a note |
| Sustain | the pad throughout; held strings may join at the peak (they double the pad's voicing) |
| Pulse | the pedal pulse, 2.5-4 notes a second, the chord's root held under each chord (`fig_bass`) |
| Cycles | 2-3 on co-prime periods, above C5 (default 23 and 29 half-beats), at most a third sounding |
| Tune | 2-3 one-bar phrases, each followed by at least 2 bars of bed; default: a phrase, the same phrase again, a peak phrase reaching C6 |
| Changes | one every 8-16 s at the picture's turns (default: cycles and sub coming in, the strings at the peak) |
| Lift | 2.5 dB over 2 bars into the peak, then settle 1 dB |
| Form | the first 30 s must stand alone (it becomes the :30 cut-down) |
| Ending | the full sigh and logo (`logo="quiet"` if subtle) |
| Level | -15 LUFS (-16 subtle) |

### Recipe C: narrated story (30-75 s) - `recipes.narrated(...)`

| Item | Setting (default) |
|---|---|
| Tempo | her band (syllables x 60 / 3 to / 2), the value nearest 120 |
| Harmony | changes on her sentence ends (one chord name per sentence, or the default: C-minor family, turning bright at `turn=` seconds, her problem-to-solution turn), at most one per 1.5 s |
| Sustain | the pad, 95 % or more |
| Pulse | soft and high (B-flat 5, G5, F5: above her range F3-E5), 9 of 16 steps, never two rests running; once she stops it comes down to B-flat 4 (a `"pool"` change) |
| Cycles | one at most, only in her pauses of a second or more; `whimsy=True` adds a bell-like double of the cell in a third of its rounds (storybook) |
| Tune | only in pauses that fit a whole phrase, and after her last word |
| Level | one hand-set level under her words (-6 dB), -2 after them; never moving with her words |
| Mux | `Piece.voice_mux = dict(path=voice.wav, t_from, start_at, music_db=-10)`: her margin is measured |

### Starting from a recipe (a film file)

```python
"""<Film>, first score: <one line on the idea>."""
import recipes as R
from cycles import Cycle
from films import Film

BPM = 116                                   # from render.sh --brief
LAND = R.land_after(15, BPM)                # the name after 15 bars and the sigh
BRIEF = R.Brief("app-demo", 36.0, ("bright", "easy"), "present",
                moments=[(8.28, "the editor"), (24.83, "peak")], logo_at=LAND,
                picture=[(0.0, "open"), (8.28, "the editor"), (16.55, "the theme"), (24.83, "it works")])
PIECE = R.app_demo(
    "my-film-r1", 36.0, land=LAND, bpm=BPM, peak=24.83, seed=7, brief=BRIEF, hits=BRIEF.hits(),
    chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus ...",   # one name per bar; [Ab Bbsus] = two
    tune=[(4, "cell"), (9, "cell"), (13, "from-top")],                  # bar, phrase from the bank
    cycles=[Cycle("Bb5/0.5 G5/1", period=23, offset=5, name="cycle1")],
    changes=[(5, "in", "cycle1"), (9, "in", "sub"), (13, "in", "held"), (13, "peak")],
    explain={},                                                         # see Measurement
    notes="one line for the report")
FILM = Film("my-film-r1", PIECE, picture=BRIEF.picture, copy_to=None)
```

Worked examples, rendered with note dumps and dashboards: `recipe-a-example`,
`recipe-b-example`, `recipe-c-example` in `src/demos.py` (outputs in `out/`, notes in
`out/notes/`). Copy the closest one. What their dumps show the engine doing (2026-11-25): the
sustain sounds 100 % of the time, with common notes held through chord changes (B's E-flat 3 for
the whole piece); the pulse keeps B-flat 4, G4, F4, E-flat 4 under every chord (`pedal-fit` 0,
`pulse-sim` 0.93-1.00); B's two cycles (23 and 29 half-beats) come round at different places in
the bar each time; layers enter on their bar lines with 2-bar fades (B: cycle at 8.3 s, sub at
16.6 s, strings at the peak, 24.8 s); every phrase keeps one touch (spread 0.02-0.09) and arches;
tilt -7.3 (B) and -6.9 (C) dB an octave, A darker at -12.4.

## The stack

In order of importance; at most three groups sound at once (sustain, pulse, held strings, and
the tune and cycles counted together as one).

**1. Sustain** (`bed.py`). Sounds 95 % of the time or more. `Piece.bed = dict(sustain="pad" |
"held" | "ring", touch=0.40, cutoff=None, fade=2)`. The pad is voiced 3-4 notes between B-flat 2
and B-flat 4, moving as little as possible, keeping a common note and its top note where it can,
never a semitone, major seventh or minor ninth against itself, the pulse's notes or the bass
below C5; a voice moving by step hands over without overlap; it resolves with the logo onto
E-flat and rings under it. The note dump prints every voicing.

**2. Pulse** (`blocks.acc_pedal`, `Section(fig_mode="pedal")`). A pool of notes (`fig_pedal`,
default the cell + tonic) taken in a fixed order on the steps of a 16-step mask (`fig_mask`,
`x` = play), the same whatever the chord; each note held into the next (legato). The mask drifts
one step every 4 bars (`fig_mask_walk=(4, 1)`, seeded), keeping 6-10 of 16 steps and never two
rests running. `fig_bass=True` adds the chord's root, soft and held, at each chord change.
`fig_touch` 0.26-0.42. The round-8 chord-following figure remains as `fig_mode="chord"`.

**3. Cycles** (`cycles.py`). `Cycle(cell, period, offset, name, voice="piano"|"bell", touch,
chance, transpose_walk, unit="half"|"bar")`. The cell's notes come from E-flat pentatonic + D
(no semitones; anything else is refused). Periods pairwise co-prime; each cell at most a third
of its period; under 20 s one cycle, 30-75 s two or three; at most one cycle note a second in
all. `chance` is decided once per round. An onset is left out (never moved) inside a tune phrase,
under her words, within a beat of the peak, or a semitone from the pad below C5; the note dump
counts what was left out and why. A cycle the change plan never brings `"in"` plays from the
start.

**4. Tune** (`tunebank.py`, `tune.PHRASES`). Twelve phrases of 1-2 bars cut from the tune: `cell`,
`cell-on` (bar 1 as written), `cell-long`, `falls`, `question`, `climb`, `settle`, `rise`,
`answer`, and three that reach C6 and are kept for the peak (`higher`, `from-top`, `peak-arc`).
Place them with `tune=[(bar, "name")]` (or a `motif.write(...)` Phrase). A phrase heard once and
never echoed or answered sounds "thrown in": say a phrase twice, or answer it within a bar. A
phrase ending on the last bar of a 4-bar group may come back with a small seeded change to its
last note or rhythm (at most one in four such bars). The tune sits 2 dB under its bus's usual
level and at touch 0.8: one voice among the bed, not a soloist popping in and out.

**5. Ending** (unchanged): the sigh and the logo, `logo="blend" | "quiet" | "piano" | "none"`,
`ending="sigh" | "short"` (see Identity reference).

## The change plan

`Piece.changes = [(bar, what, arg), ...]`; bars count from 1 over the whole piece (an odd bar is
bar 1; the ending bar is not counted). A layer never switches: it fades in a straight line over
2 bars from its bar line.

| Entry | What it does |
|---|---|
| `(bar, "in", layer)` / `(bar, "out", layer)` | layers: `sustain`, `pulse`, `held`, `sub`, or a cycle's name |
| `(bar, "register", k)` | the pulse pool moves k scale steps (at most 3, a fourth) |
| `(bar, "pool", ["Bb4", ...])` | the pulse moves to a new set of notes (a bigger change) |
| `(bar, "density", k)` | the pulse mask gains or loses k steps (off-beats first; never two rests running) |
| `(bar, "brightness", x)` | the pad's filter opens or closes (x 0.7-1.3) |
| `(bar, "echo", amount)` | the echo send on the pad and cycles (the mix reads `band.echo_curve`) |
| `(bar, "family", "bright")` | marks a chord-family turn (the chords themselves are in `chords=`) |
| `(bar, "peak")` | the peak: the only bar line where two changes may meet |

Spacing: one change every 8-16 s; under 20 s, none or one. **Surprises** (an outside chord, a leap
over an octave, a new instrument, an off-beat tune entry) total one under 20 s and two or three in
30-75 s, at least 8 s apart, one of them the peak. Never swap sections: a mood change is chords
and layers on one continuous piece.

## Harmony

- **One chord per 2 bars** by default (4 s at 120); one per bar only at a cadence.
- **The vocabulary** (`tune.VOCAB`): Ebmaj9, Ebadd9, Ebsus2, Cm9, Cm11, Abmaj9, Abmaj7#11, Fm9,
  Gm7, Bb9sus, Ab/Bb, Bbsus4, and the plain chords (Eb, Cm7, Abmaj7, Bbsus, Cm, Fm7, Ab, Eb/G,
  Ab/C). Plain Bb7 to Eb only in the logo. A borrowed colour (Abm, Db, F7) at most once per film.
- **Every change keeps at least one note of the last chord** (two is better).
- **A few chords that come back, not many**: at least 2 under 20 s, 3 at 30 s, 4 at 60 s, and no
  more than one literal repeat of a 4-bar progression.
- Write chords as a string, one name per bar, `[Ab Bbsus]` for two in a bar; `recipes.OWNER
  ["chords"]="plain"` maps every rich chord to its plain one.

## Timing

- **The tempo comes first**, from `fit_tempo` (the picture) or `timing.narrator_band` (her pace).
  A moment counts as hit when the music is heard 15 ms early to 45 ms late; music heard early
  feels wrong. If a weight-3 moment will not fit, `odd=2` or `odd=3` puts one 2- or 3-beat bar first
  (`Section(meter=2)`, one bar, no tune), or ask the editor to move the picture to the grid.
- **Hit very few moments**: music-in, the peak and the logo, and at most one more per 15 s; never
  two cuts in a row. "Just having the tempo lining up can be enough."
- **The shared time line** (style `"v3"`, every recipe): one 1/f deviation of 4-6 ms per sixteenth
  for the whole band, plus at most 2 ms per note; a soft note is struck as early as it is heard
  late (17 ms on our felt piano); the pulse gets no phrase arch.
- **Phrase-shaped melody** (v3): a +-1 dB arch peaking 60 % through each phrase, higher notes a
  little louder, short notes a little lighter, a small gap before a leap or a repeated note, the
  last note 40 ms longer then a breath, the melody 15 ms ahead of the band, one touch per phrase
  (spread at most 0.12).
- **Endings**: the ending bar slows on a curve that slows late (end tempo 85 %; `rit=1.0` for the
  short ending); a real ending, never a fade, at least 1.5 s of ring after the name.

## The sound (mix and master)

Every piece goes through the same chain (`src/mix.py`, `src/engine/`); each choice is a switch in
`src/engine/options.py` with a default. Order of precedence: the piece's `Piece.sound = {...}`,
then the environment for a whole run (`SONGBOOK_SOUND="air_db=11,pad_timbre=triangle"`), then the
piece's style profile, then the default.

- **Felt piano** (Upright KW, CC0): the soft and loud recordings lined up and crossfaded between
  touch 0.55 and 0.80; every recording matched to its neighbours in level and brightness; the
  filter follows the phrase's touch (each note's own deviation counts 25 %); a faint ring of the
  undamped strings while the pedal is down; added "shine" off.
- **Pad** (`sounds.pad`, played by `bed.py` through `Band.pad`): two detuned saws (or triangles),
  24 dB/oct low-pass at 900 Hz key-tracked 50 %, attack 1.2 s, release 2.2 s, a 25-second drift of
  its colour, about 25 % wider than the piano. Its bus sits around -32 LUFS, about 8 dB under the
  pulse.
- **Buses**: one fixed gain per bus per film (`bus_gain="fixed"`), so a softer touch or a quieter
  section is heard as written. Piano buses: high-pass 40 Hz, -2.5 dB at 250 Hz, low-pass 8 kHz.
- **Spaces**: one darker hall (send high-pass 220 Hz, return low-pass 7 kHz; pre-delay 25 ms,
  longer at slow tempi) and a small room; a dotted-eighth **echo** on the pad and cycles (the change
  plan's `echo` entries scale it).
- **Under a narrator**: a static mid-only cut of 2.5 dB at 3.2 kHz and the pad's centre 3 dB down,
  moving only with the hand-set section levels. No ducking.
- **Master**: high-pass 25 Hz, mono below 140 Hz, the air shelf at **0 dB** (a piece may ask for up
  to +1.5; anything higher is capped), gentle glue (at most 2 dB), true-peak limiter at -1 dBTP.
  `mix.deliver()` makes web (-14), subtle web (-16.5), US TV (-24 LKFS, -2 dBTP) and EU TV (-23)
  files from one premaster.
- **Profiles**: `style="v1"` pieces (what the owner has heard) keep the whole old sound byte for
  byte (checked 2026-11-25: `make-it-mine` renders identical to the delivered
  `sb-take2-mix.wav`); `"v2"` (rounds 7-8) get the new sound with the old bus levelling; `"v3"`
  (every recipe) gets every default.

| Sound switch | Default | Other values | Whose call |
|---|---|---|---|
| `piano` | `upright-kw` | `vcsl-upright`, `salamander` (fetch with `fetch-samples.sh`) | [OWNER] A/B |
| `pad_timbre` | `saw` | `triangle` (rounder) | [OWNER] |
| `pad_sub` | off | on (a sine an octave down) | [OWNER] |
| `damper_thump` | off | on (a felt thump as a damper lands; reads as a knock in a sparse tune) | [OWNER] A/B |
| `air_db` | 0 | up to 1.5 per piece; `air_db=11,air_policy=as-written` = the old 11 dB shelf | A/B pair in the plan |
| `piano_layers`, `piano_even`, `piano_resonance`, `piano_shine`, `piano_bus_eq`, `glue`, `bus_gain`, `echo`, `voice_cut` | the new sound | the old behaviour, for A/B | ours |
| `pad_cutoff`, `pad_attack`, `pad_release`, `reverb_lp`, `reverb_hp`, `hall_predelay`, `piano_3k_cut`, `piano_saturation`, `pad_centre_under_voice` | as above | numbers | ours |

## Measurement: hard fails and the dashboard

**Hard fails** are faults whatever the music. Only these can fail a render:

| Check | Fails when |
|---|---|
| `clipping` | a clipped sample, or true peak over -1 dBTP |
| `silence` | over a second of nothing between the first frame and the name |
| `clash` | a semitone or minor ninth held more than half a beat between sustained notes below C5, or any such interval with a note outside the chord, or a tune note on a borrowed chord's clashing note, in a bar the composer did not mark (`Piece.clash_ok = {bar: "why"}`) |
| `narrator-masked` | a tune or cycle note in her range (F3-E5) starting while she speaks; with `voice_mux`, her voice under 6 dB above the music in the phone band |
| `length` | the wrong file length, the name more than 10 ms off its frame, a non-silent first or last sample, less than 1.5 s after the name |

**The dashboard** is everything else, printed in groups with a target range and what it means:

| Group | Gauges (target) |
|---|---|
| the bed | `sustain` (>= 95 %), `pulse-rate` (2-4 a second; 1.5-3 narrated), `pulse-sim` (>= 0.85 bar to bar), `pedal-fit` (pool notes fit every chord) |
| how busy | `attack-rate` (<= 4.5 a second), `groups` (<= 3), `fg-duty` (tune and cycles <= a third of each section), `fg-onsets` (<= 1 a second), `voice-busy` (<= 3 struck notes a second in her range [OWNER: 3 or 5]), `orphan` (0 phrases never echoed or answered) |
| harmony | `common-tone`, `chord-variety` (enough chords; 3-chord runs <= 55 % unique), `borrowed` (<= 1), `held-sevenths` (major sevenths held low inside a chord) |
| change | `change-plan` (8-16 s apart), `surprise-budget`, `cycles` (count, co-prime, duty, rate), `novelty-peaks` (audio: turns heard <= planned + 1) |
| touch and tone | `touch` (max 0.62, each phrase's spread <= 0.12), `tilt` (-5 to -8 dB an octave), `presence` (2-5 kHz <= -17 dB, 5-16 kHz <= -30), `roughness` (uncalibrated) |
| timing | `tempo-stretch` (<= 3 %), `narrator-tempo` (her band), `narrator-chords` (on her phrase ends), `voice-margin` (10-14 dB), `picture-sync` (weight-3 hits on, nothing early), `hit-budget` |
| older checks | every round-8 composition check (foundation, pulse, even, grid, phrases, the tune and cell identity limits, peak, settle, level-rate, loudness-range, tone, ...) |
| mix | loudness, mono, the tune on top, attacks on notes, no drum-like attack, air and low bands (the air band's -38 dB floor applies only to the old 11 dB master; on the new one only its ceiling does, and `tilt` and `presence` judge the tone) |

**THE RULE.** The dashboard never fails a render. For every out-of-range number the composer does
one of two things: **explain it in one line** (`Piece.explain = {"gauge-id": "why"}`, printed next
to it), or **change the music for a musical reason** and say what the reason was. Nothing musical
is ever added, removed or bent to move a number: no layer added to brighten a gauge, no note moved
to pass a count, no tool wrapped to dodge a check. A gauge reading out of range is information
about the music; a composer who changes the music only to move the needle has made it worse.

## The owner's switches [OWNER]

These are his decisions by ear. Each is a switch with a default; never decide them yourself.
Change one for a run with `SONGBOOK_OWNER="sustain=held"`, per piece with `owner_over={...}`, or
for the B sketch with `render.sh --sketch <film> sustain=held`.

| Switch | Options (default first) | Question for him |
|---|---|---|
| `sustain` | `pad` / `held` / `ring` | the held layer: soft synth pad, held strings, or ringing piano |
| `pulse` | `pedal` / `chord` | a pulse on a few fixed notes, or round 8's chord-following figure |
| `narrator_tempo` | `near120` / `stress` | under her: a beat near 115-120, or at her stress rate (~138) |
| `voice_busy` | `3` / `5` | struck notes a second in her range under her words (the gauge's target) |
| `under_voice` | `static` / `follow` | a fixed tone change under her (built, in the mix) or a dip that follows her words (NOT built: his rule) |
| `chords` | `rich` / `plain` | 9th and sus chords, or plain triads and sevenths |

The sound's own [OWNER] switches (the piano A/B, pad timbre, pad sub, damper thump) are in
**The sound** above. The optional bed library (long approved beds that films
are cut from) is not built: it would reverse "each film gets its own piece" and is his call.

## Pitfalls (what went wrong, and must not come back)

- **The tune as wallpaper** (round 6): the opening bar seven times in 54 s. The tune is rare;
  repetition belongs to the bed.
- **Novelty quotas** (round 7): minimum rhythm variety, off-beat entries, "something new every N
  s", accompaniment changes, a drop before the peak, more than 4 distinct chords, a minimum
  loudness range above 2 dB. They made "choppy". Never re-add them under new names.
- **Notes in her breaths** ("oddly thrown in"), and **a beat at her syllable rate** (busy).
- **Uneven bed**: no phrase arch or 1/f tempo drift on the pulse; no voice-keyed ducking.
- **Many layers at once** ("busy"): three groups at most.
- **Bright** ("harsh"): the tilt gauge; soft touches; no high line alone in a thin bar.
- **Gaps in the pulse**: two rests running opened a 10 dB hole (first recipe test); the drift
  never makes one, but a hand-written mask can.
- **Gaming the gauges** (round 8): a violin added to pass a brightness check, a tool wrapped to
  dodge one. Explain the number instead.
- **"What GTA VI did"**: nothing about its pause or map cue is published; do not claim it.
- Treat numeric benchmarks from research (pulse similarity 0.86, chord-run 40 %) as direction,
  not targets.

## Before reporting

Read the bar table and the note log (`out/notes/<name>.txt`, `.log.txt`):
- Is there one sustain and one pulse from the first beat to the name? Where does it thin, and is
  that a planned change?
- How many groups sound in each bar (`parts`: U pad, P piano pulse, H held strings, K cycle, L
  tune, S sub)?
- Does every tune phrase come back or get answered? Where is the tune silent?
- What changes at each planned turn, and only that?
- Under a narrator: her pace, the tempo, her margin, where the chords change against her
  sentence ends.
- Every out-of-range gauge: explained, or changed for a musical reason?

## The owner's rulings (in his words where possible)

- **No drums, claps or clacks, ever**, no kick and no kit.
- **Never a fake-out or a "thwip"**: "it sounds like a 2005 browser demo switching pages". No
  zips, sweeps, whooshes or risers.
- **One piece of music per film**: "we cant *just* have notes, we need consistent
  tunes/strings/chords/etc."
- **No scattered high jingles.** A high part is a continuous line.
- **Under a narrator, the music's level does not bounce**: set by hand per section, never an
  automatic dip on every word.
- **Coherent first, then subtle** ("odd/choppy/inconsistent", "busy/harsh", "oddly thrown in").
- **Under a narrator, the music moves at her pace** ("the music is very slow/steady, while the
  narrator is fast fast") - now through her tempo band, not her syllable rate.
- **Music answers feelings; sound effects answer actions.**
- **Sound effects are made for each film**; **pens are soft and smooth, never scratchy** ("Soft
  pen" was his pick).
- **The voice always wins.**
- **Two logos**: "piano only if we're ever using the logo sound by itself without other music,
  but the full blend if at the end of an ad with our other music."
- **Subtle when asked**: fewer notes, softer touch, more space, one clear idea, and the quiet logo.
- **Short films are short**: one unbroken, even phrase.
- **Code-made music**, so every piece can be forked and iterated.

## Identity reference

**The tune** (E-flat major, 4 beats a bar): bar 1 **B-flat, G, F**, E-flat (the signature
"you-co-ded"); bar 2 E-flat, high C, B-flat, G; bar 3 A-flat, G, E-flat, C; bar 4 E-flat, long D
(a question); bars 5-6 as 1-2; bar 7 high C, B-flat, A-flat, G; bar 8 F, G, A-flat, B-flat; the
ending's sigh high C, B-flat, then the logo. Rhythm mostly "long, long, longer, short". The cell
"you-co-ded" (up a sixth, down a step) is heard at least once before the logo in a piece over 8 s
(the pulse's pool plays it continuously in every recipe).

**The chords**: bright E-flat | C minor | A-flat | B-flat; dark C minor | A-flat | F minor | G (the
same seven notes, so the dark form changes no tune note); the turn A-flat, B-flat.

**The blocks** (from "One becomes many", "Pizzicato bounce" and "Rocking piano, singing strings",
the three pieces he said yes to; all still playable through `score.Section`): the answer (a second
piano, it listens for space), the accompaniments (rolling, bounce, rocking, sparse, still, the
round-8 figure, and now the pedal pulse), the layers (answers, plucked strings, held strings, solo
violin, both, soft synth, sub, low cellos, air), the lift, the transitions (blend, build, flow,
hold, breath), the moods (stark, hush, hopeful, playful, triumphant, and `bed` for the recipes).

**The endings**: the band plays the logo as the song's last phrase in its own tempo: the
cadence (A-flat then B-flat sus, slowing), the sigh (C6, B-flat 5), the logo's B-flat and G as
pick-ups and F landing on the name. Full-blend (piano with plucked violins, low E-flat with cello
and sub, a string swell, the second piano answering low), piano-only, quiet (`logo="quiet"`, for
subtle films), short (`ending="short"`, two beats), none (`logo="none"`, a hand-on ending for a
passage from the middle of a film). The logo files are used only when the logo plays alone
(`out/logo-alone.wav`).

## Pieces made before the rebuild (kept as the owner heard them)

They render as they were (`style="v1"` or `"v2"`); their reports now show the hard checks and the
dashboard. "Own everything" (`own-everything*`, 2026-11-20); "Make it mine" first score
(`make-it-mine`, rejected: "extremely repetitive"); round 7 (`make-it-mine-r3`,
`own-everything-10s`, `fairytale-score-r2`: choppy, busy/harsh, thrown in; no longer in the film
list, their old reports remain in `out/films/`); round 8 (film files `film_mim.py`, `film_own.py`,
`film_tale.py`; unheard); the demonstrations (`demo-*`, `example-bed`, `example-piano-ending`).
Some old pieces fail the hard `clash` check (the stark mood's G pulse against A-flat, a
semitone; `own-everything`, `-barest`, `-fast-barest`): that is their record, not something to
fix in them.

The round-8 film files (style `"v2"`) now play through the new sound. They still carry what their
composers added to pass the old brightness floor: `air=12.5` (own), `air=17` and a held violin
"air" layer (tale), `air=18`, `tone=3` and a shine wrapper around `Band.piano` (mim). The air
values are capped to +1.5 dB by the new master; the rest still sounds. Before the owner hears a
round-8 film again, its composer should take those out for musical reasons or say why they stay.

## What is still weak (honest)

- **Nobody has heard anything made with the rebuild.** The pad, the pedal pulse, the cycles and
  the recipes are untested by ear; the three examples are proofs that the engine works.
- **The gauges' ranges come from four pieces and the logo** (tilt, presence, roughness,
  novelty-peaks are uncalibrated until the owner rates harsh/fine and choppy/fine).
- **The examples read the same out-of-range gauges**: roughness (1.9-2.4x, uncalibrated) and the
  level moving 7-9 dB within a second (the pad sits about 8 dB under the pulse, the plan's pad
  level; in C also the step from -6 to -2 dB as the tune enters after her last word). The pad's
  balance against the pulse is a question for the owner's ear, not a number to chase.
- **Recipe A reads darker than the tilt range** (-12.4 dB an octave, about the owner's own piano
  logo at -11): a soft pulse and a pad with no tune. Information, not a reason to brighten.
- **Cycles are sparse in a busy short piece**: in recipe B the guards (tune phrases, the peak,
  the ending) leave cycle1 sounding once in 36 s. Fewer tune phrases leave them more room.
- **The A/B pianos are raw.** The VCSL upright needed two repairs at load (opposite-polarity
  channels; recordings that stop while still sounding) and a flat level match; its soft G5 also
  dies within 0.4 s and carries a small knock 0.55 s in, which F5-A5 soft notes inherit (the
  attack gauge flags it after the logo). Salamander passes. Listen to the A/B with that in mind.
- **Chords change only on a half-bar**, so a chord on her sentence end can be up to a second off;
  `narrator-chords` reads it.
- **Syllables are counted from spelling** (about 10 % over a passage).
- **The KTH loudness arch is held to +-1 dB** (the research's 1.5-2.5 dB would exceed the 0.12
  touch spread); harmonic charge (a crescendo toward the chord furthest from home) is not built.

## Technical appendix

**Commands** (about 1 s for notes, 15-40 s a render):

```
render.sh --brief  <film>            # step 1: brief, card holds, tempo fit, her pace, motion grid
render.sh --notes [--log] <film>     # notes bar by bar, the bed, hard checks, dashboard (no audio)
render.sh --bed    <film>            # step 3: the bed alone, rendered
render.sh --sketch <film> [k=v ...]  # step 5: two 20 s sketches into out/sketches/
render.sh <film>                     # render, mix, measure (and <name>-bed.wav, the no-melody mix)
```

`<film>` = a film's name, a film file's key (`mim` for `src/film_mim.py`) or a demonstration's
name. Never run `render.sh` with no arguments while others are composing (it re-renders
everything). Films with `copy_to` (`own-everything`, `make-it-mine`) copy their file into
`scripts/campaign/film/public/audio/` on every render; `SONGBOOK_NO_COPY=1 render.sh <film>`
renders into `out/` only, for checking the toolkit without touching what an editor has cut to. Outputs (git-ignored): `out/films/<name>.wav`,
`.checks.txt`, `.json`; `out/notes/<name>.txt` (bar table, recipe, bed, hard checks, dashboard),
`.log.txt` (every note), `.grid.json` (motion grid); `out/sketches/`.

**A film in its own file**: `src/film_<key>.py` exposing `FILM` (or `FILMS = [...]`); found
automatically; `copy_to=None` until the owner picks it.

**New Piece fields**: `style="v3"` (set by the recipes), `bed`, `changes`, `cycles`, `hits`
(`[(s, weight, label)]`), `clash_ok`, `explain`, `recipe`, `brief`, `owner`, `voice_mux`, `sound`
(the sound builder's switches). **New Section fields**: `fig_mode`, `fig_pedal`, `fig_mask`,
`fig_mask_walk`, `fig_bass`, `meter`. Every older field (`Section` tune/accomp/add/drop/chords/
level_db/ramp/shape..., `Piece` logo/ending/land/rit/loudness/touch/tone/mix...) still works.

**Files** (`src/`): `recipes.py` (the recipes, `Brief`, `OWNER`, `land_after`) · `bed.py` (sustain,
layers, change plan, pad voicing) · `cycles.py` · `tunebank.py` (phrases, placing, mutation) ·
`timing.py` (fit_tempo, narrator band, phrase ends, shared time line, ritardando, perceived
attack) · `dashboard.py` (hard checks and gauges) · `studio.py` (the procedure's commands) ·
`tune.py` (tune, chords, vocabulary,
phrase bank) · `motif.py` (phrases and development) · `moods.py` · `blocks.py` (blocks into notes,
the pedal pulse, phrase shaping) · `score.py` (sections, timing, the players) · `form.py` (the older
composition checks and the bar table) · `measure.py` (mix and audio measurements) · `notes.py` ·
`build.py` · `demos.py` · `films.py` · `mix.py` (buses, spaces, echo, voice cut, delivery) ·
`engine/` (`sounds.py` instruments and the pad, `master.py`, `options.py` the sound switches,
`dsp.py`).
