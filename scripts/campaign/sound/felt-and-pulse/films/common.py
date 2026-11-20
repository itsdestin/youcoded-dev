"""Shared tools for scoring films in the felt-and-pulse sound.

A film is scored on an absolute clock: Score is the candidate's Piece run at 60 BPM, so every
"beat" argument is simply seconds. Grids for gridded films come from Grid. Every hit placed
through Score.hit() is logged (name, target time, the sound) so build_films.py can measure
where its attack really lands.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import arrange  # noqa: E402
import instruments as ins  # noqa: E402
import sfx  # noqa: E402
from arrange import LOGO_LAND, MOTIF_A, MOTIF_B, MOTIF_ECHO, VOICES, Piece  # noqa: E402,F401
from dsp import SR, butter, db, fade, note, pan, place, resample_ratio, undb  # noqa: E402,F401

LOGO_FILE = os.path.join(ROOT, "out", "logo.wav")
LOGO_IN_MIX_DB = 2.0  # same rule as the candidate demos: the -16 LUFS logo plays 2 dB hotter


def load_logo():
    x, sr = sf.read(LOGO_FILE, dtype="float64", always_2d=True)
    assert sr == SR
    return x


class Grid:
    """Tempo grid: g(bar, beat) -> seconds. bar and beat count from 1, beats_per_bar=4."""

    def __init__(self, bpm, start=0.0, beats_per_bar=4):
        self.bpm, self.start, self.bpb = bpm, start, beats_per_bar
        self.beat = 60.0 / bpm

    def __call__(self, bar, beat=1.0):
        return self.start + ((bar - 1) * self.bpb + (beat - 1)) * self.beat


class Score(Piece):
    def __init__(self, length):
        super().__init__(60, length)
        self.sfx = np.zeros((self.n, 2))     # interface sounds live on their own stem
        self.typing = np.zeros((self.n, 2))  # typing ticks: their own stem so they can be levelled
        self.hits = []                       # (name, target_s, placed_s, signal, kind)

    def hit(self, name, target, sig, placed=None, bus="sfx", kind="attack", gain=1.0):
        """Place an interface sound. kind="attack": its transient is the hit. kind="start": the
        sound's beginning is the hit (sweeps)."""
        if placed is None:
            # WHY: a sound's audible hit is a few ms after its first sample (a pen stroke
            # fades in over ~18 ms); start it that much early so the hit is on the frame
            # ("start" sounds: their first audible moment, -40 dB re their peak, is the hit)
            placed = target - attack_time(sig, kind)
        buf = self.sfx if bus == "sfx" else self.typing if bus == "typing" else self.bus[bus]
        place(buf, sig * gain, placed)
        self.hits.append((name, target, placed, np.asarray(sig) * gain, kind))

    def piano_hit(self, name, target, nm, dur, vel=0.6, pedal=True, tone=0.0):
        """A felt-piano note that is a picture hit: placed so its attack lands on `target`."""
        x = ins.felt_piano(note(nm), vel, dur, pedal=pedal, tone=tone)
        self.hit(name, target, x, bus="piano")

    def pluck_hit(self, name, target, nm, vel=0.5, decay=0.35, p=0.0):
        x = pan(ins.pluck(note(nm), vel, decay), p)
        self.hit(name, target, x, bus="pluck")

    def type_run(self, start, end, rate=11.0, seed=0, vel=(0.55, 1.0)):
        """Humanised typing: uneven gaps (a person, not a metronome), varied strength and a
        tiny pitch wobble per key so no two ticks are identical."""
        r = np.random.default_rng(seed)
        t = start
        k = 0
        base = sfx.type_tick()
        while t <= end + 1e-9:
            ratio = 1.0 + r.uniform(-0.04, 0.04)
            x = resample_ratio(base, ratio)
            v = r.uniform(*vel) * (0.75 if r.random() < 0.15 else 1.0)  # the odd lighter key
            place(self.typing, x * v, t)
            if k == 0:
                self.hits.append((f"typing {start:.2f}-{end:.2f}", start, start, x * v, "attack"))
            k += 1
            gap = r.gamma(6.0, 1.0 / (rate * 6.0))
            if r.random() < 0.08:
                gap += r.uniform(0.08, 0.2)  # a hesitation
            t += gap
        return k


def arrive_notes(notes=("G5", "Bb5", "F6"), vel=1.0, sub=True):
    """The arrive sound with chosen notes (same recipe as sfx.arrive), for pitched builds."""
    b = np.zeros((int(0.4 * SR), 2))
    n0, n1, n2 = (note(x) for x in notes)
    place(b, pan(ins.pluck(n0, 0.5, 0.18), -0.25), 0.0)
    place(b, pan(ins.pluck(n1, 0.45, 0.18), 0.25), 0.012)
    place(b, pan(ins.pluck(n2, 0.22, 0.12), 0.0), 0.03)
    if sub:
        place(b, ins.thump(note("Eb2"), 0.35), 0.0)
    b = b + sfx.convolve(butter(b, "highpass", 250, 2) * 0.25, arrange.ir("hall"))
    t = np.arange(len(b)) / SR
    b *= (np.sin(0.5 * np.pi * np.clip((0.4 - t) / 0.2, 0, 1)) ** 2)[:, None]
    return fade(b, fin=0.001) * vel


def pen_tap(vel=1.0):
    """A felt-tip full stop: a soft dab on paper (short friction + tiny low tap)."""
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = butter(ins.noise(n, 77), "bandpass", [1800, 7000], 2) * np.exp(-t / 0.008)
    x += np.sin(2 * np.pi * 320 * t) * np.exp(-t / 0.01) * 0.3
    x *= np.clip(t / 0.0015, 0, 1)
    return fade(np.stack([x, x * 0.95], axis=1) * vel * 0.6, fout=0.01)


def scribble(dur, seed=3):
    """Handwriting: the marker's friction cut into letter strokes (bursts at 6-11 per second,
    some lifts of the pen), same recipe as the strike so it is clearly the same pen."""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    t = 0.0
    k = 0
    while t < dur - 0.04:
        d = r.uniform(0.05, 0.13)
        d = min(d, dur - t)
        s = sfx.strike(max(d, 0.04), seed=10 + seed * 50 + k) * r.uniform(0.55, 1.0)
        place(out, s, t)
        t += d + (r.uniform(0.04, 0.09) if r.random() < 0.25 else r.uniform(0.0, 0.02))
        k += 1
    return fade(out, fin=0.003, fout=0.01)


def attack_time(sig, kind="attack"):
    """Where a sound's hit is, in seconds from its first sample.
    attack: first time its 2 ms RMS reaches -10 dB of its loudest moment in the first 0.5 s.
    start: first time it rises above -40 dB of that peak (sweeps whose start is the hit)."""
    m = np.abs(np.asarray(sig)).mean(axis=1) if np.ndim(sig) == 2 else np.abs(sig)
    w = int(0.002 * SR)
    e = np.sqrt(np.convolve(m ** 2, np.ones(w) / w, mode="same"))
    head = e[: int(0.5 * SR)]
    pk = head.max()
    thr = pk * (undb(-10) if kind == "attack" else undb(-40))
    return int(np.argmax(head >= thr)) / SR


def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.asarray(x, dtype=np.float64), SR, subtype="PCM_24")
    y, _ = sf.read(path, dtype="float64", always_2d=True)
    return y



def chain(bed):
    """The candidate's mastering chain, lighter: a 1.4:1 glue (not 1.8) so films keep real
    dynamics. Output is normalised to -20 LUFS before the final gain/limit stage."""
    from master import lufs
    from dsp import biquad, compress, ms_tidy
    x = butter(bed, "highpass", 25, 2)
    x = ms_tidy(x, 140)
    x = biquad(x, "highshelf", 9000, 0.7, 2.0)
    x = x * undb(-20 - lufs(x))
    return compress(x, -20, 1.4, attack=0.03, release=0.3)


def film_master(x, logo_at, target=-14.0):
    """Gain + true-peak limit to target. The logo is pasted after the limiter at a fixed level,
    so it is the same audio in every film."""
    from master import finish
    logo = load_logo() * undb(LOGO_IN_MIX_DB)
    return finish(x, target, add=logo, add_at=int(round(logo_at * SR)))
