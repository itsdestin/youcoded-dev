#!/usr/bin/env python3
"""Sound effects for "Yours.", made in code and timed from film/src/yours.json.

    python3 sfx.py [out_dir]      # writes sfx_yours.wav (60 s, 48 kHz stereo, unmastered)

WHY a separate stem: revision 1 had only music, so nothing on screen made a sound. Each event
the viewer sees (a notification, a key, Enter, a result arriving, a look changing, a cut) now
has its own small sound. Timings mirror Yours.tsx (resultAt, LOOK_STEP, the 36-40 cuts).
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

import kit
from kit import SR, add, mtof

HERE = os.path.dirname(os.path.abspath(__file__))
Y = json.load(open(os.path.join(HERE, "..", "film", "src", "yours.json")))
DUR = Y["dur"]
rng = np.random.default_rng(42)
tt = kit.tt


def chime(f1, f2, vel=1.0, length=0.9):
    """A soft two-note notification chime: glassy sine partials, the second note 70 ms later."""
    n = int(length * SR)
    t = tt(n)
    out = np.zeros(n)
    for f, dt, g in ((f1, 0.0, 1.0), (f2, 0.07, 0.8)):
        tt_ = np.maximum(t - dt, 0)
        on = (t >= dt)
        env = np.exp(-tt_ / 0.22) * np.minimum(1, tt_ / 0.002) * on
        out += g * env * (np.sin(2 * np.pi * f * tt_) + 0.18 * np.sin(2 * np.pi * 2.76 * f * tt_) * np.exp(-tt_ / 0.05))
    return out * 0.16 * vel


def swoosh(length=0.35, lo=400, hi=4000, up=True, vel=1.0):
    """Filtered-noise sweep: a card sliding in, a page arriving, a camera whip. (2,n)"""
    n = int(length * SR)
    t = tt(n)
    x = t / length
    out = np.zeros((2, n))
    bands = np.geomspace(lo, hi, 7)
    for k in range(len(bands) - 1):
        centre = k / (len(bands) - 2)
        pos = x if up else 1 - x
        g = np.exp(-((pos - centre) / 0.22) ** 2)
        for c in range(2):
            out[c] += kit.bandpass(rng.standard_normal(n), bands[k], bands[k + 1], 2) * g
    env = np.sin(np.pi * np.clip(x, 0, 1)) ** 1.5
    return out * env * 0.09 * vel


def key(vel=1.0):
    """One soft laptop key: a short bright click on a small woody body."""
    n = int(0.05 * SR)
    t = tt(n)
    click = kit.bandpass(rng.standard_normal(n), 2000, 7000, 2) * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * (170 + 30 * rng.random()) * t) * np.exp(-t / 0.012)
    return (click * 0.55 + body * 0.35) * np.minimum(1, t / 0.0005) * 0.22 * vel


def bloom(root=74, vel=1.0):
    """A result arriving: a short sparkle of plucked notes from the D major chord, plus air. (2,n)"""
    n = int(1.6 * SR)
    out = np.zeros((2, n))
    for i, m in enumerate((root, root + 4, root + 7, root + 12)):
        p = kit.pluck(mtof(m), 1.4, 0.5 - 0.06 * i, 0.25)
        s = int(i * 0.028 * SR)
        pan = (-0.4, 0.2, -0.1, 0.4)[i]
        out[0, s:s + len(p)] += p[: n - s] * (1 - pan) * 0.5
        out[1, s:s + len(p)] += p[: n - s] * (1 + pan) * 0.5
    out += kit.air(1.6, 0.35)[:, :n] * 0.8
    return out * vel


def thud(vel=1.0):
    n = int(0.6 * SR)
    t = tt(n)
    f = 55 * (1 + 0.6 * np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18) * np.minimum(1, t / 0.003) * 0.5 * vel


def reverse_swell(length):
    """Air that breathes in toward a hit (reversed decaying noise through a big room). (2,n)"""
    n = int(length * SR)
    t = tt(n)
    x = np.stack([kit.bandpass(rng.standard_normal(n), 300, 5000, 2) for _ in range(2)])
    x *= np.exp(-t / (length * 0.35))
    x = kit.convolve_ir(x, kit.make_ir(1.8, 2.2, 5))[:, :n]
    return x[:, ::-1] * 0.5


# Levels against the music, set by measurement (section RMS) — 2026-11-18:
# the storm leads its section, the request sounds sit ~8 dB under the groove, keys are felt.
G_STORM, G_ASK, G_KEYS = 2.4, 7.0, 6.0


def main():
    out_dir = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Videos/youcoded-campaign/music")
    N = int(DUR * SR)
    L = np.zeros((2, N + 3 * SR))

    # ---- 0-10: one notification per card. The first seven are big and centred; the rest
    # pile in from both sides, panned, a little brighter and smaller as they speed up.
    for i, w in enumerate(Y["wall"]):
        t = w["t"]
        if i < 7:
            f1 = mtof([81, 83, 81, 85, 83, 86, 88][i])
            c = chime(f1, f1 * 4 / 3, 1.0)
            add(L, np.stack([c, c]), t, G_STORM)
            add(L, swoosh(0.28, 300, 2500, up=False, vel=0.6), t - 0.12, G_STORM)
            add(L, np.stack([thud(0.5)] * 2), t, G_STORM)
        else:
            pan = rng.uniform(-0.8, 0.8)
            f1 = mtof(rng.choice([86, 88, 90, 93, 95]))
            c = chime(f1, f1 * rng.choice([4 / 3, 3 / 2, 9 / 8]), 0.55 + 0.3 * rng.random(), 0.5)
            add(L, np.stack([c * (1 - pan) / 1.4, c * (1 + pan) / 1.4]), t, G_STORM)
    # Everything (tails included) stops dead at wall_end: the cut to silence.
    t_ = np.arange(L.shape[1]) / SR
    L *= np.clip((Y["wall_end"] - t_) / 0.004, 0, 1)[None, :]

    # ---- the turn: a low breath under "Not anymore.", then air drawing in toward the flood.
    add(L, np.stack([thud(0.6)] * 2), 14.55)
    sw = reverse_swell(1.4)
    add(L, sw, Y["flood"] - 1.4)
    add(L, swoosh(0.9, 200, 5000, up=True, vel=1.4), Y["flood"] - 0.05)

    # ---- each request: the bar slides in, keys under the voice, Enter, the result blooms.
    roots = [74, 76, 71, 78, 74]
    for j, a in enumerate(Y["asks"]):
        at = a["at"]
        add(L, swoosh(0.4, 500, 3500, up=True, vel=0.5), at - 0.05, G_ASK)
        n_keys = len(a["say"])
        t0 = at + Y["ask_voice_at"]
        for k in range(n_keys):
            tk = t0 + a["say_len"] * (k + rng.uniform(-0.25, 0.25)) / n_keys
            kv = key(0.6 + 0.4 * rng.random())
            pan = rng.uniform(-0.15, 0.15)
            add(L, np.stack([kv * (1 - pan), kv * (1 + pan)]), tk, G_KEYS)
        send = t0 + a["say_len"] + 0.05
        add(L, swoosh(0.3, 800, 5000, up=True, vel=0.7), send, G_ASK)
        result = at + Y["ask_voice_at"] + a["say_len"] + 0.3  # = resultAt() in Yours.tsx
        add(L, bloom(roots[j], 0.8), result, G_ASK)
        if a["id"] == "look":
            for i in range(4):  # LOOK_FLIPS / LOOK_STEP in Yours.tsx
                add(L, swoosh(0.18, 600, 5000, up=bool(i % 2), vel=0.8), result + i * 0.22 - 0.04, G_ASK)
            add(L, bloom(81, 0.9), result + 4 * 0.22, G_ASK)

    # ---- 36-40: whips on the quick cuts, a tap on "Just ask."
    for i in range(4):
        add(L, swoosh(0.16, 900, 5000, up=bool(i % 2), vel=0.7), 36 + i * 0.5 - 0.06, G_ASK * 3.0)
    add(L, np.stack([thud(0.5)] * 2), 38.0, G_ASK)
    # ---- 40: the gallery pulls back on a long breath; "Yours." lands with a soft bloom.
    add(L, swoosh(2.4, 200, 3000, up=False, vel=0.9), 40.0, G_ASK)
    add(L, bloom(74, 0.7), 41.4, G_ASK)

    out = L[:, :N]
    # A short shared room so the effects sit in the same space as the music.
    out = out + 0.18 * kit.convolve_ir(out, kit.make_ir(0.9, 1.2, 9))[:, :N]
    # Fixed gains (not peak-normalised): the stem's level is set against the music's own -14 LUFS.
    out *= 0.5
    assert np.max(np.abs(out)) < 1.0, np.max(np.abs(out))
    raw = os.path.join(out_dir, "sfx_yours.f32")
    out.T.astype(np.float32).tofile(raw)
    os.system(f"ffmpeg -v error -y -f f32le -ar {SR} -ac 2 -i {raw} -c:a pcm_s24le -ar 48000 {os.path.join(out_dir, 'sfx_yours.wav')}")
    os.remove(raw)
    print("sfx_yours.wav", round(DUR, 1), "s")


if __name__ == "__main__":
    main()
