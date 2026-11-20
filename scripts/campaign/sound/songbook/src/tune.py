"""THE TUNE, THE ANSWER and THE CHORDS: the songbook's musical material.

Everything is in E-flat major (its darker form uses C minor, which has the same seven notes).
Times are in BEATS (quarter notes); bar k (1-based) starts at beat 4(k-1). Nothing here knows
about tempo, so every block works at any speed.

THE TUNE is the one chamber-1 and chamber-2 share (two of the three pieces the owner said yes
to); see SONGBOOK.md for why it was chosen over blend-1's. It is eight bars in two phrases that
start the same way, plus a one-bar ending that hands over to the sound logo:

    bar 1  B-flat G F E-flat        the signature "you-co-ded", one step further down
    bar 2  E-flat C B-flat G        the same shape, higher
    bar 3  A-flat G E-flat C        falls back
    bar 4  E-flat D (long)          hangs open: a question
    bars 5-6 = bars 1-2
    bar 7  C B-flat A-flat G        from the top
    bar 8  F G A-flat B-flat        climbs back up toward home
    ending C (long) B-flat (long)   a sigh onto B-flat, the logo's own first note
"""
from dsp import note

# ------------------------------------------------------------------ THE TUNE
PHRASE_1 = [
    (0, "Bb4", 1), (1, "G5", 1), (2, "F5", 1.5), (3.5, "Eb5", 0.5),          # bar 1
    (4, "Eb5", 1), (5, "C6", 1), (6, "Bb5", 1.5), (7.5, "G5", 0.5),          # bar 2
    (8, "Ab5", 1.5), (9.5, "G5", 0.5), (10, "Eb5", 1), (11, "C5", 1),        # bar 3
    (12, "Eb5", 1.5), (13.5, "D5", 2.5),                                     # bar 4
]
PHRASE_2 = [(b + 16, n, d) for b, n, d in PHRASE_1[:8]] + [
    (24, "C6", 1), (25, "Bb5", 1), (26, "Ab5", 1.5), (27.5, "G5", 0.5),      # bar 7
    (28, "F5", 1.5), (29.5, "G5", 0.5), (30, "Ab5", 1), (31, "Bb5", 1),      # bar 8
]
TUNE = PHRASE_1 + PHRASE_2                     # the whole tune, bars 1-8 (beats 0-32)
SIGNATURE = [(0, "Bb4", 1), (1, "G5", 1), (2, "F5", 2)]   # the three notes alone
ENDING = [(0, "C6", 1.5), (1.5, "Bb5", 2.5)]   # the ending bar's tune (into the logo)

# A tune "segment" is what a section asks for. Each maps to (notes, bars, first progression
# position). Positions 0-7 say which bar of the eight-bar progression sits under each bar.
SEGMENTS = {
    "full": (TUNE, 8, 0),
    "phrase1": (PHRASE_1, 4, 0),
    "phrase2": ([(b - 16, n, d) for b, n, d in PHRASE_2], 4, 4),
    "signature": (SIGNATURE, 2, None),  # the signature, then a bar of rest (room for a voice);
                                        # the chords simply carry on round the progression
    "rest": ([], 1, None),            # one bar with no tune (the accompaniment carries on)
}


def tune_index(name_beat):
    """Canonical position of a tune note (for the 'same tune everywhere' check)."""
    return TUNE.index(name_beat) if name_beat in TUNE else None


# ------------------------------------------------------------------ THE CHORDS
# One progression, two forms. Each bar lists one or two chords (two = two beats each).
#   bright: E-flat | C minor 7 | A-flat major 7 | B-flat sus, B-flat 7          (x2)
#   dark:   C minor | A-flat major 7 | F minor 7 | C minor over G, G major
#           C minor | A-flat major 7 | F minor 7 | A-flat, B-flat sus           (the turn)
# WHY this dark form: C minor is E-flat major's relative minor and uses the same seven notes,
# so EVERY TUNE NOTE STAYS EXACTLY THE SAME; only the floor under it darkens. The one new note,
# B natural, lives only in the accompaniment's G major chord (bar 4), the pull of a minor key.
# Bar 8 of the dark form rises A-flat, B-flat: the classic way out of a minor key, so the
# dark form can lead straight into the bright one (the TURN).
PROGRESSION = {
    "bright": [["Eb"], ["Cm7"], ["Abmaj7"], ["Bbsus", "Bb7"],
               ["Eb"], ["Cm7"], ["Abmaj7"], ["Bbsus", "Bb7"]],
    "dark": [["Cm"], ["Abmaj7"], ["Fm7"], ["Cm/G", "G"],
             ["Cm"], ["Abmaj7"], ["Fm7"], ["Ab", "Bbsus"]],
}
TURN = ["Ab", "Bbsus"]            # replaces a section's last bar to lead into a brighter one
ENDING_CHORDS = ["Ab", "Bbsus"]   # the ending bar: then the logo lands on E-flat

# Voicings: for each chord, the notes every block reads.
#   root  plucked cello / bass note        sub   sine sub note
#   fig   rolling piano (blend-1): low root, fifth, tenth, fifth
#   rock  rocking piano (chamber-2): root, fifth, tenth, fifth one octave up
#   off   the violas' plucked two-note off-beat chord (chamber-1)
#   lh    a soft left-hand chord (held chords, sparse pattern, fermatas)
#   bow   three held string voices, low, moving as little as possible
#   air   one high held violin note (a quiet, continuous line; never an accent)
# WHY these voicings avoid the tune's own notes above middle C where they can: an accompaniment
# note at the tune's pitch, or an octave below it, blurs the tune (measured in chamber-1/2).
V = {
    # ---- bright form
    "Eb":     dict(root="Eb2", sub="Eb2", fig=["Eb2", "Bb2", "G3", "Bb2"], rock=["Eb3", "Bb3", "G3", "Bb3"],
                   off=["G3", "Bb3"], lh=["Eb2", "Bb2", "G3"], bow=["Eb3", "G3", "Bb3"], air="Eb6"),
    "Cm7":    dict(root="C2", sub="C2", fig=["C2", "G2", "Eb3", "G2"], rock=["C3", "G3", "Eb4", "G3"],
                   off=["G3", "Eb4"], lh=["C2", "G2", "Bb2"], bow=["Eb3", "G3", "Bb3"], air="Eb6"),
    "Abmaj7": dict(root="Ab2", sub="Ab1", fig=["Ab1", "Eb2", "C3", "Eb2"], rock=["Ab2", "Eb3", "C4", "Eb3"],
                   off=["Ab3", "C4"], lh=["Ab1", "Eb2", "C3"], bow=["Eb3", "Ab3", "C4"], air="Eb6"),
    "Bbsus":  dict(root="Bb2", sub="Bb1", fig=["Bb1", "F2", "Eb3", "F2"], rock=["Bb1", "Eb3", "Ab3", "Eb3"],
                   off=["Ab3", "Eb4"], lh=["Bb1", "F2", "Eb3"], bow=["Eb3", "Ab3", "Bb3"], air="Eb6"),
    "Bb7":    dict(root="Bb2", sub="Bb1", fig=["Bb1", "F2", "Ab2", "F2"], rock=["Bb2", "F3", "D4", "F3"],
                   off=["Ab3", "D4"], lh=["Bb1", "F2", "Ab2"], bow=["D3", "Ab3", "Bb3"], air="D6"),
    "Ab":     dict(root="Ab2", sub="Ab1", fig=["Ab1", "Eb2", "C3", "Eb2"], rock=["Ab2", "Eb3", "C4", "Eb3"],
                   off=["Ab3", "C4"], lh=["Ab1", "Eb2", "C3"], bow=["Eb3", "Ab3", "C4"], air="Eb6"),
    # ---- dark form (C minor)
    "Cm":     dict(root="C2", sub="C2", fig=["C2", "G2", "Eb3", "G2"], rock=["C3", "G3", "Eb4", "G3"],
                   off=["G3", "C4"], lh=["C2", "G2", "Eb3"], bow=["Eb3", "G3", "C4"], air="Eb6"),
    "Fm7":    dict(root="F2", sub="F1", fig=["F1", "C2", "Ab2", "C2"], rock=["F2", "C3", "Ab3", "C3"],
                   off=["Ab3", "C4"], lh=["F1", "C2", "Ab2"], bow=["Eb3", "Ab3", "C4"], air="Eb6"),
    "Cm/G":   dict(root="G2", sub="G1", fig=["G1", "Eb2", "C3", "Eb2"], rock=["G2", "Eb3", "C4", "Eb3"],
                   off=["G3", "C4"], lh=["G1", "Eb2", "C3"], bow=["Eb3", "G3", "C4"], air="Eb6"),
    "G":      dict(root="G2", sub="G1", fig=["G1", "D2", "B2", "D2"], rock=["G2", "D3", "B3", "D3"],
                   off=["G3", "B3"], lh=["G1", "D2", "B2"], bow=["D3", "G3", "B3"], air="D6"),
}
CHORD_TONES = {   # pitch classes (0 = C) that a landing note may sit on
    "Eb": {3, 7, 10}, "Cm7": {0, 3, 7, 10}, "Abmaj7": {8, 0, 3, 7}, "Bbsus": {10, 3, 5, 8},
    "Bb7": {10, 2, 5, 8}, "Ab": {8, 0, 3}, "Cm": {0, 3, 7}, "Fm7": {5, 8, 0, 3},
    "Cm/G": {7, 0, 3}, "G": {7, 11, 2},
}

# ------------------------------------------------------------------ THE ANSWER
# blend-1's idea: after each bar of the tune, a second piano answers with a three-step ladder
# (eighth, eighth, then a quarter that lands on the next downbeat), and the ladders climb.
# Re-written to sit UNDER this tune: each ladder was checked against the tune's notes at the
# same moment (never the same note or an octave of it where the tune starts a note).
# Keyed by progression position (the bar the ladder starts in).
ANSWER = {0: ["G4", "Ab4", "Bb4"], 1: ["Ab4", "Bb4", "C5"], 2: ["G3", "Ab3", "Bb3"],
          3: ["C4", "D4", "Eb4"], 4: ["G4", "Ab4", "Bb4"], 5: ["C5", "D5", "Eb5"],
          6: ["G4", "Ab4", "Bb4"], 7: ["F4", "G4", "Ab4"]}
ANSWER_RHYTHM = [(3.0, 0.5), (3.5, 0.5), (4.0, 1.0)]   # beats within the bar (4.0 = next downbeat)

_SCALE = [0, 2, 3, 5, 7, 8, 10]   # E-flat major as pitch classes from C (C D Eb F G Ab Bb)


def scale_step(m, k):
    """Move midi note m by k steps of the E-flat major scale."""
    pcs = sorted(_SCALE)
    octv, pc = divmod(m, 12)
    i = pcs.index(pc)
    i += k
    return 12 * (octv + i // 7) + pcs[i % 7]


def fit_ladder(ladder, landing_chord):
    """If the ladder would land on a note outside the chord it lands on (e.g. the bright
    ladders over the dark chords), slide the whole ladder down the scale until it lands on a
    chord tone: the same three-step climb, re-aimed. Returns midi notes."""
    ms = [note(x) for x in ladder]
    for _ in range(7):
        if ms[-1] % 12 in CHORD_TONES[landing_chord]:
            return ms
        ms = [scale_step(m, -1) for m in ms]
    return ms


def third_below(m):
    """The note a scale third below (for the answer in two voices)."""
    return scale_step(m, -2)
