"""Elements review (2026-11-25): measure every round of music the owner heard, and render
one-element-at-a-time comparison clips for his listening deck.

WHY this file exists: nobody composing for youcoded can hear. Earlier rounds judged music by
gauges built into the composing tools, so the gauges measured what the tools already did. This
file measures the DELIVERED audio (and the films' pictures) from the outside, the same way for
every round, so rounds he liked and rounds he rejected can be compared on one scale. It also
renders A/B clips that differ in exactly one musical element, so his ear (the only real judge)
can rule on elements instead of on whole scores.

Subcommands (run with the felt-and-pulse venv python, -I):
  analyse <out.json> <label=path> ...     audio measurements per file
  picture <video> <out.json>              when things change on screen (frame differences)
  samples <out_dir>                       render the element A/B clips (needs the songbook src)

Only numpy, scipy, soundfile and pyloudnorm (librosa is not installed here), so onset and
pitch measures are simple and stated plainly in the report; treat them as evidence, not truth.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

import numpy as np

SR = 44100


# ---------------------------------------------------------------- decoding

def decode(path: str, sr: int = SR, t0: float = 0.0, dur: float | None = None) -> np.ndarray:
    """Any audio or video file to float stereo (n, 2) via ffmpeg."""
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t0)]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, "-vn", "-ac", "2", "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


# ---------------------------------------------------------------- spectral helpers

def stft_mag(x: np.ndarray, n: int = 4096, hop: int = 512) -> np.ndarray:
    win = np.hanning(n)
    frames = 1 + max(0, (len(x) - n) // hop)
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(x[idx] * win, axis=1))


def onsets(mono: np.ndarray, sr: int = SR) -> tuple[np.ndarray, np.ndarray, float]:
    """Onset times by log-spectral flux with an adaptive threshold.
    WHY log flux on 1024-point frames: soft felt-piano attacks are small in level but clear as
    new energy across the spectrum; log compression keeps quiet notes from being missed."""
    hop, n = 256, 1024
    m = stft_mag(mono, n, hop)
    lm = np.log1p(100 * m)
    flux = np.maximum(0, np.diff(lm, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    fr = sr / hop
    from scipy.ndimage import median_filter, maximum_filter
    base = median_filter(flux, size=int(fr * 0.5)) + 0.25 * np.median(flux) + 1e-9
    peaks = (flux == maximum_filter(flux, size=int(fr * 0.06))) & (flux > 1.6 * base)
    times = np.nonzero(peaks)[0] / fr
    strengths = flux[peaks]
    # drop the weakest 10 % of picks relative to the loudest (reverb shimmer)
    if len(strengths):
        keep = strengths > 0.08 * np.percentile(strengths, 95)
        times, strengths = times[keep], strengths[keep]
    return times, strengths, fr


def tempo_from_onsets(times: np.ndarray, lo: float = 60, hi: float = 180) -> tuple[float, float]:
    """Best beat period by scoring a comb of candidate tempi against onset phases.
    Returns (bpm, fraction of onsets within 40 ms of that grid at its best phase)."""
    if len(times) < 6:
        return 0.0, 0.0
    best = (0.0, -1.0, 0.0)
    for bpm in np.arange(lo, hi, 0.25):
        # WHY eighth-note grid: our pulses are mostly eighths; scoring on beats alone would
        # call every eighth-note piece "half on grid".
        per = 60.0 / bpm / 2
        ph = (times % per) / per * 2 * np.pi
        r = np.abs(np.mean(np.exp(1j * ph)))
        if r > best[1]:
            best = (bpm, r, np.angle(np.mean(np.exp(1j * ph))))
    bpm, r, ang = best
    per = 60.0 / bpm / 2
    phase = (ang / (2 * np.pi)) * per
    dev = ((times - phase + per / 2) % per) - per / 2
    on = float(np.mean(np.abs(dev) < 0.04))
    return float(bpm), on


def band_db(spec_pow: np.ndarray, freqs: np.ndarray, lo: float, hi: float, total: float) -> float:
    sel = (freqs >= lo) & (freqs < hi)
    return float(10 * np.log10(spec_pow[sel].sum() / total + 1e-12))


def tilt(spec_pow: np.ndarray, freqs: np.ndarray) -> float:
    """dB per octave slope of octave-band power from 125 Hz to 8 kHz (more negative = darker)."""
    cs = [125 * 2 ** k for k in range(7)]
    vals = []
    for c in cs:
        sel = (freqs >= c / np.sqrt(2)) & (freqs < c * np.sqrt(2))
        vals.append(10 * np.log10(spec_pow[sel].sum() + 1e-12))
    return float(np.polyfit(np.arange(len(cs)), vals, 1)[0])


def pitch_profile(mono: np.ndarray, sr: int = SR) -> dict:
    """Rough note content from spectral peaks (MIDI 36-96): register, the highest prominent note,
    pitch-class spread, and how fast the harmony moves (chroma change per second)."""
    n, hop = 8192, 2048
    m = stft_mag(mono, n, hop)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    midi = 69 + 12 * np.log2(np.maximum(freqs, 1) / 440)
    sel = (midi >= 35.5) & (midi < 96.5)
    mm = np.round(midi[sel]).astype(int)
    pw = m[:, sel] ** 2
    piano_roll = np.zeros((len(m), 61))
    for k in range(61):
        piano_roll[:, k] = pw[:, mm == 36 + k].sum(axis=1)
    loud = piano_roll.sum(axis=1)
    active = loud > 0.01 * np.percentile(loud, 95)
    pr = piano_roll[active]
    if not len(pr):
        return {}
    w = pr.sum(axis=0)
    centre = float((np.arange(61) + 36) @ w / w.sum())
    # highest note holding at least 5 % of its frame's peak energy
    tops = []
    for row in pr:
        ks = np.nonzero(row > 0.05 * row.max())[0]
        tops.append(36 + ks.max())
    chroma = np.zeros((len(m), 12))
    for k in range(61):
        chroma[:, (36 + k) % 12] += piano_roll[:, k]
    ch = chroma[active]
    tot = ch.sum(axis=0)
    pc = tot / tot.sum()
    names = "C Db D Eb E F Gb G Ab A Bb B".split()
    order = np.argsort(-pc)
    # harmony movement: cosine distance between consecutive ~1 s chroma blocks
    blk = max(1, int(round(1.0 / (hop / sr))))
    blocks = [ch[i:i + blk].sum(axis=0) for i in range(0, len(ch) - blk + 1, blk)]
    moves = 0
    for a, b in zip(blocks, blocks[1:]):
        cos = a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)
        if cos < 0.85:
            moves += 1
    secs = len(ch) * hop / sr
    return {
        "register_centre_midi": round(centre, 1),
        "top_note_median_midi": float(np.median(tops)),
        "top_note_p90_midi": float(np.percentile(tops, 90)),
        "pitch_classes_top5": [f"{names[i]} {pc[i]*100:.0f}%" for i in order[:5]],
        "pc_entropy_bits": round(float(-(pc * np.log2(pc + 1e-12)).sum()), 2),
        "harmony_moves_per_10s": round(10 * moves / max(secs, 1e-6), 2),
    }


def self_similarity(mono: np.ndarray, sr: int = SR, win: float = 2.0) -> dict:
    """How much each 2-s stretch resembles the stretches before it (chroma + loudness),
    the simple measure behind "repetitive" (high everywhere) and "a different song every
    few seconds" (low, with sharp drops)."""
    n, hop = 8192, 2048
    m = stft_mag(mono, n, hop)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    midi = 69 + 12 * np.log2(np.maximum(freqs, 1) / 440)
    sel = (midi >= 35.5) & (midi < 96.5)
    pcs = (np.round(midi[sel]).astype(int)) % 12
    pw = m[:, sel] ** 2
    chroma = np.stack([pw[:, pcs == k].sum(axis=1) for k in range(12)], axis=1)
    blk = int(round(win / (hop / sr)))
    vec = []
    for i in range(0, len(chroma) - blk + 1, blk):
        v = chroma[i:i + blk].sum(axis=0)
        vec.append(v / (np.linalg.norm(v) + 1e-12))
    vec = np.array(vec)
    if len(vec) < 3:
        return {}
    sim_prev = [float(vec[i] @ vec[i - 1]) for i in range(1, len(vec))]
    # recurrence: best match to any block at least 4 s earlier
    rec = []
    for i in range(2, len(vec)):
        rec.append(float(np.max(vec[:i - 1] @ vec[i])))
    drops = int(np.sum(np.array(sim_prev) < 0.80))
    return {
        "next_block_similarity_mean": round(float(np.mean(sim_prev)), 3),
        "sharp_changes_per_30s": round(30 * drops / (len(sim_prev) * win), 2),
        "recurrence_mean": round(float(np.mean(rec)) if rec else 0.0, 3),
    }


def attack_sharpness(mono: np.ndarray, times: np.ndarray, sr: int = SR) -> float:
    """Median 10-90 % rise time (ms) of the high-passed envelope after each onset; short = hard,
    clicky attacks, long = soft felt or bowed attacks."""
    from scipy.signal import butter, sosfilt
    sos = butter(2, 1500, "hp", fs=sr, output="sos")
    env = np.abs(sosfilt(sos, mono))
    k = int(sr * 0.002)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    rises = []
    for t in times:
        a = int(max(0, (t - 0.02) * sr))
        b = int(min(len(env), (t + 0.08) * sr))
        seg = env[a:b]
        if len(seg) < 10 or seg.max() <= 0:
            continue
        lo = seg[: int(0.02 * sr)].min() if int(0.02 * sr) < len(seg) else seg.min()
        pk = int(np.argmax(seg))
        rng = seg[pk] - lo
        if rng <= 0:
            continue
        s10 = np.nonzero(seg[: pk + 1] >= lo + 0.1 * rng)[0]
        s90 = np.nonzero(seg[: pk + 1] >= lo + 0.9 * rng)[0]
        if len(s10) and len(s90):
            rises.append((s90[0] - s10[0]) / sr * 1000)
    return float(np.median(rises)) if rises else float("nan")


def loudness_curve(x: np.ndarray, sr: int = SR) -> dict:
    import pyloudnorm as pyln
    meter = pyln.Meter(sr)
    integ = meter.integrated_loudness(x) if len(x) > sr * 0.5 else float("nan")
    # short-term (3 s) and momentary (0.4 s) loudness every 0.1 s
    st, mo = [], []
    step = int(0.1 * sr)
    for i in range(0, len(x) - int(0.4 * sr), step):
        seg = x[i:i + int(0.4 * sr)]
        # plain RMS level (not gated LUFS): a 0.4 s window is too short for the gated measure
        mo.append(10 * np.log10(np.mean(seg ** 2) + 1e-12))
    for i in range(0, len(x) - 3 * sr, step):
        seg = x[i:i + 3 * sr]
        st.append(10 * np.log10(np.mean(seg ** 2) + 1e-12))
    mo = np.array(mo)
    mo = mo[mo > mo.max() - 40] if len(mo) else mo
    swing = []
    for i in range(0, max(0, len(mo) - 10)):
        swing.append(mo[i:i + 10].max() - mo[i:i + 10].min())
    return {
        "lufs": round(float(integ), 1),
        "shortterm_range_db": round(float(np.percentile(st, 95) - np.percentile(st, 10)), 1) if len(st) else None,
        "momentary_swing_1s_median_db": round(float(np.median(swing)), 1) if swing else None,
        "momentary_swing_1s_p90_db": round(float(np.percentile(swing, 90)), 1) if swing else None,
        "shortterm_curve_db": [round(float(v), 1) for v in st[::10]],
    }


def reverb_tail(mono: np.ndarray, sr: int = SR) -> float:
    """Seconds for the very end of the file to fall 30 dB from its last loud moment (rough T30)."""
    env = np.sqrt(np.convolve(mono ** 2, np.ones(int(0.05 * sr)) / int(0.05 * sr), mode="same")) + 1e-9
    db = 20 * np.log10(env)
    last = len(db) - 1
    # last point within 6 dB of the final 2 s peak
    tail = db[-int(min(len(db), 4 * sr)):]
    pk = int(np.argmax(tail))
    ref = tail[pk]
    after = np.nonzero(tail[pk:] < ref - 30)[0]
    return round(float(after[0] / sr), 2) if len(after) else float("nan")


def analyse_file(path: str, t0: float = 0.0, dur: float | None = None) -> dict:
    x = decode(path, SR, t0, dur)
    mono = x.mean(axis=1)
    side = (x[:, 0] - x[:, 1]) / 2
    res: dict = {"path": path, "seconds": round(len(x) / SR, 2)}
    res.update(loudness_curve(x))
    pk = float(np.max(np.abs(x)))
    res["sample_peak_dbfs"] = round(20 * np.log10(pk + 1e-12), 2)
    res["clipped_samples"] = int(np.sum(np.abs(x) >= 0.9999))
    n = 8192
    m = stft_mag(mono, n, 2048)
    pw = (m ** 2).mean(axis=0)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    tot = pw.sum()
    res["tilt_db_per_oct"] = round(tilt(pw, freqs), 2)
    res["centroid_hz"] = round(float((freqs * pw).sum() / tot), 0)
    res["band_40_250_db"] = round(band_db(pw, freqs, 40, 250, tot), 1)
    res["band_2k_5k_db"] = round(band_db(pw, freqs, 2000, 5000, tot), 1)
    res["band_5k_16k_db"] = round(band_db(pw, freqs, 5000, 16000, tot), 1)
    # brightness over time: centroid per second, its spread
    per_s = []
    hop_s = int(SR / 2048)
    frames = m ** 2
    for i in range(0, len(frames) - hop_s, hop_s):
        f = frames[i:i + hop_s].mean(axis=0)
        if f.sum() > 0:
            per_s.append((freqs * f).sum() / f.sum())
    res["centroid_p10_p90_hz"] = [round(float(np.percentile(per_s, 10))), round(float(np.percentile(per_s, 90)))] if per_s else None
    res["width_side_to_mid_db"] = round(float(10 * np.log10((side ** 2).mean() / ((mono ** 2).mean() + 1e-12) + 1e-12)), 1)
    t, s, _ = onsets(mono)
    res["onsets"] = int(len(t))
    secs = len(mono) / SR
    res["onsets_per_s"] = round(len(t) / secs, 2)
    # how evenly busy: onsets per 2 s window, coefficient of variation
    if len(t):
        counts = np.histogram(t, bins=np.arange(0, secs + 2, 2.0))[0][:-1]
        res["density_per2s_cv"] = round(float(counts.std() / (counts.mean() + 1e-9)), 2)
        res["density_per2s"] = counts.tolist()
        ioi = np.diff(t)
        res["ioi_median_ms"] = round(float(np.median(ioi) * 1000), 0) if len(ioi) else None
        res["ioi_cv"] = round(float(ioi.std() / (ioi.mean() + 1e-9)), 2) if len(ioi) else None
        res["gaps_over_1s"] = int(np.sum(ioi > 1.0))
        bpm, on = tempo_from_onsets(t)
        res["grid_bpm"] = round(bpm, 2)
        res["onsets_on_eighth_grid"] = round(on, 2)
        # loudness spread of attacks (neighbour-to-neighbour jumps in onset strength, dB)
        sd = 20 * np.log10(s + 1e-9)
        res["attack_jump_median_db"] = round(float(np.median(np.abs(np.diff(sd)))), 1) if len(sd) > 1 else None
        res["attack_jump_p90_db"] = round(float(np.percentile(np.abs(np.diff(sd)), 90)), 1) if len(sd) > 1 else None
        res["attack_rise_ms"] = round(attack_sharpness(mono, t), 1)
        res["onset_times"] = [round(float(v), 3) for v in t]
    res.update(pitch_profile(mono))
    res.update(self_similarity(mono))
    res["end_tail_t30_s"] = reverb_tail(mono)
    return res


# ---------------------------------------------------------------- picture

def picture_events(video: str, fps: float = 30.0, w: int = 160) -> dict:
    """Per-frame mean absolute change of a small greyscale copy; visual 'events' are where a
    change starts after stillness (the first frame of a movement), which is what the eye takes
    as the moment something happens."""
    cmd = ["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={w}:-2,format=gray",
           "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height,r_frame_rate", "-of", "json", video],
                           capture_output=True, check=True).stdout
    st = json.loads(probe)["streams"][0]
    W, H = st["width"], st["height"]
    h = int(round(H * w / W / 2) * 2)
    fr = st["r_frame_rate"].split("/")
    fps = float(fr[0]) / float(fr[1])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
    d = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    d = np.concatenate([[0], d])
    # event starts: frame where motion rises above threshold after >= 3 quiet frames
    thr = max(0.15, 0.08 * np.percentile(d, 99))
    moving = d > thr
    starts = []
    quiet = 3
    for i in range(len(d)):
        if moving[i] and i >= quiet and not moving[i - quiet:i].any():
            starts.append(i)
    return {"fps": fps, "frames": len(d), "motion": [round(float(v), 3) for v in d],
            "event_starts_s": [round(i / fps, 3) for i in starts], "threshold": round(float(thr), 3)}


def align(events: list[float], onset_times: list[float], window: float = 0.25) -> dict:
    """For each visual event, the nearest musical onset and its offset (+ = music late)."""
    on = np.array(onset_times)
    rows = []
    for e in events:
        if not len(on):
            break
        k = int(np.argmin(np.abs(on - e)))
        rows.append(round(float(on[k] - e) * 1000))
    rows = np.array(rows)
    if not len(rows):
        return {}
    caught = np.sum((rows >= -15) & (rows <= 45))
    near = np.sum(np.abs(rows) <= 100)
    early = np.sum((rows < -15) & (rows > -window * 1000))
    return {"events": len(rows), "offsets_ms": rows.tolist(),
            "caught_-15_+45ms": int(caught), "within_100ms": int(near),
            "music_early_by_15_250ms": int(early),
            "median_abs_offset_ms": float(np.median(np.abs(rows)))}


# ---------------------------------------------------------------- element samples
#
# WHY one shared base and ONE change per variant: the owner can't name musical elements, but he
# can hear two clips side by side. If two clips differ in more than one way, his "this one" can't
# be turned into a rule. Every variant below is the base piece with a single switch moved, and
# the run checks the note lists to prove what changed (same notes = a sound-only change).
#
# The songbook source is taken from ER_SONGBOOK_SRC (a pinned copy), because the live toolkit is
# being rebuilt by another team while this runs.

BASE_CHORDS = "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Bb9sus Ebmaj9 Ebmaj9 Cm9 Cm9"
WORDS_REL = os.path.join("film", "src", "round2", "take1-words-lily.json")
VOICE_REL = os.path.join("film", "public", "audio", "voice-take1-lily.wav")


def _sb():
    src = os.environ["ER_SONGBOOK_SRC"]
    if src not in sys.path:
        # the same two paths build.py puts first (engine/ holds dsp, sounds, master, options)
        sys.path.insert(0, os.path.join(src, "engine"))
        sys.path.insert(0, src)
    import recipes as R
    return R


def _campaign_root():
    # .../scripts/campaign/sound/songbook/src -> .../scripts/campaign
    return os.path.normpath(os.path.join(os.environ["ER_SONGBOOK_SRC"], "..", "..", ".."))


def base_piece(name, bpm=108.0, bars=8, chords=BASE_CHORDS, tune=((3, "cell"), (7, "cell")), changes=(),
               cycles=(), peak=None, lift=(0, 0.0), logo="none", ending="short", loudness=-16.0,
               pool=("Bb4", "G4", "F4", "Eb4"), mask="x.xxx.x.x.xxx.x.", ptouch=0.40, owner=None,
               sound=None, start=("sustain", "pulse"), seed=5, tail=2.2):
    """The base: an even, two-chords-per-4-bars bed with the cell twice (the brand's default
    texture), built straight from the recipe builder so every switch is reachable."""
    R = _sb()
    o = R.owner(owner or {})
    land = R.land_after(bars, bpm, ending)
    # WHY shine "capped" as the base: with shine off (the rebuild's default) the felt piano carries
    # almost nothing above 5 kHz (measured -79 dB re the total, against -35 for the round-8 piece the
    # owner liked); comparing every OTHER element on a muffled base would bias every answer.
    # The brightness element compares off / capped / round 7 explicitly.
    sound = dict(dict(piano_shine="capped"), **(sound or {}))
    return R._build("app-demo", name, land + tail, land, bpm, chords=chords, default_chords=None,
                    tune=list(tune), changes=list(changes), cycles=list(cycles), peak=peak, lift=lift,
                    seed=seed, odd=0, logo=logo, ending=ending, loudness=loudness, touch=0.88,
                    pulse=R._pulse(o, pool, mask, ptouch), sustain_cfg=dict(sustain=o["sustain"], start=start),
                    o=o, sound=sound or {}, rit=1.0 if ending == "short" else R.RIT)


def narr_piece(name, bpm, words_path, t_to=11.2, pre=1.5, tail_bars=2, owner=None, sound=None):
    """Recipe C under the narrator's first two sentences at a chosen tempo."""
    R = _sb()
    import films
    sp = films.speech_from_words(words_path, 0.0, t_to=t_to, start_at=pre)
    last = sp.words[-1][2]
    spb = 60.0 / bpm
    bars = int(np.ceil((last + 0.5) / (4 * spb))) + tail_bars
    land = R.land_after(bars, bpm, "sigh")
    p = R.narrated(name, land + 2.0, land=land, speech=sp, bpm=bpm, turn=None, logo="quiet", seed=11,
                   owner_over=owner or {}, sound=dict(dict(piano_shine="capped"), **(sound or {})))
    return p


def _render_job(job):
    """One variant in its own process (patches stay local): returns the note log and paths."""
    key, kind, kw, patch, out_dir = job
    os.environ.setdefault("SONGBOOK_NO_COPY", "1")
    _sb()
    import build
    import mix as X
    import soundfile as sf
    from dsp import SR as SSR
    if patch.get("hall"):
        # WHY patched here and not as a switch: the toolkit has no send-level switch for its hall;
        # scaling every bus's send is the one-element change "more or less room"
        for k in list(X.HALL):
            X.HALL[k] = X.HALL[k] * patch["hall"]
    if patch.get("swing"):
        import moods
        moods.MOODS["bed"]["swing"] = patch["swing"]
    if kind == "base":
        p = base_piece(key, **kw)
    elif kind == "narr":
        p = narr_piece(key, **kw)
    else:
        raise ValueError(kind)
    raw, band, plans, gains = build.render(p)
    y = X.finish_piece(X.premaster_music(raw, plans, p), p)
    path = os.path.join(out_dir, key + ".wav")
    sf.write(path, y, SSR, subtype="PCM_24")
    log = [(round(n["t"], 3), n["m"], n["role"] if "role" in n else n.get("bus"), round(n["vel"], 3))
           for n in band.log]
    return key, path, log, float(p.land_time())


def widen_pauses(words_path, voice_path, out_words, out_voice, after=("technology.", "data."), to=1.1, t_to=11.2):
    """The narrator with her sentence-end breaths given back: the 0.4 s caps become `to` seconds.
    WHY: the recording was tightened (every pause capped at 0.4 s, sped up 1.12x), which leaves the
    music nowhere to speak; this tests whether room in the read, not the music, is what's missing."""
    import soundfile as sf
    words = json.load(open(words_path))
    v, sr = sf.read(voice_path, dtype="float64", always_2d=True)
    v = v[: int(t_to * sr)]
    pieces, cur, shift, new = [], 0, 0.0, []
    for i, w in enumerate(words):
        if w["start"] >= t_to:
            break
        new.append(dict(w, start=w["start"] + shift, end=w["end"] + shift))
        if w["w"] in after and i + 1 < len(words):
            gap = words[i + 1]["start"] - w["end"]
            cut = int((w["end"] + gap / 2) * sr)
            pieces.append(v[cur:cut])
            add = max(0.0, to - gap)
            pieces.append(np.zeros((int(add * sr), v.shape[1])))
            cur = cut
            shift += add
    pieces.append(v[cur:])
    sf.write(out_voice, np.concatenate(pieces), sr, subtype="PCM_24")
    json.dump(new, open(out_words, "w"))
    return shift


def jobs_for(out_dir, words_path):
    """Every element's variants: (key, kind, kwargs, patch). Keys are <element>-<variant>."""
    J = []

    def b(key, patch=None, **kw):
        J.append((key, "base", kw, patch or {}, out_dir))

    def n(key, patch=None, **kw):
        J.append((key, "narr", kw, patch or {}, out_dir))
    # tempo against the narrator (her words carry their own pace; the music's beat is the variable)
    for bpm in (96, 120, 144):
        n(f"tempo-{bpm}", bpm=float(bpm), words_path=words_path)
    n("tempo-120-breaths", bpm=120.0, words_path=os.path.join(out_dir, "words-breaths.json"), t_to=13.5)
    # the pulse
    b("pulse-none", start=("sustain",))
    b("pulse-steady")
    b("pulse-lilt", patch=dict(swing=0.035))
    b("pulse-chord", owner=dict(pulse="chord"))
    # how busy
    b("busy-sparse", mask="x...x...x...x...")
    b("busy-medium")
    b("busy-full", mask="xxxxxxxxxxxxxxxx",
      cycles=[_cycle("Bb5/0.5 G5/1", 7, 1, "c1"), _cycle("F5/1 D5/1", 9, 3, "c2")])
    # piano tone and touch
    b("piano-soft", ptouch=0.28)
    b("piano-firm", ptouch=0.58)
    b("piano-salamander", ptouch=0.28, sound=dict(piano="salamander"))
    b("piano-vcsl", ptouch=0.28, sound=dict(piano="vcsl-upright"))
    # brightness of the mix
    b("bright-dark", sound=dict(piano_shine="off"))          # the rebuild's default today
    b("bright-today")                                         # the base: shine capped
    b("bright-round7", sound=dict(piano_shine="as-written", air_db=11.0, air_policy="as-written"))
    # space
    b("space-dry", patch=dict(hall=0.3))
    b("space-today")
    b("space-big", patch=dict(hall=2.4))
    # chord colour
    b("chords-plain", owner=dict(chords="plain"))
    b("chords-rich")
    b("chords-borrowed", chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abm Bb9sus Bb9sus Ebmaj9 Ebmaj9 Cm9 Cm9")
    # the tune: how often
    b("tune-none", tune=())
    b("tune-once", tune=((5, "cell"),))
    b("tune-twice")
    b("tune-every-bar", tune=tuple((k, "cell-on") for k in range(1, 9)))
    # the held layer
    b("held-none", start=("pulse",))
    b("held-pad")
    b("held-strings", owner=dict(sustain="held"))
    b("held-ring", owner=dict(sustain="ring"))
    # the lift at the payoff (bar 7 of 10)
    pk = 6 * 4 * 60 / 108.0 + 0.01
    b("lift-flat", bars=10, tune=((3, "cell"), (7, "cell")), peak=pk)
    b("lift-tune", bars=10, tune=((3, "cell"), (7, "from-top")), peak=pk, changes=((7, "peak"),))
    b("lift-full", bars=10, tune=((3, "cell"), (7, "from-top")), peak=pk, lift=(2, 2.5),
      changes=((7, "in", "held"), (7, "peak")))
    # endings
    b("end-blend", ending="sigh", logo="blend")
    b("end-quiet", ending="sigh", logo="quiet")
    b("end-piano", ending="sigh", logo="piano")
    b("end-stop", ending="short", logo="none")
    # same brand, different pieces (each a different film's sketch with the shared fingerprint)
    b("family-type", bpm=96.0, bars=4, chords="Cm9 Fm9 Abmaj9 Ebmaj9", tune=((1, "cell-on"),),
      mask="xxxxxxxxxxxxxxxx", ptouch=0.36, ending="sigh", logo="quiet", start=("sustain", "pulse"))
    b("family-demo", bpm=116.0, bars=10, chords="Ebmaj9 Ebmaj9 Abmaj9 Abmaj9 Cm9 Cm9 Bb9sus Bb9sus Ebmaj9 Ebmaj9",
      tune=((3, "cell"), (5, "answer"), (9, "from-top")), pool=("Bb4", "Eb5", "F4", "G4"),
      cycles=[_cycle("Bb5/0.5 G5/1", 23, 5, "c1")], changes=((5, "in", "c1"), (9, "in", "held"), (9, "peak")),
      peak=8 * 4 * 60 / 116.0 + 0.01, lift=(2, 2.0), ending="sigh", logo="blend")
    b("family-hush", bpm=84.0, bars=6, chords="Cm9 Cm9 Abmaj9 Abmaj9 Fm9 Bb9sus", tune=((3, "falls"),),
      mask="x...x...x...x...", ptouch=0.30, owner=dict(sustain="ring"), patch=dict(hall=1.6),
      ending="sigh", logo="piano")
    b("family-bright", bpm=126.0, bars=10, chords="Ebadd9 Ebadd9 Cm9 Cm9 Abmaj9 Abmaj9 Bbsus4 Bbsus4 Ebadd9 Ebadd9",
      tune=((1, "cell"), (3, "climb"), (5, "cell"), (7, "higher")), mask="x.xxx.xxx.xxx.xx",
      owner=dict(sustain="held"), patch=dict(swing=0.02), ending="sigh", logo="blend")
    return J


def _cycle(cell, period, offset, name):
    _sb()
    from cycles import Cycle
    return Cycle(cell, period=period, offset=offset, name=name)


def compare_logs(a, b):
    """How two variants' notes differ: same count, same start times, same pitches, same touch."""
    ta = sorted((t, m) for t, m, _, _ in a)
    tb = sorted((t, m) for t, m, _, _ in b)
    same_times = sorted(t for t, _ in ta) == sorted(t for t, _ in tb)
    same_notes = ta == tb
    va = sorted(v for *_, v in a)
    vb = sorted(v for *_, v in b)
    return dict(notes=(len(a), len(b)), same_times=same_times, same_pitches=same_notes,
                same_touch=(va == vb))


def run_samples(out_dir, procs=12):
    """Render every variant in parallel, then measure each and compare it with its element's
    reference variant. Writes out_dir/samples.json."""
    from multiprocessing import get_context
    os.makedirs(out_dir, exist_ok=True)
    root = _campaign_root()
    wp, vp = os.path.join(root, WORDS_REL), os.path.join(root, VOICE_REL)
    widen_pauses(wp, vp, os.path.join(out_dir, "words-breaths.json"), os.path.join(out_dir, "voice-breaths.wav"),
                 t_to=11.2)
    jobs = jobs_for(out_dir, wp)
    only = os.environ.get("ER_ONLY")
    if only:
        jobs = [j for j in jobs if any(j[0].startswith(o) for o in only.split(","))]
    with get_context("fork").Pool(procs, maxtasksperchild=1) as pool:
        done = {}
        for key, path, log, land in pool.imap_unordered(_render_job, jobs):
            done[key] = dict(path=path, log=log, land=land)
            print("rendered", key, flush=True)
    prev = {}
    if os.path.exists(os.path.join(out_dir, "samples.json")):
        prev = json.load(open(os.path.join(out_dir, "samples.json")))
    prev.update(done)
    json.dump(prev, open(os.path.join(out_dir, "samples.json"), "w"))
    return prev


REFERENCE = {"tempo": "tempo-120", "pulse": "pulse-steady", "busy": "busy-medium", "piano": "piano-soft",
             "bright": "bright-today", "space": "space-today", "chords": "chords-rich", "tune": "tune-twice",
             "held": "held-pad", "lift": "lift-flat", "end": "end-blend", "family": None}


def _lufs(x, sr=SR):
    import pyloudnorm as pyln
    return pyln.Meter(sr).integrated_loudness(x)


def finish_samples(work, dest, target=-16.0):
    """Trim, add the narrator where needed, level-match every clip to the same loudness (so a
    'brighter' or 'busier' clip is not simply louder), fade, write mp3, and measure. WHY matched
    loudness: listeners pick the louder of two otherwise equal clips as 'better' or 'brighter'."""
    import soundfile as sf
    meta = json.load(open(os.path.join(work, "samples.json")))
    root = _campaign_root()
    os.makedirs(dest, exist_ok=True)
    report = {}
    for key, m in sorted(meta.items()):
        # WHY sr from the file: the songbook renders at its own rate (48 kHz), the analysis at 44.1
        y, sr = sf.read(m["path"], dtype="float64", always_2d=True)
        el = key.split("-")[0]
        if el == "tempo":
            vpath = os.path.join(work, "voice-breaths.wav") if key.endswith("breaths") else os.path.join(root, VOICE_REL)
            v, vsr = sf.read(vpath, dtype="float64", always_2d=True)
            v = v[: int((13.5 if key.endswith("breaths") else 11.2) * vsr)]
            if vsr != sr:
                from scipy.signal import resample_poly
                v = resample_poly(v, sr, vsr, axis=0)
            if v.shape[1] == 1:
                v = np.repeat(v, 2, axis=1)
            # her voice at -16 LUFS, the music as the recipe set it (-6 dB under her words)
            v *= 10 ** ((-16.0 - _lufs(v, sr)) / 20)
            yl = y * 10 ** ((-16.0 - 4.0 - _lufs(y, sr)) / 20)
            start = int(1.5 * sr)
            n = max(len(yl), start + len(v))
            mixd = np.zeros((n, 2))
            mixd[: len(yl)] += yl
            mixd[start:start + len(v)] += v
            y = mixd
        if el == "lift":
            y = y[int(4 * 2 * 60 / 108.0 * sr):]
        if el == "end":
            y = y[-int(11.0 * sr):]
        y = y[: int(21.0 * sr)]
        fade = int(0.6 * sr)
        if key.split("-")[0] not in ("end", "family") and len(y) >= int(21.0 * sr) - 1:
            y[-fade:] *= np.linspace(1, 0, fade)[:, None]
        g = target - _lufs(y, sr)
        y = y * 10 ** (g / 20)
        pk = np.abs(y).max()
        if pk > 0.89:                           # keep true-peak headroom after level matching
            y *= 0.89 / pk
        tmp = os.path.join(work, key + "-final.wav")
        sf.write(tmp, y, sr, subtype="PCM_24")
        mp3 = os.path.join(dest, key + ".mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-b:a", "192k", mp3], check=True)
        a = analyse_file(mp3)
        r = {k: a.get(k) for k in ("seconds", "lufs", "sample_peak_dbfs", "clipped_samples", "tilt_db_per_oct",
                                   "centroid_hz", "band_5k_16k_db", "width_side_to_mid_db", "onsets_per_s",
                                   "momentary_swing_1s_p90_db", "attack_rise_ms", "grid_bpm")}
        r["silent"] = bool(a["lufs"] < -40)
        ref = REFERENCE.get(el)
        if ref and ref in meta and ref != key:
            r["vs_reference"] = dict(ref=ref, **compare_logs(meta[ref]["log"], m["log"]))
        notes = m["log"]
        dur = max(t for t, *_ in notes) if notes else 1
        r["note_moments_per_s"] = round(len(set(t for t, *_ in notes)) / max(dur, 1e-6), 2)
        report[key] = r
        print(key, json.dumps(r), flush=True)
    json.dump(report, open(os.path.join(dest, "measurements.json"), "w"), indent=1)
    return report


# ---------------------------------------------------------------- CLI

def _cli_analyse(argv: list[str]) -> None:
    out = argv[0]
    res = {}
    for a in argv[1:]:
        label, _, rest = a.partition("=")
        path, t0, dur = rest, 0.0, None
        if "@" in rest:
            path, rng = rest.split("@")
            t0s, durs = rng.split("+")
            t0, dur = float(t0s), float(durs)
        res[label] = analyse_file(path, t0, dur)
        print(label, {k: v for k, v in res[label].items() if k not in ("onset_times", "shortterm_curve_db", "density_per2s", "path")}, flush=True)
    json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "analyse":
        _cli_analyse(sys.argv[2:])
    elif cmd == "picture":
        json.dump(picture_events(sys.argv[2]), open(sys.argv[3], "w"))
    elif cmd == "samples":
        run_samples(sys.argv[2], int(os.environ.get("ER_PROCS", "12")))
    elif cmd == "finish":
        finish_samples(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
