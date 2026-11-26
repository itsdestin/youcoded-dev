"""Round 10, "Make it mine": two 15-second feel sketches (A and B) over the re-cut picture
(scripts/campaign/film/src/round2/take2.tsx, rendered to film/out/r10/mim-recut.mp4).

Written the unity way (SONGBOOK.md Part 1), measured, never heard.

TEMPO: 128 bpm (a bar = 1.875 s; 60 s = 32 bars). WHY: the film cuts every 2-4 s (one to two bars
at 128), the owner asked for music that matches "the busier/higher-energy nature of this
specific video", and the picture was re-cut to this grid so every scene cut is a bar line:
  bar 1 (0.0) the plain app · bar 4 (5.625) Golden Sunbreak · bar 7 (11.25) Devil's Garden ·
  bar 9 (15.0) the home chat · bar 12 (20.625) the home page · bar 14 (24.375) chat · bar 15
  (26.25) page · bar 17 (30.0) the money chat · bar 18 (31.875) page · bar 20 (35.625) chat ·
  bar 22 (39.375) bills · bar 23 (41.25) chat · bar 24 (43.125) the email · bar 26 (46.875) THE
  PAYOFF (the plain app, then the made one rising) · bar 27 (48.75) money · bar 28 (50.625) line
  one · the name at 56.25 (the start of bar 31 on the picture's grid).
WHY the 2-beat odd bar at bar 30: the short ending's two pick-up beats must finish on the name at
56.25, which is a bar line; with the odd bar LAST, bars 1-29 stay exactly on the picture's bars.

ONE PIECE: recipe B (app demo, v4). The chord-following eighth-note figure (round 8's, deck E2
"D") and the soft pad from the first beat; the tune woven in as whole two-bar phrases that begin
on the picture's turns (look 1, the home, the home page, the money, the bills, and the payoff's
peak phrase, plus two written answers), about 54 % of the body; chords tune-led (the recipe bends its default chords under
the tune's held notes). One lift into the payoff, the quiet logo.

THE TWO SKETCHES (bars 21-28, 37.5-52.5 s of the re-cut: the money chat, the bills, the email,
the payoff, the money page and the first line; cuts at 39.375, 41.25, 43.125, 46.875, 48.75 and
50.625):
  A  straight eighths (the chord-following pulse as round 8 had it)
  B  the same notes gently swung (35 ms on the off-beat eighths, the deck's clip C)
WHY this difference for this film: he liked BOTH feels (E2) and this is the film he called
higher-energy; whether its energy wants a driving straight pulse or a lilting swung one is the
choice only his ear can make. Tempo is fixed by the re-cut picture, so it is not the A/B.
"""
import recipes as R
from films import Film
from motif import write

BPM = 128.0
LAND = R.land_after(29, BPM, "short", odd=2)      # 56.25: bars 1-29, the odd bar, the pick-ups
PEAK = 46.875                                     # the payoff's bar line (bar 26)

# THE TUNE as whole two-bar phrases, each starting ON a picture turn's bar line (global bars; the
# recipe's chords bend to their held notes). WHY these bars: the first look change (4), the home
# (9), the page it made (12), the money (17), the bills found (22), and the payoff (26, the peak
# phrase reaching C6). Each phrase is followed by at least one bar of bed.
# WHY the two written answers at 14 and 20 (the first dry run had only the bank phrases, 41 % of
# the body, against the brief's "a line, about half to two-thirds"): bars 14 and 20 are each
# conversation's SECOND request ("now make the sliders bigger", "can it pull out my bills"), the
# moment the person pushes further, so each gets a phrase that climbs to B-flat and settles on
# E-flat, an answer to the cell rather than a third bank phrase. Held notes (B-flat, E-flat) are
# tones of the default chords under them (Abmaj9, Bb9sus, Cm9).
ANSWER_HOME = write("G5/1 Ab5/1 Bb5/2 | G5/1.5 F5/0.5 Eb5/2", label="answer, home")
ANSWER_MONEY = write("G5/1 F5/1 Eb5/2 | Bb4/1 C5/1 Eb5/2", label="answer, money")
TUNE = [(4, "cell-long"), (9, "question"), (12, "rise"), (14, ANSWER_HOME), (17, "cell-long"),
        (20, ANSWER_MONEY), (22, "question"), (26, "peak-arc")]


def piece(name, swing):
    return R.app_demo(
        name, 60.0, land=LAND, bpm=BPM, peak=PEAK, odd=2, odd_at=30, ending="short", seed=10,
        tune=TUNE, owner_over={"swing": swing},
        notes=f"Make it mine round 10, sketch {'B (gently swung)' if swing == 'gentle' else 'A (straight)'}: "
              "128 bpm on the re-cut's bar lines, chord-following eighths and the soft pad, the tune woven "
              "as two-bar phrases on the picture's turns, one lift into the payoff, the quiet logo.")


PICTURE = [(0.0, "the plain app"), (5.625, "Golden Sunbreak"), (11.25, "Devil's Garden"), (15.0, "the home chat"),
           (20.625, "the home page"), (24.375, "chat"), (26.25, "page"), (30.0, "the money chat"),
           (31.875, "money page"), (35.625, "chat"), (39.375, "bills"), (41.25, "chat"), (43.125, "the email"),
           (46.875, "the payoff"), (48.75, "money"), (50.625, "line one"), (52.969, "line two"),
           (56.25, "youcoded (name)"), (60.0, "end")]

FILMS = [Film("r10-mim-a", piece("r10-mim-a", "straight"), picture=PICTURE, copy_to=None),
         Film("r10-mim-b", piece("r10-mim-b", "gentle"), picture=PICTURE, copy_to=None)]
