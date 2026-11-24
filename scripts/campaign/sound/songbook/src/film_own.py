"""Own everything, the 10 s cut (take3.tsx at 172108ad5, one even 96 BPM grid): round 8.

WRITTEN AFRESH from the owner's words on round 7: "animation timing and music in own everything
feel very odd/choppy/inconsistent", and earlier, "the music should be a little more subtle".
Round 7's notes showed why: 4 of its 6 tune notes stood alone, the bed was silent for bar 1's
last 4 beats, the level moved 11.7 dB within a second. The picture now runs on one even beat, so
the music is one unbroken, even phrase on that same beat.

TEMPO: 96 BPM, the picture's own. Every line of type, the strike, the hand and the name land on
its beats (0.625 s each); four bars are exactly 10.0 s and the name arrives on beat 12 (7.5 s).

THE FOUNDATION: one soft piano figure in even eighths ("b 2 3 2 4 2 3 2": a low bass held under
chord tones rocking upward from G3), 3.2 notes a second, from the first frame to the turn into
the name. It never changes pattern; only its chords move, one per bar.

  bar  seconds    picture                                  chord     on top of the figure
  1    0.0-2.5    the lie: you'll own / nothing. /         C minor 7 the cell, once, as three words:
                  and you'll / be happy. (beats 0-3)                 B-flat 0.0, G 0.625, F 1.25 (held)
  2    2.5-5.0    strike 2.5 and 2.81, the hand writes     F minor 7 held strings enter far under the
                  3.125-3.83, dissolve 4.375-5.0                     pen and the dissolve (the figure goes on)
  3    5.0-7.5    own your data. / intelligence. /         A-flat,   the ending bar: the sigh C6 on the
                  software. / everything. (beats 8-11)     B-flat    bright page (the peak, 5.0 s), B-flat,
                                                           sus       the logo's pick-ups on "everything."
  4    7.5-10.0   the name (beat 12), still poster         E-flat    the quiet logo: F lands on the name

Layers: two at a time (the figure and the tune, or the figure and the held strings); three only
in bar 3 (figure, strings, the sigh). No sub, no air, no answer, no plucked strings, no synth.
The lift is the one colour change (minor to major as the page turns light), the strings under it
and the sigh's top note; never a jump in level.
"""
import numpy as np
from scipy import signal as sg

from dsp import SR
from films import Film, place_effect, soften
from motif import write
from score import Piece, Section as S

BPM = 96.0           # WHY 96: the picture editor put every hit on one 96 BPM grid (take3.tsx, 172108ad5)
BEAT = 60.0 / BPM    # 0.625 s

# WHY one figure for the whole film, in eighths: "one unbroken, even phrase". A bass held under
# chord tones that rock up and back is the plainest continuous pulse; 3.2 notes a second at 96.
FIG = "b 2 3 2 4 2 3 2"

# WHY these three notes on beats 0, 1, 2: the brand's cell (B-flat, G, F) said once, one note per
# line of type ("you'll own", "nothing.", "and you'll"), so the words and the tune share one beat.
# The F holds under "be happy." The logo is its second and last hearing.
CELL = write("Bb4/1 G5/1 F5/2")

COMMON = dict(bpm=BPM, accomp="figure", figure=FIG, fig_floor="G3", fig_touch=0.30,
              # WHY no sub, air, answer, pizz or synth: two layers is the norm; each of these is
              # another group (or, for air, the 4 kHz+ energy that made thin bars bright)
              pedal=True, into="flow")

PIECE = Piece(
    "own-everything-r8", 10.0, land=7.5, peak=5.0, seed=8, loudness=-17.0,
    # WHY rit=1.0: the ending keeps the picture's grid, so the pick-ups and the name stay on beats
    ending="sigh", rit=1.0, logo="quiet",
    # WHY touch 0.85: "subtle" and round 7's "busy/harsh" ruling across the films; the tune 2 dB
    # under its usual level because in a bed it is one voice of two.
    # WHY tone only -1: at -2 the 4 kHz+ energy measured -37.6 dB of the whole (the guide calls
    # below about -36 muffled); the sub 3 dB down keeps 40-80 Hz weight without a boom
    touch=0.85, tone=-1.0, mix={"lead": -2.0, "sub": -3.0},
    notes="Own everything, round 8, at the picture's 96 BPM: one even eighth-note piano figure from the first "
          "frame to the name, C minor 7 under the cell said once with the first three lines, F minor 7 with "
          "far held strings under the pen, A-flat to B-flat sus as the page turns light with the sigh on "
          "'own your data.', the logo's pick-ups on 'everything.' and the quiet logo on the name at 7.5 s.",
    sections=[
        S("hopeful", 1, tune=[CELL], chords=[["Cm7"]], drop=("held", "sub", "air", "answer"),
          # WHY 4 dB down (the tune makes this bar about 1.7 dB fuller than bar 2 at the same level):
          # the lie is the quietest bar, so the light page can lift by a staged
          # 2-3 dB (strings in bar 2, the major chord and the sigh in bar 3), never a switch
          lead=0.85, level_db=-4.0, label="the lie: figure and the cell", **COMMON),
        # WHY Fm7 then Cm/G (half a bar each): the bass steps F, G, then A-flat into the light page,
        # and a short film still needs a third chord (chords-distinct); Cm/G, not G major, so no
        # B natural rubs against the coming B-flat sus
        # WHY the sub kept here (and so in the ending): without it the 40-80 Hz band sat 12.4 dB
        # under the whole (the mix check allows 12); it fades in over the bar, under the pen,
        # and it is weight, not a part (layers does not count it)
        S("hopeful", 1, tune=None, chords=[["Fm7", "Cm/G"]], drop=("air", "answer"),
          # WHY a 1.5 s ramp centred on the bar line: the default 3 s ramp began at 1.0 s, so bar 1
          # and bar 2 measured within 0.6 dB (loudness-range); this keeps the lie quieter for its
          # whole bar and rises under the strike (2.0-3.5 s), one step of the staged lift
          ramp=1.5, label="the pen: figure and far strings", **COMMON),
    ])


# ------------------------------------------------------------------ the pen (made for this film)

def _ease_speed(n, landing=0.12, brake=0.8):
    """Pen speed through one marker stroke, from take3.tsx's penCurve: a quick landing (slow for the
    first 12 %), fast through the middle, a slight drag as it lifts. Returned as 0..1 per sample."""
    x = np.linspace(0, 1, n)
    pos = np.interp(x, [0, landing, brake, 1], [0, 0.07, 0.9, 1])
    v = np.gradient(pos, x)
    return v / v.max()


def _letters_speed(n):
    """Pen speed while 'everything' is written: each letter eases in and out (take3.tsx LETTER_TIME),
    so the sound swells through a letter and thins at its turns, but never stops (cursive)."""
    w = [1, 0.85, 1, 0.75, 1.35, 0.9, 1.2, 0.55, 1, 1.45]          # e v e r y t h i n g
    edges = np.concatenate([[0], np.cumsum(w) / sum(w)])
    x = np.linspace(0, 1, n, endpoint=False)
    v = np.zeros(n)
    for a, b in zip(edges[:-1], edges[1:]):
        sel = (x >= a) & (x < b)
        q = (x[sel] - a) / (b - a)
        v[sel] = (0.85 * np.sin(np.pi * q) ** 2 + 0.15) / (b - a) ** 0.25   # quick letters a little louder
    return 0.3 + 0.7 * v / v.max()


def _felt(speed, seed, body_hz=1100.0, bright=3600.0):
    """A felt tip on paper: noise in the 250 Hz - 3.6 kHz band with a soft body resonance, loudness
    following the pen's speed (smoothed 12 ms, so no grain or crackle), slightly wide in stereo.
    WHY no recording: the owner's rule is effects made for each film, and his ruling on pens is
    "soft, never scratchy"; built from filtered noise, nothing above ~4 kHz exists to scratch."""
    r = np.random.default_rng(seed)
    n = len(speed)
    out = np.zeros((n, 2))
    k = int(0.012 * SR)
    amp = np.convolve(speed, np.ones(k) / k, mode="same") ** 0.8
    # a tiny, slow wobble of pressure (a hand, not a machine)
    amp *= 1 + 0.12 * np.sin(2 * np.pi * 7.3 * np.arange(n) / SR + seed)
    for ch in range(2):
        w = r.standard_normal(n)
        band = sg.sosfiltfilt(sg.butter(2, [250, bright], btype="bandpass", fs=SR, output="sos"), w)
        body = sg.sosfiltfilt(sg.butter(2, [body_hz * 0.8, body_hz * 1.25], btype="bandpass", fs=SR, output="sos"), w)
        out[:, ch] = (0.6 * band + 0.9 * body) * amp
    return out


def _tap(seed):
    """The full stop: the pen touching down once (40 ms), soft and low."""
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    env = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.012)
    return _felt(env / env.max(), seed, body_hz=700.0, bright=2400.0)


# WHY these times: take3.tsx T3 at 172108ad5. Strikes on beat 4 (2.5 s, 0.18 s long) and beat 4.5
# (2.8125 s, 0.17 s); the hand starts on beat 5 (3.125 s), writes "everything" in SWEEP = 0.608 s,
# lifts for STOP_AFTER = 0.1 s and taps the full stop.
STRIKE1, STRIKE2, WRITE = 4 * BEAT, 4.5 * BEAT, 5 * BEAT
SWEEP, STOP_AFTER = 0.76 * 0.8, 0.1


def effects(music, plans, piece):
    out = np.zeros_like(music)
    rows = []
    # WHY -11 dB (the guide's range is 8-12 under the music): the owner asked for this film to be
    # subtle, and the pen must be felt more than heard; the strike is the loudest of the three.
    # The figure carries on under all of it (the music never stops for the pen).
    for t0, dur, seed, rel, what in ((STRIKE1, 0.18, 11, -10.0, "strike 1 through 'nothing.'"),
                                     (STRIKE2, 0.17, 12, -11.5, "strike 2, back the other way")):
        n = int((dur + 0.04) * SR)
        x = soften(_felt(_ease_speed(n), seed, body_hz=950.0), 4000.0)
        r = place_effect(out, x, t0, music, rel)
        rows.append(dict(r, what=what))
    n = int(SWEEP * SR)
    x = soften(_felt(_letters_speed(n), 21, body_hz=1300.0), 4000.0)
    rows.append(dict(place_effect(out, x, WRITE, music, -12.0), what="'everything' written"))
    x = soften(_tap(31), 3500.0, dot=True)
    rows.append(dict(place_effect(out, x, WRITE + SWEEP + STOP_AFTER, music, -14.0), what="the full stop"))
    return out, rows


FILM = Film(
    "own-everything-r8", PIECE, effects=effects, copy_to=None,
    picture=[(0 * BEAT, "you'll own"), (1 * BEAT, "nothing."), (2 * BEAT, "and you'll"), (3 * BEAT, "be happy."),
             (STRIKE1, "strike 1"), (STRIKE2, "strike 2"), (WRITE, "everything. (written)"),
             (WRITE + SWEEP + STOP_AFTER, "full stop"), (7 * BEAT, "dissolve to day (one beat)"),
             (8 * BEAT, "own your data."), (9 * BEAT, "intelligence."), (10 * BEAT, "software."),
             (11 * BEAT, "everything."), (12 * BEAT, "youcoded (name)"), (10.0, "end")])
