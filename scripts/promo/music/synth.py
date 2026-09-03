"""A tiny software synthesizer in plain numpy — no scipy, no DAW.

Why this exists: the promo video's music is composed in code at a fixed tempo so
the video cuts can land on the beat grid exactly (song.py exports that grid as
JSON for the Remotion timeline). Everything here is a pure function over numpy
arrays at SR samples/second, mono float32 in [-1, 1] unless noted.

Filters with feedback (comb, allpass, delay) cannot be vectorised sample-by-
sample, but each output block of length D depends only on the block D samples
earlier — so they are computed one D-sized chunk at a time, which keeps a
70-second render in the single-digit seconds.
"""
from __future__ import annotations

import math
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)  # fixed seed: the same script always renders the same track


# ---------- basics ----------
def secs(n: float) -> int:
    return int(round(n * SR))


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n: int, a=0.005, d=0.1, s=0.0, r=0.05, gate: int | None = None) -> np.ndarray:
    """ADSR. `gate` = samples the key is held (default: everything before the release)."""
    a_n, d_n, r_n = max(1, secs(a)), max(1, secs(d)), max(1, secs(r))
    gate = n - r_n if gate is None else min(gate, n)
    e = np.zeros(n, dtype=np.float32)
    i = 0
    seg = min(a_n, n); e[:seg] = np.linspace(0, 1, seg, endpoint=False); i += seg
    seg = min(d_n, max(0, gate - i)); e[i:i + seg] = np.linspace(1, s, seg, endpoint=False); i += seg
    seg = max(0, gate - i); e[i:i + seg] = s; i += seg
    seg = min(r_n, n - i); start = e[i - 1] if i > 0 else 1.0
    e[i:i + seg] = start * np.exp(-5 * np.linspace(0, 1, seg)); i += seg
    return e


def exp_decay(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * SR)).astype(np.float32)


# ---------- oscillators ----------
def phase(freq, n: int, start=0.0) -> np.ndarray:
    """freq may be a scalar or a per-sample array (for sweeps / vibrato)."""
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    return (start + np.cumsum(f) / SR) % 1.0


def sine(freq, n, start=0.0):
    return np.sin(2 * np.pi * phase(freq, n, start)).astype(np.float32)


def saw(freq, n, start=0.0):
    return (2 * phase(freq, n, start) - 1).astype(np.float32)


def square(freq, n, duty=0.5, start=0.0):
    return np.where(phase(freq, n, start) < duty, 1.0, -1.0).astype(np.float32)


def tri(freq, n, start=0.0):
    return (2 * np.abs(2 * phase(freq, n, start) - 1) - 1).astype(np.float32)


def noise(n):
    return rng.uniform(-1, 1, n).astype(np.float32)


def supersaw(freq, n, voices=5, spread_cents=12.0):
    out = np.zeros(n, dtype=np.float32)
    for v in range(voices):
        c = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2) * spread_cents
        out += saw(freq * 2 ** (c / 1200), n, start=rng.uniform())
    return out / voices


# ---------- filters ----------
def onepole_lp(x: np.ndarray, cutoff, passes=2) -> np.ndarray:
    """6 dB/oct per pass; `cutoff` may be a per-sample array (envelope-driven sweep)."""
    fc = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = 1 - np.exp(-2 * np.pi * np.clip(fc, 10, SR * 0.45) / SR)
    y = x.astype(np.float64)
    for _ in range(passes):
        out = np.empty_like(y); acc = 0.0
        for i in range(len(y)):  # true IIR — the one loop we cannot vectorise
            acc += a[i] * (y[i] - acc); out[i] = acc
        y = out
    return y.astype(np.float32)


def onepole_hp(x: np.ndarray, cutoff, passes=1) -> np.ndarray:
    return (x - onepole_lp(x, cutoff, passes)).astype(np.float32)


def _feedback_comb(x, D, g, damp=0.0):
    """y[n] = x[n] + g * lp(y[n-D]) — processed D samples at a time."""
    y = np.zeros(len(x) + D, dtype=np.float64); xx = np.concatenate([x, np.zeros(D)])
    prev_lp = 0.0
    for s in range(0, len(y), D):
        e = min(s + D, len(y))
        fb = y[s - D:e - D] if s >= D else np.zeros(e - s)
        if damp:  # one-pole lowpass inside the loop tames the tail's fizz
            out = np.empty_like(fb)
            for i in range(len(fb)):
                prev_lp += (1 - damp) * (fb[i] - prev_lp); out[i] = prev_lp
            fb = out
        y[s:e] = xx[s:e] + g * fb
    return y[:len(x)]


def _allpass(x, D, g=0.5):
    y = np.zeros(len(x) + D, dtype=np.float64); xx = np.concatenate([x, np.zeros(D)])
    for s in range(0, len(y), D):
        e = min(s + D, len(y))
        xd = xx[s - D:e - D] if s >= D else np.zeros(e - s)
        yd = y[s - D:e - D] if s >= D else np.zeros(e - s)
        y[s:e] = -g * xx[s:e] + xd + g * yd
    return y[:len(x)]


def reverb(x: np.ndarray, size=0.85, damp=0.3, mix=0.25) -> np.ndarray:
    """Schroeder reverb: four combs in parallel, two allpasses in series."""
    wet = sum(_feedback_comb(x, secs(d), size * 0.84, damp) for d in (0.0297, 0.0371, 0.0411, 0.0437)) / 4
    wet = _allpass(_allpass(wet, secs(0.005)), secs(0.0017))
    return (x * (1 - mix) + wet * mix).astype(np.float32)


def delay(x: np.ndarray, time: float, feedback=0.35, mix=0.3, tone=4000) -> np.ndarray:
    wet = _feedback_comb(x, secs(time), feedback, damp=1 - (1 - math.exp(-2 * math.pi * tone / SR)))
    return (x + mix * (wet - x)).astype(np.float32)


def sidechain(n: int, hits: list[int], depth=0.7, recover=0.28) -> np.ndarray:
    """Pumping envelope: dips to (1-depth) at each hit sample and recovers exponentially."""
    g = np.ones(n, dtype=np.float32)
    for h in hits:
        seg = min(secs(recover), n - h)
        if seg <= 0: continue
        g[h:h + seg] = np.minimum(g[h:h + seg], 1 - depth * np.exp(-4 * np.linspace(0, 1, seg)))
    return g


def soft_clip(x: np.ndarray, drive=1.0) -> np.ndarray:
    return np.tanh(x * drive).astype(np.float32) / math.tanh(drive)


# ---------- drums ----------
def kick(punch=1.0, length=0.4):
    n = secs(length)
    f = 45 + 130 * np.exp(-np.arange(n) / (0.045 * SR))
    body = sine(f, n) * exp_decay(n, 0.13)
    click = noise(secs(0.004)) * 0.4
    body[:len(click)] += click
    return soft_clip(body * punch, 1.6)


def snare(bright=1.0, length=0.22):
    n = secs(length)
    tone = sine(185, n) * exp_decay(n, 0.05) * 0.5
    hiss = onepole_hp(noise(n), 1800) * exp_decay(n, 0.07) * bright
    return soft_clip(tone + hiss, 1.3) * 0.9


def clap(length=0.25):
    n = secs(length)
    body = np.zeros(n, dtype=np.float32)
    for k, off in enumerate((0, 0.011, 0.022, 0.034)):
        s = secs(off); seg = onepole_hp(noise(n - s), 1200) * exp_decay(n - s, 0.02 if k < 3 else 0.09)
        body[s:] += seg * (0.6 if k < 3 else 1.0)
    return body * 0.7


def hat(open_=False):
    n = secs(0.35 if open_ else 0.06)
    return onepole_hp(noise(n), 7000) * exp_decay(n, 0.09 if open_ else 0.014) * 0.5


def rim():
    n = secs(0.05)
    return (sine(900, n) * 0.5 + onepole_hp(noise(n), 2500) * 0.5) * exp_decay(n, 0.008)


# ---------- instruments (each returns a mono clip for one note) ----------
def bass_saw(note, dur, cutoff=900, sweep=1400, res_drive=1.4):
    n = secs(dur)
    x = (saw(midi(note), n) + saw(midi(note) * 1.005, n) * 0.5 + sine(midi(note) / 2, n) * 0.6) / 2
    e = env(n, 0.003, dur * 0.6, 0.35, 0.03)
    return onepole_lp(x, cutoff + sweep * e, 2) * e


def bass_sub(note, dur):
    n = secs(dur)
    return (sine(midi(note), n) * 0.8 + tri(midi(note), n) * 0.3) * env(n, 0.004, 0.08, 0.6, 0.04)


def chip_pulse(note, dur, duty=0.25, vib=0.0):
    """The chiptune voice: a narrow pulse with optional vibrato."""
    n = secs(dur)
    f = midi(note) * (1 + vib * 0.006 * sine(5.5, n))
    return square(f, n, duty) * env(n, 0.002, 0.06, 0.55, 0.03) * 0.5


def pluck(note, dur, bright=2600):
    n = secs(dur)
    e = env(n, 0.001, 0.12, 0.0, 0.02)
    x = (saw(midi(note), n) * 0.6 + square(midi(note), n, 0.3) * 0.4)
    return onepole_lp(x, 300 + bright * e, 2) * e * 0.6


def pad_supersaw(notes, dur, cutoff=1800):
    n = secs(dur)
    x = sum(supersaw(midi(m), n) for m in notes) / len(notes)
    return onepole_lp(x, cutoff, 1) * env(n, 0.35, 0.3, 0.8, 0.5) * 0.5


def rhodes(notes, dur, tremolo=0.15):
    n = secs(dur)
    out = np.zeros(n, dtype=np.float32)
    for m in notes:
        f = midi(m); ph = rng.uniform()
        tone = sine(f, n, ph) + 0.35 * sine(2 * f, n, ph) * exp_decay(n, 0.25) + 0.12 * sine(3 * f, n, ph) * exp_decay(n, 0.12) + 0.05 * sine(6.3 * f, n, ph) * exp_decay(n, 0.02)
        out += tone * env(n, 0.006, 0.8, 0.35, 0.25) * (1 - tremolo + tremolo * sine(4.6, n))
    return soft_clip(out / len(notes), 1.2) * 0.55


def lead_pulse(note, dur, glide_from=None):
    n = secs(dur)
    f0, f1 = midi(glide_from if glide_from is not None else note), midi(note)
    f = f1 + (f0 - f1) * np.exp(-np.arange(n) / (0.04 * SR))
    f = f * (1 + 0.004 * sine(5.8, n) * np.clip(np.arange(n) / (0.25 * SR), 0, 1))
    x = square(f, n, 0.5) * 0.6 + saw(f, n) * 0.4
    return onepole_lp(x, 3200, 1) * env(n, 0.01, 0.1, 0.7, 0.08) * 0.5


def vinyl(n: int, level=0.05):
    """Crackle + hiss for the lo-fi sketch."""
    hiss = onepole_lp(noise(n), 3500, 1) * 0.35
    crackle = np.zeros(n, dtype=np.float32)
    for i in rng.integers(0, n, size=max(1, n // secs(0.09))):
        crackle[i:i + 30] += rng.uniform(0.2, 1.0) * exp_decay(30, 0.0003)[:min(30, n - i)]
    return (hiss + crackle) * level


# ---------- mixing ----------
def place(buf: np.ndarray, clip: np.ndarray, at: int, gain=1.0):
    """Add `clip` into `buf` at sample `at` (clipped to the buffer)."""
    if at >= len(buf): return
    seg = min(len(clip), len(buf) - at)
    buf[at:at + seg] += clip[:seg] * gain


def to_stereo(mono: np.ndarray, width=0.0, pan=0.0) -> np.ndarray:
    """width: 0 = mono, 1 = a 12 ms Haas spread; pan in [-1, 1]."""
    l, r = mono.copy(), mono.copy()
    if width:
        d = secs(0.012 * width); r = np.concatenate([np.zeros(d, dtype=np.float32), r[:-d]])
    lg, rg = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    return np.stack([l * lg, r * rg], axis=1)


def master(stereo: np.ndarray, peak_db=-1.0) -> np.ndarray:
    x = soft_clip(stereo * 1.15, 1.1)
    x = x - x.mean(axis=0)  # remove DC offset (the sidechain-pumped pads leave a small one)
    x /= (np.abs(x).max() or 1.0)
    return (x * 10 ** (peak_db / 20)).astype(np.float32)


def write_wav(path: str, stereo: np.ndarray):
    pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
