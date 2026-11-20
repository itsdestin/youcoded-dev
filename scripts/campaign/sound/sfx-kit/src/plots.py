"""Pictures of the kit for checking by eye: spectrogram, loudness and brightness (centroid)
over time for every file. Writes out/plots/<name>.png and out/plots/sweep.png."""
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
sys.path.insert(0, str(Path(__file__).resolve().parent))
import measure

OUT = Path(__file__).resolve().parent.parent / "out"


def sweep_sheet(names, path):
    fig, axs = plt.subplots(len(names), 1, figsize=(10, 2.0 * len(names)), squeeze=False)
    for ax, n in zip(axs[:, 0], names):
        x, sr = sf.read(OUT / f"{n}.wav")
        m = x.mean(1)
        ax.specgram(m + 1e-9 * np.random.randn(len(m)), NFFT=1024, noverlap=896, Fs=sr, cmap="magma", vmin=-140, vmax=-40)
        ax.set_ylim(0, 8000)
        t, c, l = measure.centroid_track(m)
        ax.plot(t, c, c="c", lw=1.5, label="brightness (centroid)")
        s = measure.sweep_report(m)
        ax.set_title(f"{n}: {s['start']:.0f} -> {s['end']:.0f} Hz, net {s['net_oct']:+.2f} oct, biggest rise {s['max_rise_oct']:.2f} oct", fontsize=8, loc="left")
    plt.tight_layout()
    plt.savefig(path, dpi=70)


if __name__ == "__main__":
    (OUT / "plots").mkdir(exist_ok=True)
    names = sys.argv[1:] or [f"{k}-{v}" for k in ("change", "move", "reveal") for v in "abc"]
    sweep_sheet(names, OUT / "plots" / "sweep.png")
