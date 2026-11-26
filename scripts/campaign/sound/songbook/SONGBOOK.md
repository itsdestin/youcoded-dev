# The youcoded songbook

Every film's music is composed in code, here. **Part 1 is the brief: read it whole before writing a
note (five minutes).** Part 2 is how the toolkit does what the brief asks. Part 3 is reference.
Nobody here can listen: you judge by note lists and measurements, say so, and never claim
something sounds good. Nothing musical is ever added or bent to move a measurement.

---

# Part 1. The brief

## The goal

In the owner's words: **"unique music for each ad that still feels well within the bounds of the
'same' brand music"**, and music that lines up better with the pictures. He prefers code-made
music (every piece can be forked and changed). Round 8's "Own everything" is "among the better
ones" so far.

## What never changes, and what each film changes

**The fingerprint (every film):** our soft felt piano; E-flat major and its relative C minor;
rich chords (9ths, sus, add9); the three-note tune "you-co-ded" (B-flat, G, F); the quiet or
piano-only logo as the piece's last phrase; one room. **Never:** drums, claps or clacks; a
"thwip", fake-out, whoosh or riser; scratchy pens (a soft pen only); a sound effect taken from a
shared kit (effects are made per film); more than one piece of music in a film.

**Per film:** the tempo, the feel (straight or gently swung), the chord order, the register,
how much of the tune is heard, the energy, the length.

## The settled palette (his answers, 2026-11-25 element deck)

| Element | Settled | Toolkit default (style "v4") |
|---|---|---|
| Piano | "A: ours, soft" | upright felt piano, pulse touch 0.28 |
| Brightness | "B: middle" | the same capped shine on every piano note (not the tune alone) |
| Room | "B: today" | one shared room for every layer |
| Chords | "B: rich" | 9th, sus and add9 chords |
| Pulse | "i realllllly like BOTH c and d" | the chord-following figure; `swing="gentle"` (35 ms) is the other |
| How full | "c is totally acceptable" | a full texture is fine when it is one piece (see below) |
| Endings | "prefer b/c to a" | the quiet logo; `logo="piano"` the other; no full blend |
| Strings | "wayyy too harsh/overpowering" | not available by default (the soft pad or the ringing piano hold) |
| The old "menu music" form | "drop the menu-music form" | cycles retired from the recipes |

## Rule 1: one piece of music, not layers

His real complaint, across every round, was never "busy" or "repetitive" as such: it was
**"different instruments playing entirely their own song at different volume levels"**, a tune
"randomly thrown in on top", high notes "not blended as part of a well-unified track", strings
that "overpower". A full texture is welcome when it is one piece. So:

1. **One harmonic plan, and every layer is written from it.** One chord at a time; the pad, the
   figure, the bass and the tune all take their notes from it. No layer follows its own private
   rule (a fixed pool over every chord, a drone that leaves out the root).
2. **The tune is the top voice of that same music.** It is stated by the same hands that play
   the bed: the same piano, a neighbouring register, the same eighth-note grid and accents, a
   touch at most a little firmer. It stands out by being on top, never by being a different
   sound. Nothing sounds above it except its own echo.
3. **Harmony first, from the tune.** Every held tune note (1.5 beats or longer) is a tone of the
   chord under it, and where it can be, the same pitch is sounding lower in the bed. If a chord
   is fixed, move the phrase within the key; if neither fits, leave the tune out.
4. **Layers interlock in register.** Bass, pad, figure and tune each own a stretch of the
   keyboard and touch the next one; no wide empty gap, no two layers fighting in one spot.
5. **Levels sit close and move together.** The layers are within a few dB of each other and
   share one dynamic shape (beat 1 strongest everywhere); one gentle glue over the piano.
6. **One room.** The same reverb on every layer; nothing panned far from the rest.
7. **Nothing enters or leaves abruptly.** A layer fades in over two bars or is there from the
   start.
8. **At most three or four layers have notes in any bar.**

## The tune

The three notes are the brand, not a sticker. Weave them in: as the top notes of the figure,
as whole phrases of two bars or more, landing on a key word or the payoff. **The tune may be
absent** when it would be forced: the logo at the end is always the tune. When it is there, it
is there as a line (the pieces he accepted carry it about half to two-thirds of the time), not a
three-note fragment that appears for two seconds and vanishes.

## Energy matches the film

Read the film's cut rate, the pace on screen and the narrator's pace. **A lively film gets
lively music** (on "Make it mine": "the music needs to better match the busier/higher-energy
nature of this specific video"): a faster tempo, a fuller figure, the swung pulse, a higher
register. A calm film gets fewer notes, not just quieter ones.

## The picture

- **One shared beat grid** for picture and music (he said yes to designing both on one beat).
- **Scene cuts on bar lines**, small events on beats (his pick on "Make it mine": the cut
  re-timed so every cut lands on a bar line).
- **The music lands just after the picture, never before it**: about 0.05 to 0.15 s (his pick
  on "Own everything": the music about 0.15 s after).
- **Only four moments get a musical moment**: the opening, the turn, the payoff and the name.
  Everything else is carried by the grid.

## Under a narrator

About **120 bpm with room for her breaths** (his pick, "D: 120 with breaths"). The music
supports her and never chases her syllables; no melody in her range (F3-E5) while she speaks;
her voice stays at least 6 dB over the music; the level is set by hand per section, never
ducking on each word. He still hears the current voice as "too fast/harsh for our music": that
is an open question about the read, not something the music can fix by itself.

## The process (approved)

1. **Palette**: done (the table above).
2. **Two 15-second feel sketches per film** (two tempi or feels over the same stretch of
   picture) for his ear: `render.sh --sketch feel-a feel-b from=S picture=film.mp4`.
3. **The full score** of the sketch he picks, then `render.sh --shelf <film>` and the report.

Test on many films and cuts, not one: a rule that only works on "Own everything" is not a rule.
Review decks use the standard deck format (`scripts/ui-review/`), never a one-off style.

## His rulings, verbatim

- E1 (narrator): "D: 120 with breaths" ... "she just seems to fast/harsh for our music selection maybe."
- E2 (pulse): "i realllllly like BOTH c and d"
- E3 (busy): "c is totally acceptable. i think my issue with the "busy" music is it felt like
  different instruments playing entirely their own song at different volume levels. c still feels
  like a single unified song. also in a for example, the high piano notes around 14s and elsewhere
  still feel a little thrown-in and not blended as part of a well-unified track"
- E4 "A: ours, soft". E5 "B: middle". E6 "B: today". E7 "B: rich".
- E8 (tune): "the way this is integrated feels to clash with the underlying base music/notes quite a bit."
- E9 (held layer): "those strings are wayyy too harsh/overpowering."
- E11 (endings): "a sounds a bit too harsh and doesnt quite fit the rest of the ustic. prefer b/c to a"
- F1 (family): "upbeat doesnt sound at all like the others. the strings fully overpower everything.
  also these all still feel like the different instruments are kinda just doing their own thing
  instead of forming single unified pieces"
- A1: "i think c is best?" (music ~0.15 s after the picture). A2: "i think b is probably best,
  but i think the music needs to better match the busies/higher-energy nature of this specific
  video/ad." A3 (one shared beat): yes.
- R4 (the tune): "the current integration is genuinely just bad. feels like we're just randomly
  thowing it in on top of music for the sake of it instead of integratiing"
- R5: "Keep the sound improvements, drop the menu-music form". R7: "we should test on a bunch of
  different films/cuts. also we should use the proper review deck format from now on. dont create
  unique deck styling"
- Standing: no drums, claps or clacks; no thwip or fake-out; soft pen only; effects per film;
  "the voice always wins".

---

# Part 2. The toolkit

## Commands

Run from anywhere as `scripts/campaign/sound/songbook/render.sh ...`:

```
render.sh --brief  <film>              # the brief, card hold times, tempo fit to the picture, her pace, motion grid
render.sh --notes  [--log] <film>      # the notes bar by bar, the chords (tune-led changes shown), the
                                       #   pad voicings, the hard checks and the unity readings (~1 s, no audio)
render.sh --sketch <film> [<film2>] [from=S] [len=15] [picture=x.mp4] [pic_from=S] [lag=0.10] [k=v ...]
                                       # a feel sketch: that window of each piece, music `lag` s after the
                                       #   picture, to out/sketches/<name>-sketch.mp3 (+ .mp4); her voice
                                       #   from voice_mux; k=v (e.g. swing=gentle) adds a one-switch B
render.sh <film>                       # the full render: out/films/<name>.wav, -bed.wav, the report
render.sh --shelf  <film>              # its readings and tone next to the reference shelf (reference/)
render.sh --deliver <film> <dir> [picture=x.mp4] [from=s]   # mp3, and the mp4 with a picture
render.sh --py -c "import recipes as R; print(R.land_after(8, 112, 'short'))"   # one toolkit function
```

`SONGBOOK_NO_COPY=1` keeps a render in `out/` (the two old films otherwise copy into the editor's
folder). Never run `render.sh` with no arguments while others compose (it re-renders everything).

## A film file (the worked example: `src/film_woven.py`)

```python
import recipes as R
from films import Film
from motif import write

BPM = 112.0
LAND = R.land_after(8, BPM, "short")          # or the editor's frame for the name: BRIEF.logo_at
TUNE = [(2, write("Bb4/1 G5/1 F5/2 | Eb5/1 F5/1 G5/2", label="statement")),
        (5, write("Ab5/1.5 G5/0.5 Eb5/2 | F5/1 G5/1 Bb5/2", label="answer"))]
PIECE = R.type_short("woven-example", round(LAND + 1.8, 3), land=LAND, bpm=BPM, seed=3, subtle=True,
                     tune=TUNE)                # chords=None: tune-led (the recipe bends its chords to the tune)
FILM = Film("woven-example", PIECE, copy_to=None)
```

A film lives in `src/film_<key>.py` exposing `FILM` (or `FILMS`); it is found automatically.
For two feel sketches, write two pieces (e.g. `FILMS = [Film("x-feel-a", ...), Film("x-feel-b", ...)]`).

## What the recipes do now (style "v4")

`recipes.type_short` (10-20 s), `recipes.app_demo` (30-75 s), `recipes.narrated` (30-75 s, under a
voice) all return a v4 piece unless told `style="v3"` (the older pieces are pinned to it).

- **The woven tune** (`options.tune_voice="woven"`): tune notes play on the bed's piano bus with
  its tone, shine and room, at the figure's touch + 0.08, struck with the band (3 ms ahead, not
  15). A figure or pulse note on the same step as a tune note gives the step to the tune; a bed
  note under a sounding tune note is moved down an octave (rhythm unchanged).
- **Tune-led chords**: with `chords=None`, each half-bar under a held tune note that the default
  chord does not hold changes to the closest chord that does (printed in `--notes`). With
  composer-written chords, a held tune note outside its chord STOPS the build with the bar, the
  note and the chords that would hold it; `tune_fit="allow"` only for a rub you mean.
- **The pad** is voiced to include the chord's root and every held tune note's pitch (unless
  that would grind a semitone or major seventh against the bass; the note dump shows it).
- **Defaults**: pulse "chord" (round 8's figure, touch 0.28), `swing` "straight" | "gentle",
  sustain "pad" | "ring", `pad_level` -4, the quiet logo (`logo="piano"` or `"none"`),
  recipe B's tune as two-bar phrases about half the time with the peak phrase at the peak,
  recipe C keeps its high two-note pulse under her (the chord figure would sit in her range).
- **Refused in v4**: `cycles=` (retired), `sustain="held"` (strings), `logo="blend"`.
- **The sound** (engine/options.py, profile "v4"): one shared room (hall 0.22, room 0.10 on every
  layer, the sub dry), the same capped shine on every piano note, one gentle glue across all piano
  buses (at most 2 dB), pans within +-0.15, and on any bowed bus HP 80 Hz / LP 4.5 kHz / -3 dB at
  3 kHz. Everything is still a switch (`Piece.sound`, `SONGBOOK_SOUND`).

## The readings (instead of the dashboard)

A v4 report is the hard faults (clipping, silence, an unmarked clash, the narrator masked, the
wrong length: these fail a render) plus the **unity readings** (`src/unity.py`), never a
failure: `tune-in-harmony`, `tune-in-bed`, `above-tune`, `tune-duty`, `layers-per-bar`,
`struck-together`, `levels-together`, `level-gap`, `held-2-6k-share`, `one-room`, `tone`. A `*`
marks a reading outside where the accepted pieces sit. Read them next to the shelf
(`render.sh --shelf <film>`, `reference/README.md`); report them as numbers; change the music
only for a musical reason.

---

# Part 3. Reference

## Harmony

- One chord per two bars by default, one per bar only at a cadence or under a moving tune.
- The vocabulary (`tune.VOCAB`): Ebmaj9, Ebadd9, Ebsus2, Cm9, Cm11, Abmaj9, Abmaj7#11, Fm9, Gm7,
  Bb9sus, Ab/Bb, Bbsus4 and the plain chords. A borrowed colour (Abm, Db, F7) at most once a film.
- Every change keeps at least one note of the last chord. Chords as a string, one name per
  4-beat bar, `[Ab Bbsus]` for two in a bar; the odd bar keeps the chord before it.
- Which chords hold which tune notes: F is in Ebmaj9, Ebadd9, Cm11, Bb9sus, Fm9 (not Cm9, Abmaj9);
  G in Ebmaj9, Cm9, Abmaj9; A-flat in Abmaj9, Bb9sus, Fm9; B-flat in Ebmaj9, Cm9, Bb9sus.

## The phrase bank (`tune.PHRASES`) and writing your own

`cell`, `cell-on`, `cell-long` (2 bars), `falls`, `question` (2 bars), `climb`, `settle`, `rise`
(2 bars), `answer`, and for the peak only `higher`, `from-top`, `peak-arc` (reach C6). Or write a
line: `motif.write("Bb4/1 G5/1 F5/2 | Eb5/1 F5/1 G5/2")` (`~/2` ties over a bar line, `pickup=1`).
`tune=[(bar, phrase)]`, bars counted over the whole piece; the odd bar takes no tune.

## Timing

- **The tempo comes first**: `fit_tempo` (`--brief`) against the picture's moments, or her band.
  A moment is "on" when heard 15 ms early to 45 ms late; the name within 10 ms (hard). One odd bar
  (`odd=1|2|3`, `odd_at=`) and the ending's slowing (`rit=0.75-0.85`, `1` for the short ending)
  are the only fitting tools. A picture cut to its own beat takes that tempo.
- **Music after picture**: in a sketch, `lag=` (0.05-0.15 s); for the delivered mux, ask the
  editor to offset the music by the same amount.
- The shared 1/f time line, phrase-shaped melody and the curved ritardando are v3 behaviours v4
  keeps; endings are real endings with at least 1.5 s of ring after the name.

## Recipes in brief

| | A `type_short` | B `app_demo` | C `narrated` |
|---|---|---|---|
| Length | 10-20 s | 30-75 s | 30-75 s |
| Tempo | 100-120 from the cards | 104-120 | her band, nearest 120 |
| Chords | Ebmaj9 / Abmaj9 per 2 bars | Ebmaj9 Cm9 Abmaj9 Bb9sus per 2 bars | on her sentence ends; `turn=` to bright |
| Tune | none by default, or whole phrases | 2-bar phrases about half the time | only after her last word |
| Ending | short, quiet logo | sigh, quiet logo | sigh, quiet logo |
| Level | -16.5 (subtle) / -15 LUFS | -16 / -15 | her level by hand (-6 dB), -16.5 |

Narrated: map her words with `films.speech_from_words(words.json, t_from, start_at=1.5)`, give
`voice_mux=dict(path, t_from, start_at, music_db)` so her margin is measured. If she speaks into
the name, ask the editor for 1-2 s after her last word; otherwise `ending="short"` and report it.

## The change plan

`changes=[(bar, what, arg)]`: `"in"`/`"out"` (`sustain`, `pulse`, `sub`), `"register"` (k scale
steps), `"pool"`, `"density"`, `"brightness"` (0.7-1.3 on the pad filter), `"echo"`, `"family"`,
`"peak"`. A layer fades over two bars. One change every 8-16 s; under 20 s, none or one.

## Sound switches (engine/options.py)

Order: `Piece.sound`, then `SONGBOOK_SOUND="k=v,..."`, then the style profile (v1 old sound, v2,
v4 the unity defaults), then DEFAULTS. The unity switches: `tune_voice`, `lead_early_ms`,
`shine_all`, `room`, `bowed_eq`, `piano_glue`, `pan_max`. Others: `piano` (upright-kw |
vcsl-upright | salamander), `pad_timbre` (saw | triangle), `pad_cutoff`, `pad_sub`, `air_db`
(capped at +1.5), `glue`, `echo`, `voice_cut`, `damper_thump`.

## Owner switches (`recipes.OWNER_V4`; `owner_over={...}` or `SONGBOOK_OWNER="k=v"`)

`pulse` chord | pedal · `swing` straight | gentle · `sustain` pad | ring · `chords` rich | plain ·
`pad_level` -8 | -4 | 0 · `fig_order` circle | cell (pedal pulse) · `narrator_tempo` near120 |
stress · `voice_busy` 3 | 5. These are his to decide by ear; never decide them yourself.

## Hard checks (only these fail a render)

`clipping` (a clipped sample or true peak over -1 dBTP) · `silence` (over a second of nothing
before the name) · `clash` (a semitone or minor ninth held between sustained notes below C5, in a
bar not marked in `Piece.clash_ok`) · `narrator-masked` (a tune note in her range while she
speaks; her voice under 6 dB over the music) · `length` (wrong length, the name over 10 ms off,
a non-silent first or last sample, under 1.5 s after the name).

## Pitfalls

- **The tune laid on top** (rounds 6-8, the element deck): a fixed three-note cell dropped in by
  bar number over chords not written for it. Write the phrase, then the chords under it.
- **A brighter, separate tune**: shine, its own bus or an early strike on the tune alone make it a
  second instrument. v4 does none of these; do not add them back.
- **Strings as they sound today** own the 2-6 kHz band at a tenth of the energy. They stay out
  until a soft, dark, slow string is rebuilt and approved by ear.
- **Opening the pad's filter for brightness**: at 1500-1800 Hz the saw pad owned 72-81 % of
  2-6 kHz in the worked example (measured). Brightness comes from the piano's shine.
- **Setting a Piece field after the recipe built it**: pass everything as an argument.
- **Anything that differs between two runs**: use the seeded helpers, never `hash()`. Note: held
  strings seed their loop points from the sample's absolute path, so the same piece renders
  differently from another checkout (measured: a v3 piece with held strings differs, one without
  is byte-identical).
- **Novelty quotas, gauges as goals, a tool wrapped to dodge a check**: never.
- **Notes in her breaths, a beat at her syllable rate, a dip on every word**: never.
- **"What GTA VI did"**: nothing about its menu music is published; do not claim it.

## Older pieces

Pieces made before 2026-11-25 render as they were: `style="v1"` (what he heard before round 7),
`"v2"` (rounds 7-8: `film_mim.py`, `film_own.py`, `film_tale.py`), `"v3"` (the recipe rebuild:
`demos.py` recipe examples, the first-shot films `film_shot_*.py`, `auditions.py`). The element
deck's clips came from `elements_review.py` (v3, a pinned copy). Old reports in `out/films/` may
show the old dashboard. The old guide's full text is in git history (this file before 2026-11-25).

## Files (`src/`)

`recipes.py` (the recipes, `Brief`, `OWNER_V4`, tune-led chords, `land_after`) · `unity.py` (the
readings) · `studio.py` (brief, notes, sketch, shelf, deliver) · `bed.py` (the held layer and its
voicing) · `blocks.py` (tune, figure, pulse, endings) · `score.py` (sections, the band) · `mix.py`
(buses, room, glue, bowed EQ) · `engine/options.py` (sound switches and profiles) ·
`engine/sounds.py` (instruments) · `timing.py` · `tune.py` · `motif.py` · `tunebank.py` ·
`dashboard.py` (hard checks; older gauges for v1-v3) · `films.py` · `film_*.py` · `cycles.py`
(retired from the recipes; kept for the older pieces).
