"""The fourteen sounds of the youcoded sound-effects kit, three alternatives each.

Every function returns a MONO signal at 48 kHz, roughly shaped but not yet levelled; build.py
adds the shared close room, the stereo image, the fades and the loudness matching.

House style (the owner's rulings in felt-and-pulse/RULES.md are law):
  - real, soft, close, tactile: paper, felt, fabric, pen, soft keys, leather
  - nothing sweeps in pitch or brightness (no whoosh, zip, riser, thwip)
  - no clacks: hard 2-6 kHz attacks are softened (dsp.soften_transients) and measured
  - no tunes, chords, chimes or bells; any resonance is a material, decaying in < 80 ms
"""
import numpy as np
from pathlib import Path
import dsp
from dsp import SR, secs

HERE = Path(__file__).resolve().parent.parent
SAMPLES = HERE / "samples"
FS = SAMPLES / "freesound"
RPG = SAMPLES / "rpg-audio" / "Audio"
CASINO = SAMPLES / "casino-audio" / "Audio"


def fs(sid, start=None, end=None):
    return dsp.load(FS / f"{sid}.mp3", start, end)


def kenney(folder, name, start=None, end=None):
    return dsp.load(folder / f"{name}.ogg", start, end)


def clean(x, gate_db=-38, hp_hz=90, lp_hz=None, soften=0.0, trim_db=-55, post_ms=40):
    """Common clean-up for recordings: remove rumble, pull the noise floor down, optionally
    soften clacky attacks and darken, then trim silence."""
    y = dsp.hp(x, hp_hz)
    if lp_hz:
        y = dsp.lp(y, lp_hz)
    if soften:
        y = dsp.soften_transients(y, soften)
    if gate_db is not None:
        y = dsp.expander(y, gate_db, 3.0)
    y = dsp.trim(y, trim_db, post_ms=post_ms)
    return dsp.fade(y, 1.0, min(30, post_ms * 0.75))  # WHY: trimming alone leaves a cut edge


def felt_tap(hp_hz=110, lp_hz=None, tail=0.12):
    """The kit's signature touch: one fingertip tap on felt (emapuree 'tap on felt', CC0),
    trimmed to its tap and faded out so it never ends on a cut."""
    t = dsp.hp(fs(848748), hp_hz)
    if lp_hz:
        t = dsp.lp(t, lp_hz)
    t = dsp.trim(t, -42, pre_ms=2, post_ms=tail * 1000)
    t = t * dsp.shape(len(t), [(0, 0), (0.06, 0), (len(t) / SR, -45)])
    t = dsp.fade(t, 1.0, 20)
    return t / np.abs(t).max()


# =====================================================================  helpers
def isolated_hits(x, length=0.10, quiet_before=0.05, quiet_after=0.08, thr_db=-28):
    """Find single, isolated taps in a recording (a key press with nothing around it).

    Returns a list of (onset_seconds, peak_db, bright_ratio) for candidates; callers pick
    the softest-sounding ones (low share of 2-6 kHz energy)."""
    e = 20 * np.log10(dsp.env_follow(dsp.hp(x, 150), 3) + 1e-12)
    e -= e.max()
    on = e > thr_db
    idx = np.flatnonzero(np.diff(on.astype(int)) == 1) + 1
    out = []
    for i in idx:
        a = i - secs(quiet_before)
        b = i + secs(length + quiet_after)
        if a < 0 or b > len(x):
            continue
        if e[a:i - secs(0.004)].max() > thr_db - 6:
            continue
        tail = e[i + secs(length * 0.8): b]
        if tail.size and tail.max() > thr_db:
            continue
        seg = x[i - secs(0.004): i + secs(length)]
        band = dsp.bp(seg, 2000, 6000)
        bright = float((band ** 2).sum() / ((seg ** 2).sum() + 1e-20))
        out.append((i / SR, float(e[i:i + secs(length)].max()), bright))
    return out


def take(x, t, length, pre=0.004):
    return x[secs(t - pre): secs(t + length)]


def humanise(press_pool, total, rate=9.0, seed=1, strength=(0.45, 1.0)):
    """Typing: a stream of presses with human timing and varied strength.

    WHY: identical, evenly spaced presses sound like a machine. People type in bursts (2-5
    keys quickly), with short pauses between words, and press some keys harder than others.
    Softer presses are also slightly darker, as with a real keyboard."""
    r = np.random.default_rng(seed)
    out = np.zeros(secs(total))
    t = 0.12
    word = r.integers(3, 7)
    k = 0
    while t < total - 0.15:
        p = press_pool[r.integers(len(press_pool))]
        s = r.uniform(*strength)
        y = p * s
        if s < 0.7:
            y = dsp.lp(y, 3500 + 4000 * s)
        a = secs(t)
        b = min(len(out), a + len(y))
        out[a:b] += y[: b - a]
        k += 1
        if k >= word:
            t += r.uniform(0.17, 0.30)  # the space between words
            word, k = r.integers(3, 7), 0
        else:
            t += max(0.055, r.normal(1 / rate, 0.022))
    return out


# =====================================================================  1 key-press
def key_env(n, hold=0.006, gone=0.05):
    """A key's life: it bottoms out, then is silent within ~50 ms. WHY: the recordings
    around each press carry the next key and room noise; without this the press sounds
    like a short burst of hiss instead of a key."""
    return dsp.shape(n, [(0, 0), (hold, 0), (gone, -34), (n / SR, -60)])


# Presses chosen by eye from spectrograms: each is one clean key with nothing on top of it.
LAPTOP_KEYS = [0.560, 2.508, 4.172, 7.071, 1.832]   # fredclose 'Soft fast typing on a laptop'
MECH_KEYS = [(378083, 0.158), (389702, 0.238), (389702, 0.392)]  # soft-switch keys


def _key_pool_laptop():
    """Real presses lifted from a soft laptop-typing recording (fredclose, CC0)."""
    x = fs(755218)
    pool = []
    for t in LAPTOP_KEYS:
        y = take(x, t, 0.06, pre=0.003)
        y = dsp.hp(y, 140)
        y = dsp.soften_transients(y, 0.75)
        y = dsp.lp(y, 5000)  # WHY: removes the laptop's thin 7-8 kHz 'tick'
        y = dsp.eq(y, "peak", 320, 4.0, 1.0)  # a little 'thock' body under the cap
        y = y * key_env(len(y))
        y = dsp.fade(y, 0.6, 10)
        pool.append(y / np.abs(y).max())
    return pool


def _key_pool_mech():
    """A soft-switch keyboard: presses from two CC0 recordings of soft keys
    (bigmonmulgrew 'mechanical key soft', suspensiondigital 'Enter Key Soft')."""
    from scipy.signal import resample
    base = []
    for sid, t in MECH_KEYS:
        y = take(fs(sid), t, 0.06, pre=0.003)
        y = dsp.hp(y, 120)
        y = dsp.soften_transients(y, 0.85)
        y = dsp.lp(y, 4200)
        y = dsp.eq(y, "lowshelf", 400, 3.0)
        y = y * key_env(len(y), gone=0.055)
        base.append(y / np.abs(y).max())
    # WHY small resampling: two recordings give only three distinct presses; a +/-3 % speed
    # change makes each a slightly different key, as on a real keyboard (far too small and
    # too short to be heard as a pitch).
    out = []
    for y in base:
        for f in (0.97, 1.0, 1.03):
            z = resample(y, int(len(y) * f))
            out.append(dsp.fade(z / np.abs(z).max(), 0.6, 10))
    return out


def _key_pool_felt(n=8):
    """Synthesised + real: a felt-tipped key. A real tap on felt (emapuree, CC0) gives the
    soft body; a tiny plastic-cap resonance (synth, inharmonic, ~10 ms) says 'key'."""
    felt = dsp.hp(fs(848748), 120)
    pk = int(np.argmax(np.abs(felt)))
    # the felt tap's own rise is ~25 ms; start 8 ms before its peak so the key is immediate
    body = felt[pk - secs(0.008): pk + secs(0.05)]
    body = body * key_env(len(body), hold=0.010, gone=0.05)
    body /= np.abs(body).max()
    pool = []
    for i in range(n):
        r = np.random.default_rng(100 + i)
        sc = r.uniform(0.94, 1.06)
        modes = [(620 * sc, 0.009, 1.0), (1370 * sc, 0.006, 0.55), (2310 * sc, 0.004, 0.25), (3440 * sc, 0.002, 0.10)]
        cap = dsp.modal(modes, 0.04, dsp.felt_mallet(r.uniform(1.6, 2.4)), seed=i)
        cap /= np.abs(cap).max()
        y = np.zeros(secs(0.06))
        y[: len(body)] += 0.8 * body[: len(y)]
        off = secs(0.006)
        y[off: off + len(cap)] += 0.45 * cap[: len(y) - off]
        y = dsp.lp(dsp.hp(y, 150), 4800)
        y = dsp.fade(y, 0.6, 10)
        pool.append(y / np.abs(y).max())
    return pool


KEY_POOLS = {"a": _key_pool_laptop, "b": _key_pool_mech, "c": _key_pool_felt}


def key_press(v):
    pool = KEY_POOLS[v]()
    return pool[0]


def typing_demo(v):
    pool = KEY_POOLS[v]()
    return humanise(pool, 3.0, seed={"a": 3, "b": 5, "c": 8}[v])


# =====================================================================  2 send
def send(v):
    if v == "a":
        # a single card pushed a few centimetres across the table (Kenney casino, CC0)
        x = kenney(CASINO, "card-slide-2", 0.02, 0.24)
        y = clean(x, hp_hz=150, lp_hz=7000, soften=0.8, gate_db=-40)
        return y * dsp.shape(len(y), [(0, 0), (0.12, 0), (len(y) / SR, -30)])
    if v == "b":
        # a soft brush of cotton: the start of a fabric movement (Kenney rpg cloth2, CC0)
        x = kenney(RPG, "cloth2", 0.0, 0.26)
        y = clean(x, hp_hz=180, lp_hz=8000, soften=0.4)
        return y * dsp.shape(len(y), [(0, -6), (0.06, 0), (0.16, -6), (len(y) / SR, -40)])
    # c: the little lift-and-flick at the end of a quiet page turn (SpaceJoe, CC0)
    x = fs(484968, 0.33, 0.48)
    y = clean(x, hp_hz=200, lp_hz=7500, soften=0.85, gate_db=-36)
    return y


# =====================================================================  3 reply-arrives
def reply(v):
    if v == "a":
        # a sheet of paper laid down on the table: a short slide into a soft landing
        x = kenney(CASINO, "card-place-1", 0.08, 0.40)
        y = clean(x, hp_hz=120, lp_hz=6500, soften=0.85)
        return dsp.eq(y, "peak", 350, 3, 0.8)
    if v == "b":
        # two soft fingertip taps on felt, the second lighter: a friendly 'knock knock'
        t = felt_tap()
        y = dsp.place(0.26, [(0.0, t, 1.0), (0.105, dsp.lp(t, 3500), 0.6)])
        return dsp.eq(y, "peak", 260, 3, 0.9)
    # c: a soft leather pouch set down (Kenney rpg dropLeather, CC0)
    x = kenney(RPG, "dropLeather")
    y = clean(x, hp_hz=110, lp_hz=7000, soften=0.5)
    return y[: secs(0.30)] * dsp.shape(secs(0.30), [(0, 0), (0.18, 0), (0.30, -40)])


# =====================================================================  4 appear
def appear(v):
    if v == "a":
        # a card slid into place: brief slide that ends settled (Kenney casino card-slide-8)
        x = kenney(CASINO, "card-slide-8", 0.17, 0.48)
        y = clean(x, hp_hz=140, lp_hz=6500, soften=0.85)
        return y
    if v == "b":
        # a soft fold of cotton landing (Kenney rpg cloth3: the lowest, softest cloth take)
        x = kenney(RPG, "cloth3", 0.03, 0.30)
        y = clean(x, hp_hz=120, lp_hz=7000, soften=0.3)
        return y * dsp.shape(len(y), [(0, 0), (0.15, 0), (len(y) / SR, -36)])
    # c: synthesised soft 'pff' of air under a sheet, with a felt touch as it settles.
    # Fixed filters, no movement in pitch: a puff, not a whoosh.
    n = secs(0.28)
    air = dsp.friction(0.28, 280, 2400, grain_rate=40, grain_depth=0.3, seed=21)
    air *= dsp.shape(n, [(0, -40), (0.035, 0), (0.09, -8), (0.28, -50)])
    air /= np.abs(air).max()
    t = felt_tap()
    return dsp.place(0.28, [(0.0, air, 0.7), (0.012, t, 0.55)])


# =====================================================================  5 change
def change(v):
    if v == "a":
        # a single turn of fabric, like a cloth being flipped over (Kenney rpg cloth1, CC0)
        x = kenney(RPG, "cloth1")
        y = clean(x, hp_hz=130, lp_hz=7500, soften=0.4)
        # WHY: settle the end slightly darker so the brightness only ever moves down
        tail = dsp.lp(y, 2500)
        w = dsp.shape(len(y), [(0, 0), (0.35, 0), (len(y) / SR, -30)])
        mix = np.clip(np.linspace(-0.4, 1.4, len(y)), 0, 1)
        return (y * (1 - 0.6 * mix) + tail * 0.6 * mix) * w
    if v == "b":
        # a soft rustle of cotton clothing (khenshom 'Cotton clothes rustling', CC0)
        x = fs(481075, 0.0, 6.0)
        x = dsp.hp(x, 130)
        e = dsp.env_follow(x, 40)
        # take the strongest single gesture: 0.55 s around the loudest moment
        c = int(np.argmax(e))
        y = x[max(0, c - secs(0.18)): c + secs(0.40)]
        y = dsp.lp(y, 7500)
        y = dsp.soften_transients(y, 0.4)
        return y * dsp.shape(len(y), [(0, -30), (0.12, 0), (0.30, -2), (len(y) / SR, -45)])
    # c: synthesised 'breath and bloom': a warm, soft exhale of air through felt, with a low
    # body underneath. Every filter is FIXED, so nothing glides; the high part fades a little
    # faster than the low part, so the brightness can only settle downward.
    dur = 0.75
    n = secs(dur)
    hi = dsp.friction(dur, 500, 3200, grain_rate=25, grain_depth=0.25, seed=31)
    hi = dsp.lp(hi, 3000)
    lo = dsp.friction(dur, 90, 420, grain_rate=12, grain_depth=0.2, seed=32)
    hi *= dsp.shape(n, [(0, -45), (0.10, 0), (0.35, -4), (dur, -48)]) / np.abs(hi).max()
    lo *= dsp.shape(n, [(0, -45), (0.12, 0), (0.40, -4), (dur, -45)]) / np.abs(lo).max()
    return 0.55 * hi + 0.8 * lo


# =====================================================================  6 move
def move(v):
    if v == "a":
        # a card pushed across a felt table (Kenney casino card-shove-2, CC0)
        x = kenney(CASINO, "card-shove-2", 0.203, 0.52)
        y = clean(x, hp_hz=150, lp_hz=6000, soften=0.85)
        # WHY: darken the last part a little so the card comes to rest, never brightens
        dark = dsp.lp(y, 1500)
        mix = np.clip(np.linspace(-0.5, 1.2, len(y)), 0, 1)
        y = y * (1 - 0.6 * mix) + dark * 0.6 * mix
        return y * dsp.shape(len(y), [(0, 0), (0.18, 0), (len(y) / SR, -30)])
    if v == "b":
        # synthesised: something soft sliding on felt and stopping. Fixed band, gentle grain.
        dur = 0.32
        n = secs(dur)
        f = dsp.friction(dur, 220, 2600, grain_rate=70, grain_depth=0.5, seed=41)
        f *= dsp.shape(n, [(0, -40), (0.04, -2), (0.20, 0), (0.25, -10), (dur, -55)]) / np.abs(f).max()
        t = felt_tap(lp_hz=2500)
        # the buffer runs past the friction so the settling tap can ring out naturally
        return dsp.place(dur + 0.12, [(0, f, 0.8), (0.215, t, 0.35)])
    # c: a hand smoothing a sheet of rough fabric (dynamique 'Rustle of rough fabric', CC0)
    x = fs(617019, 3.0, 12.0)
    x = dsp.hp(x, 130)
    e = dsp.env_follow(x, 60)
    c = int(np.argmax(e))
    y = x[max(0, c - secs(0.12)): c + secs(0.24)]
    y = dsp.soften_transients(dsp.lp(y, 6500), 0.5)
    return y * dsp.shape(len(y), [(0, -30), (0.08, 0), (0.20, -3), (len(y) / SR, -45)])


# =====================================================================  7 grow
def grow(v):
    if v == "a":
        # a fingertip pressing into felt, firmer than a tap, with a little low 'give'
        t = felt_tap(hp_hz=90, tail=0.16)
        t = dsp.eq(t, "peak", 220, 6, 0.9)
        t = dsp.lp(t, 4000)
        return t
    if v == "b":
        # the soft leather landing, cut to its swell (Kenney rpg handleSmallLeather, CC0)
        x = kenney(RPG, "handleSmallLeather")
        y = clean(x, hp_hz=120, lp_hz=6500, soften=0.6)
        y = dsp.eq(y, "peak", 300, 4, 0.8)
        return y * dsp.shape(len(y), [(0, 0), (0.17, 0), (len(y) / SR, -36)])
    # c: synthesised soft 'puk': a fingertip pressed into a small rubber dome and released.
    # Very short resonances (3-8 ms) so it is a touch of material, not a note; a little air.
    modes = [(380, 0.008, 1.0), (870, 0.005, 0.6), (1500, 0.003, 0.3)]
    y = dsp.modal(modes, 0.06, dsp.felt_mallet(4.0), seed=71)
    y /= np.abs(y).max()
    air = dsp.friction(0.14, 350, 2600, grain_rate=30, grain_depth=0.2, seed=72)
    air *= dsp.shape(secs(0.14), [(0, -40), (0.010, 0), (0.04, -10), (0.14, -50)]) / np.abs(air).max()
    t = dsp.hp(fs(848748), 120)
    pk = int(np.argmax(np.abs(t)))
    t = t[pk - secs(0.006): pk + secs(0.08)]
    t = t * dsp.shape(len(t), [(0, 0), (0.01, 0), (0.08, -40)])
    t /= np.abs(t).max()
    return dsp.place(0.16, [(0, y, 0.7), (0, air, 0.35), (0, t, 0.6)])


# =====================================================================  8 marker-stroke
MARKER_SRC = {
    # (freesound id, stroke start, stroke end) - chosen from an automatic stroke segmentation
    "a": (751055, 1.94, 2.31),   # SSkiba88 'pen (marker pen) writes on paper'
    "b": (377124, 6.30, 7.62),   # TubbsMedia 'Marker Lines': one long, even line
    "c": (869328, 3.99, 4.88),   # Torikari 'Writing on paper with a marker pen'
}


def marker(v, length):
    sid, a, b = MARKER_SRC[v]
    x = fs(sid, a - 0.01, b + 0.03)
    x = dsp.hp(x, 160)
    # WHY these EQ moves: the previous synthetic marker read as 'shh' because it was all hiss.
    # A real felt tip has a squeaky, gritty midrange (paper drag at 1-3 kHz) and a little
    # paper-on-table body; we lift those and pull the top octave down so the hiss stops
    # dominating, while keeping the recording's own stick-slip grain intact.
    x = dsp.eq(x, "highshelf", 7000, -6, 0.7)
    x = dsp.eq(x, "peak", 1800, 3, 0.9)
    x = dsp.eq(x, "peak", 420, 2.5, 1.0)
    x = dsp.soften_transients(x, 0.5)
    y = dsp.fit_stroke(x, length, head=min(0.05, length / 4), tail=min(0.08, length / 3))
    n = len(y)
    return y * dsp.shape(n, [(0, -18), (0.01, 0), (length - 0.04, 0), (length, -40)])


# =====================================================================  9 handwriting
HAND_SRC = {
    # (freesound id, start, end) of about one second of writing a word
    "a": (869328, 18.47, 19.48),   # marker pen on paper, Torikari
    "b": (540567, 8.20, 9.20),     # ballpoint pen on paper, redsedona
    "c": (751062, 0.55, 1.55),     # pen on paper, SSkiba88
}


def pen_dot_from(x):
    """The full stop: the pen touching down once. WHY taken from the same recording: a
    full stop IS a pen-down, so we find the sharpest pen-down in that recording and keep
    only its first ~45 ms; it then matches the writing exactly (same pen, paper, table)."""
    e = 20 * np.log10(dsp.env_follow(dsp.hp(x, 200), 3) + 1e-12)
    lag = secs(0.015)
    rise = e[lag:] - e[:-lag]
    loud = e[lag:] > e.max() - 12
    i = int(np.argmax(np.where(loud, rise, -99))) + lag
    i = i - secs(0.012)  # back up to the start of that rise
    d = x[max(0, i - secs(0.003)): i + secs(0.045)]
    d = d * dsp.shape(len(d), [(0, 0), (0.016, 0), (0.045, -40)])
    d = dsp.soften_transients(dsp.lp(dsp.hp(d, 200), 7000), 0.6)
    return dsp.fade(d, 0.8, 8)


def handwriting(v):
    sid, a, b = HAND_SRC[v]
    w = fs(sid, a, b)
    w = dsp.hp(w, 150)
    w = dsp.eq(w, "highshelf", 8000, -4, 0.7)
    w = dsp.soften_transients(w, 0.6)
    w = dsp.expander(w, -34, 2.5)
    w = dsp.fade(w, 8, 60)
    # the dot comes from elsewhere in the same recording (outside the word we used)
    whole = fs(sid)
    rest = np.concatenate([whole[: secs(a)], np.zeros(secs(0.1)), whole[secs(b):]])
    d = pen_dot_from(rest)
    d = d / np.abs(d).max() * np.abs(w).max() * 0.6
    return dsp.place(len(w) / SR + 0.32, [(0, w, 1.0), (len(w) / SR + 0.16, d, 1.0)])


# =====================================================================  10 page-turn
def page_turn(v):
    if v == "a":
        # a book page lifted and laid over (esperri 'Book Turn Page 1', CC0)
        x = fs(119126)
        return clean(x, hp_hz=120, lp_hz=9000, soften=0.7, gate_db=-40, post_ms=80)
    if v == "b":
        # a crisp page turn (Kenney rpg bookFlip1, CC0), its sharp flick softened
        x = kenney(RPG, "bookFlip1", 0.27, None)
        return clean(x, hp_hz=120, lp_hz=8500, soften=0.85, gate_db=-40, post_ms=60)
    # c: a quiet, slow page turn (SpaceJoe 'Quiet Page Turn - 8', CC0)
    x = fs(484968)
    return clean(x, hp_hz=120, lp_hz=8500, soften=0.85, gate_db=-40, post_ms=60)


# =====================================================================  11 lock / 12 unlock
def _latch(contacts, body_hz=180, seed=0):
    """Synthesised small latch, made gentle: each contact is a felt-damped touch on a small
    hard-wood/brass part (inharmonic, 4-12 ms), over a soft low body. contacts=[(t, gain)]."""
    out = dsp.place(0.22, [])
    for i, (t, g) in enumerate(contacts):
        sc = 1 + 0.03 * i
        modes = [(1150 * sc, 0.009, 1.0), (2380 * sc, 0.005, 0.45), (3720 * sc, 0.003, 0.2)]
        c = dsp.modal(modes, 0.05, dsp.felt_mallet(1.8), seed=seed + i)
        c /= np.abs(c).max()
        bmodes = [(body_hz, 0.010, 1.0), (body_hz * 2.43, 0.006, 0.4)]
        bd = dsp.modal(bmodes, 0.08, dsp.felt_mallet(4.0), seed=seed + 10 + i)
        bd /= np.abs(bd).max()
        out = out + dsp.place(0.22, [(t, c, 0.6 * g), (t, bd, 0.5 * g)])
    return out


def lock(v):
    if v == "a":
        # a book's cover closing, softened (Kenney rpg bookClose, CC0)
        x = kenney(RPG, "bookClose")
        y = clean(x, hp_hz=110, lp_hz=5000, soften=0.9, gate_db=-38)
        return dsp.eq(y, "peak", 240, 3, 0.9)
    if v == "b":
        # a small metal latch heard as if inside a felt-lined box: heavily softened and darkened
        # (Kenney rpg metalLatch, CC0)
        x = kenney(RPG, "metalLatch")
        y = clean(x, hp_hz=140, lp_hz=2300, soften=0.95, gate_db=-38)
        y = dsp.round_attacks(y, 6.0)
        return dsp.eq(y, "peak", 300, 4, 0.8)
    # c: synthesised: the catch meets, then seats (two gentle contacts)
    return _latch([(0.0, 0.7), (0.035, 1.0)], body_hz=260, seed=110)


def unlock(v):
    if v == "a":
        # the same book's cover lifting open (Kenney rpg bookOpen, CC0)
        x = kenney(RPG, "bookOpen")
        y = clean(x, hp_hz=110, lp_hz=6000, soften=0.8, gate_db=-40)
        return dsp.eq(y, "peak", 260, 2, 0.9)
    if v == "b":
        # the latch letting go: the metal click, softened and darkened like lock b
        # (Kenney rpg metalClick, CC0). Only its first contact.
        x = kenney(RPG, "metalClick", 0.06, 0.22)
        y = clean(x, hp_hz=140, lp_hz=2600, soften=0.95, gate_db=-38)
        return dsp.eq(y, "peak", 300, 4, 0.8)
    # c: synthesised: one softer contact, then a small breath of release
    y = _latch([(0.0, 1.0)], body_hz=300, seed=120)
    n = len(y)
    air = dsp.friction(0.22, 400, 2200, grain_rate=30, grain_depth=0.2, seed=121)
    air *= dsp.shape(n, [(0, -50), (0.025, -50), (0.05, 0), (0.22, -50)]) / np.abs(air).max()
    return y + 0.12 * air * np.abs(y).max()


# =====================================================================  13 count-up
def count_up(v, dur=1.2):
    r = np.random.default_rng({"a": 131, "b": 132, "c": 133}[v])
    # ~16 touches a second, very slightly irregular; the final touch a little firmer so the
    # count lands. Gains wander so it never becomes a ticking clock.
    times = []
    t = 0.0
    while t < dur - 0.12:
        times.append(t)
        t += r.normal(1 / 16, 0.006)
    if v == "a":
        # fingertips on paper: taps lifted from IENBA 'Tapping and handling paper' (CC0)
        x = fs(834340)
        hits = [h for h in isolated_hits(x, 0.06, 0.04, 0.04, thr_db=-30)]
        hits.sort(key=lambda h: h[2])
        pool = []
        for th, _, _ in hits[:6]:
            y = take(x, th, 0.06)
            y = dsp.soften_transients(dsp.lp(dsp.hp(y, 200), 5000), 0.85)
            pool.append(dsp.fade(y / np.abs(y).max(), 0.8, 20))
    elif v == "b":
        # felt taps (emapuree 'tap on felt', CC0) at slightly different sizes
        t0 = fs(848748)
        t0 = dsp.trim(dsp.hp(t0, 150), -40, post_ms=20)[: secs(0.06)]
        from scipy.signal import resample
        pool = []
        for f in (0.9, 0.95, 1.0, 1.05, 1.1):
            z = resample(t0, int(len(t0) * f))
            pool.append(dsp.fade(z / np.abs(z).max(), 0.8, 15))
    else:
        # synthesised: a fingertip brushing tiny ridges of paper, one soft grain per number.
        # Each grain is a 12-20 ms puff of paper friction (fixed band), with a rounded
        # attack: no resonance at all, so nothing can ring like a tick or a tock.
        pool = []
        for i in range(8):
            d = r.uniform(0.012, 0.020)
            g = dsp.friction(d + 0.01, 700, 4200, grain_rate=200, grain_depth=0.6, seed=160 + i)
            g *= dsp.shape(len(g), [(0, -30), (0.004, 0), (d, -30), (d + 0.01, -60)])
            pool.append(dsp.fade(g / np.abs(g).max(), 1.0, 4))
    items = []
    for i, t in enumerate(times):
        p = pool[r.integers(len(pool))]
        g = r.uniform(0.5, 0.8)
        items.append((t, p, g))
    items.append((times[-1] + 1 / 14, pool[0], 1.0))
    y = dsp.place(dur, items)
    return dsp.hp(y, 120)


# =====================================================================  14 reveal
def reveal(v):
    if v == "a":
        # a large sheet of fabric lifted and settling (adina.trx 'Bed sheets and blanket
        # rustling', CC0): its broadest gesture, darkened at the end
        x = fs(856380, 0.0, 6.0)
        x = dsp.hp(x, 70)
        e = dsp.env_follow(x, 120)
        c = int(np.argmax(e))
        # WHY start just before the loudest moment: the lift of the sheet before it is a
        # rising swish; from the peak on, the fabric only falls and settles
        y = x[max(0, c - secs(0.06)): c + secs(1.25)]
        y = dsp.soften_transients(dsp.lp(y, 7000), 0.4)
        n = len(y)
        dark = dsp.lp(y, 1800)
        mix = np.clip(np.linspace(-0.3, 1.2, n), 0, 1)
        y = y * (1 - 0.4 * mix) + dark * 0.4 * mix
        return y * dsp.shape(n, [(0, -20), (0.04, 0), (0.35, -3), (n / SR, -50)])
    if v == "b":
        # synthesised: a deep, soft bloom of air and low warmth. All filters fixed: no pitch,
        # no rising brightness. A slow swell, then a long settle.
        dur = 1.8
        n = secs(dur)
        lo = dsp.friction(dur, 45, 260, grain_rate=8, grain_depth=0.15, seed=141)
        mid = dsp.friction(dur, 260, 1500, grain_rate=15, grain_depth=0.2, seed=142)
        air = dsp.friction(dur, 1500, 6000, grain_rate=25, grain_depth=0.2, seed=143)
        lo *= dsp.shape(n, [(0, -50), (0.30, 0), (0.7, -3), (dur, -45)]) / np.abs(lo).max()
        mid *= dsp.shape(n, [(0, -50), (0.28, 0), (0.7, -4), (dur, -48)]) / np.abs(mid).max()
        air *= dsp.shape(n, [(0, -50), (0.26, 0), (0.6, -6), (dur, -55)]) / np.abs(air).max()
        # WHY this balance: the low part is warmth, not a rumble or a drum; most of what is
        # heard is the soft mid-range air, which also survives a phone speaker
        return 0.45 * lo + 0.6 * mid + 0.16 * air
    # c: many things settling at once: a dozen paper cards laid down across 0.5 s, plus a
    # cloth fold and a soft low bloom under them (Kenney casino + rpg, CC0, and synthesis)
    r = np.random.default_rng(150)
    names = ["card-place-1", "card-place-2", "card-place-3", "card-place-4"]
    pool = []
    for nm in names:
        z = kenney(CASINO, nm)
        z = dsp.soften_transients(dsp.lp(dsp.hp(z, 150), 4500), 0.9)
        # keep only each card's landing: 30 ms before its peak to 220 ms after, faded out,
        # so the recordings' faint hiss cannot pile up across twelve cards
        pk = int(np.argmax(np.abs(z)))
        z = z[max(0, pk - secs(0.03)): pk + secs(0.22)]
        z = z * dsp.shape(len(z), [(0, 0), (0.05, 0), (len(z) / SR, -45)])
        z = dsp.fade(z, 2, 20)
        pool.append(z / np.abs(z).max())
    items = []
    for i in range(12):
        t = 0.01 + 0.5 * (i / 11) ** 1.5 + r.uniform(0, 0.02)
        items.append((t, pool[r.integers(4)], r.uniform(0.25, 0.5) * (1 - 0.6 * i / 11)))
    cloth = clean(kenney(RPG, "cloth1"), hp_hz=130, lp_hz=5000, soften=0.4)
    cloth /= np.abs(cloth).max()
    dur = 1.6
    n = secs(dur)
    lo = dsp.friction(dur, 50, 300, grain_rate=8, grain_depth=0.15, seed=151)
    lo *= dsp.shape(n, [(0, -30), (0.12, 0), (0.6, -4), (dur, -45)]) / np.abs(lo).max()
    # WHY the small delays: the cards' touch comes first, the cloth and warmth follow, so
    # the sound opens at its brightest and then only settles (no swelling 'riser')
    items += [(0.03, cloth, 0.5), (0.04, lo, 0.35)]
    return dsp.place(dur, items)
