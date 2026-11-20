"""Real recorded strings (VSCO 2 Community Edition, CC0) for the chamber versions.

Adapted from ../../felt-and-pulse-playful/src/kit.py (string_note, _raw, _pitched), extended
with two sets that folder does not have: the cello section bowed (sustain with vibrato) and a
solo violin bowed. The older sets are read in place, read-only, from that folder's samples/;
the two new sets live in this folder's samples/ (fetch-extra.sh).
"""
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

from dsp import SR, fade, resample_ratio

HERE = os.path.dirname(os.path.abspath(__file__))
OLD = os.path.join(HERE, "..", "..", "..", "felt-and-pulse-playful", "samples", "vsco", "Strings")
NEW = os.path.join(HERE, "..", "samples", "vsco", "Strings")

# (section, articulation) -> (root, folder, octave correction in semitones).
# WHY a per-folder correction: VSCO names the SECTION recordings one octave below concert pitch
# (measured in the earlier round, and re-measured here for the cello sustain set by
# check_pitch.py); the solo violin set is named at concert pitch (its lowest file is G3, the
# violin's open G string), so it needs none.
FOLDERS = {
    ("vln", "pizz"): (OLD, "Violin Section/Pizz", 12),
    ("vln", "sus"): (OLD, "Violin Section/susVib", 12),
    ("vla", "pizz"): (OLD, "Viola Section/pizz", 12),
    ("vla", "sus"): (OLD, "Viola Section/susvib", 12),
    ("vc", "pizz"): (OLD, "Cello Section/pizzT", 12),
    ("vc", "sus"): (NEW, "Cello Section/susvib", 12),
    ("solo", "sus"): (NEW, "Solo Violin/Arco Vib", 0),
}
# WHY skip these takes: measured (spectral flux after alignment), one player in each plucks
# 100-190 ms after the others, a second attack that reads as a sloppy flam on a quick piece.
EXCLUDE = {"ViolaEns_pizz_A3_v2_rr1.wav", "ViolaEns_pizz_B2_v1_rr1.wav", "ViolaEns_pizz_F3_v1_rr1.wav",
           "pizzT_B3_v1_RR1.wav", "pizzT_F4_v1_RR2.wav", "VlnEns_Pizz_D3_v1_rr1.wav"}
_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_IDX = {}


def _layer(tag):
    # numbered layers (v1, v2, v3) or dynamics (p, f): higher = louder
    return {"p": 1, "f": 2}.get(tag, None) or int(tag)


def index(sec, art):
    key = (sec, art)
    if key not in _IDX:
        root, sub, fix = FOLDERS[key]
        d = os.path.join(root, sub)
        rows = []
        for fn in sorted(os.listdir(d)):
            mm = re.search(r"_([A-G])(#?)(\d)_(?:v(\d)|([pf]))", fn)
            if not mm or fn in EXCLUDE:
                continue
            midi = 12 * (int(mm.group(3)) + 1) + _NOTE[mm.group(1)] + (1 if mm.group(2) else 0) + fix
            rows.append(dict(path=os.path.join(d, fn), midi=midi, layer=_layer(mm.group(4) or mm.group(5))))
        _IDX[key] = rows
    return _IDX[key]


PRE = 0.025   # seconds of lead-in kept before a plucked note's main attack (see _raw)


@lru_cache(maxsize=None)
def _raw(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    m = np.abs(x).max(axis=1)
    pk = m.max()
    if "izz" in os.path.basename(path):
        # WHY align plucks on their main attack, not their first sound: a SECTION pizzicato is
        # several players plucking slightly apart, so the loudest moment can come up to 120 ms
        # after the first finger (measured). Trimming at the first sound made notes land late
        # and smeared. Here the point where the pluck reaches half its peak is put exactly PRE
        # seconds into the sample, and the player places the sample PRE early, so the bulk of
        # the pluck lands on the beat and the early fingers still sound just before it.
        w = max(1, int(0.003 * sr))
        e = np.convolve(m, np.ones(w) / w, mode="same")
        j = int(np.argmax(e > e.max() * 0.5))
        i = j - int(PRE * sr)
        if i < 0:
            # the file's own first samples become the start: round them in too (no click)
            x = x.copy()
            q = int(0.003 * sr)
            x[:q] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(q) / q))[:, None]
            x = np.concatenate([np.zeros((-i, x.shape[1])), x])
            i = 0
        x = x[i:].copy()
        r = int(0.008 * sr)
        x[:r] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(r) / r))[:, None]
        rms = float(np.sqrt((x[: int(0.25 * sr)] ** 2).mean()))
        return x, sr, rms
    # WHY trim: the recordings start with a little silence; notes must speak on the beat.
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


def note(sec, art, m, vel=0.6, dur=None, rr=0, release=0.18, attack=0.002):
    """One real string note: nearest recorded pitch (re-pitched a few semitones at most), the
    soft or loud recorded layer by velocity, round-robin takes alternated by `rr`."""
    rows = index(sec, art)
    layers = sorted({r["layer"] for r in rows})
    want = layers[-1] if vel >= 0.55 else layers[0]
    cands = [r for r in rows if r["layer"] == want] or rows
    best = min(abs(r["midi"] - m) for r in cands)
    near = [r for r in cands if abs(r["midi"] - m) == best]
    r = near[rr % len(near)]
    x, rms = _pitched(r["path"], m - r["midi"])
    x = x.copy()
    # WHY normalise by the take's own loudness, then re-apply velocity: takes differ by up to
    # 15 dB; the dynamic should come from the score, not from which file was picked
    x *= (0.1 / max(rms, 1e-6)) * 10 ** ((vel - 0.7) * 18 / 20)
    if dur is not None:
        t = np.arange(len(x)) / SR
        x *= np.where(t < dur, 1.0, np.exp(-(t - dur) / release))[:, None]
        x = x[: min(len(x), int((dur + release * 6) * SR))]
    return fade(x, fin=attack, fout=0.02)


def bowed(sec, m, dur_s, v0, v1, attack=0.25, release=0.3, rr=0, shape=None):
    """A sustained bowed note with a shaped dynamic: the soft and loud recordings crossfade as it
    grows, so a swell gets richer, not just louder. `shape` (optional) is a list of
    (fraction of the note, level 0..1) points between v0 and v1 for an arch or a lean."""
    soft = note(sec, "sus", m, 0.3, dur=dur_s, rr=rr, release=release, attack=0.01)
    loud = note(sec, "sus", m, 0.8, dur=dur_s, rr=rr, release=release, attack=0.01)
    n = min(len(soft), len(loud))
    t = np.arange(n) / SR
    frac = np.clip(t / max(dur_s, 0.05), 0, 1)
    if shape is None:
        shape = [(0, 0), (1, 1)]
    xs, ys = zip(*shape)
    s = np.interp(frac, xs, ys)
    lvl = v0 + (v1 - v0) * s
    # a bow's start: a rounded raised-cosine attack, never a click
    a = np.where(t < attack, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / attack, 0, 1)), 1.0)
    soft_g, loud_g = 10 ** ((0.3 - 0.7) * 18 / 20), 10 ** ((0.8 - 0.7) * 18 / 20)
    c = np.clip(s, 0, 1)
    x = soft[:n] / soft_g * (1 - c)[:, None] + loud[:n] / loud_g * c[:, None]
    x *= (lvl * a)[:, None]
    return fade(x, fin=0.005, fout=0.05)
