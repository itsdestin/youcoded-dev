"""Purple is the new everything, first score (first-shot test, brief E): one sentence on screen,
its last word and the app's colour changing on each beat, then speeding through many colours and
landing on "youcoded is the new everything." at 24 s; the name at 26 s. Playful but calm.
"""
import recipes as R
from cycles import Cycle
from films import Film

# THE PICTURE IS PLANNED, NOT SHOT: the brief gives the frames (the word changes), so they are the
# input and the tempo is fitted to them.
_CHANGES = [0.0, 4.0, 8.0, 12.0, 15.0, 17.0, 19.0, 20.5, 21.5, 22.3, 23.0]
BRIEF = R.Brief("app-demo", 30.0, ("playful", "calm", "light", "sure"), "present",
                moments=[(15.0, "the colours speed up"), (24.0, "peak")], logo_at=26.0,
                picture=[(t, "colour change") for t in _CHANGES] + [(24.0, "youcoded is the new everything")],
                cards=[(0.0, "purple is the new orange"), (24.0, "youcoded is the new everything.")])
LAND = BRIEF.logo_at
# Copied from render.sh --brief, fit 1. WHY accept it: at any tempo in range, 12 body bars put the
# arrival ("youcoded is the new everything") on the ending bar's downbeat, 23.85 s here, 0.15 s
# before the brief's 24 s; the film is not shot, so the editor places that card on the grid
# (out/notes/shot-e-r1.grid.json) instead of the music bending.
BPM = 120.74
PIECE = R.app_demo(
    "shot-e-r1", 30.0, land=LAND, bpm=BPM, rit=0.85, seed=5, brief=BRIEF,
    # WHY the default bright loop, one chord per 2 bars: the sentence never changes, only its last
    # word, so the harmony stays one slow loop under it; the cadence into the name is the ending's
    chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus Ebmaj9 Ebmaj9 Cm9 Cm9",
    # WHY the cell twice, at bars 3 and 7 (3.98 s and 11.93 s): those are the "green" and "blue"
    # word changes, so the you-co-ded cell says the word change twice in the same way (a phrase said
    # twice, not thrown in); the arrival's top note is the ending's sigh (C6), so no third, peak
    # phrase 4 s before it
    tune=[(3, "cell"), (7, "cell")],
    # WHY these offsets (half-beats): cycle1's rounds fall in bars 5, 8 and 11 and cycle2's in bar 9,
    # all bars with no tune
    cycles=[Cycle("Bb5/0.5 G5/1", period=23, offset=13, name="cycle1"),
            Cycle("F5/1 D5/1", period=29, offset=12, name="cycle2", touch=0.26)],
    # WHY: one change per turn, 8 s apart: cycle1 at the third word (8 s), cycle2 where the colours
    # speed up (15.9 s, the high register moving more as the picture does), and the held strings at
    # the arrival (the peak, the ending bar)
    changes=[(5, "in", "cycle1"), (9, "in", "cycle2"), (13, "in", "held"), (13, "peak")],
    # WHY each line: the out-of-range gauges after the first render, explained, nothing changed
    explain={"fg-duty": "34 % in bars 3-10: the cell on two word changes (bars 3 and 7) with cycle rounds between; "
                        "one point over, from the brief's word changes, not a phrase popping in",
             "change-plan": "the gaps are 7.95 s (four bars at the fitted 120.74 bpm), printed as 8.0; one change "
                            "per picture turn, as planned",
             "picture-sync": "the film is not shot: the arrival lands on the ending's downbeat at 23.85 s, 0.15 s "
                             "before the brief's 24 s, and the editor places that card on the grid",
             "level-rate": "the dip between two pulse notes at 7.3 s with the pad at the plan's -8 dB (gap-fill 5.0); "
                           "the owner's pad_level A/B (sketch B -4: 5.3 dB)",
             "mix-attacks-on-notes": "three plucked-string attacks at 27.8-28.5 s, after the name, where no note is "
                                     "written (the logo blend's last pizz is at 26.0 s); cause not traced"},
    notes="Brief E: one slow loop under an unchanging sentence; the cell on two word changes, the cycles "
          "joining as the colours speed up, the sigh on the arrival and the logo on the name.",
    # WHY v3: made before the unity rebuild (2026-11-25); it renders as it was heard
    style="v3")
FILM = Film("shot-e-r1", PIECE, picture=BRIEF.picture, copy_to=None)
