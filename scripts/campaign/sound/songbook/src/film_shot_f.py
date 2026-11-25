"""Shot F, first score: a 6 s end-card sting. The name appears at 1.0 s and holds to 6.0 s; the
same file also loops quietly under a poster on a web page. Music only.

THE IDEA: the sound logo IS the sting. The pad (E-flat) and one pick-up beat of the pedal pulse
start on the first frame; the logo's two pick-ups (B-flat, G) fall in the first second and its F
lands on the name at 1.0 s; then the quiet logo (piano, held strings, sub) and the pad ring out
for 5 s and die away before the file ends, so the loop's seam is a breath, not a cut.

WHY not plain recipes.type_short (SONGBOOK step 3, recipe A): recipe A always writes at least one
4-beat bar before its 2-beat short ending (recipes._bars_to_land: n = max(1, ...)). At 100-120 bpm
that puts the name at 3.0-3.6 s at the earliest; asked to land it at 1.0 s the tempo map squeezed
the bar to about 360 bpm (tempo-stretch +227 %, first --notes run), and `render.sh --brief` printed
no fit at all (and no message saying so). The guide says a brief no recipe fits gets a fourth
recipe in recipes.py, but this test lets me edit only this file, so the piece is built here from
recipe A's own parts (its pulse fields, sustain mix, subtle logo, level and touch) with the
smallest body score.plan accepts: ONE odd bar of 1 beat (the guide's "pick-up"), then the short
ending. A body of 0 bars crashes blocks._segments (IndexError), so 1 beat is the floor.
"""
import recipes as R
from films import Film
from score import Piece, Section

# THE PICTURE IS CUT: the name at 1.0 s, held to the end. The name is the one moment, so it is
# also the peak (the guide asks for one moment labelled "peak").
BRIEF = R.Brief("type-only", 6.0, ("calm", "warm", "certain"), "subtle",
                moments=[(1.0, "peak")], logo_at=1.0,
                picture=[(0.0, "end card"), (1.0, "the name")])
LAND = BRIEF.logo_at
# WHY 180 bpm (outside recipe A's 100-120): 1 pick-up beat + the 2-beat short ending = 3 beats must
# fill exactly 1.0 s, so the written tempo is 180 and the tempo map stretches nothing (0.0 %). The
# logo's pick-ups then fall 0.17 s apart instead of about 0.25 s at 120.
BPM = 180.0
# WHY the ending pinned at 0.25 s (a hard-check fix, not taste): unpinned, all 3 beats ran at 180 bpm,
# the logo's pick-ups fell 0.17 s apart and the landing F was HEARD 12.4 ms after the name (the hard
# `length` check allows 10; every other piece's logo, with pick-ups 0.28-0.42 s apart, measures
# 0.3-2.5 ms). Pinned at 0.25 s the logo bar plays at 160 bpm (pick-ups 0.19 s apart) and is heard
# +3.9 ms; 0.4 s (200 bpm) failed again (+12.9 ms). The cost: the 1-beat pick-up is 240 bpm.
ENDING_AT = 0.25

_O = R.owner()
# WHY _from_brief: the same path the recipes use, so subtle (quiet logo, -16.5 LUFS) and the hits
# come from the brief, not from a hand-set value
_SUBTLE, _PEAK, _HITS = R._from_brief(BRIEF, None, None, ())

# WHY one 1-beat section on Ebmaj9 with recipe A's own pulse fields: score.plan gives the ending
# bar the last section's players, so this section is what makes the ending a recipe-A ending
# (pedal pulse pool, the pad); the chord is recipe A's first chord, and the short ending turns it
# to B-flat sus and the logo to E-flat.
_SECS = [Section("bed", 1, bpm=BPM, meter=1, chords=[["Ebmaj9"]], into="flow", level_db=0.0, lead=0.8,
                 label="pick-up beat", **R._pulse(_O, ("Bb4", "G4", "F4", "Eb4"), "x.xxx.x.x.xxx.x.", 0.42))]

PIECE = Piece("shot-f-r1", 6.0, _SECS, logo="quiet" if _SUBTLE else "blend", seed=5, land=LAND, peak=_PEAK,
              ending="short", rit=1.0, ending_start=ENDING_AT, mix={"lead": -2.0, **R.sustain_mix(_O["sustain"], _O["pad_level"])},
              loudness=-16.5 if _SUBTLE else -15.0, touch=0.85 if _SUBTLE else 0.92, style="v3",
              bed=dict(sustain=_O["sustain"], start=("sustain", "pulse")), changes=[], cycles=[],
              hits=list(_HITS), recipe="type-short", brief=BRIEF, owner=dict(_O),
              speech=[], notes="Shot F: the quiet logo as a 6 s sting over the pad; loops under a poster.",
              explain={"sustain": "heard 90 % only because the pad's 1.2 s attack is still swelling in the first "
                                  "second before the name (written 100 %); the sting opens from nothing by design",
                       "tempo-steps": "the 1-beat pick-up (0.25 s, 240 bpm) into the logo bar at 160: a single struck "
                                      "beat before the logo, pinned so the name is heard on its frame (the pulse plays one note in it)",
                       "tempo-stretch": "the same pinned ending: the pick-up beat runs 240 against the written 180, the logo "
                                        "bar 160; 3 beats in 1.0 s cannot be played at one tempo with the logo heard on its frame",
                       "tempo-fit": "as tempo-stretch: the pick-up beat and the logo bar, pinned so the name is heard on its frame",
                       "chord-variety": "a 6 s sting: one chord for the pick-up beat, then the logo's own "
                                        "B-flat sus to E-flat; a second chord would be a phrase the brief has no room for"},
              sound={})
FILM = Film("shot-f-r1", PIECE, picture=BRIEF.picture, copy_to=None)
