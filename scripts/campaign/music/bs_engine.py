"""Brand-sound engine (round three): the campaign PIANO plus clean, modern ELECTRONIC production, all made in code.

WHY a new engine: the owner rejected round two's soundfont orchestra / toy band / disco-funk and asked for "the earlier
piano-style music" with polished, premium sound design. So:
  - the piano is the round-one felt grand (GeneralUser GS rendered note by note, played at a brighter velocity and
    turned back down, then softened), which he liked;
  - everything electronic (sub bass, 808, kick, clap, hats, pads, plucks, music box, swells) is synthesised here in
    numpy instead of taken from General MIDI presets, so each sound is clean, controllable and few in number;
  - one mixer gives every sound a dry level, a hall send, a room send, a ping-pong delay send and a sidechain "pump"
    amount keyed to the kick, then glues and masters the bus to -14 LUFS / -1 dBTP.
Every synth returns an array whose sample 0 is its attack, so placing it at time t puts the hit exactly on t.
"""
import os
import numpy as np
from scipy.signal import lfilter
import soundfile as sf
import dsp
import piano as pianomod
from dsp import SR, lp, hp, bp, db, stereo
from r2_engine import m, ms, riser, boom, marker   # noqa: F401  (re-exported for the score files)
import r2_engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

# ----------------------------------------------------------------------------- the campaign's musical material
# WHY here: the motif is the brand's signature; every score (palette, three films) imports it from one place.
# One bar per chord, (beat, note, beats). Key C major; progression C - G - Am - F.
MOTIF = {'C': [(0, 'E5', 1.5), (1.5, 'G5', .5), (2, 'A5', 1), (3, 'G5', 1)],
         'G': [(0, 'D5', 1.5), (1.5, 'G5', .5), (2, 'B5', 1), (3, 'A5', 1)],
         'Am': [(0, 'E5', 1.5), (1.5, 'D5', .5), (2, 'C5', 1), (3, 'D5', 1)],
         'F': [(0, 'A5', 1.5), (1.5, 'G5', .5), (2, 'F5', 1), (3, 'G5', 1)]}
ROOT = {'C': 'C2', 'G': 'G1', 'Am': 'A1', 'F': 'F1', 'Em': 'E2', 'Dm': 'D2', 'E': 'E2', 'Gs': 'G1', 'Fs2': 'F1',
        'Am7': 'A1', 'C/E': 'E2', 'G/B': 'B1', 'Bb': 'Bb1'}
# piano left-hand / pad voicings (open, add9 colours: the round-one sound)
PADV = {'C': 'C3 G3 D4 E4', 'G': 'G2 D3 A3 B3', 'Am': 'A2 E3 B3 C4', 'F': 'F2 C3 G3 A3', 'Em': 'E3 B3 D4 G4',
        'Dm': 'D3 A3 E4 F4', 'Gs': 'G2 D3 C4 D4', 'Fs2': 'F2 C3 G3 C4', 'Am7': 'A2 E3 G3 C4', 'C/E': 'E2 C3 G3 D4',
        'G/B': 'B1 D3 G3 A3', 'E': 'E2 B2 G#3 B3', 'Bb': 'Bb2 F3 C4 D4'}
# a higher pad layer (strings-like synth, not strings)
PADH = {'C': 'G4 C5 D5 E5', 'G': 'D4 G4 A4 B4', 'Am': 'E4 A4 B4 C5', 'F': 'C5 F5 G5 A5', 'Em': 'E4 G4 B4 D5',
        'Dm': 'D4 F4 A4 E5', 'Gs': 'D4 G4 C5 D5', 'Fs2': 'C5 F5 G5 C6', 'Am7': 'E4 G4 A4 C5', 'C/E': 'E4 G4 C5 D5',
        'G/B': 'D4 G4 B4 D5', 'E': 'E4 G#4 B4 E5', 'Bb': 'D5 F5 Bb5 C6'}


def mtof(x):
    return 440.0 * 2 ** ((np.asarray(x, float) - 69) / 12)


def notes(x):
    """'C4 E4' / 60 / [60, 64] -> list of midi ints."""
    if isinstance(x, str):
        return ms(x)
    if isinstance(x, (list, tuple)):
        return [m(v) if isinstance(v, str) else int(v) for v in x]
    return [int(x)]


def _t(sec):
    return np.arange(max(1, int(round(sec * SR)))) / SR


def _ar(L, att, hold, rel):
    """Smooth attack (sin^2) / hold / release (cos^2) envelope of exactly L samples."""
    e = np.zeros(L)
    a, h, r = int(att * SR), int(hold * SR), int(rel * SR)
    a = max(1, min(a, L)); h = max(0, min(h, L - a)); r = max(1, min(r, L - a - h)) if L - a - h > 0 else 0
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a, endpoint=False)) ** 2
    e[a:a + h] = 1.0
    if r:
        e[a + h:a + h + r] = np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e


def _edge(x, ms_in=1.0, ms_out=4.0):
    """Click-free ends on any one-shot."""
    x = np.array(x, float)
    i, o = max(1, int(ms_in * SR / 1000)), max(1, int(ms_out * SR / 1000))
    i, o = min(i, len(x)), min(o, len(x))
    x[:i] *= np.linspace(0, 1, i) if x.ndim == 1 else np.linspace(0, 1, i)[:, None]
    x[-o:] *= np.linspace(1, 0, o) if x.ndim == 1 else np.linspace(1, 0, o)[:, None]
    return x


def pan(x, p):
    """Equal-power pan; a stereo input is balanced instead. Unity at centre (WHY: mono sources keep their level)."""
    if x.ndim == 2:
        a = (p + 1) * np.pi / 4
        return x * np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)
    return dsp.pan(x, p) * np.sqrt(2)


# ----------------------------------------------------------------------------- oscillators
def saw(freq, L, ph0=0.0):
    """Band-limited sawtooth (polyBLEP). WHY: a naive saw aliases into a gritty hiss, the opposite of 'premium'."""
    f = np.broadcast_to(np.asarray(freq, float), (L,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    a = ph < dt
    u = ph[a] / dt[a]
    y[a] -= u + u - u * u - 1.0
    b = ph > 1.0 - dt
    u = (ph[b] - 1.0) / dt[b]
    y[b] -= u * u + u + u + 1.0
    return y


def drift(L, rng, cents=3.0, rate=0.25):
    """Slow random pitch wander (ratio array) so held synth notes breathe like an analogue instrument."""
    k = max(4, int(L / SR * rate * 4) + 4)
    pts = rng.uniform(-1, 1, k)
    x = np.interp(np.linspace(0, k - 1, L), np.arange(k), pts)
    return 2 ** (cents * x / 1200)


# ----------------------------------------------------------------------------- instruments
def pad(chord, dur, rng, att=0.9, rel=1.8, lo=900.0, hi=None, curve=None, voices=5, detune=11.0, width=0.85,
        shimmer=0.0, sheen=0.15):
    """Warm detuned-saw pad. lo = filter cutoff (Hz). If hi is given the filter 'opens' from lo to hi following
    curve(u) (u = 0..1 over dur; default a slow rise) — done by crossfading a dark and a bright copy, which is
    click-free and cheap. shimmer adds a quiet octave-up sine layer for air."""
    L = int((dur + rel) * SR)
    out = np.zeros((L, 2))
    ns_ = notes(chord)
    for mm in ns_:
        f = float(mtof(mm))
        for v in range(voices):
            c = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2)
            w = saw(f * 2 ** (detune * c / 1200) * drift(L, rng), L, rng.random())
            # WHY width grows with pitch: notes under ~C3 stay near the centre so the low end is mono-safe
            out += dsp.pan(w, width * c * float(np.clip((mm - 45) / 15, 0.1, 1)))
        if shimmer:
            t = np.arange(L) / SR
            out += stereo(np.sin(2 * np.pi * 2 * f * t + rng.random() * 6) * shimmer)
    out /= np.sqrt(len(ns_) * voices)
    y = lp(out, lo, 2)
    if hi:
        br = lp(out, hi, 2)
        u = np.clip(np.arange(L) / (dur * SR), 0, 1)
        g = curve(u) if curve else u ** 1.5
        y = y * (1 - g)[:, None] + br * g[:, None]
    if sheen:
        # WHY (round four): a pad filtered at 600-4500 Hz has no top at all, so a whole film measured 0-2% of its
        # energy above 8 kHz (closed-in, 'bedroom'). sheen blends back the SAME saws' own 7 kHz+ band, quietly: the
        # breathy top of a real analogue pad, moving with its chord, not a separate hiss
        y = y + hp(out, 7000, 2) * sheen
    y = hp(y, 90, 2)
    return y * _ar(L, att, dur - att, rel)[:, None]


def sub(midi, dur, att=0.012, rel=0.18, drive=1.6, h2=0.12):
    """Sub bass: a sine with a touch of 2nd harmonic and soft saturation, so it is felt on big speakers and still
    heard on a phone. Mono."""
    L = int((dur + rel) * SR)
    t = np.arange(L) / SR
    f = float(mtof(notes(midi)[0]))
    w = np.sin(2 * np.pi * f * t) + h2 * np.sin(4 * np.pi * f * t)
    w = np.tanh(drive * w) / np.tanh(drive)
    return w * _ar(L, att, dur, rel)


def k808(midi, decay=0.7, punch=2.0, drive=2.2, dur=None):
    """808 bass drum: a sine that starts ~two octaves up and drops onto the note, long decay, soft drive. Mono."""
    dur = dur or decay * 4
    t = _t(dur)
    f0 = float(mtof(notes(midi)[0]))
    f = f0 * (1 + punch * np.exp(-t / 0.03))
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    w = np.tanh(drive * w) / np.tanh(drive)
    w += hp(np.random.default_rng(int(f0)).standard_normal(len(t)), 2000) * np.exp(-t / 0.002) * 0.15
    return _edge(w, 0.3, 30)


def kick(decay=0.22, f0=50.0, sweep=120.0, click=0.25, rng=None):
    """Tight electronic kick: fast pitch drop, short body, small click. Mono."""
    t = _t(decay * 4)
    f = f0 + sweep * np.exp(-t / 0.025)
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    w = np.tanh(1.8 * w) / np.tanh(1.8)
    rng = rng or np.random.default_rng(11)
    w += bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.0025) * click
    return _edge(w, 0.3, 20)


def clap(rng, tail=0.14, bright=1.0):
    """Clap: four noise bursts 9 ms apart then a short tail, band 1-6 kHz. Mono."""
    t = _t(0.03 + tail * 4)
    nz = lp(bp(rng.standard_normal(len(t)), 900 * bright, min(9000, 6000 * bright)), 11000, 4)
    # WHY every burst rises over 0.6 ms: a burst that switches on instantly is a broadband click (measured above
    # 17 kHz in every clap roll); the soft rise keeps the clap's snap without the digital tick
    rise = lambda u: np.minimum(1, u / 0.0006)
    e = np.zeros(len(t))
    for k in range(3):
        o = int(k * 0.009 * SR)
        e[o:] += rise(t[:len(t) - o]) * np.exp(-(t[:len(t) - o]) / 0.004) * (0.8 + 0.1 * k)
    o = int(0.027 * SR)
    e[o:] += rise(t[:len(t) - o]) * np.exp(-(t[:len(t) - o]) / tail)
    return _edge(nz * e / (np.abs(nz * e).max() + 1e-9), 0.6, 10)


def snare(rng, tone=190.0, tail=0.12, snap=1.0):
    """Soft electronic snare: a short tone plus filtered noise. Mono."""
    t = _t(tail * 5)
    body = np.sin(2 * np.pi * tone * t * (1 + 0.3 * np.exp(-t / 0.01))) * np.exp(-t / 0.05)
    nz = bp(rng.standard_normal(len(t)), 1500, 9000) * np.exp(-t / tail) * snap
    w = 0.6 * body + nz / (np.abs(nz).max() + 1e-9)
    return _edge(w / np.abs(w).max(), 0.3, 10)


_HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.6


def hat(rng, decay=0.035, tone=1.0):
    """Hi-hat: six detuned square-ish partials (the classic 808 recipe) + noise, high-passed. Mono."""
    t = _t(max(0.06, decay * 6))
    # WHY tanh(6 sin) rather than a hard square: the same metallic partials without sample-to-sample jumps,
    # which measured as clicks when a soft hat played in the quiet opening
    mt = sum(np.tanh(6 * np.sin(2 * np.pi * f * tone * t + rng.random() * 6)) for f in _HAT_F) / 6
    nz = rng.standard_normal(len(t))
    w = hp(0.6 * mt + 0.5 * nz, 7000, 4)
    w = lp(w, 15000, 2) * np.exp(-t / decay)
    return _edge(w / (np.abs(w).max() + 1e-9), 0.6, 4)   # WHY 0.6 ms in: a 0.2 ms start measured as a click


def crash(rng, dur=2.4, bright=1.0):
    """Soft synthetic cymbal for arrivals: the hat partials plus noise, high-passed, with a long decay that darkens
    as it fades (so it blooms and settles instead of hissing). Stereo."""
    t = _t(dur)
    out = []
    for c in range(2):
        mt = sum(np.tanh(6 * np.sin(2 * np.pi * f * 1.9 * bright * t + rng.random() * 6)) for f in _HAT_F) / 6
        x = hp(0.35 * mt + rng.standard_normal(len(t)), 3500, 2)
        out.append(x)
    x = np.stack(out, -1)
    br, dk = lp(x, 13000, 2), lp(x, 6000, 2)
    u = np.exp(-t / (dur * 0.15))
    x = (br * u[:, None] + dk * (1 - u)[:, None]) * (np.exp(-t / (dur * 0.3)) * np.minimum(1, t / 0.003))[:, None]
    return _edge(x / (np.abs(x).max() + 1e-9), 0.3, 50)


def shaker(rng, dur=0.09):
    t = _t(dur)
    w = bp(rng.standard_normal(len(t)), 5000, 12000) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return _edge(w / (np.abs(w).max() + 1e-9), 1, 4)


def pluck(midi, rng, dur=0.7, tau=0.30, bright=1.0, detune=6.0):
    """Electronic pluck: harmonics that die faster the higher they are (what a closing filter does), two slightly
    detuned voices. Mono."""
    t = _t(dur)
    f = float(mtof(notes(midi)[0]))
    out = np.zeros(len(t))
    for dc in (-detune, detune):
        ff = f * 2 ** (dc / 1200)
        k = 1
        while k * ff < 14000 and k <= 30:
            out += (1.0 / k) * np.sin(2 * np.pi * k * ff * t + rng.random() * 6) * np.exp(-t * (1 / tau) * (1 + (k - 1) * 0.55 / bright))
            k += 1
    out *= np.minimum(1, t / 0.002)
    return _edge(out / (np.abs(out).max() + 1e-9), 0.3, 8)


def bell(midi, dur=2.2, bright=1.0, rng=None):
    """Music box / glass bell: a few inharmonic partials, the upper ones dying quickly, plus a tiny tine click. Mono."""
    t = _t(dur)
    f = float(mtof(notes(midi)[0]))
    parts = [(1.0, 1.0, 1.0), (2.0, 0.22, 0.55), (3.0, 0.20 * bright, 0.32), (4.16, 0.10 * bright, 0.2), (5.43, 0.05 * bright, 0.12)]
    w = sum(a * np.sin(2 * np.pi * r * f * t) * np.exp(-t / (dur * d * 0.4)) for r, a, d in parts if r * f < 18000)
    rng = rng or np.random.default_rng(int(f))
    w += hp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.0015) * 0.08
    w *= np.minimum(1, t / 0.0015)
    return _edge(w / (np.abs(w).max() + 1e-9), 0.2, 30)


def lead(chord, dur, rng, att=0.01, rel=0.25, lo=1400.0, hi=8000.0, env_t=0.18, voices=5, detune=14.0, width=0.6):
    """Synth brass / saw lead: detuned saws whose filter starts bright and closes to lo over env_t (the 'bwah' of
    synth brass). Stereo. WHY hi 8 kHz (round four, was 5.2): the opening 'bwah' needs its top to sound expensive
    rather than boxed in; it closes to lo within env_t, so it never stays bright."""
    L = int((dur + rel) * SR)
    out = np.zeros((L, 2))
    ns_ = notes(chord)
    for mm in ns_:
        f = float(mtof(mm))
        for v in range(voices):
            c = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2)
            out += dsp.pan(saw(f * 2 ** (detune * c / 1200) * drift(L, rng, 2.0, 1.0), L, rng.random()), width * c)
    out /= np.sqrt(len(ns_) * voices)
    dark, br = lp(out, lo, 2), lp(out, hi, 2)
    g = np.exp(-np.arange(L) / (env_t * SR))
    y = dark * (1 - g)[:, None] + br * g[:, None]
    y = hp(y, 120, 2)
    return y * _ar(L, att, dur - att, rel)[:, None]


def air(dur, rng, lo=5000, hi=13000, rate=0.4):
    """Very quiet moving air: band-passed noise with a slow random swell. A texture, never a hiss bed."""
    L = int(dur * SR)
    nz = bp(rng.standard_normal((L, 2)), lo, hi)
    k = max(4, int(dur * rate * 2) + 4)
    am = np.interp(np.linspace(0, k - 1, L), np.arange(k), rng.uniform(0.3, 1.0, k))
    return nz / (np.abs(nz).max() + 1e-9) * am[:, None] * _ar(L, min(1.0, dur / 3), dur - 2 * min(1.0, dur / 3), min(1.0, dur / 3))[:, None]


def swell(dur, rng, f0=300, f1=9000, shape=2.0):
    """Soft noise swell whose loudness peaks at its END (place the end on the moment). Stereo-decorrelated."""
    return riser(dur, rng, f0, f1, shape)


def reverse_tail(x, dur, rt60=3.0, seed=3):
    """'Reverse piano' swell: a sound's own reverb tail played backwards, so it breathes IN to the moment.
    WHY: the classic premium film transition, made from the music itself instead of a stock whoosh."""
    x = stereo(x)
    L = int(dur * SR)
    ir = dsp.make_ir(rt60=rt60, predelay=0.0, seed=seed, damp_hz=7000)
    wet = dsp.reverb(np.concatenate([x, np.zeros((L, 2))]), ir, len(x) + L)
    seg = wet[:L][::-1].copy()
    seg *= (np.linspace(0, 1, L) ** 1.5)[:, None]
    seg[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]
    return seg / (np.abs(seg).max() + 1e-9)


# ----------------------------------------------------------------------------- the piano
# measured soundfont level (dB peak) vs velocity (round one), used to turn a brighter-velocity note back down
VEL_LEVEL = ([1, 41, 60, 80, 100, 120, 127], [-52.0, -30.1, -24.9, -20.2, -17.1, -15.0, -14.5])


def piano_tone(x, midi, vel, exc_db=-6.0):
    """Give the soundfont grand the upper harmonics and hammer a real piano has.
    WHY: measured, its notes are ~95% fundamental with nothing above 4 kHz (a C5 at velocity 100: 1.4% in 2-4 kHz,
    0.01% in 4-8 kHz), which is the 'muffled' sound round one fought. EQ cannot lift what is not there, so the
    note's own upper band is gently saturated (even + odd harmonics that follow its envelope exactly) and blended
    back, plus a 4 ms felt-hammer tick on the attack, scaled by velocity."""
    band = hp(x, 600, 2)
    k = 3.0 / (np.abs(band).max() + 1e-9)
    u = band * k
    gen = hp(0.6 * (u * u) + (np.tanh(u) - u * 0.8), 1400, 2) / k
    r = np.sqrt((band ** 2).mean()) / (np.sqrt((gen ** 2).mean()) + 1e-12)
    y = x + stereo(gen) * r * db(exc_db) if x.ndim == 2 else x + gen * r * db(exc_db)
    L = int(0.012 * SR)
    t = np.arange(L) / SR
    # WHY the 0.8 ms rise: a tick that starts at full level measured as a click in the quiet opening
    tick = bp(np.random.default_rng(midi * 131 + vel).standard_normal(L), 1800, 7000) * np.exp(-t / 0.0025) * np.minimum(1, t / 0.0008)
    pk = np.abs(x[:int(0.03 * SR)]).max()
    tick = tick / (np.abs(tick).max() + 1e-9) * pk * 0.10 * (vel / 127) ** 1.5
    y = np.array(y)
    y[:L] += tick[:, None] if y.ndim == 2 else tick
    return y


def render_piano(events, n, bright=40, felt=10000.0):
    """events: dicts t, midi, vel, dur, gdb, pan. Returns stereo (n,2).
    WHY bright: soft soundfont velocities are dull (no 2-4 kHz), so each note is played harder (+bright) for its
    tone and turned down by the measured level difference (round one's trick, which the owner liked).
    WHY felt: a gentle low-pass that softens the hammer: intimate, never muffled. Round four opens it from 6.5 to
    10 kHz: at 6.5 the piano measured 0.00% of its energy above 8 kHz, which is what made every mix sound dull."""
    reqs, prep = set(), []
    for e in events:
        d = round(max(0.3, e['dur']) / 0.1) * 0.1
        ve = int(min(127, e['vel'] + bright))
        comp = float(np.interp(e['vel'], *VEL_LEVEL) - np.interp(ve, *VEL_LEVEL))
        key = (int(e['midi']), ve, round(d, 3))
        reqs.add(key)
        prep.append((e, key, comp))
    cache = pianomod.render(reqs) if reqs else {}
    soft = {}
    out = np.zeros((n, 2))
    for e, key, comp in prep:
        fc = e.get('felt', felt)
        sk = key + (fc,)
        if sk not in soft:
            fcn = min(16000, fc + 40 * max(0, key[0] - 60))
            y = lp(lp(piano_tone(cache[key], key[0], key[1]), fcn, 2), 14000, 1)
            # WHY a 0.7 ms fade-in: the cached note starts 1 ms before its perceptual onset, sometimes mid-cycle;
            # without it the first sample is a step (a click when the note plays alone)
            f_ = int(0.0007 * SR)
            y[:f_] *= np.linspace(0, 1, f_)[:, None]
            soft[sk] = y
        seg = soft[sk] * db(e.get('gdb', 0.0) + comp)
        # WHY: low notes stay centred; the image widens upward like a real piano heard from the bench
        p = e.get('pan', 0.0) * float(np.clip((key[0] - 48) / 18, 0, 1))
        seg = pan(seg, p)
        i = int(round(e['t'] * SR))
        if i >= n:
            continue
        j = min(n, i + len(seg))
        out[i:j] += seg[:j - i]
    return out


# ----------------------------------------------------------------------------- mixer
def _env(x, ms_):
    return np.sqrt(lp((x ** 2).mean(axis=1), 1000.0 / (2 * np.pi * ms_), 1).clip(0))


class Mix:
    """Stems with sends. put() drops a one-shot at an exact time; piano() queues a piano note."""

    def __init__(self, length, seed=1):
        self.length = length
        self.n = int(round(length * SR))
        self.rng = np.random.default_rng(seed)
        self.stems = {}
        self.cfg = {}
        self.pno = {}
        self.kicks = []

    def stem(self, name, gain_db=0.0, hall=0.0, room=0.0, delay=0.0, pump=0.0, hpf=None, lpf=None, eq=(), comp=None):
        """pump = how far (dB) the stem dips under each kick (the gentle sidechain 'breathing' of modern pop).
        comp = (dB under the stem's loudest moment where compression starts, ratio): WHY: a piano struck hard in
        the bass has peaks 10+ dB over its body; taming them on the piano alone keeps the master limiter idle."""
        self.stems[name] = np.zeros((self.n, 2))
        self.cfg[name] = dict(gain_db=gain_db, hall=hall, room=room, delay=delay, pump=pump, hpf=hpf, lpf=lpf, eq=eq, comp=comp)
        return name

    def put(self, name, x, t, gain_db=0.0, p=0.0):
        x = pan(np.asarray(x, float), p) if (np.asarray(x).ndim == 1 or p) else np.asarray(x, float)
        i = int(round(t * SR))
        if i < 0:
            x, i = x[-i:], 0
        if i >= self.n:
            return
        j = min(self.n, i + len(x))
        self.stems[name][i:j] += x[:j - i] * db(gain_db)

    def piano(self, name, t, chord, vel, dur, p=0.0, gdb=0.0, roll=0.0, felt=None):
        """Piano note(s) at t seconds. roll spreads a chord upward by roll seconds per note."""
        self.pno.setdefault(name, [])
        for k, mm in enumerate(sorted(notes(chord))):
            e = dict(t=t + k * roll, midi=mm, vel=int(np.clip(vel, 1, 127)), dur=max(0.05, dur - k * roll), gdb=gdb, pan=p)
            if felt:
                e['felt'] = felt
            self.pno[name].append(e)

    def kick_at(self, t):
        """Register a kick time for the sidechain pump (call alongside put() of the kick sound)."""
        self.kicks.append(t)

    def pump_curve(self, depth_db, rel=0.16):
        """Gain curve: dips depth_db at every kick (5 ms attack) and breathes back over rel."""
        g = np.zeros(self.n)
        for t in sorted(set(self.kicks)):
            i = int(round(t * SR))
            k = min(self.n, i + int(rel * 5 * SR))
            if i >= self.n:
                continue
            u = np.arange(k - i) / SR
            curve = -depth_db * np.minimum(1, u / 0.005) * np.exp(-u / rel)
            g[i:k] = np.minimum(g[i:k], curve)
        return db(g)

    def render(self, hall_rt=2.6, hall_db=-8.0, room_db=-10.0, delay_t=0.45, delay_fb=0.38, delay_db=-10.0,
               piano_bright=40, piano_felt=10000.0, pump_rel=0.16, air_db=2.0, low_cut=30, balance=None,
               presence_db=1.0, air_layer=None, gate=None):
        """-> (bus, dict of processed dry stems incl. 'hall','room','delay'), unmastered.
        gate: (gain dB per sample, stems to leave alone): turns every other stem AND the hall / delay returns down
        by that curve. WHY: a 'clear the room' moment (take 3's marker alone on silence) cannot be made on the
        finished bus without also silencing the one sound that should stay; and gating only the dry stems left the
        reverb tails ringing through it.
        balance: {stem: LU} sets each named stem's own integrated loudness to -20 + LU (so {'pno': 0, 'sub': -6}
        puts the sub 6 LU under the piano). WHY: levels set by measurement, not by guessing dB per synth — a
        hand-set gain of a synth whose raw level nobody knows buried the piano 18 LU under the sub on the
        first pass. Stems not named keep their gain_db."""
        for name, ev in self.pno.items():
            self.stems[name] += render_piano(ev, self.n, piano_bright, piano_felt)
        dry, hs, rs, ds = (np.zeros((self.n, 2)) for _ in range(4))
        out = {}
        for name, x in self.stems.items():
            c = self.cfg[name]
            if not np.any(x):
                continue
            if c['hpf']: x = hp(x, c['hpf'], 2)
            if c['lpf']: x = lp(x, c['lpf'], 2)
            for f0, g, q in c['eq']:
                x = dsp.peak_eq(x, f0, g, q)
            if c.get('comp'):
                e = lp((x ** 2).mean(axis=1), 1 / (2 * np.pi * 0.004), 1).clip(1e-12)
                top = 10 * np.log10(e.max())
                x = glue(x, thresh_db=top - c['comp'][0], ratio=c['comp'][1], att=0.004, rel=0.18)
            if balance and name in balance:
                lv = dsp.lufs(x)
                x = x * db((-20.0 + balance[name]) - lv) if np.isfinite(lv) else x
            else:
                x = x * db(c['gain_db'])
            if c['pump'] and self.kicks:
                x = x * self.pump_curve(c['pump'], pump_rel)[:, None]
            if gate is not None and name not in gate[1]:
                x = x * db(gate[0])[:, None]
            out[name] = x
            dry += x
            hs += x * c['hall']; rs += x * c['room']; ds += x * c['delay']
        ir_h = dsp.make_ir(rt60=hall_rt, predelay=0.028, damp_hz=10000, seed=5)
        ir_r = dsp.make_ir(rt60=0.7, predelay=0.006, damp_hz=9000, seed=9)
        # WHY the hall is fed up to 12 kHz and damps at 10 kHz (round four, was 9.5 / 8.5): the reverb tail is where
        # 'air' lives in a real room; cutting it at 9.5 kHz made every tail sound like it was behind a curtain
        out['hall'] = dsp.reverb(lp(hp(hs, 220), 12000), ir_h, self.n) * db(hall_db) if np.any(hs) else np.zeros((self.n, 2))
        out['room'] = dsp.reverb(lp(hp(rs, 180), 10000), ir_r, self.n) * db(room_db) if np.any(rs) else np.zeros((self.n, 2))
        out['delay'] = pingpong(ds, delay_t, delay_fb, self.n) * db(delay_db) if np.any(ds) else np.zeros((self.n, 2))
        if gate is not None:
            for k in ('hall', 'delay'):
                if k not in gate[1]:
                    out[k] = out[k] * db(gate[0])[:, None]
        x = dry + out['hall'] + out['room'] + out['delay']
        if air_layer is not None:
            out['airlayer'] = self.air_layer(x, air_layer)
            x = x + out['airlayer']
        # WHY 4th order (24 dB/oct): below ~30 Hz is energy no speaker plays and the limiter still has to carry;
        # the fairytale measured 12% of its music below 40 Hz before this was raised
        x = hp(x, low_cut, 4)
        # WHY mono below 110 Hz: the soundfont piano's low notes and the reverb are recorded wide; a mono low end
        # is a brand rule (it survives phone speakers and never sounds lopsided)
        # (zero-phase split, so 'x minus its lows' is an exact complement: a normal filter's phase shift left a
        # +3 dB bump of side signal around the split, measured as a WIDER low end)
        from scipy.signal import butter, sosfiltfilt
        lo_ = sosfiltfilt(butter(4, 120, 'low', fs=SR, output='sos'), x, axis=0)
        x = x - lo_ + lo_.mean(axis=1, keepdims=True)
        x = dsp.peak_eq(x, 330, -1.5, 0.8)       # WHY: piano + pads pile up around 300 Hz (boxy); a small dip clears it
        x = dsp.high_shelf(x, 6000, presence_db)  # WHY: a little presence without a harsh peak
        x = dsp.high_shelf(x, 10000, air_db)      # WHY (round four): the air shelf moved up to 10 kHz, above the
        #                                           ear's harsh zone, so it opens the top without making it shrill
        self.out = out
        return x, out


    def air_layer(self, bus, lu):
        """An 8-14 kHz breath that follows the music's own envelope (80 ms), lu LU under the bus.
        WHY: real rooms, tape and good synths all carry a faint top that rises and falls with the playing. Keyed to
        the bus, it is silent in silences (never a hiss bed) and swells with the music."""
        rng = np.random.default_rng(8)
        nz = bp(rng.standard_normal((self.n, 2)), 8000, 14000, 2)
        e = _env(bus, 80.0)
        y = nz * e[:, None]
        lb, ly = dsp.lufs(bus), dsp.lufs(y)
        return y * db(lb + lu - ly) if np.isfinite(ly) and np.isfinite(lb) else y * 0


def pingpong(x, d, fb, n, taps=6, cutoff=4500):
    """Stereo ping-pong echo, each repeat darker and quieter (tape-ish), high-passed so it never muddies the bass."""
    y = lp(hp(x.mean(axis=1), 300), cutoff)
    out = np.zeros((n, 2))
    for k in range(1, taps + 1):
        sh = int(k * d * SR)
        if sh >= n:
            break
        ch = (k + 1) % 2
        seg = y[:n - sh] * fb ** (k - 1)
        out[sh:, ch] += seg
        y = lp(y, cutoff * 0.85, 1)
    return out


# ----------------------------------------------------------------------------- bus dynamics and master
def glue(x, thresh_db=-20.0, ratio=1.8, att=0.02, rel=0.25):
    """Gentle stereo-linked bus compressor: holds the arrangement together without squashing its dynamics."""
    e = lp((x ** 2).mean(axis=1), 1 / (2 * np.pi * att), 1).clip(1e-12)
    ldb = 10 * np.log10(e)
    gr = np.minimum(0, (thresh_db - ldb) * (1 - 1 / ratio))
    a = np.exp(-1 / (rel * SR))
    sm = lfilter([1 - a], [1, -a], gr)
    return x * db(np.minimum(gr, sm))[:, None]


def pre_hit_dip(x, t, depth_db=6.0, length=0.15):
    """Pull the whole bus down over the `length` s before a hit and release it on the hit (2 ms). WHY: the
    classic 'breath before the drop' — the swells and tails leading in no longer mask the hit's attack, so it lands
    with an edge exactly on the frame (measured: two late-landing hits, +31 and +32 ms, were masked this way)."""
    n = len(x)
    g = np.zeros(n)
    i0, i1, r = int((t - length) * SR), int(t * SR), int(0.002 * SR)
    u = np.linspace(0, 1, i1 - i0 - r)
    g[i0:i1 - r] = -depth_db * np.sin(np.pi / 2 * u) ** 2
    g[i1 - r:i1] = np.linspace(-depth_db, 0, r)
    return x * db(g)[:, None]


def gap_curve(n, t0, t1, depth_db=-45.0, fade_in=0.1, fade_out=0.06):
    """Gain (dB per sample): 0, falling to depth_db over fade_in from t0, held, back to 0 at t1."""
    g = np.zeros(n)
    a, b = int(t0 * SR), int((t0 + fade_in) * SR)
    c, d = int((t1 - fade_out) * SR), int(t1 * SR)
    g[a:b] = depth_db * np.sin(np.linspace(0, np.pi / 2, b - a)) ** 2
    g[b:c] = depth_db
    g[c:d] = depth_db * np.cos(np.linspace(0, np.pi / 2, d - c)) ** 2
    return g


def gap(x, t0, t1, depth_db=-45.0, fade_in=0.1, fade_out=0.06):
    """Near-silence on purpose: the whole bus falls to depth_db over fade_in from t0, holds, and is back to 0 dB at
    t1. WHY (round four): the brand rule 'silence used on purpose' is measured (<= -30 LUFS momentary); a quieter
    arrangement alone never got there because reverb and delay tails kept the room full."""
    return x * db(gap_curve(len(x), t0, t1, depth_db, fade_in, fade_out))[:, None]


def fit_arc(x, arc, rounds=5, target=-14.0, dense=1.0, skip=()):
    """Turn the bus so its short-term loudness (3 s) meets the arc's targets [(t, LUFS)] once mastered to target.
    Gain is interpolated in dB between the arc's points, so the music's own dynamics inside a section survive.
    WHY: hand-set dB offsets left round three's whole middle within 1 LU (stock-music flatness); targets are what
    the rules promise, so they are what is set."""
    import bs_voice as V
    # WHY dense points (every `dense` s, targets interpolated between the arc's own points): measured only at the
    # arc's points, a busier bar between two of them still came out 2 LU hot. skip: windows (an inhale, a gap)
    # where the arc must not try to 'fix' a silence that is there on purpose.
    a0, a1 = arc[0][0], arc[-1][0]
    grid = [t for t in np.arange(a0, a1, dense) if not any(s0 <= t <= s1 for s0, s1 in skip)]
    ts = np.array(sorted(set([a for a, _ in arc] + grid)))
    tg = np.interp(ts, [a for a, _ in arc], [b for _, b in arc])
    corr = np.zeros(len(ts))
    tt = np.arange(len(x)) / SR
    y = x
    for _ in range(rounds):
        y = x * db(np.interp(tt, ts, corr))[:, None]
        yn = y * db(target - dsp.lufs(y))
        st = V.short_loudness(yn, win=3.0, hop=0.1)
        got = st[(ts * SR).astype(int).clip(0, len(x) - 1)]
        corr += 0.8 * (tg - got)
    return x * db(np.interp(tt, ts, corr))[:, None]


def ending(x, end, fade=1.2):
    """Silent from `end`: a cos^2 fade over the last `fade` s of an already-decaying chord reads as a ring-out."""
    return E.fade_in_out(x, end, fade)


def finish(x, path, n, target=-14.0):
    # WHY report the limiter's worst reduction: 'real dynamics' means the limiter only shaves stray peaks
    # (a few dB at most); more than ~4 dB means transients are being crushed and the mix needs rebalancing.
    over = dsp.true_peak_db(x * db(target - dsp.lufs(x))) + 1.3
    y = E.finish(x, path, n, target)
    # how long the limiter works hard: share of time the master is pulling more than 1 / 3 dB, and where the worst is
    g = 20 * np.log10(np.convolve(np.abs(y).max(1), np.ones(240) / 240, 'same') + 1e-9) - \
        20 * np.log10(np.convolve(np.abs(dsp.fit(x, n) * db(dsp.lufs(y) - dsp.lufs(dsp.fit(x, n)))).max(1), np.ones(240) / 240, 'same') + 1e-9)
    g = np.minimum(0, g)
    print(f'{os.path.relpath(path, HERE)}: LUFS {dsp.lufs(y):.2f}  TP {dsp.true_peak_db(y):.2f}  limiter max {max(0, over):.1f} dB '
          f'at {np.argmin(g) / SR:.2f} s; >1 dB for {100 * (g < -1).mean():.1f}% of the time, >3 dB {100 * (g < -3).mean():.2f}%')
    return y


def write_float(path, x):
    sf.write(path, x, SR, subtype='FLOAT')
