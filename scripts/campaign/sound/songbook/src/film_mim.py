"""Make it mine, second score (round 7): one playful song that is WRITTEN THROUGH, not looped.

THE PICTURE (spotted from round4/make-it-mine.mp4 and film/src/round2/take2.tsx)
  0-14   the look: a plain app, "can i change how this whole thing looks", two theme changes
         (5.0 anime Tokyo, 10.5 Devil's Garden desert). Light, curious, typing.
  14-30  the home: "i want youcoded to manage my smart home", the home page it built, "put my room
         on the front". Warm, settled: the app now feels like theirs.
  30-46  the money: "connect my bank", the money page, "pull out my recurring bills", an email
         drops in (43), the plain app comes back (45). A little more grounded, thinking.
  46-54  the payoff: the plain app and the finished one side by side (46.5), then the lines
         "stop waiting for updates." (50) and "make anything you can imagine, just by asking." (52.7)
  56     the name.  The music turns only at 14, 30 and 46; the theme changes and the cuts inside a
         section are not followed.

THE ARC (120 bpm, a bar = 2.0 s, so every turn sits on a bar line; 27 bars + the logo bar)
  section    bars  seconds  loud     register (tune top)  busy                tune guise
  A look     1-7   0-14     quiet    Bb5                  thin pizz bounce    fragments: the cell, the
                                                                              cell a third higher, the
                                                                              tune's bars 3-4 as an open
                                                                              cadence; rests between (the
                                                                              second piano echoes in them)
  B home     8-15  14-30    middle   Bb5                  rolling piano       the first real statement:
                                                                              bar 1 as written, bar 2
                                                                              reshaped (top saved), bar 3
                                                                              ornamented, a CLOSED cadence
                                                                              on E-flat; a rest; then the
                                                                              cell rising in sequence over
                                                                              quicker chords; open on D
  C money    16-23 30-46    middle,  Ab5 (lower)          full pizz bounce,   contrast: a B phrase by hand
                            arch                          held strings,       (the tune's rhythm on new
                                                          a cello line, a     notes, the cell in minor),
                                                          walking pizz bass
                                                                              new chords walking down
                                                                              C-Bb-Ab-G-F; ends on a held
                                                                              A-flat over D-flat: THE DROP
  D payoff   24-27 46-54    FULL,    C6 (first time)      rocking, violin and the full second phrase, at
                            then                          piano in octaves    last in its top register;
                            settling                                          settles under the lines
  logo       28    54-56                                                      the ending bar and the logo

HARMONY: 13 different chords, no progression twice in a row. A walks the bass up (Eb G Ab Bb C
F Bb); B adds a cadence inside a bar (Bb/D, Eb) and doubles the harmonic rhythm into the turn
(Gm7, Abmaj7 in one bar) and a deceptive cadence (Bb7 -> Cm7) into the money; C walks the bass
DOWN by step (C Bb Ab G F) with Ab/Bb as a soft dominant; the one borrowed colour is D-flat
under the drop (bar 23), resolving straight onto E-flat as the payoff starts ("sun through
clouds"). No tune note D sounds over it.

BREATH: the tune rests in bars 1, 3, 5, 12, 16, 20 and 23. The answer (second piano) speaks in
those rests and nowhere on a tune note. The peak (46.0) arrives out of the drop.

MEASURED (first version, render.sh mim): every composition check and every mix check passes;
bar loudness -19.5 (bar 1) .. -12.4 dB (bars 25-26), the payoff +2.5 dB over the four bars
before it, loudest bar 25 (48.0 s), longest near-copy stretch 2.0 s. Weakness: B and C sit on
the same plateau (about -14.5) for 30 s; the arc's rise is A -> B and C -> D only.
"""
from films import Film
from motif import motif, write, rest
from score import Piece, Section as S

sig = motif("signature")          # B-flat, G, F: "you-co-ded"

# ---- A, the look (bars 1-7). WHY fragments with rests: someone is typing and looking; the
# brand's three notes are a hint, answered by the second piano, not a tune yet.
A_TUNE = [
    rest(1),                       # bar 1: the bounce alone
    sig,                           # bar 2: the cell (call)
    rest(1),                       # bar 3: the echo answers
    sig.up(2),                     # bar 4: the cell a third higher (D, B-flat, A-flat) over Bb7
    rest(1),                       # bar 5: the echo again
    motif("bar3") + motif("bar4"), # bars 6-7: the tune's own falling cadence, open on D
]
A_CHORDS = [["Eb"], ["Eb/G"], ["Ab"], ["Bb7"], ["Cm7"], ["Fm7"], ["Bb"]]   # bar 7: the E-flat leans on Bb and falls to D (a sigh)

# ---- B, the home (bars 8-15). WHY the first full statement here: the app has become theirs;
# the tune is heard properly once, but its top C is kept back (bar 2 reshaped to B-flat) and the
# phrase CLOSES on E-flat (the first home arrival). Then a sequence of the cell climbs into the turn.
B_TUNE = [
    motif("bar1"),                                   # bar 8: as written (statement 1 of 2)
    write("Eb5/1 Bb5/1 Ab5/1.5 F5/0.5"),             # bar 9: bar 2's shape, top saved (B-flat, not C)
    motif("bar3").fill(),                            # bar 10: bar 3 with a passing D (ornament)
    write("F5/1.5 D5/0.5 Eb5/2"),                    # bar 11: CLOSED: D leans up to E-flat over Bb/D -> Eb
    rest(1),                                         # bar 12: the tune breathes; the echo answers
    sig.up(1),                                       # bar 13: the cell from C (C, A-flat, G) over Abmaj7
    write("D5/1 Bb5/1 Ab5/1.5 G5/0.5"),              # bar 14: a step higher again, quicker chords
    write("F5/1.5 Eb5/0.5 D5/2"),                    # bar 15: open on D: the question into the money
]
# WHY the home's answer is written by hand: the automatic echo stuttered (A-flat twice in bar 13).
# Here the second piano echoes the closing cadence, rises through the E-flat chord in the tune's
# rest (bar 12), and asks the question back at the end (F, D) into the money.
B_ANSWER = write("r/4 | r/4 | r/4 | r/3 F4/0.5 D4/0.5 | Eb4/1.5 G4/0.5 Bb4/2 | r/3 Ab4/0.5 G4/0.5 | r/4 | r/3 F4/0.5 D4/0.5")
B_CHORDS = [["Eb"], ["Cm7"], ["Abmaj7"], ["Bb/D", "Eb"], ["Eb/G"], ["Abmaj7"], ["Gm7", "Abmaj7"], ["Bb7"]]

# ---- C, the money (bars 16-23). WHY a B phrase by hand: the film is over 30 s, so the return of
# the real tune at the payoff must be felt as a return. Same rhythm (long, long, longer, short),
# new notes, lower; the cell appears in minor (G up to E-flat, down to D) over a bass walking down.
C_TUNE = [
    rest(1),                                         # bar 16: typing; the cello begins
    write("G4/1 Eb5/1 D5/1.5 C5/0.5"),               # bar 17: the cell in minor
    write("C5/1 Ab5/1 G5/1.5 Eb5/0.5"),              # bar 18: the same shape, a third up
    write("F5/1.5 D5/0.5 Bb4/2"),                    # bar 19: half close on B-flat (open)
    rest(1),                                         # bar 20: the tune breathes; cello and echo speak
    write("Ab4/1 F5/1 Eb5/1 D5/1"),                  # bar 21: the cell once more, from A-flat
    write("Eb5/1 F5/1 G5/1 Ab5/5"),                  # bars 22-23: climbs, then HOLDS A-flat over the drop
]
C_CHORDS = [["Cm7"], ["Cm7/Bb"], ["Abmaj7"], ["Gm7"], ["Fm7"], ["Ab/Bb"], ["Eb/G", "Ab"], ["Db"]]
# the cellos: a second line that moves when the tune holds and holds when it moves (G2-Ab3)
# WHY a walking bass written by hand (pizz cello, a note a beat): the money is the one passage
# where the floor itself moves; it walks DOWN the scale one chord a bar, each bar's last note a
# step from the next chord's root, so the harmony is heard as one line going somewhere.
C_BASS = write("C2/1 Eb2/1 G2/1 C2/1 | Bb1/1 D2/1 Eb2/1 Bb1/1 | Ab1/1 C2/1 Eb2/1 Ab1/1 | G1/1 Bb1/1 D2/1 G1/1 | "
               "F1/1 Ab1/1 C2/1 Ab1/1 | Bb1/1 Eb2/1 C2/1 Ab1/1 | G1/1 Bb1/1 Ab1/1 C2/1 | Db2/1 r/3")
# WHY the money's answer is written by hand: the automatic echo landed on G under the D-flat
# chord (a tritone) in the drop. Here it speaks only around the tune's half close (bars 19-20)
# and leaves the drop to the held A-flat alone.
C_ANSWER = write("r/4 | r/4 | r/4 | r/3 F4/0.5 Eb4/0.5 | C4/1.5 Eb4/0.5 F4/2 | r/4 | r/4 | r/4")
# WHY no cello note longer than two beats: a held bowed note's own swell 0.6-0.8 s in was measured
# as an attack that is not a note (the counter bus is not exempt like the held strings are).
C_COUNTER = write("C3/2 Ab3/2 | G3/2 Bb3/2 | Ab3/2 G3/2 | F3/2 D3/2 | F3/2 G3/2 | Eb3/2 Ab3/2 | G3/2 Ab3/2 | Ab3/2 r/2")

# ---- D, the payoff (bars 24-27). WHY the second phrase as written: after 46 s of fragments,
# variants and a contrast phrase, the tune's own second half in its top register (the first C6 of
# the piece, 48.5 s) is the payoff; violin and piano together.
D_TUNE = [motif("phrase2")]
D_CHORDS = [["Eb"], ["Cm7"], ["Abmaj7"], ["Fm7", "Bb7"]]

PIECE = Piece(
    "make-it-mine-r2", 60.0, land=56.0, peak=46.0, seed=71,
    notes="Make it mine, second score: written through at 120 bpm. Fragments and echoes for the "
          "look, the first statement closing home for the home, a contrast phrase over a falling "
          "bass for the money, a drop on D-flat, then the tune's second phrase in its top register "
          "for the payoff and the logo as the last phrase at 56.0 s.",
    sections=[
        S("playful", 7, bpm=120, tune=A_TUNE, chords=A_CHORDS, density=0.6, vary={1: "thin", 5: "thin", 7: "bass"},
          drop=("air",), shape=[(0, 0.82), (28, 1.0)], push=-6, into="blend", span=1,
          label="A the look"),
        S("playful", 8, bpm=120, start=14.0, tune=B_TUNE, chords=B_CHORDS, accomp="rolling", bass="walk",
          vary={5: "half", 8: "half"}, legato=0.1, answer=B_ANSWER, shape=[(0, 0.9), (20, 1.02), (32, 0.94)], into="blend", span=1, label="B the home"),
        S("playful", 8, bpm=120, start=30.0, tune=C_TUNE, chords=C_CHORDS, add=("held",), counter=C_COUNTER,
          counter_voice="cello", bass=C_BASS, answer=C_ANSWER, vary={4: "half"}, shape=[(0, 0.86), (14, 1.0), (28, 0.86), (32, 0.8)], into="drop",
          label="C the money"),
        S("triumphant", 4, bpm=120, start=46.0, tune=D_TUNE, chords=D_CHORDS,
          drop=("pizz",), shape=[(0, 1.1), (8, 1.1), (16, 0.94)],
          label="D the payoff"),
    ])

FILM = Film("make-it-mine-r2", PIECE,
            picture=[(0.0, "the look"), (5.0, "anime Tokyo"), (10.5, "Devil's Garden"), (14.0, "the home"),
                     (30.0, "the money"), (43.0, "the email"), (46.0, "payoff: plain and finished app"),
                     (50.0, "stop waiting for updates."), (52.7, "make anything you can imagine, just by asking."),
                     (56.0, "youcoded (name)"), (60.0, "end")],
            copy_to=None)
