"""A plain PAD voice, used only while engine/sounds.py has no `pad` of its own.

WHY this file: the composing side (bed.py) needs a sustained layer to exist today; the sound
builder owns the real pad (toolkit-plan b3, engine/sounds.py). This is that specification and no
more: two saws 4 cents apart, a 24 dB/oct low-pass at `cutoff` (key-tracked 50 %, drifting
+-15 % at 0.04 Hz), attack 1.2 s, release 2.2 s, no filter envelope. When sounds.pad exists,
score.Band.pad uses it and this file is not read.
"""
import numpy as np

from dsp import SR, midi_hz, saw, tv_biquad


def pad(m, dur, vel=0.3, cutoff=900.0, attack=1.2, release=2.2, seed=0):
    f = midi_hz(m)
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    det = 2 ** (4 / 1200)
    x = 0.5 * (saw(f * det, n) + saw(f / det, n, phase0=0.37))
    # key tracking 50 %: a higher note opens the filter half as much as its pitch rises
    fc = cutoff * (f / midi_hz(57)) ** 0.5
    drift = 1 + 0.15 * np.sin(2 * np.pi * 0.04 * t + 1.3 * (m % 7))
    # time-varying cutoff with the filter state carried (no block clicks); WHY 1024-sample steps:
    # the drift is 0.04 Hz, so 21 ms coefficient steps are inaudible and 30x faster than 32
    c = fc * drift
    y = tv_biquad(tv_biquad(x, "lp", c, 0.54, block=1024), "lp", c, 1.31, block=1024)
    a = np.clip(t / attack, 0, 1)
    a = 0.5 - 0.5 * np.cos(np.pi * a)
    r = np.clip((dur + release - t) / release, 0, 1)
    r = 0.5 - 0.5 * np.cos(np.pi * r)
    y = y * a * np.minimum(1.0, np.where(t > dur, r, 1.0)) * vel
    return np.stack([y, y], axis=1)
