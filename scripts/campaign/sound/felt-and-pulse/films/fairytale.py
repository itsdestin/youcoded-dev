"""FILM 2, the narrated fairytale (75.0 s, narrator "lily").

Every hit is read from the word-timing file BY WORD (W("wonderful")), then snapped to the
real start of that word in the recording when the two disagree (the file is ~0.15-0.3 s off
on a few words, e.g. "everything." is listed at 70.42 but she starts it at ~70.75). Both
times are reported.

Sections (each with its own tempo, chosen so its end lands on a bar line at the next cue):
  sly opening -> resigned -> near silence ("However, recently...") -> the music opens
  ("something truly wonderful": the motif's three notes on those three words) -> light and wry
  (hubris) -> a wink in the pause before "shareholder value" -> the lift ("But in their
  excitement") -> arrival on "for anyone who asks" -> warm and proud ("And so") -> rousing
  ("It's time to free ourselves") -> the biggest chord on "everything" -> the logo, landing at 72.0.
"""
import json
import os
import re

import numpy as np

from common import (MOTIF_A, MOTIF_B, MOTIF_ECHO, SR, Grid, Score, butter, chain,  # noqa: F401
                    film_master, ins, note, pan, place, undb)
from dsp import biquad, compress, db, env_follow
from master import lufs

CAMPAIGN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VOICE = os.path.join(CAMPAIGN, "film", "public", "audio", "voice-take1-lily.wav")
WORDS = os.path.join(CAMPAIGN, "film", "src", "round2", "take1-words-lily.json")
LENGTH = 75.0
LOGO_LANDS = 72.0                 # the name appears; the logo's third note lands here
LOGO_AT = LOGO_LANDS - 0.5



# ------------------------------------------------------------------ voice + word times

def load_voice():
    import soundfile as sf
    x, sr = sf.read(VOICE, dtype="float64")
    assert sr == SR
    out = np.zeros(int(LENGTH * SR))
    out[: len(x)] = x
    return out


def voice_env_db(v, frame=0.01):
    f = int(frame * SR)
    n = len(v) // f
    r = np.sqrt((v[: n * f].reshape(n, f) ** 2).mean(axis=1))
    return db(r)


_WORDS = None
USED = {}


def _clean(w):
    return re.sub(r"[^a-z']", "", w.lower())


def W(word, nth=1, next=None):
    """Start time of the nth occurrence (negative: from the end) of `word` in the timing file,
    optionally only where the following word is `next`; punctuation and case are ignored. The
    time is snapped to the real start of the word in the recording when a word onset (sound
    rising above -55 dB after >= 80 ms below -60 dB) lies within 0.4 s of the listed time."""
    global _WORDS
    if _WORDS is None:
        _WORDS = json.load(open(WORDS))
    ws = _WORDS
    idx = [i for i, w in enumerate(ws) if _clean(w["w"]) == _clean(word) and
           (next is None or (i + 1 < len(ws) and _clean(ws[i + 1]["w"]) == _clean(next)))]
    j = ws[idx[nth - 1 if nth > 0 else nth]]["start"]
    e = _ENV
    on = np.array([i for i in range(8, len(e)) if e[i] > -55 and e[i - 8:i].max() < -60]) * 0.01
    starts = np.array([w["start"] for w in ws])
    # snap only to an onset that belongs to THIS word: it must be within 0.4 s, and no other
    # listed word may start closer to it
    near = [o for o in on if abs(o - j) <= 0.4 and np.argmin(np.abs(starts - o)) == idx[nth - 1 if nth > 0 else nth]]
    t = float(min(near, key=lambda o: abs(o - j))) if near else float(j)
    USED[f"{word}" + (f" {next}" if next else "") + (f" #{nth}" if nth != 1 else "")] = dict(
        json_s=round(j, 3), used_s=round(t, 3))
    return t


_ENV = None


# ------------------------------------------------------------------ voice polish

def polish(v):
    """Gentle high-pass, de-harsh, de-ess, mild compression. No reverb."""
    x = butter(v, "highpass", 85, 2)
    x = biquad(x, "peak", 3300, 1.4, -2.0)               # de-harsh: the TTS presence edge
    # de-ess: only the >5.5 kHz band is compressed, so "s" softens without dulling the voice
    hi = butter(x, "highpass", 5500, 4)
    lo = x - hi
    x = lo + compress(hi, db(np.sqrt(np.mean(hi ** 2))) + 6, 3.0, attack=0.002, release=0.05)
    x = x * undb(-20 - lufs(x))
    x = compress(x, -23, 2.0, attack=0.008, release=0.12)
    return x * undb(-20 - lufs(x))                        # voice sits at -20 before the final gain


# ------------------------------------------------------------------ the score

def build_score():
    s = Score(LENGTH)

    # ---- 1. sly opening: tiptoeing staccato in C minor, the cell played short and sneaky
    t_and = W("And", next="we")                       # "And we all..."
    g = Grid(60 * 16 / t_and)                 # 4 bars end exactly on "And"
    b = g.beat
    for bar, ch in enumerate(["Cm7", "Abmaj7", "Cm7", "Abmaj7"], start=1):
        lo, hi = (("C3", "G3") if ch == "Cm7" else ("Ab2", "Eb3"))
        for k in range(8):
            s.piano(g(bar, 1 + k / 2), lo if k % 2 == 0 else hi, b * 0.22, 0.26 + 0.04 * (k % 4 == 0),
                    pedal=False, tone=-0.2)
        s.pad(g(bar), ch, 4 * b, 0.16, cutoff=900, attack=1.0, seed=bar)
    for i, (bb, nm, d) in enumerate(MOTIF_A):  # the cell, staccato, a little conspiratorial
        s.piano(g(1, 1 + bb), nm, b * 0.4, 0.36, pedal=False)
    for i, nm in enumerate(["Bb5", "G6", "F6"]):  # the glass echo, in her first breath
        s.pluck(W("They") - 0.36 + i * 0.12, nm, 0.22, decay=0.3, p=(-0.4, 0.4, 0)[i])
    s.pluck(g(4, 4.5), "G6", 0.16, decay=0.25, p=0.5)

    # ---- 2. resigned: the tiptoe stops, long chords, the cell slowed and low
    t_how = W("However")
    ch2 = [(t_and, "Cm7"), (W("We", next="accepted"), "Abmaj7"), (W("that", next="our"), "Eb/G"), (W("convenience"), "Bbsus")]
    for i, (t0, ch) in enumerate(ch2):
        t1 = ch2[i + 1][0] if i + 1 < len(ch2) else t_how - 0.2
        s.lh(t0, ch, t1 - t0, 0.27, "broken")
        s.pad(t0, ch, t1 - t0, 0.20, cutoff=1000, attack=0.8, release=1.2, seed=10 + i)
        s.bass(t0, ch, t1 - t0 - 0.1, 0.32)
    for i, (bb, nm, d) in enumerate(MOTIF_A):
        s.piano(t_and + bb * 1.1, note(nm) - 12, 1.1 * d, 0.34)

    # ---- 3. near silence: one glass note on "recently", air rising into "something"
    t_some = W("something", next="truly")
    s.pluck(W("recently") + 0.05, "Bb6", 0.10, decay=0.6, p=0.3)
    s.swell(t_some, t_some - W("recently") + 0.1, 0.14)

    # ---- 4. "something truly wonderful": the music opens for the first time
    cell_words = [t_some, W("truly"), W("wonderful")]
    for (bb, nm, d), t in zip(MOTIF_A, cell_words):
        s.piano_hit(f"cell: {nm} on '{['something', 'truly', 'wonderful'][MOTIF_A.index((bb, nm, d))]}'",
                    t, nm, 1.0, 0.6)
    t_bl = W("Blinded")
    s.pad(t_some, "Eb", t_bl - t_some + 0.3, 0.32, cutoff=2400, attack=0.5, release=1.0, seed=20)
    s.bass(t_some, "Eb", t_bl - t_some, 0.5)
    s.lh(t_some, "Eb", t_bl - t_some + 0.4, 0.32, "broken")
    t_hap_end = _speech_end_after(W("happened", -1))
    for i, (bb, nm, d) in enumerate(MOTIF_ECHO):
        s.pluck(t_hap_end + 0.02 + i * 0.11, nm, 0.32, decay=0.4, p=(0.35, -0.35, 0)[i])

    # ---- 5. hubris: light and wry, bouncing offbeat chords, until the pause before "shareholder"
    t_but = W("But")
    g5 = Grid(60 * 24 / (t_but - t_bl), start=t_bl)    # 6 bars, bar 7 = "But"
    b5 = g5.beat
    t_pause = _speech_end_after(W("treasure"))         # she stops; the wink goes here
    prog5 = ["Eb", "Cm7", "Abmaj7", "Bbsus", "Eb", "Cm7"]
    for bar, ch in enumerate(prog5, start=1):
        t0 = g5(bar)
        if t0 >= t_pause:
            break
        dur = min(4 * b5, t_pause - t0)
        s.pulse(t0, ch, dur, 0.18, cutoff=2000, every=b5 / 2, seed=30 + bar)
        s.bass(t0, ch, min(dur, 2 * b5) - 0.05, 0.42)
        for k in (1.5, 2.5, 3.5, 4.5):                     # offbeat staccato chords: wry
            tt = g5(bar, k)
            if tt < t_pause - 0.05:
                for j, nm in enumerate(VO(ch)):
                    s.piano(tt + 0.01 * j, nm, b5 * 0.2, 0.24, pedal=False)
        for e in range(8):
            tt = g5(bar, 1 + e / 2)
            if tt < t_pause - 0.05:
                s.shaker(tt, 0.06 + 0.04 * (e % 2), p=-0.3)
    for i, (bb, nm, d) in enumerate(MOTIF_B[:4]):          # the reply, light, in bars 3-4
        s.piano(g5(3, 1 + (bb - 8)), nm, d * b5, 0.42)
    # the wink: everything stops when she does; one raised-eyebrow glass pair in the pause
    wink = t_pause + 0.22
    s.pluck_hit("wink (pause before 'shareholder')", wink, "G6", 0.26, 0.25, p=0.3)
    s.pluck(wink + 0.09, "Bb6", 0.22, decay=0.3, p=0.35)

    # ---- 6. the lift: "But in their excitement" -> gathering speed -> "for anyone who asks"
    t_for = W("for", next="anyone")
    g6 = Grid(60 * 16 / (t_for - t_but), start=t_but)       # 4 bars, bar 5 = "for"
    b6 = g6.beat
    for bar, ch in enumerate(["Abmaj7", "Bbsus", "Cm7", "Bb"], start=1):
        t0 = g6(bar)
        s.pad(t0, ch, 4 * b6, 0.24 + 0.03 * bar, cutoff=1800 + 250 * bar, attack=0.4, seed=40 + bar)
        s.pulse(t0, ch, 4 * b6, 0.20 + 0.03 * bar, cutoff=2400, every=b6 / 2, seed=40 + bar)
        s.bass(t0, ch, 4 * b6 - 0.05, 0.5 + 0.05 * bar)
        if bar >= 2:
            s.kick(t0, 0.55 + 0.05 * bar)
            s.kick(t0 + 2 * b6, 0.5)
        if bar >= 3:
            for e in range(8):
                s.hat(t0 + e * b6 / 2, 0.08 if e % 2 == 0 else 0.13)
        for i, (bb, nm, d) in enumerate(MOTIF_A):           # the cell, each bar, growing
            s.piano(t0 + bb * b6, nm, d * b6, 0.36 + 0.03 * bar)
        for e in range(4):
            s.pluck(t0 + (e * 2 + 1) * b6 / 2, ["Eb6", "F6", "G6", "Bb6"][e], 0.16, decay=0.2,
                    p=(-0.5 if e % 2 else 0.5))
    s.swell(t_for, 2 * b6, 0.2)

    # ---- 7. arrival on "for anyone who asks"; the machine answers after "asks"
    t_and2 = W("And", next="so")
    s.piano_hit("arrival on 'for'", t_for, "G5", 1.6, 0.66)
    s.piano(t_for, "Eb2", 2.0, 0.48)
    s.piano(t_for + 0.02, "Bb2", 2.0, 0.40)
    s.pad(t_for, "Eb", t_and2 - t_for, 0.36, cutoff=2600, attack=0.1, release=1.0, seed=50)
    place(s.bus["bass"], ins.thump(note("Eb2"), 0.7), t_for)
    s.kick(t_for, 0.7)
    t_asks_end = _speech_end_after(W("asks"))
    for i, (bb, nm, d) in enumerate(MOTIF_ECHO):
        s.pluck(t_asks_end + 0.03 + i * 0.13, nm, 0.36, decay=0.45, p=(0.35, -0.35, 0)[i])

    # ---- 8. warm and proud: "And so... we get to decide"
    t_its = W("It's", next="time")
    g8 = Grid(60 * 16 / (t_its - t_and2), start=t_and2)      # 4 bars, bar 5 = "It's time"
    b8 = g8.beat
    for bar, ch in enumerate(["Eb", "Abmaj7", "Cm7", "Bbsus"], start=1):
        t0 = g8(bar)
        s.pad(t0, ch, 4 * b8, 0.30, cutoff=2200, attack=0.5, seed=60 + bar)
        s.pulse(t0, ch, 4 * b8, 0.24, cutoff=2600, every=b8 / 2, seed=60 + bar)
        s.bass(t0, ch, 4 * b8 - 0.05, 0.6)
        s.lh(t0, ch, 4 * b8, 0.3, "block")
        s.kick(t0, 0.6)
    for i, (bb, nm, d) in enumerate(MOTIF_B):              # the reply, proud
        s.piano(g8(1, 1 + (bb - 8)), nm, d * b8, 0.5)
    for k, w in enumerate(["do", "costs", "data"]):        # three quiet accents on the list
        t = W(w, -1)
        s.pluck_hit(f"accent '{w}.'", t, ["Bb5", "C6", "Eb6"][k], 0.3, 0.35, p=(-0.3, 0.3, 0)[k])

    # ---- 9. rousing: "It's time to free ourselves" ... "to open source everything"
    t_every = W("everything", -1)
    g9 = Grid(60 * 12 / (t_every - t_its), start=t_its)      # 3 bars, bar 4 = "everything"
    b9 = g9.beat
    t_long = W("long", next="long")
    for bar, ch in enumerate(["Abmaj7", "Bbsus", "Cm7"], start=1):
        t0 = g9(bar)
        s.pad(t0, ch, 4 * b9, 0.36 + 0.04 * bar, cutoff=2600 + 300 * bar, attack=0.3, seed=70 + bar)
        s.pulse(t0, ch, 4 * b9, 0.30 + 0.04 * bar, cutoff=3000, every=b9 / 2, seed=70 + bar)
        s.bass(t0, ch, 4 * b9 - 0.05, 0.7)
        s.lh(t0, ch, 4 * b9, 0.34, "block")
        for k in range(4):
            tt = t0 + k * b9
            if t_long - 0.1 <= tt < g9(3, 3):            # "at long, long last...": drums hold their breath
                continue
            if k in (0, 2):
                s.kick(tt, 0.75)
            else:
                s.snap(tt, 0.42)
            for e in range(2):
                s.hat(tt + e * b9 / 2, 0.1 if e == 0 else 0.17)
    for i, (bb, nm, d) in enumerate(MOTIF_A):               # bar 1: the cell, in octaves
        s.piano(g9(1, 1 + bb), nm, d * b9, 0.58)
        s.piano(g9(1, 1 + bb), note(nm) + 12, d * b9, 0.42)
    for i, (bb, nm, d) in enumerate(MOTIF_ECHO):            # bar 2: the machine answers
        s.pluck(g9(2, 1 + (bb - 5)), nm, 0.4, decay=0.4, p=(0.35, -0.35, 0)[i])
    s.swell(t_every, t_every - W("to", next="open") + 0.2, 0.3)
    for k in range(8):                                      # "to open source": snaps gather
        tt = g9(3, 3) + k * b9 / 4
        if tt < t_every - 0.02:
            s.snap(tt, 0.2 + 0.04 * k)
    # the biggest chord: on "everything"
    s.piano_hit("final chord on 'everything'", t_every, "G5", 1.4, 0.76, tone=0.2)
    s.piano(t_every, "G6", 1.4, 0.56, tone=0.2)
    s.piano(t_every, "Eb2", 1.6, 0.6)
    s.piano(t_every + 0.015, "Bb2", 1.6, 0.5)
    s.piano(t_every + 0.03, "Eb4", 1.4, 0.44)
    s.pad(t_every, "Eb", 1.2, 0.5, cutoff=3800, attack=0.05, release=0.6, seed=80)
    s.pulse(t_every, "Eb", 0.8, 0.36, cutoff=3400, every=b9 / 2, seed=80)
    place(s.bus["bass"], ins.thump(note("Eb2"), 0.9), t_every)
    s.kick(t_every, 0.9)
    s.hat(t_every, 0.3, open_=True)
    for i, nm in enumerate(["Eb6", "Bb5", "G6", "Eb6"]):
        s.pluck(t_every + 0.12 + i * b9 / 2, nm, 0.26, decay=0.3, p=(-0.5 if i % 2 else 0.5))
    mix = s.render(dict(delay_s=0.375, hall=dict(piano=0.2)), end_fade=0.0)
    # the bed clears for the logo: gone by its landing
    t = np.arange(len(mix)) / SR
    gfade = np.clip((LOGO_LANDS - 0.05 - t) / (LOGO_LANDS - 0.05 - (LOGO_AT - 0.1)), 0, 1)
    mix *= (np.sin(0.5 * np.pi * gfade) ** 2)[:, None]
    # the wink's silence: the bed stops when she pauses before "shareholder", returns on "But"
    hole = np.ones(len(mix))
    a, z = t_pause - 0.05, t_pause + 0.1
    hole = np.where(t < a, 1, np.where(t < z, np.cos(0.5 * np.pi * (t - a) / (z - a)) ** 2, 0))
    hole = np.where(t >= t_but - 0.03, 1, hole)
    # the wink itself sits on the pluck bus: let it through the hole
    wink_stem = np.zeros_like(mix)
    i0, i1 = int((wink - 0.02) * SR), int((wink + 1.2) * SR)
    wink_stem[i0:i1] = s.stems["pluck"][i0:i1]
    mix = mix * hole[:, None] + wink_stem * (1 - hole[:, None])
    return s, mix, dict(t_every=t_every, t_last=_speech_end_after(t_every), rest=(t_pause, t_but))


def VO(ch):
    from arrange import VOICES
    return VOICES[ch]["lh"]


def _speech_end_after(t):
    """The first moment after t where she pauses (>= 0.25 s below -50 dB)."""
    e = _ENV
    i = int(t / 0.01)
    while i < len(e) - 25:
        if np.all(e[i:i + 25] < -50):
            return i * 0.01
        i += 1
    return t


# ------------------------------------------------------------------ the mix

def phrases(env, min_gap=0.25):
    """Speech segments from the recording (silences shorter than min_gap are inside a phrase)."""
    act = env > -45
    segs = []
    i = 0
    n = len(act)
    while i < n:
        if act[i]:
            j = i
            while j < n:
                if not act[j]:
                    k = j
                    while k < n and not act[k]:
                        k += 1
                    if (k - j) * 0.01 >= min_gap or k == n:
                        break
                    j = k
                else:
                    j += 1
            segs.append((i * 0.01, j * 0.01))
            i = j
        else:
            i += 1
    return [(a, b) for a, b in segs if b - a >= 0.4]


def target_gap(t):
    """How far (dB) the music sits under her, by section: the gap shrinks as the story rises."""
    for end, gap in ((W("And", next="we"), 18), (W("However"), 17), (W("something", next="truly") - 0.05, 19),
                     (W("Blinded") - 0.05, 14), (W("But") - 0.05, 16), (W("for", next="anyone") - 0.05, 14),
                     (W("And", next="so") - 0.05, 13), (W("It's", next="time") - 0.05, 13),
                     (W("to", next="open") - 0.05, 11), (W("everything", -1) - 0.05, 7)):
        if t < end:
            return gap
    return 5

def render():
    global _ENV
    v_raw = load_voice()
    _ENV = voice_env_db(v_raw)
    s, bed, info = build_score()
    voice = polish(v_raw)
    # a gentle 2.5 dB ride on her level across the film (never inside a word): the story
    # starts hushed and ends triumphant, so the mix itself has a shape, not just the music
    tt = np.arange(len(voice)) / SR
    voice = voice * undb(np.interp(tt, [0, W("However"), W("But"), W("It's", next="time"), W("to", next="open")],
                                   [-1.5, -1.0, 0.0, 0.5, 1.5]))
    music = chain(bed)                                   # -20 LUFS, the same chain as the other films
    n = len(music)
    t = np.arange(n) / SR
    # ---- ducking: follows her voice, 30 ms ahead, quick to let go so it breathes between phrases
    ve = env_follow(voice, 0.004, 0.16, frame=48)        # 1 ms frames
    ve_db = db(ve)
    speak = np.clip((ve_db - (-48)) / 14, 0, 1)
    speak = np.interp(np.arange(n), np.arange(len(speak)) * 48 + 24, speak)
    lead = int(0.03 * SR)
    speak = np.concatenate([speak[lead:], np.zeros(lead)])
    t_climax = W("to", next="open") - 0.05
    depth = np.where(t < W("It's", next="time"), 8.0, np.where(t < t_climax, 6.0, 4.0))
    duck = undb(-depth * speak)
    # carve 1-4 kHz out of the music while she talks (an extra 5 dB, 3 at the climax)
    band = butter(music, "bandpass", [1000, 4000], 2)
    carve = undb(-np.where(t < t_climax, 5.0, 3.0) * speak)
    music_d = (music - band) + band * carve[:, None]
    music_d *= duck[:, None]
    # ---- level automation: per phrase, set the music so it sits target_gap dB under her
    segs = phrases(_ENV)
    # one music level per phrase (solved so the music sits target_gap dB under her), held
    # through the phrase and ramped across the pause to the next one
    lv = [0.0] * len(segs)
    rows = []

    def curve(levels):
        pts_t, pts_g = [], []
        for (a, b), g_ in zip(segs, levels):
            pts_t += [a, b]
            pts_g += [g_, g_]
        gdb = np.interp(t, pts_t, pts_g)
        # after her last word the music is free: the final chord rises to full level
        tail = np.clip((t - info["t_last"]) / 0.12, 0, 1)
        return gdb * (1 - tail) + (max(levels[-1], 0.0) + 5.0) * tail

    for _ in range(6):
        gain = undb(curve(lv))
        cur = music_d * gain[:, None]
        for k, (a, b) in enumerate(segs):
            i0, i1 = int(a * SR), int(b * SR)
            ml = lufs(cur[i0:i1])
            if info["rest"][0] <= (a + b) / 2 < info["rest"][1]:
                continue        # "shareholder value.": the music rests here on purpose
            if not np.isfinite(ml) or ml < -70:
                continue
            need = (lufs(voice[i0:i1]) - target_gap((a + b) / 2)) - ml
            lv[k] = float(np.clip(lv[k] + need, -16, 12))
    gain = undb(curve(lv))
    music_final = music_d * gain[:, None]
    for a, b in segs:
        i0, i1 = int(a * SR), int(b * SR)
        vl, ml = lufs(voice[i0:i1]), lufs(music_final[i0:i1])
        txt = " ".join(w["w"] for w in json.load(open(WORDS)) if a - 0.4 <= w["start"] < b - 0.05)
        rows.append(dict(**{"from": round(a, 2), "to": round(b, 2)}, text=txt,
                         voice_lufs=round(vl, 1), music_lufs=round(ml, 1) if np.isfinite(ml) else None,
                         gap_db=round(vl - ml, 1) if np.isfinite(ml) else None,
                         target_db=target_gap((a + b) / 2)))
    pre = music_final + voice[:, None]
    mix = film_master(pre, LOGO_AT)
    # the score alone: exactly as it sits in the mix (ducked), at the mix's gain, with the logo
    from common import load_logo, LOGO_IN_MIX_DB
    final_gain = _solve_gain(mix, pre, LOGO_AT)
    logo = load_logo() * undb(LOGO_IN_MIX_DB)
    score = music_final * final_gain
    i = int(LOGO_AT * SR)
    score[i:i + len(logo)] += logo[: n - i]
    return dict(mix=mix, score=score, s=s, logo_target=LOGO_LANDS, words=USED, phrases=rows)


def _solve_gain(mix, pre, logo_at):
    """The single gain the final stage applied to the pre-mix (measured where the limiter is
    idle), so the score stem can be exported at the level it has in the mix."""
    i1 = int((logo_at - 0.5) * SR)
    a, b = mix[:i1].ravel(), pre[:i1].ravel()
    quiet = np.abs(a) < 0.3
    return float(np.dot(a[quiet], b[quiet]) / np.dot(b[quiet], b[quiet]))
