"""New sounds for the playful-backing experiments.

Everything here sits BEHIND the piano. The piano tune, glass echo, pads and logo come unchanged
from the chosen "felt and pulse" code (snapshot in src/base/). Synth sounds are built from the
same band-limited oscillators and filters; strings are real recordings (VSCO 2 CE, CC0).
"""
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

import instruments as ins
from dsp import (SR, biquad, butter, fade, lp4, midi_hz, noise, resample_ratio, rng, sat, saw,
                 sine)

HERE = os.path.dirname(os.path.abspath(__file__))
VSCO = os.path.join(HERE, "..", "samples", "vsco", "Strings")


def _t(n):
    return np.arange(n) / SR


def _rise(t, a):
    """Raised-cosine attack of `a` seconds: rounded, so nothing clicks."""
    return np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / a, 0, 1)), 1.0)


# ================================================================ soft, felt-like low hits

def felt_thump(vel=0.8, f0=62.0, decay=0.11, seed=0):
    """A hand on a piano lid / a muffled heartbeat: a round low sine with a small pitch drop,
    a 4 ms rounded attack (no click), a dull felt contact and a faint wooden box resonance."""
    n = int(0.45 * SR)
    t = _t(n)
    f = f0 * (1 + 0.35 * np.exp(-t / 0.025))
    body = sine(f, n) * _rise(t, 0.004) * np.exp(-t / decay)
    knock = butter(noise(n, 900 + int(seed * 4)), "lowpass", 350, 2) * np.exp(-t / 0.012) * _rise(t, 0.002) * 0.6
    box = (np.sin(2 * np.pi * 118 * t) * np.exp(-t / 0.045) * 0.14
           + np.sin(2 * np.pi * 196 * t + 1.0) * np.exp(-t / 0.03) * 0.08) * _rise(t, 0.003)
    x = biquad(body + knock + box, "lp", 900, 0.7)
    return fade(x * vel, fout=0.03)


def brush(vel=0.4, seed=0):
    """A brush on a snare head, very soft: noise with a slow 15 ms swell and a short swish tail."""
    n = int(0.3 * SR)
    t = _t(n)
    e = _rise(t, 0.015) * np.exp(-np.maximum(t - 0.015, 0) / 0.075)
    x = butter(noise(n, 1000 + int(seed * 4)), "bandpass", [1400, 7500], 2) * e
    return fade(x * vel * 0.5, fout=0.02)


def sub808(m, dur, vel=0.8, drop=0.45):
    """Soft 808-style sub note: a pure sine that settles into pitch (no click: 6 ms rounded
    attack), long decay, a touch of 2nd harmonic so a phone speaker still hints at it."""
    f0 = midi_hz(m)
    n = int((dur + 0.12) * SR)
    t = _t(n)
    f = f0 * (1 + drop * np.exp(-t / 0.035))
    x = sine(f, n) + 0.10 * sine(2 * f, n)
    x = sat(x * 1.3, 1.0) / 1.3
    env = _rise(t, 0.006) * np.exp(-t / 1.1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.04))
    x = biquad(x * env * vel, "lp", 260, 0.7)
    return fade(x, fout=0.02)


# ================================================================ tiny ticks, clockwork

def micro_tick(vel=0.3, seed=0, f=7200.0):
    """A crisp, tiny tick (3 ms): a high damped blip plus a puff of air. Sits above everything."""
    n = int(0.03 * SR)
    t = _t(n)
    blip = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.0016)
    puff = butter(noise(n, 1100 + int(seed * 4)), "highpass", 6000, 2) * np.exp(-t / 0.0022) * 0.6
    return fade((blip + puff) * _rise(t, 0.0002) * vel, fout=0.004)


def woodblock(f0, vel=0.5, decay=0.03, seed=0):
    """A dry little woodblock: three damped modes at a wooden bar's ratios (1, 2.76, 5.40),
    excited by a 1 ms soft strike. Short and precise."""
    n = int((decay * 6 + 0.01) * SR)
    t = _t(n)
    x = np.zeros(n)
    for r, a, d in ((1.0, 1.0, decay), (2.76, 0.35, decay * 0.45), (5.40, 0.12, decay * 0.25)):
        x += a * np.sin(2 * np.pi * f0 * r * t + seed) * np.exp(-t / d)
    strike = butter(noise(n, 1200 + int(seed * 4)), "bandpass", [1500, 6000], 2) * np.exp(-t / 0.0007) * 0.25
    return fade((x + strike) * _rise(t, 0.0004) * vel, fout=0.004)


# ================================================================ the piano as a drum

def muted_piano(m, vel=0.5, tau=0.06, lp=500.0):
    """A piano note with the string muted by a palm: the real attack, then a fast decay and
    no ring. Low notes become a pitched thud (the "kick")."""
    x = ins.felt_piano(m, vel, 0.03, pedal=False)
    t = _t(len(x))
    x = x * (np.exp(-t / tau))[:, None]
    x = biquad(x, "lp", lp, 0.7)
    n = min(len(x), int(tau * 7 * SR))
    return fade(x[:n], fout=0.01)


def body_knock(vel=0.5, seed=0):
    """A knuckle on the piano's wooden case: noise ringing three low wood resonances."""
    n = int(0.25 * SR)
    t = _t(n)
    ex = noise(n, 1300 + int(seed * 4)) * np.exp(-t / 0.002)
    x = sum(biquad(ex, "bp", f, q) * a for f, q, a in ((98, 7, 1.0), (165, 8, 0.7), (262, 9, 0.45)))
    x = x * 9.0 + butter(ex, "lowpass", 900, 2) * 0.15
    return fade(x * vel, fout=0.02)


def damped_high(m, vel=0.3):
    """A high piano note stopped almost at once: a pitched 'tsk' for the hat role."""
    x = ins.felt_piano(m, vel, 0.02, pedal=False)
    t = _t(len(x))
    x = x * np.exp(-t / 0.028)[:, None]
    return fade(x[: int(0.12 * SR)], fout=0.01)


# ================================================================ synths

def _osc_stack(f, n, seed, detune_c=(-6, 6), sub=0.0, square=0.0):
    r = rng(seed)
    x = np.zeros(n)
    for c in detune_c:
        x += saw(f * 2 ** (c / 1200), n, r.uniform())
    x /= len(detune_c)
    if square:
        # band-limited pulse = difference of two saws half a cycle apart
        ph = r.uniform()
        x += square * 0.5 * (saw(f, n, ph) - saw(f, n, (ph + 0.5) % 1.0))
    if sub:
        x += sub * sine(f / 2, n)
    return x


def arp_voice(m, vel=0.5, cutoff=900.0, gate=0.11, seed=0, res=0.35):
    """Warm analog-style arp note: two detuned saws and a soft square, a resonant 4-pole
    low-pass whose envelope 'bubbles' open on each note, a short rounded amp envelope."""
    f = float(midi_hz(m))
    n = int((gate + 0.35) * SR)
    t = _t(n)
    x = _osc_stack(f, n, seed, square=0.35)
    fc = np.minimum(cutoff * (1 + 2.6 * np.exp(-t / 0.045)), 12000)
    x = lp4(sat(x, 1.2), fc, res=res)
    env = _rise(t, 0.003) * np.exp(-t / 0.16) * np.where(t < gate, 1.0, np.exp(-(t - gate) / 0.05))
    return fade(x * env * vel, fout=0.01)


def synth_bass(m, dur, vel=0.7, cutoff=260.0, seed=0, grit=1.8):
    """Bouncing synth bass: saw + square + a sine underneath for weight, a plucky filter
    envelope (opens to ~1.5 kHz and snaps shut), a little saturation for grit, round release."""
    f = float(midi_hz(m))
    n = int((dur + 0.15) * SR)
    t = _t(n)
    x = _osc_stack(f, n, seed, detune_c=(-4, 4), square=0.5) * 0.6 + 0.9 * sine(f, n)
    fc = np.minimum(cutoff * (1 + 4.5 * np.exp(-t / 0.07)), 6000)
    x = lp4(x, fc, res=0.3)
    x = sat(x * grit, 1.0) / grit
    env = _rise(t, 0.002) * (0.65 + 0.35 * np.exp(-t / 0.12)) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.035))
    return fade(x * env * vel, fout=0.01)


# ================================================================ strings (VSCO 2 CE, CC0)

# Section, articulation -> folder. VSCO names notes one octave LOW of concert pitch
# (measured: "VlnEns_Spic_D5" sounds D6, "spic_C3" sounds C4), hence OCTAVE_FIX = 12.
FOLDERS = {
    ("vln", "spic"): "Violin Section/Spic", ("vln", "pizz"): "Violin Section/Pizz",
    ("vln", "sus"): "Violin Section/susVib", ("vla", "spic"): "Viola Section/spic",
    ("vla", "pizz"): "Viola Section/pizz", ("vla", "sus"): "Viola Section/susvib",
    ("vc", "spic"): "Cello Section/spic", ("vc", "pizz"): "Cello Section/pizzT",
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
    # WHY trim: the recordings start with a little silence; notes must speak on the beat.
    # Start 4 ms before the first moment the note reaches -30 dB of its peak.
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


def string_note(sec, art, m, vel=0.6, dur=None, rr=0, release=0.18):
    """One real string note. Chooses the nearest recorded pitch (re-pitched by at most a
    couple of semitones), the soft or loud recorded layer by velocity, and alternates the
    round-robin takes so repeated notes are never the same recording twice in a row."""
    rows = _index(sec, art)
    layers = sorted({r["layer"] for r in rows})
    want = layers[-1] if vel >= 0.55 else layers[0]
    cands = [r for r in rows if r["layer"] == want] or rows
    best = min(abs(r["midi"] - m) for r in cands)
    near = [r for r in cands if abs(r["midi"] - m) == best]
    r = near[rr % len(near)]
    x, rms = _pitched(r["path"], m - r["midi"])
    x = x.copy()
    # WHY normalise by the take's own loudness, then re-apply velocity: takes differ by up to
    # 15 dB, and the dynamic should come from our velocity, not from which file was picked
    x *= (0.1 / max(rms, 1e-6)) * 10 ** ((vel - 0.7) * 18 / 20)
    if dur is not None:
        t = _t(len(x))
        x *= np.where(t < dur, 1.0, np.exp(-(t - dur) / release))[:, None]
        x = x[: min(len(x), int((dur + release * 6) * SR))]
    return fade(x, fin=0.002, fout=0.02)
