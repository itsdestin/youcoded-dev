"""The instruments of "felt and pulse".

Allowed palette (see RULES.md): felt piano (the person), sub bass, analog pad, sidechained
pulse, glass pluck (the machine's answer), minimal drums (kick, snap, hats, shaker), air/swell
effects. Nothing else.
"""
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

from dsp import (SR, biquad, butter, env_adsr, fade, lp4, midi_hz, noise, onepole_lp,
                 pan, resample_ratio, rng, sat, saw, sine, to_stereo, tv_biquad)

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "..", "samples", "upright-kw", "UprightPianoKW-SFZ+FLAC-20220221")


# ================================================================ felt piano (sampled)

def _parse_sfz():
    text = open(os.path.join(KIT, "UprightPianoKW-20220221.sfz"), encoding="utf-8").read()
    regions = []
    layer = None
    for block in re.split(r"(?=<group>|<region>)", text):
        if block.startswith("<group>"):
            layer = "H" if "lovel=81" in block else "L"
        elif block.startswith("<region>"):
            kv = dict(re.findall(r"(\w+)=(\S+)", block))
            if "key" in kv:  # single-key regions use key= for all three
                kv.setdefault("lokey", kv["key"]); kv.setdefault("hikey", kv["key"])
                kv.setdefault("pitch_keycenter", kv["key"])
            regions.append(dict(layer=layer, lo=int(kv["lokey"]), hi=int(kv["hikey"]),
                                key=int(kv["pitch_keycenter"]), sample=kv["sample"]))
    return regions


_REGIONS = None


def _region(m, layer):
    global _REGIONS
    if _REGIONS is None:
        _REGIONS = _parse_sfz()
    cands = [r for r in _REGIONS if r["layer"] == layer]
    for r in cands:
        if r["lo"] <= m <= r["hi"]:
            return r
    return min(cands, key=lambda r: abs(r["key"] - m))


@lru_cache(maxsize=None)
def _load(path):
    x, sr = sf.read(os.path.join(KIT, path), dtype="float64", always_2d=True)
    return x, sr


@lru_cache(maxsize=None)
def _pitched(path, semis):
    x, sr = _load(path)
    ratio = (SR / sr) / (2.0 ** (semis / 12.0))
    return resample_ratio(x, ratio)


def felt_piano(m, vel=0.6, dur=1.0, pedal=False, tone=0.0):
    """One felt-piano note.

    Built on the Kawai upright samples (CC0). 'Felt' = the hammer is softened: a velocity-
    dependent low-pass (dark when soft, opening when hard), a 4 ms rounded attack that takes
    the hard hammer click off, and a quiet low felt 'thump' under the onset. `tone` (-1..1)
    nudges brightness for a whole passage. The damper closes at `dur` unless `pedal`.
    """
    m = int(m)
    # WHY one layer per note, never a blend: the two velocity layers are separate recordings
    # (both peak-normalised), so blending them comb-filters. Soft layer for everything a
    # felt piano plays gently; the hard layer only for accents (vel >= 0.7).
    r = _region(m, "H" if vel >= 0.7 else "L")
    x = _pitched(r["sample"], m - r["key"]).copy()
    n = len(x)
    # trim: dampers close (or pedal rings on)
    tail = 1.4 if pedal else 0.16
    n_keep = min(n, int((dur + tail * 5) * SR))
    x = x[:n_keep]
    t = np.arange(n_keep) / SR
    damp = np.where(t < dur, 1.0, np.exp(-(t - dur) / tail))
    x *= damp[:, None]
    # felt: velocity-dependent darkness
    fc = 900.0 * 2 ** (vel * 2.4 + tone)
    x = biquad(x, "lp", fc, 0.6)
    x = onepole_lp(x, min(fc * 2.5, 16000))
    x = fade(x, fin=0.004)
    # felt thump: a tiny low knock of the felt hammer
    k = int(0.05 * SR)
    th = noise(k, seed=m) * np.exp(-np.arange(k) / (0.009 * SR))
    th = butter(th, "lowpass", 220, 2) * 0.35 * vel
    x[:k] += th[:, None]
    amp = 10 ** ((vel - 0.8) * 22 / 20)
    x *= amp * 1.6
    x = fade(x, fout=0.02)
    return x


# ================================================================ sub bass

def sub(m, dur, vel=0.8, glide_from=None):
    """Round sub bass: a sine with a whisper of saturation so it still reads on phone speakers."""
    f0 = midi_hz(m)
    n = int((dur + 0.25) * SR)
    f = np.full(n, f0)
    if glide_from is not None:
        g = int(0.06 * SR)
        f[:g] = np.geomspace(midi_hz(glide_from), f0, g)
    x = sine(f, n)
    x = sat(x * 1.8, 1.0) / 1.8 * 1.05 + 0.04 * sine(f * 2, n)
    e = env_adsr(n, 0.008, 0.6, 0.8, 0.09, dur)
    x = biquad(x * e * vel, "lp", 180, 0.7)
    return fade(x, fout=0.01)


# ================================================================ analog pad + pulse

def pad(notes, dur, vel=0.5, cutoff=1800, attack=0.9, release=1.6, seed=0, width=0.7, air=True):
    """Warm analog-style pad: three detuned band-limited saws per note through a 4-pole
    low-pass, voices spread across the stereo field, a breath of filtered noise for air."""
    r = rng(seed + 100)
    n = int((dur + release * 4) * SR)
    out = np.zeros((n, 2))
    e = env_adsr(n, attack, 1.5, 0.85, release, dur)
    for i, m in enumerate(notes):
        f0 = midi_hz(m)
        for j, (det, p) in enumerate(((-0.09, -width), (0.0, 0.0), (0.085, width))):
            drift = 1 + 0.0015 * sine(0.13 + 0.07 * j + 0.05 * i, n, r.uniform(0, 6))
            v = saw(f0 * 2 ** (det / 12) * drift, n, r.uniform())
            out += pan(v * 0.33 / np.sqrt(len(notes)), p * (1 if i % 2 else -1) if p else 0)
    lfo = 1 + 0.18 * sine(0.21, n, r.uniform(0, 6))
    fc = np.minimum(cutoff * lfo * (0.55 + 0.45 * e), 16000)
    out = lp4(sat(out, 1.2), fc, res=0.15)
    if air:
        lvl = 0.035 if air is True else float(air)
        a = butter(noise(n, seed + 7), "highpass", 7000, 2) * lvl
        out += pan(a, 0.4) * 0.5 + pan(butter(noise(n, seed + 8), "highpass", 7000, 2) * lvl, -0.4) * 0.5
    out *= e[:, None] * vel
    return fade(out, fout=0.05)


def duck_env(n, hits, depth=0.75, recover=0.11, offset=0.0):
    """Sidechain 'pulse' envelope: dips at each hit time and breathes back up."""
    t = np.arange(n) / SR
    g = np.ones(n)
    for h in hits:
        h = h - offset
        i0 = int(h * SR)
        if i0 >= n or i0 + int(recover * 6 * SR) < 0:
            continue
        i0 = max(i0, 0)
        i1 = min(n, i0 + int(recover * 6 * SR))
        tt = t[i0:i1] - t[i0]
        # 4 ms soft entry (no click), then an exponential breath back up
        dip = np.where(tt < 0.004, depth * (tt / 0.004), depth * np.exp(-(tt - 0.004) / recover))
        g[i0:i1] = np.minimum(g[i0:i1], 1 - dip)
    return g


# ================================================================ glass pluck (the machine)

def pluck(m, vel=0.6, decay=0.38, bright=1.0):
    """The machine's voice: a clean glassy pluck (2-operator FM with a fast index envelope,
    plus a faint inharmonic shimmer partial). Short, polite, precise."""
    f = midi_hz(m)
    n = int((decay * 6 + 0.05) * SR)
    t = np.arange(n) / SR
    idx = 1.6 * bright * np.exp(-t / 0.05)
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod)
    shimmer = 0.12 * np.sin(2 * np.pi * f * 4.02 * t) * np.exp(-t / 0.12)
    body = 0.25 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / (decay * 0.6))
    a = np.clip(t / 0.0015, 0, 1)
    x = (car + shimmer + body) * a * np.exp(-t / decay) * vel
    x = biquad(x, "lp", 7000, 0.6)
    return fade(x, fout=0.01)


# ================================================================ drums (tight, minimal)

def kick(vel=0.9, tone=48.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = tone + 95 * np.exp(-t / 0.03)
    x = sine(f, n) * np.exp(-t / 0.22)
    click = butter(noise(n, 11), "bandpass", [1500, 6000], 2) * np.exp(-t / 0.0015) * 0.18
    x = sat((x + click) * 1.4, 1.0)
    return fade(x * vel, fin=0.0005, fout=0.02)


def snap(vel=0.6, seed=0):
    """Soft clap/snap: three tight noise bursts and a short body, band-limited."""
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    nz = noise(n, 200 + seed)
    e = np.zeros(n)
    for k, d in enumerate((0.0, 0.009, 0.019)):
        e += np.where(t >= d, np.exp(-(t - d) / 0.006), 0) * (0.7 if k < 2 else 1.0)
    e += 0.45 * np.where(t >= 0.019, np.exp(-(t - 0.019) / 0.07), 0)
    x = butter(nz * e, "bandpass", [900, 5200], 2)
    body = sine(185 * (1 + 0.2 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.03) * 0.25
    return fade((x * 1.3 + body) * vel, fin=0.0005, fout=0.02)


def hat(vel=0.4, open_=False, seed=0):
    """808-style metallic hat: six square oscillators at inharmonic ratios, band-passed."""
    n = int((0.35 if open_ else 0.09) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        x += np.sign(np.sin(2 * np.pi * f * 1.7 * t + seed))
    x = butter(x, "bandpass", [7500, 14500], 4)
    x += butter(noise(n, 300 + seed), "highpass", 9000, 2) * 0.5
    x *= np.exp(-t / (0.1 if open_ else 0.018))
    return fade(x * vel * 0.25, fin=0.0003, fout=0.005)


def shaker(vel=0.3, seed=0):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    e = np.clip(t / 0.012, 0, 1) * np.exp(-t / 0.035)
    x = butter(noise(n, 400 + seed), "bandpass", [5000, 13000], 2) * e
    return fade(x * vel * 0.6, fout=0.005)


# ================================================================ effects

def swell(dur, f0=400, f1=9000, vel=0.3, seed=0):
    """Air swell into a downbeat: noise through a rising band-pass, curved fade-in."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    fc = f0 * (f1 / f0) ** (t / dur)
    x = tv_biquad(noise(n, 500 + seed), "bp", fc, 1.2)
    e = (t / dur) ** 2.2
    x = pan(x * e * vel, -0.3) * 0.5 + pan(tv_biquad(noise(n, 600 + seed), "bp", fc * 1.1, 1.2) * e * vel, 0.3) * 0.5
    return fade(x, fin=0.01, fout=0.006)


def thump(m, vel=0.8):
    """A soft sub 'bloom' for the logo landing: kick-like drop into a held sub note."""
    f0 = midi_hz(m)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.9 * np.exp(-t / 0.04))
    x = sine(f, n) * np.exp(-t / 0.55)
    x = sat(x * 1.3, 1.0)
    return fade(biquad(x * vel, "lp", 200, 0.7), fin=0.001, fout=0.05)


def tick(vel=0.5, seed=0):
    """Soft key tick: the felt-covered key bottoming out, a woody 'tk'."""
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    click = butter(noise(n, 700 + seed), "bandpass", [2200, 7000], 2) * np.exp(-t / 0.0012)
    wood = np.sin(2 * np.pi * 1650 * t) * np.exp(-t / 0.006) * 0.35
    low = np.sin(2 * np.pi * 210 * t) * np.exp(-t / 0.012) * 0.45
    x = (click * 0.9 + wood + low) * np.clip(t / 0.0004, 0, 1)
    return fade(x * vel, fout=0.01)
