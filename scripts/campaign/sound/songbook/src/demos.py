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


# ====================================================================== THE REBUILD'S WORKED EXAMPLES
# (2026-11-24) One short example per recipe, each made the way SONGBOOK.md "The procedure" says:
# brief -> tempo -> recipe -> change plan -> the bed -> the tune -> read the dashboard. The
# pictures are invented (no film exists for them); the editor is assumed to cut on the motion
# grid, which is the point of choosing the tempo first.
import os as _os  # noqa: E402

import recipes as _R  # noqa: E402
from cycles import Cycle as _Cy  # noqa: E402
from films import speech_from_words as _sfw  # noqa: E402

# ---- Recipe A: a 12 s type-only short, three cards and the name, subtle.
# Tempo: 110 bpm (a bar 2.18 s): the cards on bar 1 beat 2, bar 2 beat 3 and the downbeat of bar 4
# (the peak), the name after 4 bars and the short ending.
_A_BPM = 110.0
_A_LAND = _R.land_after(4, _A_BPM, ending="short")
_A_BRIEF = _R.Brief("type-only", 12.0, ("calm", "certain", "warm"), "subtle",
                    moments=[(6.545, "peak")], logo_at=_A_LAND,
                    cards=[(0.545, "your apps"), (3.273, "your rules"), (6.545, "yours")])
RECIPE_A = _R.type_short(
    # the brief gives subtle (quiet logo, -16.5 LUFS), the peak and the hits
    "recipe-a-example", 12.0, land=_A_LAND, bpm=_A_BPM, seed=21, brief=_A_BRIEF,
    # WHY these choices: two chords, one per 2 bars, the same top note (G) in both; no tune (in
    # 12 s the logo is the one statement); one change: the pad opens a little for the last card
    chords="Ebmaj9 Ebmaj9 Abmaj9 Abmaj9",
    changes=[(3, "brightness", 1.25)],
    notes="Recipe A worked example: pad + circling pedal pulse, two chords, one change, the quiet logo.",
    # WHY these explanations (the dashboard rule: explain an out-of-range gauge, never bend the music)
    explain={"tilt": "-12.2: a soft felt pulse and a pad with no tune, about the owner's own piano logo (-11); "
                     "information for his ear, not a reason to brighten anything",
             "level-rate": "the dip between the pulse's B-flat 4 (7.62 s) and F4 (8.16 s), a rest step, then the "
                           "quiet logo rising: the pad at the plan's -8 dB does not fill that gap (gap-fill 5.1); "
                           "the owner's pad_level A/B decides it",
             "logo-gentle": "the quiet logo lands 1.0 dB over the last card's bar, exactly at the limit"})

# ---- Recipe B: a 36 s app demo, cuts every 4 bars, the peak at bar 13, the full logo.
_B_BPM = 116.0
_B_LAND = _R.land_after(15, _B_BPM)
_B_BRIEF = _R.Brief("app-demo", 36.0, ("bright", "easy", "capable"), "present",
                    moments=[(8.276, "the editor"), (16.552, "the theme"), (24.828, "peak")], logo_at=_B_LAND,
                    picture=[(0.0, "open"), (8.276, "the editor"), (16.552, "the theme"), (24.828, "it works")])
RECIPE_B = _R.app_demo(
    "recipe-b-example", 36.0, land=_B_LAND, bpm=_B_BPM, seed=23, brief=_B_BRIEF,
    # WHY: the bright vocabulary, one chord per 2 bars, every change keeping at least one note; a
    # second pass through the same four chords is the bed; the last pair turns to Ab/Bb for the lift
    chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Ab/Bb",
    # the cell, then the cell again (the bank may vary its last note), and the peak phrase on the
    # payoff; bed alone for three bars between them
    tune=[(4, "cell"), (9, "cell"), (13, "from-top")],
    # WHY these offsets: a cycle never sounds with a tune phrase, so its rounds are placed in the
    # bed-alone bars (cycle1 at bars 5, 8 and 11; cycle2 after the peak, bar 14), where they ARE
    # the variety; with the recipe's default offsets most rounds met a tune phrase and were left out
    cycles=[_Cy("Bb5/0.5 G5/1", period=23, offset=13, name="cycle1"),
            _Cy("F5/1 D5/1", period=29, offset=22, name="cycle2", touch=0.26)],
    # one change at each cut (8.3 s: the first cycle; 16.6 s: the sub) and, at the peak (24.8 s),
    # the strings and the second cycle (the peak is the one bar line that may carry two). WHY the
    # second cycle at the peak and not at 16.6 s: brought in there, it met cycle1 in bar 11 and the
    # foreground filled 43 % of bars 7-14 (two cycles in one bar between two tune phrases: busy).
    # WHY every cycle brought in by name: one left out plays from the start, an unplanned change.
    changes=[(5, "in", "cycle1"), (9, "in", "sub"), (13, "in", "held"), (13, "in", "cycle2"), (13, "peak")],
    notes="Recipe B worked example: pad + circling pedal pulse + two co-prime cycles, three tune phrases, "
          "a change at each cut, the strings, sub and a 2.5 dB lift into the peak.",
    explain={"chord-variety": "36 s is twice round four chords plus the turn: with 7 changes nearly every 3-chord run "
                              "is new because the piece is short, not because the harmony wanders",
             "fg-duty": "bars 7-14 hold the restatement (bar 9), the peak phrase (bar 13) and three cycle rounds "
                        "between them (40 %): recipe B's three phrases fall within 8 bars of each other in a "
                        "36 s demo; over 60 s they spread out. For the owner's ear: two phrases may suit 36 s",
             "level-rate": "the dip between two pulse notes at 11.7 s (a rest step): the pad at the plan's -8 dB "
                           "does not fill it (gap-fill 4.3; 3.5 at pad_level -4); the owner's A/B"})

# ---- Recipe C: a narrated stretch, the storybook voice from 0 to "...wonderful happened." with
# 1.5 s of music before her first word; the turn at "However," (21.4 s in her file = 22.9 s here).
_WORDS = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "..", "film",
                                         "src", "round2", "take1-words-lily.json"))
_VOICE = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "..", "film",
                                         "public", "audio", "voice-take1-lily.wav"))
_C_SPEECH = _sfw(_WORDS, 0.0, t_to=25.6, start_at=1.5)
_C_LAND = _R.land_after(16, 120.0)          # her band's value nearest 120 is 120 itself
RECIPE_C = _R.narrated(
    # the brief gives subtle (the quiet logo, a 2 dB rise after her words, -16.5 LUFS) and the peak
    "recipe-c-example", 36.0, land=_C_LAND, speech=_C_SPEECH, turn=22.9, seed=25, whimsy=True,
    brief=_R.Brief("narrated", 36.0, ("storybook", "patient", "warm"), "subtle",
                   moments=[(22.9, "the turn"), (26.5, "peak")], logo_at=_C_LAND),
    voice_mux=dict(path=_VOICE, t_from=0.0, start_at=1.5, music_db=-10.0),
    notes="Recipe C worked example: a soft two-note pulse high above her words, dark chords on her sentence "
          "ends turning bright at 'However,', one cycle in her long pauses, a bell double of the cell, the "
          "tune after her last word.",
    explain={"change-plan": "her turn (22 s) and her last word (28 s) are 6 s apart, and the pulse comes down when "
                            "she stops: both belong to her script, not to an 8-16 s clock",
             "tilt": "-13.0: a two-note pulse high and very soft, a pad, and the quiet logo; darker than the "
                     "owner's piano logo (-11). Information for his ear",
             "narrator-chords": "chords can only change on a half-bar (1 s at 120): three of her sentence ends fall "
                                "0.3-0.5 s from one (a known limit of the chord grid)",
             "settle": "the bar before the ending holds the tune's last notes, their bell double and the pulse "
                       "(9 notes); the quiet logo then lands alone",
             "speech-covers": "a worked example cut at '...wonderful happened.': her story goes on in the film",
             "level-rate": "the dip between two pulse notes at 6.3 s, then the chord change at 7 s (her sentence end) "
                           "with its low root: the pad at -8 dB does not fill the gap (gap-fill 5.7)",
             "logo-gentle": "the 'peak' (26.5 s) is her last words, under her at the hand-set -6 dB; the logo is the "
                            "first thing heard without her, 4.5 dB over that bar",
             "voice-steady": "bar 12 rises 2.9 dB under her words: her turn ('However,'), the bright E-flat chord "
                             "struck with its low root; a planned chord change on her sentence end, not a swell"})

DEMOS += [RECIPE_A, RECIPE_B, RECIPE_C]
