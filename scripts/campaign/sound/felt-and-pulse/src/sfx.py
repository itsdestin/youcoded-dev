"""Four interface sounds in the same world: felt, glass, sub, air."""
import numpy as np

import instruments as ins
from arrange import LOGO_CELL, ir
from dsp import (SR, butter, convolve, fade, midi_hz, noise, note, pan, place, tv_biquad)


def _buf(sec):
    return np.zeros((int(sec * SR), 2))


def type_tick():
    """One soft key tick: the felt-covered key bottoming out, with a whisper of room."""
    b = _buf(0.12)
    place(b, butter(ins.tick(0.8, seed=3), "highpass", 60, 2), 0.0)  # no DC thump
    b = b + convolve(b * 0.12, ir("room"))
    return fade(b, fout=0.03)


def change():
    """Something transforms (~0.8 s): a filtered pad opens, the glass pluck runs the logo cell
    upward, landing with a soft sub bloom. The motif in miniature."""
    b = _buf(0.8)
    pad = ins.pad([note(n) for n in ("Eb4", "Bb4", "F5", "G5")], 0.45, 0.6, cutoff=600,
                  attack=0.25, release=0.2, seed=7, air=False)
    n = len(pad)
    fc = 500 * (9.0 ** np.clip(np.arange(n) / (0.45 * SR), 0, 1))
    pad = tv_biquad(pad, "lp", fc, 1.1)
    place(b, pad * 0.9, 0.0)
    for k, (t, nm) in enumerate(LOGO_CELL):
        place(b, pan(ins.pluck(note(nm) + 12, 0.42 + 0.08 * k, 0.22), (-0.4, 0.4, 0.0)[k]), 0.08 + k * 0.11)
    place(b, ins.thump(note("Eb2"), 0.5), 0.33)
    place(b, ins.swell(0.33, 800, 9000, 0.25, seed=2), 0.0)
    b = b + convolve(butter(b, "highpass", 200, 2) * 0.35, ir("hall"))
    t = np.arange(len(b)) / SR
    b *= (np.sin(0.5 * np.pi * np.clip((0.8 - t) / 0.35, 0, 1)) ** 2)[:, None]
    return fade(b, fin=0.002)


def arrive():
    """Something appears (~0.4 s): a glass dyad on the landing chord with a tiny sub tap."""
    b = _buf(0.4)
    place(b, pan(ins.pluck(note("G5"), 0.5, 0.18), -0.25), 0.0)
    place(b, pan(ins.pluck(note("Bb5"), 0.45, 0.18), 0.25), 0.012)
    place(b, pan(ins.pluck(note("F6"), 0.22, 0.12), 0.0), 0.03)
    place(b, ins.thump(note("Eb2"), 0.35), 0.0)
    b = b + convolve(butter(b, "highpass", 250, 2) * 0.25, ir("hall"))
    t = np.arange(len(b)) / SR
    b *= (np.sin(0.5 * np.pi * np.clip((0.4 - t) / 0.2, 0, 1)) ** 2)[:, None]
    return fade(b, fin=0.001)


def strike(dur=0.25, seed=0):
    """A marker stroke on paper (~0.25 s): filtered friction noise that rises then lifts off,
    with a fine fibrous grain and the band sweeping as the pen travels. Films pass the stroke's
    own length; seed varies the grain so two strokes are not identical."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(42 + seed)
    # friction grain: noise amplitude-modulated by a jittery 70-110 Hz texture (paper fibres)
    grain = 0.5 + 0.5 * np.abs(butter(r.standard_normal(n), "bandpass", [60, 140], 2)) * 4
    grain = np.clip(grain, 0, 1.6)
    fc = 2600 + 2200 * (t / dur)                       # pen travels: the band rises a little
    x = tv_biquad(noise(n, 9 + 31 * seed), "bp", fc, 0.9) * grain
    x += butter(noise(n, 10 + 31 * seed), "highpass", 6000, 2) * 0.25 * grain    # felt tip hiss
    # the faint squeak of a felt tip dragging: a narrow resonance that wavers upward
    sq = tv_biquad(noise(n, 11 + 31 * seed), "bp", 1750 + 300 * (t / dur) + 60 * np.sin(2 * np.pi * 23 * t), 14)
    x += sq * 0.5 * grain
    shape = np.clip(t / 0.018, 0, 1) ** 1.5 * np.clip((dur - t) / 0.06, 0, 1) ** 1.2
    shape *= 0.8 + 0.2 * np.sin(np.pi * t / dur)       # pressure swells mid-stroke
    x = x * shape
    x = pan(x, 0.0)
    x = x * np.array([1.0, 0.94])                      # tiny offset so it isn't dead centre
    return fade(x, fin=0.0, fout=0.004)


ALL = {"type-tick": type_tick, "change": change, "arrive": arrive, "strike": strike}
