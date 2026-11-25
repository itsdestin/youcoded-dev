# The youcoded songbook

Every film's music is composed in code, here. This page is the composer's whole guide: read it
top to bottom once, then follow **The procedure**. Nobody here can listen; you judge by note dumps
and measurements, and you never claim something sounds good. **A composer under test never opens
`first-shot/`** (it holds the other briefs and the owner's ratings).

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
   start_at=1.5)` (1-2 s of music before her first word). Pass the brief to the recipe
   (`brief=BRIEF`): it supplies `subtle`, the `peak` and the hits unless you give them.
   `--brief` reads the film's `FILM`, so write the recipe call too, with only `name, length,
   land, bpm=<any>, brief=BRIEF`, then run it.
   - **Subtle or present**, when the brief does not say: **subtle** if any of its words is calm,
     soothing, gentle, quiet, soft, or it plays under a narrator or a poster; **present** only
     when it asks for energy (bright, bold, lively, celebratory). In doubt, subtle (the brand
     leans quiet). Present changes more than loudness: the full-blend logo, and in recipe C a
     -2 dB level after her words.
   - **When the picture is already cut, the picture wins**: no pre-roll if her voice starts at
     the picture's first second (`start_at` = where she is in the picture); "the brief says 54 s"
     and "the picture shows 50 s" means the picture. A `--brief` card warning (TOO SHORT) is the
     editor's matter: report it, do not change the music for it. A card that stays on screen to
     the end (a poster) is not too short; say so in the report.
   - **A "peak" in a type-only film** is the moment the music is fitted to land on (a downbeat);
     recipe A puts nothing special there unless you add one change (`brightness`) on its bar.
   - **Sound effects** (a pen, a click) are not music: the music never plays them. If the brief
     asks for one, it is a film effect (`Film.effects`, `films.place_effect`, soft only), made
     after the music and reported separately; a moment marked only as a picture moment gets no
     sound.
2. **The tempo. First decide which is fixed.**
   - **The picture is cut** (its frames are given): `logo_at` is the editor's frame for the name,
     and `LAND = BRIEF.logo_at`. `render.sh --brief <film>` runs `fit_tempo` over the recipe's
     range (+-3 bpm to land the name): the 3 best fits, each a line to copy (`bpm=`, and when they
     help `odd=`, `odd_at=` and `rit=`), with every moment's error in ms and frames. It searches
     every tempo, no odd bar or ONE odd bar of 1 (a pick-up), 2 or 3 beats at any bar (never on
     the peak's bar), and the ending slowing to 75, 80, 85 % or not at all (`rit=1`). Write all of
     it into the recipe call, `rit=` included. When no fit lands every weight-3 hit, `--brief`
     also looks over 84-132 bpm and prints any fit that does: **a picture cut to its own beat
     (96 bpm, or 120 with every turn on a bar line) takes that tempo**, not a recipe-range fit
     that misses it. `range=LO-HI` searches a range you name (and writes the motion grid at its
     first fit).
   - **The music comes first** (the editor cuts to it): choose the tempo in the recipe's range
     and get the name's time from `R.land_after(bars, bpm, ending, odd=, rit=)`; give the editor
     that time and the motion grid.
   - Either way `--brief` writes the **motion grid** (`out/notes/<name>.grid.json`: frames per
     beat, eighth, sixteenth, every bar line) at the first fit's tempo, for the editor.
   - Under a narrator it prints her pace, her tempo band (a beat every 2-3 syllables) and the
     value nearest 120, then fits around it with her sentence ends as soft hits; **copy the first
     fit** (it is the value nearest 120 nudged to her sentence ends; recipe C's "nearest 120" is
     only its default when no fit is given). One tempo per film.
   - **Running one toolkit function** (`land_after`, `fit_tempo`): `render.sh --py -c "import
     recipes as R; print(R.land_after(12, 116, 'short'))"` (the right Python and import path).
3. **Pick a recipe** (below) and call it with the brief's numbers. Do not invent a new form for
   one film; if none fits, add a fourth recipe to `src/recipes.py` and say so.
4. **Write the change plan** (`changes=`): one entry per turn of the picture, 8-16 s apart, plus
   the peak (see The change plan). Passing `changes=` REPLACES the recipe's default plan (recipe
   C's brightness, bright turn and pool change too): copy the defaults you keep from the
   `--notes` "change plan" line.
5. **The bed alone.** `render.sh --bed <film>` renders sustain + pulse + cycles with no tune and
   prints its dashboard. Read the bed's gauges (sustain, pulse-rate, pulse-sim, groups,
   common-tone) before writing a tune note.
6. **The tune and the lift.** Place 1-3 phrases from the bank (`tune=[(bar, "name")]`), name the
   peak. `render.sh --notes <film>` (1 s, no audio) prints the bar table, the bed, the hard checks
   and the dashboard.
7. **Two sketches.** `render.sh --sketch <film> [switch=value]` renders the first 20 s twice: A as
   written, B with ONE switch changed (default: `pad_level=-4`, the sustain 4 dB louder against
   the pulse; or any [OWNER] switch: `sustain=held`, `sustain=ring`, `fig_order=cell`,
   `pulse=chord`, `chords=plain`, `pad_level=0`; a sound switch: `pad_timbre=triangle`,
   `piano=salamander`, `air=legacy` (the old 11 dB air shelf, cap lifted); or `bed.cutoff=1200`,
   `sec.fig_touch=0.35`). It prints both dashboards' readings side by side (sustain, gap-fill,
   tilt, presence, level-rate...): **the readings are of the whole piece**, the files keep the
   first 20 s. A misspelt switch stops with the list of known ones. The owner picks. A piece
   built by hand (not through a recipe) may not take `pad_level`; check that B's readings moved.
8. **Render and report.** `render.sh <film>` (`SONGBOOK_NO_COPY=1` while checking). Every render
   also writes `<name>-bed.wav`, the no-melody mix, and rewrites the note log. Report the numbers: the hard checks, every out-of-range gauge with its one-line
   explanation, and the answers to "Before reporting" below. Never claim it sounds good.
9. **Deliver.** `render.sh --deliver <film> <dir> [picture=film.mp4] [from=SECONDS]` writes
   `<name>-music.mp3`, and with a picture `<name>.mp4`: the picture from `from` for the piece's
   length, its sound replaced by the music (narrated, `voice_mux` given: the picture's own sound,
   her voice, plus the music at `music_db`, the mux the margin was measured on, limited).

## The three recipes

Each recipe is a function in `src/recipes.py` that returns a complete, steady `Piece` from only
`name, length, land, bpm`; every other argument has a working default you then replace with what
your film needs. `recipes.land_after(bars, bpm, ending)` tells you where the name lands.

### Recipe A: type-only short (10-20 s) - `recipes.type_short(...)`

| Item | Setting (default) |
|---|---|
| Tempo | 100-120 bpm from `fit_tempo` (or the picture's own beat when `--brief` finds it outside); a card about every 2-bar phrase |
| Harmony | 2 chords alternating, one per 2 bars (`"Ebmaj9 Ebmaj9 Abmaj9 Abmaj9"`), the same top note |
| Sustain | the pad from frame 0 |
| Pulse | the pedal pulse in eighths, pool B-flat 4, G4, F4, E-flat 4 circled (B-flat between the others), 10 of 16 steps, touch 0.42 |
| Cycles | none, or one |
| Tune | none (in 10-20 s the logo is the one statement) or the cell once |
| Changes | 0-1 (e.g. `(3, "brightness", 1.25)`) |
| Lift | none, or at most 1.5 dB |
| Ending | `ending="short"` (2 beats), the quiet logo if subtle; at least 1.5 s of ring after the name |
| Level | -16.5 LUFS subtle, -15 present (`subtle` from the brief) |

### Recipe B: app demo, no narrator (30-75 s) - `recipes.app_demo(...)`

| Item | Setting (default) |
|---|---|
| Tempo | 104-120 bpm from `fit_tempo` (116) |
| Harmony | one chord per 2 bars from the vocabulary (`Ebmaj9 Cm9 Abmaj9 Bb9sus`), each change sharing a note |
| Sustain | the pad throughout; held strings may join at the peak (they double the pad's voicing) |
| Pulse | the pedal pulse, 2.5-4 notes a second, the chord's root held under each chord (`fig_bass`) |
| Cycles | 2-3 on co-prime periods, above C5 (default 23 and 29 half-beats), at most a third sounding; set their `offset` so their rounds fall in the bars with no tune (a round that meets a tune phrase is left out whole) |
| Tune | 2-3 one-bar phrases, each followed by at least 2 bars of bed; default: a phrase, the same phrase again, a peak phrase reaching C6. **Under 40 s, two phrases** (the third crowds the bars); when the peak is within 4 s of the name it IS the ending's sigh: no separate peak phrase |
| Changes | one every 8-16 s at the picture's turns (default: cycle1, the sub, then any cycle not yet in plus the strings at the peak); bring EVERY cycle in by name |
| Lift | 2.5 dB over 2 bars into the peak, then settle 1 dB |
| Form | the first 30 s must stand alone (it becomes the :30 cut-down) |
| Ending | the full sigh and logo (`logo="quiet"` if subtle) |
| Level | -15 LUFS (-16 subtle, from the brief) |

### Recipe C: narrated story (30-75 s) - `recipes.narrated(...)`

| Item | Setting (default) |
|---|---|
| Tempo | her band (syllables x 60 / 3 to / 2), the value nearest 120 |
| Harmony | changes on her sentence ends (one chord name per sentence, or the default: C-minor family, turning bright at `turn=` seconds, her problem-to-solution turn), at most one per 1.5 s |
| Sustain | the pad, 95 % or more |
| Pulse | soft, high and nearly still: TWO notes, B-flat 5 and F5 (above her range F3-E5), 9 of 16 steps, never two rests running; once she stops it comes down to B-flat 4, G4, F4, E-flat 4 (a `"pool"` change; the old notes stop at that bar line, and a pulse note on the tune's own key steps aside) |
| Cycles | one at most (default G5 D5 E-flat 5, notes the pulse is not playing), only in her pauses of a second or more: with a fast reader there may be none, which is right |
| Whimsy | `whimsy=True` (storybook): a bell-like double, an octave up and very soft, of the tune's first phrase (and every third after) |
| Tune | only in pauses that fit a whole phrase, and after her last word; softer when subtle (`lead` 0.7) |
| Level | one hand-set level under her words (-6 dB), never moving with her words; after them -2 (present) or the same -6 (subtle); subtle also gives the quiet logo and -16.5 LUFS |
| Mux | `R.narrated(..., voice_mux=dict(path=voice.wav, t_from=, start_at=, music_db=-10))`: her margin is measured. A static `music_db` of -12 for a soft-spoken reader is a level choice, not gaming; never a dip that follows her words |

**Narrated, two cases the recipe does not solve by itself:**
- **She speaks into the name** (her last word ends under a second before it): there is no
  post-roll, so no tune, no whimsy and no cycle can play, and the sigh and logo pick-ups land on
  her last words (`narrator-masked` fails). First ask the editor to land the name 1-2 s after her
  last word (say how much ring the picture allows). If the picture is fixed: `ending="short"`,
  `logo="quiet"`, and report the masking honestly; never lower `music_db` only to pass.
- **An excerpt that ends mid-story** (no name in the window): `logo="none"`, `ending="short"`,
  `LAND = R.land_after(bars, bpm, "short")` at a bar line just before the window ends; the
  chords move on her sentence ends; nothing needs to "arrive". Expect `cell-present`,
  `payoff-louder` and `level-rate` (the hand-on stop) OUT: one line each.
- **The turn on one word** (`turn=`): the default chords turn bright on the sentence end NEAREST
  the turn, which can be seconds early. For a turn on a word, write `chords=` yourself (one name
  per sentence end) so the bright chord falls on the first sentence end after it.

### Shorter than one bar of body: a sting or end card (under ~4 s to the name)

No recipe lands a name in under about 3 s (each writes at least one 4-beat bar). Build the Piece
from recipe A's parts (`R._pulse`, `R.sustain_mix`, `R._from_brief`; see `src/film_shot_f.py`,
first-shot F) and say so. Two traps: at fast tempi (pick-ups under 0.25 s apart) the logo is heard
late (+12 ms, a hard `length` fail): keep its pick-ups 0.25 s or more apart; and the pad's 1.2 s
attack is still swelling in the first second (start it before frame 0 or accept the `sustain`
"heard" reading). Nothing yet measures a loop seam for a piece played on repeat.

### Starting from a recipe (a film file)

```python
"""<Film>, first score: <one line on the idea>."""
import recipes as R
from cycles import Cycle
from films import Film

# THE PICTURE IS CUT: its frames are the input (if the music comes first instead, choose BPM and
# set LAND = R.land_after(bars, BPM) and give the editor that time and the motion grid)
BRIEF = R.Brief("app-demo", 36.0, ("bright", "easy"), "present",
                moments=[(8.28, "the editor"), (24.83, "peak")], logo_at=33.27,
                picture=[(0.0, "open"), (8.28, "the editor"), (16.55, "the theme"), (24.83, "it works")])
LAND = BRIEF.logo_at
BPM = 116                                   # copied from render.sh --brief (with odd=, odd_at=, rit= if given)
PIECE = R.app_demo(
    "my-film-r1", 36.0, land=LAND, bpm=BPM, seed=7, brief=BRIEF,      # the brief gives subtle, peak, hits
    chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus ...",   # one name per bar; [Ab Bbsus] = two
    tune=[(4, "cell"), (9, "cell"), (13, "from-top")],                  # bar, phrase from the bank
    cycles=[Cycle("Bb5/0.5 G5/1", period=23, offset=13, name="cycle1")],  # rounds in the bars with no tune
    changes=[(5, "in", "cycle1"), (9, "in", "sub"), (13, "in", "held"), (13, "peak")],
    explain={},                                                         # see Measurement
    notes="one line for the report")
FILM = Film("my-film-r1", PIECE, picture=BRIEF.picture, copy_to=None)
```

Worked examples, rendered with note dumps and dashboards: `recipe-a-example`,
`recipe-b-example`, `recipe-c-example` in `src/demos.py` (outputs in `out/`, notes in
`out/notes/`). Copy the closest one. What their dumps show (2026-11-25, after the audit fixes;
measured, not heard): all three pass every hard check; the sustain sounds 100 % in the notes and
99-100 % in the audio; the pulse circles B-flat (2.2-2.4 notes a second, `pedal-fit` 0); B's two
cycles play 8 notes in whole rounds in the bars with no tune (cycle1 from 8.3 s, cycle2 after the
peak); C's two-note pulse stays above her, her voice stands 12.9 dB over the music (6.5 at
worst), its cycle finds no pause long enough (she reads fast) and the bell doubles the tune after
her last word (6 notes); tilt -12.2 (A), -6.8 (B), -13.0 (C) dB an octave; gap-fill (the dips
between pulse notes) 5.1, 4.3 and 5.7 dB at `pad_level=-8`. Two renders of C are byte-identical.
Every OUT gauge is explained in the example's `explain`.

**Sketch readings so far** (recipe B, first 20 s; numbers, not judgements): `pad_level=-4`
gap-fill 4.3 to 3.5 dB, level-rate 7.9 to 6.5; `pad_level=0` 3.0 dB; `fig_order=cell` 4.8;
`sustain=ring` 5.0 with 5.8 attacks a second. Recipe C with `sustain=held`: the strings, though
level-matched to the pad, are much brighter in her band (tilt -5.0, presence -21 dB) and her
voice fell under 6 dB above the music, so the hard `narrator-masked` check FAILS: held strings
under a narrator need a quieter level or a different voicing before the owner hears that A/B.

## The stack

In order of importance; at most three groups sound at once: the sustain (held strings playing
the pad's voicing count as the sustain made richer, not a group of their own), the pulse, and
the tune and cycles counted together as one.

**1. Sustain** (`bed.py`). Sounds 95 % of the time or more. `Piece.bed = dict(sustain="pad" |
"held" | "ring", touch=0.40, cutoff=None, fade=2)`. All three sit at the same calibrated level
(-33 LUFS bus, about 8 dB under the pulse; the [OWNER] `pad_level` raises it 4 or 8 dB): held
strings longer than their recording (7.5-15 s) are re-bowed with crossfades and held level
(`string_loop`); the pedalled ring plays on its own `ring` bus. A layer that fades in later
(held strings at the peak, the sub) starts its notes at the bar it fades in on. The pad is voiced 3-4 notes between B-flat 2
and B-flat 4, moving as little as possible, keeping a common note and its top note where it can,
never a semitone, major seventh or minor ninth against itself, the pulse's notes or the bass
below C5; a voice moving by step hands over without overlap; it resolves with the logo onto
E-flat and rings under it. The note dump prints every voicing.

**2. Pulse** (`blocks.acc_pedal`, `Section(fig_mode="pedal")`). A pool of notes (`fig_pedal`,
default the cell + tonic) on the steps of a 16-step mask (`fig_mask`, `x` = play), the same
whatever the chord; each note held into the next (legato), but never across a pool change. The
order is the [OWNER] `fig_order`: `"circle"` (default) returns to the pool's first note between
the others (B-flat G B-flat F B-flat E-flat), `"cell"` plays the written order, which is bar 1 of
the tune on a 2-bar loop. A pulse note on the same key as a tune note within a step is left out
(the tune has it). The mask drifts
one step every 4 bars (`fig_mask_walk=(4, 1)`, seeded), keeping 6-10 of 16 steps and never two
rests running. `fig_bass=True` strikes the chord's root, soft, once at each chord change and holds it to the next
(a low felt edge that names the chord; it is 65-104 Hz, so a phone hardly plays it).
`fig_touch` 0.26-0.42. The round-8 chord-following figure remains as `fig_mode="chord"`.

**3. Cycles** (`cycles.py`). `Cycle(cell, period, offset, name, voice="piano"|"bell", touch,
chance, transpose_walk, unit="half"|"bar")`. The cell's notes come from E-flat pentatonic + D
(no semitones; anything else is refused). Periods pairwise co-prime; each cell at most a third
of its period; under 20 s one cycle, 30-75 s two or three; at most one cycle note a second in
all. `chance` is decided once per round, and so is every guard: a ROUND is left out whole (never
moved, never cut to a fragment) when any of its notes sounds into a tune phrase, under her words,
within a beat of the peak, a semitone from the pad below C5, or on the pulse's own key; the note
dump counts what was left out and why. "Into a tune phrase" is wider than it reads: the whole
2-beat half-bars around a phrase are blocked, up to about 3 beats past its last note. So choose
each cycle's `offset` to put its rounds in the bars with no tune AND a bar clear of each phrase;
check `cycles: N notes placed` in `--notes` after each try. A cycle brought in at the peak of a
short film may get one round: bring it in earlier or leave it out. Bring every cycle in by name in the change plan: one never brought `"in"`
plays from the start, and the change-plan gauge counts its first note as an unplanned change.

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

`Piece.changes = [(bar, what, arg), ...]`; bars count from 1 over the whole piece, the odd bar
included (at `odd_at`); the ending bar is not counted. **`chords=` counts differently**: one name
per 4-beat bar only; the odd bar keeps the chord before it (a warning prints if you give too
many names). `tune=` uses the whole-piece bars, and the odd bar cannot take a phrase. A layer never switches: it fades in a straight line over
2 bars from its bar line.

| Entry | What it does |
|---|---|
| `(bar, "in", layer)` / `(bar, "out", layer)` | layers: `sustain`, `pulse`, `held`, `sub`, or a cycle's name (every cycle needs one) |
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
  feels wrong. If a weight-3 moment will not fit, `fit_tempo` offers ONE odd bar: `odd=1` (a
  pick-up), `2` or `3` beats, at any bar `odd_at=` (bar 1 by default; after an earlier hit it
  moves only what follows), and the ending's slowing `rit=0.75-0.85` (it moves the name alone).
  The recipes take `odd=`, `odd_at=`, `rit=`. The odd bar carries no tune and keeps the chord
  of the bar before it, so it never sits on the peak (the fit avoids that). Or ask the editor to
  move the picture to the grid.
- **Two timing windows**: a picture moment is "on" when heard 15 ms early to 45 ms late; the
  name is stricter (the hard `length` check: within 10 ms).
- **Hit very few moments**: music-in, the peak and the logo, and at most one more per 15 s; never
  two cuts in a row. "Just having the tempo lining up can be enough."
- **The shared time line** (style `"v3"`, every recipe): one 1/f deviation of 4-6 ms per sixteenth
  for the whole band, plus at most 2 ms per note; a soft note is struck as early as it is heard
  late (17 ms on our felt piano); the pulse gets no phrase arch.
- **Phrase-shaped melody** (v3): a +-1 dB arch peaking 60 % through each phrase, higher notes a
  little louder, short notes a little lighter, a small gap before a leap or a repeated note, the
  last note 40 ms longer then a breath, the melody 15 ms ahead of the band, one touch per phrase
  (spread at most 0.12).
- **Endings**: the ending bar slows on a curve that slows late (end tempo 85 % by default, 75-80 %
  if the fit asks; `rit=1.0` for the short ending); a real ending, never a fade, at least 1.5 s of ring after the name.

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
  pulse ([OWNER] `pad_level` -4 / 0 raises it). Held strings as the sustain are brought to the
  same level; the pedalled ring has its own piano bus at the same level.
- **Held strings** (VSCO): a note longer than its recording is re-bowed from the steady middle
  with 0.6 s crossfades and a slow level follower (`string_loop="on"`; v1 keeps the old cut).
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
| `air` (sketch only) | - | `air=legacy`: `air_db=11` and `air_policy=as-written` in one switch; in a sketch any `air_db` over 1.5 also lifts the cap | A/B pair in the plan |
| `piano_layers`, `piano_even`, `piano_resonance`, `piano_shine`, `piano_bus_eq`, `glue`, `bus_gain`, `echo`, `voice_cut`, `string_loop` | the new sound | the old behaviour, for A/B | ours |
| `pad_cutoff`, `pad_attack`, `pad_release`, `reverb_lp`, `reverb_hp`, `hall_predelay`, `piano_3k_cut`, `piano_saturation`, `pad_centre_under_voice` | as above | numbers | ours |

## Measurement: hard fails and the dashboard

**Hard fails** are faults whatever the music. Only these can fail a render:

| Check | Fails when |
|---|---|
| `clipping` | a clipped sample, or true peak over -1 dBTP |
| `silence` | over a second of nothing between the first frame and the name |
| `clash` | a semitone or minor ninth held more than half a beat between sustained notes below C5, or any such interval with a note outside the chord, or a tune note on a borrowed chord's clashing note, in a bar the composer did not mark (`Piece.clash_ok = {bar: "why"}`) |
| `narrator-masked` | a tune or cycle note in her range (F3-E5) starting while she speaks; with `voice_mux`, her voice under 6 dB above the music in the phone band |
| `length` | the wrong file length, the name more than 10 ms off its frame, a non-silent first or last sample, less than 1.5 s after the name, or a bar squeezed more than 50 % off the tempo to land the name |

**The dashboard** is everything else, printed in groups with a target range and what it means.
Each line starts with ` in `, `OUT` or `~`:
- ` in ` the number is inside its range;
- `OUT` it is outside: explain it in one line or change the music for a musical reason (THE RULE);
- `~` a **reading**: a gauge nobody has calibrated by ear yet (`gap-fill`, `roughness`,
  `novelty-peaks`). It is information to report, never OUT, and needs no explanation.

| Group | Gauges (target) |
|---|---|
| the bed | `sustain` (>= 95 %, written in the notes AND heard in the audio: "100 % (heard 99 %)"), `pulse-rate` (2-4 a second; 1.5-3 narrated), `pulse-sim` (>= 0.85 bar to bar), `pedal-fit` (pool notes fit every chord), `gap-fill` (~ how far the level dips between pulse notes: median swing inside each half-second; round 8 mim-r5 1.9 dB, round 7's "choppy" 4.3) |
| how busy | `attack-rate` (<= 4.5 a second), `groups` (<= 3), `fg-duty` (tune and cycles <= a third of any 8 bars), `fg-onsets` (<= 1 a second), `voice-busy` (<= 3 struck notes a second in her range [OWNER: 3 or 5]), `orphan` (0 phrases never echoed or answered) |
| harmony | `common-tone`, `chord-variety` (enough chords; from 6 changes up, 3-chord runs <= 55 % unique), `borrowed` (<= 1), `held-sevenths` (major sevenths held low inside a chord) |
| change | `change-plan` (8-16 s apart; a cycle never brought in counts at its first note), `surprise-budget`, `cycles` (count, co-prime, duty, rate, what was left out), `novelty-peaks` (~ turns heard vs planned + 1) |
| touch and tone | `touch` (max 0.62, each phrase's spread <= 0.12), `tilt` (-5 to -12 dB an octave: the owner's piano logo is -11), `presence` (2-5 kHz <= -17 dB, 5-16 kHz <= -30), `roughness` (~ about the logo's 1.9-2.0x a plain triad) |
| timing | `tempo-stretch` (<= 3 %), `narrator-tempo` (her band), `narrator-chords` (on her phrase ends), `voice-margin` (10-14 dB), `picture-sync` (weight-3 hits on, nothing early), `hit-budget` |
| older checks | the round-8 composition checks (foundation, pulse, even, grid, phrases, the tune and cell identity limits, peak, settle, level-rate, tone, ...), with per-recipe targets: `loudness-range` is a ceiling only in a recipe; `bass-moves` is not shown when the pulse plays roots by design (`fig_bass`); `cell-present` allows recipe A to leave the tune out. `plateau` and `audio-nothing-new` are REMOVED (round 7's novelty quotas) |
| mix | loudness, mono, the tune on top, attacks on notes, no drum-like attack, air (on the new master a ceiling only) and low bands (a ceiling only in a recipe; the floor stays for older pieces) |

**Reading the dashboard, line by line.** For each `OUT`, ask in order: (1) is this the music doing
something wrong that a listener would hear (a hole in the bed, a phrase popping out, a clash)?
change the music and say why; (2) is it the piece doing what its brief asked, which the gauge's
general range does not know (a 12 s card with no lift, a narrated stretch cut mid-story)? one
line in `Piece.explain`; (3) is the gauge measuring the wrong thing? say so in the report, never
work around it in the music or by wrapping a tool. A `~` reading goes into the report as a
number, with nothing done to it.

**Gauges a recipe user can only explain**, never fix in the music: `level-rate` at the default
`pad_level` (the same dip `gap-fill` reads; write "the dip between pulse notes, the owner's
pad_level A/B"), anything after the name that comes from the logo itself (`mix-attacks-on-
notes` on the logo's plucks), `tempo-stretch` on a hand-pinned ending, and on a `--bed` render
`cell-present`/`hit-budget` (no tune by design).

**THE RULE.** The dashboard never fails a render. For every out-of-range number the composer does
one of two things: **explain it in one line** (`Piece.explain = {"gauge-id": "why"}`, printed next
to it), or **change the music for a musical reason** and say what the reason was. Nothing musical
is ever added, removed or bent to move a number: no layer added to brighten a gauge, no note moved
to pass a count, no tool wrapped to dodge a check. A gauge reading out of range is information
about the music; a composer who changes the music only to move the needle has made it worse.

## The owner's switches [OWNER]

These are his decisions by ear. Each is a switch with a default; never decide them yourself.
Change one for a run with `SONGBOOK_OWNER="sustain=held"`, per piece with `owner_over={...}`, or
for the B sketch with `render.sh --sketch <film> sustain=held` (`narrator_tempo`, `voice_busy`
and `under_voice` shape the piece as the recipe builds it, so they go through `SONGBOOK_OWNER`).

| Switch | Options (default first) | Question for him |
|---|---|---|
| `sustain` | `pad` / `held` / `ring` | the held layer: soft synth pad, held strings, or ringing piano |
| `pulse` | `pedal` / `chord` | a pulse on a few fixed notes, or round 8's chord-following figure |
| `narrator_tempo` | `near120` / `stress` | under her: a beat near 115-120, or at her stress rate (~138) |
| `voice_busy` | `3` / `5` | struck notes a second in her range under her words (the gauge's target) |
| `under_voice` | `static` / `follow` | a fixed tone change under her (built, in the mix) or a dip that follows her words (NOT built: his rule) |
| `chords` | `rich` / `plain` | 9th and sus chords, or plain triads and sevenths |
| `fig_order` | `circle` / `cell` | the pulse circling B-flat (B-flat G B-flat F B-flat E-flat), or the cell's own order (B-flat G F E-flat: the tune's first bar as a loop) |
| `pad_level` | `-8` / `-4` / `0` | the held layer's level against the pulse, in dB: -8 is the plan's level; louder fills the gaps between pulse notes (the default sketch B is -4) |

The sound's own [OWNER] switches (the piano A/B, pad timbre, pad sub, damper thump) are in
**The sound** above. The optional bed library (long approved beds that films
are cut from) is not built: it would reverse "each film gets its own piece" and is his call.

## Pitfalls (what went wrong, and must not come back)

- **The tune as wallpaper** (round 6): the opening bar seven times in 54 s. The tune is rare;
  repetition belongs to the bed. That includes the pulse: a pool played in the cell's order is the
  tune's first bar on a loop (`fig_order="cell"`); the default circles one note.
- **Setting a Piece field after the recipe built it** (`PIECE.peak = ...`, `PIECE.voice_mux = ...`):
  the recipe already used the value it had. Pass everything as an argument (`brief=`, `peak=`,
  `voice_mux=`); an unknown sketch switch stops rather than being silently ignored.
- **Anything that differs between two runs**: Python's `hash()` of a string changes in every
  process; use the seeded helpers (`bed._u`, `cycles._rng`) or an index. Two renders of the same
  piece must be byte-identical.
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
- How many groups sound in each bar (`parts`: U pad, N pedalled ring, P piano pulse, H held
  strings, K cycle, L tune, D its whimsy double, S sub)? A layer appears from the bar it fades in
  on, not before.
- Which `~` readings stand out (gap-fill above about 4 dB is the bed dipping between pulse notes)?
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
  the recipes are untested by ear; the three examples are proofs that the engine works. The
  first-shot test ran on 2026-11-25 (six briefs, in `~/Documents/youcoded-campaign/round9/first-shot/`,
  awaiting the owner's ratings); its friction reports drove the fixes in this file's procedure.
- **No sting recipe and no loop measurement** (first-shot F): a sub-4-second end card is built by
  hand, and nothing checks the seam of a piece played on repeat.
- **Recipe C under a reader who never pauses** gives 13 near-identical bars of pad and pulse; it
  has no sanctioned way to "widen" under her words beyond a chord turn and the pad's filter.
- **The gauges are uncalibrated** until the first-shot test (`first-shot/`, prepared, not run):
  `gap-fill`, `roughness` and `novelty-peaks` are readings (`~`); `tilt` and `presence` ranges
  come from four pieces and the logo.
- **The bed still dips between pulse notes** at the default `pad_level=-8` (gap-fill 4.3-5.7 dB on
  the examples, against round 8's 1.9-3.0 and round 7's "choppy" 4.3; `pad_level=0` read 3.0 on
  recipe B's first 20 s). `level-rate` reads the same thing (7.9 dB within a second: the gap
  between two pulse notes). The balance is the owner's `pad_level` A/B, not a number to chase.
- **Recipes A and C read darker than -12 dB an octave** (about the owner's piano logo, -11).
- **Recipe B is a lot of foreground for 36 s**: three tune phrases and three cycle rounds fill
  40 % of bars 7-14. Over 60 s the same recipe spreads out; under 40 s, two phrases may be better.
- **Under a fast narrator the cycle never speaks** (no pause of a second until her last word), and
  the music still rises about 6.5 dB from her last word to the quiet logo (the tune entering, the
  pulse coming down into the piano's louder middle, the logo itself).
- **Chords change only on a half-bar**, so a chord on her sentence end can be up to a second off;
  `narrator-chords` reads it. **Syllables are counted from spelling** (about 10 % over).
- **The held-strings loop** re-bows a recording's steady middle with crossfades and a level
  follower; nobody has heard whether its joins show on a long held note.
- **The A/B pianos are raw.** The VCSL upright needed two repairs at load (opposite-polarity
  channels; recordings that stop while still sounding) and a flat level match; its soft G5 also
  dies within 0.4 s and carries a small knock 0.55 s in, which F5-A5 soft notes inherit (the
  attack gauge flags it after the logo). Salamander passes, and needs a CC-BY credit if published.
- **The KTH loudness arch is held to +-1 dB** (the research's 1.5-2.5 dB would exceed the 0.12
  touch spread); harmonic charge (a crescendo toward the chord furthest from home) is not built.
- `sounds.pad_voicing` is unused (bed.py voices the pad itself, also against the pulse and bass).
- `out/films/` still holds reports of films no longer listed (r1-r3, own-everything-10s); the
  combined `checks.txt` folds them in.

## Technical appendix

**Commands** (about 1 s for notes, 15-40 s a render):

```
render.sh --brief  <film>            # steps 1-2: brief, card holds, tempo fit, her pace, motion grid
render.sh --bed    <film>            # step 5: the bed alone, rendered
render.sh --notes [--log] <film>     # step 6 on: notes bar by bar, the bed, hard checks, dashboard (no audio)
render.sh --sketch <film> [k=v ...]  # step 7: two 20 s sketches into out/sketches/ (readings: whole piece)
render.sh <film>                     # step 8: render, mix, measure (and <name>-bed.wav, the no-melody mix)
render.sh --deliver <film> <dir> [picture=x.mp4] [from=s]   # step 9: mp3, and the mp4 with a picture
render.sh --brief <film> range=88-100  # the tempo fit over a range you name
render.sh --py -c "..."              # one toolkit function, with the right Python and paths
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
`fig_mask_walk`, `fig_bass`, `fig_order`, `meter`. Recipe arguments beyond the brief's: `odd`,
`odd_at`, `rit`, `subtle`, `voice_mux` (narrated), `owner_over`, `sound`, `explain`. Every older field (`Section` tune/accomp/add/drop/chords/
level_db/ramp/shape..., `Piece` logo/ending/land/rit/loudness/touch/tone/mix...) still works.

**The first-shot test**: `first-shot/` (the protocol, six unseen briefs, the dated ratings table).
A composer under test must not read that folder.

**Files** (`src/`): `recipes.py` (the recipes, `Brief`, `OWNER`, `Grid`, `land_after`, `sustain_mix`) · `bed.py` (sustain,
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
