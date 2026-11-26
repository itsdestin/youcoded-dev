"""The worked example of the unity brief (2026-11-25): 20 s written the new way (SONGBOOK.md).

Not a film: a proof that the toolkit's defaults now make one piece instead of layers. Read it as
the template for a recipe-A-length piece. Measured, never heard: see its readings with
`render.sh --shelf woven`.
"""
import recipes as R
from films import Film
from motif import write

BPM = 112.0
LAND = R.land_after(8, BPM, "short")          # 8 bars of 4 + the short ending: the name at ~18.2 s

# THE TUNE AS WHOLE PHRASES (two bars each), stated by the bed's own hands, about half the time.
# Phrase 1 is the cell answered by a step back up; phrase 2 falls from A-flat and climbs to B-flat,
# which the ending's quiet logo (B-flat, G, F) then answers. Every held note is a chord tone of
# the chord under it: the chords are TUNE-LED (chords=None: the recipe's Ebmaj9 / Abmaj9 bends
# where a held note needs it; --notes prints the change).
TUNE = [(2, write("Bb4/1 G5/1 F5/2 | Eb5/1 F5/1 G5/2", label="statement")),
        (5, write("Ab5/1.5 G5/0.5 Eb5/2 | F5/1 G5/1 Bb5/2", label="answer"))]

PIECE = R.type_short(
    "woven-example", round(LAND + 1.8, 3), land=LAND, bpm=BPM, seed=3, subtle=True,
    tune=TUNE,
    # everything else is the v4 default: the chord-following pulse at touch 0.28, the soft pad
    # at pad_level -4, the quiet logo, one room, the woven tune (score.Band.woven)
    notes="the unity brief's worked example: two 2-bar phrases woven into a chord-following bed")

FILM = Film("woven-example", PIECE, copy_to=None)
