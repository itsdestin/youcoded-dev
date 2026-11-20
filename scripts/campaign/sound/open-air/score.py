"""Open air: the music itself (motif, logo, three demos, interface sounds) and the mix.

The idea in notes: a four-note rising call, A-D-E-A ("da-da-da-daaa", a door swinging
open), answered by F#-E-D-E, which lands on the open 9th (E over D) instead of the
home note, so it always feels like it is still rising. The sonic logo is the same four
rising notes, quick, blooming into a wide D-add9 chord with a glass bell on top.
"""
import numpy as np
from dsp import (SR, secs, mtof, pan2, saw, sine, hp, lp, bp, eq, sat, chorus, pingpong,
                 reverb, compress, limit, true_peak_db, fade, svf_env)
import inst

# --------------------------------------------------------------------------- the idea
# (midi note, start beat, length beats). A4 D5 E5 A5 | F#5 E5 D5 E5. Key: D major.
MOTIF = [(69, 0, .5), (74, .5, .5), (76, 1, .5), (81, 1.5, 2.5),
         (78, 4, .5), (76, 4.5, .5), (74, 5, .5), (76, 5.5, 2.5)]
HEAD = [m for m, _, _ in MOTIF[:4]]          # the logo's notes: A4 D5 E5 A5
LOGO_LEN = 2.5                                 # seconds, identical everywhere

CH = {'D': (50, 57, 64, 66, 69), 'G': (55, 59, 62, 66, 69), 'Bm': (54, 57, 59, 62, 66),
      'A': (52, 57, 61, 64, 69), 'Asus': (52, 57, 62, 64, 69)}
ROOT = {'D': 38, 'G': 31, 'Bm': 35, 'A': 33, 'Asus': 33}   # D2 73 Hz .. G1 49 Hz: all in 40-80
ARPN = {'D': [62, 69, 74, 76, 78, 81], 'G': [62, 67, 71, 74, 78, 81],
        'Bm': [62, 66, 71, 74, 78, 83], 'A': [61, 64, 69, 73, 76, 81],
        'Asus': [62, 64, 69, 74, 76, 81]}
ARP_PAT = [0, 2, 4, 1, 3, 5, 4, 2]


# --------------------------------------------------------------------------- mixer
class Mix:
    BUSES = ('pad', 'arp', 'lead', 'bell', 'sub', 'drums', 'fx')

    def __init__(self, dur):
        self.n = secs(dur)
        self.dur = dur
        self.bus = {b: np.zeros((self.n, 2)) for b in self.BUSES}
        self.send = {s: np.zeros((self.n, 2)) for s in ('hall', 'plate', 'delay')}
        self.kicks = []
        self.duck = 0.0

    def add(self, sig, t, bus, gain=1.0, hall=0.0, plate=0.0, delay=0.0):
        a = secs(t)
        if a >= self.n:
            return
        sig = sig[: self.n - a] * gain
        self.bus[bus][a:a + len(sig)] += sig
        for k, v in (('hall', hall), ('plate', plate), ('delay', delay)):
            if v:
                self.send[k][a:a + len(sig)] += sig * v

    def sidechain(self, depth, rel=0.18):
        """Gain curve that dips after every kick and breathes back: the 'pump' that lets
        a big pad and a big kick share the low end without mud."""
        g = np.zeros(self.n)
        for t in self.kicks:
            a = secs(t)
            k = min(self.n - a, secs(rel * 5))
            x = np.arange(k) / SR
            shape = np.exp(-x / rel) * np.minimum(1, x / 0.004)
            g[a:a + k] = np.maximum(g[a:a + k], shape)
        return 1 - depth * g

    def render(self, delay_s, duck=None, hall_decay=3.4, bright=1.0):
        duck = duck or {}
        out = np.zeros((self.n, 2))
        busfx = {
            'pad': lambda x: eq(chorus(x, 0.35, 3.5, 12, 0.4), 'peak', 350, -2.5, 0.8),
            'arp': lambda x: eq(chorus(x, 0.8, 2.0, 8, 0.25), 'high', 6000, 2.0),
            'lead': lambda x: eq(x, 'peak', 2600, 1.5, 1.0),
            'bell': lambda x: x,
            'sub': lambda x: lp(x, 140),
            'drums': lambda x: eq(x, 'high', 9000, 1.5),
            'fx': lambda x: x,
        }
        for b in self.BUSES:
            x = busfx[b](self.bus[b])
            if b in duck and self.kicks:
                x = (x.T * self.sidechain(duck[b])).T
            out += x
        d = pingpong(self.send['delay'], delay_s, 0.45)
        out += d * 0.55
        h = reverb(self.send['hall'] + 0.35 * d, decay=hall_decay, predelay=0.03, seed=11, bright=bright)
        out += h * 0.9
        if np.any(self.send['plate']):
            out += reverb(self.send['plate'], decay=1.5, predelay=0.012, seed=5, hp_hz=300) * 0.8
        return out


# --------------------------------------------------------------------------- mastering
def lufs(st):
    import pyloudnorm as pyln
    return pyln.Meter(SR).integrated_loudness(st)


def premaster(x):
    """Bus polish: clean the rumble, gentle glue compression, a touch of tanh warmth."""
    x = hp(x, 28, 2)
    # WHY: a gentle lift of the top octave is most of what reads as 'expensive air'
    x = eq(x, 'high', 9000, 2.5)
    # WHY: energy piled up around 50 Hz (kick + G1 sub); a 2.5 dB shelf keeps it deep
    # but stops it swamping big speakers
    x = eq(x, 'low', 70, -2.5)
    x = compress(x, thr_db=-20, ratio=1.8, att_ms=25, rel_ms=220, knee=8)
    return x


def master(x, target, ceiling=-1.3, extra=None):
    """Normalise to `target` LUFS through the true-peak limiter (iterated, because the
    limiter itself lowers loudness). `extra` (already mastered) is summed on top
    untouched: that is how the logo stays sample-identical inside every demo."""
    x = premaster(x)
    g = target - lufs(x + (extra if extra is not None else 0))
    for _ in range(8):
        y = limit(x * 10 ** (g / 20), ceiling)
        tot = y + (extra if extra is not None else 0)
        L = lufs(tot)
        if abs(L - target) < 0.05:
            break
        g += target - L
    return tot


def width(x, w):
    """Scale the stereo 'side' signal: w<1 narrows, so the sound loses less in mono."""
    mid = x.mean(axis=1)
    side = (x[:, 0] - x[:, 1]) / 2 * w
    return np.stack([mid + side, mid - side], axis=1)


def edges(x, fin=0.003, fout=0.04):
    """Start and end exactly on zero (no click when a film cuts in or out)."""
    x = fade(x, fin, fout)
    x[0] = 0
    x[-1] = 0
    return x


# --------------------------------------------------------------------------- helpers
def arp(mix, seq, step, t_start, vel=0.8, bright=0.8, ramp=None, hall=0.25, delay=0.18, seed=0):
    """seq = [(chord, t0, t1)]. 16th-note shimmering arpeggio from each chord's tones."""
    i = 0
    for ch, t0, t1 in seq:
        t = t0
        while t < t1 - 1e-6:
            if t >= t_start:
                m = ARPN[ch][ARP_PAT[i % 8]]
                acc = 1.0 if i % 4 == 0 else (0.75 if i % 2 == 0 else 0.6)
                b = bright if ramp is None else ramp(t)
                v = vel * acc * (1 if ramp is None else 0.55 + 0.45 * ramp(t))
                mix.add(inst.pluck(m, step * 0.8, v, b, pan=(-0.35, 0.35)[i % 2], seed=seed + i),
                        t, 'arp', hall=hall, delay=delay)
            t += step
            i += 1


def pads(mix, seq, gain=1.0, **kw):
    for ch, t0, t1 in seq:
        mix.add(inst.pad(CH[ch], t1 - t0, **kw), t0, 'pad', gain, hall=0.35)


def subs(mix, seq, gain=1.0):
    for ch, t0, t1 in seq:
        # WHY 0.72: measured sub share sat at -3.5 dB of total energy (boomy on big
        # speakers); this brings it to about -6 dB, near modern electronic mixes
        mix.add(inst.sub(ROOT[ch], t1 - t0 - 0.03, 1.0), t0, 'sub', gain * 0.72)


def motif_lead(mix, t0, beat, gain=1.0, octave=0, hall=0.3, delay=0.22):
    mix.add(inst.lead(MOTIF, beat, octave=octave), t0, 'lead', gain, hall=hall, delay=delay)


def motif_glass(mix, t0, beat, gain=1.0, octave=0, dur=1.8, hall=0.4, delay=0.2, bright=1.0):
    for m, s, l in MOTIF:
        mix.add(inst.glass(m + 12 * octave, dur, 1.0, bright=bright), t0 + s * beat, 'bell', gain,
                hall=hall, delay=delay)


def crash(vel=1.0, seed=9):
    rng = np.random.default_rng(seed)
    n = secs(2.4)
    t = np.arange(n) / SR
    nz = np.stack([rng.standard_normal(n), rng.standard_normal(n)], axis=1)
    x = hp(nz, 4500) * np.exp(-t / 0.7)[:, None] * 0.12 * vel
    x[:secs(0.002)] *= np.linspace(0, 1, secs(0.002))[:, None]
    x[-secs(0.05):] *= np.linspace(1, 0, secs(0.05))[:, None]
    return x


def chords_by_bar(names, t0, bar):
    return [(c, t0 + i * bar, t0 + (i + 1) * bar) for i, c in enumerate(names)]


def pad_to(x, dur):
    n = secs(dur)
    out = np.zeros((n, 2))
    out[:min(n, len(x))] = x[:n]
    return out


# --------------------------------------------------------------------------- logo
def logo_premix():
    """2.5 s. A4-D5-E5 quick (110 ms apart), then A5 lands at 0.36 s with the bloom:
    wide D-add9 chord that opens like a door, deep soft boom, glass shimmer an octave up."""
    mix = Mix(LOGO_LEN + 0.5)
    times = [0.0, 0.11, 0.22, 0.36]
    mix.add(inst.riser(0.36, 0.55, seed=4, lo=1500, hi=12000), 0.0, 'fx', hall=0.2)
    for i, (m, t) in enumerate(zip(HEAD[:3], times)):
        mix.add(inst.glass(m, 1.6, 0.75), t, 'bell', hall=0.35, delay=0.12)
        mix.add(inst.pluck(m, 0.08, 0.7, 1.0, pan=(-0.3, 0.3, 0.0)[i], seed=i), t, 'arp', hall=0.2)
    T = times[3]
    mix.add(inst.glass(81, 2.4, 1.15, bright=1.6), T, 'bell', hall=0.5, delay=0.15)
    mix.add(inst.glass(93, 1.2, 0.18, bright=1.4), T + 0.1, 'bell', hall=0.8, delay=0.2)
    mix.add(inst.glass(86, 2.0, 0.45), T + 0.02, 'bell', hall=0.6)
    mix.add(inst.glass(88, 1.6, 0.25), T + 0.07, 'bell', hall=0.7)
    mix.add(inst.pad(CH['D'] + (74, 81), 1.0, attack=0.04, release=1.0, cut0=1200, cut1=7000,
                     cut_t=0.35, vel=1.6), T, 'pad', hall=0.45)
    mix.add(inst.sub(38, 1.0, 1.0, dur=1.6), T, 'sub', 0.55)
    mix.add(inst.kick(0.6, tune=46, decay=0.45, click=0.4), T, 'drums', hall=0.35)
    mix.add(inst.air(LOGO_LEN, 2.5), 0.0, 'fx')
    x = mix.render(delay_s=0.18, hall_decay=2.6)[:secs(LOGO_LEN)]
    # WHY a long fade: the logo must *end* (no half-second of reverb cut off by the
    # next shot), so the tail is shaped down to silence by 2.5 s.
    k = secs(0.65)
    x[-k:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[:, None]
    return x


_LOGO = None


def logo_master():
    global _LOGO
    if _LOGO is None:
        _LOGO = edges(master(width(logo_premix(), 0.6), -16.0, ceiling=-1.6), 0.001, 0.005)
    return _LOGO


def with_logo(body_premix, t_logo, dur, target=-14.0):
    """Master the body, then lay the already-mastered logo on top untouched."""
    lg = np.zeros((secs(dur), 2))
    a = secs(t_logo)
    L = logo_master()
    lg[a:a + len(L)] = L[: secs(dur) - a]
    body = pad_to(body_premix, dur)
    out = master(body, target, ceiling=-1.3, extra=lg)
    return edges(out, 0.002, 0.004), lg


# --------------------------------------------------------------------------- motif.wav
def motif_piece():
    bpm = 72
    beat = 60 / bpm
    dur = 8.0
    t0 = 0.3
    mix = Mix(dur + 1)
    motif_lead(mix, t0, beat, 1.0)
    motif_glass(mix, t0, beat, 0.35, dur=1.4)
    seq = [('D', 0.0, t0 + 4 * beat), ('G', t0 + 4 * beat, dur - 0.6)]
    pads(mix, seq, 0.8, attack=0.6, release=1.2, cut0=500, cut1=2200, cut_t=2)
    subs(mix, seq, 0.35)
    mix.add(inst.air(dur, 1.8), 0, 'fx')
    x = mix.render(delay_s=beat * 0.75)[:secs(dur)]
    k = secs(1.0)
    x[-k:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[:, None]
    return edges(master(x, -14.0), 0.002, 0.01), {'motif_at': [t0], 'beat': beat}


# --------------------------------------------------------------------------- hopeful (30 s)
def hopeful():
    """87.3 BPM, 10 bars of 2.75 s, logo at 27.5 s. Bars 1-6 leave the middle of the
    spectrum open for a narrator (no lead, filtered pad, quiet arp); the glass plays the
    motif softly in bars 3-4; drums arrive at bar 7 like a door opening; the singing lead
    takes the motif in bars 7-8; bars 9-10 lift into the logo."""
    bar = 2.75
    beat = bar / 4
    dur = 30.0
    TL = 27.5
    mix = Mix(dur)
    names = ['D', 'G', 'D', 'G', 'Bm', 'A', 'D', 'G', 'Bm', 'Asus']
    seq = chords_by_bar(names, 0.0, bar)
    # pad: two layers, one per half, the second opening wider
    pads(mix, seq[:6], 0.9, attack=1.6, release=1.4, cut0=350, cut1=1600, cut_t=3.0)
    pads(mix, seq[6:], 1.15, attack=0.25, release=0.5, cut0=1800, cut1=5200, cut_t=1.0, spread=24)
    subs(mix, seq[2:], 0.45)
    ramp = lambda t: float(np.clip((t - 2.0) / 14.0, 0, 1))
    arp(mix, seq, beat / 4, 2.75, vel=0.55, ramp=ramp, seed=10)
    motif_glass(mix, 2 * bar, beat, 0.45, dur=2.2, hall=0.5)
    motif_lead(mix, 6 * bar, beat, 1.35)
    motif_glass(mix, 6 * bar, beat, 0.25, octave=1, dur=1.5)
    # counter-line in bars 9-10 (sparse, motif-derived: F#-E ... D-E ... A)
    mix.add(inst.lead([(78, 0, 1), (76, 1, 1), (74, 2, 2), (76, 4, 1.5), (81, 5.5, 2.3)], beat, 0.7),
            8 * bar, 'lead', hall=0.35, delay=0.25)
    # door opening at bar 7
    mix.add(inst.riser(bar * 1.0, 0.9, seed=2), 5 * bar, 'fx', hall=0.3)
    D7 = 6 * bar
    mix.add(inst.kick(0.75, tune=45, decay=0.55, click=0.5), D7, 'drums', hall=0.5)
    mix.kicks.append(D7)
    mix.add(crash(0.9), D7, 'drums', hall=0.3)
    for b in range(6, 10):
        tb = b * bar
        for k_beat in (0, 2, 2.75) if b > 6 else (2, 2.75):
            mix.add(inst.kick(0.7 if k_beat != 2.75 else 0.45, tune=50, decay=0.32), tb + k_beat * beat, 'drums', hall=0.1)
            mix.kicks.append(tb + k_beat * beat)
        mix.add(inst.clap(0.85, seed=b), tb + 2 * beat, 'drums', plate=0.55, hall=0.25)
        for e in range(8):
            mix.add(inst.hat(0.5 if e % 2 else 0.28, seed=b * 8 + e, pan=(0.2, -0.1)[e % 2]),
                    tb + e * beat / 2, 'drums', hall=0.05)
    # into the logo: short riser + the band stops so the logo speaks clearly
    mix.add(inst.riser(1.3, 0.7, seed=6, lo=800, hi=12000), TL - 1.3, 'fx', hall=0.25)
    mix.add(inst.air(dur, 1.0), 0, 'fx')
    x = mix.render(delay_s=beat * 0.75, duck={'pad': 0.35, 'arp': 0.25, 'sub': 0.6})
    x = gate_before(x, TL)
    out, lg = with_logo(x, TL, dur)
    return out, {'motif_at': [2 * bar, 6 * bar], 'beat': beat, 'logo_at': TL, 'logo': lg}


def gate_before(x, t, rel=0.35):
    """Fade the band's dry+wet out over `rel` s from the logo's start, so the music
    hands over to the logo instead of fighting it."""
    a = secs(t)
    k = secs(rel)
    x = x.copy()
    x[a:a + k] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[:, None] * 0.85 + 0.15
    x[a + k:] *= 0.15 * np.exp(-np.arange(len(x) - a - k) / SR / 0.6)[:, None]
    return x


# --------------------------------------------------------------------------- playful (20 s)
def playful():
    """120 BPM. 1.5 s pickup (typing ticks + riser), 8 bars (16 s), logo at 17.5 s.
    Motif in glass + pluck (bars 1-2) and in the singing lead an octave up (bars 5-6)."""
    beat = 0.5
    bar = 2.0
    dur = 20.0
    T0 = 1.5
    TL = 17.5
    mix = Mix(dur)
    for i in range(6):
        mix.add(inst.tick(0.8 + 0.2 * (i % 2), seed=i, f=3000 + 180 * (i % 3)), i * 0.25, 'fx', hall=0.08)
    mix.add(inst.riser(T0, 0.6, seed=8, lo=600, hi=10000), 0.0, 'fx', hall=0.2)
    names = ['D', 'G', 'Bm', 'A', 'D', 'G', 'Bm', 'Asus']
    seq = chords_by_bar(names, T0, bar)
    pads(mix, seq, 0.85, attack=0.03, release=0.4, cut0=2500, cut1=4500, cut_t=0.5)
    arp(mix, seq, beat / 4, T0, vel=0.62, bright=0.9, seed=20, hall=0.15, delay=0.12)
    steps = beat / 4
    for b, ch in enumerate(names):
        tb = T0 + b * bar
        for s, v in ((0, 1.0), (6, 0.7), (8, 0.95), (14, 0.6)):
            mix.add(inst.kick(v * 0.8, tune=50, decay=0.3), tb + s * steps, 'drums', hall=0.04)
            mix.kicks.append(tb + s * steps)
            mix.add(inst.sub(ROOT[ch] + (12 if s == 14 else 0), 0.22 if s else 0.4, v), tb + s * steps, 'sub', 0.42)
        for s in (4, 12):
            mix.add(inst.clap(0.95, seed=b * 2 + s), tb + s * steps, 'drums', plate=0.35, hall=0.1)
        for s in range(16):
            if s % 2 == 0 or b >= 4:
                v = 0.55 if s % 4 == 2 else (0.3 if s % 2 == 0 else 0.18)
                op = (s == 14 and b % 2 == 1)
                mix.add(inst.hat(v, open_=op, seed=b * 16 + s, pan=(0.25, -0.15)[s % 2]), tb + s * steps, 'drums')
    motif_glass(mix, T0, beat, 0.55, dur=1.2, hall=0.3, delay=0.25)
    for m, s, l in MOTIF:
        mix.add(inst.pluck(m, 0.1, 0.8, 1.0, seed=int(m)), T0 + s * beat, 'arp', hall=0.15, delay=0.2)
    motif_lead(mix, T0 + 4 * bar, beat, 1.6, octave=0, delay=0.25)
    motif_glass(mix, T0 + 4 * bar, beat, 0.3, octave=1, dur=1.0)
    # bar 8: clap roll into the logo
    for i in range(8):
        tt = T0 + 7 * bar + bar / 2 + i * steps
        mix.add(inst.clap(0.35 + 0.08 * i, seed=100 + i, tone=0.5), tt, 'drums', plate=0.2)
    mix.add(inst.riser(bar, 0.8, seed=12, lo=700, hi=12000), TL - bar, 'fx', hall=0.2)
    mix.add(crash(0.7), T0 + 4 * bar, 'drums', hall=0.2)
    mix.add(inst.air(dur, 0.9), 0, 'fx')
    x = mix.render(delay_s=beat * 0.75, duck={'pad': 0.55, 'arp': 0.3, 'sub': 0.25})
    x = gate_before(x, TL, 0.25)
    out, lg = with_logo(x, TL, dur)
    return out, {'motif_at': [T0, T0 + 4 * bar], 'beat': beat, 'logo_at': TL, 'logo': lg}


# --------------------------------------------------------------------------- stark (12 s)
def stark():
    """102.9 BPM (beat 0.583 s; 7.0 s = beat 12). Deadpan for 7 s: a dry clock-like tick on
    every beat and the motif as plain, dry, centred sine blips. At 7.0 s it turns bright:
    the room opens (reverb), the field goes wide, pad, sub, shimmering arp; logo at 9.33 s."""
    beat = 7.0 / 12
    dur = 12.0
    TB = 7.0
    TL = 16 * beat
    mix = Mix(dur)
    for i in range(12):
        mix.add(inst.tick(0.9 if i % 4 == 0 else 0.6, seed=i, f=2600), i * beat, 'fx')
    for m, s, l in MOTIF:
        n = secs(min(l * beat, 0.9) + 0.05)
        t = np.arange(n) / SR
        y = np.sin(2 * np.pi * float(mtof(m)) * t) * np.exp(-t / 0.35) * 0.22
        y[:secs(0.003)] *= np.linspace(0, 1, secs(0.003))
        y[-secs(0.03):] *= np.linspace(1, 0, secs(0.03))
        mix.add(pan2(y, 0.0), (s + 2) * beat, 'lead')
    mix.add(inst.riser(1.0, 0.8, seed=14, lo=500, hi=11000), TB - 1.0, 'fx')
    seq = [('G', TB, TB + 2 * beat), ('Asus', TB + 2 * beat, TL)]
    pads(mix, seq, 1.2, attack=0.08, release=0.4, cut0=1500, cut1=6000, cut_t=0.6, spread=24)
    subs(mix, seq, 0.5)
    arp(mix, seq, beat / 4, TB, vel=0.65, bright=1.0, seed=30, hall=0.3, delay=0.2)
    mix.add(inst.kick(0.7, tune=45, decay=0.5, click=0.5), TB, 'drums', hall=0.5)
    mix.add(crash(0.8), TB, 'drums', hall=0.3)
    mix.add(inst.glass(83, 2.0, 0.8), TB, 'bell', hall=0.6, delay=0.3)
    mix.add(inst.glass(88, 1.6, 0.4), TB + 0.03, 'bell', hall=0.6)
    a = secs(TB)
    airx = inst.air(dur - TB, 1.4)
    mix.add(airx, TB, 'fx')
    x = mix.render(delay_s=beat * 0.75)
    x = width(gate_before(x, TL, 0.25), 0.85)
    out, lg = with_logo(x, TL, dur)
    return out, {'motif_at': [2 * beat], 'beat': beat, 'logo_at': TL, 'logo': lg, 'bright_at': TB}


# --------------------------------------------------------------------------- sfx
def sfx_tick():
    x = inst.tick(1.0, seed=1)
    x = x + 0.12 * reverb(np.pad(x, ((0, secs(0.1)), (0, 0))), decay=0.35, predelay=0.004, seed=3)[: len(x)]
    return x


def sfx_change():
    """~0.8 s: the motif's notes run upward fast through the glass while a pad 'whoosh'
    opens: the sound of something turning into something else."""
    mix = Mix(1.4)
    for i, m in enumerate(HEAD + [86]):
        mix.add(inst.glass(m + 12, 0.7, 0.55 + 0.1 * i), i * 0.06, 'bell', hall=0.35)
    mix.add(inst.pad(CH['D'][2:] + (74,), 0.35, attack=0.12, release=0.3, cut0=600, cut1=7000,
                     cut_t=0.25, vel=1.1), 0.0, 'pad', hall=0.3)
    mix.add(inst.riser(0.24, 0.5, seed=21, lo=1500, hi=12000), 0.0, 'fx')
    x = mix.render(0.12, hall_decay=1.2)[:secs(0.8)]
    k = secs(0.3)
    x[-k:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[:, None]
    return x


def sfx_arrive():
    """~0.4 s: a soft 'pop' into a two-note glass chime (D6 over A5): something appears."""
    mix = Mix(0.9)
    mix.add(inst.pluck(74, 0.05, 0.6, 1.0), 0.0, 'arp', hall=0.2)
    mix.add(inst.glass(81, 0.5, 0.7), 0.025, 'bell', hall=0.3)
    mix.add(inst.glass(86, 0.45, 0.45), 0.05, 'bell', hall=0.3)
    x = mix.render(0.1, hall_decay=0.9)[:secs(0.4)]
    k = secs(0.15)
    x[-k:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k)))[:, None]
    return x


def sfx_strike():
    """~0.25 s marker stroke: band-passed noise with a felt-tip 'squeak' resonance that
    rises as the pen speeds up, grainy paper texture, slight left-to-right travel."""
    rng = np.random.default_rng(77)
    n = secs(0.25)
    t = np.arange(n) / SR
    u = t / 0.25
    nz = rng.standard_normal(n)
    grain = 1 + 0.5 * lp(rng.standard_normal(n), 120) * 6
    env = np.sin(np.pi * np.clip(u * 1.05, 0, 1)) ** 0.6 * (0.7 + 0.3 * u)
    fc = 1800 + 2600 * u
    body = svf_env(nz, fc, 2.2, 1) * 0.6 + hp(nz, 5000) * 0.12
    squeak = svf_env(nz, fc * 1.9, 9.0, 1) * 0.25
    y = (body + squeak) * env * grain * 0.5
    y = sat(y, 1.3)
    p = -0.35 + 0.7 * u
    out = np.stack([y * np.cos((p + 1) * np.pi / 4), y * np.sin((p + 1) * np.pi / 4)], axis=1) * np.sqrt(2)
    out = out + 0.08 * reverb(out, decay=0.4, predelay=0.003, seed=4)
    return out


def finish_sfx(x, peak_db=-6.0):
    """Interface sounds are set by true peak (-6 dBTP), not LUFS: they are too short for
    an integrated loudness reading (LUFS needs 0.4 s blocks) and should sit *under* a film."""
    x = width(hp(x, 60), 0.5)
    tp = true_peak_db(x)
    x = x * 10 ** ((peak_db - tp) / 20)
    return edges(x, 0.0005, 0.004)
