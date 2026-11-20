"""Optional: spectrogram + waveform pictures of every output (out/plots/), for eyeballing.
Run: .venv/bin/python -I src/plots.py"""
import glob
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
os.makedirs(os.path.join(OUT, "plots"), exist_ok=True)
for f in sorted(glob.glob(os.path.join(OUT, "*.wav")) + glob.glob(os.path.join(OUT, "sfx", "*.wav"))):
    x, sr = sf.read(f, always_2d=True)
    m = x.mean(axis=1)
    fig, ax = plt.subplots(2, 1, figsize=(14, 6), sharex=True, gridspec_kw=dict(height_ratios=[1, 2]))
    t = np.arange(len(m)) / sr
    ax[0].plot(t, x[:, 0], lw=0.3)
    ax[0].plot(t, x[:, 1], lw=0.3, alpha=0.6)
    ax[0].set_ylim(-1, 1)
    nper = 4096 if len(m) > sr else 1024
    fr, tt, S = signal.spectrogram(m, sr, nperseg=nper, noverlap=nper * 3 // 4)
    ax[1].pcolormesh(tt, fr, 10 * np.log10(S + 1e-14), vmin=-130, vmax=-40, shading="auto", cmap="magma")
    ax[1].set_yscale("symlog", linthresh=200)
    ax[1].set_ylim(30, 24000)
    ax[0].set_title(os.path.basename(f))
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "plots", os.path.basename(f).replace(".wav", ".png")), dpi=70)
    plt.close(fig)
print("ok")
