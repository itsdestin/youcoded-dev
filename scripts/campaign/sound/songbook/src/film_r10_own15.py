"""Make it mine, 15 s social cut-down (round 10, key "own15"): two feel sketches, A and B.

THE PICTURE (cut here from round4/make-it-mine.mp4 with ffmpeg, one 128 bpm grid, a bar = 1.875 s,
every cut on a bar line; 450 frames at 30 fps; the cut command is CUT below):
   0.000  bar 1  "can i change how this whole thing looks?" typed and sent (source 0-5 s at 1.34x)
   3.733  bar 3  THE TURN: the app turns to rainy anime Tokyo (source 5.0 s); "actuallyyy gimme
                 desert. i'm an ASU boy" typed and sent (source 5-10.5 s at 0.98x)
   9.367  bar 6  THE PAYOFF: the desert theme (source 10.5 s; held to 14.0 s at 0.94x)
  13.100  bar 8  the name (source 56.0 s: a blank frame, the logo from 13.133 s), held to 15.0 s
The cuts are at the frame at or just before each bar line (3.75, 9.375 and 13.125 s are not whole
frames at 30 fps). The sketches are mixed with the music LAG = 0.12 s after the picture, the round-10
figure (his A1 pick was C, about 0.15 s): each landing is heard 0.12-0.14 s after its cut.

WHY 128 bpm: a quick, bright feed cut of the film he said needed "the busier/higher-energy nature
of this specific video" (A2); 120 was the full film's tempo, so this is a step faster, and at 128
the two theme changes, which are 5.5 s apart in the source, are three bars apart (5.625 s) with
the middle stretch played at 0.98x, i.e. nearly as filmed. WHY one 2-beat bar before the ending
(odd=2 at bar 7): the short ending's two pick-up beats then land the name on bar 8's line, the
same grid the picture is cut on, with 1.875 s of ring after it.

THE HARMONY (written, the tune fitted to it, every held tune note a chord tone and doubled lower):
   bars 1-2  Ebmaj9           the question: home key, the figure and pad alone
   bars 3-4  Cm11 | Cm9       rainy Tokyo: the relative minor (the turn), the tune's first phrase
   bar 5     Bb9sus           "actually...": the pivot that wants to go home
   bar 6-7   Ebmaj9           the desert: arrival, the tune's climb to its top note B-flat 5
   pick-up   Eb/Bb            the logo's B-flat 4 and G5 over E-flat with B-flat in the bass
   landing   Ebmaj9           the logo's F5 over the opening chord (the pad's F4 doubles it)
Every change keeps notes of the last chord. From bar 6 to the end the pad does not move at all
(Eb3 Bb3 F4 G4, the chord the piece began on), so the ending is the same music settling, not a
new instrument arriving.

THE FIX PASS (2026-11-25, after the mix engineer's findings):
 - the name is played by the same piano as the tune ("piano" bus, the tune's tone, a touch just
   under the desert payoff), not the separate brighter "lead" voice at touch 0.43-0.61;
 - the chords under the name hold its notes (G5 over G4, F5 over F4) instead of a B-flat sus
   with A-flat under the G5 and no F under the landing F5;
 - one dynamic shape for the whole band: bars 1-2 at rest, a step up on the Tokyo cut, a rise
   into the desert, settling over the name; the pad's level follows the same shape where it is
   struck, and keeps four notes in every chord so it no longer thins out after changes;
 - a firmer hand overall (the figure at the deck's 0.34 setting, between his "A: ours, soft"
   0.28 and the 0.40 of the pulse and brightness clips he picked), since he asked for energy.

A and B are the same notes; B is gently swung (the owner liked both pulses, E2 C and D, and has
not said which suits a quick film).
"""
import bed as BED
import blocks as B
import recipes as R
import tune as T
from dsp import note
from films import Film
from motif import write

KEY = "own15"
SRC = "/home/destin/Documents/youcoded-campaign/round4/make-it-mine.mp4"
# The picture as cut (kept here so the cut can be rebuilt; frames: 112 + 169 + 112 + 57 = 450).
# WHY setpts by frame counts: each segment ends on the frame at or before its bar line
CUT = ("ffmpeg -i " + SRC + " -filter_complex \""
       "[0:v]trim=start=0:end=5,setpts=(PTS-STARTPTS)*112/150,fps=30,trim=end_frame=112,setpts=PTS-STARTPTS[a];"
       "[0:v]trim=start=5:end=10.5,setpts=(PTS-STARTPTS)*169/165,fps=30,trim=end_frame=169,setpts=PTS-STARTPTS[b];"
       "[0:v]trim=start=10.5:end=14,setpts=(PTS-STARTPTS)*112/105,fps=30,trim=end_frame=112,setpts=PTS-STARTPTS[c];"
       "[0:v]trim=start=56:end=58,setpts=PTS-STARTPTS,fps=30,trim=end_frame=57,setpts=PTS-STARTPTS[d];"
       "[a][b][c][d]concat=n=4:v=1:a=0[v]\" -map [v] -an -c:v libx264 -crf 16 -pix_fmt yuv420p own15-picture.mp4")
LAG = 0.12      # WHY: the music 0.12 s after the picture, the same figure as the storybook sketch

BPM, ODD, ODD_AT = 128.0, 2, 7
BAR = 4 * 60.0 / BPM                              # 1.875 s
LAND = R.land_after(6, BPM, "short", odd=ODD)     # 6 bars + 2 beats + the 2 pick-up beats = 13.125 s

# WHY feel "present" (was "subtle"): subtle put a 0.85 hand on every piano note and asked for the
# quiet, inward version; he said this film needs "the busier/higher-energy nature" (A2)
BRIEF = R.Brief("type-only", 15.0, ("quick", "bright", "playful", "warm"), "present",
                moments=[(2 * BAR, "turn: Tokyo"), (5 * BAR, "peak")], logo_at=LAND,
                picture=[(0.0, "can i change how this whole thing looks?"), (1.13, "sent"),
                         (3.733, "rainy anime Tokyo"), (8.57, "actuallyyy gimme desert. i'm an ASU boy"),
                         (9.367, "the desert"), (13.1, "youcoded (name)"), (15.0, "end")])

# THE TUNE, two 2-bar phrases on the two theme changes, written first and the chords above chosen
# to hold every held note.
# Phrase 1 (bar 3, the Tokyo cut): the cell itself, B-flat G F, F held over Cm11 (its 11th), then
# a falling answer that settles on E-flat held over Cm9 (its third): the rainy, minor turn.
# Phrase 2 (bar 5, "actually..."): climbs F G to A-flat held over Bb9sus (its 7th), then B-flat 5
# held over the desert's Ebmaj9 (its 5th), the top note of the piece on the payoff; the logo
# (B-flat, G, F) answers it after the 2-beat breath.
# WHY no tune in bars 1-2: the question is asked over the bed alone, so the tune arrives WITH the
# first change of look rather than being laid over the typing.
TUNE = [(3, write("Bb4/1 G5/1 F5/2 | Eb5/1 D5/1 Eb5/2", label="tokyo")),
        (5, write("F5/1 G5/1 Ab5/2 | Bb5/3 G5/1", label="desert"))]
CHORDS = "Ebmaj9 Ebmaj9 Cm11 Cm9 Bb9sus Ebmaj9"

# THE FIGURE'S TOUCH. WHY 0.32: the deck's "piano-soft" clip he chose was the figure at 0.28, and
# the pulse ("D") and brightness ("B: middle") clips he also picked played it at 0.40; this lively
# film sits between them. Played through the hand (0.92) and the bed's level it is about 0.26 at
# rest and about 0.30 at the desert (it was 0.21 throughout). 0.34 was tried: the tune then
# reached 0.41 at the desert, firmer than "a touch at most a little firmer" than the figure.
FIG_TOUCH = 0.32

# THE SHAPE, one for every piano part (x the band's touch; the pad follows it where it is struck).
# WHY: the body was level from start to name; the picture has a question, a turn and a payoff.
# Bars 1-2 at rest (no shape); a step up ON the Tokyo cut; a climb through "actually..." into the
# desert; easing back a little before the name. Beats from the start of bars 3-6.
SHAPE = [(0.0, 1.06), (8.0, 1.07), (12.0, 1.13), (16.0, 1.10)]
# The 2-beat bar 7: bars 3-6's curve falls back to 1.0 over one beat after their end, so this one
# rises as that falls: together 1.10 -> ~1.07 -> ~1.03, settling into the name
SHAPE_ODD = [(0.0, 1.0), (1.0, 1.07), (2.0, 1.03)]
# THE LEVEL, by the recipe's own lift (at most 1.5 dB): from the Tokyo cut (bar 3) the music
# rises 1.5 dB over three bars into the desert and settles 1 dB at bar 7, before the name.
# WHY both: touch alone changes the piano's colour more than its level (every bus is levelled
# as a whole); the first pass with the shape alone measured -19.5 / -19.0 / -19.7 / -19.0 dB for
# bars 1-2, 3-4, 5 and the desert: still flat.
LIFT = (3, 1.5)

# THE PAD, voiced by hand (beat of the span -> notes). WHY each:
#   every chord keeps four notes (Cm9 had thinned to three and the pad dipped 5-7 dB just as the
#   tune landed its held notes); every held tune note has its own pitch lower down (F5/F4,
#   Eb5/Eb3, Ab5/Ab4, Bb5/Bb3), and so do the logo's G5 and F5 (G4, F4);
#   Bb9sus is split: its A-flat 4 enters on beat 3 with the tune's held A-flat 5, not under the
#   passing G5 on beat 2 (a major seventh rub), and F4 is added under the tune's F5;
#   from the desert (beat 20) to the end one unchanged chord, Eb3 Bb3 F4 G4, the opening voicing.
PAD = {0: [(4 * 2, "Eb3 Bb3 F4 G4")],
       8: [(4, "Eb3 C4 F4 G4")],
       12: [(4, "Eb3 Bb3 C4 G4")],
       16: [(2, "Eb3 Bb3 C4 F4"), (2, "Eb3 Bb3 C4 F4 Ab4")],
       20: [(6, "Eb3 Bb3 F4 G4")],
       26: [(2, "Eb3 Bb3 F4 G4")],
       28: [(None, "Eb3 Bb3 F4 G4")]}

# THE NAME, played by the tune's own piano. WHY these touches: the body's tune plays 0.31-0.38
# (rising to the desert); the name settles under the payoff: the cell 0.30 / 0.31, the landing
# F5 the accent at 0.34 (the old logo played 0.43 / 0.49 / 0.61 over a tune at 0.24-0.29). The landing chord at the bass's own touch (0.26 / 0.23 / 0.22),
# where it was 0.36 / 0.26 / 0.23 with the old logo.
LOGO_TOUCH = (0.30, 0.31, 0.34)
LAND_CHORD = (("Eb2", 0.26), ("Bb2", 0.23), ("G3", 0.22))
# THE PICK-UP'S HELD CHORD (blocks.play_accomp writes B-flat 1, E-flat 3, A-flat 3 for every short
# ending). WHY re-voiced: its A-flat 3 sat under the logo's G5 (a major seventh / minor ninth rub,
# and no G anywhere below); Eb/Bb is B-flat 1, E-flat 3, G3, so G5 is doubled at G3 and G4 (pad).
# WHY these touches: its B-flat 1 was the loudest bed note so far (0.35); now the bass's own touch.
PICKUP = {"Bb1": ("Bb1", 0.25), "Eb3": ("Eb3", 0.23), "Ab3": ("G3", 0.23)}
# WHY +0.1: this piano's high notes sit left in the recording (the old logo's stem read 7.3 dB
# louder on the left); a small turn right puts the name where the rest of the band is
LOGO_PAN = 0.10


def _voice_by_hand(orig):
    def voice(self):
        out = orig(self)
        if not getattr(self.piece, "own15", False):
            return out
        res = []
        for beat, beats, chord, combo in out:
            k = int(round(beat))
            if k not in PAD:
                res.append((beat, beats, chord, combo))
                continue
            b = beat
            for n, names in PAD[k]:
                n = beats - (b - beat) if n is None else n
                res.append((b, n, chord, [note(x) for x in names.split()]))
                b += n
        return res
    return voice


def _play_name(band, plans, piece):
    """The name as the last phrase of the same piano (replaces blocks.play_logo for own15 only):
    the same cell (B-flat 4, G5, F5 landing on the name), on the bed's piano bus, in the woven
    tune's tone, at a touch just under the payoff; the landing chord at the bass's touch."""
    ep = plans[-1]
    land = ep.beat0 + ep.blen
    t_land = band.sec(land)
    tail = piece.length - t_land
    bpm_end = ep.tm.bpm_at(land)
    hand = float(getattr(piece, "touch", 1.0) or 1.0)      # band.piano multiplies by this again
    tone = -0.3 + 0.2 * plans[-2].mood["tone"]               # WHY: blocks.play_tune's woven tone
    cell = [(ep.beat0 + b - (4.0 - ep.blen), B.m_(nm), b) for b, nm, _ in T.LOGO_CELL]
    for i, (beat, m, b0) in enumerate(cell):
        is_land = i == 2
        dur = (tail - 1.2) * bpm_end / 60.0 if is_land else 0.5
        band.piano("piano", beat, m, dur, LOGO_TOUCH[i] / hand, tone=tone, pedal=True, p=LOGO_PAN,
                   jit=(0.0 if is_land else 2.0), role="lead", canon=("logo", b0), early=B.LAND_EARLY)
    ring = (tail - 1.0) * bpm_end / 60.0
    from timing import perceived_delay
    for q, (nm, v) in enumerate(LAND_CHORD):
        # WHY this early: band.piano strikes every non-logo note early by its own perceived delay
        # (22 ms for a soft low note), so the chord sounded 16 ms before the F5 it lands with; this
        # strikes it with the F5 (LAND_EARLY), the small roll (7 ms a note) kept
        band.piano("piano", land + q * 0.015 * bpm_end / 60, B.m_(nm), ring, v / hand, tone=-0.35,
                   pedal=True, p=-0.05, role="bass", early=B.LAND_EARLY - perceived_delay("piano", v / hand))
    band.landing = (t_land, cell[2][1])


def _render(orig):
    def render(band, plans, piece):
        if not getattr(piece, "own15", False):
            return orig(band, plans, piece)
        # WHY here and only for own15 pieces: the toolkit's short ending is a B-flat sus (with
        # A-flat under the logo's G5) and its logo is a separate brighter voice; this film writes
        # its own ending. Everything is swapped back after the render, so no other film changes.
        plans[-1].bars[0].chords = ["Eb/Bb"]
        old_voice, old_logo = BED.BedLine._voice, B.play_logo
        BED.BedLine._voice = _voice_by_hand(old_voice)
        B.play_logo = _play_name
        pad = band.pad

        def pad_shaped(beat, m, beats, vel, **kw):
            # WHY: the pad follows the band's one dynamic shape where it is struck, so pad and
            # piano rise into the desert together instead of swelling on their own schedules
            dyn = getattr(band, "dyn", None)
            return pad(beat, m, beats, vel * (dyn.lift(beat) if dyn is not None else 1.0), **kw)

        band.pad = pad_shaped
        piano = band.piano
        pick = plans[-1].beat0 + plans[-1].blen - 2.0
        hand = float(getattr(piece, "touch", 1.0) or 1.0)

        def piano_pickup(bus, beat, m, beats, vel, *a, **kw):
            # only the short ending's held chord: struck on the pick-up's first beat, no role
            if bus == "piano" and not kw.get("role") and pick - 1e-6 <= beat < pick + 0.1:
                hit = next((v for k, v in PICKUP.items() if note(k) == int(m)), None)
                if hit is not None:
                    return piano(bus, beat, note(hit[0]), beats, hit[1] / hand, *a, **kw)
            return piano(bus, beat, m, beats, vel, *a, **kw)

        band.piano = piano_pickup
        try:
            return orig(band, plans, piece)
        finally:
            BED.BedLine._voice, B.play_logo = old_voice, old_logo
            del band.pad, band.piano
    render.own15 = True
    return render


if not getattr(B.render, "own15", False):
    B.render = _render(B.render)


def piece(name, swing):
    # WHY everything else default (v4): the chord-following figure, the soft pad at pad_level -4,
    # the woven tune on the bed's own piano, one room; logo="piano" so the toolkit adds no swell
    p = R.type_short(
        name, 15.0, land=LAND, bpm=BPM, odd=ODD, odd_at=ODD_AT, rit=1.0, seed=12, brief=BRIEF,
        chords=CHORDS, tune=TUNE, logo="piano", touch=FIG_TOUCH, lift=LIFT, owner_over={"swing": swing},
        notes=f"own15 (Make it mine, 15 s feed cut), feel {'B: gently swung' if swing == 'gentle' else 'A: straight'}")
    p.own15 = True
    p.loudness = -16.0          # WHY: the feed sketches are delivered at about -16 LUFS
    # the lift cuts the body at bar 3: sections are bars 1-2, bars 3-6, the odd bar 7
    for s in p.sections:
        if getattr(s, "meter", 4) == ODD:
            s.shape = SHAPE_ODD
        elif "bars 3-6" in s.label:
            s.shape = SHAPE
    return p


FILMS = [Film("own15-a", piece("own15-a", "straight"), picture=BRIEF.picture, copy_to=None),
         Film("own15-b", piece("own15-b", "gentle"), picture=BRIEF.picture, copy_to=None)]
