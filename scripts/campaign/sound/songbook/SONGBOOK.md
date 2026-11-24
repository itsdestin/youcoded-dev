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
The first three scores written that way (round 7, 2026-11-23) passed every check and were still
read as one shape in one rhythm throughout; the owner asked for music that is "more
subtle/interesting/varied". The chapter and the checks were rewritten from what they taught:
rhythm and phrase entries, the drop, the arrival, plateaus, short films and narrators.

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

Any section can add or drop single layers, swap the accompaniment, or set its own speed.

## The rules (the owner's rulings, in his words where possible)

- **No drums, claps or clacks, ever**, no kick and no kit. Energy comes from instruments playing
  together. (Nothing drum-like exists in the songbook's code.)
- **Never a fake-out or a "thwip"**: "it sounds like a 2005 browser demo switching pages". No
  stops answered by a flourish; no zips, sweeps, whooshes or risers.
- **One piece of music per film**: "we cant *just* have notes, we need consistent
  tunes/strings/chords/etc." One song with a few spotted turns of feeling, never a new cue per shot.
- **No scattered high jingles.** A high part is a continuous line (the air layer, a held violin).
- **Under a narrator, the music's level does not bounce.** It is set by hand per section and
  changes only slowly, never with an automatic dip on every word. *This ruling is about ducking
  under a voice; it is not a rule against dynamics.* Musical swells and falls of 3-6 dB across
  phrases are wanted (see "Dynamics").
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
  or twice, not a compressed version of a long score.

## Composing a score

Read this whole chapter before writing a note. Every rule that can be a number is one, and
`render.sh --notes <film>` checks it in about a second (see "The hard limits").

**Passing every check is the floor, not the goal.** In round 7 (2026-11-23) three test scores
passed all 22 checks of the time, and the critics who read their notes still found what the
owner had heard in the first "Make it mine": one shape and one rhythm used throughout (21 of 21
tune bars starting on the downbeat; one bar rhythm 8 times; the cell moved up a step 11 times), a
"drop" with seven parts still playing in it, two passages on the same loudness for 30 s, and a
payoff that switched on everything at once. The checks have been sharpened to catch those, but
any check can be met without making music. The question is always the one in section 15.

### 1. Plan the whole arc from the picture, before any notes

1. **Spot it.** Watch the cut. Mark the 2-4 moments where the *feeling* changes (the problem,
   the turn, the payoff) and the one moment that is **the peak**: the frame where the payoff
   *image* is on screen, not the cut before it. Everything else (cuts, typing, a new screen,
   single words) the music does not follow.
2. **Draw the arc in five numbers per passage**: how loud (quiet / middle / full, in dB from the
   loudest bar), how high (the tune's median note and its top note), how busy (notes a bar), who
   leads (piano, violin, cello, a counter-line), and what the tune is doing (absent, fragment,
   developed, contrast idea, stated). The arc must *go somewhere*: at least one valley before the
   peak, the peak higher, louder and fuller than anything before it, then a settling into the
   logo. **Neighbouring passages differ by about 2 dB or more in level, or a fourth or more in
   the tune's median note**; two passages on the same level and register for 16 s are a plateau
   (the check fails it).
3. **Write through, not in loops.** A section is the next sentence of one story, not a block to
   repeat. Adding an instrument is not development (held, air, sub and synth never count as new),
   and neither is moving a bar up a step (the checks treat a bar with the same rhythm and
   intervals in another key as the same bar).
4. **Name the peak**: `Piece(peak=46.0)`. Check the picture's frame at that second before
   rendering.
5. **Write the plan into the film file's docstring, with seconds.** Then, before you report,
   compare every timed claim in it with the note log (`out/notes/<name>.log.txt`) and the
   loudness per bar. Round 7 had a comment claiming "-4 dB on the strike" where the audio was flat
   and the bar line was 0.22 s before the strike.

### 2. The tune: identity, not wallpaper

The three notes "you-co-ded" (B-flat, up to G, down to F) are the brand. Hearing them is the
point; hearing them *in the same rhythm* again and again, in any key, is a jingle.

- **The full opening bar, exactly as written**: at most once per 30 s, never in a film under 20 s
  (there the logo at the end *is* the statement).
- **The cell (up a sixth, down a step)**: at least once before the logo in any piece over 8 s.
  In one rhythm, at most **twice in any 20 s, in any key** (`cell-shape`); every other hearing
  changes its rhythm, its direction or where it sits in the bar. In a film under 20 s, at most
  **3 hearings in all, the logo counted**.
- **No bar of the tune more than twice the same.** "The same" includes *nearly* the same: three
  quarters of its notes on the same beats and pitches (one passing note added does not make a bar
  new). The third time, develop it.
- **No shape more than 3 times in 30 s**: a bar's rhythm and intervals moved to another key is the
  same shape (`tune-shapes`). A sequence (the idea a step higher) is a device for two or three
  hearings, then it must change.
- **A film opening on `motif("signature").octave(-1)`** has the same pitches as the second
  piano's low answer after the logo (B-flat 3, G4, F4). That makes a bookend; say in the plan
  whether you mean it.

**Ways to develop it** (each is one line of code, `src/motif.py`; chain them). The devices that
change *rhythm* or *direction* are the ones round 7 under-used:

| Device | Code | Use it for |
|---|---|---|
| New rhythm, same notes | `.rhythm([1.5, 0.5, 2])`, `.rhythm([0.5, 1.5, 2])` | the same words with a new accent: the first thing to reach for |
| Pick-up / delayed entry | `write("F5/1 \| Bb5/3 ...", pickup=1)`, `.shift(0.5)`, `.shift(-1)` | phrases that lean into the bar or breathe in after it |
| Tie over the bar line | `write("Ab5/2 \| ~/2 G5/2")` | a note that carries the phrase across the bar (syncopation) |
| Inversion: upside down | `.invert()` | the answer; a darker turn; a B idea |
| Augmentation / diminution | `.aug(2)`, `.dim(2)` | a calm held line; a playful quick echo |
| Fragment | `motif("signature")`, `motif("bar3").take(0, 2)` | busy picture, under a voice, a hint |
| Sequence | `motif("signature").seq(1, 2, every=4)` | building into a turn (two steps, not four) |
| Move along the scale | `.up(2)`, `.down(1)` | an answer phrase, *combined with a new rhythm* |
| New register | `.octave(-1)` (cellos, low piano), `.octave(1)` | contrast; save the top register for the peak |
| New ending | `.end_on("Eb5", 2)` | closed / open / deceptive phrase endings |
| Passing notes | `.fill()` | an ornament the second time round |
| Touch per note | `.touch(1.1, 0.8, 0.9)`, `@0.8` | shaping a phrase by hand (section 11) |
| Written by hand | `write("Bb4/1 G5/1 F5/2 \| r/2 Eb5/1 D5/1")` | a counter-line, a B idea |

### 3. Rhythm and phrase: where the music moves

The tune's rhythm, "long, long, longer, short", is the brand's accent, not a rule for every bar.

- **Vary the tune's rhythms**: at least 2 different one-bar rhythms in a 10 s film, 3 in 30 s,
  5 in 60 s, and no one rhythm in more than 3 bars of any 30 s (`tune-rhythms`). Ingredients:
  a note held over the bar line, a pick-up, two quick notes, a bar of one long note, a rest on
  beat 1.
- **Phrases do not all start on beat 1.** At most 70 % of the tune's entries (a note after a beat
  or more of silence) on the downbeat (`tune-entries`): start one on a pick-up, one on beat 2 or
  the off-beat. Aim for at least one note tied across a bar line in every 16 bars.
- **Two-bar ideas, four-bar phrases, and not always four.** A phrase is a call and a response;
  the response varies the call (new pitches *and* a changed rhythm or ending). Stretch one phrase
  to 3 or 5 bars (a held note, an answer bar) somewhere in any film over 30 s.
- **Phrases end; they are not cut.** End on a deliberate arrival: *open* (B-flat or D over
  B-flat: a question), *closed* (E-flat over E-flat: home) or *deceptive* (B-flat to C minor).
  Never three open endings in a row; at least one closed arrival before the logo in a film over
  30 s. Never `"phrase1:3"`: write a 3-bar phrase that ends.
- **A film over 30 s needs a second idea**, so the tune's return is heard as a return. **A B idea
  differs from the A idea in contour AND rhythm** (not the tune's rhythm on new notes: round 7's
  "contrast phrase" written that way was the cell transposed). For example: a falling line where
  the tune leaps, long notes where it skips, starting off the beat, in another register or another
  instrument (a cello or violin `counter`, or the second piano leading).

### 4. Harmony: harmonic rhythm and the wider vocabulary

- The home progression (E-flat, C minor, A-flat, B-flat) is the brand's floor. **It may not loop
  more than once in a row.**
- **Vocabulary** (all in `src/tune.py`, voiced for every pattern):
  - diatonic: `Eb`, `Cm7`, `Cm`, `Abmaj7`, `Ab`, `Fm7`, `Fm`, `Gm7`, `Bb`, `Bbsus`, `Bb7`,
    `Ab/Bb` (a soft dominant);
  - inversions, so the bass can walk by step: `Eb/G`, `Eb/Bb`, `Eb/D`, `Cm7/Bb`, `Ab/C`,
    `Fm/Ab`, `Bb/D`, `Cm/G` (an inversion now counts as the bass leaving the root);
  - borrowed colours, **once per film, as a surprise**: `Abm`, `Db`, `F7`, `G`. Their new note
    clashes with the tune's C (A-flat minor), D (D-flat), A-flat (F7) or B-flat/C (G); `clashes`
    fails a tune note on it. **The bass moves into and out of a borrowed chord by step** (D-flat
    to E-flat, D-flat over F to E-flat over G), never by a tritone or more.
- **Distinct chords**: at least `min(7, 3 + seconds / 15)`.
- **Harmonic rhythm in both directions** (`harmonic-rhythm`): no more than 12 bars running that
  each change chord exactly on the bar line; in a film over 30 s at least one chord held across a
  bar line (or a `pedal:` section) per 30 s. Two chords in a bar pushes; one chord for two bars
  breathes. Round 7: 23 of 27 bars changed chord on the bar line.
- **Cadences**: vary them. A deceptive cadence (B-flat to C minor) keeps a 60 s piece going.
- `tune.smooth_bass([...])` picks inversions so the bass moves by step; use it, then hand-edit.

### 5. Bass, inner voices and the counter-line

- **The bass is a line, not a list of roots**: at least once in every 8 bars a note that is not
  the chord's root (an inversion, a passing note, a pedal). Tools: `bass="walk"`,
  `bass="pedal:Eb2"`, or a `write(...)` Phrase.
- **Walk into a section change** (`into="pickup"`) instead of jumping to it.
- **Inner voices move by step or not at all, and a chromatic step is cut at the bar line**,
  never overlapped: a held note may not ring into a chord with a note a semitone from it
  (`held-clash`).
- **The tune is the top voice**: no held or backing note above a tune note as it starts, except
  the air line above C6 (`top-voice`). A low tune (an octave-down cell) needs its backing lowered
  (`register=-12`) or the held strings dropped (`drop=("held",)`).
- **No pitch struck in four parts at once** (`clutter`); the tune doubled in at most 3 voices.
  The synth doubling the rocking piano note for note is a doubling, not a layer.
- **The counter-line** (`Section.counter=write(...)`, `counter_voice=` `"cello"`, `"viola"`,
  `"violin"`, `"piano"`, `"pizz"`) lives below the tune (cello G2-G3, viola C3-C4) or far above it
  as a held line, never in the tune's octave. It **moves when the tune holds and holds when the
  tune moves**: more notes in the tune's rest bars than in its busy ones. It does not repeat one
  rhythm for more than 4 bars, does not double another part in unison for more than half its
  notes, does not start in unison with a held note, and two bowed voices within an octave never
  hold a minor second or major seventh for more than a beat. Bowed counter notes may be any
  length now (their swell is no longer flagged as a stray attack).
- **Voice leading at cadences**: no parallel octaves or fifths between the tune and the bass
  (the sub included); on the B-flat to E-flat arrival do not double D (the leading note) between
  the tune and the backing.
- **On a phone** a line that carries an idea (a walking bass, a counter-line) needs its
  fundamental above about 100 Hz (G2), or a double an octave up. No more than two instruments on
  one pitch below C2 at once; under a narrator, keep 80-250 Hz below what it is while she speaks.
  The bar table's `low%` column shows the energy below 150 Hz per bar.

### 6. Register: an arc, not only "save the top"

- **Save the top.** The tune's highest note (C6 in the written tune) is not heard before one bar
  ahead of the peak; the ending's sigh counts (`peak-saved`). **Keep a margin**: earlier lines
  stay a minor third or more below the peak's top note (G5 or A-flat 5 if the peak reaches C6);
  a peak that is one step above everything before it barely arrives (`peak-margin`, a warning).
- **The tune's median note moves from passage to passage**, and before the peak the tune leaves
  the piano's B-flat 4 to B-flat 5 octave at least once (lower, higher, or in another instrument).
- **The arrival**: the first tune note at the peak does not fall more than a fourth from the
  note before it, and it is the strongest note of its bar (`peak-arrival`). A note held into the
  peak resolves by step. Round 7: A-flat 5 fell a seventh onto the climax's downbeat.

### 7. Texture: hand over, never pile up

- **Each turn changes at least two of**: register, density, timbre (who leads), harmony,
  loudness. Adding a quiet layer alone does not count.
- **The accompaniment develops.** Within any 6 bars it plays at least one rhythm it has not
  played in the 8 bars before, and a thinner copy of an old rhythm (one part switched off) is not
  new (`backing-static`). Tools, bar by bar: `vary={4: "thin", 8: "drop"}` (`"thin"` = bass and
  downbeat chord only; `"half"` = beats 1 and 3; `"drop"` = stops at beat 3; `"bass"` = bass
  alone; `"rest"` = silence under the tune; `"full"`), `density=0.6`, `register=+12`, a change
  of pattern. A thinned rolling piano now alternates its fifth and tenth (it no longer collapses
  to one ticking note below `density=0.5`).
- **A blend has at most 1.2 x the notes** of the music either side (measured against the busier
  of the outgoing section and the incoming section's first four bars).
- **Do not keep one accompaniment rhythm for more than half a section** (round 7's home passage
  rolled the same figure in 4 of its 8 bars).

### 8. Rests, breath, the drop and silence

- **The tune rests at least one bar in every 8.** That bar is where the answer, the
  counter-line or the accompaniment alone speaks.
- **The drop before the lift is real**: in the two bars before the peak there is half a bar where
  at most **two instrument groups** sound (air and doublings aside; held strings and the sub
  count) (`drop-real`). `vary={n: "bass"}` alone leaves the held strings and the sub ringing:
  add `drop=("held", "sub")` on that section, or end the held line before it. Read the `parts`
  column of the bar table: it lists what *sounds*, not only what starts.
- **Silence is allowed** for a beat or two at a story turn, never as a fake-out.
- **Settle before the logo**: the bar before the ending is not the busiest of the piece
  (`settle`). When the picture goes to sparse type cards before the logo, thin the bar under the
  last line (`"half"` or `"thin"`) and let it fall 1.5-2 dB.

### 9. Dynamics: a shape, and the peak staged

- **A shape, not a ramp.** Per-bar loudness moves 4-14 dB across a piece of 20 s or more (3-14
  under 20 s), every bar counted. **No plateau**: no 16 s whose bars all sit within 1.5 dB,
  except under a narrator (`plateau`).
- **Shapes move the piano only about 10 x (f - 1) dB.** For real swells combine a `shape` with
  `density`/`vary`, a layer that leaves, a change of register, or `Piece(mix={...})` (each
  instrument group is levelled to a fixed loudness whenever it plays, so a softer touch on a
  whole sparse line is turned back up; `mix={"counter": -2}` moves the group itself).
- **The peak arrives**: its two bars at least 2 dB above the 4 bars before (2 bars before in a
  film under 15 s), the loudest bar at the peak or the logo.
- **Stage the peak; do not switch it on.** Bring in at most two new dimensions on its first bar
  (for example the lead voice and loudness) and the rest one bar later. A one-bar jump of over
  3 dB *and* over 2.5 x the notes *and* a brighter sound reads as a switch. Notes per bar at a
  peak rise about 1.5-2 x, not 3.5 x. In a subtle score, the payoff does not need the full
  triumphant kit or piano octaves: the bounce and one new voice may be the whole climax.
- **Touch follows the line**: a phrase's top note and its downbeat are not softer than their
  neighbours; a sigh's resolution (the appoggiatura's step down) is softer than the dissonance,
  and the accompaniment does not restrike under the resolution; short off-beat notes in bowed
  parts are never the loudest of their bar.
- **After the peak, let it settle** (`shape="fade"`) so the logo lands into space.

### 10. Turning the mood without a jolt

- One turn = one musical event, prepared: a blend over 1-2 bars (`into="blend"`/`"build"`) when
  the accompaniment changes; `into="pickup"` or `into="drop"` when it does not.
- The new section starts on a **new chord or a new register**, not just a new layer.
- Keep one thing constant across the join (a held note, the pulse, the tune's last note becoming
  the new section's first).
- **A borrowed chord at a turn resolves by step in the bass** (section 4).

### 11. Timing and touch (humanising)

- Every note is already a little early or late (5-7 ms) and a little softer or harder (3 %).
  That reads as flat: shape phrases by hand (`.touch(...)`, `@0.8`, `lead=`).
  - `broaden=0.02`: the last two beats of a section slow 2 % (a singer taking time).
  - `push=-8` (ms): the tune leans ahead (eager); `push=+10`: laid back.
  - `legato=0.15` (beats): singing overlap; `pedal=False`: dry.
  - `lead=0.85`: the tune a little more inward (subtle films).
- **Tempo**: no step over 2 % from one beat to the next, and **no step over 0.5 % on the peak's
  downbeat** (`tempo-steps`): pin only `land` when the peak section is short, and put a speed
  change a bar before the peak, not on it.
- **Compose at the picture's tempo.** When the editor gives a beat grid (own: 120 BPM), play at
  it or at a simple ratio (within 2 %), and land hits exactly or clearly apart: `picture-sync`
  lists picture moments the music misses by 40-150 ms (a near miss reads as sloppy sync).
  Shape points are in beats; once the fitting moves the beats, check a "drop on the strike"
  against the note log's seconds.

### 12. Under a narrator

- **Map her real words, all of them**: `Piece(speech=films.speech_from_words(<words.json>, t_from))`
  maps every word from `t_from` to the end of the file (pass `t_to` only to stop at the file's
  own end). `speech-covers` fails a map that stops while she still speaks inside the piece. A test
  mux plays her real voice track: never fade her out to make room for the music.
- **Her breaths are real**: gaps of 0.2 s or more are pauses (0.3 s used to be joined into
  speech). The note dump lists every breath with its bar and beat: place fragments **on her
  phrase ends**, not on the bar grid.
- **No melody in her range while she speaks**: no tune, answer or counter-line note between F3
  and E5 starts inside a spoken span. Her breaths are 0.3-0.4 s: room for one note, so **start the
  cell's first note in her breath and put the rest above E5** (G5, F5), or below F3. A note that
  starts in a breath and rings on into her next word still covers her: keep it short or high.
- **Light underneath**: at most 4 attacks a second while she speaks.
- **The level follows the story**: under her words the music rises no more than 1.5 dB from one
  bar to the next (`voice-steady`); "resigned" or "falling" sections do not get louder bar to bar.
  Swell in her pauses or after she stops, and **a swell meant to come after a word does not start
  under it**: give that section `ramp_at="after"` (its level change starts on its first beat, not
  1.5 s before) and a short `ramp=`.
- **The peak goes on the picture's moment of the feeling** (from the spotting), not on "the turn
  word + 1 bar". Check the frame at `peak` before rendering.
- **The mux** (not the score): under her words the music sits 10-14 dB below her in the phone
  band (above 300 Hz); in her pauses and after she stops, within about 3 dB of her speaking level.
  A flat mux gain shrinks every planned bloom.
- **A passage cut from the middle of a narrated film ends open**: `Piece(logo="none")` plays the
  ending's sigh over an open B-flat chord that rings on (a hand-on, no logo). The logo plays only
  where the picture shows the name.

### 13. Short films (under 20 s)

- **One idea, said once or twice, plus the logo.** A fragment of the cell, one turn, the logo
  (3 hearings of the cell at most, the logo counted). No full statement of the opening.
- **Land the logo on the editor's grid.** Count the beats to the name (land x bpm / 60) and fill
  them with bars of 4, a held chord (`into="hold"`, `hold=` beats) and an ending of 4 beats
  (`ending="sigh"`, the sigh C6, B-flat then the logo) or 2 beats (`ending="short"`, just the
  logo's two pick-ups over B-flat sus). `rit=` sets how much the ending slows (0.85 default;
  0.9-1.0 keeps a short film on the grid). Example, own (120 BPM, the name at 7.75 s = beat
  15.5): 3 bars (12 beats) + a 1.5-beat hold + the short ending (2) = 15.5, with `rit=1.0`.
- **Subtle** = fewer notes (`density=0.5`, `vary` with `"half"`/`"bass"`), `lead=0.85`,
  `Piece(loudness=-17)`, and **a subtle logo**: `logo="quiet"` (no plucked doubling, no low
  answer, a softer touch). In a subtle film the logo's first second is no more than 1 dB above
  the peak bar (`logo-gentle`), and nothing rises more than about 6 dB within half a second (the
  note dump's 400 ms curve; per-bar loudness averages a short film's shape away).
- **Something above middle C in the first 2 s**, and the opening light below 150 Hz
  (`phone-low`, a warning): social films are heard on phones first.

### 14. Sound effects (made per film)

A film that needs effects defines `effects(music, plans, piece)` in its own file and returns
(audio, report rows): make each sound there, place it with `films.place_effect(out, x, t, music,
rel_db)` and soften pens with `films.soften(x, lp_hz)`. Pens: low-passed at 3.5-4.5 kHz, rounded
pen-down and lift-off, 8-12 dB under the music; check `above_5k_db` in the report. Two strokes of
one gesture (down and back) may differ a little in tone, as a real hand does. Never read
`../sfx-kit/` for a new film.

### 15. Before rendering, and before reporting: read the notes

Read the bar table (`render.sh --notes <film>`) and the note log, and answer bar by bar:

- Where does the tune rest? Where does a phrase start off the beat, and where is a note tied over
  a bar line?
- How many different rhythms does the tune use? Name the bar where the contour is **not** the
  cell's.
- Which bar is the peak, what is its top note, and how far below it did everything before stay?
- What is new every 8 s, and is it a new *gesture* or the same one moved?
- Does the bass walk anywhere? Is there a chord held across a bar line?
- Which half bar is the drop, and what does the `parts` column say is still sounding there?
- Which two passages differ by 2 dB, and which by register?
- What sounds above the tune at any moment?
- Does every timed claim in your plan match the log's seconds?

If any answer is "nowhere" or "no", fix the score before rendering. Report notes and numbers;
nobody here can listen, so never say something sounds good.

## The hard limits (checked on every render and by `render.sh --notes`)

A piece FAILS if it breaks any of these; the report says where in plain words. **Warnings** are
printed and never fail: they need a musician's judgement. The older pieces (the demos, "Own
everything" and the first "Make it mine") are kept as the owner heard them and fail many: that is
the point of the checks.

| Check | Limit | Why this number |
|---|---|---|
| `bar-repeats` | a whole bar (tune, chords, bass, accompaniment, answer) heard at most 2 times | twice is statement and confirmation; a third identical bar is heard as a loop |
| `tune-bar-repeats` | a tune bar at most 2 times the same or *nearly* (3/4 of its notes) | one added passing note does not make a bar new |
| `tune-shapes` | one shape (rhythm + intervals, any key) at most 3 times in any 30 s | round 7: 11 transposed copies of one shape passed |
| `tune-rhythms` | at least min(5, max(2, seconds/12)) one-bar rhythms; none in more than 3 bars per 30 s | round 7: one rhythm in 8 bars, two rhythms covering 20 bars |
| `tune-entries` | at most 70 % of the tune's entries on beat 1 (4 or more entries) | round 7: 21 of 21 on the downbeat |
| `opening-statements` | the opening bar as written: 0 under 20 s, else 1 per 30 s (rounded) | the brand's strongest gesture; saved, it lands |
| `cell-same-form` | the cell in an identical form at most 3 times in any 30 s, the logo counted | identity yes, jingle no |
| `cell-shape` | the cell in one rhythm, any key, at most 2 times in any 20 s; under 20 s at most 3 in all with the logo | the critics heard 4 cells in 9 s where the old count said 2 |
| `cell-present` | at least 1 before the logo (pieces over 8 s) | it must still sound like us |
| `nothing-new` | at most 8 s with no new tune *shape*, chord or accompaniment rhythm | a bar moved up a step, or a part switched off, is not new |
| `new-shapes` (warning) | at least 40 % of tune bars bring a shape not heard before | 100 % "new" bars with the same gestures is churn, not development |
| `backing-static` | within any 6 bars, one accompaniment rhythm not heard (nor a fuller copy of it) in the 8 bars before | a groove may settle for a phrase and a half, then must move |
| `tune-breath` | at least 1 bar in every 8 with no tune note starting | a singer breathes; the answer needs the space |
| `chords-distinct` | at least min(7, 3 + seconds/15) different chords | one loop was half of what made the old film static |
| `chord-loop` | the chords may equal those 4 bars back for at most 4 bars running | one literal repeat of a progression, no more |
| `harmonic-rhythm` | at most 12 bars running of one new chord per bar line; over 30 s, a chord held across a bar line (or a pedal) per 30 s | round 7: 23 of 27 bars changed chord on the bar line |
| `bass-moves` | in every 8 bars, one bass note that is not the chord's root (inversions count) | a bass that only plays roots marks time |
| `clashes` | no tune note on a borrowed chord's clashing note | colour, not a wrong note |
| `held-clash` | no held, counter or answer note ringing into a chord a semitone away | a chromatic step is cut at the bar line |
| `peak-named` / `peak-saved` | `Piece.peak` set (over 12 s); the tune's highest note, the ending's included, not heard before one bar ahead of it | the old film gave away its top note at 2.5 s |
| `peak-margin` (warning) | earlier lines a minor third or more below the peak's top | a one-step climb barely arrives |
| `peak-arrival` | the first tune note at the peak falls no more than a fourth onto it | round 7: a seventh fell onto the climax |
| `drop-real` | over 20 s: half a bar with at most 2 groups sounding in the 2 bars before the peak | round 7 called a seven-part bar "the drop" |
| `settle` | over 20 s: the bar before the ending is not the busiest bar | the logo lands into space |
| `answer-collisions` | no answer note starting with a tune note | call and response, not two people talking at once |
| `top-voice` | no backing note above a tune note as it starts (air aside) | the tune on top by register, not only by loudness |
| `clutter` | no pitch struck in 4 or more parts at once | doublings blur; four is a pile |
| `blend-pileup` | a blend bar at most 1.2 x the notes of the busier side | the old blend made the bars before the payoff the busiest |
| `tempo-steps` | no step over 2 % between beats, 0.5 % on the peak's downbeat | the old ending lurched 4 %; a 1.7 % step landed on round 7's climax |
| `tempo-fit` | every section within 6 % of its own `bpm` | further, a bounce turns frantic or a hush falls apart |
| `idle-layers` | no layer switched on that the pattern never plays | a "strings join" that added nothing |
| `picture-sync` (warning) | picture moments hit (< 40 ms) or clearly left alone (> 150 ms) | near misses read as sloppy sync |
| `voice-room` | with `speech`: no melody note in F3-E5 starting while she speaks | her voice lives there |
| `voice-busy` | with `speech`: at most 4 attacks a second under her words | she must be easy to listen through |
| `speech-covers` | with a word file: every word inside the piece is in the map | a map that stopped early let two checks pass |
| `loudness-range` (audio) | per-bar loudness range 4-14 dB (3-14 under 20 s), every bar | the old film moved 2.8 dB in 54 s; over 14 is a jolt |
| `plateau` (audio) | no 16 s whose two-bar levels stay within 1.5 dB (narrated bars aside) | round 7: two passages within 1.4 dB for 32 s |
| `payoff-louder` (audio) | the peak's 2 bars at least 2 dB above the 4 bars before (2 under 15 s) | the old payoff arrived 1.7 dB *quieter* |
| `peak-loudest` (audio) | the loudest bar at the peak, or the logo | the climax is where the picture says |
| `logo-gentle` (audio) | loudness -16.5 or quieter: the logo's first second at most 1 dB over the peak bar | two subtle logos landed louder than their peaks |
| `voice-steady` (audio) | with `speech`: no rise over 1.5 dB from one bar to the next under her words | "the level does not bounce", now measured |
| `momentary-rise`, `phone-low` (warnings) | subtle films: no 6 dB rise in 0.5 s; under 45 % of the first bars' energy below 150 Hz | what bar averages and full-range speakers hide |
| `audio-nothing-new` (audio) | at most 12 s in which every bar is a near copy (0.975) of an earlier one | 0.985 let bars the critics heard as copies through |

The mix checks (loudness to the piece's own target, true peak, clipping, mono, bands, every tune
note on top at its pitch, the logo landing, every attack a note, no drum-like attack) now print in
every film's report too ("PASS/FAIL mix of ..."); the drum-like attack line names the instrument
that strikes there. The low band (40-80 Hz) may sit 3-12 dB below the total in a piece of -16 LUFS
or quieter (3-9 at full loudness).

## Three worked plans

**A 10 s typographic film, "subtle" (stark turning bright, one pen; the picture at 120 BPM, the
name at 7.75 s = beat 15.5).** 120 bpm, 3 bars + a 1.5-beat hold + `ending="short"`, `rit=1.0`,
`logo="quiet"`, `loudness=-17`. Bar 1 (0-2 s): `sparse`, the cell low *in a new rhythm*
(`motif("signature").octave(-1).rhythm([1.5, 0.5, 2])`), the held strings dropped so nothing sits
above it. Bar 2 (2-4 s, the strike): the tune rests; `vary={2: "bass"}`, `drop=("held",)`: the
valley; the pen. Bar 3 (4-6 s, the page turns): a new chord on the bar line (`Eb/G`), the cell a
step higher entering off the beat on the picture's line (`.up(1).shift(0.5)`), `density=0.5`. Hold
(6-6.75 s) on the peak's chord, then the logo's two pick-ups on the grid (7.25, 7.5) and the name
at 7.75. Peak: bar 3's top note or the hold, at least 2 dB over bar 2. Cell hearings: 3 with the
logo. Loudness range: about 4 dB.

**A 30 s passage under a narrator (resigned, then wonder), cut from a longer film.** About 10
bars at about 76, `hush`/`hopeful` with `accomp="still"`, then `"rolling"` at `density=0.5`.
`speech=speech_from_words(words, t_from)` (all her words to the piece's end). While she speaks:
held strings, the piano's chords, nothing between F3 and E5 starting; on each breath the note dump
lists, *one* note in her range (the cell's first), the rest above E5. Harmony one chord per two
bars with a falling bass (`Eb`, `Eb/D`, `Cm7`, `Cm7/Bb`, `Abmaj7`). The level falls or holds bar
to bar while she is resigned. At the turn word: `Db` resolving by step to `Eb/G`, the new section
`ramp_at="after"`, the strings open *after* the word. Peak on the picture's moment of wonder, in
her next pause or after she stops. Ending: `logo="none"` (the stretch hands on to the rest of the
film); the logo only if the name is on screen.

**A 60 s playful product film (three conversations).** 120 bpm, 28 bars, `land=56`. A (0-14 s,
quiet): the bounce at `density=0.6`; the cell once, then answered by a *different* rhythm (a
pick-up and a held note), never the same cell a step higher; the second piano echoes in the
rests. B (14-30 s, the home, middle level, the tune's median a fourth higher than A): a new
pattern; the first full phrase, its rhythm varied (one tie over a bar line, one entry on a
pick-up), *ending closed*; one chord held across a bar line. C (30-46 s, the money, 2 dB under B,
the tune lower or in the cellos): a B idea that differs in contour and rhythm (falling, long
notes, off the beat); new chords walking down; `Abm` or `Db` once; then the drop: half a bar of
the bass and one held note only (`vary={8: "bass"}` plus `drop=("held", "sub")`). D (46-54 s, the
payoff): at last the top register, arriving from below; the violin joins on its first bar, the
fuller texture a bar later (notes about 1.5-2 x C's); thin the last bar under "make anything...".
Ending: the logo, `land=56`, `ending_start` unpinned.

## How to work (the order)

1. Spot the picture; write the arc (section, seconds, loudness, register, density, lead voice,
   tune guise) in the film file's docstring.
2. Write the film file (`src/film_<key>.py`) with `peak=` and, if narrated, `speech=`.
3. `render.sh --notes <key>`: read the bar table, the breaths (narrated films) and the PASS/FAIL
   list. Fix the score until the symbolic checks pass. Seconds per run; do it many times.
4. Answer the questions in section 15 from the bar table and `out/notes/<name>.log.txt`.
5. `render.sh <key>`: renders and prints the mix checks and all composition checks, including the
   audio ones (out/films/<name>.checks.txt); the bar table gains loudness, phone-band loudness,
   low% and similarity per bar.
6. Report what the notes and the numbers show, and what you would still improve. Nobody here can
   listen: never say something "sounds" good.

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
- **The demonstrations** (`out/demo-*.wav`, `src/demos.py`): proofs of the blocks, not models of
  composition. `demo-playful`, `demo-hopeful`, `demo-stark-to-bright`, `demo-journey` (every mood
  in one song), `example-piano-ending`; `join-*.wav` are 10 s excerpts around their joins;
  `logo-alone.wav` is the piano-only logo file.

## What is still weak (honest)

- **Nobody has listened to anything made under the new rules.** The checks prove a score is not
  a loop and has a shape; they cannot prove it is beautiful. The owner's ear decides.
- **The checks can still be gamed.** Round 7 closed the commonest ways (a passing note, a bar
  moved up a step, a part switched off), but a determined composer can meet any number. The note
  dump and the note log are there so critics read the score itself.
- **Not yet checked, only written as guidance**: parallel octaves and fifths at cadences, the
  doubled leading note, touch (a phrase's top note softer than its neighbours), counter-line
  rhythm and unison rules, the voice-over-music margin in the mux (needs the voice file in the
  render), the low-register stacking rule. A critic must read for these.
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
accompaniment rhythm); with a narrator, her breaths with their bar and beat; after a render also
each bar's loudness, its phone-band (300 Hz-8 kHz) loudness, its share of energy below 150 Hz and
its similarity to the closest earlier bar) and `out/notes/<name>.log.txt` (**every note**:
seconds, bar and beat, group, part, what it is to the checks, pitch, beats, seconds, touch).

**A film in its own file**: `src/film_<key>.py` (key = short, lower case, e.g. `mim`). It is
found automatically; `render.sh <key>` renders every film it defines. It must expose `FILM`
(or `FILMS = [...]`). Film names must be new. Set `copy_to=None` until the owner picks it.

```python
"""Make it mine, third score: <one line on the idea>."""
from films import Film, speech_from_words, place_effect, soften   # what you need
from motif import motif, write, rest
from score import Piece, Section as S

sig = motif("signature")
PIECE = Piece(
    "make-it-mine-r3", 60.0, land=56.0, peak=46.5, seed=41,        # style="v2" is the default
    notes="one line for the report",
    sections=[
        S("playful", 7, bpm=120, tune=[rest(1), sig.rhythm([1.5, 0.5, 2]), rest(1),
                                       write("F5/1 | Eb5/2 ~/1 C5/1 | Bb4/4", pickup=1)],
          density=0.6, vary={4: "thin"}, answer_skip=(2,), label="the look"),
        S("playful", 8, bpm=120, start=14.0, tune=[...], chords=[["Eb/G"], ["Ab"], ["Ab"], ...], bass="walk",
          counter=write("r/2 G3/2 | Ab3/4 | ..."), shape="arch", into="pickup", label="the home"),
        ...
    ])
FILM = Film("make-it-mine-r3", PIECE, picture=[(0.0, "the look"), (14.0, "the home")], copy_to=None)
```

**Section fields**: `mood`, `bars`, `tune` (a list of segment names `"full"`, `"phrase1"`,
`"phrase2"`, `"signature"`, `"rest"`, and/or `motif.Phrase` objects, laid end to end; a Phrase
with a pick-up starts in the bar before, the previous section's last bar included), `start` (pin
to a time), `bpm` (**give every section a bpm**), `voice` (`"piano"`, `"violin"`, `"both"`),
`accomp` (`"rolling"`, `"bounce"`, `"rocking"`, `"sparse"`, `"still"`), `add` / `drop` (layers
`answer`, `pizz`, `held`, `synth`, `sub`, `air`, `low`, `octaves`), `form`, `turn`, `lift`,
`into` (`"auto"`, `"blend"`, `"build"`, `"flow"`, `"pickup"`, `"drop"`, `"hold"`, `"breath"`),
`span`, `hold` (beats), `narration`, `level_db`, `ramp` (seconds the level_db change takes,
default 3) and `ramp_at` (`"centre"` on the change, `"after"` starting at it, `"before"` ending at
it), `dyn`, `chords` (one list per bar, one or two chord names), `label`; and the composing
controls: `counter` + `counter_voice`, `answer` (a Phrase, or `False`), `answer_skip` (bars where
the automatic answer is silent), `bass` (`"walk"`, `"pedal:Eb2"`, a Phrase), `vary`
({bar: `"thin"|"half"|"drop"|"bass"|"rest"|"full"`}), `density` (0-1), `register` (semitones),
`shape`, `broaden`, `push` (ms), `legato` (beats), `lead`, `pedal`.

**Piece fields**: `name`, `length`, `sections`, `logo` (`"blend"`, `"quiet"` for a subtle film,
`"piano"`, `"none"` for a hand-on ending with no logo), `ending` (`"sigh"`: 4 beats, C6, B-flat,
then the logo; `"short"`: 2 beats, the logo's pick-ups over B-flat sus), `land`, `ending_start`
(avoid), `rit` (how much the ending slows, default 0.85; 1.0 = not at all), `seed`, `loudness`
(default -14 LUFS; -17 for a subtle film), `peak` (seconds), `speech` ([(t0, t1)], best from
`speech_from_words`), `mix` ({group: dB} trims, e.g. `{"counter": -2}`), `style` (`"v2"`; `"v1"`
only for the old pieces), `notes`.

**Film fields**: `Film(name, piece, hits=[], picture=[...], copy_to=None, effects=None)`.
`picture` is also read by the `picture-sync` warning. `effects(music, plans, piece)` returns
`(audio array the length of music, report rows)`; use `films.place_effect` for each sound and
`films.soften` for pens. `films.speech_from_words(path, t_from, t_to=None, start_at=0.0, gap=0.2)`
turns a word-timing JSON into `speech` spans (all words to the end of the file unless `t_to`).

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
checks, bar table) · `src/notes.py` (`--notes`, the note log, her breaths) · `src/build.py`
(render and check; `mix_tests`) · `src/demos.py` · `src/films.py` (the old films, `Film`,
discovery of `film_<key>.py`, `speech_from_words`) · `src/engine/` (signal processing and
instruments; nothing in it can make a drum).
