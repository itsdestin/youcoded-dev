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

ONE PIECE: recipe B (app demo, v4), one pair of hands. The chord-following piano figure and the
soft pad from the first beat; the tune woven in as whole two-bar phrases that begin on the
picture's turns; one rise into the payoff, the quiet logo.

FIX PASS (the mix engineer's review of the first two sketches, which differed only straight vs
swung):
  1. ENERGY (his A2: "the music needs to better match the busier/higher-energy nature of this
     specific video"). From the money chat (bar 17), the third and last conversation, the same
     hands play more: the left hand strikes the root on beats 1 AND 3 (it held one root a bar),
     and the right hand's figure gains sixteenth notes from the same chord (A: a skip on beats 2
     and 4; B: running sixteenths). Nothing new joins: no cycles, no strings, the same piano.
     The A/B is now the open question for this film: how much more the hands play.
  2. THE RISE WRITTEN TO THE PICTURE. The chords hold the dominant through the email (bar 24
     B-flat 9sus, bar 25 A-flat over B-flat) so E-flat major 9 arrives ON the payoff's bar line
     (bar 26), not one bar early. Every cut in the window now gets a chord change (bills: F minor
     9; payoff: E-flat; money: A-flat; line one: C minor). The rise is played, not ridden on the
     fader: one touch curve for the whole piano (figure, left hand and tune together) rising from
     the email cut, held through the payoff and the money, easing from line one; the pad's filter
     opens a little with it, bar by bar.
  3. THE PEAK PHRASE HAS A BODY: the payoff's arc (E-flat 5 G5 B-flat 5 C6 B-flat 5) is played in
     sixths by the same hand (G4 B-flat 4 D5 under the first bar, E-flat 5 held under C6), so the
     high notes are no longer alone 17 semitones above the pad.
  Straight eighths in both (he liked straight and swung; choose after the energy is settled).

THE SKETCH WINDOW: 39.375-54.375 s of the re-cut (bars 22-29), starting ON the bills cut and the
start of a tune phrase (the first pass started half-way through a phrase). Cuts inside: 41.25,
43.125, 46.875 (the payoff), 48.75, 50.625, and line two's text at 52.969.
    render.sh --sketch r10-mim-a r10-mim-b from=39.375 len=15 picture=<mim-recut.mp4> lag=0.15
    render.sh --py film_r10_mim.py deliver
"""
import os as _os
import re

import numpy as _np

import recipes as R
import tunebank as TB
from films import Film
from motif import write

BPM = 128.0
LAND = R.land_after(29, BPM, "short", odd=2)      # 56.25: bars 1-29, the odd bar, the pick-ups
PEAK = 46.875                                     # the payoff's bar line (bar 26)
FULL_FROM = 17                                    # the money chat: the hands play more from here
WINDOW = (39.375, 15.0)                           # the sketch: the bills cut to just before the odd bar
LAG = 0.15                                        # his A1 pick on Own everything (notes speak ~20 ms early)
_HERE = _os.path.dirname(_os.path.abspath(__file__))
PICTURE_FILE = _os.path.normpath(_os.path.join(_HERE, "..", "..", "..", "film", "out", "r10", "mim-recut.mp4"))
DELIVER = "/home/destin/Documents/youcoded-campaign/round10/sketches"

# THE CHORDS, written out (the first pass let the recipe bend its default 2-bar cycle; that put
# E-flat on bar 25, mid-email, a bar before the payoff). Bars 1-21 are exactly what the recipe's
# tune-led chords gave before, so the film up to the money chat is unchanged. Composer-written
# chords are checked: a held tune note outside its chord stops the build.
# WHY each window chord: 22 Fm9 on the bills cut (it holds the phrase's A-flat 5 and E-flat 5, and
# shares three notes with the A-flat before it, so the cut is marked softly); 23 Ebmaj9 (the
# phrase's held D5 is its seventh); 24-25 the dominant held through the email, B-flat 9sus then
# A-flat over B-flat (the same bass, the tension growing); 26 Ebmaj9 ON the payoff; 27 Abmaj9 on
# the money cut (holds C6 and the doubled E-flat 5; IV after I, the music opening out); 28 Cm9 on
# line one (the settle); 29 Abmaj9, carried through the odd bar into the ending's B-flat sus.
CHORDS = [["Ebmaj9"], ["Ebmaj9"], ["Cm9"], ["Cm9"], ["Cm11"], ["Abmaj9"], ["Bb9sus"], ["Bb9sus"],
          ["Abmaj9", "Ebmaj9"], ["Ebmaj9"], ["Cm9"], ["Cm9"], ["Abmaj9"], ["Abmaj9"], ["Cm11", "Bb9sus"],
          ["Bb9sus"], ["Ebmaj9"], ["Ebmaj9"], ["Cm9"], ["Cm9"], ["Abmaj9"],
          ["Fm9"], ["Ebmaj9"], ["Bb9sus"], ["Ab/Bb"], ["Ebmaj9"], ["Abmaj9"], ["Cm9"], ["Abmaj9"]]

# THE TUNE as whole two-bar phrases, each starting ON a picture turn's bar line (global bars).
# WHY these bars: the first look change (4), the home (9), the page it made (12), the money (17),
# the bills found (22), and the payoff (26). The two written answers at 14 and 20 are each
# conversation's SECOND request ("now make the sliders bigger", "can it pull out my bills"): a
# phrase that climbs and settles on E-flat, answering the cell.
ANSWER_HOME = write("G5/1 Ab5/1 Bb5/2 | G5/1.5 F5/0.5 Eb5/2", label="answer, home")
ANSWER_MONEY = write("G5/1 F5/1 Eb5/2 | Bb4/1 C5/1 Eb5/2", label="answer, money")
# WHY the peak in sixths (review: C6 sat 17 semitones above the pad's top note with nothing between,
# the nearest thing here to the "thrown-in" high notes he named): the same hand plays a lower voice
# a sixth under the arc's first bar (G4 B-flat 4 D5 under E-flat 5 G5 B-flat 5, each a tone of
# E-flat major 9) and holds E-flat 5 under C6 B-flat 5 (a tone of A-flat major 9), the way a
# pianist thickens a climax. It fills G4-E-flat 5, the empty middle, and adds weight to the payoff.
PEAK_ARC = TB.phrase("peak-arc") & write("G4/1 Bb4/1 D5/2 | Eb5/4", label="peak, lower sixth")
TUNE = [(4, "cell-long"), (9, "question"), (12, "rise"), (14, ANSWER_HOME), (17, "cell-long"),
        (20, ANSWER_MONEY), (22, "question"), (26, PEAK_ARC)]

# THE FIGURE in sixteenth steps (step 0.25), one token list per global bar 1-29 (each body section
# takes its own bars' slice in piece()). Bars 1-16 are the first pass's eighths written in sixteenths ("-" holds a
# token one step), so they play the same notes at the same times.
OLD = ["b - 2 - 3 - 2 - 4 - 2 - 3 - 2 -", "b - 2 - 3 - 2 - 4 - 3 - 2 - 3 -"]
# WHY these two fuller figures (review BLOCKER: the window was no busier than the film's calm
# opening, 4.9 notes a second, a median of two layers a bar, 21 of 30 off-beats the same B-flat 3):
# both strike the root on beats 1 and 3 (the left hand pushing every half bar) and move the right
# hand through more of the chord (tones 2-5, B-flat 3 to G4 over E-flat major 9), always below the
# tune. A adds a sixteenth skip at the end of beats 2 and 4 (10 notes a bar, about 5.3 a second
# from the figure); B runs sixteenths after each root (14 a bar, about 7.5 a second), the most
# the hands play in any sketch so far, still one line from one chord.
FULLER = {
    "a": ["b - 2 - 3 - 4 2 b - 3 - 2 - 4 3", "b - 3 - 2 - 4 3 b - 2 - 3 - 5 4"],
    "b": ["b - 2 3 4 3 2 3 b - 3 4 5 4 3 2", "b - 3 2 4 3 2 3 b - 2 3 4 5 4 3"],
}
# THE SHARED TOUCH CURVE. WHY (review: the
# rise was a 2.5 dB fader ride that peaked on the settle bar, and the piano's touch never moved):
# flat to the email cut (bar 24), rising to the payoff's bar line (bar 26, x1.18 = touch 0.28 ->
# 0.33, the +0.05 the review asked for), held through the payoff and the money page, easing from
# line one (bar 28) back to 1.0 at bar 29. It multiplies every piano note (figure, roots and the
# woven tune) at once, so the layers rise together. Shapes are per section, in beats from the
# section's start: the lift section (bars 24-27) and the settle section (bars 28-29).
# WHY the settle's shape starts at 1.0 and reaches 1.18 one beat in: the toolkit returns a section's
# shape to 1.0 over the beat after it ends, and the two curves multiply; crossing over that one
# beat keeps the product at 1.18-1.19 instead of a jump to 1.39 on line one's bar line.
SHAPES = {24: [(0.0, 1.0), (8.0, 1.18), (16.0, 1.18)],
          28: [(0.0, 1.0), (1.0, 1.18), (8.0, 1.0)]}
# WHY a small fader lift as well (first try: touch alone, no fader): measured on the delivered
# window, the touch curve moved the bars only 0.3 dB (payoff bars -18.0/-18.2, line one -17.8), the
# pad holding its level under it. +1.5 dB (the first pass rode +2.5) is a level every layer, pad
# included, shares: it rises from the email cut over two bars, holds through bars 26-27, and the
# settle at line one comes 1 dB down (toolkit: lift - 1.0).
LIFT = (2, 1.5)
# The pad's filter follows the same curve, bar by bar (each change multiplies the last; at most
# x1.2, 900 -> 1080 Hz, well under the 1500-1800 Hz that let it own 2-6 kHz).
PAD_CURVE = [(24, "brightness", 1.08), (25, "brightness", 1.11), (28, "brightness", 1.0 / 1.2)]


def piece(name, key):
    p = R.app_demo(
        name, 60.0, land=LAND, bpm=BPM, peak=PEAK, odd=2, odd_at=30, ending="short", seed=10,
        chords=CHORDS, tune=TUNE,
        lift=LIFT,
        changes=[(26, "peak")] + PAD_CURVE,
        owner_over={"swing": "straight"},
        notes=f"Make it mine round 10, sketch {key.upper()}: 128 bpm on the re-cut's bar lines, the hands play more "
              f"from the money chat ({'a sixteenth skip on beats 2 and 4' if key == 'a' else 'running sixteenths'}, "
              "roots on 1 and 3), chords held to the payoff, one touch curve for the rise, the peak in sixths, "
              "the quiet logo.")
    bars = OLD * 8 + FULLER[key] * 7                     # 16 bars as before, then bars 17-29 (13; cycled)
    for s in p.sections:
        m = re.search(r"\(bars (\d+)-(\d+)\)", s.label)
        if m:
            # each body section (bed 1-23, lift 24-27, settle 28-29) takes its own bars' figures
            a, z = int(m.group(1)), int(m.group(2))
            s.step = 0.25
            s.figure = bars[a - 1:z]
            s.shape = SHAPES.get(a)
        elif s.label.startswith("odd bar"):
            # WHY the fuller figure in the 2-beat odd bar too: it is the last bar before the logo's
            # pick-ups; dropping back to plain eighths there would be a texture change on no cut
            # (only its first half, 2 beats, sounds)
            s.step = 0.25
            s.figure = FULLER[key][0]
    return p


PICTURE = [(0.0, "the plain app"), (5.625, "Golden Sunbreak"), (11.25, "Devil's Garden"), (15.0, "the home chat"),
           (20.625, "the home page"), (24.375, "chat"), (26.25, "page"), (30.0, "the money chat"),
           (31.875, "money page"), (35.625, "chat"), (39.375, "bills"), (41.25, "chat"), (43.125, "the email"),
           (46.875, "the payoff"), (48.75, "money"), (50.625, "line one"), (52.969, "line two"),
           (56.25, "youcoded (name)"), (60.0, "end")]

FILMS = [Film("r10-mim-a", piece("r10-mim-a", "a"), picture=PICTURE, copy_to=None),
         Film("r10-mim-b", piece("r10-mim-b", "b"), picture=PICTURE, copy_to=None)]


def deliver():
    """mim-a.mp4 / mim-b.mp4 from the sketches (out/sketches/r10-mim-?-sketch.mp4): the sketch's
    audio, a plain gain to -16 LUFS (no limiter, nothing pumps), refused if the true peak would pass
    -1 dBTP; the sketch's picture copied as is."""
    import subprocess
    import tempfile
    import pyloudnorm as pyln
    import soundfile as sf
    from scipy.signal import resample_poly
    _os.makedirs(DELIVER, exist_ok=True)
    sk = _os.path.normpath(_os.path.join(_HERE, "..", "out", "sketches"))
    for key in ("a", "b"):
        y, sr = sf.read(_os.path.join(sk, f"r10-mim-{key}-sketch.wav"), always_2d=True)
        y = y * 10 ** ((-16.0 - pyln.Meter(sr).integrated_loudness(y)) / 20)
        tp = 20 * _np.log10(_np.abs(resample_poly(y, 4, 1, axis=0)).max())
        if tp > -1.0:
            raise SystemExit(f"mim-{key}: true peak {tp:.2f} dBTP at -16 LUFS; not delivered")
        with tempfile.TemporaryDirectory() as td:
            wav = _os.path.join(td, "a.wav")
            sf.write(wav, y, sr, subtype="PCM_24")
            mp4 = _os.path.join(DELIVER, f"mim-{key}.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", _os.path.join(sk, f"r10-mim-{key}-sketch.mp4"),
                            "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                            "-t", f"{WINDOW[1]:g}", mp4], check=True)
        print(f"mim-{key}: {mp4}  -16.0 LUFS, true peak {tp:.2f} dBTP")


if __name__ == "__main__":
    import sys
    if "deliver" in sys.argv:
        deliver()
