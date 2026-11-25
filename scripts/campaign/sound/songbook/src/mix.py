"""Mix, narration levels and mastering.

MIX (2026-11-24, toolkit-plan.md b4; every switch in engine/options.py):
  - Each bus (instrument group) gets ONE fixed gain per film (option bus_gain="fixed"): the gain
    that would put a reference passage of that instrument, at that bus's usual touch, at the
    bus's TARGET loudness. So what the score writes (a softer touch, a denser figure, a quiet
    section) is what is heard. The old behaviour (bus_gain="levelled": every bus turned to
    TARGET whenever it plays, which erased written dynamics) stays for A/B.
  - Piano buses: HP 40 Hz, -2.5 dB at 250 Hz, LP 8 kHz (12 dB/oct); optional 3 kHz dip and
    soft saturation.
  - One shared hall (2.2-2.7 s; pre-delay 25 ms, longer at or below 80 BPM; send HP 220 Hz,
    return LP 7 kHz) and a small room.
  - An echo send (dotted eighth, 3 repeats each 4 dB quieter and 20 % darker) for the pad, the
    cycles and, if a piece asks (Piece.echo), the tune.
  - The pad's centre channel 3 dB down under narration (mid/side; its sides untouched).
  No pumping, no automatic ducking, no bus compressors on the tune.

NARRATION (hand-set, never automatic): every section has a music level (0 dB unless set;
-6 dB by default where `narration=True`) and, under narration, a static mid-only cut of 2.5 dB
around 3.2 kHz where speech is understood (option voice_cut; "stereo-dip" = the old 3 dB dip at
2.5 kHz on both channels). Both change only at section changes, slowly (a 3-second
raised-cosine ramp centred on the boundary).

MASTER: 25 Hz high-pass, everything below 140 Hz mono, an optional "air" shelf above 9 kHz
(0 dB by default, at most +1.5 dB per piece), gentle glue (at most 2 dB), the level plan, then a
true-peak limiter while the gain is searched so the whole file measures the piece's loudness
with true peak at or below -1 dB. The logo is PLAYED by the band as the piece's last phrase
(blocks.play_logo), so there is nothing to paste; the file ends with a 1-second equal-power fade
to exact silence while the logo's chord is still ringing. (The logo FILES are used only when the
logo plays alone: out/logo-alone.wav.)
"""
import os
from functools import lru_cache

import numpy as np
import soundfile as sf

import options as O
import sounds as S
from dsp import SR, biquad, butter, convolve, fade, onepole_lp, sat, to_stereo, undb
from master import finish, lufs, premaster
from score import BUSES

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_FILES = {"blend": os.path.join(HERE, "..", "logo", "10-full-blend.wav"),
              "piano": os.path.join(HERE, "..", "logo", "02-piano-only.wav")}
END_FADE = 1.0         # seconds: the last chord is faded to exact silence over the final second
# WHY 0 (was 11, 2026-11-24): the 11 dB shelf was ~10x a normal mastering move and the likeliest
# technical cause of "harsh" (research: what-we-learned.md 7). Set by options.air_db.
AIR_DB = O.DEFAULTS["air_db"]

# loudness of each bus (LUFS): with bus_gain="fixed", where a reference passage at the bus's usual
# touch would sit; with "levelled", where the bus is set whenever it plays. The tune is the loudest
# single thing.
# WHY "counter" (2026-11-23): a second line sung against the tune (Section.counter) gets its own
# bus, set between the answer and the held strings, so it is heard as a partner, never on top.
# WHY "pad" -33 and "cycles" -27 (2026-11-24, plan b3/c2): the pad is the bed, -30 to -36 LUFS
# when exposed; the cycles are quiet colour, below the answer.
TARGET = dict(lead=-19.0, sing=-17.5, double=-26.5, answer=-24.0, counter=-24.5, piano=-23.0, pizz=-23.5,
              bowed=-25.0, air=-27.0, synth=-31.0, sub=-26.5, pad=-33.0, cycle=-27.0,
              # WHY ring -33 (audit 2026-11-25): the pedalled-piano sustain is the same layer as the
              # pad, so the owner's pad / held / ring A/B compares them at one level
              ring=-33.0)
HALL = dict(lead=0.24, sing=0.26, double=0.24, answer=0.26, counter=0.28, piano=0.22, pizz=0.30, bowed=0.32,
            air=0.40, synth=0.28, sub=0.0, pad=0.32, cycle=0.34, ring=0.30)
ROOM = dict(lead=0.10, sing=0.05, double=0.08, answer=0.10, counter=0.06, piano=0.10, pizz=0.10, bowed=0.03,
            air=0.0, synth=0.05, sub=0.0, pad=0.0, cycle=0.08, ring=0.06)
# echo return in dB below the bus (plan b4: -12 to -18); a piece may add or change any (Piece.echo,
# {bus: dB or None}); the change plan's "echo" entries scale it over time (band.echo_curve)
ECHO = dict(pad=-18.0, cycle=-14.0)
PIANO_BUSES = ("lead", "double", "answer", "counter", "piano", "cycle", "ring")

# ---- fixed bus gains (option bus_gain="fixed")
# Each bus is calibrated against a 4-second reference passage of its instrument at its usual
# touch: (family, touch). WHY per-bus touch: a tune is written around 0.6, an accompaniment
# around 0.3-0.4; calibrating each at its own usual touch keeps the old balance for ordinary
# writing while a softer or louder passage than usual is now heard as softer or louder.
REF = dict(lead=("piano", 0.60), double=("piano", 0.45), answer=("piano", 0.45), counter=("piano", 0.45),
           piano=("piano", 0.35), cycle=("piano", 0.40), pizz=("pizz", 0.50), bowed=("bowed", 0.50),
           sing=("sing", 0.60), air=("air", 0.40), synth=("synth", 0.50), sub=("sub", 0.80), pad=("pad", 0.30),
           ring=("piano", 0.24))
# WHY CAL (dB, measured 2026-11-24): the reference passages are not the songs. Over all 16 existing
# pieces, the fixed gain differed from the old levelled gain by these medians (the lead's tune is
# sparser than the reference, the air line far softer, ...). Adding them back makes ordinary writing
# land where it always did, so only writing that departs from the usual (a softer phrase, a denser
# figure) moves the level. pad/cycle are new (no history): 0.
CAL = dict(lead=3.9, sing=-2.4, double=0.2, answer=2.1, counter=2.4, piano=-2.0, pizz=-1.0, bowed=-1.3,
           air=14.7, synth=-2.6, sub=4.3, pad=0.0, cycle=0.0, ring=0.0)


@lru_cache(maxsize=None)
def ref_lufs(family, touch, opts=()):
    """Loudness of the reference passage (cached): eight quarter notes at 120 BPM around E-flat 4
    for struck/plucked voices, one 4-second held note or chord for held voices. `opts` is only
    part of the cache key (the instruments read options themselves)."""
    n = int(4.5 * SR)
    buf = np.zeros((n, 2))
    walk = [63, 67, 70, 67, 63, 67, 70, 74]

    def put(x, t):
        x = to_stereo(x)
        i = int(t * SR)
        j = min(n, i + len(x))
        buf[i:j] += x[: j - i]
    if family == "piano":
        for k, m in enumerate(walk):
            put(S.felt_piano(m, touch, 0.45), 0.5 * k)
    elif family == "pizz":
        for k, m in enumerate(walk):
            put(S.pizz("vla", m - 12, touch)[0], 0.5 * k)
    elif family == "synth":
        for k, m in enumerate(walk):
            put(S.synth(m, touch, gate=0.2), 0.5 * k)
    elif family == "bowed":
        put(S.bowed("vla", 58, 4.0, touch, touch), 0.0)
    elif family == "sing":
        put(S.bowed("solo", 70, 4.0, touch, touch), 0.0)
    elif family == "air":
        put(S.bowed("vln", 82, 4.0, touch, touch), 0.0)
    elif family == "sub":
        put(S.sub(39, 4.0, touch), 0.0)
    elif family == "pad":
        x, _ = S.pad_layer([(0.0, 4.0, [51, 55, 58, 62])], touch)
        put(x, 0.0)
    else:
        raise KeyError(family)
    return lufs(buf[: int(4.0 * SR)])


def _opts_key():
    return tuple(sorted((k, str(v)) for k, v in O.summary().items()))


def bus_gains(src, piece):
    """The gain of every bus for this piece (linear), by option bus_gain."""
    gains = {}
    mode = O.get("bus_gain", piece)
    for b in BUSES:
        x = src[b]
        # WHY piece.mix: a per-piece trim of one group (see score.Piece.mix); 0 for every old piece
        tgt = TARGET.get(b, -26.0) + float((getattr(piece, "mix", None) or {}).get(b, 0.0))
        if np.abs(x).max() <= 1e-9:
            gains[b] = 0.0
        elif mode == "levelled":
            gains[b] = 10 ** ((tgt - lufs(x)) / 20)
        else:
            fam, touch = REF.get(b, ("piano", 0.45))
            g_db = tgt - ref_lufs(fam, touch, _opts_key()) + CAL.get(b, 0.0)
            if fam == "piano":
                # WHY: Piece.touch is documented as "softer hammers: a rounder, darker note, SAME
                # level" (score.Piece); the felt piano's level moves 22 dB per unit of touch, so
                # the level that a piece-wide touch change would take away is given back here
                tch = float(getattr(piece, "touch", 1.0) or 1.0)
                g_db += (1.0 - tch) * touch * 22.0
            gains[b] = 10 ** (g_db / 20)
    return gains


def _piano_bus(x, piece):
    """Plan b4, piano bus: HP 40 Hz, -2.5 dB bell at 250 Hz (Q 1: the boxy low-mid of a close
    upright), optional 3 kHz dip, LP 8 kHz at 12 dB/oct (nothing above it belongs to felt),
    optional soft saturation."""
    if O.get("piano_bus_eq", piece) != "on":
        return x
    x = butter(x, "highpass", 40, 2)
    x = biquad(x, "peak", 250, 1.0, -2.5)
    cut = float(O.get("piano_3k_cut", piece))
    if cut:
        x = biquad(x, "peak", 3000, 1.5, -abs(cut))
    x = butter(x, "lowpass", 8000, 2)
    drive = float(O.get("piano_saturation", piece))
    if drive > 0:
        g = 10 ** (drive / 20)
        pk = float(np.abs(x).max()) or 1.0
        x = sat(x / pk * g, 1.0) / g * pk
    return x


def _echo(x, bpm, ret_db):
    """Plan b4 echo send: dotted eighth at the piece's tempo, 3 repeats, each 4 dB quieter and
    20 % darker than the last (cutoff from 4.5 kHz), alternating gently between the sides,
    returned `ret_db` below the bus. High-passed at 300 Hz so it never thickens the low end."""
    d = int(round((0.75 * 60.0 / bpm if bpm else 0.375) * SR))
    mono = butter(x.mean(axis=1), "highpass", 300, 2)
    out = np.zeros_like(x)
    y = mono
    lp = 4500.0
    for k in range(1, 4):
        y = onepole_lp(y, lp) * 10 ** (-4 / 20)
        lp *= 0.8
        if k * d >= len(x):
            break
        side = (0.7, 0.3) if k % 2 else (0.3, 0.7)
        out[k * d:, 0] += y[: len(x) - k * d] * side[0]
        out[k * d:, 1] += y[: len(x) - k * d] * side[1]
    return out * 10 ** (ret_db / 20) * np.sqrt(2)


def _echo_amount(curve, n, ramp=2.0):
    """The change plan's echo entries [(seconds, amount)] as a per-sample multiplier on every echo
    return (1.0 before the first entry), each change a 2-second raised-cosine move. None = none."""
    if not curve:
        return None
    t = np.arange(n) / SR
    a = np.ones(n)
    prev = 1.0
    for t0, v in sorted(curve):
        w = np.clip((t - t0) / ramp, 0, 1)
        w = 0.5 - 0.5 * np.cos(np.pi * w)
        m = t >= t0
        a[m] = prev + (float(v) - prev) * w[m]
        prev = float(v)
    return a


def _narration_weight(plans, n):
    """0..1 per sample: how much the section is under narration (follows the level plan's ramps)."""
    _, dip = level_plan(plans, n)
    return dip / 3.0 if dip.max() > 0 else None


def mix(band, plans, piece, gains=None):
    """Sum the buses at their set levels with the shared spaces; the last second fades (equal
    power) to exact silence."""
    stems = {}
    src = band.bus
    if gains is None:
        gains = bus_gains(src, piece)
    for b in BUSES:
        stems[b] = src[b] * gains.get(b, 0.0)
        if b in PIANO_BUSES and gains.get(b, 0.0):
            stems[b] = _piano_bus(stems[b], piece)
    n = len(next(iter(stems.values())))
    for sb in ("pad", "ring"):
        if sb not in stems or not gains.get(sb, 0.0):
            continue
        w = _narration_weight(plans, n)
        if w is not None:
            # WHY mid only (plan b3): the narrator sits in the centre; the pad's sides keep the
            # bed's width while its centre makes room for her (the ring sustain is the same layer)
            g = 10 ** (float(O.get("pad_centre_under_voice", piece)) * w / 20)
            x = stems[sb]
            mid, side = (x[:, 0] + x[:, 1]) / 2 * g, (x[:, 0] - x[:, 1]) / 2
            stems[sb] = np.stack([mid + side, mid - side], axis=1)
    bpm = float(getattr(plans[0], "bpm", 0.0) or 0.0) if plans else 0.0
    hall_in = sum(stems[b] * HALL.get(b, 0.25) for b in BUSES)
    room_in = sum(stems[b] * ROOM.get(b, 0.05) for b in BUSES)
    pdl = O.get("hall_predelay", piece)
    pdl = S.hall_predelay(bpm) if pdl == "tempo" else float(pdl)
    hall = convolve(butter(hall_in, "highpass", float(O.get("reverb_hp", piece)), 2), S.ir("hall", pdl))
    hall = biquad(hall, "lp", float(O.get("reverb_lp", piece)), 0.7) * 0.55
    room = convolve(room_in, S.ir("room")) * 0.4
    out = sum(stems.values()) + hall + room
    if O.get("echo", piece) == "on":
        sends = dict(ECHO, **(getattr(piece, "echo", None) or {}))
        amt = _echo_amount(getattr(band, "echo_curve", None) or [], len(out))
        for b, ret in sends.items():
            if ret is not None and b in stems and gains.get(b, 0.0):
                e = _echo(stems[b], bpm, float(ret))
                out = out + (e if amt is None else e * amt[:, None])
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


def air_for(piece):
    """The master's air shelf for this piece, dB. Piece.air if set, else options.air_db; with
    air_policy "cap" (default) never above options.air_max_db (+1.5). WHY a cap rather than
    trusting Piece.air: round 8 pieces raised it to 12-18 dB to satisfy a brightness floor; the
    plan allows at most +1.5 dB at 10 kHz."""
    a = getattr(piece, "air", None) if piece is not None else None
    air = float(O.get("air_db", piece)) if a is None else float(a)
    if O.get("air_policy", piece) == "cap":
        air = min(air, float(O.get("air_max_db", piece)))
    return air


def premaster_music(raw, plans, piece=None):
    """Everything before the final limiter: master chain, hand-set levels, speech cut."""
    x = premaster(raw, air_db=air_for(piece), glue=O.get("glue", piece))
    # WHY Piece.tone (round 8): a high shelf at 3.5 kHz for a whole piece; 0 = none
    tone = float(getattr(piece, "tone", 0.0) or 0.0) if piece is not None else 0.0
    if tone:
        x = biquad(x, "highshelf", 3500, 0.6, tone)
    gain_db, dip_db = level_plan(plans, len(x))
    if dip_db.max() > 0:
        # WHY a crossfade between a cut and an uncut copy: the cut then moves only as slowly as
        # the level plan does (no filter sweeping in and out)
        w = (dip_db / 3.0)[:, None]
        if O.get("voice_cut", piece) == "mid":
            # WHY mid only (plan b4): the narrator is in the centre; cutting only the mid opens
            # her band without dulling the music's sides
            mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
            mc = biquad(mid, "peak", 3200, 0.8, -2.5)
            mid = mid * (1 - w[:, 0]) + mc * w[:, 0]
            x = np.stack([mid + side, mid - side], axis=1)
        else:
            dipped = biquad(x, "peak", 2500, 0.8, -3.0)
            x = x * (1 - w) + dipped * w
    return x * undb(gain_db)[:, None]


def finish_piece(x, piece, extra=None, loudness=None, tp_max=-1.05):
    """Final limiter and loudness (the piece's loudness, true peak <= -1 dB); `extra` (e.g. a
    film's sound effects, already placed and levelled) is added before it so the whole mix is
    measured. `loudness` / `tp_max` override the piece's (see deliver)."""
    if extra is not None:
        x = x + extra[: len(x)]
    target = getattr(piece, "loudness", -14.0) if loudness is None else loudness
    y = finish(x, target, ceiling=min(-1.3, tp_max - 0.25), tp_max=tp_max)
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
    return finish_piece(premaster_music(raw, plans, piece), piece, extra)


# ---- delivery renders (plan b4). name -> (integrated loudness, true-peak maximum)
DELIVERY = {"web": (-14.0, -1.05), "web-subtle": (-16.5, -1.05), "tv-us": (-24.0, -2.05), "tv-eu": (-23.0, -1.05)}


def deliver(xm, piece, spec="web", extra=None):
    """One delivery file from the premastered music `xm` (premaster_music's output): web/social
    -14 LUFS (subtle -16 to -17), US TV -24 LKFS at -2 dBTP, EU TV -23 LUFS at -1 dBTP. Stems
    (full / no-melody bed / logo only) are the same call on the matching renders."""
    lo, tp = DELIVERY[spec]
    return finish_piece(xm, piece, extra, loudness=lo, tp_max=tp)
