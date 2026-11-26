"""THE UNITY READINGS (2026-11-25): does the piece sound like ONE piece of music?

WHY this file: the owner's real complaint, across every round, was lack of unity: "different
instruments playing entirely their own song at different volume levels", a tune "randomly thrown
in on top", high notes "not blended as part of a well-unified track", strings that "overpower".
A mix analysis (read-only, 2026-11-25; summarised in SONGBOOK.md) measured what separated the
pieces he accepted from those he rejected. These are its signs, as READINGS: numbers to read next
to the reference shelf (reference/), never targets, never a failure. Nothing musical is ever added
or bent to move one.

    rows(band, plans, piece, y=None)   the readings as dashboard rows (group "unity")
    tone(y, sr)                        tilt and band levels of a mix, measured the deck's way

Every reading says where it comes from: the notes (the score's own note log) or the audio (the
stems or the final mix).
"""
import numpy as np

import tune as T

SUSTAIN = ("pad", "bowed", "ring")
BOWED = ("bowed", "sing", "air")


def _body(band, plans):
    end = plans[-1].beat0
    return [e for e in band.log if e["beat"] < end - 1e-6 and (e.get("canon") or ("",))[0] not in ("logo", "ending")]


def _span(band, e):
    return e["t"], e["t"] + band.secs(e["beat"], e["dur"])


def _chord_at(plans, beat):
    for p in plans:
        for bar in p.bars:
            if bar.beat - 1e-6 <= beat < bar.beat + p.blen:
                return bar.chords[0] if (len(bar.chords) == 1 or beat - bar.beat < 2) else bar.chords[1]
    return None


def notes_readings(band, plans, piece):
    """The readings that come from the notes alone (also on --notes, with no audio)."""
    body = _body(band, plans)
    tune = [e for e in body if e["role"] == "lead"]
    bed = [e for e in body if e["role"] != "lead"]
    R = {}
    held = [e for e in tune if e["dur"] >= 1.5 - 1e-6]          # recipes._held: 1.5 beats or longer
    if held:
        ok_c, ok_b = 0, 0
        for e in held:
            c = _chord_at(plans, e["beat"])
            ok_c += int(c is not None and e["m"] % 12 in T.CHORD_TONES.get(c, set()))
            t0 = e["t"] + 0.05
            ok_b += int(any(b["m"] % 12 == e["m"] % 12 and _span(band, b)[0] - 0.08 <= t0 < _span(band, b)[1]
                            for b in bed))
        R["tune-in-harmony"] = (f"{ok_c}/{len(held)}", ok_c == len(held))
        R["tune-in-bed"] = (f"{ok_b}/{len(held)}", ok_b == len(held))
    else:
        R["tune-in-harmony"] = ("no held tune notes", True)
        R["tune-in-bed"] = ("no held tune notes", True)
    above = 0
    for e in tune:
        a, z = _span(band, e)
        if any(b["m"] > e["m"] and _span(band, b)[0] < z - 0.05 and _span(band, b)[1] > a + 0.05
               and b["bus"] not in ("sub",) for b in bed):
            above += 1
    R["above-tune"] = (f"{above}/{len(tune)}", above == 0)
    t_end = plans[-1].t0
    cov = np.zeros(int(t_end * 20) + 1)
    for e in tune:
        a, z = _span(band, e)
        cov[int(a * 20):int(min(z, t_end) * 20)] = 1
    duty = float(cov.mean()) if len(cov) else 0.0
    R["tune-duty"] = (f"{100 * duty:.0f} %", 0.45 <= duty <= 0.75 or not tune)
    # layers with notes per bar: tune, pulse/figure, bass, sustain, and any other bus
    per = {}
    for e in body:
        lay = ("tune" if e["role"] == "lead" else "sustain" if (e["bus"] in SUSTAIN or e["role"] == "sustain")
               else e["role"] if e["role"] in ("pulse", "bass") else e["bus"])
        if lay == "piano":
            lay = "pulse"
        per.setdefault(int(e["beat"] // 4), set()).add(lay)
    counts = [len(v) for v in per.values()] or [0]
    R["layers-per-bar"] = (f"max {max(counts)}, median {int(np.median(counts))}", max(counts) <= 4)
    # struck together: a tune note and the bed notes on the same beat, ms apart
    gaps = []
    for e in tune:
        same = [abs(b["t"] - e["t"]) * 1000 for b in bed if abs(b["beat"] - e["beat"]) < 1e-3]
        if same:
            gaps.append(min(same))
    R["struck-together"] = ((f"median {np.median(gaps):.0f} ms, worst {max(gaps):.0f} ms" if gaps else "no shared beats"),
                            (not gaps) or float(np.median(gaps)) <= 5.0)
    return R


def tone(y, sr):
    """Tilt (dB an octave, 125 Hz-8 kHz), and the 2-5 and 5-16 kHz bands against the whole, of a
    mix: the same arithmetic as elements_review.analyse_file, which measured the owner's deck."""
    import elements_review as ER
    mono = np.asarray(y, float).mean(axis=1) if np.ndim(y) == 2 else np.asarray(y, float)
    n = 8192
    m = ER.stft_mag(mono, n, 2048)
    pw = (m ** 2).mean(axis=0)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    tot = pw.sum()
    return dict(tilt=round(ER.tilt(pw, freqs), 2), b2_5k=round(ER.band_db(pw, freqs, 2000, 5000, tot), 1),
                b5_16k=round(ER.band_db(pw, freqs, 5000, 16000, tot), 1))


def _level_curve(x, sr, win=1.0):
    h = int(win * sr)
    k = len(x) // h
    if k < 2:
        return np.zeros(0)
    seg = x[: k * h].reshape(k, h, -1) if x.ndim == 2 else x[: k * h].reshape(k, h)
    return 10 * np.log10((seg ** 2).mean(axis=tuple(range(1, seg.ndim))) + 1e-12)


def audio_readings(band, plans, piece, y):
    """The readings that need the sound: the stems (levels, bands) and the final mix (tone)."""
    from dsp import SR
    import options as O
    import mix as X
    R = {}
    st = getattr(band, "stems", None) or {}
    t_end = plans[-1].t0
    n_end = int(t_end * SR)
    live = {b: s[:n_end] for b, s in st.items() if np.abs(s).max() > 1e-7}
    piano = sum((s for b, s in live.items() if b in X.PIANO_BUSES), np.zeros((n_end, 2)))
    sus = sum((s for b, s in live.items() if b in SUSTAIN), np.zeros((n_end, 2)))
    if np.abs(sus).max() > 1e-7 and np.abs(piano).max() > 1e-7:
        a, b = _level_curve(piano, SR), _level_curve(sus, SR)
        ok = (a > a.max() - 40) & (b > b.max() - 40)
        r = float(np.corrcoef(a[ok], b[ok])[0, 1]) if ok.sum() > 2 and a[ok].std() > 0.1 and b[ok].std() > 0.1 else float("nan")
        gap = float(np.median(a[ok] - b[ok])) if ok.any() else float("nan")
        R["levels-together"] = (f"{r:+.2f}" if r == r else "too steady to correlate", not (r == r) or r >= 0.5)
        R["level-gap"] = (f"piano {gap:+.1f} dB over the held layer", abs(gap) <= 6.0)
    # who owns the 2-6 kHz band (the ear's most sensitive): no held layer above ~40 %
    from dsp import butter
    owned = {}
    tot = 0.0
    for b_, s in live.items():
        e = float((butter(s.mean(axis=1), "bandpass", (2000, 6000), 2) ** 2).sum())
        owned[b_] = e
        tot += e
    if tot > 0:
        top = max((b_ for b_ in owned if b_ in SUSTAIN or b_ in BOWED), key=lambda k: owned[k], default=None)
        share = owned[top] / tot if top else 0.0
        R["held-2-6k-share"] = (f"{100 * share:.0f} % ({top or 'none'})", share <= 0.40)
    # one room: the sends every sounding bus gets
    if O.get("room", piece) == "shared":
        R["one-room"] = (f"shared: hall {X.HALL['piano']:g}, room {X.ROOM['piano']:g} on every layer", True)
    else:
        sends = sorted({(X.HALL.get(b_, 0.25), X.ROOM.get(b_, 0.05)) for b_ in live if b_ != "sub"})
        R["one-room"] = (f"{len(sends)} different sends: {sends}", len(sends) <= 1)
    if y is not None:
        tn = tone(y[: int(piece.length * SR)], SR)
        R["tone"] = (f"tilt {tn['tilt']:g} dB/oct, 2-5 kHz {tn['b2_5k']:g}, 5-16 kHz {tn['b5_16k']:g} dB",
                     -12.0 <= tn["tilt"] <= -8.0 and -60.0 <= tn["b5_16k"] <= -48.0)
    return R


MEANING = {
    "tune-in-harmony": "held tune notes (1.5 beats or longer) that are tones of the chord under them",
    "tune-in-bed": "held tune notes whose pitch is also sounding lower in the bed (the tune grows out of it)",
    "above-tune": "tune notes with another layer sounding above them (the tune is the top voice: 0)",
    "tune-duty": "how much of the body the tune sounds (accepted pieces 55-66 %; 'thrown in' clips 12-43 %)",
    "layers-per-bar": "layers with notes in one bar (tune, pulse, bass, held layer...; at most 3-4)",
    "struck-together": "a tune note and the bed notes on the same beat, ms apart (one pair of hands: <= 5)",
    "levels-together": "1-second level curves of the piano and the held layer (accepted +0.76/+0.81; rejected <= 0)",
    "level-gap": "the piano over the held layer, median dB (close: within about 6)",
    "held-2-6k-share": "the held layer's share of 2-6 kHz (strings owned 69-100 % when rejected; <= 40 %)",
    "one-room": "the reverb sends of every sounding layer (one room = one send)",
    "tone": "the mix's tone (the owner's 'middle': tilt -10, 5-16 kHz -55; 'dark' was -79)",
}


def rows(band, plans, piece, y=None):
    R = notes_readings(band, plans, piece)
    if y is not None and getattr(band, "stems", None):
        R.update(audio_readings(band, plans, piece, y))
    out = []
    for k, (v, near) in R.items():
        out.append(dict(id=k, group="unity", value=v, target="read it next to the shelf (render.sh --shelf)",
                        ok=True, near=bool(near), meaning=MEANING.get(k, ""), detail="", calibrated=False))
    return out
