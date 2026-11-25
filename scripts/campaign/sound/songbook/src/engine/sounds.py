"""Every sound the songbook may use, and nothing else.

Allowed (the owner's rulings, ../../felt-and-pulse/RULES.md): the felt piano (the voice), real
recorded strings (plucked, held, a solo violin), a soft warm synth, a soft held pad (2026-11-24,
the sustained layer: pad_note / pad_layer / pad_voicing), a round sine sub, and a synthetic
hall/room. Switchable choices (the owner's by-ear A/Bs) live in options.py. There is deliberately NO drum, click, noise burst, riser, whoosh or glass
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

import options
from dsp import (SR, _rbj, biquad, butter, db, env_adsr, fade, lp4, make_ir, midi_hz, noise, onepole_lp,
                 resample_ratio, rng, sat, saw, sine)
from scipy import signal as _signal

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

_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _midi_of(letter, sharp, octave):
    return 12 * (int(octave) + 1) + _NAMES[letter.upper()] + (1 if sharp else 0)


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
                                key=int(kv["pitch_keycenter"]), sample=os.path.join(PIANO_KIT, kv["sample"])))
    return regions


def _scan(folder, pattern, layers):
    """Regions for a folder of one-note recordings named by pitch. `pattern` captures (letter,
    sharp, octave, layer tag); `layers` maps a tag to "L" (soft) or "H" (loud). Each recording
    covers the keys nearest to it (re-pitched; see _region)."""
    regions = []
    if not os.path.isdir(folder):
        raise FileNotFoundError(f"Piano recordings not found: {folder} (run songbook/fetch-samples.sh; see SOURCES.md)")
    for fn in sorted(os.listdir(folder)):
        mm = re.match(pattern, fn)
        if not mm or mm.group(4) not in layers:
            continue
        k = _midi_of(mm.group(1), mm.group(2), mm.group(3))
        regions.append(dict(layer=layers[mm.group(4)], lo=k, hi=k, key=k, sample=os.path.join(folder, fn)))
    return regions


# WHY kits (plan b1): two open-licence alternatives may be A/B'd against the current piano,
# through the SAME felt processing, before any switch (the owner decides). The soft and loud
# layers chosen from each alternative are the ones closest to the current kit's two layers.
SAMPLES = os.path.join(HERE, "..", "..", "samples")


def _kit_regions(name):
    if name == "upright-kw":
        return _parse_sfz()
    if name == "vcsl-upright":
        # VCSL "Upright Piano, Yamaha" (CC0): sustains every 5-7 semitones, three layers
        return _scan(os.path.join(SAMPLES, "vcsl-upright"), r"Upright1_Sus_([A-G])(#?)(\d)_vl(\d)_rr1\.wav$",
                     {"1": "L", "2": "H"})
    if name == "salamander":
        # Salamander Grand V3 (CC-BY 3.0, Alexander Holm): 16 layers every 3 semitones
        return _scan(os.path.join(SAMPLES, "salamander"), r"([A-G])(#?)(\d)v(\d+)\.flac$", {"5": "L", "9": "H"})
    raise KeyError(f"unknown piano kit {name!r}")


_KITS = {}


def _kit():
    name = options.get("piano")
    if name not in _KITS:
        _KITS[name] = _kit_regions(name)
    return name, _KITS[name]


def _region(m, layer, regions=None):
    regions = regions if regions is not None else _kit()[1]
    cands = [r for r in regions if r["layer"] == layer]
    for r in cands:
        if r["lo"] <= m <= r["hi"] and (r["lo"] != r["hi"] or r["key"] == m):
            return r
    return min(cands, key=lambda r: (abs(r["key"] - m), r["key"]))


@lru_cache(maxsize=None)
def _piano_pitched(path, semis):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    # the two repairs below are for the A/B pianos only (samples/): the default kit stays byte-identical
    ab = os.path.abspath(path).startswith(os.path.abspath(SAMPLES) + os.sep)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    elif ab:
        # WHY (integration, 2026-11-25): the VCSL upright's two channels are recorded with opposite
        # polarity (their first 300 ms correlate -0.8 to -0.9, measured on C4); summed to mono
        # (a phone speaker, and every measurement here) the note nearly cancels: notes came out
        # 25-45 dB quiet and the mono fold lost 3.5 LU. A recording whose channels are clearly
        # anti-correlated gets its right channel's polarity turned (7 VCSL files, 13 of Salamander's
        # 60, none of the Upright KW's).
        n = min(len(x), int(0.3 * sr))
        a, b = x[:n, 0], x[:n, 1]
        den = float(np.sqrt((a * a).sum() * (b * b).sum()))
        if den > 0 and float((a * b).sum()) / den < -0.3:
            x = x * np.array([1.0, -1.0])
    # WHY (integration, 2026-11-25): some A/B recordings stop while still sounding (VCSL G5 soft:
    # 1.2 s long, its last samples 30 dB under its peak), and a long note then ends in a click the
    # attack check heard as a note that was never played. An A/B recording whose last 20 ms are
    # still above -60 dB re its peak gets a 20 ms fade there (4 VCSL files). The default kit is not
    # touched, so the pieces the owner has heard stay byte-identical.
    k = int(0.02 * sr)
    pk = float(np.abs(x).max())
    if ab and len(x) > 4 * k and pk > 0 and float(np.abs(x[-k:]).max()) > pk * 1e-3:
        x = x.copy()
        x[-k:] *= np.linspace(1.0, 0.0, k)[:, None]
    return resample_ratio(x, (SR / sr) / (2.0 ** (semis / 12.0)))


def _felt_probe(x):
    """The felt filter at a soft touch (0.45), mono, as felt_piano applies it: what calibration
    and alignment listen to."""
    fc = 900.0 * 2 ** (0.45 * 2.4)
    return onepole_lp(biquad(x, "lp", fc, 0.6), fc * 2.5)


def _centroid_st(y, f0):
    f, p = _signal.welch(y, SR, nperseg=min(4096, len(y)))
    return 12 * np.log2(max(float((f * p).sum() / max(p.sum(), 1e-30)), 1.0) / f0)


@lru_cache(maxsize=None)
def _evenness(kit):
    """Per-recording corrections so neighbouring keys match (plan b2, "some notes come out much
    louder and brighter than their neighbours").

    WHY: each key's recording was normalised on its own, so on the Upright KW neighbouring
    recordings differ by up to 4 dB in level and up to 6 semitones in spectral centroid at a soft
    touch (measured 2026-11-24). Each recording is heard through the felt filter at a soft touch
    for 300 ms; a smooth curve (quadratic in key) is fitted across the keyboard for level and for
    brightness; each recording then gets a gentle high shelf (at 3x its pitch, +-6 dB at most)
    that brings its brightness to the curve, and a gain that brings its level to the SOFT layer's
    curve (+-4 dB at most). WHY a shelf, not the felt filter's cutoff: moving the cutoff changed
    the centroid by under a tenth of what was needed. Both layers share the soft layer's level
    curve, so moving between them never changes loudness; loudness comes from the touch alone.
    Returns {path: (gain_db, shelf_db, shelf_hz)}."""
    _, regions = _kit()
    out, ref_fit = {}, None
    n = int(0.3 * SR)
    for layer in ("L", "H"):
        rows = []
        for r in regions:
            if r["layer"] != layer or not 33 <= r["key"] <= 100:
                continue
            x = _piano_pitched(r["sample"], 0)[:n].mean(axis=1)
            y = _felt_probe(x)
            f0 = float(midi_hz(r["key"]))
            rows.append((r["key"], y, f0, r["sample"]))
        if len(rows) < 4:
            continue
        k = np.array([q[0] for q in rows], float)
        br = np.array([_centroid_st(q[1], q[2]) for q in rows])
        bfit = np.polyval(np.polyfit(k, br, 2), k)
        shelves = []
        for (key, y, f0, path), want in zip(rows, bfit):
            hz = min(3 * f0, 6000.0)
            best = min(np.arange(-6.0, 6.01, 0.75),
                       key=lambda g: abs(_centroid_st(biquad(y, "highshelf", hz, 0.7, g) if g else y, f0) - want))
            yy = biquad(y, "highshelf", hz, 0.7, best) if best else y
            shelves.append((float(best), hz, float(db(np.sqrt((yy ** 2).mean())))))
        lv = np.array([q[2] for q in shelves])
        lfit = np.polyfit(k, lv, 2)
        # WHY flat and wider for the A/B pianos (integration, 2026-11-25): their recordings are not
        # levelled key by key the way the Upright KW's are; the VCSL soft layer falls 21 dB from
        # E-flat 4 to G5 and Salamander's 10 dB (measured through this felt filter), so the tune and
        # the logo's G5/F5 came out far under the pulse and the A/B compared registers, not pianos.
        # Levelled flat (to the soft layer's median, up to +-24 dB) they play "the same notes
        # through the same felt processing" (plan b1). The default kit keeps its curve and +-4 dB.
        wide = kit != "upright-kw"
        if ref_fit is None:
            ref_fit = np.array([0.0, 0.0, float(np.median(lv))]) if wide else lfit
        lim = 24.0 if wide else 4.0
        for (key, _, _, path), (g_sh, hz, l) in zip(rows, shelves):
            out[path] = (float(np.clip(np.polyval(ref_fit, key) - l, -lim, lim)), g_sh, hz)
    return out


@lru_cache(maxsize=None)
def _layer_lag(path_l, semis_l, path_h, semis_h):
    """Samples to advance the loud recording so it lines up with the soft one (within +-3 ms),
    found by cross-correlating their first 300 ms through the felt filter. WHY: summed unaligned,
    the two recordings of one key partly cancel (measured on the Upright KW: from +2.4 to -8.5 dB
    at an equal-power midpoint, note by note); lined up they correlate 0.75-0.98 and a plain
    amplitude crossfade stays within about 1 dB."""
    n, L = int(0.3 * SR), int(0.003 * SR)
    a = _felt_probe(_piano_pitched(path_l, semis_l)[:n].mean(axis=1))
    b = _felt_probe(_piano_pitched(path_h, semis_h)[: n + L].mean(axis=1))
    b = np.concatenate([np.zeros(L), b])
    c = _signal.correlate(b, a, mode="valid")          # lag j: b[j:j+n] against a
    return int(np.argmax(c[: 2 * L + 1])) - L


PEDAL_LAG = 0.05     # seconds: syncopated pedal, the dampers lift this long AFTER the new chord


def pedal_damp_at(note_t, next_change_t):
    """Plan b2 (syncopated pedal): for a pedalled note starting at `note_t` (s), the `damp_at`
    to pass to felt_piano so its dampers fall PEDAL_LAG after the next chord's onset, never
    before it."""
    return max(0.0, next_change_t + PEDAL_LAG - note_t)


def felt_piano(m, vel=0.6, dur=1.0, pedal=False, tone=0.0, shine=0.0, phrase_vel=None, damp_at=None):
    """One felt-piano note (the brand's voice). Upright samples softened like a felt piano:
    touch-dependent low-pass, 4 ms rounded attack, a tiny low felt thump under the onset.
    `tone` (-1..1) nudges brightness for a whole passage. Damper closes at `dur` seconds
    unless `pedal` (then it rings on).

    2026-11-24 (plan b2), each switchable in options.py:
      - the soft and loud recordings, lined up, crossfade between touch 0.55 and 0.80 instead
        of switching at 0.7 (piano_layers);
      - every recording is matched to its neighbours in level and brightness (piano_even);
      - `phrase_vel`: the phrase's base touch. The filter then follows the PHRASE, with this
        note's own deviation counting 25 %, so neighbouring notes keep one colour; loudness still
        follows the note's own touch. None = the note's own touch (the old behaviour);
      - `damp_at`: seconds after the onset when the dampers fall (a pedal lift; see
        pedal_damp_at). None = at `dur` (unpedalled) or a long ring (pedalled);
      - while the pedal is down, a faint ring of the undamped strings (piano_resonance), and a
        soft felt thump when an unpedalled damper lands (damper_thump);
      - shine (added 6-15 kHz partials) is off by default and capped at -30 dB (piano_shine)."""
    m = int(m)
    kit, regions = _kit()
    even = _evenness(kit) if options.get("piano_even") == "on" else {}
    if options.get("piano_layers") == "switch":
        parts = [("H" if vel >= 0.7 else "L", 1.0)]
    else:
        # WHY a plain amplitude crossfade (not equal power, as the plan first proposed): once the
        # loud recording is lined up with the soft one (_layer_lag) the two are strongly
        # correlated, so amplitude weights keep the level flat (measured) where equal-power
        # weights would bulge by ~2.8 dB in the middle
        u = float(np.clip((vel - 0.55) / 0.25, 0.0, 1.0))
        parts = [(ly, g) for ly, g in (("L", 1.0 - u), ("H", u)) if g > 1e-3]
    xs, rl = [], {}
    for ly, g in parts:
        rl[ly] = _region(m, ly, regions)
    for ly, g in parts:
        r = rl[ly]
        a = _piano_pitched(r["sample"], m - r["key"])
        if ly == "H" and len(parts) == 2:
            lag = _layer_lag(rl["L"]["sample"], m - rl["L"]["key"], r["sample"], m - r["key"])
            a = a[lag:] if lag >= 0 else np.concatenate([np.zeros((-lag, a.shape[1])), a])
        gain_db, sh_db, sh_hz = even.get(r["sample"], (0.0, 0.0, 0.0))
        if sh_db:
            a = biquad(a, "highshelf", sh_hz, 0.7, sh_db)
        xs.append(a * (g * 10 ** (gain_db / 20)))
    n_raw = max(len(a) for a in xs)
    x = np.zeros((n_raw, 2))
    for a in xs:
        x[: len(a)] += a
    tail = 1.4 if pedal else 0.16
    off = dur if damp_at is None else float(damp_at)
    if damp_at is not None:
        tail = 0.22          # a lifted pedal / damper landing: quick but never abrupt
    n = min(len(x), int((off + tail * 5) * SR))
    x = x[:n]
    t = np.arange(n) / SR
    damp = np.where(t < off, 1.0, np.exp(-(t - off) / tail))
    x *= damp[:, None]
    v_f = vel if phrase_vel is None else float(phrase_vel) + 0.25 * (vel - float(phrase_vel))
    fc = 900.0 * 2 ** (v_f * 2.4 + tone)
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
    sh = options.get("piano_shine")
    if shine > 0 and sh != "off":
        # WHY capped at -30 dB re the note (plan b2): the added partials were the brightest
        # thing in round-7 tunes; "as-written" keeps the old amount for A/B only
        s = shine if sh == "as-written" else min(shine, 10 ** (-30 / 20))
        x += (_brilliance(m, vel, len(x), off, tail) * s)[:, None] * np.abs(x).max()
    x *= 10 ** ((vel - 0.8) * 22 / 20) * 1.6
    if pedal and options.get("piano_resonance") == "on":
        x += _resonance(m, x, damp)
    if options.get("damper_thump") == "on" and (not pedal or damp_at is not None):
        _thump(x, m, off)
    return fade(x, fout=0.02)


def _resonance(m, x, damp):
    """The undamped strings ringing in sympathy while the pedal is down (plan b2): the played
    note's own partials below 4 kHz, rising over 80 ms, decaying slowly, damped with the note,
    about -33 dB re the whole note. Tonal (no noise); left and right start at
    different phases so the halo is a little wide."""
    n = len(x)
    f0 = float(midi_hz(m))
    t = np.arange(n) / SR
    r = rng(5000 + m)
    out = np.zeros((n, 2))
    k = 1
    while k * f0 < 4000 and k <= 10:
        fk = k * f0 * np.sqrt(1 + 0.00035 * k * k)
        a = k ** -1.2
        for ch in range(2):
            out[:, ch] += a * np.sin(2 * np.pi * fk * t + r.uniform(0, 2 * np.pi))
        k += 1
    env = _rcos(t, 0.08) * np.exp(-t / 3.0) * damp
    out *= env[:, None]
    ref = float(np.sqrt((x[: int(0.5 * SR)] ** 2).mean()))
    rr = float(np.sqrt((out[: int(0.5 * SR)] ** 2).mean()))
    # WHY -36 at the start: the ring decays more slowly than the note, so over a whole pedalled
    # note it measures about -33 dB re the note (plan: -30 to -36)
    return out * (ref / rr * 10 ** (-36 / 20) if rr > 0 else 0.0)


def _thump(x, m, off):
    """A damper landing on the strings (plan b2): a soft felt thump below 150 Hz, rounded in
    over 5 ms, -38 dB re the note's peak. In place."""
    i = int(off * SR)
    k = int(0.06 * SR)
    if i >= len(x) - 8:
        return
    k = min(k, len(x) - i)
    tt = np.arange(k) / SR
    th = noise(k, seed=7000 + m) * _rcos(tt, 0.005) * np.exp(-tt / 0.012)
    th = butter(butter(th, "lowpass", 150, 2), "highpass", 30, 2)
    pk = float(np.abs(th).max())
    if pk > 0:
        x[i:i + k] += (th / pk * float(np.abs(x).max()) * 10 ** (-38 / 20))[:, None]


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


# ================================================================ soft held pad (2026-11-24)
#
# WHY (plan b3; research "something held always sounds underneath"): the songbook had no
# sustained electronic layer; `synth` above is a 6 ms pluck and must only ever double. The pad is
# the bed the GTA V map music and Eno sit on: two gently detuned oscillators through a dark
# 24 dB/oct low-pass with no filter envelope, slow fades, and very slow drift, so it never
# "starts" audibly and never sits still.

def _tri(f, n, phase0=0.0):
    """Band-limited triangle (odd harmonics, 1/k^2, up to 18 kHz): rounder than the saw."""
    f = np.broadcast_to(np.asarray(f, float), (n,))
    ph = 2 * np.pi * (phase0 + (np.cumsum(f) - f[0]) / SR)
    out = np.zeros(n)
    fmax = float(f.max())
    k = 1
    while k * fmax < 18000:
        out += ((-1) ** ((k - 1) // 2)) * np.sin(k * ph) / (k * k)
        k += 2
    return out * (8 / np.pi ** 2)


def _lp4_slow(x, fc, block=256):
    """24 dB/oct low-pass (two Butterworth-Q biquads) with a slowly moving cutoff. WHY a larger
    block than dsp.tv_biquad: the cutoff moves over tens of seconds, so 5 ms coefficient steps
    are inaudible and the pad renders ~8x faster."""
    y = x
    for q in (0.5412, 1.3066):
        out = np.zeros_like(y)
        zi = None
        for i in range(0, len(y), block):
            seg = y[i:i + block]
            b, a = _rbj("lp", float(fc[min(i + block // 2, len(fc) - 1)]), q)
            if zi is None:
                zi = np.zeros((2,) + seg.shape[1:])
            out[i:i + block], zi = _signal.lfilter(b, a, seg, axis=0, zi=zi)
        y = out
    return y


def pad_note(m, dur, vel=0.5, t0=0.0, attack=None, release=None, cutoff=None, keytrack=0.5,
             detune=4.0, sub_octave=None, timbre=None, seed=0):
    """One held pad note, stereo, starting at its own sample 0.

    m        MIDI note (voice it between Bb2 and Bb4; see pad_voicing)
    dur      seconds the key is held (the release follows)
    vel      linear level (the pad bus sets the real level)
    t0       the note's start time IN THE PIECE (s): the slow drifts are functions of absolute
             time, so a held voicing and a new chord drift together, never restarting
    attack / release   seconds (options pad_attack 1.2 / pad_release 2.2); raised-cosine rise,
             exponential fall reaching -40 dB at `release`
    cutoff   Hz at middle C (option pad_cutoff 900), key-tracked `keytrack` (50 %): higher notes
             open a little, never more
    detune   cents between the two oscillators (3-5); each also drifts +-1 cent at 0.05 Hz
    timbre   "saw" | "triangle" (option pad_timbre)
    sub_octave  add a sine an octave down at -12 dB (option pad_sub)
    The two oscillators lean to opposite sides, so the pad is ~25 % wider than the piano."""
    attack = float(options.get("pad_attack") if attack is None else attack)
    release = float(options.get("pad_release") if release is None else release)
    cutoff = float(options.get("pad_cutoff") if cutoff is None else cutoff)
    timbre = options.get("pad_timbre") if timbre is None else timbre
    sub_octave = options.get("pad_sub") if sub_octave is None else sub_octave
    f0 = float(midi_hz(m))
    n = int((dur + release * 1.3 + 0.05) * SR)
    t = np.arange(n) / SR
    ta = t0 + t
    r = rng(9000 + 97 * int(m) + seed)
    ph_d, ph_c = r.uniform(0, 2 * np.pi), r.uniform(0, 2 * np.pi)
    drift = 1.0 * np.sin(2 * np.pi * 0.05 * ta + ph_d)
    osc = _tri if timbre == "triangle" else saw
    a = osc(f0 * 2 ** ((-detune / 2 + drift) / 1200), n, r.uniform())
    b = osc(f0 * 2 ** ((detune / 2 - drift) / 1200), n, r.uniform())
    # WHY 0.31: side/mid = (1 - k)/(1 + k) for the two (nearly uncorrelated) oscillators, -5.4 dB;
    # the felt piano measures a median -7.2 dB (Eb3-C6, pedalled), so the pad is ~25 % wider (plan b3)
    x = np.stack([a + 0.31 * b, b + 0.31 * a], axis=1) / 1.31
    if sub_octave:
        x += (10 ** (-12 / 20) * np.sin(2 * np.pi * f0 / 2 * t + r.uniform(0, 2 * np.pi)))[:, None]
    # WHY one cutoff LFO at 0.04 Hz, +-15 %: the "gentle shimmer" of a pad is slow movement of
    # its colour; 25 s per cycle is far below anything heard as a wobble
    fc = cutoff * (f0 / 261.63) ** keytrack * (1 + 0.15 * np.sin(2 * np.pi * 0.04 * ta + ph_c))
    x = _lp4_slow(x, np.minimum(fc, 6000.0))
    rise = _rcos(t, max(attack, 0.05))
    fall = np.where(t < dur, 1.0, np.exp(-(t - dur) * 4.6 / max(release, 0.05)))
    x *= (rise * fall * vel)[:, None]
    return fade(x, fout=0.05)


def pad(m, dur, vel=0.3, cutoff=None, attack=None, release=None, t0=0.0, **kw):
    """score.Band.pad's entry point (the composing side calls sounds.pad when it exists). Pass
    `t0` = the note's start in the piece so the slow drifts run continuously across notes."""
    return pad_note(m, dur, vel, t0=t0, attack=attack, release=release, cutoff=cutoff, **kw)


def pad_layer(spans, vel=0.5, **kw):
    """A whole sustained layer from a list of chords: spans = [(t_start, t_end, [midi, ...]), ...]
    in piece seconds. A pitch that continues from one chord into the next is ONE note (held
    through the change, never re-attacked): the common tones of slow, smooth harmony.
    Returns (audio, t_start): place `audio` at `t_start` on the pad bus."""
    spans = sorted(spans, key=lambda s: s[0])
    if not spans:
        return np.zeros((1, 2)), 0.0
    start = spans[0][0]
    notes = []           # [midi, t_on, t_off]
    live = {}
    for t_a, t_b, ms in spans:
        ms = set(int(q) for q in ms)
        for q in list(live):
            if q not in ms or abs(live[q][2] - t_a) > 1e-3:
                notes.append(live.pop(q))
        for q in ms:
            if q in live:
                live[q][2] = t_b
            else:
                live[q] = [q, t_a, t_b]
    notes += list(live.values())
    rel = float(options.get("pad_release") if kw.get("release") is None else kw["release"])
    end = max(nt[2] for nt in notes) + rel * 1.3 + 0.1
    buf = np.zeros((int((end - start) * SR) + 1, 2))
    for q, a, b in notes:
        x = pad_note(q, b - a, vel, t0=a, **kw)
        i = int(round((a - start) * SR))
        j = min(len(buf), i + len(x))
        buf[i:j] += x[: j - i]
    return buf, start


def pad_voicing(prev, pcs, lo=46, hi=70, n=4, keep_top=True):
    """Voice a chord for the pad (plan b3): `n` notes between `lo` (Bb2) and `hi` (Bb4) using the
    chord's pitch classes `pcs` (0 = C; the root first), moving as little as possible from `prev` (the last
    voicing, or None), keeping at least one common tone, holding the top note where possible,
    and never stacking two notes a semitone apart (no held m2 rub in the bed).
    Returns a sorted list of MIDI notes."""
    from itertools import combinations
    pcs = [int(p) % 12 for p in pcs]
    cand = [q for q in range(lo, hi + 1) if q % 12 in pcs]
    best, best_s = None, None
    for combo in combinations(cand, min(n, len(cand))):
        c = sorted(combo)
        if any(b - a < 2 for a, b in zip(c, c[1:])):
            continue                               # a semitone (or unison) between neighbours
        # WHY 4 per missing chord tone: at 2, moving less won over sounding the chord (an
        # A-flat major 9 was voiced without its A-flat); a held bed must say which chord it is
        s = 4.0 * (min(n, len(set(pcs))) - len({q % 12 for q in c}))
        s += 2.0 * (len(c) - len({q % 12 for q in c}))        # a doubled note adds nothing
        s += 2.0 * (pcs[0] not in {q % 12 for q in c})         # pcs[0] is the root
        if prev:
            p = sorted(prev)
            if len(p) == len(c):
                s += sum(abs(a - b) for a, b in zip(p, c))
            else:
                s += sum(min(abs(a - b) for b in p) for a in c)
            if not set(p) & set(c):
                s += 100.0                         # the plan: >= 1 common tone
            if keep_top and c[-1] == p[-1]:
                s -= 2.0
        else:
            s += abs(np.mean(c) - 58) * 0.5 + (c[-1] - c[0]) * 0.1    # close, centred near Bb3
        if best_s is None or s < best_s:
            best, best_s = c, s
    return best or sorted(prev or [])


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


def bowed(sec, m, dur_s, v0, v1, attack=0.25, release=0.3, rr=0, shape=None):
    """A held bowed note whose level moves in one straight line from v0 to v1 (smooth by
    construction; no swell-and-dip). The soft and loud recordings crossfade as it grows, so
    it gets richer, not just louder; the bow's own start stays in (real bow detail), rounded
    by a raised-cosine `attack`."""
    soft = string_note(sec, "sus", m, 0.3, dur=dur_s, rr=rr, release=release, attack=0.01)
    loud = string_note(sec, "sus", m, 0.8, dur=dur_s, rr=rr, release=release, attack=0.01)
    n = min(len(soft), len(loud))
    t = np.arange(n) / SR
    c = np.clip(t / max(dur_s, 0.05), 0, 1)
    if shape:
        # a shaped bow (the logo's swell): straight lines between (fraction, level) points
        xs, ys = zip(*shape)
        lvl = np.interp(c, xs, ys)
        mix = float(np.clip(max(ys), 0, 1))
    else:
        lvl = v0 + (v1 - v0) * c
        mix = np.clip((v0 + v1) / 2, 0, 1)    # richer recording when the line is louder
    soft_g, loud_g = 10 ** ((0.3 - 0.7) * 18 / 20), 10 ** ((0.8 - 0.7) * 18 / 20)
    x = soft[:n] / soft_g * (1 - mix) + loud[:n] / loud_g * mix
    x = x * (lvl * _rcos(t, attack))[:, None]
    return fade(x, fin=0.005, fout=0.05)


# ================================================================ space

_IRS = {}


def ir(name, predelay=None):
    """The two shared spaces (felt-and-pulse/src/arrange.py): a 3.4 s hall and a small room.
    `predelay` (s) for the hall: 22 ms by default; the plan allows 20-30 ms, up to 120 ms at or
    below 80 BPM (see hall_predelay)."""
    key = (name, None if predelay is None else round(float(predelay), 4))
    if key not in _IRS:
        if name == "hall":
            _IRS[key] = make_ir(3.4, rt=(2.2, 2.7, 1.8, 1.0), predelay=0.022 if predelay is None else predelay,
                                seed=3, width=0.75)
        else:
            _IRS[key] = make_ir(0.8, rt=(0.4, 0.5, 0.35, 0.25), predelay=0.004, seed=5, width=0.6)
    return _IRS[key]


def hall_predelay(bpm):
    """Plan b4: 25 ms at ordinary tempi; at or below 80 BPM the gap opens toward 120 ms
    (a slow piece's notes are far apart, so a longer pre-delay keeps each attack clear)."""
    if not bpm or bpm > 80:
        return 0.025
    return float(np.clip(0.025 + (80 - bpm) * 0.0048, 0.025, 0.12))


# ================================================================ measuring the instruments

def perceived_onset(x, frac=0.5, win=0.01):
    """Seconds from a sound's first sample to the moment its 10 ms RMS envelope first reaches
    `frac` of its maximum (plan d3b: soft attacks are heard late). Measurement only."""
    mono = np.asarray(x, float)
    mono = mono.mean(axis=1) if mono.ndim == 2 else mono
    w = max(1, int(win * SR))
    e = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, mode="same"))
    pk = float(e.max())
    return float(np.argmax(e >= frac * pk) / SR) if pk > 0 else 0.0


@lru_cache(maxsize=None)
def onset_delay(voice, m=63, vel=0.45):
    """The perceived-onset delay (s) of one of our voices at a pitch and touch, measured from our
    own sound (cached): "piano", "pizz-<section>", "bowed-<section>", "pad", "synth", "sub".
    Hit notes may be placed this much early (plan d3b; the composing side decides)."""
    if voice == "piano":
        x = felt_piano(m, vel, 1.0)
    elif voice.startswith("pizz-"):
        x, lead = pizz(voice[5:], m, vel)
        return max(0.0, perceived_onset(x) - lead)
    elif voice.startswith("bowed-"):
        x = bowed(voice[6:], m, 2.0, vel, vel)
    elif voice == "pad":
        x = pad_note(m, 3.0, vel)
    elif voice == "synth":
        x = synth(m, vel)
    elif voice == "sub":
        x = sub(m, 1.0, vel)
    else:
        raise KeyError(voice)
    return perceived_onset(x)
