"""Measure every file in out/: loudness, peaks, edges, spectrum, mono safety,
the motif's notes and the logo's identity inside each demo.

Writes out/measurements.txt (human readable) and prints it.
"""
import glob
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

from dsp import SR, db, lufs, true_peak  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
BANDS = [("sub 40-80", 40, 80), ("low 80-250", 80, 250), ("mid 250-2k", 250, 2000),
         ("pres 2-8k", 2000, 8000), ("air 8-16k", 8000, 16000)]


def band_db(x):
    m = x.mean(axis=1)
    f, p = signal.welch(m, SR, nperseg=8192)
    tot = p[(f >= 20) & (f <= 20000)].sum()
    return {nm: 10 * math.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-12) for nm, lo, hi in BANDS}


def file_report(path):
    x, sr = sf.read(path, always_2d=True)
    assert sr == SR and x.shape[1] == 2
    r = {"dur": len(x) / SR, "tp": true_peak(x), "peak": db(np.abs(x).max()),
         "clipped": int((np.abs(x) >= 0.9999).sum()),
         "first": float(np.abs(x[0]).max()), "last": float(np.abs(x[-1]).max()),
         "edge_in_db": db(np.abs(x[: int(0.001 * SR)]).max() + 1e-12),
         "edge_out_db": db(np.abs(x[-int(0.005 * SR):]).max() + 1e-12),
         "dc": float(np.abs(x.mean(axis=0)).max())}
    if len(x) > 0.5 * SR:
        r["lufs"] = lufs(x)
        mono = np.repeat(x.mean(axis=1, keepdims=True), 2, axis=1)
        r["mono_loss"] = r["lufs"] - lufs(mono)
    else:
        # too short for integrated loudness: report the RMS level over the sound instead
        r["rms_db"] = db(np.sqrt((x ** 2).mean()))
        r["mono_loss"] = db(np.sqrt((x ** 2).mean())) - db(np.sqrt((x.mean(axis=1) ** 2).mean()))
    r["corr"] = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
    r["bands"] = band_db(x)
    return r


def track_notes(mono, sr=SR):
    """Onsets of a melodic stem and the pitch (MIDI) of each."""
    env = np.abs(signal.hilbert(mono))
    env = signal.sosfilt(signal.butter(2, 40, fs=sr, output="sos"), env)
    d = np.diff(env, prepend=0)
    thr = 0.08 * d.max()
    peaks, _ = signal.find_peaks(d, height=thr, distance=int(0.09 * sr))
    notes = []
    for p in peaks:
        seg = mono[p + int(0.02 * sr): p + int(0.14 * sr)]
        if len(seg) < 1024:
            continue
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 1 << 17))
        f = np.fft.rfftfreq(1 << 17, 1 / sr)
        # harmonic product spectrum, searching 200-1100 Hz
        hps = spec.copy()
        for h in (2, 3):
            dec = spec[::h]
            hps[: len(dec)] *= dec
        band = (f > 200) & (f < 1100)
        f0 = f[band][np.argmax(hps[band])]
        notes.append((p / sr, round(69 + 12 * math.log2(f0 / 440), 2)))
    return notes


def contains(seq, pattern):
    s = []
    for _, n in seq:  # merge re-detections of the same ringing note (the motif never repeats a note)
        if not s or round(n) != s[-1]:
            s.append(round(n))
    for i in range(len(s) - len(pattern) + 1):
        if s[i:i + len(pattern)] == pattern:
            return True
    return False


def main():
    lines = []
    files = sorted(glob.glob(os.path.join(OUT, "*.wav"))) + sorted(glob.glob(os.path.join(OUT, "sfx", "*.wav")))
    for f in files:
        r = file_report(f)
        name = os.path.relpath(f, OUT)
        loud = f"{r['lufs']:.2f} LUFS" if "lufs" in r else f"{r['rms_db']:.1f} dB RMS (too short for LUFS)"
        lines.append(f"{name}: {r['dur']:.2f}s, {loud}, true peak {r['tp']:.2f} dBTP, sample peak {r['peak']:.2f} dBFS, "
                     f"clipped samples {r['clipped']}, first/last sample {r['first']:.1e}/{r['last']:.1e}, "
                     f"first 1 ms max {r['edge_in_db']:.1f} dBFS, last 5 ms max {r['edge_out_db']:.1f} dBFS, DC {r['dc']:.1e}")
        lines.append(f"    mono-sum loss {r['mono_loss']:.2f} dB, L/R correlation {r['corr']:.2f}; spectrum share: "
                     + ", ".join(f"{k} {v:.1f} dB" for k, v in r["bands"].items()))
    # motif present in each demo, same notes
    lines.append("")
    call, answer = [69, 74, 76, 78], [69, 74, 76, 83, 81]
    for name in ("hopeful", "playful", "stark"):
        p = os.path.join(OUT, f".{name}_pluck.npy")
        if not os.path.exists(p):
            continue
        notes = track_notes(np.load(p).astype(np.float64))
        lines.append(f"motif in demo-{name}: call A-D-E-F# found={contains(notes, call)}, "
                     f"answer A-D-E-B-A found={contains(notes, answer)}; tracked notes: "
                     + " ".join(f"{n:.1f}" for _, n in notes[:24]))
    # logo identity
    ref_p = os.path.join(OUT, ".logo_ref.npy")
    if os.path.exists(ref_p):
        ref = np.load(ref_p)
        logo_file, _ = sf.read(os.path.join(OUT, "logo.wav"), always_2d=True)
        a = (logo_file * ref).sum() / (ref * ref).sum()
        res = logo_file - a * ref
        lines.append(f"logo.wav vs logo source: residual {db(np.sqrt((res**2).mean()) / np.sqrt(((a*ref)**2).mean())):.1f} dB "
                     f"(lower = identical; limiter is the only difference)")
        for name, at in (("hopeful", 27.05), ("playful", 17.0), ("stark", 9.0)):
            fp = os.path.join(OUT, f"demo-{name}.wav")
            if not os.path.exists(fp):
                continue
            x, _ = sf.read(fp, always_2d=True)
            i = int(at * SR)
            seg = x[i:i + len(ref)]
            r = ref[: len(seg)]
            # alignment: cross-correlate the mono sums around the expected start
            xc = signal.correlate(seg.mean(1)[: SR], r.mean(1)[: SR], mode="full")
            lag = int(np.argmax(xc)) - (SR - 1)
            a = (seg * r).sum() / (r * r).sum()
            res = seg - a * r
            # measured only where the logo itself is loud (its first 1.5 s)
            k = int(1.5 * SR)
            ratio = db(np.sqrt((res[:k] ** 2).mean()) / np.sqrt(((a * r[:k]) ** 2).mean()))
            corr = float(np.corrcoef(seg[:k].ravel(), r[:k].ravel())[0, 1])
            lines.append(f"logo inside demo-{name} at {at:.2f}s: alignment lag {lag} samples, correlation {corr:.3f}, "
                         f"everything-else-under-the-logo {ratio:.1f} dB relative to the logo")
    txt = "\n".join(lines)
    with open(os.path.join(OUT, "measurements.txt"), "w") as fh:
        fh.write(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
