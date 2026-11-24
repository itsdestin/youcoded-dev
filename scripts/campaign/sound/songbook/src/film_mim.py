"""Make it mine, fourth score (round 8): one soft piano figure from the first beat to the name,
the tune three times as short phrases, held strings coming and going, one gentle lift at 46-48 s.

WHY written afresh: the owner heard round 7 (make-it-mine-r3) as "still too busy/harsh". Its notes
showed the backing stopping for 2-4 beats seven times, 4 to 22 notes a bar, up to five groups at
once (tune, second piano, rolling piano, held strings, sub), a walking bass, a cello B idea and a
violin climb in 60 s, and piano touch up to 0.69. This score keeps ONE idea and very few layers:
light, friendly, unhurried but moving.

TEMPO: 120 bpm, a bar = 2.0 s. WHY: the picture turns at 14, 30, 46 and 54 s and the name lands at
56 s; at 120 every one of those is a bar line (bars 8, 16, 24, the ending bar, and its last beat),
so no section is stretched and nothing in the music has to land off the grid.

THE FOUNDATION: a soft, pedalled felt-piano figure: one long note, then even eighths,
"b - 3 2 4 3 2 3" in eighths (the bass on beat 1 held under the bar, then chord tones on every
eighth from beat 2: 7 attacks a bar = 3.5 a second). It runs in every bar, reading each chord, so the
harmony moves while the pattern stays the same. One token changes every second bar from the home on
(the last "3" becomes a "4"), and at the lift its register opens upward (fig_floor G3 -> C4).

THE PICTURE and what changes (one thing per turn):
  0-14   A the look (bars 1-7): the figure alone for two bars; the tune's opening bar as written at
         4 s (the cell: B-flat up to G, down to F), answered by a falling bar, then the figure alone.
         A chord a bar: Eb | Abmaj7 | Eb/G | Abmaj7 | Cm7 | Fm7 | Bbsus.
  14-30  B the home (bars 8-15): the held strings enter (the one change). The tune's second phrase
         at 20-28 s, rising to A-flat and hanging open on F. Chords Eb | Eb/G | Abmaj7 | Ab/C |
         Cm7 | Fm/Ab | Bbsus | Bb (the bass moves by step through inversions).
  30-46  C the money (bars 16-23): the held strings leave (the one change): piano alone, a little
         quieter, the chords darker: Cm7 | Cm7/Bb | Abmaj7 | Abmaj7 | Fm7 | Fm/Ab | Gm7 | Bbsus. No tune: the valley.
  46-54  D the payoff (bars 24-27): THE LIFT, staged over two bars: the held strings return, the
         figure's register opens, the level rises ~2 dB, and the third phrase climbs from E-flat
         at 46 to the tune's top note, C6, at 48.0 (the peak), then falls home under the last lines.
  54-56  the quiet ending (the sigh, the logo's three notes), the name at 56.0.

Layers: figure alone, or figure + tune, or figure + held strings, or all three (the lift and the
home phrase). The soft sub sits under B, C and D as weight (not counted as a layer). No second
piano, no air line, no counter-line, no bass line of its own.
"""
from films import Film
from motif import write
from score import Piece, Section as S

# WHY one figure with one token varied on alternate bars: a steady pattern the ear can settle
# into, but not a literal two-bar loop; the variant lifts the third note a step in the chord
# (round-8 render 2: a held quarter on beat 3 left one note decaying alone, a 3-4 dB hole in every
# bar; the long note now sits on beat 1 with the bass, so beats 2-4 run in even eighths)
FIG = "b - 3 2 4 3 2 3"
FIG_B = ["b - 3 2 4 3 2 3", "b - 3 2 4 3 2 4"]
# WHY the soft sub from the home on (B, C, D; not A): without it 40-80 Hz sat 17 dB under the whole
# (the mix floor is 12); it is round weight with no rhythm and does not count as a layer
# WHY common to every section: one soft figure, no automatic answer (its 2-note replies are the
# "thrown in" notes), so only the figure, the tune and (sometimes) the held strings ever sound.
# WHY pedalled: dry, each eighth stopped after 0.25 s; pedalled to the chord change the figure
# rings into one soft bed (measured, the pedal alone did not cure the 8.6 dB dip; the figure
# change above and the sub did)
COMMON = dict(bpm=120, accomp="figure", pedal=True, fig_touch=0.28, answer=False)

# A: the opening bar as written once (the cell), answered by a falling bar, then space
A_TUNE = write("r/4 | r/4 | "
               "Bb4/1 G5/1 F5/1.5 Eb5/0.5 | "     # bar 3 (4.0 s): you-co-ded, then home
               "C5/1 Eb5/1 Bb4/2 | "              # bar 4: a falling answer over A-flat
               "r/4 | r/4 | r/4")
# B: one rising phrase from the pick-up on beat 3 of bar 11, hanging open on F
B_TUNE = write("r/4 | r/4 | r/4 | "
               "r/2 Eb5/1 F5/1 | "                # bar 11 (20.0 s, the home page): a pick-up
               "G5/2 Eb5/1 C5/1 | "               # bar 12: over C minor
               "Ab5/2 G5/1 F5/1 | "               # bar 13: up to A-flat, the highest yet
               "F5/4 | "                          # bar 14: hangs open on F over B-flat sus
               "r/4")
# D: climbs to the saved top note at the peak (48.0 s), falls home
D_TUNE = write("Eb5/1 F5/1 G5/1 Ab5/1 | "         # bar 24 (46.0): the climb, under the lift
               "C6/2 Bb5/1 Ab5/1 | "              # bar 25 (48.0, THE PEAK): C6, saved for here
               "G5/2 F5/1 Eb5/1 | "               # bar 26: falling home
               "F5/2 r/2")                        # bar 27: and space before the ending's sigh

PIECE = Piece(
    "make-it-mine-r4", 60.0, land=56.0, peak=48.0, seed=41, logo="quiet", loudness=-16.0,
    # WHY touch 0.85: "harsh" was a hard touch; this keeps the felt piano on its soft sample.
    # WHY tone=+1.5 (a slight lift, not a cut): measured without it, 4 kHz and up sat at -37.7 dB
    # (darker than the guide's -36 "muffled" floor) and 8-16 kHz failed the air check at -38.7
    touch=0.85, rit=0.95, tone=1.5,
    # WHY the tune 3.5 dB down: in a bed it is one voice of two, not a soloist (as example-bed)
    # (-3.5 and the sub -3 measured: at -2 the tune's first note at 4.0 s rose 7.9 dB within a
    # second over the bed; at 0 the sub put 40-80 Hz only 5 dB under the whole, a heavy floor)
    mix={"lead": -3.5, "sub": -3.0},
    notes="Make it mine, fourth score: one soft, pedalled piano figure (a long note, then eighths) from the "
          "first beat to the name, the held strings entering at the home and leaving for the money, "
          "the tune three times as short phrases, one gentle lift at 46-48 s to C6, the quiet logo.",
    sections=[
        S("hopeful", 7, **COMMON, figure=FIG, chords=[["Eb"], ["Abmaj7"], ["Eb/G"], ["Abmaj7"], ["Cm7"], ["Fm7"], ["Bbsus"]],
          tune=[A_TUNE], lead=0.85, drop=("air", "held", "sub"), level_db=-2.0, into="flow",
          label="A the look"),
        S("hopeful", 8, **COMMON, start=14.0, figure=FIG_B,
          chords=[["Eb"], ["Eb/G"], ["Abmaj7"], ["Ab/C"], ["Cm7"], ["Fm/Ab"], ["Bbsus"], ["Bb"]],
          tune=[B_TUNE], lead=0.85, drop=("air",), level_db=-1.0, into="flow", label="B the home"),
        S("hopeful", 8, **COMMON, start=30.0, figure=FIG_B,
          chords=[["Cm7"], ["Cm7/Bb"], ["Abmaj7"], ["Abmaj7"], ["Fm7"], ["Fm/Ab"], ["Gm7"], ["Bbsus"]],
          drop=("air", "held"), level_db=-2.0, into="flow", label="C the money"),
        # WHY the lift is several things on one bar line, staged by a 3 s ramp and a shape: the one
        # place the guide allows it; strings, register and level grow together into 48
        S("hopeful", 4, **COMMON, start=46.0, figure=["b - 3 2 4 3 2 4", "b - 3 2 5 4 3 4"], fig_floor=("G3", "C4"),
          chords=[["Eb"], ["Abmaj7"], ["Eb/G"], ["Fm7"]], tune=[D_TUNE], lead=0.9, drop=("air",),
          level_db=0.5, ramp=3.0, ramp_at="after", shape=[(0, 0.95), (4, 1.08), (10, 1.05), (16, 0.95)],
          label="D the payoff"),
    ])

FILM = Film("make-it-mine-r4", PIECE,
            picture=[(0.0, "the look"), (5.0, "anime Tokyo"), (10.5, "Devil's Garden"), (14.0, "the home"),
                     (20.0, "home page"), (30.0, "the money"), (43.0, "the email"), (46.0, "plain app alone"),
                     (47.0, "plain and finished app"), (50.0, "stop waiting for updates."),
                     (52.7, "make anything you can imagine, just by asking."), (56.0, "youcoded (name)"),
                     (60.0, "end")],
            copy_to=None)
