"""Make it mine, third score (round 7, second pass): one playful song written phrase by phrase,
where the tune is DEVELOPED by rhythm, direction, register and instrument, not moved up a step.

WHY a rewrite and not a patch: the critics of the second score found one rhythm in 8 bars, all
21 tune bars starting on beat 1, the cell's shape every 4.6 s, a "contrast" phrase that was the
cell transposed, a peak that fell a seventh out of a seven-part "drop", and a payoff that switched
everything on at once. Every passage below is written again from the picture.

THE PICTURE (frames pulled from round4/make-it-mine.mp4 every 2 s and every 0.5 s around 46)
  0-14   the look: the plain app, "can i change how this whole thing looks?", typing; the anime
         Tokyo theme lands at about 5 s, "actually gimme desert" and Devil's Garden at about 10.5.
  14-30  the home: "i want youcoded to manage my smart home"; the home page is on screen from 20 s;
         "put my room on the front", the page again at 24-28.
  30-46  the money: "can we connect my bank and show", the money page from about 34 s, "pull out
         my recurring bills", an email slides in beside it at 43-45.
  46     cut to the plain empty app ALONE; the finished app slides in beside it at 46.5 and has
         settled by 47.0; at 48-49 the money page sits beside the plain app.  THE PEAK = 48.0 s
         (the first full bar with the payoff image on screen; 46 is the plainest frame of the film).
  50     "stop waiting for updates."   52.7 "make anything you can imagine, just by asking."
  56     the name.

THE ARC (120 bpm throughout, a bar = 2.0 s; 27 bars + the ending bar; land=56 only is pinned with
B and C, so no tempo step lands on the peak)
  passage   bars   seconds  level        tune median/top  busy          who leads, what the tune does
  A look    1-7    0-14     quiet        C5 / G5          thin bounce,  piano: the cell ONCE on a pick-up
                                                          own light     (Bb4 on beat 3.5, rhythm 0.5+1.5);
                                                          bass, no sub  a stepwise answer entering on beat
                                                                        2, tied over the bar line onto D
                                                                        (open, 8 s); a falling arpeggio
                                                                        entering on beat 2; open on F.
                                                                        Second piano speaks only in bars 3
                                                                        and 5, two different figures.
  B home    8-15   14-30    middle       F5 / Ab5         rolling,      piano: the opening bar exactly as
                                                          held strings  written (the one statement before
                                                                        the payoff), answered by a rising
                                                                        scale to a held Ab tied over the
                                                                        bar line, CLOSED on E-flat at 20.0
                                                                        (the home page); a rest bar where
                                                                        the second piano sings a two-bar
                                                                        reply; then two falling sighs
                                                                        entering off the beat, open on D.
  C money   16-23  30-46    the valley   cello G3-G4,     bounce at     the CELLO sings the B idea (enters
                            (no sub)     piano Ab4-Ab5    density 0.4   on beat 2, rises a third, holds,
                                                          (one soft     falls by step: long notes, the
                                                          chord per     opposite of the cell); the piano
                                                          change),      rests 10 s, comes back at 40.7 s
                                                          walking pizz  off the beat and climbs to A-flat;
                                                          bass          bars 16-17 one chord over a C
                                                                        pedal, then the bass walks down;
                                                                        deceptive arrival (Bb7 -> Cm7).
  drop      23     44-46    2 groups     Ab5 tied         tune + bass   the piano's A-flat (tied from bar
                                                                        22) over one bowed D-flat; the
                                                                        piano's Bb4 on beat 3.5 is the
                                                                        pick-up of the cell, which the
                                                                        VIOLIN finishes on G5 at 46.
  D payoff  24-27  46-54    staged       Bb5 / Eb6        24: violin +  24 (46, the plain app): the film's
                                                          rocking half  opening gesture returns, broadened,
                                                          25-26: full   on the violin (the hand-over: the
                                                          (density .7)  piano plays it with her, softly);
                                                          27: half      25 (48, THE PEAK): up a fourth
                                                                        from E-flat to A-flat over A-flat
                                                                        major, climbing its chord to C6
                                                                        and the first Eb6 of the film
                                                                        (49.5), tied over to 50.5; 26
                                                                        falls to B-flat under "stop
                                                                        waiting for updates."; 27 thins
                                                                        under the last line.
  ending   28      54-56                                                the sigh, the logo at 56.0.

HARMONY: 13 different chords; one chord held over a bar line in A (Eb, bars 1-2) and in C (Cm7,
bars 16-17 over a C pedal); two chords in a bar where the music pushes (bars 4, 7, 10, 14, 15,
22, 27). Cadences: closed in B (Bb7 -> Eb at 20.0), deceptive into C (Bb7 -> Cm7 at 30.0), the
one borrowed colour D-flat in the drop, entered by step from C and left by step to E-flat.

CELL ("up a sixth, down a step") before the logo: bar 2 (rhythm 0.5, 1.5), bar 8 (1, 1), bar 24
(0.5, 2, the return). Three hearings in 54 s plus the logo, never two alike within 20 s. The
tune's rests: bars 3, 5 (after its tie), 12, 16-20, 23 (the pick-up only).

MEASURED (render.sh mim, this version): every composition and mix check passes, no warnings.
Bar loudness (LUFS): A -22.4 rising to -15.7; B -13.1 to -14.8; C -19.5 to -15.4 (2-4 dB under B);
the drop -20.2; bar 24 -13.9; the peak bars 25-26 -12.1 / -12.0 (+3.8 dB over the four bars
before); bar 27 -13.1. Notes per bar: C 7-12, bar 24 19, bars 25-26 19-22. Energy below 150 Hz
in bar 1: 4 % (was 55 %). Longest level plateau 16.0 s (B, at the limit). Name at 56.0003 s.
"""
from films import Film
from motif import write
from score import Piece, Section as S

# ---- A, the look (bars 1-7, 0-14 s). WHY fragments with real rests and entries off the beat:
# someone is looking and typing; the brand's three notes are a hint that leans in from beat 3.5,
# and every answer to it has a different contour and rhythm (rising steps, a falling arpeggio).
A_TUNE = write(
    "r/3.5 Bb4/0.5 | "                    # bar 1: the bounce alone, then the pick-up "you-"
    "G5/1.5 F5/0.5 Eb5/1.5 r/0.5 | "      # bar 2: "-co-ded" leaning (long-short), home on E-flat
    "r/4 | "                              # bar 3: rest: the second piano echoes
    "r/1 Ab4/0.5 Bb4/0.5 C5/1 Eb5/0.5 D5/0.5 | "   # bar 4: a rising answer entering on beat 2...
    "~/2 r/2 | "                          # bar 5: ...D tied over the bar line: the open question
    "r/1 Eb5/0.5@1.05 C5/0.5 Bb4/1 G4/1 | "        # bar 6: the second call FALLS (a C minor arpeggio)
    "Ab4/1.5 F4/1.5 r/1")                 # bar 7: and stops open on F (B-flat 7), leaving room for the turn
A_CHORDS = [["Eb"], ["Eb"], ["Abmaj7"], ["Bbsus", "Bb"], ["Gm7"], ["Cm7"], ["Fm7", "Bb7"]]
# WHY a hand-written plucked bass in the cello's upper octave: the old opening was 55 % energy
# below 150 Hz (the sub plus G1/F1 chords), close to silent on a phone. This bass sits at G2-Eb3,
# moves off the root in every bar, and changes its rhythm bar to bar under the bounce.
A_BASS = write("Eb3/1 r/1.5 Bb3/0.5 r/1 | Eb3/1 r/0.5 G2/0.5 r/1 Bb2/1 | Ab2/1 r/1.5 Eb3/0.5 C3/1 | "
               "Bb2/1 r/1 F2/1 D3/1 | G2/1 r/1.5 D3/0.5 r/1 | C3/1 r/0.5 G2/0.5 Bb2/1 r/1 | "
               "F2/1 r/2 Bb2/1")
# WHY the second piano speaks only twice here, with two different figures: the old answer was the
# same two eighths on beat 4 seven times. Bar 3 echoes "co-ded" a ninth lower, falling; bar 5
# climbs under the held D, in its last beats only.
A_ANSWER = write("r/4 | r/4 | r/0.5 G4/0.5 F4/0.5 Eb4/1.5 r/1 | r/4 | r/2.5 Bb3/0.5 C4/0.5 D4/0.5 | r/4 | r/4")

# ---- B, the home (bars 8-15, 14-30 s). WHY the statement here and nowhere else before the payoff:
# the app has become theirs; the opening bar is heard as written once, then answered by a NEW
# gesture (a quick rising scale to a held A-flat that crosses the bar line) and closed on E-flat
# exactly when the home page arrives (20.0 s). Phrase 2 is two sighs entering off the beat, a
# sequence of two (not four), then an open D into the money.
B_TUNE = write(
    "Bb4/1 G5/1 F5/1.5 Eb5/0.5 | "        # bar 8: the opening bar as written
    "r/0.5 F5/0.5 G5/1 Ab5/2 | "          # bar 9: a scale rising to A-flat...
    "~/1 G5/1 F5/1.5 D5/0.5 | "           # bar 10: ...held over the bar line, then down to D
    "Eb5/3 r/1 | "                        # bar 11: CLOSED on E-flat (20.0 s, the home page)
    "r/4 | "                              # bar 12: the tune breathes; the second piano sings
    "r/0.5 Ab5/1.5 G5/1 Eb5/1 | "         # bar 13: a sigh from A-flat, off the beat
    "r/0.5 F5/1.5 Eb5/1 D5/1 | "          # bar 14: the same sigh a step lower (twice, not more)
    "Ab4/1 Bb4/0.5 C5/0.5 D5/2")          # bar 15: low, climbing, open on D (B-flat 7)
B_CHORDS = [["Eb"], ["Ab/C"], ["Fm/Ab", "Bb7"], ["Eb"], ["Cm7"], ["Abmaj7"], ["Fm7", "Gm7"], ["Bbsus", "Bb7"]]
# WHY a written bass: it walks Eb-D-C, then Ab-Bb into the cadence, so the home's phrase is heard
# as one line going somewhere instead of a root on every bar line
B_BASS = write("Eb2/2.5 D2/1.5 | C2/2.5 Eb2/1.5 | Ab1/2 Bb1/2 | Eb2/2.5 G2/1.5 | C2/2.5 Bb1/1.5 | "
               "Ab1/2.5 Eb2/1.5 | F1/2 G1/2 | Bb1/2 D2/2")
# WHY one two-bar reply in the tune's rest (bars 11-12) and silence elsewhere: one real answer that
# enters on beat 4 and sings across the bar is a conversation; the old tic on every bar was not
B_ANSWER = write("r/4 | r/4 | r/4 | r/3 G4/0.5 Ab4/0.5 | Bb4/1.5 C5/0.5 Bb4/1 G4/1 | r/4 | r/4 | r/4")

# ---- C, the money (bars 16-23, 30-46 s): THE VALLEY. WHY the cello and not the piano: a B idea
# must differ from the A idea in contour AND rhythm and instrument. The cello enters on beat 2,
# rises a third, holds, then falls by step in long notes (the cell leaps a sixth in short ones).
# The piano (the person) rests for 8 s and comes back at 40 s, off the beat, climbing into the drop.
C_COUNTER = write(
    "r/1 Eb4/1@0.7 G4/2 | "               # bar 16: enters on beat 2, holds G over the C pedal
                                          # (WHY a quarter, not an eighth: a short first bow measured as a
                                          # noise-like attack, 0.114 at 30.5 s)
    "~/1 F4/1 Eb4/1 D4/1 | "              # bar 17: falls by step
    "C4/1.5 Bb3/0.5 G3/2 | "              # bar 18: and settles low (long-short-long)
    "~/1 Ab3/1 C4/1 Eb4/1 | "             # bar 19: rises again
    "D4/1.5 Eb4/0.5 F4/2 | "              # bar 20: the piano still listens; the cello reaches F
    "~/2 Eb4/1 C4/1 | "                   # bar 21: holds while the piano comes back, then steps down
    "G3/2 r/2 | "                         # bar 22: and lets go before the drop
    "r/4")
C_TUNE = write(
    "r/4 | r/4 | r/4 | r/4 | r/4 | "      # bars 16-20: the piano listens (10 s)
    "r/1.5 Ab4/0.5 C5/1 F5/1 | "          # bar 21: comes back off the beat, rising in fourths
    "~/1 Eb5/0.5 F5/0.5 G5/1 Ab5/1 | "    # bar 22: F tied over the bar line, then climbs to A-flat
    "~/2 r/1.5 Bb4/0.5")                  # bar 23: THE DROP: A-flat held over D-flat; Bb4 = "you-"
C_CHORDS = [["Cm7"], ["Cm7"], ["Cm7/Bb"], ["Abmaj7"], ["Gm7"], ["Fm7"], ["Eb/G", "Ab/C"], ["Db"]]
# WHY a pedal, then a walk an octave higher than before: the money's idea is that the floor moves,
# so the bass first STAYS (two bars on C), then walks down by step; at G2-D3 its notes reach a phone
# speaker (the old walk at G1-C2 did not). Bar 23 is one bowed D-flat: the drop is two sounds.
C_BASS = write("C3/1 r/1 G2/1 r/1 | C3/1 r/1.5 G2/0.5 C3/1 | Bb2/1 D3/1 C3/1 Bb2/1 | Ab2/1 C3/1 Eb3/1 Ab2/1 | "
               "G2/1 Bb2/1 D3/1 G2/1 | F2/1 Ab2/1 C3/1 Ab2/1 | G2/1 Bb2/1 C3/1 r/1 | Db3/4")

# ---- D, the payoff (bars 24-27, 46-54 s). WHY staged on the violin: at 46 the picture is the plain
# app alone, so bar 24 brings only two new things (the violin's voice and a little level): the
# film's opening gesture returns, finished by the violin out of the piano's pick-up, over a rocking
# piano on beats 1 and 3 only. At 48 (the payoff image) the tune steps UP from G5 to A-flat over
# A-flat major, the rocking fills in, and the line climbs to the film's first E-flat 6 (49.5),
# tied over into "stop waiting for updates." Bar 27 thins under the last line.
D_TUNE = write(
    "G5/2 F5/1 Eb5/1 | "                       # bar 24: "-co-ded" on the violin, broadened (WHY no
                                               # short notes: the violin ignores touch and digs into
                                               # eighths, so a short F5 measured louder than the G5)
    "Ab5/1.5 C6/1.5 Eb6/1 | "                  # bar 25 (48.0, THE PEAK): up a third to A-flat, climbing
                                               # its own chord to the first E-flat 6 of the film
    "~/1 C6/1 Bb5/2 | "                        # bar 26: E-flat held over the bar line, then falling to B-flat
    "Ab5/2 F5/2")                              # bar 27: settles under the last line
D_CHORDS = [["Eb"], ["Abmaj7"], ["Eb/G"], ["Fm7", "Bb7"]]

PIECE = Piece(
    "make-it-mine-r3", 60.0, land=56.0, peak=48.0, seed=73,
    # WHY rit=0.95: the default slower ending stretched the last bar and pulled every bar line after
    # 30 s about 0.1 s early (46 and 48 missed the picture); 0.95 keeps them within about 30 ms
    rit=0.95,
    # WHY the counter up 3 dB: in C the cello carries the B idea in front of a resting piano
    mix={"counter": 3.0},
    notes="Make it mine, third score: the cell once on a pick-up, a closed statement for the home, "
          "the cello's falling B idea over a C pedal and a walking bass for the money, a two-part drop "
          "on D-flat, the opening gesture returning on the violin at 46 and the first E-flat 6 at 49.5.",
    sections=[
        S("playful", 7, bpm=120, tune=[A_TUNE], chords=A_CHORDS, bass=A_BASS, answer=A_ANSWER,
          density=0.55, vary={1: "rest", 5: "half", 7: "thin"}, drop=("sub",), push=-6,
          # WHY level_db=-3: measured, A sat on the same level as B (a plateau over the turn at 14 s);
          # the look is the quiet start of the arc, B the warm middle
          level_db=-3.0,
          shape=[(0, 0.82), (14, 0.9), (16, 0.86), (28, 0.96)], into="blend", span=1, label="A the look"),
        S("playful", 8, bpm=120, start=14.0, tune=[B_TUNE], chords=B_CHORDS, accomp="rolling", bass=B_BASS,
          answer=B_ANSWER, add=("held",), vary={5: "half", 8: "half"}, legato=0.1, broaden=0.015,
          shape=[(0, 0.92), (12, 1.06), (16, 0.9), (26, 1.08), (32, 0.95)], into="blend", span=1,
          level_db=0.0, ramp=2.0, ramp_at="before", label="B the home"),
        S("playful", 8, bpm=120, start=30.0, tune=[C_TUNE], chords=C_CHORDS, accomp="bounce", density=0.4, register=12,
          # WHY bounce at density 0.4 and not "still": with "still" the written walking bass is played
          # by the piano (pedalled quarter notes blur); under the bounce it is plucked by the cello, and
          # at this density the bounce keeps only its soft chord on each change (no off-beat violas)
         
          bass=C_BASS, counter=C_COUNTER, counter_voice="cello", answer=False, drop=("sub",),
          vary={8: "rest"}, push=4, # WHY the shape returns to 1.0 on the last beat: a shape's end value carries one beat into the next
          # section, and the violin's first G5 at 46 measured 40 % softer than the notes after it
          shape=[(0, 0.88), (20, 0.92), (28, 1.0), (30, 0.8), (31.5, 0.8), (32, 1.0)],
          into="drop", level_db=-2.0, ramp=2.0, label="C the money"),
        # WHY C at -2 dB: the money is the valley the payoff climbs out of (measured 1.5 dB under B before)
        S("triumphant", 4, bpm=120, tune=[D_TUNE], chords=D_CHORDS, voice="violin",
          drop=("pizz", "synth", "low", "air"), answer=False, vary={1: "half", 4: "half"}, density=0.7,
          # WHY the shape starts at 0.75 and grows across bar 24: staged, not switched on; the violin
          # enters softly over the plain app and the line grows into the payoff image at 48
          shape=[(0, 0.78), (3, 0.9), (4, 1.12), (10, 1.1), (12, 0.82), (16, 0.78)], level_db=0.0, ramp=1.0, ramp_at="before",
          label="D the payoff"),
    ])

FILM = Film("make-it-mine-r3", PIECE,
            picture=[(0.0, "the look"), (5.0, "anime Tokyo"), (10.5, "Devil's Garden"), (14.0, "the home"),
                     (20.0, "home page"), (30.0, "the money"), (43.0, "the email"), (46.0, "plain app alone"),
                     (47.0, "plain and finished app"), (50.0, "stop waiting for updates."),
                     (52.7, "make anything you can imagine, just by asking."), (56.0, "youcoded (name)"),
                     (60.0, "end")],
            copy_to=None)
