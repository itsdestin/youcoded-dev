"""The demonstrations: each is ONE continuous song assembled only from the songbook's blocks.
Nothing here writes a note; it only lists sections. This file is also the worked example of
how to score a film (SONGBOOK.md, Technical appendix).
"""
from score import Piece, Section as S

DEMOS = [
    Piece(
        "demo-playful", 30.0, seed=3,
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
        "demo-hopeful", 40.0, seed=5,
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
        "demo-stark-to-bright", 24.0, seed=7,
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
        "demo-journey", 60.0, seed=11,
        notes="Every mood in one song: stark (the tune over the dark chords) -> a hush (the "
              "signature alone, the harmony turning) -> hopeful (the tune bright, rolling, "
              "answered; it speeds up into) -> playful (the whole tune, bouncing) -> a held chord "
              "-> triumphant (the second phrase, broader, violin and piano in octaves, everyone "
              "in) -> the logo.",
        sections=[
            S("stark", 4, tune="phrase1", label="stark"),
            S("hush", 2, tune="signature", start=12.0, bpm=88, chords=[["Abmaj7"], ["Bbsus"]], into="build",
              label="hush"),
            S("hopeful", 4, tune="phrase1", start=17.5, bpm=80, add=("answer",), into="build",
              label="hopeful (speeds up into the next)"),
            S("playful", 8, tune=["phrase1", "phrase2"], start=29.0, add=("held",), into="hold",
              hold=1.5, label="playful"),
            S("triumphant", 4, tune="phrase2", start=45.5, bpm=100, add=("answer",), lift=True,
              label="triumphant"),
        ]),
    Piece(
        "example-piano-ending", 16.0, logo="piano", seed=13,
        notes="Extra, to prove the second ending: a short hopeful passage on the piano that "
              "thins to the piano alone and ends on the piano-only logo.",
        sections=[
            S("hopeful", 4, tune="phrase2", label="hopeful"),
        ]),
]
