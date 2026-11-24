"""The fairytale, narrated stretch, fourth score (round 8 fix pass): one light plucked oom-pah at
HER pace and IN STEP with her, a plucked bass on every beat and soft plucked chord tones between,
dark C minor until "However,", the felt piano entering there as a slow left hand and staying, the
same figure turning to E-flat on "wonderful" without changing speed, and the tune once, as one
joined line above her that peaks on the quill.

WHY THIS VERSION. The owner on round 7: "the music is very slow/steady, while the narrator is fast
fast ... the piano notes extremely inconsistent and oddly thrown in". The first round-8 score ran at
her average speed (137) but on its own clock: her stressed syllables fell on its beats no more often
than chance (critic: 26 % within 60 ms against 27 % at random), its bass marked only beats 1 and 3 in
7 of 18 bars (a felt 68.6 bpm, the rejected speed), and the piano came and went three times in 10 s.

WINDOW: film 0.0 -> 37.9 s (piece time = film time), the same stretch as round 7's tale.mp4.

TEMPO: A MAP TAKEN FROM HER VOICE, not one number. Her syllables were measured from the voice file
(energy in 300-3000 Hz, a peak per syllable, a stress where it is 1.5 dB or more above its
neighbours: 141 syllables, 62 stresses before 38 s), then a search over bar lengths (every bar 1.59-
1.72 s, a change of at most 1.3 % between neighbouring bars) chose the bar lines that put the most
stresses on a beat, with two bar lines held exactly on her words: "HOW-ever" (vowel at 21.17; the
word file says 21.38, 0.21 s late) and "WON-derful" (vowel at 24.495). It opens fastest, as she
does (5.4 syllables a second in the first sentence):

  bars 1-5    150.0 bpm   0.00-8.00   "For more than a decade ... They decided what your computers could do"
  bar  6      148.1       8.00        (easing, 1.3 %)
  bar  7      146.3       9.62        (easing, 1.2 %)
  bars 8-12   145.5       11.26       "And we all... accepted it. We accepted ..."
  bar  13     143.7       19.51       "... the cost of convenience."
  bars 14-15  144.1       21.17       "However, recently... something truly"   (pinned on HOW-)
  bars 16-23  143.7       24.50       "wonderful happened ..." to "treasure:"  (pinned on WON-)

Measured on the rendered note log against her 62 stresses (scratch analysis): 41 % within 60 ms of
a beat against 30 % for the same beats shifted at random (1.37 x), 48 % against 39 % within 80 ms,
and no better than chance within 100 ms (49 / 49). The first round-8 score: 26 % against 27 % at
60 ms. Speech is not periodic: a free search with no pinned words reached 1.4 x at 80 ms at best.

THE FOUNDATION (one group, the whole piece): plucked strings in eighths, an oom-pah. The plucked
cello bass on EVERY beat (written: the root on 1 and 3, a lower chord tone on 2 and 4, accented
1 > 3 > 2 = 4), so the beat is felt at her speed in every bar; the violas' chord tones on the
half-beats only, lighter, from B-flat 2 up (E-flat 3 / G3 in C minor, contour turned over every
other bar), the last half-beat left out so each bar breathes into the next downbeat. Roots G2-E-flat 3,
the light low notes D2-B-flat 2. Under it a soft sine sub on the chord roots, and above it a faint
held violin (E-flat 6, D6 on G), both on from the first bar and never entering.

bar time   her words                        chords        one change at a time
 1   0.00  For more than a decade, a small  Cm  Cm        the figure alone, dark and small
 3   3.20  ... how you interact with your   Cm7/Bb x2     the bass falls by step
 5   6.40  what your computers could do     Abmaj7 x2
 7   9.62  ... personal data. And we all    Fm/Ab x2
 9  12.91  accepted it. We accepted that    Cm  Cm
11  16.21  everything and own nothing       Ab | Fm/Ab
13  19.51  the cost of convenience.         G             the half close
14  21.17  However, recently...             Ab | Bbsus    THE PIANO ENTERS: a soft pedalled left hand,
                                                          two half notes a bar, G2-E-flat 3, to the end
16  24.50  wonderful happened. Blinded      Eb  Eb/G      WARM: the same figure in E-flat major
17  26.17  by their own hubris, these       (Eb/G)        the tune: one joined line, G5 Ab5 Bb5 | C6 Bb5
18  27.84  corporations created a new       Ab              Ab5 | Bb5 F5 | G5 -> Eb6 (the cell) D6 C6 |
19  29.51  kind of technology:              Bbsus           Bb5, 26.59 -> 34.1 s, all on beats, F5-Eb6
                                                          (level step 1 of the lift, about +1 dB)
20  31.18  artificial intelligence.         Abmaj7        THE PEAK: E-flat 6 on beat 2 = 31.595 = her
                                                          "AR-tificial" (31.62) and the quill (on
                                                          screen between 31.55 and 31.75); level
                                                          step 2; peak bars +1.6 dB over the 4 before
21  32.85  A technology they believed       Eb/G
22  34.52  would bring about a great        Ab            the tune rests; the figure carries on
23  36.19  treasure:                        Bbsus         the figure runs to the end of the window
                                                          (the short ending would start at 37.86)

Measured on the render (out/notes/fairytale-score-r4.txt, out/films/fairytale-score-r4.checks.txt):
every composition and mix check passes; 162 attacks before 37.9 s, 8-10 in every 2 s, longest gap
0.42 s (round 7: 50 attacks, 1-5 per 2 s, gaps of 2.19 s); 4 kHz and up -28.2 dB of the whole
(round 7 -21.1); bar loudness -17.7 to -14.6 LUFS, at most 4.7 dB within a second. In the owner's
mux (music 10 dB under her voice) her voice is 15.0 dB above the music in 300 Hz-8 kHz over her
speech, every 1.67 s window 10 dB or more except 31.7-33.4 s (8.1 dB: the peak, where she speaks
softly).
"""
import os

from films import Film, speech_from_words
from motif import write, rest
from score import Piece, Section as S

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "film", "src", "round2", "take1-words-lily.json"))
SPEECH = speech_from_words(WORDS, 0.0)     # WHY no t_to: every word she says

# WHY these two pins: measured vowel onsets in the voice file (the word file is up to 0.2 s off).
# The turn chords land with "HOW-ever" and the warm E-flat with "WON-derful".
T_HOWEVER = 21.17
T_WONDERFUL = 24.50
# WHY land after the window: the last bar of the figure then runs to the end of the 37.9 s excerpt
# (it is cut from the middle of the film, her sentence carries on), and the ending's held chord
# would only start at 37.86, inside the final fade. 24.50 + 8 bars + 2 beats at 143.7 bpm.
LAND = T_WONDERFUL + 8 * 4 * 60 / 143.7 + 2 * 60 / 143.7
# WHY the file runs 2.8 s past the landing (to 40.4 s; the film window is 0-37.9 s): the music must
# not end inside the window (her sentence goes on), and the level checks read up to the landing,
# so a file that stopped at 37.9 measured its own 1 s end fade as a 19 dB lurch. The mux for the
# owner cuts the music at the window's end with a short fade, as the film edit will.
LENGTH = 40.4

# ---- THE FOUNDATION. WHY "b 2 b 3 b 2 b -": the bass (written below, one plucked note per
# beat) is the pulse at her speed in every bar; the chord tones only on the half-beats keep the
# eighths light; the last half-beat is left out (the bass rings through it) so each bar breathes
# into the next downbeat and the attacks stay at 4.2-4.4 a second (eighths all through at 150 bpm
# were 5.2 a second: over the bed limit). WHY tones 2 and 3, never 1: from B-flat 2 the first
# chord tone is often the bass note itself (C3 under C minor), and the figure turned into one
# pitch ticking. Two bars cycled, the contour turned over (E-flat G E-flat / G E-flat G in C minor).
FIG = ["b 2 b 3 b 2 b -", "b 3 b 2 b 3 b -"]
FLOOR = "Bb2"
# WHY 0.22 (the default is 0.30): the half-beat notes are lighter than the bass's strong beats
# (pizz velocity = 0.22 x 1.6 = 0.35 x dyn against the bass's 0.32-0.42 x dyn), so the ear
# follows the beat and the half-beats are the lilt
FIG_TOUCH = 0.22

# WHY one dyn for every section: the hush and hopeful moods play at 0.74 and 0.88, so the figure
# plucked 19 % harder on "wonderful" (round 8, first score: attacks harder right on "wonderful
# happened"). The warmth comes from the chords and the piano, not from plucking harder.
DYN = 0.8
COMMON = dict(accomp="figure", figure=FIG, fig_voice="pizz", fig_floor=FLOOR, fig_touch=FIG_TOUCH,
              pedal=False, narration=True, answer=False, into="flow", dyn=DYN,
              drop=("held", "answer"))

# ---- THE BASS: a plucked cello note on every beat, root on 1 and 3, a lower chord tone on 2 and
# 4 (oom-pah), accented like a hand (1 strongest, 3 next, the low notes lightest).
# WHY every beat: the first round-8 score put the bass on beats 1 and 3 only in 7 of 18 bars, a
# felt half-speed pulse (68.6 bpm, the speed he rejected). WHY the roots all in G2-E-flat 3: one
# register for the strong beats, so the floor neither swells nor thins with the chord, and their
# fundamental is what a phone can play; the light low notes (D2-B-flat 2) only add depth.
ACC = (0.72, 0.55, 0.65, 0.55)
BASS = {"Cm": ("C3", "G2"), "Cm7/Bb": ("Bb2", "G2"), "Abmaj7": ("Ab2", "Eb2"), "Fm/Ab": ("Ab2", "F2"),
        "Ab": ("Ab2", "Eb2"), "G": ("G2", "D2"), "Bbsus": ("Bb2", "F2"), "Eb": ("Eb3", "Bb2"),
        "Eb/G": ("G2", "Eb2")}


def bass_for(chords):
    """The bass line for a list of one-chord bars: root, low, root, low."""
    out = []
    for (c,) in chords:
        root, low = BASS[c]
        out.append(" ".join(f"{n}/1@{a}" for n, a in zip((root, low, root, low), ACC)))
    return write(" | ".join(out))


# ---- THE PIANO from "However,": the person, entering as a soft left hand (two half notes a bar,
# G2-E-flat 3, below her voice) and staying to the end, so the tune later comes out of an
# instrument that is already playing. WHY not before: the opening is the dark, small part.
PIANO_TURN = write("Ab2/2 C3/2 | Bb2/2 Eb3/2")
PIANO_WARM = write("Eb3/2 Bb2/2 | G2/2 Bb2/2")
PIANO_RISE = write("Ab2/2 C3/2 | Bb2/2 Eb3/2")
PIANO_LIFT = write("Ab2/2 Eb3/2 | G2/2 Bb2/2 | Ab2/2 C3/2 | Bb2/4")

# ---- THE TUNE: one joined line, F5-Eb6 (above her voice), every note on a beat, 26.6-34.5 s.
# WHY one line and not two phrases: the first score's two phrases left a 1.8 s piano hole and a
# lone pick-up note. Here each note starts within a beat of the last one's end (the breath before
# the cell is one beat), so it is heard as one sentence: rise, settle, then the cell
# G5 -> E-flat 6 -> D6 (up a sixth, down a step) with E-flat 6, the top note, on the quill.
TUNE_WARM = rest(1) + write("r/1 G5/1 Ab5/1 Bb5/1")
TUNE_RISE = write("C6/2 Bb5/1 Ab5/1 | Bb5/2 F5/1 r/1")
TUNE_LIFT = write("G5/1 Eb6/1 D6/1 C6/1 | Bb5/3 r/1")


def sec(mood, chords, level_db=-12.5, **kw):
    """One section of the bed: its bars are its chords, its bass the oom-pah under them."""
    # WHY add the sub in every section: the hush mood has none, so it would "enter" on "wonderful"
    return S(mood, len(chords), chords=chords, bass=bass_for(chords), level_db=level_db, add=("sub", "air"),
             **COMMON, **kw)


PIECE = Piece(
    "fairytale-score-r4", LENGTH, land=LAND, rit=1.0, ending="short", peak=31.60, seed=83,
    loudness=-16.0, logo="none",
    # WHY air=17 and a faint held violin ("air" layer, -13 dB) from the first bar: a dry plucked
    # bed has almost nothing above 8 kHz (39.7 dB under the whole; the mix check allows 38), and
    # lifting it with the air shelf alone (22-27 dB) made the bare cello plucks read as noise-like,
    # drum-like attacks (flatness 0.13-0.18, limit 0.1). A quiet held high note gives the top real
    # pitch instead (flatness 0.075). WHY the tune -12 dB: under her it is one voice among two,
    # never a soloist, and at -6 the peak bar left her only about 2 dB over the music in the phone
    # band. WHY the piano's left hand -9 and the plucks -2.5: the bed is almost all 80-250 Hz and the
    # mix check wants that band at least 3 dB under the whole. WHY the sub on from the first bar
    # (-9 dB): without it 40-80 Hz sat 18 dB under the whole (the check wants 3-12); on from the
    # start it never "enters", so it is weight, not a fourth layer arriving
    touch=0.9, air=17, speech=SPEECH, mix={"lead": -12.0, "counter": -9.0, "sub": -9.0, "air": -13.0, "pizz": -2.5},
    notes="Fairytale opening under the narrator (film 0-37.9 s), round 8 fix pass: a plucked oom-pah "
          "on a tempo map taken from her stressed syllables (150 easing to 143.7 bpm), the bass on "
          "every beat, the felt piano entering on 'However,' as a left hand, E-flat on 'wonderful' "
          "at the same speed, the tune once as one line peaking E-flat 6 on the quill.",
    sections=[
        # WHY six sections before "However,": they only carry the tempo map (150 -> 143.7, never
        # more than 1.3 % between neighbouring bars); the music runs straight through them
        sec("hush", [["Cm"], ["Cm"], ["Cm7/Bb"], ["Cm7/Bb"], ["Abmaj7"]], bpm=150.0,
            label="once upon a time (the figure alone)"),
        sec("hush", [["Abmaj7"]], bpm=148.1, label="(easing)"),
        sec("hush", [["Fm/Ab"]], bpm=146.3, label="(easing)"),
        sec("hush", [["Fm/Ab"], ["Cm"], ["Cm"], ["Ab"], ["Fm/Ab"]], bpm=145.5, label="we accepted"),
        # the half close on G: its B natural pulls toward "However,"
        sec("hush", [["G"]], bpm=143.7, label="the cost of convenience (half close)"),
        # THE TURN on "HOW-ever": A-flat, B-flat sus (out of the minor key); the piano enters
        sec("hush", [["Ab"], ["Bbsus"]], start=T_HOWEVER, bpm=143.7, counter=PIANO_TURN,
            counter_voice="piano", label="however (the turn, the piano enters)"),
        # WARM on "WON-derful": the same figure, the same speed, in E-flat; the tune from bar 17
        sec("hopeful", [["Eb"], ["Eb/G"]], start=T_WONDERFUL, bpm=143.7, counter=PIANO_WARM,
            counter_voice="piano", tune=[TUNE_WARM], lead=0.85, level_db=-14.3,
            label="wonderful (warm, the tune)"),
        # THE LIFT in two steps of about 1 dB (bars 18 and 20). WHY two sections: one level change
        # lands within about a bar whatever its ramp, and a single +2 dB step under her words
        # broke voice-steady (+1.7-1.8 dB in one bar); two smaller steps keep each bar under +1.5
        sec("hopeful", [["Ab"], ["Bbsus"]], bpm=143.7, counter=PIANO_RISE, counter_voice="piano",
            tune=[TUNE_RISE], lead=0.85, level_db=-13.0, label="(rising)"),
        # THE PEAK: the cell's E-flat 6 on beat 2 (31.60), her "AR-tificial" and the quill
        sec("hopeful", [["Abmaj7"], ["Eb/G"], ["Ab"], ["Bbsus"]], bpm=143.7, counter=PIANO_LIFT,
            counter_voice="piano", tune=[TUNE_LIFT], lead=0.85, level_db=-11.7, ramp_at="centre",
            ramp=2.0, label="the quill (the lift)"),
    ])

# WHY these picture times: hard cuts measured in the picture (frame-difference spikes), so the
# picture-sync report reads the real film, plus the two sung moments
FILM = Film("fairytale-score-r4", PIECE,
            picture=[(0.0, "top-hat men on servers"), (6.73, "cut"), (7.93, "cut"), (9.37, "cut"),
                     (11.07, "page turn: i agree"), (13.07, "cut"), (14.10, "cut"), (17.17, "cut"),
                     (19.27, "cut"), (20.93, "page turn: the inkwell"), (24.50, "wonderful: the light warms purple"),
                     (26.23, "cut: the corporations and the inkwell"), (31.60, "the purple quill appears"),
                     (33.30, "cut"), (36.07, "cut"), (37.9, "end (the story goes on)")],
            copy_to=None)
