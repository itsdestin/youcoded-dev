"""Own everything, 10 s (first-shot test A): recipe A over take3's cut picture, subtle.

The picture (film/src/round2/take3.tsx, one 96 BPM grid, four bars of 2.5 s): a dark page says
"you'll own nothing. and you'll be happy." one line a beat (bar 1); a soft marker strikes
"nothing." at 2.5 s and a hand writes "everything." (bar 2); the page turns light over beat 7-8
(4.375-5.0 s); the answer "own your data / intelligence / software / everything." one line a beat
(bar 3); the name on the downbeat of bar 4 (7.5 s), held to 10.0 s.
"""
import recipes as R
from films import Film

# STEP 1, THE BRIEF. The picture is cut: its frames are the input.
# WHY these moments: the light page (5.0 s) is where the film turns from the claim to the answer,
# so it is the peak; the pen's first strike (2.5 s) is the one soft pen moment the brief names.
BRIEF = R.Brief("type-only", 10.0, ("dark", "quiet", "turning", "warm"), "subtle",
                moments=[(2.5, "pen"), (5.0, "peak")], logo_at=7.5,
                picture=[(0.0, "dark page"), (2.5, "the strike"), (4.375, "the page turns light"),
                         (5.0, "the answer"), (7.5, "the name")],
                cards=[(0.0, "you'll own nothing. and you'll be happy."),
                       (5.0, "own your data. intelligence. software. everything.")])
LAND = BRIEF.logo_at
# STEP 2, THE TEMPO. WHY 96 with one 2-beat bar as bar 3: the picture is cut on ONE 96 BPM grid (take3.tsx), and
# fit_tempo, given that tempo, lands the pen, the peak and the name all at 0 ms (bpm=96, odd=2, odd_at=3, rit=1.0).
# render.sh --brief searches only recipe A's 100-120 range, where its best fit (104, odd 3) puts the light page
# 385 ms early; the toolkit's own fit_tempo was run over 90-120 instead (see the report). The odd bar + the
# short ending (2 + 2 beats) are the light page's four lines, so the name falls on the picture's beat 12.
BPM, ODD, ODD_AT = 96.0, 2, 3

PIECE = R.type_short(
    "shot-a", 10.0, land=LAND, bpm=BPM, odd=ODD, odd_at=ODD_AT, rit=1.0, seed=1, brief=BRIEF,
    # WHY C minor under both bars of the dark page (the claim and its correction): "dark then light"; the
    # odd bar keeps the bar before it's chord (the recipe's rule), and the short ending's cadence resolves
    # to E-flat major on the name, so the light arrives in the harmony at the sign. Cm9 and the E-flat it
    # resolves to share E-flat, G and B-flat.
    chords="Cm9 Cm9",
    # WHY one change, at the light page (bar 3, 5.0 s): the pad's filter opens as the page turns light; the
    # one turn a 10 s film gets.
    changes=[(3, "brightness", 1.25)],
    # WHY (the dashboard rule: explain an out-of-range gauge, never bend the music)
    explain={"chord-variety": "one chord (C minor 9) for the whole dark page by the brief's 'dark then light'; the "
                              "short ending's B-flat sus to E-flat is the second and third, the light arriving on "
                              "the name; 2.5 bars of body leave no room for an alternation",
             "tilt": "-13.4: a soft felt pulse under a pad on C minor with no tune, a brief that asks for dark and "
                     "quiet; information for the owner's ear, not a reason to brighten anything",
             "level-rate": "8.1 dB at 5.4 s: the dip between the pulse's B-flat 4 (4.98 s) and G4 (5.60 s), the pad "
                           "at the plan's -8 dB not filling it (gap-fill 6.4); sketch B at pad_level=-4 reads 6.5, "
                           "the owner's pad_level A/B decides it"},
    notes="First-shot A: own everything 10 s, recipe A, subtle.")

FILM = Film("shot-a", PIECE, picture=BRIEF.picture, copy_to=None)
