"""Every sound the songbook may use, and nothing else.

Allowed (the owner's rulings, ../../felt-and-pulse/RULES.md): the felt piano (the voice), real
recorded strings (plucked, held, a solo violin), a soft warm synth, a round sine sub, and a
synthetic hall/room. There is deliberately NO drum, click, noise burst, riser, whoosh or glass
pluck in this file, so no piece assembled from the songbook can contain one.

Sources (all CC0, read in place; see ../../SOURCES.md):
  - piano:   Upright Piano KW (FreePats), downloaded by ../../felt-and-pulse/render.sh
  - strings: VSCO 2 Community Edition, downloaded by ../../felt-and-pulse-playful and
             ../../playful-round2/chamber (cello sustain, solo violin)
Paths can be overridden with SONGBOOK_PIANO / SONGBOOK_STRINGS_A / SONGBOOK_STRINGS_B.

The piano and synth code are copies of felt-and-pulse/src/instruments.py and
playful-round2/blend/src/kit.py; the string code is playful-round2/chamber/src/strings.py.
Changes are marked WHY.
"""
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

from dsp import (SR, biquad, butter, env_adsr, fade, lp4, make_ir, midi_hz, noise, onepole_lp,
                 resample_ratio, rng, sat, saw, sine)

HERE = os.path.dirname(os.path.abspath(__file__))
SOUND = os.path.normpath(os.path.join(HERE, "..", "..", ".."))      # scripts/campaign/sound
PIANO_KIT = os.environ.get("SONGBOOK_PIANO") or os.path.join(
    SOUND, "felt-and-pulse", "samples", "upright-kw", "UprightPianoKW-SFZ+FLAC-20220221")
STRINGS_A = os.environ.get("SONGBOOK_STRINGS_A") or os.path.join(
    SOUND, "felt-and-pulse-playful", "samples", "vsco", "Strings")
STRINGS_B = os.environ.get("SONGBOOK_STRINGS_B") or os.path.join(
    SOUND, "playful-round2", "chamber", "samples", "vsco", "Strings")


def _rcos(t, a):
    """Raised-cosine rise over `a` seconds: rounded, never a click."""
    return np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(a, 1e-6), 0, 1)), 1.0)


# ================================================================ felt piano (sampled)

def _parse_sfz():
    text = open(os.path.join(PIANO_KIT, "UprightPianoKW-20220221.sfz"), encoding="utf-8").read()
    regions, layer = [], None
    for block in re.split(r"(?=<group>|<region>)", text):
        if block.startswith("<group>"):
            layer = "H" if "lovel=81" in block else "L"
        elif block.startswith("<region>"):
            kv = dict(re.findall(r"(\w+)=(\S+)", block))
            if "key" in kv:
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
def _piano_pitched(path, semis):
    x, sr = sf.read(os.path.join(PIANO_KIT, path), dtype="float64", always_2d=True)
    return resample_ratio(x, (SR / sr) / (2.0 ** (semis / 12.0)))


def felt_piano(m, vel=0.6, dur=1.0, pedal=False, tone=0.0, shine=0.0):
    """One felt-piano note (the brand's voice). Kawai upright samples softened like a felt
    piano: velocity-dependent low-pass, 4 ms rounded attack, a tiny low felt thump under the
    onset. `tone` (-1..1) nudges brightness for a whole passage. Damper closes at `dur`
    seconds unless `pedal` (then it rings on)."""
    m = int(m)
    r = _region(m, "H" if vel >= 0.7 else "L")
    x = _piano_pitched(r["sample"], m - r["key"]).copy()
    tail = 1.4 if pedal else 0.16
    n = min(len(x), int((dur + tail * 5) * SR))
    x = x[:n]
    t = np.arange(n) / SR
    x *= np.where(t < dur, 1.0, np.exp(-(t - dur) / tail))[:, None]
    fc = 900.0 * 2 ** (vel * 2.4 + tone)
    x = biquad(x, "lp", min(fc, 18000), 0.6)
    x = onepole_lp(x, min(fc * 2.5, 18000))
    x = fade(x, fin=0.004)
    k = int(0.05 * SR)
    th = noise(k, seed=m) * np.exp(-np.arange(k) / (0.009 * SR))
    x[:k] += (butter(th, "lowpass", 220, 2) * 0.35 * vel)[:, None]
    # WHY: some recordings carry a faint low room knock well below the note (measured in
    # logo-alternatives: G5 has one 166 ms in, 30 dB down). A gentle high-pass far below the
    # note removes it without touching the note itself.
    x = butter(x, "highpass", max(30.0, 0.35 * float(midi_hz(m))), 2)
    if shine > 0:
        x += (_brilliance(m, vel, len(x), dur, tail) * shine)[:, None] * np.abs(x).max()
    x *= 10 ** ((vel - 0.8) * 22 / 20) * 1.6
    return fade(x, fout=0.02)


def _brilliance(m, vel, n, dur, tail):
    """SHINE: the upper partials (6-15 kHz) of a piano string, which this recording lacks
    (measured on the raw samples: -85 to -90 dB below the note when played softly, so no
    filter setting can brighten it). They are added as pure partials of the note itself:
    piano-stretched harmonics (inharmonicity B = 0.00035), each quieter and shorter-lived the
    higher it is, rounded in over 3 ms and damped with the note. Tonal, not noise: it follows
    the note exactly, like the string's own shimmer. Returns a mono signal peaking near 1."""
    f0 = float(midi_hz(m))
    t = np.arange(n) / SR
    out = np.zeros(n)
    k0 = max(1, int(np.ceil(6000 / f0)))
    r = rng(1000 + m)
    k = k0
    while True:
        fk = k * f0 * np.sqrt(1 + 0.00035 * k * k)
        if fk > 15000:
            break
        tau = 0.35 * (4000.0 / fk) * (1.0 + 0.6 * vel)
        out += (k0 / k) ** 1.3 * np.sin(2 * np.pi * fk * t + r.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
        k += 1
    damp = np.where(t < dur, 1.0, np.exp(-(t - dur) / (tail * 0.5)))
    out *= _rcos(t, 0.003) * damp
    pk = np.abs(out).max()
    return (out / pk if pk > 0 else out) * vel ** 1.5


# ================================================================ sub bass (sine)

def sub(m, dur, vel=0.8):
    """Round sub bass: a sine with a whisper of saturation (still hinted on phone speakers).
    Rounded 25 ms entry so it is felt as warmth, never heard as a hit."""
    f0 = float(midi_hz(m))
    n = int((dur + 0.3) * SR)
    x = sine(np.full(n, f0), n)
    x = sat(x * 1.8, 1.0) / 1.8 * 1.05 + 0.04 * sine(np.full(n, 2 * f0), n)
    e = env_adsr(n, 0.025, 0.6, 0.85, 0.12, dur)
    return fade(biquad(x * e * vel, "lp", 180, 0.7), fout=0.02)


# ================================================================ soft warm synth

def synth(m, vel=0.5, cutoff=900.0, gate=0.16, seed=0):
    """Soft analog-style synth note (doubles the accompaniment quietly): two detuned saws and a
    soft square through a gentle 4-pole low-pass; rounded 6 ms attack (blend-1's synth used
    3 ms; softer here so it never reads as a tick)."""
    f = float(midi_hz(m))
    n = int((gate + 0.4) * SR)
    t = np.arange(n) / SR
    r = rng(seed)
    x = sum(saw(f * 2 ** (c / 1200), n, r.uniform()) for c in (-6, 6)) / 2
    ph = r.uniform()
    x = x + 0.35 * 0.5 * (saw(f, n, ph) - saw(f, n, (ph + 0.5) % 1.0))
    fc = np.minimum(cutoff * (1 + 1.6 * np.exp(-t / 0.06)), 9000)
    x = lp4(sat(x, 1.2), fc, res=0.15)
    env = _rcos(t, 0.006) * np.exp(-t / 0.22) * np.where(t < gate, 1.0, np.exp(-(t - gate) / 0.07))
    return fade(x * env * vel, fout=0.01)


# ================================================================ real strings (VSCO 2 CE)

# (section, articulation) -> (root, folder, octave correction). VSCO names SECTION recordings one
# octave below concert pitch (measured in earlier rounds); the solo violin is named at pitch.
FOLDERS = {
    ("vln", "pizz"): (STRINGS_A, "Violin Section/Pizz", 12),
    ("vln", "sus"): (STRINGS_A, "Violin Section/susVib", 12),
    ("vla", "pizz"): (STRINGS_A, "Viola Section/pizz", 12),
    ("vla", "sus"): (STRINGS_A, "Viola Section/susvib", 12),
    ("vc", "pizz"): (STRINGS_A, "Cello Section/pizzT", 12),
    ("vc", "sus"): (STRINGS_B, "Cello Section/susvib", 12),
    ("solo", "sus"): (STRINGS_B, "Solo Violin/Arco Vib", 0),
}
# WHY skip: in each of these takes one player plucks 100-190 ms late (a sloppy flam), measured
# in playful-round2/chamber.
EXCLUDE = {"ViolaEns_pizz_A3_v2_rr1.wav", "ViolaEns_pizz_B2_v1_rr1.wav", "ViolaEns_pizz_F3_v1_rr1.wav",
           "pizzT_B3_v1_RR1.wav", "pizzT_F4_v1_RR2.wav", "VlnEns_Pizz_D3_v1_rr1.wav"}
_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_IDX = {}
PRE = 0.025   # seconds of lead-in kept before a pluck's main attack


def _index(sec, art):
    key = (sec, art)
    if key not in _IDX:
        root, sub_, fix = FOLDERS[key]
        d = os.path.join(root, sub_)
        rows = []
        for fn in sorted(os.listdir(d)):
            mm = re.search(r"_([A-G])(#?)(\d)_(?:v(\d)|([pf]))", fn)
            if not mm or fn in EXCLUDE:
                continue
            midi = 12 * (int(mm.group(3)) + 1) + _NOTE[mm.group(1)] + (1 if mm.group(2) else 0) + fix
            tag = mm.group(4) or mm.group(5)
            rows.append(dict(path=os.path.join(d, fn), midi=midi, layer={"p": 1, "f": 2}.get(tag) or int(tag)))
        _IDX[key] = rows
    return _IDX[key]


@lru_cache(maxsize=None)
def _raw(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    m = np.abs(x).max(axis=1)
    if "izz" in os.path.basename(path):
        # WHY align plucks on their main attack: a section pizzicato is several players a little
        # apart; the half-peak point is put PRE seconds in, and the player places the sample PRE
        # early, so the bulk of the pluck lands on the beat (playful-round2/chamber).
        w = max(1, int(0.003 * sr))
        e = np.convolve(m, np.ones(w) / w, mode="same")
        j = int(np.argmax(e > e.max() * 0.5))
        i = j - int(PRE * sr)
        if i < 0:
            x = np.concatenate([np.zeros((-i, x.shape[1])), x])
            i = 0
        x = x[i:].copy()
        r = int(0.008 * sr)
        x[:r] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(r) / r))[:, None]
    else:
        i = max(0, int(np.argmax(m > m.max() * 10 ** (-30 / 20))) - int(0.004 * sr))
        x = x[i:]
    rms = float(np.sqrt((x[: int(0.25 * sr)] ** 2).mean()))
    return x, sr, rms


@lru_cache(maxsize=None)
def _str_pitched(path, semis):
    x, sr, rms = _raw(path)
    return resample_ratio(x, (SR / sr) / (2.0 ** (semis / 12.0))), rms


def string_note(sec, art, m, vel=0.6, dur=None, rr=0, release=0.18, attack=0.002):
    """One real string note: nearest recorded pitch (re-pitched a couple of semitones at
    most), soft or loud recorded layer by velocity, round-robin takes alternated by `rr`."""
    rows = _index(sec, art)
    layers = sorted({r["layer"] for r in rows})
    want = layers[-1] if vel >= 0.55 else layers[0]
    cands = [r for r in rows if r["layer"] == want] or rows
    best = min(abs(r["midi"] - m) for r in cands)
    near = [r for r in cands if abs(r["midi"] - m) == best]
    r = near[rr % len(near)]
    x, rms = _str_pitched(r["path"], m - r["midi"])
    x = x * ((0.1 / max(rms, 1e-6)) * 10 ** ((vel - 0.7) * 18 / 20))
    if dur is not None:
        t = np.arange(len(x)) / SR
        x = x * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))[:, None]
        x = x[: min(len(x), int((dur + release * 6) * SR))]
    return fade(x, fin=attack, fout=0.02)


def pizz(sec, m, vel=0.5, rr=0):
    """A plucked string note. Returns (audio, lead_in): place it lead_in seconds early."""
    return string_note(sec, "pizz", m, vel, rr=rr), PRE


def bowed(sec, m, dur_s, v0, v1, attack=0.25, release=0.3, rr=0):
    """A held bowed note whose level moves in one straight line from v0 to v1 (smooth by
    construction; no swell-and-dip). The soft and loud recordings crossfade as it grows, so
    it gets richer, not just louder; the bow's own start stays in (real bow detail), rounded
    by a raised-cosine `attack`."""
    soft = string_note(sec, "sus", m, 0.3, dur=dur_s, rr=rr, release=release, attack=0.01)
    loud = string_note(sec, "sus", m, 0.8, dur=dur_s, rr=rr, release=release, attack=0.01)
    n = min(len(soft), len(loud))
    t = np.arange(n) / SR
    c = np.clip(t / max(dur_s, 0.05), 0, 1)
    lvl = v0 + (v1 - v0) * c
    mix = np.clip((v0 + v1) / 2, 0, 1)        # richer recording when the line is louder
    soft_g, loud_g = 10 ** ((0.3 - 0.7) * 18 / 20), 10 ** ((0.8 - 0.7) * 18 / 20)
    x = soft[:n] / soft_g * (1 - mix) + loud[:n] / loud_g * mix
    x = x * (lvl * _rcos(t, attack))[:, None]
    return fade(x, fin=0.005, fout=0.05)


# ================================================================ space

_IRS = {}


def ir(name):
    """The two shared spaces (felt-and-pulse/src/arrange.py): a 3.4 s hall and a small room."""
    if name not in _IRS:
        if name == "hall":
            _IRS[name] = make_ir(3.4, rt=(2.2, 2.7, 1.8, 1.0), predelay=0.022, seed=3, width=0.75)
        else:
            _IRS[name] = make_ir(0.8, rt=(0.4, 0.5, 0.35, 0.25), predelay=0.004, seed=5, width=0.6)
    return _IRS[name]
