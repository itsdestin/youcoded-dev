"""Own everything, the 10 s cut (take3.tsx, one even 96 BPM grid): round 8, fix pass.

From the owner's words on round 7: "animation timing and music in own everything feel very
odd/choppy/inconsistent", and earlier, "the music should be a little more subtle". The first
round-8 score stopped its even figure at 6.25 s (a block chord, then one chord dying from 7.53 s)
while two lines and the name were still landing; its bar-3 tune put accents between the lines;
violins, the sub and the film's hardest piano note all came in at the name. This pass keeps ONE
figure running from the first frame to the last second and puts every tune note on a line's beat.

TEMPO: 96 BPM, the picture's own. Every line of type, the strikes, the hand, the full stop and the
name land on its beats or half-beats (0.625 s a beat); four bars are exactly 10.0 s.

THE FOUNDATION: one soft, pedalled piano figure in even eighths ("b 2 3 2 4 2 3 2": a low bass held
under chord tones rocking up from the floor), 3.2 notes a second, unbroken from 0.0 s to the end;
it fades over bar 4 instead of stopping. It never changes pattern; only its chords and its floor
move, once a bar.

  bar  seconds    picture                              chord          on top of the figure
  1    0.0-2.5    you'll own / nothing. / and you'll   C minor 7      the cell, one note per line:
                  / be happy. (beats 0-3)                             B-flat 0.0, G 0.625, F 1.25, E-flat 1.875
  2    2.5-5.0    strikes 2.5 and 2.81, the hand        F minor 7,     far held strings swell in over
                  writes 3.125, full stop 3.75,         C minor/G      1.5 s under the pen
                  dissolve 4.375-5.0                                   (figure floor C4, as in bar 1)
  3    5.0-7.5    own your data. / intelligence. /     A-flat,        the tune, one note per line:
                  software. / everything.              B-flat sus     C6 5.0 (the peak), B-flat 5.625,
                                                                      B-flat 6.25, G 6.875 ...
  4    7.5-10.0   the name (beat 12), still poster     E-flat         ... F 7.5 on the name, held;
                                                                      the figure and strings fade

Layers: the figure and the tune (bar 1), the figure and the strings (bar 2), all three (bars 3-4).
The sub (weight, not counted as a layer) sounds from 0.0 s under every chord. No air, no answer,
no violins, no plucked strings, no synth. The lift is the light page:
the major chords, the strings already there, the tune's top note on 5.0 and about 2-3 dB more,
grown over bars 1-3 (bar loudness -20.0, -18.5, -16.4, then -18.9 as bar 4 recedes).

KNOWN CHECK RESULT: level-rate reports ~22 dB within a second at 8.7 s. That is the master's own
1-second fade to silence (9.0-10.0 s), which the check normally never sees because its window ends
at the name; here the nominal landing is 11.25 s (the hidden ending), so the window reaches the
fade. Over 1.0-9.0 s the level moves at most about 4.3 dB in any second.

HOW THE LIBRARY'S ENDING IS KEPT OUT: score.py always adds an ending bar (a sigh, then a block chord
and the logo's pick-ups, with the figure cut at its beat 2). Here the four bars are all ordinary
sections and that ending bar is pinned to start at 10.0 s, after the film has ended (logo="none",
ending="short"), so nothing of it is heard. The name's "you-co-ded" is the tune's last three notes.
"""
import numpy as np
from scipy import signal as sg

from dsp import SR
from films import Film, place_effect, soften
from motif import write
from score import Piece, Section as S

BPM = 96.0           # WHY 96: the picture editor put every hit on one 96 BPM grid (take3.tsx)
BEAT = 60.0 / BPM    # 0.625 s

# WHY one figure for the whole film, in eighths: "one unbroken, even phrase". A bass held under
# chord tones that rock up and back is the plainest continuous pulse; 3.2 notes a second at 96.
FIG = "b 2 3 2 4 2 3 2"

# WHY four quarter notes on beats 0-3: the brand's cell (B-flat, G, F) and a step down to E-flat, one
# note per line of type, the same rhythm as the answer in bar 3. WHY the E-flat on "be happy.": with
# F held alone the 0.5 s after 2.0 s measured ~25 dB darker above 4 kHz than the rest (the "dark hole").
# WHY the first note a little softer (@0.8): "you'll own" is already on screen at frame 0, so the
# first VISIBLE arrival is "nothing." on beat 1; the weight goes on the G there.
CELL = write("Bb4/1@0.8 G5/1 F5/1 Eb5/1")

# WHY the answer bar is one quarter note per line, like bar 1 (critic, round 8): C6 on "own your
# data." (the peak, the page turned light), B-flat on "intelligence.", then the cell again on
# "software." / "everything." / the name: the same three-word gesture that opened the film, now
# on the light page. The F on the name is in the next section (bar 4).
ANSWER = write("C6/1 Bb5/1 Bb4/1 G5/1")
# WHY the name's F softer than the line (@0.75): round 8's F5 was the film's hardest piano note
# (0.52) over the picture's smallest arrival; this keeps it near the figure's own touch
NAME = write("F5/4@0.75")

COMMON = dict(bpm=BPM, accomp="figure", figure=FIG, fig_touch=0.30, pedal=True, into="flow",
              # WHY none of these: two or three layers at most; each is another group (or, for
              # air, the 4 kHz+ energy that made thin bars bright)
              # WHY the sub KEPT, from the first bar: without it the 40-80 Hz band sat 30 dB under
              # the whole (the mix allows 3-12). Present from 0.0 s it is weight under every chord,
              # never a fresh attack on the name as in round 8 (layers does not count it)
              drop=("air", "answer"))

PIECE = Piece(
    "own-everything-r8b", 10.0, peak=5.0, seed=8, loudness=-17.0,
    # WHY the ending bar pinned after the film (see the docstring): the four visible bars are all
    # ordinary figure sections, so the pulse never turns into a block chord before the name
    logo="none", ending="short", ending_start=10.0, land=10.0 + 2 * BEAT, rit=1.0,
    # WHY touch 0.85 and the lead 2 dB down: "subtle", and the tune is one voice of the bed.
    # WHY the strings 3 dB down: they are a colour under the pen, never an entrance
    touch=0.85, tone=0.0, mix={"lead": -2.0, "bowed": -3.0, "sub": -5.0}, air=12.5,
    notes="Own everything, round 8 fix pass, at the picture's 96 BPM: one even eighth-note piano figure from "
          "the first frame to the end, fading over the last bar; the cell once with the first three lines, far "
          "strings swelling in under the pen, the answer one note per line on the light page (C6 on 'own your "
          "data.'), the cell again ending on F under the name at 7.5 s.",
    sections=[
        # WHY 4.5 dB down: the lie is the quietest bar (with its tune), so the light page lifts by a
        # staged 2-4 dB and no bar line jumps more than 3 dB
        S("hopeful", 1, tune=[CELL], chords=[["Cm7"]], fig_floor="C4", lead=0.85, level_db=-4.5,
          label="the lie: figure and the cell",
          # WHY no held strings in bar 1: two layers (figure and cell); the strings are bar 2's one change
          **dict(COMMON, drop=COMMON["drop"] + ("held",))),
        # WHY level -1 (bar 1 is -4.5): with no tune this bar would otherwise sit at bar 1's level and
        # bar 3 would jump 4.8 dB on the page turn (level-rate allows 3 bar to bar).
        # WHY Fm7 then Cm/G: the bass steps F, G, then A-flat into the light page
        S("hopeful", 1, tune=None, chords=[["Fm7", "Cm/G"]], fig_floor="C4", level_db=-1.0, ramp=1.5,
          label="the pen: figure and far strings", **COMMON),
        # WHY bars 3 and 4 are ONE section: the held strings then keep their shared notes (E-flat 3)
        # in one bow across the name instead of re-bowing them on 7.5 (round 8's re-attacks at the
        # bar lines); only the voice that changes moves (A-flat to G on the name).
        # WHY the floor down to F3: over B-flat sus the figure's top note is then F4, not a B-flat 4
        # in unison with the tune's B-flat on "software."
        # WHY the shape: level held through the answer, then bar 4 recedes to half (the figure keeps
        # every eighth to the end and the master fades the last second to silence), so the bed
        # never stops before the film does
        S("hopeful", 2, tune=[ANSWER, NAME], chords=[["Ab", "Bbsus"], ["Eb"]], fig_floor="F3", lead=0.85,
          level_db=-1.5, ramp=1.5, shape=[(0, 1.0), (4, 1.0), (8, 0.5)],
          label="the light page and the name", **COMMON),
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


# WHY these times: take3.tsx T3. Strikes on beat 4 (2.5 s, 0.18 s long) and beat 4.5 (2.8125 s,
# 0.17 s); the hand starts on beat 5 (3.125 s), writes "everything" in SWEEP = 0.54 s, lifts for
# STOP_AFTER = 0.085 s and taps the full stop ON beat 6 (3.75 s). WHY (critic, round 8): at 3.833 s
# the tap fell 89 ms after a figure note, neither with it nor clearly apart: two clicks smeared.
STRIKE1, STRIKE2, WRITE = 4 * BEAT, 4.5 * BEAT, 5 * BEAT
SWEEP, STOP_AFTER = 0.54, 0.085


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
    "own-everything-r8b", PIECE, effects=effects, copy_to=None,
    picture=[(0 * BEAT, "you'll own"), (1 * BEAT, "nothing."), (2 * BEAT, "and you'll"), (3 * BEAT, "be happy."),
             (STRIKE1, "strike 1"), (STRIKE2, "strike 2"), (WRITE, "everything. (written)"),
             (WRITE + SWEEP + STOP_AFTER, "full stop"), (7 * BEAT, "dissolve to day (one beat)"),
             (8 * BEAT, "own your data."), (9 * BEAT, "intelligence."), (10 * BEAT, "software."),
             (11 * BEAT, "everything."), (12 * BEAT, "youcoded (name)"), (10.0, "end")])
