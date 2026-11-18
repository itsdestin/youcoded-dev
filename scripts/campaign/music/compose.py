#!/usr/bin/env python3
"""Compose and render the four "you coded that." campaign cues.

    python3 compose.py [out_dir]          # default ~/Videos/youcoded-campaign/music

Key: D major. 120 BPM, one bar = 2.0 s. Every event is placed on the sample grid from t = 0, so
the film's cuts land exactly on the beats. See README.md for the structure and licensing notes.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np

import kit
from kit import SR, add, mtof, sidechain

BPM = 120
BAR = 2.0
BEAT = 0.5
EIGHTH = 0.25

# ------------------------------------------------------------------ harmony
# ep voicings sit above 200 Hz and are spread thin so the 200-400 Hz region never gets muddy.
CH = {
    "D":     dict(ep=[57, 61, 64, 66, 74], bass=(38, 45)),   # Dmaj9
    "Bm":    dict(ep=[59, 64, 66, 69, 74], bass=(35, 42)),   # Bm11
    "Bm9":   dict(ep=[59, 62, 66, 69, 73], bass=(35, 42)),
    "G":     dict(ep=[55, 62, 66, 69, 71], bass=(31, 38)),   # Gmaj7(add9)
    "A":     dict(ep=[57, 62, 64, 67, 71], bass=(33, 40)),   # A7sus4(add9), pulls home to D
    "Dadd9": dict(ep=[57, 62, 66, 69, 76], bass=(38, 45)),
}
LOGO_CHORD = [50, 57, 64, 66, 73, 78]  # D3 A3 E4 F#4 C#5 F#5: open Dmaj9, root with weight

# Hooks: chord name -> [(eighth position in bar, midi, length in eighths)]
HOOK_A = {  # "the question": climbs then leans back, leaves A open so D feels like an answer
    "D":  [(0, 81, 2), (3, 78, 1), (5, 74, 3)],
    "Bm": [(0, 83, 2), (3, 81, 1), (5, 78, 3)],
    "G":  [(0, 79, 2), (3, 83, 1), (5, 81, 3)],
    "A":  [(0, 81, 2), (3, 76, 1), (6, 78, 2)],
}
HOOK_B = {  # alt: bouncier, starts lower and answers itself
    "Bm": [(0, 78, 1), (2, 81, 1), (4, 83, 2), (7, 81, 1)],
    "G":  [(0, 79, 2), (3, 83, 1), (6, 81, 2)],
    "D":  [(0, 81, 1), (2, 78, 1), (4, 74, 2), (6, 78, 2)],
    "A":  [(0, 76, 2), (2, 81, 1), (4, 79, 2), (7, 78, 1)],
}
RESTATE_A = [(0, 81, 2), (3, 78, 1), (5, 74, 3), (9, 78, 1), (11, 81, 2), (14, 74, 6)]
RESTATE_B = [(0, 78, 1), (2, 81, 1), (4, 83, 2), (7, 81, 1), (10, 78, 2), (14, 74, 6)]

PAT_A = dict(ep=[(0, 1.0), (3, 0.7), (6, 0.8)],
             bass=[(0, 1.5, 0), (3, 1.5, 0), (6, 1.0, 0), (7, 0.8, 1)])
PAT_B = dict(ep=[(0, 1.0), (3, 0.65), (5, 0.55), (6, 0.8)],
             bass=[(0, 2.0, 0), (3, 1.0, 0), (5, 1.0, 1), (6, 1.5, 0)])

STAB_CHORDS = ["D", "Bm", "G", "A"]

# ------------------------------------------------------------------ the four cues
def rep(mode, n):
    return [mode] * n


SONGS = {
    "hero_60": dict(
        dur=60.0, hook=HOOK_A, restate=RESTATE_A, restate_dt=2.0, pat=PAT_A,
        chords=["D", "Bm", "G", "A", "G", "A"] + ["D", "Bm", "G", "A"] * 3 + ["D"]
               + ["Bm", "G", "Dadd9", "A"] + ["Dlogo"] * 7,
        modes=rep("intro", 3) + ["swell"] + rep("build", 2) + ["breath"] + rep("groove", 9)
              + ["stabs"] + rep("groove", 2) + rep("break", 3) + ["break2"] + ["logo"] + rep("tail", 6),
        accents=[12.0], logo=46.0,
        named={"intro_start": 0.0, "swell_start": 6.0, "bass_and_percussion_in": 8.0,
               "accent_hit": 12.0, "groove_start": 14.0,
               "cuts": [14.0, 18.0, 22.0, 26.0, 30.0],
               "chord_stabs": [32.0, 32.5, 33.0, 33.5], "breakdown_start": 38.0,
               "line_1": 38.5, "line_2": 42.0, "logo_hit": 46.0, "silence_by": 59.8},
    ),
    "hero_30": dict(
        dur=30.0, hook=HOOK_A, restate=RESTATE_A, restate_dt=2.0, pat=PAT_A,
        chords=["D", "G", "A"] + ["D", "Bm", "G", "A", "D", "Bm"] + ["G", "A"] + ["Dlogo"] * 4,
        modes=rep("intro", 2) + ["swell"] + rep("groove", 4) + ["stabs"] + ["groove"]
              + ["break", "break2"] + ["logo"] + rep("tail", 3),
        accents=[6.0], logo=22.0,
        named={"intro_start": 0.0, "groove_hit": 6.0, "cuts_every_bar_from": 6.0,
               "chord_stabs": [14.0, 14.5, 15.0, 15.5], "breakdown_start": 18.0,
               "logo_hit": 22.0, "silence_by": 29.8},
    ),
    "short_16": dict(
        dur=16.0, hook=HOOK_A, restate=RESTATE_A, restate_dt=1.0, pat=PAT_A,
        chords=["Bm", "A"] + ["D", "Bm", "G", "A"] + ["Dlogo"] * 2,
        modes=["intro", "swell"] + rep("groove", 4) + ["logo", "tail"],
        accents=[4.0], logo=12.0,
        named={"intro_start": 0.0, "groove_hit": 4.0, "logo_hit": 12.0, "silence_by": 15.8},
    ),
    "short_16_alt": dict(
        dur=16.0, hook=HOOK_B, restate=RESTATE_B, restate_dt=1.0, pat=PAT_B,
        chords=["G", "A"] + ["Bm", "G", "D", "A"] + ["Dlogo"] * 2,
        modes=["intro", "swell"] + rep("groove", 4) + ["logo", "tail"],
        accents=[4.0], logo=12.0, alt=True,
        named={"intro_start": 0.0, "groove_hit": 4.0, "logo_hit": 12.0, "silence_by": 15.8},
    ),
}


# ------------------------------------------------------------------ render
_ONE = {}


def oneshots():
    if not _ONE:
        _ONE.update(kick=kit.kick(), clap=kit.clap(), snap=kit.snap(), hat=kit.hat(),
                    shaker=kit.shaker(), rim=kit.rim(), boom=kit.boom(), air=kit.air())
    return _ONE


def render(spec):
    S = oneshots()
    dur = spec["dur"]
    N = int(round(dur * SR))
    NB = N + 5 * SR  # render room for tails
    names = ["kick", "perc", "hat", "shaker", "bass", "ep", "stab", "pluck", "pad", "fx", "logo"]
    L = {k: np.zeros((2, NB)) for k in names}
    kicks = []
    hook, pat, alt = spec["hook"], spec["pat"], spec.get("alt", False)
    tl = spec["logo"]
    acc = set(round(a, 3) for a in spec["accents"])

    def vchord(name):
        return CH[name]["ep"]

    for bi, (mode, ch) in enumerate(zip(spec["modes"], spec["chords"])):
        t0 = bi * BAR
        c = CH.get(ch)

        # ---- drums
        def hit_kick(t, v=1.0):
            add(L["kick"], S["kick"], t, v)
            kicks.append(t)

        if mode in ("groove", "stabs"):
            for b in range(4):
                tb = t0 + b * BEAT
                if round(tb, 3) not in acc:
                    hit_kick(tb, 0.9)
            if mode == "groove":
                for b in (1, 3):
                    tb = t0 + b * BEAT
                    add(L["perc"], S["clap"], tb, 0.9)
                    add(L["perc"], S["snap"], tb, 0.7)
                for b in range(4):  # offbeat closed hats, slightly swung-soft
                    add(L["hat"], S["hat"], t0 + b * BEAT + EIGHTH, 0.55, pan=0.25 * (-1) ** b)
                if alt and bi % 2 == 1:
                    add(L["perc"], S["rim"], t0 + 7 * EIGHTH, 0.5, pan=0.3)
            vel16 = [0.55, 0.25, 0.42, 0.25] if not alt else [0.5, 0.3, 0.5, 0.3]
            for s in range(16):
                add(L["shaker"], S["shaker"], t0 + s * 0.125, vel16[s % 4] * 0.8, pan=0.35 * (-1) ** s)
        elif mode == "build":
            for e in range(8):
                add(L["shaker"], S["shaker"], t0 + e * EIGHTH, (0.7 if e % 2 == 0 else 0.4) * 0.7,
                    pan=0.3 * (-1) ** e)
            for b in (1, 3):
                add(L["perc"], S["rim"], t0 + b * BEAT, 0.6, pan=0.2)
        elif mode == "breath":
            for e in range(1, 8, 2):
                add(L["shaker"], S["shaker"], t0 + e * EIGHTH, 0.3, pan=0.3 * (-1) ** e)

        # ---- bass
        if mode in ("groove", "build"):
            gain = 1.0 if mode == "groove" else 0.8
            for pos, ln, which in pat["bass"]:
                t = t0 + pos * EIGHTH
                if round(t, 3) in acc:
                    continue
                add(L["bass"], kit.bass_note(c["bass"][which], ln * EIGHTH * 0.92, gain), t)
        elif mode == "stabs":
            for b in range(4):
                add(L["bass"], kit.bass_note(CH[STAB_CHORDS[b]]["bass"][0], 0.42), t0 + b * BEAT)

        # ---- electric piano chord pulse
        def ep_chord(t, vel, tau, dur_, bright=1.0, spread=0.0):
            for k, m in enumerate(vchord(ch)):
                add(L["ep"], kit.ep_note(mtof(m), dur_, vel * (0.9 if k == 0 else 1.0), tau, bright),
                    t + k * spread)

        if mode == "intro":
            for pos, v in pat["ep"]:
                ep_chord(t0 + pos * EIGHTH, 0.42 * v, 0.7, 1.6 if pos == 0 else 1.0, 0.8, 0.006)
        elif mode == "swell":
            for pos, v in pat["ep"]:
                ep_chord(t0 + pos * EIGHTH, 0.5 * v, 0.6, 1.2, 0.9, 0.005)
        elif mode == "build":
            for pos, v in pat["ep"]:
                ep_chord(t0 + pos * EIGHTH, 0.7 * v, 0.4, 0.9, 1.0, 0.004)
        elif mode == "groove":
            for pos, v in pat["ep"]:
                ep_chord(t0 + pos * EIGHTH, 0.85 * v, 0.34, 0.85, 1.05, 0.004)
        elif mode == "stabs":
            for b in range(4):
                sc = STAB_CHORDS[b]
                for k, m in enumerate(CH[sc]["ep"]):
                    add(L["stab"], kit.ep_note(mtof(m), 0.55, 1.15, 0.22, 1.7), t0 + b * BEAT + k * 0.003)
                    if k >= 3:  # glassy octave on top so each flip reads as a distinct event
                        add(L["stab"], kit.pluck(mtof(m + 12), 0.5, 0.55, 0.14), t0 + b * BEAT)
        elif mode in ("break", "break2"):
            for e in range(0, 8, 2):
                ep_chord(t0 + e * EIGHTH, 0.40 if e else 0.5, 0.55, 1.1, 0.8, 0.008)

        # ---- plucked hook
        if mode in hook_modes() and ch in hook:
            vel = hook_modes()[mode]
            for i, (pos, m, ln) in enumerate(hook[ch]):
                if mode in ("intro", "swell", "break2") and i % 2 == 1:
                    continue
                add(L["pluck"], kit.pluck(mtof(m), 1.3, vel, 0.15 + 0.04 * ln),
                    t0 + pos * EIGHTH, pan=0.35 * (-1) ** i)

        # ---- pad
        padg = {"swell": (0.0, 1.0), "build": (0.3, 0.3), "breath": (0.6, 0.4), "groove": (0.35, 0.35),
                "stabs": (0.35, 0.35), "break": (1.0, 1.0), "break2": (1.0, 1.5)}.get(mode)
        if padg and ch in CH:
            fr = [mtof(m) for m in vchord(ch)]
            ts = max(0.0, t0 - 0.2)
            add(L["pad"], kit.pad_note(fr, (t0 + BAR + 0.2) - ts, padg[0], padg[1]), ts)

        # ---- riser into the next section
        if mode == "swell":
            add(L["fx"], kit.riser(BAR, 1.0), t0)

    # ---- accent hits (hero 12.0, groove-start hits for the shorter cues)
    for a in spec["accents"]:
        i = int(round(a / BAR))
        ch = spec["chords"][i]
        hit_kick_t = a
        add(L["kick"], S["kick"], a, 1.0)
        kicks.append(a)
        add(L["perc"], S["clap"], a, 1.0)
        add(L["perc"], S["snap"], a, 0.8)
        add(L["bass"], S["boom"], a, 0.8)
        add(L["bass"], kit.bass_note(CH[ch]["bass"][0], 1.6, 1.0), a)
        for k, m in enumerate(CH[ch]["ep"]):
            add(L["stab"], kit.ep_note(mtof(m), 2.4, 1.15, 0.9, 1.4), a + k * 0.006)
        add(L["fx"], S["air"], a, 0.8)

    # ---- logo hit: warm, weighty resolution that blooms
    rem = dur - tl
    for k, m in enumerate(LOGO_CHORD):
        add(L["logo"], kit.ep_note(mtof(m), min(rem + 0.5, 9.0), 1.25 if k else 1.1, 2.6, 1.2),
            tl + k * 0.011)
    add(L["logo"], kit.pad_note([mtof(m) for m in LOGO_CHORD[1:]], rem + 0.3, 1.4, 0.5, att=0.05, rel=3.0), tl)
    for m, v, tau in ((86, 0.38, 1.6), (81, 0.28, 1.2), (90, 0.18, 1.0)):
        add(L["logo"], kit.pluck(mtof(m), 3.5, v, tau), tl + 0.02, pan=0.3 if m == 81 else -0.2)
    add(L["bass"], S["boom"], tl, 1.0)
    add(L["bass"], kit.bass_note(38, 4.5, 1.0), tl)
    add(L["kick"], S["kick"], tl, 0.95)
    kicks.append(tl)
    add(L["fx"], S["air"], tl, 1.0)

    # ---- hook restatement over the ring
    rp = tl + spec["restate_dt"]
    for i, (pos, m, ln) in enumerate(spec["restate"]):
        add(L["pluck"], kit.pluck(mtof(m), 2.0, 0.5, 0.2 + 0.05 * ln), rp + pos * EIGHTH,
            pan=0.3 * (-1) ** i)

    # ---- sidechain: kick breathes the bass hard and the harmony lightly
    kt = sorted(set(kicks))
    L["bass"] *= sidechain(NB, kt, 0.72, 0.16)
    soft = sidechain(NB, kt, 0.22, 0.15)
    for k in ("ep", "pad", "pluck"):
        L[k] *= soft

    # WHY: keep 200-400 Hz clear of mud: harmony layers lose everything below ~250 Hz (the bass owns it)
    L["pad"] = kit.highpass(kit.lowpass(L["pad"], 1500, 2), 250, 2)
    L["ep"] = kit.highpass(L["ep"], 250, 2)
    L["stab"] = kit.highpass(L["stab"], 250, 2)

    # ---- pluck ping-pong delay (dotted eighth)
    pd = L["pluck"].copy()
    for k in range(1, 5):
        s = int(k * 0.375 * SR)
        ch = k % 2
        pd[ch, s:] += (0.38 ** k * 1.6) * L["pluck"][0 if ch else 1, :NB - s]
        pd[1 - ch, s:] += (0.38 ** k * 0.5) * L["pluck"][0 if ch else 1, :NB - s]
    L["pluck"] = pd

    # ---- reverbs
    long_ir = kit.make_ir(2.6, 3.4, 11)
    room_ir = kit.make_ir(0.45, 0.8, 12, lp_hz=5000, hp_hz=300, predelay=0.006)
    send = (L["ep"] * 0.22 + L["stab"] * 0.22 + L["pluck"] * 0.32 + L["pad"] * 0.28
            + L["logo"] * 0.50 + L["fx"] * 0.35)
    wet = kit.convolve_ir(send, long_ir)
    wet += kit.convolve_ir(L["perc"] * 0.30 + L["shaker"] * 0.05, room_ir)

    dry_gain = dict(kick=0.47, perc=0.75, hat=1.2, shaker=1.3, bass=0.42, ep=1.0, stab=1.0,
                    pluck=1.1, pad=1.0, fx=1.0, logo=0.55)
    mix = wet * 1.0
    for k in names:
        mix += L[k] * dry_gain[k]
    mix = mix[:, :N]

    # ---- master shaping (all zero-phase)
    def master_eq(f):
        mud = 1 - (1 - 10 ** (-3.5 / 20)) * np.exp(-0.5 * (np.log2(np.maximum(f, 1) / 300) / 0.7) ** 2)
        return kit.hp(28, 2)(f) * mud * kit.lp(5200, 4)(f)

    mix = kit.fft_shape(mix, master_eq)
    # mono-compatible low end: remove stereo content below ~150 Hz
    mid, side = (mix[0] + mix[1]) / 2, (mix[0] - mix[1]) / 2
    side = kit.fft_shape(side, kit.hp(150, 2))
    mix = np.stack([mid + side, mid - side])

    # ---- air before each hit: a short dip so the hit speaks (ends exactly on the hit sample)
    t = np.arange(N) / SR
    for h in list(spec["accents"]) + [tl]:
        # 60 ms of near-silence ending 3 ms before the hit: 12 ms fade in, 3 ms fade back up
        gd = np.ones(N)
        s0, s1, s2, s3 = h - 0.075, h - 0.063, h - 0.006, h - 0.0005
        w = (t >= s0) & (t < s3)
        dep = np.interp(t[w], [s0, s1, s2, s3], [0.0, 0.96, 0.96, 0.0])
        mix[:, w] *= (1 - dep)
    # ---- tail: smooth fade, true silence for the last 0.2 s
    f0, f1 = tl + 0.45 * (dur - 0.2 - tl), dur - 0.2
    g = np.where(t < f0, 1.0, np.where(t > f1, 0.0, 0.5 + 0.5 * np.cos(np.pi * (t - f0) / (f1 - f0))))
    mix *= g
    mix[:, :4] *= np.array([0.0, 0.3, 0.6, 0.9])  # guarantees no click on sample 0 (nothing begins loud)
    return mix.astype(np.float64)


def hook_modes():
    return {"intro": 0.45, "swell": 0.5, "build": 0.65, "groove": 0.85, "break2": 0.5}


# ------------------------------------------------------------------ loudness
def _run(args):
    return subprocess.run(args, capture_output=True, text=True)


def measure(path):
    r = _run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
              "-f", "null", "-"])
    txt = r.stderr.split("Summary:")[-1]
    I = float(txt.split("I:")[1].split("LUFS")[0])
    tp = float(txt.split("Peak:")[1].split("dBFS")[0])
    lra = float(txt.split("LRA:")[1].split("LU")[0])
    return I, tp, lra


def finalize(raw, out):
    """Two-stage loudness: iterate gain + lookahead limiter until -14 LUFS and TP <= -1.0 dBTP."""
    g, lim = 0.0, 0.84
    I0, _, _ = measure_raw(raw)
    g = -14.0 - I0
    res = None
    for _ in range(8):
        flt = f"volume={g}dB,alimiter=limit={lim}:attack=5:release=60:level=0,aresample=48000"
        _run(["ffmpeg", "-y", "-hide_banner", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw,
              "-af", flt, "-c:a", "pcm_s24le", "-ar", "48000", out])
        I, tp, lra = measure(out)
        res = (I, tp, lra)
        ok_i, ok_tp = abs(I + 14) < 0.05, tp <= -1.05
        if ok_i and ok_tp:
            break
        g += (-14.0 - I)
        if tp > -1.05:
            lim *= 10 ** (-(tp + 1.1) / 20)
    return res


def measure_raw(raw):
    r = _run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw,
              "-af", "ebur128=peak=true", "-f", "null", "-"])
    txt = r.stderr.split("Summary:")[-1]
    return float(txt.split("I:")[1].split("LUFS")[0]), 0, 0


def main():
    out_dir = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Videos/youcoded-campaign/music")
    os.makedirs(out_dir, exist_ok=True)
    scratch = os.environ.get("SCRATCH", "/tmp")
    grid = {}
    for name, spec in SONGS.items():
        mix = render(spec)
        raw = os.path.join(scratch, f"{name}.f32")
        mix.T.astype(np.float32).tofile(raw)
        out = os.path.join(out_dir, f"{name}.wav")
        I, tp, lra = finalize(raw, out)
        print(f"{name}: {I:.2f} LUFS  TP {tp:.2f} dBTP  LRA {lra:.1f}")
        nb = int(round(spec["dur"] / BAR))
        grid[f"{name}.wav"] = dict(
            bpm=BPM, key="D major", duration_s=spec["dur"], sample_rate=48000, channels=2,
            bar_length_s=BAR, bars_s=[round(i * BAR, 3) for i in range(nb)],
            hits_s=spec["named"], chords=dict(zip([f"bar{i + 1}" for i in range(nb)], spec["chords"])),
            measured=dict(integrated_lufs=round(I, 2), true_peak_dbtp=round(tp, 2)))
    with open(os.path.join(out_dir, "grid.json"), "w") as f:
        json.dump(grid, f, indent=2)


if __name__ == "__main__":
    main()
