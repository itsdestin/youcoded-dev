"""Measure every rendered file: `.venv/bin/python verify.py` -> prints and writes out/measurements.txt

Checks: loudness, true peak, clipping, clean starts/ends, click detector, spectrum balance,
mono compatibility, motif notes audible in the mix, and the logo identical in every piece.
"""
import glob
import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dsp import SR, true_peak_env, db, undb, mtof, secs  # noqa: E402
from render import sfx_level  # noqa: E402

OUT = os.path.join(HERE, "out")
METER = pyln.Meter(SR)
lines = []


def p(s=""):
    print(s)
    lines.append(s)


def lufs(x):
    return METER.integrated_loudness(x) if len(x) >= secs(0.45) else float("nan")


def bands(x):
    mono = x.mean(axis=1)
    f, P = signal.welch(mono, SR, nperseg=8192)
    tot = P[(f >= 20) & (f <= 20000)].sum()
    out = {}
    for name, lo, hi in (("<40", 20, 40), ("40-80", 40, 80), ("80-250", 80, 250), ("250-2k", 250, 2000),
                         ("2k-8k", 2000, 8000), (">8k", 8000, 20000)):
        out[name] = 10 * np.log10(P[(f >= lo) & (f < hi)].sum() / tot + 1e-20)
    return out


def clicks(x):
    """Count isolated discontinuities: 2nd difference far above its local level."""
    m = x.mean(axis=1)
    d2 = np.abs(np.diff(m, 2))
    loc = np.sqrt(np.convolve(d2 ** 2, np.ones(480) / 480, mode="same")) + 1e-9
    bad = (d2 > 10 * loc) & (d2 > undb(-50))
    return int(bad.sum())


def note_present(x, t, midi):
    """Is this pitch's energy rising at t and louder than its neighbouring semitones?"""
    mono = x.mean(axis=1)
    n = 4096
    def spec(t0):
        s = secs(t0)
        seg = mono[max(0, s): max(0, s) + n]
        if len(seg) < n:
            seg = np.pad(seg, (0, n - len(seg)))
        return np.abs(np.fft.rfft(seg * np.hanning(n))) ** 2
    def band(S, f):
        fr = np.fft.rfftfreq(n, 1 / SR)
        sel = (fr > f * 2 ** (-0.35 / 12)) & (fr < f * 2 ** (0.35 / 12))
        return S[sel].sum() + 1e-20
    f = float(mtof(midi))
    after, before = spec(t + 0.005), spec(t - n / SR - 0.005)
    rise = 10 * np.log10(band(after, f) / band(before, f))
    neigh = max(band(after, f * 2 ** (1 / 12)), band(after, f * 2 ** (-1 / 12)))
    sal = 10 * np.log10(band(after, f) / neigh)
    return rise, sal


def main():
    files = sorted(glob.glob(os.path.join(OUT, "*.wav"))) + sorted(glob.glob(os.path.join(OUT, "sfx", "*.wav")))
    score = json.load(open(os.path.join(OUT, "score.json")))
    p("file                 dur s  LUFS-I  TP dBTP  peak dBFS  clipped  first/last sample   edge 1ms max  clicks  L/R corr  mono-sum loss dB")
    for fpath in files:
        x, sr = sf.read(fpath)
        assert sr == SR and x.shape[1] == 2
        name = os.path.relpath(fpath, OUT)
        tp = db(true_peak_env(x).max())
        pk = db(np.abs(x).max())
        clipped = int((np.abs(x) >= 0.999).sum())
        e1 = max(np.abs(x[: secs(0.001)]).max(), np.abs(x[-secs(0.001):]).max())
        corr = np.corrcoef(x[:, 0], x[:, 1])[0, 1]
        mono = np.repeat(x.mean(axis=1, keepdims=True), 2, axis=1)
        ml = lufs(x) - lufs(mono) if len(x) >= secs(0.45) else float("nan")
        p(f"{name:20s} {len(x)/SR:5.2f}  {lufs(x):6.2f}  {tp:7.2f}  {pk:8.2f}  {clipped:6d}   {x[0,0]:+.1e}/{x[-1,0]:+.1e}   {db(e1):7.1f} dB  {clicks(x):5d}   {corr:6.2f}   {ml:5.2f}")

    p()
    p("Interface sounds: max momentary loudness (400 ms window), target -18 LUFS")
    for fpath in files:
        if "sfx" in fpath:
            x, _ = sf.read(fpath)
            p(f"{os.path.relpath(fpath, OUT):20s} {sfx_level(x):6.2f} LUFS-M max, {len(x)/SR:.2f} s")

    p()
    p("Spectrum share of total energy, dB (mono sum)")
    p("file                    <40   40-80  80-250  250-2k  2k-8k   >8k")
    for fpath in files:
        if "sfx" in fpath:
            continue
        x, _ = sf.read(fpath)
        b = bands(x)
        p(f"{os.path.basename(fpath):20s} " + " ".join(f"{v:7.1f}" for v in b.values()))

    p()
    p("Motif: notes logged by the score, and whether each is audible in the final mix")
    pa = [m for _, _, m in score["phrase_a"]]
    pb = [m for _, _, m in score["phrase_b"]]
    for piece, info in score["pieces"].items():
        notes = info["motif_notes"]
        seq = [m for _, m in notes]
        x, _ = sf.read(os.path.join(OUT, piece + ".wav"))
        ok = 0
        for t, m in notes:
            rise, sal = note_present(x, t, m)
            ok += (rise > 3 and sal > 0)
        a_ok = any(seq[i:i + 6] == pa for i in range(len(seq)))
        b_ok = any(seq[i:i + 6] == pb for i in range(len(seq)))
        p(f"{piece:14s} motif notes {len(notes):3d}, audible {ok:3d} ({100*ok/max(1,len(notes)):.0f}%), phrase A exact: {a_ok}, phrase B exact: {b_ok}")

    p()
    p("Logo: the end of each piece vs logo.wav x fixed gain (from 0.25 s into the logo, after the bed has gone)")
    logo, _ = sf.read(os.path.join(OUT, "logo.wav"))
    g = undb(score["logo_gain_db_in_pieces"])
    for piece, info in score["pieces"].items():
        x, _ = sf.read(os.path.join(OUT, piece + ".wav"))
        s = secs(info["logo_t"])
        a = secs(0.25)
        seg = x[s + a: s + len(logo)]
        ref = logo[a: len(seg) + a] * g
        res = seg - ref
        corr = np.corrcoef(seg.ravel(), ref.ravel())[0, 1]
        p(f"{piece:14s} logo at {info['logo_t']:.2f} s, correlation {corr:.6f}, difference {db(np.sqrt(np.mean(res**2))) - db(np.sqrt(np.mean(ref**2))):.1f} dB below the logo"
          f" (24-bit rounding floor ~ -120 dB)")

    p()
    p("Room for a narrator (demo-hopeful): loudness of the speech band 300 Hz-3.4 kHz, by section")
    x, _ = sf.read(os.path.join(OUT, "demo-hopeful.wav"))
    sb = signal.sosfilt(signal.butter(4, [300, 3400], "bandpass", fs=SR, output="sos"), x, axis=0)
    for label, a, b in (("opening, music box alone", 0.0, 5.3), ("narration bed", 5.4, 16.0),
                        ("build", 16.0, 21.3), ("full", 21.3, 26.6)):
        p(f"  {label:26s} {a:5.1f}-{b:5.1f} s: whole mix {METER.integrated_loudness(x[secs(a):secs(b)]):6.1f} LUFS, speech band {METER.integrated_loudness(sb[secs(a):secs(b)]):6.1f} LUFS")

    with open(os.path.join(OUT, "measurements.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
