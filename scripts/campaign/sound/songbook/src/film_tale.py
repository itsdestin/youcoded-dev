"""The fairytale, narrated stretch, third score (round 8): one quick, light plucked figure that runs
under her from the first frame to the purple quill at HER pace, dark and small before "wonderful",
the same figure turning major on "wonderful" without changing tempo, and the tune only twice, as
phrases above her voice.

WHY THIS REWRITE. The owner on round 7: "the music is very slow/steady, while the narrator is fast
fast ... the piano notes extremely inconsistent and oddly thrown in". Round 7 ran at 68.6 bpm and
dropped single piano notes into her breaths. This score does the opposite: a continuous bed at her
speaking pace, nothing placed in her gaps, the piano only as two whole phrases above her range.

WINDOW: film 0.0 -> 37.9 s (piece time = film time), the same stretch as round 7's tale.mp4.

TEMPO 137.14 bpm (one bar = 1.75 s). The note dump measures her pace over the piece at 4.59
syllables a second = 137.8 bpm (a beat per two syllables). 137.14 is 0.5 % under that and puts bar
lines exactly on 21.0 (page turn to the inkwell, just before "However,") and 24.5 ("wonderful", the
light warming purple). 24.5-31.6 is pinned to the quill and runs at 135.2 (a 1.4 % broadening on
"wonderful"); the quill's two bars keep 135.2 so nothing steps on the peak's downbeat.

THE FOUNDATION: plucked strings (fig_voice="pizz"), one figure for the whole piece,
"b 3 2 3 1 3 2 3" in eighths (4.6 attacks a second, her syllable rate): a plucked bass on each
downbeat, written between G2 and E-flat 3, then the chord's three lowest tones rocking. It sits
at C3-E-flat 3 (below her voice, F3-E5) until the quill, where its floor opens to B-flat 2-C3 and
it plays G3-B-flat 3 for the lift.

bar  time   her words                         chords         what changes (one thing at a time)
 1   0.0    For more than a decade...         Cm x2          the figure alone, dark and small
 3   3.5    ...your technology. They decided  Cm7/Bb x2      the bass falls by step: C B-flat A-flat
 5   7.0    ...what it would cost             Abmaj7 x2
 7  10.5    data. And we all accepted it      Fm/Ab x2
 9  14.0    We accepted... own                Cm x2
11  17.5    nothing, ...convenience.          G x2           the half close (the B natural pulls)
13  21.0    However, recently... something    Ab | Bbsus     held strings enter, low and slow (one
                                                             E-flat 3 bowed from 21.0 to 31.6); the
                                                             turn A-flat, B-flat out of minor
15  24.5    wonderful happened. Blinded by    Eb x2          WARM: the same figure in E-flat major;
                                                             the tune's first phrase G5 Ab5 Bb5 | G5
                                                             (26.72-29.4), above her
17  28.05   corporations created... a new     Cm7 | Bbsus    the tune rests; pick-up G5 at 31.16
19  31.6    artificial intelligence. A tech-  Abmaj7 | Eb/G  THE LIFT: the cell G5 -> E-flat 6 -> D6
                                                             (up a sixth, down a step), E-flat 6 on
                                                             the quill (31.60), then C6, B-flat 5;
                                                             the sub enters, the figure opens upward,
                                                             the level rises over 3.5 s
 end 35.15  ...would bring about a great      Ab | Bb        the sigh C6 B-flat 5, open B-flat rings on

Measured on the render (out/notes/fairytale-score-r3.txt): music alone bars -16.0 to -18.5 LUFS
before the quill, -13.6 to -14.4 from it (the lift +2.3 dB over the 4 bars before); 1 group for
bars 1-12, 2 from 21.0, 3 only while the tune plays; tone -34.2 dB above 4 kHz.
"""
import os

from films import Film, speech_from_words
from motif import write, rest
from score import Piece, Section as S

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "film", "src", "round2", "take1-words-lily.json"))
BPM = 137.143      # WHY: a beat at her stress rate, bar lines on 21.0 and 24.5 (see TEMPO above)

# WHY one figure for the whole piece: steadiness first. Plucked eighths at her syllable rate
# (4.6 a second), the bass on the downbeat and the chord's lowest tone on beat 3, the two middle
# tones rocking between: a quiet storybook walk that never stops and stays below F3 (her voice).
# Drafts: quarters ("b r 3 r 2 r 3 2") and eighths with a rest on beat 3 both measured 6-8 dB dips
# in 400 ms windows where a dry pluck was missing (level-rate failed): a plucked bed has to be
# continuous to read as one bed.
FIG = "b 3 2 3 1 3 2 3"

SPEECH = speech_from_words(WORDS, 0.0)     # WHY no t_to: every word she says

COMMON = dict(bpm=BPM, accomp="figure", figure=FIG, fig_voice="pizz", pedal=False, narration=True,
              answer=False, into="flow")
# WHY one shared broadened speed for the last two sections: the pin on 31.6 stretches 24.5-31.6 by
# 1.4 %; giving the quill section the same speed puts that step on "wonderful" (allowed) and none on
# the peak's downbeat
SLOWER = {**COMMON, "bpm": 135.2}

# ---- the tune: only two phrases, both above her voice (F5 and up), both on beats
# WHY a plain rising-then-settling phrase under "Blinded by their own hubris": the first time the
# piano speaks, 2.2 s after "wonderful", three even quarters and a held note, nothing in her breaths
PHRASE_WARM = rest(1) + write("r/1 G5/1 Ab5/1 Bb5/1 | G5/3 r/1 | r/3 G5/1")
# WHY the cell here and only here: the brand's "you-co-ded" (up a sixth, down a step) is the quill
# appearing; E-flat 6 is the piece's top note, then the line walks down by step to the open B-flat
PHRASE_QUILL = write("Eb6/2 D6/1 C6/1 | Bb5/3 r/1")

# ---- the bass: one plucked note on every downbeat, kept between G2 and E-flat 3
# WHY written out: left to the chord roots it jumped between C2 and B-flat 2, and the plucked
# cello's C2 and F2 measured almost no energy (1 % below 150 Hz) while A-flat 2 / B-flat 2 bars had
# 35-56 %: the foundation got louder and softer by up to 2.3 dB with the bass note under her words.
# Written as quarter notes so it is plucked (a long written bass is bowed and became a second,
# held layer). One register (98-156 Hz, also what a phone can play) keeps the floor even; it falls
# C B-flat A-flat, the minor lament, to G for the half close, then climbs A-flat B-flat into E-flat
# on "wonderful".
BASS_A = write("C3/1 r/3 | C3/1 r/3 | Bb2/1 r/3 | Bb2/1 r/3 | Ab2/1 r/3 | Ab2/1 r/3")
BASS_B = write("Ab2/1 r/3 | Ab2/1 r/3 | C3/1 r/3 | C3/1 r/3 | G2/1 r/3 | G2/1 r/3")
BASS_C = write("Ab2/1 r/3 | Bb2/1 r/3")
BASS_D = write("Eb3/1 r/3 | Eb3/1 r/3 | C3/1 r/3 | Bb2/1 r/3")
BASS_E = write("Ab2/1 r/3 | G2/1 r/3")

PIECE = Piece(
    "fairytale-score-r3", 37.9, land=36.98, rit=0.94, peak=31.6, seed=81, loudness=-16.0, logo="none",
    # WHY air=22: at the default the 8-16 kHz band sat 41-44 dB under the whole (the mix check
    # allows 38: muffled); a plucked bed has little top. WHY the tune -6 and the held strings -4 dB
    # from their usual levels: in a bed under her both are one voice among two, never a soloist
    touch=0.95, air=22, speech=SPEECH, mix={"lead": -6.0, "bowed": -4.0},
    notes="Fairytale opening under the narrator (film 0-37.9 s), round 8: one plucked figure at her pace "
          "(137 bpm), dark C minor before 'wonderful', the same figure opening into E-flat on 'wonderful', "
          "the tune twice as phrases above her, the cell landing E-flat 6 on the purple quill, open B-flat.",
    sections=[
        # WHY the figure alone for 6 bars: the dark, small opening; one group under her words
        S("hush", 6, fig_floor="G2", drop=("held", "air", "sub"), bass=BASS_A,
          chords=[["Cm"], ["Cm"], ["Cm7/Bb"], ["Cm7/Bb"], ["Abmaj7"], ["Abmaj7"]],
          level_db=-12.0, label="once upon a time (the figure alone)", **COMMON),
        # WHY no new layer here (the held strings wait for "However,"): drafted entering at bar 7,
        # they lifted the bar 2.4 dB under her words and dipped at every chord change; the
        # resignation moves only by its chords and the bass, down to the half close on G
        S("hush", 6, fig_floor="G2", drop=("held", "air", "sub"), bass=BASS_B,
          chords=[["Fm/Ab"], ["Fm/Ab"], ["Cm"], ["Cm"], ["G"], ["G"]],
          level_db=-12.5, label="we accepted", **COMMON),
        # WHY A-flat then B-flat sus: the songbook's way out of a minor key, so "wonderful" arrives
        # as the sun coming out on the next bar line, at the same tempo. WHY the held strings enter
        # here, not on "wonderful": their slow bow takes a bar to sound fully, and entering on 24.5
        # they made bar 16 rise 1.7-2.0 dB under her words (voice-steady); from 21.0 the rise is
        # spread over the turn and they are already there, warm, when the chords go major
        S("hush", 2, fig_floor="G2", drop=("air", "sub"), bass=BASS_C,
          chords=[["Ab"], ["Bbsus"]],
          level_db=-12.5, label="however (the turn)", **COMMON),
        # WARM: same figure, same tempo, now major; the tune's first phrase a bar later (bars
        # 16-17), above her range, then a one-note pick-up (G5, bar 18 beat 4) that belongs to the
        # quill's phrase. WHY the floor stays at G2 here: opened upward across these bars, the figure
        # climbed into G3-B-flat 3 and the phone band rose 4.4 dB under her words; the opening is
        # kept for the lift
        S("hopeful", 4, start=24.5, fig_floor="G2", drop=("air", "sub"),
          chords=[["Eb"], ["Eb"], ["Cm7"], ["Bbsus"]], tune=[PHRASE_WARM], lead=0.85, bass=BASS_D,
          level_db=-13.5, label="wonderful (warm)", **SLOWER),
        # THE LIFT on the quill: the cell G5 -> E-flat 6 -> D6 (up a sixth, down a step) lands its top
        # note on 31.6 and steps down D6 C6 B-flat 5 into the ending's sigh; the sub enters under it
        # and the figure's floor opens (B-flat 2 -> C3); level up 2.5 dB over 3.5 s, ending on 31.6
        # WHY the same bpm as the section before: no tempo step on the peak's downbeat
        S("hopeful", 2, start=31.6, fig_floor=("Bb2", "C3"), drop=("air",),
          chords=[["Abmaj7"], ["Eb/G"]], tune=[PHRASE_QUILL], lead=0.9, bass=BASS_E,
          level_db=-11.0, ramp_at="before", ramp=3.5, label="the quill (the lift)", **SLOWER),
    ])

FILM = Film("fairytale-score-r3", PIECE,
            picture=[(0.0, "top-hat men on servers"), (11.0, "page turn: i agree"), (21.0, "page turn: the inkwell"),
                     (24.5, "wonderful: the light warms purple"), (26.0, "cut: the corporations and the inkwell"),
                     (31.6, "the purple quill appears"), (37.9, "end (the story goes on)")],
            copy_to=None)
