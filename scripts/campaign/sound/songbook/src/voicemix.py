"""THE NARRATOR'S MIX (2026-11-27): her voice's gentle treatment, the voice-to-music level, and the
readings that show how the piano sits under her.

WHY this file: on the round-10 sketches the owner heard "the narrator sounds FAR too loud, against
the music ... lower her voice level a bit and raise the music volume a smidge. piano is also
fighting her voice a bit for attention" (wall of screens) and "her voice is still a bit too
loud/harsh" (storybook). Measured (2026-11-27, the four narrated sketches):
  - her voice stood 15.4-17.3 LU over the music under her (integrated over her speech). Ads and
    documentaries usually sit a music bed about 8-12 LU under the voice. The 16 LU came from the
    worst-window margin check: her read is raw (no levelling), its 400 ms loudness swings 9-15 dB,
    so her softest word set the music's level for the whole film;
  - her raw read peaks 12.6-13.3 dB over its loudness; the consonant peaks are what pokes out;
  - 72-80 % of the music's energy under her sat in her main band (250 Hz-3 kHz), and the wall of
    screens' picked sketch struck 2.3 piano notes a second WHILE she spoke (its high tick, B-flat 5
    and G5: fundamentals 784-932 Hz, right in that band), storybook A 4.3 a second.
So: the voice gets the treatment any narrated mix gets (a gentle levelling compressor, a split-band
de-esser, a small dip where a bright read sounds hard), which lets her sit LOWER without her soft
words dropping into the music; the music is set by one number, the gap, measured over her speech;
and the readings show the attacks under her words.

    prep(v, sr, mode)            her voice, treated ("gentle") or as recorded ("none")
    track(piece, n, sr)          her voice on the piece's clock, treated and at her film level
    levels(piece, y, sr)         (voice gain dB, music gain dB) for the mux
    mux(piece, y, sr)            (voice track, music gain linear): what every mux uses
    margin(piece, y, sr)         the narrator-masked check's (median, worst, worst time) phone-band margin
    readings(band, plans, piece, y)  the dashboard rows (group "voice")

Nothing here moves the music's level per word: one music gain for the whole film (the sections'
hand-set levels still shape it), never a dip on a word.
"""
import numpy as np

VOICE_LUFS = -16.0      # her speech in the film mix (web), integrated over her words
GAP_LU = 10.0           # her speech over the music under her: ads/doc beds sit 8-12 LU under a voice
PREP = "gentle"         # the default treatment for style v4 pieces ("none" = as recorded)
LAST = {}               # what the last prep did (for readings)


def _sr():
    from dsp import SR
    return SR


def _env(x, sr, attack, release, hop=48):
    """RMS envelope on `hop`-sample frames with attack/release smoothing (linear amplitude)."""
    p = x ** 2
    nf = int(np.ceil(len(p) / hop))
    p = np.pad(p, (0, nf * hop - len(p)))
    rms = np.sqrt(p.reshape(nf, hop).mean(axis=1))
    a, r = np.exp(-hop / (attack * sr)), np.exp(-hop / (release * sr))
    e = np.empty(nf)
    v = 0.0
    for i in range(nf):
        c = a if rms[i] > v else r
        v = c * v + (1 - c) * rms[i]
        e[i] = v
    return e


def _per_sample(g, n, hop=48):
    return np.interp(np.arange(n), np.arange(len(g)) * hop + hop / 2, g)


def prep(v, sr=None, mode="gentle"):
    """Her voice, treated the way a narration is mixed (mode "gentle"), or unchanged ("none").
    "gentle", in order, each a standard, mild move:
      1. high-pass 70 Hz (rumble and breath pops, below her voice);
      2. de-esser: the 5-10 kHz band alone is turned down (3:1, at most 5 dB) only where it jumps
         over its own usual level, so the "s" and "t" edges soften and the rest of her is untouched;
      3. levelling compressor: 2.5:1 with a soft knee above her median speaking level, 15 ms /
         180 ms, at most 8 dB (typically 3-5 dB, what a narration usually gets): her loud words come
         down toward her soft ones, so the whole read can sit lower without a soft word dropping
         into the music;
      4. -1.5 dB at 3.4 kHz (Q 1.2): the band where a bright, close read sounds hard.
    Returns the same shape, at the same integrated loudness as the input (the level is set later)."""
    if mode in (None, "none", False, ""):
        return v
    from dsp import biquad, butter
    sr = sr or _sr()
    x = np.asarray(v, float)
    mono = x.ndim == 1
    m = x if mono else x.mean(axis=1)
    if np.abs(m).max() < 1e-9:
        return v
    import pyloudnorm as pyln
    met = pyln.Meter(sr)
    try:
        before = met.integrated_loudness(np.stack([m, m], 1))
    except ValueError:
        before = None
    y = butter(m, "highpass", 70, 2)
    # 2. de-esser on the 5-10 kHz band
    hi = butter(butter(y, "highpass", 5000, 4), "lowpass", 10000, 4)
    e = _env(hi, sr, 0.005, 0.06)
    on = e > e.max() * 1e-3
    if on.any():
        ref = np.percentile(e[on], 75)
        over = 20 * np.log10(np.maximum(e, 1e-12) / ref)
        gr = np.clip(over * (1 - 1 / 3.0), 0, 5.0)
        g = _per_sample(10 ** (-gr / 20), len(y))
        y = y - hi + hi * g
    # 3. levelling compressor
    e = _env(y, sr, 0.015, 0.18)
    on = e > e.max() * 10 ** (-40 / 20)
    if on.any():
        lv = 20 * np.log10(np.maximum(e, 1e-12))
        # WHY the median and 2.5:1 (first try was the 70th percentile at 2:1): measured on her take,
        # that moved her 400 ms swing only 14.8 -> 13.7 dB, too little to let her sit lower
        thr = float(np.percentile(lv[on], 50))
        over = lv - thr
        knee, k = 6.0, 1 - 1 / 2.5
        gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * k, k * (over + knee / 2) ** 2 / (2 * knee)))
        gr = np.minimum(gr, 8.0)
        LAST["compressor_gr_db_median_while_working"] = round(float(np.median(gr[on & (gr > 0.1)])) if (on & (gr > 0.1)).any() else 0.0, 1)
        y = y * _per_sample(10 ** (-gr / 20), len(y))
    # 4. the hard band
    y = biquad(y, "peak", 3400, 1.2, -1.5)
    if before is not None and np.isfinite(before):
        after = met.integrated_loudness(np.stack([y, y], 1))
        if np.isfinite(after):
            y = y * 10 ** ((before - after) / 20)
    return y if mono else np.stack([y] * x.shape[1], axis=1)


def _mode(piece, vm):
    if "prep" in vm:
        return vm["prep"]
    return PREP if getattr(piece, "style", "") == "v4" else "none"


def raw_track(piece, n, sr=None):
    """Her voice as recorded on the piece's clock (Piece.voice_mux: path, t_from, start_at), mono."""
    import soundfile as sf
    sr = sr or _sr()
    vm = getattr(piece, "voice_mux", None)
    if not vm:
        return None
    v, vsr = sf.read(vm["path"], dtype="float64", always_2d=True)
    v = v.mean(axis=1)
    if vsr != sr:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, vsr)
        v = resample_poly(v, sr // g, vsr // g)
    out = np.zeros(n)
    a = int(round(float(vm.get("start_at", 0.0)) * sr))
    b = int(round(float(vm.get("t_from", 0.0)) * sr))
    seg = v[b:b + max(0, n - a)]
    out[a:a + len(seg)] = seg[: max(0, n - a)]
    return out


def _speaking(piece, n, sr, join=0.25):
    """Boolean mask of her speech (words joined across gaps under `join` s)."""
    words = sorted((a, b) for _, a, b in (getattr(getattr(piece, "speech", None), "words", None) or []))
    mask = np.zeros(n, bool)
    cur = None
    for a, b in words:
        if cur and a - cur[1] < join:
            cur[1] = b
            continue
        if cur:
            mask[int(cur[0] * sr):int(cur[1] * sr)] = True
        cur = [a, b]
    if cur:
        mask[int(cur[0] * sr):int(cur[1] * sr)] = True
    return mask


def _lufs(x, sr):
    import pyloudnorm as pyln
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    if len(x) < int(0.5 * sr):
        return float("nan")
    try:
        return float(pyln.Meter(sr).integrated_loudness(x))
    except ValueError:
        return float("nan")


def levels(piece, y, sr=None):
    """(voice gain dB, music gain dB) for the mux. An explicit voice_mux["music_db"] is honoured as
    written (older films, and a hand-set level), with her voice as recorded (gain 0). Otherwise
    her treated speech is set to voice_mux.get("voice_lufs", VOICE_LUFS) and the music so that the
    music under her words sits voice_mux.get("gap_lu", GAP_LU) below her."""
    sr = sr or _sr()
    vm = piece.voice_mux
    if "music_db" in vm and "gap_lu" not in vm:
        return 0.0, float(vm["music_db"])
    n = len(y)
    v = prep(raw_track(piece, n, sr), sr, _mode(piece, vm))
    sp = _speaking(piece, n, sr)
    if sp.sum() < 0.5 * sr:
        return 0.0, float(vm.get("music_db", -10.0))
    v_l = _lufs(v[sp], sr)
    m_l = _lufs(np.asarray(y)[sp], sr)
    want_v = float(vm.get("voice_lufs", VOICE_LUFS))
    gap = float(vm.get("gap_lu", GAP_LU))
    gv = want_v - v_l if np.isfinite(v_l) else 0.0
    gm = (want_v - gap) - m_l if np.isfinite(m_l) else float(vm.get("music_db", -10.0))
    return round(gv, 2), round(gm, 2)


def track(piece, n, sr=None, y=None):
    """Her voice on the piece's clock, treated and at her film level (stereo), or None."""
    sr = sr or _sr()
    vm = getattr(piece, "voice_mux", None)
    if not vm:
        return None
    v = prep(raw_track(piece, n, sr), sr, _mode(piece, vm))
    gv = levels(piece, y, sr)[0] if y is not None else 0.0
    v = v * 10 ** (gv / 20)
    return np.stack([v, v], axis=1)


def mux(piece, y, sr=None):
    """(her voice track (n, 2) on the piece's clock, the music's gain, linear) for a film mux:
    every mux (sketch, delivery, the margin check) uses this one, so what is measured is what is
    heard."""
    sr = sr or _sr()
    gv, gm = levels(piece, y, sr)
    v = prep(raw_track(piece, len(y), sr), sr, _mode(piece, piece.voice_mux)) * 10 ** (gv / 20)
    return np.stack([v, v], axis=1), 10 ** (gm / 20)


def margin(piece, y, sr=None, win=1.67):
    """Her voice over the music in the phone band (300 Hz-8 kHz) over her words, in `win` s
    windows, IN THE MUX THAT IS HEARD (treated voice, levels()): (median dB, worst dB, worst time)."""
    from dsp import butter
    sr = sr or _sr()
    v, gm = mux(piece, y, sr)
    m = np.asarray(y, float) * gm
    band = lambda x: butter(butter(x.mean(axis=1), "highpass", 300, 4), "lowpass", 8000, 4)
    vb, mb = band(v), band(m)
    words = [(a, b) for _, a, b in piece.speech.words]
    res, t, L = [], 0.0, len(m) / sr
    while t + win <= L:
        spoken = sum(max(0.0, min(t + win, b) - max(t, a)) for a, b in words)
        if spoken >= 0.5 * win:
            i, j = int(t * sr), int((t + win) * sr)
            res.append((10 * np.log10(np.mean(vb[i:j] ** 2) + 1e-20) - 10 * np.log10(np.mean(mb[i:j] ** 2) + 1e-20), t))
        t += win / 2
    if not res:
        return None
    d = np.array([x for x, _ in res])
    w = min(res)
    return round(float(np.median(d)), 1), round(w[0], 1), round(w[1], 2)


def _share(x, sr, lo, hi, ref=(40, 16000)):
    from scipy import signal
    f, p = signal.welch(x, sr, nperseg=4096)
    tot = p[(f >= ref[0]) & (f < ref[1])].sum()
    return float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-20)) if tot > 0 else float("nan")


def readings(band, plans, piece, y):
    """The narrator readings (dashboard group "voice"), never a failure: numbers to read.
      voice-gap        her speech over the music under her, LU (beds usually 8-12 under a voice)
      voice-treatment  which treatment, and her loudness swing (400 ms, p90-p10) before and after
      voice-hard       her 2-5 kHz against 200 Hz-2 kHz, dB, as heard
      starts-under-her piano note starts a second while she speaks, and in her pauses
      her-band-share   the share of the music's energy under her that sits in 250 Hz-3 kHz
      touch-under-her  median touch of the piano notes struck under her words vs in her pauses"""
    from dsp import SR as sr
    vm = getattr(piece, "voice_mux", None)
    if not vm or y is None or not getattr(getattr(piece, "speech", None), "words", None):
        return []
    n = len(y)
    sp = _speaking(piece, n, sr)
    if sp.sum() < 0.5 * sr:
        return []
    v, gm = mux(piece, y, sr)
    vm_ = v.mean(axis=1)
    m = np.asarray(y, float).mean(axis=1) * gm
    R = {}
    # WHY the stereo music (not its mono sum): levels() sets the gap on the stereo mix, and a mono
    # sum of a wide mix reads ~1.5 dB quieter
    gap = _lufs(v[sp], sr) - _lufs(np.asarray(y, float)[sp] * gm, sr)
    R["voice-gap"] = (f"{gap:.1f} LU over the music under her", 8.0 <= gap <= 12.0)
    raw = raw_track(piece, n, sr)

    def swing(x):
        w = int(0.4 * sr)
        x = x[sp]
        k = len(x) // w
        if k < 3:
            return float("nan")
        e = 10 * np.log10((x[: k * w].reshape(k, w) ** 2).mean(axis=1) + 1e-12)
        e = e[e > e.max() - 25]
        return float(np.percentile(e, 90) - np.percentile(e, 10))
    R["voice-treatment"] = (f"{_mode(piece, vm)}; 400 ms swing {swing(raw):.1f} -> {swing(vm_):.1f} dB"
                            + (f", levelling {LAST.get('compressor_gr_db_median_while_working', 0):g} dB typical"
                               if _mode(piece, vm) not in (None, "none", False, "") else ""), True)
    hard = _share(vm_[sp], sr, 2000, 5000, (80, 16000)) - _share(vm_[sp], sr, 200, 2000, (80, 16000))
    R["voice-hard"] = (f"2-5 kHz {hard:+.1f} dB re 200 Hz-2 kHz", hard <= -14.0)
    T = piece.land_time()
    t_axis = np.arange(n) / sr
    first = min(a for _, a, _ in piece.speech.words)
    pause = (~sp) & (t_axis < T) & (t_axis > first - 0.5)
    ons = [e for e in band.log if e["t"] < T and e.get("part") == "piano" and not (e.get("canon") or ("",))[0] == "logo"]
    ins = [e for e in ons if sp[min(int(e["t"] * sr), n - 1)]]
    outs = [e for e in ons if pause[min(int(e["t"] * sr), n - 1)]]
    s_sp = sp[: int(T * sr)].sum() / sr
    s_pa = pause.sum() / sr
    rate_in = len(ins) / max(s_sp, 0.1)
    R["starts-under-her"] = (f"{rate_in:.1f}/s while she speaks, {len(outs) / max(s_pa, 0.1):.1f}/s in her pauses",
                             rate_in <= 1.0)
    share = _share(m[sp], sr, 250, 3000)
    R["her-band-share"] = (f"{100 * 10 ** (share / 10):.0f} % of the music under her is in 250 Hz-3 kHz", True)
    if ins:
        ti = float(np.median([e["vel"] for e in ins]))
        to = float(np.median([e["vel"] for e in outs])) if outs else float("nan")
        R["touch-under-her"] = (f"{ti:.2f} under her words, {to:.2f} in her pauses", not (to == to) or ti <= to - 0.04)
    out = []
    for k, (val, near) in R.items():
        out.append(dict(id=k, group="voice", value=val, target="read it; see SONGBOOK 'Under a narrator'", ok=True,
                        near=bool(near), meaning=MEANING.get(k, ""), detail="", calibrated=False))
    return out


MEANING = {
    "voice-gap": "her speech over the music under her, integrated (round 10 sat 15-17 LU: 'FAR too loud'; beds 8-12)",
    "voice-treatment": "her treatment and how much her loudness swings word to word (raw reads swung 9-15 dB)",
    "voice-hard": "her presence band against her body, as heard (round 10 raw: -14 to -15; treated lower is softer)",
    "starts-under-her": "piano notes struck while she speaks (each is a new event pulling the ear; <= about 1 a second)",
    "her-band-share": "how much of the music under her sits where her voice lives (250 Hz-3 kHz)",
    "touch-under-her": "notes under her words played softer (rounder, darker) than in her pauses",
}
