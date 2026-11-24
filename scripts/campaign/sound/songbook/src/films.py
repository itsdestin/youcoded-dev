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

New films go in their OWN file, src/film_<key>.py, exposing FILM (or FILMS = [...]); they are
found automatically (see _discover) and rendered with `render.sh <key>` or `render.sh <film name>`.
The films below pin style="v1": they are what the owner has already heard, byte for byte.
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
# what a film's report keeps from the music-alone render (the music checks are about the music)
MO_KEYS = ("tune_on_top", "attacks", "steadiness", "joins", "bands_db_rel_total", "logo", "sections",
           "lufs_integrated", "true_peak_dbtp", "composition", "tune_identity", "loudness_target")
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
    # WHY (owner's rule, 2026-11-20): sound effects are MADE FOR EACH FILM, never taken from a
    # shared kit. `effects(music, plans, piece)` is a module-level function in the film's own
    # file; it gets the music before the final limiter and returns (audio, report rows). The film
    # is then written twice: <name>.wav (music + effects) and <name>-no-pen.wav (music alone).
    effects: Optional[object] = None


def place_effect(out, x, t, music, rel_db, early=0.0):
    """Helper for a film's own effects: add sound x at time t, its loudest 100 ms set rel_db
    relative to the music's own momentary loudness around it. Returns the report row."""
    tt, mv = M.momentary(music)
    span = len(x) / SR
    sel = (tt >= t - 0.2) & (tt <= t + span + 0.2)
    music_l = float(np.median(mv[sel]))
    g_db = music_l + rel_db - short_loud(x)
    i = int(round((t - early) * SR))
    j = min(len(out), i + len(x))
    out[i:j] += x[: j - i] * 10 ** (g_db / 20)
    return dict(t=t, length_s=round(span, 3), music_lufs_around=round(music_l, 1),
                effect_loudest_100ms=round(music_l + rel_db, 1), under_music_db=-rel_db, above_5k_db=above_5k(x))


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
        "own-everything", 24.0, style="v1", land=19.2, ending_start=16.8, rit=0.92, seed=21,
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

# ---- quieter takes of the same film ----
# WHY (Destin, 2026-11-20): "for this specific ad, the music should be a little more subtle".
# Same song, same timings, same opening; only the statements are played smaller and the whole
# file sits lower. Two strengths so he can pick by ear. Neither is copied into the film until
# he picks (copy_to=None); the page muxes them for comparison.
def _subtle(name, loudness, statements):
    return Film(
        name,
        Piece(name, 24.0, style="v1", land=19.2, ending_start=16.8, rit=0.92, seed=21, loudness=loudness,
              notes="Own everything, played smaller: " + statements.label,
              sections=[
                  S("stark", 4, tune=["phrase1:3"], turn=True, bpm=100, span=1,
                    label="deadpan, then the turn under 'everything.'"),
                  statements,
              ]),
        hits=OWN_EVERYTHING.hits, picture=OWN_EVERYTHING.picture, copy_to=None)


OWN_GENTLER = _subtle("own-everything-gentler", -17.0,
                      # the warm rolling piano with far-off strings; still grows, but only a little
                      S("hopeful", 3, tune="phrase2", start=9.6, bpm=100, dyn=0.8, lift=True,
                        chords=[["Eb"], ["Cm7"], ["Fm7"]], label="the statements, a small build"))
OWN_BAREST = _subtle("own-everything-barest", -19.0,
                     # the piano nearly alone: no bass layer, no high strings, no build
                     S("hopeful", 3, tune="phrase2", start=9.6, bpm=100, dyn=0.72, drop=("sub", "air"),
                       chords=[["Eb"], ["Cm7"], ["Fm7"]], label="the statements, piano nearly alone"))

# ---- the faster cut (Destin, 2026-11-20: "speed own everything up a bit, try 15-20 s") ----
# WHY the same bars at 130 beats a minute instead of 100: every bar, every hit and the logo scale
# together by K = 100/130, so picture and music stay locked. Must match K in film/src/round2/take3.tsx.
# The strike and the handwriting come EARLY seconds sooner than a plain scale (see take3.tsx) so the
# corrected poster is held long enough to read; the pen sounds follow the picture exactly.
_K = 100 / 130
_EARLY = 0.37
_FAST_BPM = 130
_FAST_LEN = round(19.2 * _K + 3.4, 3)       # 3.4 s of finished poster after the logo lands
_k = lambda x: round(x * _K, 3)
_SWEEP = 0.76 * 0.8
_w = _k(7.28) - _EARLY
_FAST_HITS = [
    Hit(round(_k(6.60) - _EARLY, 3), "marker-stroke-short-b", length=round(0.23 * _K, 3), what="first stroke through 'nothing.'"),
    Hit(round(_k(6.87) - _EARLY, 3), "marker-stroke-short-b", length=round(0.19 * _K, 3), what="second stroke"),
    Hit(round(_w, 3), "handwriting-c", part="writing", length=round(_SWEEP, 3), what="'everything.' written"),
    Hit(round(_w + _SWEEP + 0.1, 3), "handwriting-c", part="dot", what="the full stop"),
]
_FAST_PICTURE = [(0.0, "you'll own"), (_k(1.8), "nothing."), (_k(3.6), "and you'll"), (_k(4.2), "be happy."),
                 (_FAST_HITS[0].t, "strike 1"), (_FAST_HITS[1].t, "strike 2"), (_FAST_HITS[2].t, "everything. (written)"),
                 (_FAST_HITS[3].t, "full stop"),
                 (_k(9.6), "own your data."), (_k(12.0), "own your intelligence."), (_k(14.4), "own your software."),
                 (_k(16.8), "own everything."), (_k(19.2), "youcoded (name)"), (_FAST_LEN, "end")]


def _fast(name, loudness, statements_dyn, **kw):
    # the opening is the same in all three; only the statements differ
    chords = [["Eb"], ["Cm7"], ["Fm7"]]
    if statements_dyn is None:   # the full-strength version
        stm = S("triumphant", 3, tune="phrase2", start=_k(9.6), bpm=_FAST_BPM, dyn=0.9, lift=True, chords=chords,
                label="the statements, building")
    else:
        stm = S("hopeful", 3, tune="phrase2", start=_k(9.6), bpm=_FAST_BPM, dyn=statements_dyn, chords=chords,
                label="the statements", **kw)
    extra = {} if loudness is None else dict(loudness=loudness)
    return Film(
        name,
        Piece(name, _FAST_LEN, style="v1", land=_k(19.2), ending_start=_k(16.8), rit=0.92, seed=21,
              notes="Own everything, faster cut (about 18 s).",
              sections=[S("stark", 4, tune=["phrase1:3"], turn=True, bpm=_FAST_BPM, span=1,
                          label="deadpan, then the turn under 'everything.'"), stm], **extra),
        hits=_FAST_HITS, picture=_FAST_PICTURE, copy_to=None)


OWN_FAST = _fast("own-everything-fast", None, None)
OWN_FAST_GENTLER = _fast("own-everything-fast-gentler", -17.0, 0.8, lift=True)
OWN_FAST_BAREST = _fast("own-everything-fast-barest", -19.0, 0.72, drop=("sub", "air"))

# ---- "Make it mine" (60 s product film, no narrator; picture final) ----
# WHY one song at 120 bpm (a bar is exactly 2.0 s): every spotted second in the film then falls on
# a bar line (14, 30, 46, 54, name 56), and the look changes at 5.0 and 10.5 fall on beats, so
# the picture and the music stay locked without any speed-up. Music answers feelings, so it turns
# only where the story does: 14.0 the home (a new job for the app, the second piano starts
# answering), 30.0 the money (plucked and held strings join), 46.0 the payoff (violin and piano
# sing the tune, the lift), then the logo played as the last phrase. The two look changes and the
# pull-back stay inside one section on purpose (no new idea every few seconds).
# WHY no sound effects: the owner wants typing "quieter" and the pens were "too scratchy"; a
# 60 s film that is mostly typing is best left to the song alone.
MAKE_IT_MINE = Film(
    "make-it-mine",
    Piece(
        "make-it-mine", 60.0, style="v1", land=56.0, ending_start=54.0, rit=0.92, seed=33,
        notes="Make it mine, one playful song at 120 bpm: gentle first conversation, the second "
              "piano joins for the home, strings for the money, violin and piano for the payoff, "
              "the logo played as the last phrase with the name at 56.0 s.",
        sections=[
            # 0-14: the look (7 bars): the tune, bouncing lightly, nothing answering yet
            S("playful", 7, tune=["phrase1", "phrase2:3"], bpm=120, dyn=0.88, drop=("answer",),
              label="the look: light bounce"),
            # 14-30: the home (8 bars): the whole tune, the second piano answering
            S("playful", 8, tune="full", start=14.0, bpm=120, label="the home: the answers join"),
            # 30-46: the money (8 bars): plucked strings and a held string bed join
            S("playful", 8, tune="full", start=30.0, bpm=120, add=("pizz", "held"),
              label="the money: strings join"),
            # 46-54: the payoff (4 bars): violin and piano sing the high phrase, everyone grows
            # WHY the piano carries the tune here (not violin+piano): the violin's first bow stroke on
            # the downbeat read as a noise-like attack (0.105, limit 0.1); the lift still brings the
            # strings in gradually across the section
            S("triumphant", 4, tune="phrase2", start=46.0, bpm=120, lift=True, voice="piano",
              label="the payoff and the closing lines"),
        ]),
    hits=[],
    picture=[(0.0, "the look"), (5.0, "Golden Sunbreak"), (10.5, "Devil's Garden"), (14.0, "the home"),
             (30.0, "the money"), (43.0, "the email"), (46.0, "payoff shot"), (50.0, "stop waiting for updates."),
             (52.7, "make anything you can imagine, just by asking."), (56.0, "youcoded (name)"), (60.0, "end")],
    copy_to=os.path.normpath(os.path.join(HERE, "..", "..", "..", "film", "public", "audio", "sb-take2-mix.wav")),
)

FILMS = {f.name: f for f in (OWN_EVERYTHING, OWN_GENTLER, OWN_BAREST, OWN_FAST, OWN_FAST_GENTLER, OWN_FAST_BAREST, MAKE_IT_MINE)}
ALIASES = {}     # file key ("mim" for src/film_mim.py) -> the film names it defines


def _discover():
    """Films defined in their own files: src/film_<key>.py, each exposing FILM (one Film) or
    FILMS (a list). WHY separate files: several composers can each score a film at the same time
    without editing the same file. A file that fails to import is reported and skipped, so one
    composer's half-finished edit never stops another's render."""
    import glob
    import importlib
    import sys
    import traceback
    for path in sorted(glob.glob(os.path.join(HERE, "film_*.py"))):
        key = os.path.basename(path)[len("film_"):-3]
        try:
            mod = importlib.import_module(f"film_{key}")
            fl = list(getattr(mod, "FILMS", None) or [getattr(mod, "FILM")])
        except Exception:
            print(f"WARNING: src/film_{key}.py could not be loaded, skipped:\n{traceback.format_exc()}", file=sys.stderr)
            continue
        for f in fl:
            if f.name in FILMS and f.name not in ALIASES.get(key, []):
                print(f"WARNING: src/film_{key}.py redefines film '{f.name}'; the new one wins", file=sys.stderr)
            FILMS[f.name] = f
            ALIASES.setdefault(key, []).append(f.name)


class Speech(list):
    """Piece.speech built from a word file: a list of (t0, t1) spans that also remembers where it
    came from, so the checks can see her words that fall inside the piece but outside the map
    (`speech-covers`) and list her real breaths with their bar and beat (the note dump)."""
    source = None        # (path, t_from, t_to, start_at)
    words = ()           # [(word, t0, t1)] in piece seconds


def speech_from_words(path, t_from, t_to=None, start_at=0.0, gap=0.2):
    """Where a narrator speaks, from a word-timing file ([{"w", "start", "end"}, ...]): the words
    between t_from and t_to (seconds in that file; None = to the end of the file), joined into
    spans wherever the pause between words is shorter than `gap`, moved so t_from lands at
    `start_at` (seconds in the piece). Use it for Piece.speech, so the checks can hold the music
    to the room the voice needs.
    WHY gap 0.2 (was 0.3, 2026-11-23, tale): a real 0.28 s breath after "accepted it." was joined
    into speech, so a note placed in it counted as "while she speaks". A breath of 0.2 s or more is
    now a breath; the attack-rate check (voice-busy) still judges her words as one stretch."""
    allw = json.load(open(path))
    t_to = max(w["end"] for w in allw) if t_to is None else t_to
    words = [w for w in allw if w["end"] > t_from and w["start"] < t_to]
    spans = []
    for w in words:
        a, b = w["start"] - t_from + start_at, w["end"] - t_from + start_at
        if spans and a - spans[-1][1] < gap:
            spans[-1][1] = b
        else:
            spans.append([a, b])
    out = Speech((round(a, 3), round(b, 3)) for a, b in spans)
    out.source = (path, t_from, t_to, start_at)
    out.words = [(w["w"], round(w["start"] - t_from + start_at, 3), round(w["end"] - t_from + start_at, 3)) for w in words]
    return out


def resolve(names):
    """Film names for what was typed: a film's name, or a film file's key (all its films)."""
    out = []
    for n in names:
        out += ALIASES.get(n, [n] if n in FILMS else [])
    return out


_discover()
# WHY (2026-11-23): the composition checks can then list every picture moment the music only
# nearly hits (form.py, picture-sync); a Piece knows nothing about its film otherwise
for _f in FILMS.values():
    _f.piece._picture = list(_f.picture)


def render_film(film):
    import build
    os.makedirs(OUT, exist_ok=True)
    # the music alone first (all the music checks apply to it: the "-no-pen" version), then one
    # mix per effects version (VARIANTS); the music is the same render in every one
    if not film.hits and film.effects is None:
        # WHY one render: a film with no effects is its music; rendering it three times (two
        # effects versions and a no-pen copy) only tripled the time and the files
        _, st = build.one(film.piece, path=os.path.join(OUT, f"{film.name}.wav"))
        st["music_only"] = {k: st[k] for k in MO_KEYS}
        st["versions"], st["picture"] = {}, film.picture
        if film.copy_to:
            shutil.copyfile(os.path.join(OUT, f"{film.name}.wav"), film.copy_to)
            st["copied_to"] = film.copy_to
        return film.name, st
    _, music_st = build.one(film.piece, path=os.path.join(OUT, f"{film.name}-no-pen.wav"))
    if film.effects is not None:
        rep = {}

        def extra(xm, plans, rep=rep):
            a, r = film.effects(xm, plans, film.piece)
            rep["hits"] = r
            return a
        _, st = build.one(film.piece, extra_fn=extra, path=os.path.join(OUT, f"{film.name}.wav"))
        st["hits"] = rep["hits"]
        st["versions"] = {"best": dict(hits=rep["hits"], lufs=st["lufs_integrated"], true_peak=st["true_peak_dbtp"],
                                       clipped=st["clipped_samples"], low_pass_hz=0.0)}
        st["music_only"] = {k: music_st[k] for k in MO_KEYS}
        st["picture"] = film.picture
        if film.copy_to:
            shutil.copyfile(os.path.join(OUT, f"{film.name}.wav"), film.copy_to)
            st["copied_to"] = film.copy_to
        return film.name, st
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
    st["music_only"] = {k: music_st[k] for k in MO_KEYS}
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
    L.append(f"   logo (played): {li['notes']}, name requested {li['requested_s']} s, heard {li['heard_s']} s ({li['error_ms']:+} ms)"
             if li.get("kind") != "none" else f"   no logo (hand-on ending at {li['requested_s']} s)")
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
                 f"clipped {ver['clipped']}" + (f", pen low-pass {ver['low_pass_hz']:.0f} Hz" if ver['low_pass_hz'] else ""))
        for h in ver["hits"]:
            L.append(f"      hit {h['t']:>5} s  {h.get('sound', h.get('what', '')):<32} {h['length_s']} s, {h['under_music_db']} dB under the music "
                     f"({h['effect_loudest_100ms']} vs {h['music_lufs_around']} LUFS); energy above 5 kHz "
                     f"{h['above_5k_db']} dB" + (f" (previous pen: {h['previous_above_5k_db']} dB)" if h.get('previous_above_5k_db') is not None else ""))
    L.append("   no-pen version: the music alone (same render)" if st["versions"] else "   no effects: the file is the music alone")
    # WHY (2026-11-23, mim): the mix checks used to print only for the demos, so a film could fail
    # one (an attack that is not a note, a drum-like attack) silently
    import build
    tests = build.mix_tests(st, mo, loudness=mo.get("loudness_target", -14.0))
    bad = [n for n, ok in tests if not ok]
    L.append(f"   {'PASS' if not bad else 'FAIL'}  mix of {name}: " + ("every mix check kept" if not bad else "failed: " + "; ".join(bad)))
    import form
    L += ["   " + x for x in form.verdict_text(name, mo["composition"])]
    # the tail: how long the last chord stays audible
    y, _ = sf.read(os.path.join(OUT, f"{name}.wav"), dtype="float64", always_2d=True)
    tt, v = M.momentary(y)
    land = st["music_only"]["logo"]["requested_s"]
    after = [(round(float(a), 1), round(float(b), 1)) for a, b in zip(tt, v) if a >= land and abs(a * 2 - round(a * 2)) < 1e-6]
    L.append(f"   after the name (time, momentary LUFS): {after}")
    return L


def main(names=None):
    from multiprocessing import Pool
    import glob
    os.makedirs(OUT, exist_ok=True)
    todo = [FILMS[n] for n in (names or FILMS)]
    with Pool(min(len(todo), os.cpu_count() or 4)) as pool:
        res = dict(pool.map(render_film, todo))
    lines = []
    # WHY one report file per film (2026-11-23): several composers render different films at the
    # same time; a single shared report would be overwritten by whoever finished last. The
    # combined checks.txt / report.json are rebuilt from the per-film files every time.
    for k, v in res.items():
        L = report(k, v)
        lines += L
        with open(os.path.join(OUT, f"{k}.checks.txt"), "w") as f:
            f.write("\n".join(L) + "\n")
        with open(os.path.join(OUT, f"{k}.json"), "w") as f:
            json.dump(v, f, indent=1)
    allc, allj = [], {}
    for path in sorted(glob.glob(os.path.join(OUT, "*.checks.txt"))):
        allc.append(open(path).read().rstrip("\n"))
        jp = path[: -len(".checks.txt")] + ".json"
        if os.path.exists(jp):
            allj[os.path.basename(jp)[:-5]] = json.load(open(jp))
    with open(os.path.join(OUT, "checks.txt"), "w") as f:
        f.write("\n".join(allc) + "\n")
    with open(os.path.join(OUT, "report.json"), "w") as f:
        json.dump(allj, f, indent=1)
    print("\n".join(lines))
