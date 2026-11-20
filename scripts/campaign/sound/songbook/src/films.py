"""Scoring real films from the songbook: the MUSIC is a songbook piece (sections pinned to the
picture's turns of feeling), the SOUND EFFECTS are a separate layer of hits from the brand's kit
(../../sfx-kit/out/), placed on the actions. Music answers feelings; effects answer actions.

A film is described as:
    Film(name, piece, hits, picture, copy_to)
      piece    a songbook Piece (score.Piece): sections with `start=` on the feeling turns,
               `land=` on the moment the youcoded name appears, `length` = the film's length
      hits     Hit(t, sound, length=None, part=None, gain_db=0): one effect per on-screen action
      picture  (time, what appears) for the report only (the music never follows single words)
      narration  (future films) sections carry narration=True / level_db; see mix.level_plan

Effects level: each hit's loudest 100 ms is set SFX_REL dB relative to the music's own
momentary loudness around it (so it reads clearly but sits in the music, wherever it falls),
then trimmed by the hit's gain_db. Both are mixed before the final limiter, so the delivered
file is -14 LUFS with true peak at or below -1 dB as a whole.

Next films (a 60 s product film, a 65-75 s narrated film) are added to FILMS the same way.
"""
import json
import os
import shutil
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import soundfile as sf

import measure as M
from dsp import SR
from score import Piece, Section as S

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.normpath(os.path.join(HERE, "..", "..", "sfx-kit", "out"))
OUT = os.path.join(HERE, "..", "out", "films")
SFX_REL = -8.0     # dB: an effect's loudest 100 ms vs. the music's loudness around it
# WHY -8 (was -2): the owner on the first pen sounds: "annoying and too scratchy". Pen and
# marker sounds must be soft and smooth, felt more than heard.

# The versions of a film's effects layer the owner chooses between by ear:
#   name suffix -> (level vs music in dB, low-pass in Hz for pen sounds, or None = no effects)
VARIANTS = {"": (-8.0, 4500.0), "-softer": (-12.0, 3500.0), "-no-pen": None}
PREVIOUS = {"marker-stroke-short-b": "marker-stroke-short-c", "handwriting-c": "handwriting-a"}


def soften(x, lp_hz, dot=False):
    """Make a pen sound soft and smooth: a gentle low-pass (nothing scratchy above ~4-5 kHz),
    any sudden spike in the 2-8 kHz 'scratch' band held down to the sound's own running level,
    and slower, rounder pen-down and lift-off. Zero-phase filters, so nothing smears in time."""
    from scipy import signal as sg
    sos = sg.butter(4, [2000, 8000], btype="bandpass", fs=SR, output="sos")
    band = sg.sosfiltfilt(sos, x, axis=0)

    def rms(z, ms):
        w = max(1, int(ms / 1000 * SR))
        return np.sqrt(np.convolve((z ** 2).mean(axis=1), np.ones(w) / w, mode="same")) + 1e-9
    g = np.clip(1.4 * rms(band, 30) / rms(band, 2), 0, 1)        # spikes above 1.4x the 30 ms level
    x = x - band + band * g[:, None]
    sos = sg.butter(4, lp_hz * (0.7 if dot else 1.0), btype="lowpass", fs=SR, output="sos")
    x = sg.sosfiltfilt(sos, x, axis=0)
    a, r = int((0.008 if dot else 0.025) * SR), int((0.03 if dot else 0.05) * SR)
    x = x.copy()
    x[:a] *= _rc(a)[:, None]
    x[-r:] *= _rc(r)[::-1, None]
    return x


def above_5k(x):
    """Share of a sound's energy above 5 kHz, in dB (the 'scratch' measure)."""
    m = x.mean(axis=1)
    f = np.fft.rfftfreq(len(m), 1 / SR)
    p = np.abs(np.fft.rfft(m)) ** 2
    return round(float(10 * np.log10(p[f > 5000].sum() / (p.sum() + 1e-30) + 1e-20)), 1)


@dataclass
class Hit:
    t: float                         # seconds: when the action starts on screen
    sound: str                       # kit file without .wav, e.g. "marker-stroke-short-c"
    length: Optional[float] = None   # fit the sound to this many seconds (a stroke's length)
    part: Optional[str] = None       # for handwriting files: "writing" or "dot"
    gain_db: float = 0.0             # hand trim after the level rule
    what: str = ""


@dataclass
class Film:
    name: str
    piece: Piece
    hits: list = field(default_factory=list)
    picture: list = field(default_factory=list)
    copy_to: Optional[str] = None


# ------------------------------------------------------------------ effects

def _read(sound):
    x, sr = sf.read(os.path.join(KIT, sound + ".wav"), dtype="float64", always_2d=True)
    assert sr == SR
    return x


def _rc(n):
    return 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / max(n, 1))


def fit_stroke(x, length, head=0.05, tail=0.08, xf=0.015):
    """Fit a marker stroke to the exact length of the stroke on screen, keeping its real
    pen-down (head) and lift-off (tail) and shortening only the steady middle (equal-power
    crossfade). Never re-pitched."""
    n, L = len(x), int(round(length * SR))
    if L >= n:
        return x
    h, t, c = int(head * SR), int(tail * SR), int(xf * SR)
    mid = L - h - t
    if mid < c:
        h, t = int(L * 0.4), L - int(L * 0.4)
        mid = 0
    a = x[: h + mid + c]
    b = x[n - t - c:]
    w = np.sin(0.5 * np.pi * np.arange(c) / c)[:, None]
    out = np.concatenate([a[:-c], a[-c:] * w[::-1] + b[:c] * w, b[c:]])
    return out[:L]


def handwriting_part(x, part, length=None):
    """The kit's handwriting file is a written word, a pause, then the full stop (the pen
    touching down). Split them so each lands on its own moment on screen."""
    e = np.abs(x).max(axis=1)
    quiet = np.where(e[int(0.9 * SR):] < 10 ** (-70 / 20))[0]
    gap = int(0.9 * SR) + (quiet[0] if len(quiet) else int(0.15 * SR))
    if part == "writing":
        w = x[:gap].copy()
        if length is not None and int(length * SR) < len(w):
            w = w[: int(length * SR)].copy()
            k = int(0.08 * SR)
            w[-k:] *= _rc(k)[::-1, None]       # the pen lifts as the word ends on screen
        return w, 0.0
    d = x[gap:].copy()
    on = int(np.argmax(np.abs(d).max(axis=1) > np.abs(d).max() * 0.1))
    return d, on / SR                           # place this many seconds early


def short_loud(x):
    """Loudest 100 ms, K-weighted (the kit's own level measure)."""
    k = M._kw(x) ** 2
    w = int(0.1 * SR)
    c = np.concatenate([[0], np.cumsum(k)])
    ms = (c[w:] - c[:-w]) / w if len(k) > w else np.array([k.mean()])
    return -0.691 + 10 * np.log10(ms.max() * 2 + 1e-12)


def _prepare(h, sound):
    x = _read(sound)
    early = 0.0
    if h.part:
        x, early = handwriting_part(x, h.part, h.length)
    elif h.length:
        x = fit_stroke(x, h.length)
    return x, early


def sfx_layer(film, music, rel=SFX_REL, lp_hz=4500.0):
    """Place and level every hit against the (pre-limiter) music. Returns (audio, report)."""
    n = len(music)
    out = np.zeros((n, 2))
    tt, mv = M.momentary(music)
    rep = []
    for h in film.hits:
        x, early = _prepare(h, h.sound)
        x = soften(x, lp_hz, dot=(h.part == "dot"))
        prev = _prepare(h, PREVIOUS[h.sound])[0] if h.sound in PREVIOUS else None
        span = len(x) / SR
        sel = (tt >= h.t - 0.2) & (tt <= h.t + span + 0.2)
        music_l = float(np.median(mv[sel]))
        g_db = music_l + rel + h.gain_db - short_loud(x)
        i = int(round((h.t - early) * SR))
        j = min(n, i + len(x))
        out[i:j] += x[: j - i] * 10 ** (g_db / 20)
        rep.append(dict(t=h.t, sound=h.sound + (f" ({h.part})" if h.part else ""), what=h.what,
                        length_s=round(span, 3), music_lufs_around=round(music_l, 1),
                        effect_loudest_100ms=round(music_l + rel + h.gain_db, 1), under_music_db=-rel - h.gain_db,
                        above_5k_db=above_5k(x), previous_above_5k_db=(above_5k(prev) if prev is not None else None)))
    return out, rep


# ------------------------------------------------------------------ the films

OWN_EVERYTHING = Film(
    "own-everything",
    Piece(
        "own-everything", 24.0, land=19.2, ending_start=16.8, rit=0.92, seed=21,
        notes="Typography, picture final. One song: stark and deadpan while the lie is told, "
              "the turn to bright as 'everything.' is written, a lift through the four "
              "statements (one per bar), the biggest on 'own everything.', the logo played as "
              "the last phrase with the name, and the chord left ringing to 23.5 s.",
        sections=[
            # 0-7.2: the tune's first three bars over the dark chords, deadpan; 7.2-9.6: the
            # turn (A-flat, B-flat) while "everything." is written, the bright band growing in
            S("stark", 4, tune=["phrase1:3"], turn=True, bpm=100, span=1,
              label="deadpan, then the turn under 'everything.'"),
            # 9.6, 12.0, 14.4: one statement per bar; the bass climbs E-flat, C, F, A-flat
            S("triumphant", 3, tune="phrase2", start=9.6, bpm=100, dyn=0.9, lift=True,
              chords=[["Eb"], ["Cm7"], ["Fm7"]], label="the statements, building"),
            # 16.8: the ending bar = "own everything." (the tune's high C), slowing into the logo
        ]),
    hits=[
        # the kit's smoothest pens (marker-stroke b, handwriting c), softened (see soften)
        Hit(6.60, "marker-stroke-short-b", length=0.23, what="first stroke through 'nothing.'"),
        Hit(6.87, "marker-stroke-short-b", length=0.19, what="second stroke"),
        Hit(7.28, "handwriting-c", part="writing", length=0.76, what="'everything.' written"),
        Hit(8.16, "handwriting-c", part="dot", what="the full stop"),
    ],
    picture=[(0.0, "you'll own"), (1.8, "nothing."), (3.6, "and you'll"), (4.2, "be happy."),
             (6.60, "strike 1"), (6.87, "strike 2"), (7.28, "everything. (written)"), (8.16, "full stop"),
             (9.6, "own your data."), (12.0, "own your intelligence."), (14.4, "own your software."),
             (16.8, "own everything."), (19.2, "youcoded (name)"), (24.0, "end")],
    copy_to=os.path.normpath(os.path.join(HERE, "..", "..", "..", "film", "public", "audio", "sb-take3-mix.wav")),
)

FILMS = {f.name: f for f in (OWN_EVERYTHING,)}


def render_film(film):
    import build
    os.makedirs(OUT, exist_ok=True)
    # the music alone first (all the music checks apply to it: the "-no-pen" version), then one
    # mix per effects version (VARIANTS); the music is the same render in every one
    _, music_st = build.one(film.piece, path=os.path.join(OUT, f"{film.name}-no-pen.wav"))
    st, versions = None, {}
    for suffix, v in VARIANTS.items():
        if v is None:
            continue
        rel, lp = v
        rep = {}

        def extra(xm, plans, rel=rel, lp=lp, rep=rep):
            a, r = sfx_layer(film, xm, rel, lp)
            rep["hits"] = r
            return a
        _, s = build.one(film.piece, extra_fn=extra, path=os.path.join(OUT, f"{film.name}{suffix}.wav"))
        versions[suffix or "best"] = dict(hits=rep["hits"], lufs=s["lufs_integrated"], true_peak=s["true_peak_dbtp"],
                                          clipped=s["clipped_samples"], low_pass_hz=lp)
        if suffix == "":
            st = s
            st["hits"] = rep["hits"]
    st["music_only"] = {k: music_st[k] for k in ("tune_on_top", "attacks", "steadiness", "joins", "bands_db_rel_total",
                                               "logo", "sections", "lufs_integrated", "true_peak_dbtp")}
    st["versions"] = versions
    st["picture"] = film.picture
    if film.copy_to:
        shutil.copyfile(os.path.join(OUT, f"{film.name}.wav"), film.copy_to)
        st["copied_to"] = film.copy_to
    return film.name, st


def report(name, st):
    mo = st["music_only"]
    L = [f"FILM {name}: {st['seconds']} s  LUFS {st['lufs_integrated']}  true peak {st['true_peak_dbtp']} dBTP  "
         f"clipped {st['clipped_samples']}  first/last sample {st['first_sample_dbfs']}/{st['last_sample_dbfs']} dBFS  "
         f"mono loss {st['mono_fold_loss_lu']} LU"]
    b = st["bands_db_rel_total"]
    L.append(f"   bands: 40-80 {b['40-80']}  80-250 {b['80-250']}  2-8k {b['2000-8000']}  8-16k {b['8000-16000']}")
    li = mo["logo"]
    L.append(f"   logo (played): {li['notes']}, name requested {li['requested_s']} s, heard {li['heard_s']} s ({li['error_ms']:+} ms)")
    tv = mo["tune_on_top"]
    L.append(f"   music alone: tune on top {tv['above_0db']}/{tv['notes']} (weakest {tv['min_db']} dB); attacks not on a note "
             f"{ {k: len(v) for k, v in mo['attacks']['per_instrument_not_on_a_note'].items() if v} or 'none'}; "
             f"noisiness max {mo['attacks']['noisiness_max']}; biggest 1 s change {mo['steadiness']['whole_max_change_1s']} dB "
             f"(at {mo['steadiness']['at']} s)")
    for s in mo["sections"]:
        L.append(f"   section {s['label']:<45} {s['start_s']:>6}-{s['end_s']:<6} s  {s['bpm']} bpm  {s['accomp']}  chords {s['chords']}")
    for j in mo["joins"]:
        L.append(f"   join {j['join']} at {j['t']} s: level {j['level_before']} -> {j['level_after']}; 8-16k "
                 f"{j['bright_before']['8-16k']} -> {j['bright_after']['8-16k']}; biggest 1 s change {j['max_change_1s']} dB; "
                 f"tempo {j['tempo_per_beat']}")
    for name_v, ver in st["versions"].items():
        L.append(f"   effects version '{name_v}': whole file {ver['lufs']} LUFS, true peak {ver['true_peak']} dBTP, "
                 f"clipped {ver['clipped']}, pen low-pass {ver['low_pass_hz']:.0f} Hz")
        for h in ver["hits"]:
            L.append(f"      hit {h['t']:>5} s  {h['sound']:<32} {h['length_s']} s, {h['under_music_db']} dB under the music "
                     f"({h['effect_loudest_100ms']} vs {h['music_lufs_around']} LUFS); energy above 5 kHz "
                     f"{h['above_5k_db']} dB (previous pen: {h['previous_above_5k_db']} dB)")
    L.append("   no-pen version: the music alone (same render)")
    # the tail: how long the last chord stays audible
    y, _ = sf.read(os.path.join(OUT, f"{name}.wav"), dtype="float64", always_2d=True)
    tt, v = M.momentary(y)
    land = st["music_only"]["logo"]["requested_s"]
    after = [(round(float(a), 1), round(float(b), 1)) for a, b in zip(tt, v) if a >= land and abs(a * 2 - round(a * 2)) < 1e-6]
    L.append(f"   after the name (time, momentary LUFS): {after}")
    return L


def main(names=None):
    from multiprocessing import Pool
    todo = [FILMS[n] for n in (names or FILMS)]
    with Pool(len(todo)) as pool:
        res = dict(pool.map(render_film, todo))
    with open(os.path.join(OUT, "report.json"), "w") as f:
        json.dump(res, f, indent=1)
    lines = []
    for k, v in res.items():
        lines += report(k, v)
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
