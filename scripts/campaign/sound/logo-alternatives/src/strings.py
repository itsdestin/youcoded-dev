"""Recorded strings for the logo alternatives (VSCO 2 Community Edition, CC0).

The sample loader is copied from ../../felt-and-pulse-playful/src/kit.py (same recordings, read
in place, read-only). Added here: `bowed`, a sustained note that skips the recording's own bow
attack and uses our own rounded envelope, so a swell or a legato line never "scrapes" in.
"""
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

from dsp import SR, biquad, fade, resample_ratio

HERE = os.path.dirname(os.path.abspath(__file__))
# WHY: read the recordings where the playful experiments already downloaded them; never copied
VSCO = os.path.join(HERE, "..", "..", "felt-and-pulse-playful", "samples", "vsco", "Strings")

# VSCO names its notes one octave LOW of concert pitch (measured by the playful composer and
# re-checked by build.py's pitch test), hence OCTAVE_FIX = 12.
FOLDERS = {
    ("vln", "pizz"): "Violin Section/Pizz", ("vln", "sus"): "Violin Section/susVib",
    ("vla", "pizz"): "Viola Section/pizz", ("vla", "sus"): "Viola Section/susvib",
    ("vc", "pizz"): "Cello Section/pizzT",
}
OCTAVE_FIX = 12
_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_IDX = {}


def _index(sec, art):
    key = (sec, art)
    if key not in _IDX:
        d = os.path.join(VSCO, FOLDERS[key])
        rows = []
        for fn in sorted(os.listdir(d)):
            mm = re.search(r"_([A-G])(#?)(\d)_v(\d)", fn)
            if not mm:
                continue
            midi = 12 * (int(mm.group(3)) + 1) + _NOTE[mm.group(1)] + (1 if mm.group(2) else 0) + OCTAVE_FIX
            rows.append(dict(path=os.path.join(d, fn), midi=midi, layer=int(mm.group(4))))
        _IDX[key] = rows
    return _IDX[key]


@lru_cache(maxsize=None)
def _raw(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    m = np.abs(x).max(axis=1)
    pk = m.max()
    # WHY trim: the recordings start with a little silence; notes must speak on time.
    i = int(np.argmax(m > pk * 10 ** (-30 / 20)))
    i = max(0, i - int(0.004 * sr))
    x = x[i:]
    rms = float(np.sqrt((x[: int(0.25 * sr)] ** 2).mean()))
    return x, sr, rms


@lru_cache(maxsize=None)
def _pitched(path, semis):
    x, sr, rms = _raw(path)
    ratio = (SR / sr) / (2.0 ** (semis / 12.0))
    return resample_ratio(x, ratio), rms


def _pick(sec, art, m, vel, rr):
    rows = _index(sec, art)
    layers = sorted({r["layer"] for r in rows})
    want = layers[-1] if vel >= 0.55 else layers[0]
    cands = [r for r in rows if r["layer"] == want] or rows
    best = min(abs(r["midi"] - m) for r in cands)
    near = [r for r in cands if abs(r["midi"] - m) == best]
    return near[rr % len(near)]


def pluck_point(x):
    """Seconds from the start of a pizzicato recording to where you HEAR the pluck.

    WHY: these are SECTION recordings (several players), so a pluck is a short smear: the
    first finger is heard at the start but the body of the note peaks 30-120 ms later. Placed
    naively, a pizzicato doubling the piano would flam (two attacks, audibly apart). We take
    the moment the 5 ms envelope first reaches half its peak as the note's beat."""
    a = np.abs(x).max(axis=1)
    w = int(0.005 * SR)
    e = np.convolve(a, np.ones(w) / w, mode="same")
    return int(np.argmax(e >= 0.5 * e.max())) / SR


def pizz(sec, m, vel=0.5, dur=None, rr=0, release=0.18):
    """One plucked string note (real recording), loudness set by `vel`, not by which take.
    Returns (audio, pluck_point): place it pluck_point seconds early so the pluck is on time."""
    r = _pick(sec, "pizz", m, vel, rr)
    x, rms = _pitched(r["path"], m - r["midi"])
    x = x.copy() * (0.1 / max(rms, 1e-6)) * 10 ** ((vel - 0.7) * 18 / 20)
    if dur is not None:
        t = np.arange(len(x)) / SR
        x *= np.where(t < dur, 1.0, np.exp(-(t - dur) / release))[:, None]
        x = x[: min(len(x), int((dur + release * 6) * SR))]
    x = fade(x, fin=0.002, fout=0.02)
    pp = pluck_point(x)
    # WHY: the other players' fingers arriving before the pluck point would sound as a little
    # flam ahead of the piano. Keep only the last 20 ms of that lead-in (a rounded rise), so
    # the section speaks as one pluck. The returned offset puts the end of the rise 8 ms after
    # the beat: measured, that makes the pluck's audible start coincide with a felt-piano
    # note struck on the same beat (build.py's landing check, within 1 ms).
    t = np.arange(len(x)) / SR
    x *= rcos(t, pp - 0.020, pp)[:, None]
    return x, pp - 0.008


def bowed(m, length, env, vel=0.5, rr=0, skip=0.25, lp=7000.0):
    """A sustained bowed note `length` seconds long, shaped by `env` (array or callable of t).

    WHY skip: the first ~250 ms of a recorded bowed note is the bow biting the string, a
    scrape that reads as a separate little sound inside a 3-second logo. We start inside the
    steady part and let our own envelope do the entrance, so strings only ever bloom.
    Section by register: violas below G4, violins from G4 up (both have vibrato).
    """
    sec = "vla" if m < 67 else "vln"
    r = _pick(sec, "sus", m, vel, rr)
    x, rms = _pitched(r["path"], m - r["midi"])
    i0 = int(skip * SR)
    n = int(length * SR)
    x = x[i0: i0 + n].copy()
    if len(x) < n:
        x = np.pad(x, ((0, n - len(x)), (0, 0)))
    t = np.arange(n) / SR
    e = env(t) if callable(env) else env[:n]
    x *= (0.1 / max(rms, 1e-6)) * 10 ** ((vel - 0.7) * 18 / 20) * e[:, None]
    return biquad(x, "lp", lp, 0.6)


def rcos(t, a, b):
    """0 before a, a raised-cosine rise from a to b, 1 after b."""
    u = np.clip((t - a) / max(b - a, 1e-9), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * u)


def swell_env(t0, peak, end):
    """Bloom: rounded rise from t0 to peak, rounded fall from peak to silence at end
    (times relative to the note's own start)."""
    def f(t):
        return rcos(t, t0, peak) * (1 - rcos(t, peak, end))
    return f
