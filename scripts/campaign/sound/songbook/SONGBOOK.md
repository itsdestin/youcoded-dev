# The youcoded songbook

## What this is

Every advert, film and clip gets its music from this one songbook, so all our music is
recognisably one family, the way a film's theme comes back in every scene. **What is fixed is
the identity:** one sound ("felt and pulse": a soft, close felt piano is the person; clean, quiet
plucked and held strings and a soft synth are the machine doing what the person asks), one key
(E-flat major and its relative C minor), one tune built on three notes in the rhythm of
"you-co-ded", one family of chords, four ways of accompanying, and the sound logo as every
piece's last phrase.

**What is not fixed is the music.** Until 2026-11-23 this page said "nobody writes new music for a
new video; a new piece is made by listing sections". That produced "Make it mine": the tune's
opening bar seven times in 54 s over one four-chord loop, never resting, its payoff quieter than
the bar before it. The owner: "extremely repetitive and poorly put together". So the rule is now
the one every good film composer works by: **the theme is fixed, the score is composed.** Each
film gets its own piece, written for its picture, that *develops* the tune (fragments it, moves
it, answers it, holds it back) instead of restating it. The chapter "Composing a score" says how;
"The hard limits" are checked automatically on every render; a piece that breaks one FAILS.
Round 7 (2026-11-23) then chased variety with rules that punished regularity, and the owner
heard the three scores as "odd/choppy/inconsistent", "still too busy/harsh", and, under the
narrator, "very slow/steady, while the narrator is fast fast ... the piano notes extremely
inconsistent and oddly thrown in". So since round 8 (2026-11-24) **the first principle is
steadiness: one continuous, even foundation the listener can settle into; variety is slow, small
evolution on top of it.** Coherent first, then subtle. The chapter "Composing a score" and the
checks were rewritten for that.

The blocks come from the three pieces the owner said yes to: "One becomes many" (blend-1),
"Pizzicato bounce" (chamber-1) and "Rocking piano, singing strings" (chamber-2). Nothing comes
from the versions he said no to (both two-piano versions and "Mirror").

## The tune

Key: E-flat major, like everything before. One bar is four beats.

| Bar | Notes | What it does |
|---|---|---|
| 1 | **B-flat, G, F**, E-flat | the signature "you-co-ded", then one step further down |
| 2 | E-flat, high C, B-flat, G | the same shape, higher |
| 3 | A-flat, G, E-flat, C | falls back down |
| 4 | E-flat, then a long D | hangs open, like a question |
| 5-6 | the same as bars 1-2 | |
| 7 | high C, B-flat, A-flat, G | from the top |
| 8 | F, G, A-flat, B-flat | climbs back up toward home |
| ending | high C (long), B-flat (long) | a sigh onto B-flat, the logo's own first note |

The rhythm is mostly "long, long, longer, short": the short note pushes into the next bar,
which gives it a little skip.

**Why this tune.** It is the one chamber-1 and chamber-2 share, so two of the three pieces you
liked are already built on it, and it has what the rules ask for: a real tune that grows out
of the three signature notes instead of repeating them. blend-1's own tune was the three
notes said three times, each a step higher; you have said tunes should be more interesting than
that. What made blend-1 special was its *conversation* (a second piano answering every
phrase), so that became its own block, THE ANSWER, re-written to fit under this tune.

It can be used three ways: **in full** (8 bars), **just the first phrase** (bars 1-4, which
ends on a question) or **just the signature** (the three notes alone, then a bar of space:
for under a narrator).

## The blocks

**THE ANSWER** (from blend-1). A second piano, on the other side, answers the tune. Since
2026-11-23 it *listens*: it speaks only where the tune leaves at least a beat of space, and it
answers with the tune's own last two or three notes (an echo an octave down; every other answer
upside down), landing on a note of the chord that the tune is not already sounding (since round 7
it re-checks the chord after stepping off a doubled note, and never passes over a borrowed
chord's clashing note). Where the tune leaves no space it waits, so a tune that never rests gets
no answer: write rests. `answer_skip=(3, 7)` silences it in single bars. (The pieces made before then keep the old answer,
a fixed three-note ladder on beats 3, 3.5 and 4, which talked over the tune.) It stops while the
violin has the tune (one voice at a time).

**THE CHORDS.** One home progression, in two forms (the wider vocabulary a score may use is in
"Composing a score", Harmony):

- *Bright* (E-flat major): E-flat | C minor | A-flat | B-flat. The brand's chords.
- *Dark* (for a problem, a flat moment): C minor | A-flat | F minor | G. C minor is E-flat
  major's "relative minor": it uses exactly the same seven notes. So **the dark form changes
  not one note of the tune**; only the floor under it turns sad. The one new note, B natural,
  lives only in the accompaniment's G chord, which gives the minor key its pull.
- *The turn*: the dark form's last bar rises A-flat, B-flat, the classic way out of a minor
  key. Put it at the end of a dark section and the next bright section feels like the sun
  coming out, not like a change of record.

**THE ACCOMPANIMENT** (the engine under the tune; it never stops *by accident*, and works at any
speed; since 2026-11-23 each pattern can be thinned, halved, dropped or rested bar by bar, see
"Composing a score"):

- **Rolling piano** (blend-1): the left hand rolls through each chord in even notes. Warm,
  flowing; pedalled in the warm moods.
- **Pizzicato bounce** (chamber-1): cellos pluck the low note, violas pluck little chords in
  between the beats, a soft piano chord underneath. Light and bouncy.
- **Rocking piano** (chamber-2): the left hand rocks low-high with a skip, cellos plucking the
  low note under it. Warm and lyrical.
- **Sparse** (new, for stark moments): one low open chord held under each chord, and a single
  note (G) pulsing slowly twice a bar, whatever the chord. Deadpan.
- (**Still**, for a hush: one soft rolled chord, touched again halfway. Barely moving.)
- **The figure** (round 8, `accomp="figure"`): one even pattern you write as tokens, reading its
  pitches from whatever chord is sounding (`figure="b 2 3 2 4 2 3 2"`: the bass, then chord tones
  counted up from `fig_floor`). Piano, plucked or the soft synth. **The default for new scores**:
  it is the continuous pulse the other patterns only imitate, and it never accents or skips.

**THE LAYERS** (switched on or off per section):

- **Second-piano answers** (THE ANSWER, above).
- **Plucked strings**: cellos and violas plucking along with the accompaniment's rhythm.
- **Held strings**: three low bowed notes that move as little as possible; they never swell
  and dip, they only change level in long straight lines.
- **Solo violin takes the tune** (chamber-2): the violin sings it, the violin section doubles
  it quietly, the cellos sing it an octave lower. When the tune passes from piano to violin,
  the piano plays the first bar with the violin, softly, then lets go (you hear the hand-over).
- **Both**: the violin sings the tune while the piano plays it in octaves (the biggest).
- **Soft synth**: quietly doubles the accompaniment's moving line; its tone opens a little
  across a section (never a sweep).
- **Soft sub bass**: a round low note under each chord; weight, no rhythm. It fades in over a
  bar when it first arrives.
- **Low cellos**: hold each chord's lowest note (part of the lift; on in triumphant).
- **Air**: one high, quiet, held violin line (E-flat, moving to D only on the "leaning" chord).
  It is continuous, never an accent. It is there so the music is not dull on bright speakers.

**THE LIFT** (how a section grows into a big moment, using only the playing): across the
section everyone plays a little harder in one straight line (about 1.5 dB by its end), the held
strings rise further (about 3.5 dB), the cellos join low underneath and the high violins join
halfway (the sound gets wider at both ends), and the piano doubles the tune an octave lower.
The lift's level then stays up through the next section. No risers, no whooshes, no drums.

**TRANSITIONS** between sections (always musical):

- **Blend** (the default whenever the mood changes; revised after your listen): the change is
  prepared over the last **two bars** of the outgoing section. The next section's accompaniment
  grows in underneath (from about a third to nearly full strength) while the old one thins and
  stops exactly at the bar line, so the new feel is already moving when its section starts. If
  the speed changes, the players speed up or broaden gradually across those two bars (never in
  one bar, never in a jump). Strings the new section adds enter during those bars from nothing;
  strings it drops bow away there. A held string note common to both sides is held straight
  through the join (one bow). If the tune changes hands (piano to violin), the new voice joins
  the tune in the last bar before the join. Everyone's loudness moves in one straight line
  across the two bars, so there is no dip. New sections start on the tune's phrase boundary.
- **Build**: a blend that also grows louder into the next section.
- **Flow**: the same mood carrying on: the next section simply starts on the next bar.
- **Hold** and **Breath** (no longer defaults): a held chord, or a pause where the last notes
  ring. Your notes on the journey showed a held chord between two moods sounds like the music
  stopped and restarted; keep them for a deliberate, deadpan pause (stark-to-bright uses one).

**THE ENDINGS**:

The logo is no longer a file pasted after the music (revised after your listen: the pasted file
ran at its own speed after pieces at other speeds, so you heard the song stop and the logo start).
**The band now plays the logo as the song's own last phrase**, in the song's own tempo:

- **The cadence**: a last bar of A-flat then B-flat, slowing gradually across the bar (its end
  is about 85 % of the song's speed). The tune sighs high C, B-flat; the band holds the B-flat
  chord; then the logo's own three notes, B-flat, G, F, are played as the tune's last words:
  two quick pick-up notes and the F landing on the next downbeat, on E-flat. The name appears
  exactly on that F (measured within 2.3 ms of the requested time in every file).
- **Full-blend ending** (any piece with music): the same notes, loudness and instruments as the
  chosen full-blend logo: the piano with plucked violins on the three notes, a low E-flat on the
  piano with a plucked cello and the soft sub under the landing, the held strings opening into a
  warm swell, and the second piano answering low (B-flat, G, F). Everything then rings and
  settles; the last second fades to silence.
- **Piano-only ending**: the same bar on the piano alone (the strings bow away across the bar),
  then the three notes and the open low E-flat chord of the chosen piano-only logo.
- **Quiet ending** (`logo="quiet"`, for a subtle film): the full-blend ending without the plucked
  doublings or the low answer, played softer, so the logo does not land louder than the peak.
- **Short ending** (`ending="short"`): two beats instead of four: no sigh, only the logo's two
  pick-up notes over B-flat sus, so a short film can land its name on the editor's beat grid.
- **No logo** (`logo="none"`): for a passage cut from the middle of a longer film. The ending's
  sigh over an open B-flat chord that rings on: the music hands on, the name is not on screen.
- **The logo files** are now used only when the logo plays on its own (`out/logo-alone.wav`).

## The moods

| Mood | Sounds like | Use it for | Usual speed |
|---|---|---|---|
| **Stark** | the dark chords, the sparse pattern, the tune played plainly and dry, a low held string bed | a problem, a flat statement, an awkward silence | 66-100 beats a minute (80) |
| **Hush** | the piano almost still, far strings | the quiet moment between two feelings | 66-100 (80) |
| **Hopeful** | bright chords, rolling piano, held strings, air | under a narrator; a hopeful turn; slow builds | 72-96 (84) |
| **Playful** | pizzicato bounce, the answers, quick | product moments, things working | 108-128 (120) |
| **Triumphant** | rocking piano, violin and piano in octaves, everything on | the final line, the payoff, before the logo | 96-126 (112) |

Any section can add or drop single layers, swap the accompaniment, or set its own speed. Since
round 8 a mood is a colour (chords, layers, touch), not a speed: the tempo comes from the
narrator's pace or the picture ("Composing a score", section 3), so give every section `bpm=`
(a hopeful bed under a narrator may run at 140), and most new scores use `accomp="figure"`.

## The rules (the owner's rulings, in his words where possible)

- **No drums, claps or clacks, ever**, no kick and no kit. Energy comes from instruments playing
  together. (Nothing drum-like exists in the songbook's code.)
- **Never a fake-out or a "thwip"**: "it sounds like a 2005 browser demo switching pages". No
  stops answered by a flourish; no zips, sweeps, whooshes or risers.
- **One piece of music per film**: "we cant *just* have notes, we need consistent
  tunes/strings/chords/etc." One song with a few spotted turns of feeling, never a new cue per shot.
- **No scattered high jingles.** A high part is a continuous line (the air layer, a held violin).
- **Under a narrator, the music's level does not bounce.** It is set by hand per section and
  changes only slowly, never with an automatic dip on every word. (Since round 8 the same is true
  without a narrator: the level moves slowly, at most 3 dB from bar to bar.)
- **Coherent first, then subtle** (round 8, from "odd/choppy/inconsistent", "busy/harsh" and
  "oddly thrown in"): one continuous, even pulse per piece; two or three layers; a soft, dark
  touch; notes in phrases, never alone; change slowly and rarely.
- **Under a narrator, the music moves at her pace** ("the music is very slow/steady, while the
  narrator is fast fast"): the tempo comes from her syllable rate, and the bed runs continuously
  under her instead of dropping notes into her gaps.
- **Music answers feelings; sound effects answer actions.** The music never adds an accent for a
  word or an action.
- **Sound effects are made for each film, never taken from a shared kit**, and only where that
  film needs them. **Pen sounds are soft and smooth, never scratchy** ("annoying and too
  scratchy"; "Soft pen" was his pick).
- **The voice always wins.**
- **Two logos**: "piano only if we're ever using the logo sound by itself without other music,
  but the full blend if at the end of an ad with our other music."
- **Subtle when asked.** On "Own everything": "the music should be a little more subtle".
  Subtle means fewer notes, softer touch, more space and one clear idea, not the same
  arrangement turned down, and it includes the logo (`logo="quiet"`).
- **Short films are short.** "Own everything" is a 10 s film: the music is one idea said once
  or twice, not a compressed version of a long score. Its music must be "one unbroken, even
  phrase", not stop-start ("very odd/choppy/inconsistent").

## Composing a score

Read this whole chapter before writing a note. Every rule that can be a number is one, and
`render.sh --notes <film>` checks it in about a second (see "The hard limits").

**Why the chapter starts with steadiness (round 8, 2026-11-24).** Round 7 passed every check of
the time and the owner heard it as choppy, busy, harsh and "oddly thrown in". Its notes show why:

| What he heard | What the notes and audio showed (round 7) |
|---|---|
| "choppy / inconsistent" (own, mim) | the accompaniment stopped for 2-4 beats 7 times (mim); 0 to 11 notes a second from one 2 s window to the next; bars of 4, 12, ... 2, 19 notes; the level moved 9-17 dB within one second and up to 6 dB from bar to bar |
| "busy / harsh" (mim) | up to 5 groups at once (tune, second piano, rolling piano, held strings, sub); a walking bass, a cello B idea and a violin climb in 60 s; piano touch up to 0.69 (the hard sample is 0.7); a thin bar where the high air line alone made 4 kHz and up only 11.5 dB below the whole |
| "slow/steady while the narrator is fast fast" (tale) | 68.6 bpm (3.5 s a bar) under a voice at 4.6-4.7 syllables a second (stresses every 0.42 s, about 140 bpm); 2 notes a second, gaps of 2.5 beats |
| "piano notes extremely inconsistent and oddly thrown in" (tale, own) | notes placed one by one in her breaths: 6 of 13 tune notes (tale) and 4 of 6 (own) had no other tune note within a beat; onsets on 0.75 and 0.25 of the beat, off any grid |

The rules that drove it (at least 5 different rhythms, phrases off the downbeat, something new
every 8 s, the accompaniment changing within 6 bars, a "drop" to two parts before every peak) are
gone. What replaces them is below. **Passing every check is still the floor, not the goal.**

### 1. The foundation: one continuous, even pulse

- **One foundation layer sounds in at least 90 % of the beats** (`foundation`), and it **never
  stops for more than 2 beats** (`pulse`; a written hold or breath aside). It is a pulse or figure
  the listener can settle into: the piano figure (`accomp="figure"`, the default), or a plucked
  figure, or the rolling piano. It runs from the first beat to the ending. WHY 90 % / 2 beats: a
  real bed never stops; round 7's mim stopped for 2-4 beats seven times and was heard as choppy.
- **Write it as a figure**: `figure="b 2 3 2 4 2 3 2"` in eighths (`step=0.5`), `b` the bass (held
  to the next `b` or chord change), digits the chord tones counted up from `fig_floor`. A list of
  bars is cycled: `figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"]`. It reads each chord, so the
  harmony moves while the pattern stays the same. `pedal=False` for a light, dry figure;
  `fig_voice="pizz"` for a plucked one; `fig_floor=("G3", "C4")` opens its register across a section.
- **The texture is even from bar to bar** (`even`): a bar has at most twice the attacks of its
  neighbour (plus 2), and the foundation at most twice its neighbour's (plus 1). No stop-start.
- **Onsets on a clear grid** (`grid`): at least 95 % on the eighth-note grid (the sixteenth if a
  figure runs in sixteenths), with only the humanising and chord rolls the players add (5-7 ms,
  0.07 beat at most). Never place a note on a breath or a cut that is off the grid: choose the
  tempo so the moments you need fall on it (section 3).

### 2. Few layers, soft tone

- **At most three groups at once, typically two** (`layers`): the foundation and the tune; or the
  foundation and the held strings; three while the tune sings over both. The tune counts once
  (piano or violin); the high air line, doublings and the sub's weight are not counted. WHY 3:
  round 7's mim reached 5 and was "busy". A counter-line, a walking bass, a second piano answering:
  each is a fourth layer unless something else leaves for it.
- **At most 5 attacks a second in any 4 s** (`attack-rate`, notes within 30 ms count once). An
  even eighth figure at 120 bpm is 4; a tune on its beats adds none. Aim for 3-4.5.
- **A soft hand** (`touch`): no piano note above touch 0.62 (the felt piano switches to its hard
  recording at 0.7, and its filter opens with touch: 900 Hz x 2^(2.4 x touch)), and the spread
  between the softest and loudest notes (5th-95th percentile) at most 0.35. Tools:
  `Piece(touch=0.85)` (every piano note softer, rounder, darker; the mix keeps its level), `lead=`,
  `fig_touch=`, `@0.8` on single notes.
- **A dark, rounded tone** (`tone`): the energy above 4 kHz at most -23 dB of the whole, and at most
  -19 dB in any bar. The usual culprit is a high line alone in a thin bar (the air layer, a violin):
  `drop=("air",)` there. Tools: `Piece(tone=-2)` (a high shelf at 3.5 kHz on the music),
  `Piece(air=6)` (the master's air shelf, default 11 dB). Do not go below about -36 dB: it muffles
  (the 8-16 kHz mix check fails below -38).

### 3. Tempo: from the narrator's pace or the picture's cut rhythm

- **Under a narrator, the beat is her stressed-syllable rate** (`narrator-tempo`, within 12 %). The
  note dump prints her pace: syllables a second while she speaks, and the tempo whose beat is two
  syllables (English stresses about every second syllable), so the figure's eighths run at her
  syllable rate. take1-lily, 0-37.9 s: 4.6-4.7 syllables a second, 0.21 s each, **138-142 bpm**.
  `films.speech_pace(speech)` gives the same numbers in code. Never half time: 68.6 bpm under her
  was "very slow/steady, while the narrator is fast fast". Under her words keep to quarters and
  eighths (at most 5 attacks a second, `voice-busy`).
- **To a picture, take the tempo from its cut rhythm**: list the hits (cuts, lines of type), find
  the beat that divides most of the gaps between them (own: every hit on a multiple of 0.25 s =
  120 bpm; mim: turns every 16 s = 8 bars at 120). Hits that do not fall on the grid are left
  alone by the music; if a hit matters and is off the grid, ask for the picture to move to it.
- **One tempo per piece.** A section may broaden 1-2 % at a phrase end; nothing else.

### 4. Melody: phrases, rarely

- **No isolated notes** (`phrases`): every tune, answer and counter-line note belongs to a phrase
  of at least 3 notes (a note joins the one before if it starts within a beat of its end). A line
  comes in phrases or not at all. WHY 3: two notes are a gesture the ear cannot place; round 7's
  tale and own were full of single notes and pairs and they were "oddly thrown in".
- **Simple phrases on the grid**: a phrase is 1-4 bars, on beats and eighths, with notes of one or
  two lengths. A regular rhythm is allowed (the old rules against it are gone); the tune's own
  "long, long, longer, short" is a good default.
- **The tune appears rarely**: under 20 s once (the logo is the second hearing); 30-60 s two or
  three phrases at most, with whole bars of the foundation alone between them. The tune rests at
  least one bar in every 8 (`tune-breath`). Under a narrator the tune is a short phrase where she
  pauses for a sentence, or over the last line after she stops; never notes in her breaths.
- **The tune is the brand**: the cell ("you-co-ded": up a sixth, down a step) at least once before
  the logo in a piece over 8 s; its counts below (cell-same-form, cell-shape, opening-statements,
  tune-bar-repeats, tune-shapes) still hold. Develop it with `src/motif.py` (`.rhythm`, `.up`,
  `.octave`, `.aug`, `.end_on`, `write(...)`), but one development per hearing, not five.
- **The tune is the top voice** (`top-voice`); no melody in the narrator's range F3-E5 while she
  speaks (`voice-room`).

### 5. Variety: slow evolution, never a patchwork

- **Harmony moves, the pulse does not.** A chord every bar or two, on the bar line; a few changes
  of two chords in a bar at a cadence. The home progression may not loop literally more than once
  (`chord-loop`); at least min(6, 3 + seconds/20) different chords (`chords-distinct`).
- **One small change at a time, at most every 4 bars**: a layer enters or leaves (held strings, the
  sub, a plucked double), one figure token changes, the figure's register opens (`fig_floor` as a
  pair), the tune enters. Never two of these on one bar line except at the one lift.
- **No verbatim loop** (`verbatim-loop`): a stretch of more than 4 bars may not copy the bar 1, 2
  or 4 before it exactly. Two identical bars under a held chord are fine; an unchanged 2- or 4-bar
  block going round is not. The audio warning `audio-nothing-new` (16 s of near-copy bars) asks
  whether anything is evolving.
- **Borrowed chords** (`Abm`, `Db`, `F7`, `G`): at most once per film, entered and left by step.

### 6. Level: slow, with one lift

- **The level moves slowly** (`level-rate`): at most 3 dB from one bar to the next and 6 dB within
  any second (400 ms loudness). WHY: the first "Make it mine", never heard as choppy, moved at most
  5.4 dB in a second; round 7 moved 9-17 dB.
- **Range** (`loudness-range`): 2-9 dB across the piece (1.5-6 under 20 s).
- **One lift, staged** (`payoff-louder`): the peak's two bars 1.5-5 dB above the 4 bars before,
  grown over a bar or two (`level_db` with `ramp`, a `shape`, a layer entering, the figure's
  register opening), never switched on. The loudest bar is at the peak or the logo
  (`peak-loudest`). After the peak, settle (`settle`) so the logo lands into space.
- **Name the peak** (`Piece.peak`, seconds; the frame where the payoff image is on screen) and
  keep the tune's top note for it (`peak-saved`, `peak-arrival`).

### 7. Under a narrator

- **A continuous low bed, not notes in her gaps.** The figure runs under her the whole time at her
  pace (section 3), at a constant low level (`narration=True`, `level_db` per section, changing
  only between sections and slowly; `voice-steady` fails a rise over 1.5 dB from bar to bar under
  her words). Keep its notes below F3 or above E5 where you can; if it must sit in her range, make
  it plucked and quieter.
- **Map all her words**: `Piece(speech=films.speech_from_words(<words.json>, t_from))`
  (`speech-covers`). A test mux plays her real voice; never fade her out.
- **Darker and smaller, then warmer, without changing tempo**: the same figure turns by its chords
  (minor to major, a borrowed D-flat resolving by step), its register (`fig_floor`), a layer
  (held strings) and its touch, never by a new speed or a new pattern.
- **A passage cut from the middle of a narrated film ends open**: `Piece(logo="none")`.
- **The mux**: under her words the music 10-14 dB below her in the phone band (above 300 Hz).

### 8. Short films (under 20 s)

- **One unbroken, even phrase** over one figure, the tune once at most before the logo, the logo
  on the editor's grid: count the beats to the name (land x bpm / 60) and fill them with bars of 4,
  a hold (`into="hold"`, `hold=` beats) and an ending of 4 beats (`ending="sigh"`) or 2
  (`ending="short"`); `rit=1.0` keeps the grid. Example, own (120 bpm, the name at 7.75 s = beat
  15.5): 3 bars + a 1.5-beat hold + the short ending.
- **The foundation starts on the first beat and runs to the logo**: no bar of the tune over
  silence, no bar of rest under the pen. The pen sits on top of the bed.
- **Subtle**: `Piece(loudness=-17, logo="quiet", touch=0.85)`; the logo's first second at most
  1 dB over the peak bar (`logo-gentle`); something above middle C in the first 2 s and the opening
  light below 150 Hz (`phone-low`, a warning).

### 9. Voice-leading and clean harmony (unchanged)

- The figure voice-leads by itself (chord tones counted from one floor). Held strings move by step
  or not at all; a held note may not ring into a chord a semitone away (`held-clash`); no tune note
  on a borrowed chord's clashing note (`clashes`); no pitch struck in four parts at once (`clutter`).
- Tempo: no step over 2 % between beats, 0.5 % on the peak's downbeat (`tempo-steps`); every
  section within 6 % of its own `bpm` (`tempo-fit`).
- On a phone a bass line needs its fundamental above about 100 Hz (G2) or a double an octave up.

### 10. Sound effects (made per film)

A film that needs effects defines `effects(music, plans, piece)` in its own file and returns
(audio, report rows): make each sound there, place it with `films.place_effect(out, x, t, music,
rel_db)` and soften pens with `films.soften(x, lp_hz)`. Pens: low-passed at 3.5-4.5 kHz, rounded
pen-down and lift-off, 8-12 dB under the music; check `above_5k_db` in the report. Never read
`../sfx-kit/` for a new film. The music never stops for the pen: the bed carries on under it.

### 11. Before reporting: read the notes

Read the bar table (`render.sh --notes <film>`) and the note log (`out/notes/<name>.log.txt`):

- Is there one foundation from the first beat to the ending? Where (if anywhere) does it thin, and
  is that one slow change?
- How many groups sound in each bar (`parts`)? Where are there three, and why?
- Does every melody note belong to a phrase of 3 or more? Where is the tune silent?
- Does the notes column change smoothly bar to bar?
- What changes every 4-8 bars, and is it only one thing?
- Where is the one lift, and how many dB over how many bars?
- Under a narrator: her pace (printed), your tempo, and the figure's register against hers.
- Does every timed claim in the film file's docstring match the log's seconds?

Report notes and numbers; nobody here can listen, so never say something sounds good.

## The hard limits (checked on every render and by `render.sh --notes`)

A piece FAILS if it breaks any of these; the report says where in plain words. **Warnings** are
printed and never fail. The older pieces (the demos, the first "Own everything" and "Make it
mine", and the round-7 scores) are kept as heard and fail many: that is the point of the checks.

| Check | Limit | Why this number |
|---|---|---|
| `foundation` | a foundation group (piano accompaniment, plucked, held strings, synth) sounds in >= 90 % of the beats | a bed never stops |
| `pulse` | the foundation never goes more than 2 beats without a new note (a written hold aside) | round 7's mim stopped for 2-4 beats 7 times: "choppy" |
| `even` | neighbouring bars: attacks at most 2x (+2), foundation attacks at most 2x (+1) | round 7's mim: 4, 12 ... 2, 19 notes a bar |
| `grid` | >= 95 % of onsets on the eighth grid (sixteenth if a figure uses it), 0.07 beat tolerance | tale's notes on breaths at 0.25/0.75 of a beat read as thrown in |
| `phrases` | every tune, answer and counter note in a phrase of >= 3 notes | single notes and pairs were "oddly thrown in" |
| `layers` | <= 3 groups sounding in any half bar (tune once; air, doubling, sub aside) | round 7's mim reached 5: "busy" |
| `attack-rate` | <= 5 attacks a second in any 4 s (notes within 30 ms count once) | an eighth figure at 120 is 4; the first mim (5.2) was relentless |
| `touch` | piano touch <= 0.62; 5th-95th percentile spread <= 0.35 | the hard sample starts at 0.7; mim r3 (harsh) played 0.17-0.69 |
| `narrator-tempo` | with her words: the beat within 12 % of her stress rate (30 x syllables a second) | 68.6 bpm under 4.7 syllables a second was "slow while she is fast" |
| `verbatim-loop` | at most 4 bars running that exactly copy the bar 1, 2 or 4 before | steady is wanted; a literal loop is not |
| `tune-bar-repeats` | a tune bar at most 2 times the same or nearly (3/4 of its notes) | the tune is identity, not wallpaper |
| `tune-shapes` | one tune shape (rhythm + intervals, any key) at most 3 times in any 30 s | a sequence is for two or three hearings |
| `opening-statements` | the opening bar as written: 0 under 20 s, else 1 per 30 s | the brand's strongest gesture; saved, it lands |
| `cell-same-form` / `cell-shape` | the cell identical at most 3 per 30 s; in one rhythm at most 2 per 20 s (under 20 s: 3 in all with the logo) | identity yes, jingle no |
| `cell-present` | at least 1 cell before the logo (over 8 s) | it must still sound like us |
| `tune-breath` | at least 1 bar in every 8 with no tune note starting | the foundation speaks alone |
| `chords-distinct` | at least min(6, 3 + seconds/20) different chords | the harmony is where a bed moves |
| `chord-loop` | the chords may equal those 4 bars back for at most 4 bars running | one literal repeat of a progression |
| `clashes` / `held-clash` | no tune note on a borrowed chord's clash; no held note into a chord a semitone away | colour, not wrong notes |
| `peak-named` / `peak-saved` / `peak-arrival` | `Piece.peak` set (over 12 s); the top note not before one bar ahead of it; the tune falls at most a fourth onto it | the climax is where the picture says |
| `settle` | over 20 s: the bar before the ending is not the busiest | the logo lands into space |
| `answer-collisions`, `top-voice`, `clutter`, `blend-pileup`, `idle-layers` | as before | the tune on top, no piles |
| `tempo-steps` / `tempo-fit` | <= 2 % between beats (0.5 % on the peak); sections within 6 % of their `bpm` | one tempo per piece |
| `voice-room` / `voice-busy` / `speech-covers` | no melody in F3-E5 while she speaks; <= 5 attacks a second under her words; her words all mapped | a bed at her syllable rate moves with her; faster competes |
| `loudness-range` (audio) | 2-9 dB (1.5-6 under 20 s) | a gentle start, one lift, a settle; mim r3 moved 10.4 |
| `level-rate` (audio) | <= 6 dB within any 1 s, <= 3 dB bar to bar | the first mim 5.4; round 7 9-17 dB in a second |
| `tone` (audio) | energy above 4 kHz <= -23 dB of the whole, <= -19 dB in any bar | mim r3 (harsh) -21.9, its thin bar -11.5 |
| `payoff-louder` (audio) | the peak's 2 bars 1.5-5 dB over the 4 before | one lift, not a switch |
| `peak-loudest`, `logo-gentle`, `voice-steady` (audio) | as before | |
| `picture-sync`, `peak-margin`, `bass-moves`, `phone-low`, `plateau` (30 s), `audio-nothing-new` (16 s) | warnings | a musician's judgement |

**Removed in round 8** (they forced novelty and irregularity): `tune-rhythms`, `tune-entries`,
`nothing-new`, `new-shapes`, `backing-static`, `harmonic-rhythm`'s 12-bar limit, `drop-real`,
`bar-repeats` (replaced by `verbatim-loop`), `momentary-rise` (replaced by `level-rate`).

The mix checks (loudness to the piece's own target, true peak, clipping, mono, bands, every tune
note on top at its pitch, the logo landing, every attack a note, no drum-like attack) print in
every film's report ("PASS/FAIL mix of ..."). The air band (8-16 kHz) may sit 18-38 dB below the
total; the low band (40-80 Hz) 3-12 dB below in a piece of -16 LUFS or quieter (3-9 at full).

## The worked example: `example-bed` (src/demos.py)

A 36 s bed at 120 bpm written to pass every check (`render.sh example-bed`; notes
`out/notes/example-bed.txt`). One piano figure in eighths (`"b 2 3 2 4 2 3 2"`, every second bar
one token changed), dry, from the first beat to the logo; the chords every two bars; the held
strings enter at bar 5 and stay; the tune twice, each a phrase: bars 9-11 (the cell as its first
three notes, 2 dB under the tune's usual level) and a rising phrase into the lift at bars 13-15;
at bar 13 the figure opens upward (`fig_floor=("G3", "C4")`), the sub enters and the level rises
1.5 dB over 3 s for the one lift (+1.8 dB); the quiet logo. Measured: foundation 100 %, longest pulse gap 0.5 beat, 1-3 groups, 4.2 attacks a second at
most, touch at most 0.51, 4 kHz and up -34.6 dB, the level at most 5.1 dB in a second.

## How to work (the order)

1. Measure the tempo source: her pace (`render.sh --notes` prints it once `speech=` is set) or
   the picture's hit list. Choose one tempo.
2. Spot the picture: the 2-4 turns of feeling and the one peak. Write the plan into the film
   file's docstring with seconds: the foundation (figure, register, voice), the chords per bar,
   which ONE thing changes at each turn, where the tune's phrases go, the lift.
3. Write the foundation first and run `render.sh --notes <key>`: `foundation`, `pulse`, `even`,
   `grid`, `layers` must pass before any melody is added.
4. Add the tune's phrases, the held strings, the lift. Re-run until every symbolic check passes.
5. `render.sh <key>`: the audio checks (level-rate, tone, payoff) and the mix checks.
6. Answer section 11's questions; report what the notes and numbers show.

## Pieces made before the composing rules (kept as the owner heard them)

These pin `style="v1"` and render byte for byte as before (checked: `make-it-mine.wav` is
identical to the copy in the film). Their composition checks are printed and mostly FAIL; read
them as the list of what not to do.

- **"Own everything" (24 s, `own-everything*`)**: stark, the turn under "everything.", a lift
  through four statements, the logo at 19.2 s. Fails `opening-statements` (2 in 19 s),
  `peak-named`, `tempo-steps` (+4.2 % into the ending). The 15 s "fast" cuts and the "gentler" /
  "barest" versions are the same song. Its pens come from the old shared kit (allowed for this
  film only; new films make their own).
- **"Make it mine", first score (60 s, `make-it-mine`, in the film as `sb-take2-mix.wav`)**: the
  owner rejected it. Its checks: opening bar 7 times, one chord loop for 32 s, the tune never
  rests, 46 answer notes on tune notes, a "strings join" that added nothing (`pizz` under
  `bounce`), the blend before the payoff 1.32 × busier than either side, +4.2 % lurch into the
  ending, 3.9 dB of loudness range, 18 s of near-copy bars.
- **Round 7's three scores** (`make-it-mine-r3`, `own-everything-10s`, `fairytale-score-r2`;
  muxes in `~/Documents/youcoded-campaign/round7/`): heard as choppy, busy/harsh and thrown in.
  Under the round-8 checks: mim fails pulse, even, layers, touch, loudness-range, level-rate, tone;
  own fails pulse, even, level-rate; tale fails pulse, even, grid, phrases, narrator-tempo,
  level-rate, tone. Their film files are rewritten in round 8; the numbers above are from them.
- **The demonstrations** (`out/demo-*.wav`, `src/demos.py`): proofs of the blocks, not models of
  composition (except `example-bed`, the worked example of round 8). `demo-playful`, `demo-hopeful`, `demo-stark-to-bright`, `demo-journey` (every mood
  in one song), `example-piano-ending`; `join-*.wav` are 10 s excerpts around their joins;
  `logo-alone.wav` is the piano-only logo file.

## What is still weak (honest)

- **Nobody has listened to anything made under the round-8 rules**, `example-bed` included. The
  checks prove a score is steady, light and soft; they cannot prove it is beautiful, and a score
  can pass them and be dull. The owner's ear decides.
- **The round-8 numbers come from four pieces** (round 7's three and the first "Make it mine"):
  the thresholds sit between what was heard as wrong and what was not. They are a first fit.
- **Not checked, only written as guidance**: one change at a time every 4 bars or more; the tune
  appearing rarely; the figure's register against the narrator's; parallel fifths and octaves;
  the voice-over-music margin in the mux (needs the voice file in the render). A critic must read
  for these.
- **Syllables are counted from spelling** (vowel groups), good to about 10 % over a passage.
- **Shape points are in beats.** A swell meant to land on a picture hit moves when the tempo
  fitting moves the beats; check it against the note log's seconds.
- **The felt piano has only two recorded loudness layers**, so touch changes are part loudness,
  part tone; shapes beyond about ±2.5 dB on the piano alone come from the other instruments.
- **Each instrument group is levelled to a fixed loudness whenever it plays** (`mix.TARGET`):
  a softer touch across a whole sparse line is turned back up. Use `Piece(mix={...})`.
- **The answer that listens is automatic**; where it matters, write it by hand
  (`Section.answer=write(...)`) or silence it in single bars (`answer_skip=(3, 7)`).

## Technical appendix (for the composer)

**Commands** (from anywhere; about 40 s per film render, 1 s for notes):

```
scripts/campaign/sound/songbook/render.sh --notes mim       # notes bar by bar + composition checks, no audio
scripts/campaign/sound/songbook/render.sh --notes --log mim # the same, and every note printed (always saved)
scripts/campaign/sound/songbook/render.sh mim               # render every film in src/film_mim.py, all checks
scripts/campaign/sound/songbook/render.sh make-it-mine      # one film by name; a demo by name
```

Never run `render.sh` with no arguments while others are composing: it re-renders everything and
rewrites the films' copies in `film/public/audio/`.

Outputs (git-ignored): `out/films/<name>.wav` (and `<name>-no-pen.wav` when the film has
effects), `out/films/<name>.checks.txt` and `.json` (one per film; `out/films/checks.txt` is
rebuilt from them), `out/notes/<name>.txt` (the bar table: bar, time, section, chords, tune
notes, answer/counter notes, bass, notes in the bar, accompaniment rhythm letter, **parts** (what
sounds at least half the bar), **new** (t = a new tune shape, c = a new chord, b = a new
accompaniment rhythm); with a narrator, her pace and her breaths with their bar and beat; after a
render also each bar's loudness, its phone-band (300 Hz-8 kHz) loudness, its share of energy
below 150 Hz, its energy above 4 kHz (`>4k`, the tone) and its similarity to the closest earlier
bar) and `out/notes/<name>.log.txt` (**every note**:
seconds, bar and beat, group, part, what it is to the checks, pitch, beats, seconds, touch).

**A film in its own file**: `src/film_<key>.py` (key = short, lower case, e.g. `mim`). It is
found automatically; `render.sh <key>` renders every film it defines. It must expose `FILM`
(or `FILMS = [...]`). Film names must be new. Set `copy_to=None` until the owner picks it.

```python
"""Make it mine, fourth score: <one line on the idea>."""
from films import Film, speech_from_words, speech_pace, place_effect, soften   # what you need
from motif import motif, write, rest
from score import Piece, Section as S

FIG = ["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"]          # one even figure, one token varied
PIECE = Piece(
    "make-it-mine-r4", 60.0, land=56.0, peak=48.0, seed=41, touch=0.85,   # style="v2" is the default
    notes="one line for the report",
    sections=[
        S("playful", 7, bpm=120, accomp="figure", figure=FIG, pedal=False, drop=("answer", "air"),
          chords=[["Eb"], ["Eb"], ["Abmaj7"], ["Abmaj7"], ["Cm7"], ["Cm7"], ["Bbsus"]], label="the look"),
        S("playful", 8, bpm=120, start=14.0, accomp="figure", figure=FIG, pedal=False, add=("held",),
          drop=("answer", "air"), tune=[rest(1), write("Bb4/1 G5/1 F5/2 | Eb5/1 F5/1 G5/2 | ...")],
          chords=[...], label="the home"),
        ...
    ])
FILM = Film("make-it-mine-r4", PIECE, picture=[(0.0, "the look"), (14.0, "the home")], copy_to=None)
```

**Section fields**: `mood`, `bars`, `tune` (a list of segment names `"full"`, `"phrase1"`,
`"phrase2"`, `"signature"`, `"rest"`, and/or `motif.Phrase` objects, laid end to end; a Phrase
with a pick-up starts in the bar before, the previous section's last bar included), `start` (pin
to a time), `bpm` (**give every section a bpm**), `voice` (`"piano"`, `"violin"`, `"both"`),
`accomp` (`"figure"`, `"rolling"`, `"bounce"`, `"rocking"`, `"sparse"`, `"still"`), `add` / `drop` (layers
`answer`, `pizz`, `held`, `synth`, `sub`, `air`, `low`, `octaves`), `form`, `turn`, `lift`,
`into` (`"auto"`, `"blend"`, `"build"`, `"flow"`, `"pickup"`, `"drop"`, `"hold"`, `"breath"`),
`span`, `hold` (beats), `narration`, `level_db`, `ramp` (seconds the level_db change takes,
default 3) and `ramp_at` (`"centre"` on the change, `"after"` starting at it, `"before"` ending at
it), `dyn`, `chords` (one list per bar, one or two chord names), `label`; and the composing
controls: `counter` + `counter_voice`, `answer` (a Phrase, or `False`), `answer_skip` (bars where
the automatic answer is silent), `bass` (`"walk"`, `"pedal:Eb2"`, a Phrase), `vary`
({bar: `"thin"|"half"|"drop"|"bass"|"rest"|"full"`}), `density` (0-1), `register` (semitones),
`shape`, `broaden`, `push` (ms), `legato` (beats), `lead`, `pedal`; and **the figure** (round 8,
with `accomp="figure"`): `figure` (a bar of tokens, or a list of bars cycled: `b` the bass, held
to the next `b` or chord change; `1`-`9` the chord tones counted up from `fig_floor`; `r` a rest;
`-` holds the note before one more step; the tokens must fill 4 beats), `step` (beats a token:
0.5 eighths, 0.25 sixteenths, 1 quarters), `fig_floor` (a note, or a pair that opens the register
across the section), `fig_voice` (`"piano"`, `"pizz"`, `"synth"`), `fig_touch` (default 0.30).
`density`, `vary`, `register` and `pedal` act on the figure as on the other patterns; a written
`bass=` Phrase replaces its `b` tokens.

**Piece fields**: `name`, `length`, `sections`, `logo` (`"blend"`, `"quiet"` for a subtle film,
`"piano"`, `"none"` for a hand-on ending with no logo), `ending` (`"sigh"`: 4 beats, C6, B-flat,
then the logo; `"short"`: 2 beats, the logo's pick-ups over B-flat sus), `land`, `ending_start`
(avoid), `rit` (how much the ending slows, default 0.85; 1.0 = not at all), `seed`, `loudness`
(default -14 LUFS; -17 for a subtle film), `peak` (seconds), `speech` ([(t0, t1)], best from
`speech_from_words`), `mix` ({group: dB} trims, e.g. `{"counter": -2}`), `style` (`"v2"`; `"v1"`
only for the old pieces), `notes`; and the round-8 sound controls: `touch` (multiplies every
piano touch; 0.85 = softer, rounder, darker, same level), `tone` (dB of a high shelf at 3.5 kHz on
the music; -2 = darker), `air` (the master's air shelf in dB; default 11).

**Film fields**: `Film(name, piece, hits=[], picture=[...], copy_to=None, effects=None)`.
`picture` is also read by the `picture-sync` warning. `effects(music, plans, piece)` returns
`(audio array the length of music, report rows)`; use `films.place_effect` for each sound and
`films.soften` for pens. `films.speech_from_words(path, t_from, t_to=None, start_at=0.0, gap=0.2)`
turns a word-timing JSON into `speech` spans (all words to the end of the file unless `t_to`).
`films.speech_pace(speech, t0=None, t1=None)` gives her pace: `syl_per_s`, `syl_s`, and `bpm`
(the beat = two syllables); the note dump prints it.

**Phrases** (`src/motif.py`): `motif("bar1".."bar8" | "phrase1" | "phrase2" | "full" |
"signature" | "ending")`, `write("NOTE/BEATS ... | ...", pickup=0)` (`r` = rest, `~/2` = tie the
note before 2 beats longer, also across a bar line, `@0.8` = softer; every bar but the last must
add up to 4 beats, the first to `pickup` beats when given), `rest(n)`; methods `.up .down .octave
.aug .dim .shift (negative = a pick-up) .take .seq .invert .end_on .rhythm .fill .touch .bars`,
`a + b` (in sequence), `a & b` (together). Every note keeps its origin: plain tune notes are
checked note for note against the tune; developed and hand-written notes are counted.

**Timing to picture.** Every pinned time (each `start`, and `land`) splits the piece into spans;
inside a span every section's speed is scaled by the same factor so the span fills its time
exactly. The note dump prints each section's final speed and how far it moved: keep it within
about 5 % (change a bar count, add a `hold`, choose the ending's length, or set `rit`).

**Balance**: `mix.TARGET` (each instrument group's loudness while it plays: tune piano -19,
violin tune -17.5, counter-line -24.5, answer -24 ...), `Piece.mix` per piece, `mix.AIR_DB`,
`score.SHINE`, the moods' levels (`moods.py`), the lift (`blocks.LIFT`, `STRING_LIFT`), the
shapes (`blocks.SHAPES`). Narration: `level_db` per section (default -6 under `narration=True`)
with a 3 dB dip at 2.5 kHz, both changing over `ramp` seconds at section changes.

**Files**: `src/tune.py` (tune, answer, chords, voicings, `smooth_bass`) · `src/motif.py`
(phrases and development) · `src/moods.py` · `src/blocks.py` (blocks into notes; the composing
controls; the endings) · `src/score.py` (sections, timing, the players; `Band(dry=True)` logs
notes without sound) · `src/mix.py` · `src/measure.py` (mix checks) · `src/form.py` (composition
checks: `steady` first, then `symbolic` and `audio`; the bar table) · `src/notes.py` (`--notes`,
the note log, her pace and breaths) · `src/build.py`
(render and check; `mix_tests`) · `src/demos.py` · `src/films.py` (the old films, `Film`,
discovery of `film_<key>.py`, `speech_from_words`, `speech_pace`) · `src/engine/` (signal processing and
instruments; nothing in it can make a drum).
