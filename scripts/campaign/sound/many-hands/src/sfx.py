"""Interface sounds from the same hands: tick, change, arrive, strike."""
import numpy as np

import instruments as I
from dsp import SR, add, eq, fade, fit, pan, reverb, stereo

ROOM = dict(length=0.9, rt_low=0.55, rt_mid=0.5, rt_high=0.3, predelay=0.006, early=0.9, seed=3)


def _room(x, wet=0.15, length=None):
    n = len(x) if length is None else int(length * SR)
    y = fit(x, n) + fit(reverb(x, ROOM, wet=wet, hp=300, lp=10000), n)
    return y


def type_tick():
    """A soft key tick: the top of a marimba bar, struck very lightly, plus a fingertip."""
    x = I.marimba(96, 0.6)[: int(0.05 * SR)]
    x = eq(x, ("hp", 1800), ("lp", 9000)) * 0.6
    x = add(x, I.snap(0.25, which=1, semis=5)[: int(0.03 * SR)] * 0.4, 0.0)
    x = fade(x, 0.0003, 0.02)
    return fade(_room(x, 0.06, 0.07), 0.0, 0.01)


def change():
    """Something transforms: the motif's opening runs upward while a hum opens to 'ah'."""
    out = np.zeros((int(0.8 * SR), 2))
    for i, m in enumerate([69, 74, 76, 78, 81]):
        t = i * 0.055
        out = add(out, I.harp(m, 0.55 + 0.07 * i, dur=0.3, damp=0.2), t)
        out = add(out, I.marimba(m, 0.3 + 0.05 * i), t + 0.004, 0.6)
    hum = I.choir([62, 66, 69], 0.45, n_each=2, vowels=("mm", "ah"), seed=77, vel=0.6,
                  attack=0.12, release=0.2, stagger=0.01)
    out = add(out, hum, 0.02, 0.8)
    out = add(out, I.snap(0.5, which=0, p=0.2), 0.29)
    out = _room(out, 0.2, 0.8)
    return fade(out, 0.0005, 0.25)


def arrive():
    """Something appears: one soft hand-drum tap and a two-note pluck."""
    out = np.zeros((int(0.4 * SR), 2))
    out = add(out, I.handdrum("bongo", 0.5, 0, 0.0)[: int(0.3 * SR)], 0.0, 0.7)
    out = add(out, I.harp(74, 0.6, dur=0.2, damp=0.12, bright=1.0), 0.012)
    out = add(out, I.harp(81, 0.5, dur=0.2, damp=0.12, bright=1.0), 0.06)
    out = add(out, I.shaker(0.35, i=2, p=0.3), 0.055)  # a little air on arrival
    out = _room(out, 0.15, 0.4)
    return fade(out, 0.0005, 0.12)


def strike(seed=5):
    """A felt-tip marker drawn across paper, ~0.25 s.

    WHY synthesised: the stroke must match the hand-made world (warm, papery) and
    be the exact length a typography film needs. Paper fibres = fast random
    amplitude grain; the felt tip squeak = a narrow resonance that follows speed.
    """
    rng = np.random.default_rng(seed)
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    speed = np.sin(np.pi * np.clip(t / 0.23, 0, 1)) ** 0.7  # hand accelerates, then lifts
    grain = np.abs(eq(rng.standard_normal(n)[:, None], ("lp", 180))[:, 0])
    grain = 0.55 + grain / grain.max()
    noise = rng.standard_normal(n)
    body = eq(noise[:, None], ("hp", 900), ("lp", 7500), ("peak", 3200, 1.2, 5))[:, 0]
    squeak_f = 1900 + 900 * speed
    ph = 2 * np.pi * np.cumsum(squeak_f) / SR
    squeak = np.sin(ph) * eq(noise[:, None], ("lp", 300))[:, 0] * 2.0
    x = (body * grain + squeak * 0.25) * speed
    x = eq(x[:, None], ("hs", 9000, 0.7, 3))[:, 0]
    x = stereo(x / np.abs(x).max())
    x = pan(x, 0.1)
    return fade(x, 0.004, 0.03)
