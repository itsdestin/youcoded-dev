"""Measure the real pitch of a few recordings per string set, to confirm each folder's octave
correction in strings.py (VSCO's file names are an octave low for the sections)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "base"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import strings  # noqa: E402


def f0(path):
    x, sr, _ = strings._raw(path)
    m = x.mean(axis=1)[int(0.15 * sr): int(0.65 * sr)]
    m = m * np.hanning(len(m))
    # autocorrelation pitch (robust to strong overtones)
    F = np.fft.rfft(m, 2 * len(m))
    ac = np.fft.irfft(np.abs(F) ** 2)[: len(m)]
    lo, hi = int(sr / 1500), int(sr / 30)
    lag = lo + int(np.argmax(ac[lo:hi]))
    return sr / lag


for key in strings.FOLDERS:
    rows = strings.index(*key)
    picks = rows[:: max(1, len(rows) // 4)][:4]
    out = []
    for r in picks:
        hz = f0(r["path"])
        meas = 69 + 12 * np.log2(hz / 440)
        out.append(f"{os.path.basename(r['path'])}: named->{r['midi']} measured {meas:.1f}")
    print(key, " | ".join(out))
