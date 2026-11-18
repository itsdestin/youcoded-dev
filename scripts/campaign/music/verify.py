#!/usr/bin/env python3
"""Measure the rendered cues: loudness, clipping, DC, clicks, silence, band balance, hit timing.

    python3 verify.py [music_dir] [png_dir]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np

SR = 48000


def load(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", "48000", "-"],
                       capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)


def onset(x, t, win=0.06):
    """First sample near t where short-time level jumps clearly above what came just before."""
    m = np.abs(x).max(axis=0)
    h = int(0.001 * SR)
    env = np.sqrt(np.convolve(m ** 2, np.ones(h) / h, "same"))
    lo, hi = int((t - 0.08) * SR), int((t + 0.06) * SR)
    seg = env[lo:hi]
    # start from the quietest point just before the hit (the deliberate pre-hit dip), then find
    # where level climbs past 10% of the way to the hit's peak
    i0 = int(np.argmin(seg[: int(0.085 * SR)]))
    peak = seg[int(0.08 * SR):].max()
    base = seg[i0]
    idx = np.where(seg[i0:] > base + 0.03 * (peak - base))[0]
    return (lo + i0 + idx[0]) / SR - t


def kick_lag(x, t):
    """Offset of the kick one-shot's best match within +-30 ms (a kick lands on every stab beat)."""
    import kit
    k = kit.lowpass(kit.kick()[: int(0.12 * SR)], 250, 2)
    m = kit.lowpass(x.mean(axis=0), 250, 2)
    a = int((t - 0.03) * SR)
    seg = m[a:a + int(0.06 * SR) + len(k)]
    c = np.correlate(seg, k, "valid")
    return (a + int(np.argmax(c))) / SR - t


def main():
    d = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Videos/youcoded-campaign/music")
    png = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
    grid = json.load(open(os.path.join(d, "grid.json")))
    for fn, info in grid.items():
        x = load(os.path.join(d, fn))
        n = x.shape[1]
        print(f"== {fn}: {n / SR:.4f} s, {n} samples, peak {20 * np.log10(np.abs(x).max()):.2f} dBFS, "
              f"DC L/R {x[0].mean():.2e}/{x[1].mean():.2e}, first sample {np.abs(x[:, 0]).max():.1e}")
        sil = info["hits_s"]["silence_by"]
        print(f"   silence after {sil}s: max |x| = {np.abs(x[:, int(sil * SR):]).max():.1e}")
        # clicks: largest sample-to-sample jump relative to the local level
        m = x.mean(axis=0)
        d1 = np.abs(np.diff(m))
        loc = np.sqrt(np.convolve(m ** 2, np.ones(480) / 480, "same")) + 1e-4
        ratio = d1 / loc[1:]
        k = int(np.argmax(ratio[200:-200])) + 200
        print(f"   largest jump/local-level ratio {ratio[200:-200].max():.2f} at {k / SR:.3f}s "
              f"(smooth tones are < ~0.5; clicks are > 2)")
        # band balance
        X = np.abs(np.fft.rfft(m * np.hanning(n))) ** 2
        f = np.fft.rfftfreq(n, 1 / SR)
        tot = X.sum()
        def band(a, b):
            return 10 * np.log10(X[(f >= a) & (f < b)].sum() / tot + 1e-12)
        print(f"   energy dB vs total: <120Hz {band(0, 120):.1f} | 200-400 {band(200, 400):.1f} | "
              f"400-2k {band(400, 2000):.1f} | 2-6k {band(2000, 6000):.1f} | >6k {band(6000, 24000):.1f}")
        # hit timing
        h = info["hits_s"]
        targets = {}
        for k2, v in h.items():
            if k2 in ("accent_hit", "groove_hit", "logo_hit"):
                targets[k2] = v
            if k2 == "chord_stabs":
                for i, s in enumerate(v):
                    targets[f"stab{i + 1}"] = s
        for k2, v in targets.items():
            o = kick_lag(x, v) if k2.startswith("stab") else onset(x, v)
            print(f"   {k2:11s} nominal {v:7.3f}s  measured onset offset "
                  f"{'n/a' if o is None else f'{o * 1000:+.1f} ms'}")
        base = os.path.join(png, fn[:-4])
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(d, fn), "-lavfi",
                        "showspectrumpic=s=1600x500:legend=1:scale=log", base + "_spec.png"])
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(d, fn), "-lavfi",
                        "showwavespic=s=1600x300:split_channels=1", base + "_wave.png"])


if __name__ == "__main__":
    main()
