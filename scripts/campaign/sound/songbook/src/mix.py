"""Mix, narration levels and mastering.

MIX: each bus (instrument group) is set to a fixed loudness when it plays (LUFS of that bus
alone), so the balance is stated as numbers you can change (TARGET). One shared hall and
room. No pumping, no automatic ducking, no bus compressors on the tune.

NARRATION (hand-set, never automatic): every section has a music level (0 dB unless set;
-6 dB by default where `narration=True`) and, under narration, a gentle 3 dB dip around
2.5 kHz where speech is understood. Both change only at section changes, slowly (a 3-second
raised-cosine ramp centred on the boundary).

MASTER: 25 Hz high-pass, everything below 140 Hz mono, an "air" shelf above 9 kHz, gentle glue
compression, the level plan, then a true-peak limiter while the gain is searched so the whole
file measures -14 LUFS with true peak at or below -1 dB. The logo is PLAYED by the band as the
piece's last phrase (blocks.play_logo), so there is nothing to paste; the file ends with a
1-second equal-power fade to exact silence while the logo's chord is still ringing. (The logo
FILES are used only when the logo plays alone: out/logo-alone.wav.)
"""
import os

import numpy as np
import soundfile as sf

import sounds as S
from dsp import SR, biquad, butter, convolve, fade, undb
from master import finish, lufs, premaster
from score import BUSES

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_FILES = {"blend": os.path.join(HERE, "..", "logo", "10-full-blend.wav"),
              "piano": os.path.join(HERE, "..", "logo", "02-piano-only.wav")}
END_FADE = 1.0         # seconds: the last chord is faded to exact silence over the final second
AIR_DB = 11.0          # the master's air shelf (the round-1 default was 2.5; chamber used 6)

# loudness of each bus while it plays (LUFS). The tune is the loudest single thing.
# WHY "counter" (2026-11-23): a second line sung against the tune (Section.counter) gets its own
# bus, set between the answer and the held strings, so it is heard as a partner, never on top.
TARGET = dict(lead=-19.0, sing=-17.5, double=-26.5, answer=-24.0, counter=-24.5, piano=-23.0, pizz=-23.5,
              bowed=-25.0, air=-27.0, synth=-31.0, sub=-26.5)
HALL = dict(lead=0.24, sing=0.26, double=0.24, answer=0.26, counter=0.28, piano=0.22, pizz=0.30, bowed=0.32,
            air=0.40, synth=0.28, sub=0.0)
ROOM = dict(lead=0.10, sing=0.05, double=0.08, answer=0.10, counter=0.06, piano=0.10, pizz=0.10, bowed=0.03,
            air=0.0, synth=0.05, sub=0.0)


def read_logo(kind):
    y, sr = sf.read(LOGO_FILES[kind], dtype="float64", always_2d=True)
    assert sr == SR
    return y


def mix(band, plans, piece, gains=None):
    """Sum the buses at their set levels with the shared spaces; the last second fades (equal
    power) to exact silence."""
    stems = {}
    src = band.bus
    if gains is None:
        gains = {}
        for b in BUSES:
            x = src[b]
            # WHY piece.mix: a per-piece trim of one group (see score.Piece.mix); 0 for every old piece
            tgt = TARGET[b] + float((getattr(piece, "mix", None) or {}).get(b, 0.0))
            gains[b] = 10 ** ((tgt - lufs(x)) / 20) if np.abs(x).max() > 1e-9 else 0.0
    for b in BUSES:
        stems[b] = src[b] * gains[b]
    hall_in = sum(stems[b] * HALL[b] for b in BUSES)
    room_in = sum(stems[b] * ROOM[b] for b in BUSES)
    hall = biquad(convolve(butter(hall_in, "highpass", 180, 2), S.ir("hall")), "lp", 12000, 0.7) * 0.55
    room = convolve(room_in, S.ir("room")) * 0.4
    out = sum(stems.values()) + hall + room
    t = np.arange(len(out)) / SR
    g = np.clip((piece.length - t) / END_FADE, 0, 1)
    out = out * (np.sin(0.5 * np.pi * g) ** 2)[:, None]
    band.stems = stems
    return fade(out, fin=0.002), gains


def level_plan(plans, n):
    """Per-sample music gain (linear) and speech-dip amount (dB), from the sections' hand-set
    levels, with 3 s raised-cosine ramps centred on each section change."""
    t = np.arange(n) / SR
    gain_db = np.zeros(n)
    dip_db = np.zeros(n)
    lv = []
    for p in plans:
        s = p.sec
        lvl = s.level_db if s.level_db is not None else (-6.0 if s.narration else 0.0)
        lv.append((p.t0, lvl, 3.0 if s.narration else 0.0, float(getattr(s, "ramp", 3.0) or 0.01),
                   getattr(s, "ramp_at", "centre")))
    for k, (t0, lvl, dip, ramp, at) in enumerate(lv):
        if k == 0:
            gain_db[:] = lvl
            dip_db[:] = dip
            continue
        _, plvl, pdip, _, _ = lv[k - 1]
        # WHY ramp_at (2026-11-23): a change centred on the section line starts half a ramp early,
        # under whatever the narrator is still saying; "after" begins exactly at the change
        a0 = {"after": t0, "before": t0 - ramp}.get(at, t0 - ramp / 2)
        w = np.clip((t - a0) / ramp, 0, 1)
        w = 0.5 - 0.5 * np.cos(np.pi * w)
        m = t >= a0
        gain_db[m] = plvl + (lvl - plvl) * w[m]
        dip_db[m] = pdip + (dip - pdip) * w[m]
    return gain_db, dip_db


def premaster_music(raw, plans):
    """Everything before the final limiter: master chain, hand-set levels, speech dip."""
    x = premaster(raw, air_db=AIR_DB)
    gain_db, dip_db = level_plan(plans, len(x))
    if dip_db.max() > 0:
        # WHY a crossfade between a dipped and an undipped copy: the dip then moves only as
        # slowly as the level plan does (no filter sweeping in and out)
        dipped = biquad(x, "peak", 2500, 0.8, -3.0)
        w = (dip_db / 3.0)[:, None]
        x = x * (1 - w) + dipped * w
    return x * undb(gain_db)[:, None]


def finish_piece(x, piece, extra=None):
    """Final limiter and loudness (-14 LUFS, true peak <= -1 dB); `extra` (e.g. a film's sound
    effects, already placed and levelled) is added before it so the whole mix is measured."""
    if extra is not None:
        x = x + extra[: len(x)]
    y = finish(x, getattr(piece, "loudness", -14.0))  # WHY: see Piece.loudness
    n = int(round(piece.length * SR))
    y = y[:n]
    if len(y) < n:
        y = np.vstack([y, np.zeros((n - len(y), 2))])
    t = np.arange(n) / SR
    g = np.clip((piece.length - t) / END_FADE, 0, 1)
    y = y * (np.sin(0.5 * np.pi * g) ** 2)[:, None]     # the limiter's release cannot undo the fade
    y[-1] = 0.0
    return fade(y, fin=0.002)


def master(raw, plans, piece, extra=None):
    return finish_piece(premaster_music(raw, plans), piece, extra)
