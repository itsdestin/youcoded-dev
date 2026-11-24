"""The demonstrations: each is ONE continuous song assembled only from the songbook's blocks.
Nothing here writes a note; it only lists sections. This file is also the worked example of
how to score a film (SONGBOOK.md, Technical appendix).

WHY every piece here pins style="v1" (2026-11-23): these are what the owner has heard; the new
defaults (blend hand-over, listening answer) would change them. They are proofs of the blocks,
not models of composition: most fail the composition checks, and that is reported, not hidden.
"""
from motif import write
from score import Piece, Section as S

DEMOS = [
    Piece(
        "demo-playful", 30.0, style="v1", seed=3,
        notes="Quick and light. One bar of the bounce alone, the tune with the second piano "
              "answering, the second phrase with held strings and the soft synth, then the lift: "
              "the solo violin takes the tune while the strings rise, into the full-blend logo.",
        sections=[
            S("playful", 1, drop=("answer",), label="the bounce starts"),
            S("playful", 4, tune="phrase1", label="tune, answered"),
            S("playful", 4, tune="phrase2", add=("held", "synth"), label="second phrase, strings join"),
            S("playful", 4, tune="phrase2", voice="violin", add=("held", "synth"), lift=True,
              label="the lift: violin takes the tune"),
        ]),
    Piece(
        "demo-hopeful", 40.0, style="v1", seed=5,
        notes="Slower, warm, room for a narrator. Two passages under a voice (music 6 dB down, "
              "speech range dipped): the piano says the signature over its rolling left hand, "
              "then held strings and the low sub join. Then the voice rests and the music lifts: "
              "the tune's second phrase in octaves, the answers, strings rising, into the logo.",
        sections=[
            S("hopeful", 4, tune=["signature", "signature"], drop=("sub", "air"), narration=True,
              label="under the voice: piano, far strings"),
            S("hopeful", 4, tune=["signature", "signature"], add=("answer",), narration=True,
              into="build", label="under the voice: strings join"),
            S("hopeful", 4, tune="phrase2", add=("answer", "pizz"), lift=True,
              label="the voice rests: the lift"),
        ]),
    Piece(
        "demo-stark-to-bright", 24.0, style="v1", seed=7,
        notes="Deadpan for 9 seconds: the tune's first bars, plain, over the dark chords, one "
              "low note pulsing. The turn: the harmony rises (A-flat, B-flat) and holds, and at "
              "9.0 s the same tune comes back bright, rocking, with plucked strings and the answer, "
              "growing into the logo.",
        sections=[
            S("stark", 3, tune="phrase1", turn=True, into="hold", hold=2.0, bpm=93,
              label="deadpan"),
            S("hopeful", 4, tune="phrase2", start=9.0, bpm=96, accomp="rocking",
              add=("pizz", "answer"), lift=True, label="bright, building"),
        ]),
    Piece(
        "demo-journey", 60.0, style="v1", seed=11,
        notes="Every mood in one song: stark (the tune over the dark chords) -> a hush (the "
              "signature alone, the harmony turning) -> hopeful (the tune bright, rolling, "
              "answered; it speeds up into) -> playful (the whole tune, bouncing) -> a held chord "
              "-> triumphant (the second phrase, broader, violin and piano in octaves, everyone "
              "in) -> the logo.",
        sections=[
            # every join is a BLEND (the default between moods): the next feel grows in under the
            # last bars, speed changes spread over two bars, common notes held through
            S("stark", 4, tune="phrase1", label="stark"),
            S("hush", 2, tune="signature", start=12.0, chords=[["Abmaj7"], ["Bbsus"]], span=1,
              label="hush"),
            S("hopeful", 4, tune="phrase1", start=18.0, bpm=80, add=("answer",), label="hopeful"),
            S("playful", 8, tune=["phrase1", "phrase2"], bpm=116, add=("held",), label="playful"),
            S("triumphant", 4, tune="phrase2", bpm=100, add=("answer",), lift=True,
              label="triumphant"),
        ]),
    # WHY this example (round 8, 2026-11-24): the worked example of the steady-first guide. One
    # even piano figure runs from the first beat to the logo; the chords change every two bars;
    # the held strings enter at bar 5 and stay; the tune comes ONCE, as a phrase, over bars 9-11;
    # the figure's register opens across bars 13-16 for the one lift. Two groups most of the time,
    # three while the tune sings. It is written to pass every check, so a composer can copy it.
    Piece(
        "example-bed", 36.0, seed=17, peak=24.0, logo="quiet", loudness=-16.0, touch=0.85,
        # WHY the tune 2 dB under its usual level: in a bed it is one voice among two, not a soloist
        mix={"lead": -2.0},
        notes="The steady bed: an even eighth-note piano figure under chords that change every two bars, "
              "held strings entering at 8 s, the tune once as a phrase at 16 s, the figure opening upward "
              "for the lift at 24 s, the quiet logo.",
        sections=[
            S("hopeful", 4, bpm=120, accomp="figure", figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"],
              pedal=False, chords=[["Eb"], ["Eb"], ["Cm7"], ["Cm7"]], drop=("air", "held", "sub"),
              level_db=-2.0, into="flow", label="the figure alone"),
            S("hopeful", 4, bpm=120, accomp="figure", figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"],
              pedal=False, chords=[["Abmaj7"], ["Abmaj7"], ["Bbsus"], ["Bb"]], drop=("air", "sub"),
              level_db=-1.0, into="flow", label="strings join"),
            S("hopeful", 4, bpm=120, accomp="figure", figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"],
              tune=[write("Bb4/1 G5/1 F5/2 | Eb5/1 F5/1 G5/1 Ab5/1 | G5/3 r/1 | r/4")],
              pedal=False, chords=[["Eb"], ["Ab/C"], ["Eb/G"], ["Bbsus"]], drop=("air", "sub"),
              lead=0.85, level_db=-0.5, into="flow", label="the tune, once"),
            S("hopeful", 4, bpm=120, accomp="figure", figure=["b 2 3 2 4 2 3 2", "b 2 3 4 5 4 3 2"],
              fig_floor=("G3", "C4"), tune=[write("r/2 Eb5/1 F5/1 | G5/2 Ab5/1 Bb5/1 | G5/4 | r/4")],
              pedal=False, chords=[["Abmaj7"], ["Cm7"], ["Abmaj7"], ["Bbsus"]], drop=("air",),
              # WHY level and shape both: the one lift is +2-3 dB over two bars, never a switch
              lead=0.9, level_db=1.5, ramp=3.0, ramp_at="after", shape=[(0, 1.0), (16, 1.12)], label="the lift"),
        ]),
    Piece(
        "example-piano-ending", 16.0, style="v1", logo="piano", seed=13,
        notes="Extra, to prove the second ending: a short hopeful passage on the piano that "
              "thins to the piano alone and ends on the piano-only logo.",
        sections=[
            S("hopeful", 4, tune="phrase2", label="hopeful"),
        ]),
]
