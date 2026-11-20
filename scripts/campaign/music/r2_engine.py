"""Round-two score engine: write notes per instrument in beats (or seconds), render each instrument with the
GeneralUser GS soundfont through fluidsynth, then mix in numpy (our own reverb, EQ, master to -14 LUFS / -1 dBTP).

WHY a new engine instead of song.py: round one was one piano + home-made synth pads at one tempo. Round two needs
a whole orchestra/band palette (strings, brass, celesta, harp, drum kits), tempo maps keyed to narration, and
several films, while song.py keeps rendering the round-one cuts unchanged.

Time: a TimeMap turns beats into seconds through anchor points (beat, second), linear in between, so a film
keyed to a voice can stretch a section to land a chord exactly on a word while still being written in bars."""
import hashlib, os, struct, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import soundfile as sf
from scipy import signal
import dsp
from dsp import SR, db, lp, hp

HERE = os.path.dirname(os.path.abspath(__file__))
SF2 = os.path.join(HERE, 'assets', 'GeneralUser-GS.sf2')
CACHE = os.path.join(HERE, 'assets', 'cache', 'r2')
OUT = os.path.join(HERE, 'out')

# ----------------------------------------------------------------------------- harmony helpers
NOTE = {n: i for i, n in enumerate('C C# D D# E F F# G G# A A# B'.split())}
NOTE.update({'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10})


def m(name):
    """'C4' -> 60, 'F#3' -> 54."""
    i = 2 if name[1] in '#b' else 1
    return 12 * (int(name[i:]) + 1) + NOTE[name[:i]]


def ms(names):
    return [m(x) for x in names.split()]


# ----------------------------------------------------------------------------- time
class TimeMap:
    def __init__(self, anchors):
        self.b = np.array([a[0] for a in anchors], float)
        self.s = np.array([a[1] for a in anchors], float)

    def t(self, beat):
        # WHY linear extrapolation past the ends: tails (ring-outs) are written in beats after the last anchor
        if beat <= self.b[0]:
            k = 0
        elif beat >= self.b[-1]:
            k = len(self.b) - 2
        else:
            return float(np.interp(beat, self.b, self.s))
        sl = (self.s[k + 1] - self.s[k]) / (self.b[k + 1] - self.b[k])
        return float(self.s[k] + (beat - self.b[k]) * sl)

    @staticmethod
    def const(bpm, t0=0.0):
        return TimeMap([(0, t0), (1000, t0 + 1000 * 60.0 / bpm)])


# ----------------------------------------------------------------------------- tracks
class Track:
    def __init__(self, song, name, program, bank=0, drum=False, pan=0.0, gain_db=0.0, send=0.15,
                 hpf=None, lpf=None, eq=(), jitter_ms=0.0, vel_jit=0, volume=100, transpose=0, lead_ms=0.0):
        self.song, self.name, self.program, self.bank, self.drum = song, name, program, bank, drum
        self.pan, self.gain_db, self.send, self.hpf, self.lpf, self.eq = pan, gain_db, send, hpf, lpf, eq
        self.jit, self.vel_jit, self.volume, self.transpose = jitter_ms / 1000.0, vel_jit, volume, transpose
        # WHY lead_ms: bowed strings and brass samples speak 10-30 ms after note-on; playing them that much early
        # puts their attack on the beat together with the drums and piano
        self.lead = lead_ms / 1000.0
        self.notes, self.ccs, self.bends = [], [], []

    # beats ------------------------------------------------------------------
    def n(self, beat, dur, midi, vel, exact=None):
        """Note(s) at a beat, duration in beats. midi may be an int, a list, or a 'C4 E4' string.
        WHY: notes ON a beat are exact (cuts and hits lock); off-beat notes get a little seeded timing jitter."""
        tm = self.song.tm
        t0, t1 = tm.t(beat), tm.t(beat + dur)
        if exact is None:
            exact = abs(beat - round(beat)) < 1e-9
        self.ns(t0, t1 - t0, midi, vel, jitter=not exact)

    def ns(self, t, dur, midi, vel, jitter=False):
        """Note(s) at an absolute time in seconds."""
        if isinstance(midi, str):
            midi = ms(midi)
        if not isinstance(midi, (list, tuple)):
            midi = [midi]
        rng = self.song.rng
        for mm in midi:
            tj = t - self.lead + (float(rng.uniform(-self.jit, self.jit)) if (jitter and self.jit) else 0.0)
            v = vel + (int(rng.integers(-self.vel_jit, self.vel_jit + 1)) if self.vel_jit else 0)
            self.notes.append((max(0.0, tj), max(0.02, dur), int(mm) + self.transpose, int(np.clip(v, 1, 127))))

    def roll(self, beat, dur, midis, vel, spread_s=0.025):
        """Rolled (arpeggiated) chord: lowest note on the beat, each higher one spread_s later."""
        t0 = self.song.tm.t(beat)
        d = self.song.tm.t(beat + dur) - t0
        for i, mm in enumerate(ms(midis) if isinstance(midis, str) else midis):
            self.ns(t0 + i * spread_s, d - i * spread_s, mm, vel)

    def cc(self, t, num, val):
        self.ccs.append((t, num, int(np.clip(val, 0, 127))))

    def ramp(self, t0, t1, v0, v1, num=11, steps=None, curve=1.0):
        """Expression (CC11) swell from v0 to v1 between two times (seconds)."""
        steps = steps or max(2, int((t1 - t0) * 40))
        for i in range(steps + 1):
            u = i / steps
            self.cc(t0 + u * (t1 - t0), num, v0 + (v1 - v0) * (u ** curve))

    # midi -------------------------------------------------------------------
    def midi_bytes(self, length):
        """Single-track SMF, 1 tick = 0.5 ms (tpq 1000, tempo 500000 us)."""
        ch = 9 if self.drum else 0
        T = lambda s: int(round(s * 2000))
        ev = []   # (tick, order, bytes)  order: cc 0, off 1, on 2  -> note-offs before note-ons at the same tick
        ev.append((0, 0, bytes([0xB0 | ch, 0, 0 if not self.drum else 0])))
        ev.append((0, 0, bytes([0xB0 | ch, 32, 0])))
        ev.append((0, 0, bytes([0xC0 | ch, self.program])))
        ev.append((0, 0, bytes([0xB0 | ch, 7, self.volume])))
        ev.append((0, 0, bytes([0xB0 | ch, 10, int(np.clip(64 + self.pan * 63, 0, 127))])))
        ev.append((0, 0, bytes([0xB0 | ch, 11, 127])))
        ev.append((0, 0, bytes([0xB0 | ch, 91, 0]))); ev.append((0, 0, bytes([0xB0 | ch, 93, 0])))
        for t, num, val in self.ccs:
            ev.append((T(t), 0, bytes([0xB0 | ch, num, val])))
        # WHY: two overlapping notes of the same pitch on one channel share one note-off; trim the earlier one so
        # its note-off never silences the later note.
        by_pitch = {}
        for t, d, mm, v in sorted(self.notes):
            by_pitch.setdefault(mm, []).append([t, d, v])
        for mm, lst in by_pitch.items():
            for i, (t, d, v) in enumerate(lst):
                if i + 1 < len(lst) and t + d > lst[i + 1][0] - 0.002:
                    d = max(0.01, lst[i + 1][0] - t - 0.002)
                ev.append((T(t), 2, bytes([0x90 | ch, mm, v])))
                ev.append((T(t + d), 1, bytes([0x80 | ch, mm, 0])))
        end = max([T(t + d) for t, d, _, _ in self.notes] + [T(length)]) + T(3.0)
        ev.append((end, 0, bytes([0xB0 | ch, 121 if False else 11, 127])))   # keeps the player alive for tails
        ev.sort(key=lambda e: (e[0], e[1]))
        trk, last = bytearray(), 0
        for tk, _, b in ev:
            trk += _vlq(tk - last) + b
            last = tk
        trk += b'\x00\xFF\x2F\x00'
        hdr = b'MThd' + struct.pack('>IHHH', 6, 0, 1, 1000)
        body = b'\x00\xFF\x51\x03' + (500000).to_bytes(3, 'big') + bytes(trk)
        return hdr + b'MTrk' + struct.pack('>I', len(body)) + body


def _vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def render_midi(mid, n):
    """fluidsynth -> float stereo array of exactly n samples (cached by content hash)."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(mid + str(os.path.getsize(SF2)).encode() + b'v2').hexdigest()
    p = os.path.join(CACHE, key + '.npy')
    if os.path.exists(p):
        x = np.load(p)
    else:
        with tempfile.TemporaryDirectory() as td:
            fm, fw = os.path.join(td, 'a.mid'), os.path.join(td, 'a.wav')
            open(fm, 'wb').write(mid)
            # WHY float output and gain 0.4: dense orchestral stems must never clip inside fluidsynth;
            # our own mixer sets the real levels. Fluidsynth's reverb/chorus are off (-R 0 -C 0): one shared room.
            subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-g', '0.4', '-R', '0', '-C', '0',
                            '-o', 'synth.polyphony=1024', '-o', 'audio.file.format=float', '-o', 'audio.file.type=wav',
                            '-F', fw, SF2, fm], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            x, sr = sf.read(fw, dtype='float64', always_2d=True)
            assert sr == SR
        np.save(p, x)
    return dsp.fit(x, n)


# ----------------------------------------------------------------------------- song
class Song:
    def __init__(self, name, length, tm, seed=1):
        self.name, self.length, self.tm = name, length, tm
        self.n = int(round(length * SR))
        self.rng = np.random.default_rng(seed)
        self.tracks = {}
        self.extra = []    # (name, stereo array, gain_db, send)

    def track(self, name, program, **kw):
        tr = Track(self, name, program, **kw)
        self.tracks[name] = tr
        return tr

    def add_audio(self, name, x, t, gain_db=0.0, send=0.1):
        buf = np.zeros((self.n, 2))
        x = dsp.stereo(x)
        i = int(round(t * SR))
        if i < 0:
            x, i = x[-i:], 0
        j = min(self.n, i + len(x))
        if j > i:
            buf[i:j] += x[:j - i]
        self.extra.append((name, buf, gain_db, send))

    def render_stems(self):
        """-> dict name -> (stereo dry array after per-track gain/EQ, send amount)."""
        trs = [t for t in self.tracks.values() if t.notes]
        with ThreadPoolExecutor(max_workers=min(16, os.cpu_count() or 4)) as ex:
            raws = list(ex.map(lambda t: render_midi(t.midi_bytes(self.length), self.n), trs))
        stems = {}
        for tr, x in zip(trs, raws):
            if tr.hpf: x = hp(x, tr.hpf)
            if tr.lpf: x = lp(x, tr.lpf)
            for f0, g, q in tr.eq:
                x = dsp.peak_eq(x, f0, g, q)
            stems[tr.name] = (x * db(tr.gain_db), tr.send)
        for name, x, g, s in self.extra:
            stems[name] = (stems[name][0] + x * db(g), s) if name in stems else (x * db(g), s)
        return stems


def mixdown(song, stems, rt60=1.9, wet_db=-9.0, air_db=2.0, fade_end=None, fade_len=1.2, extra_bus=None, air_hz=5000):
    """Dry sum + one shared hall, light tone shaping, end fade. Returns the (unmastered) stereo music bus.
    WHY a shorter hall (1.9 s) with a 9 kHz damp: round one's room smeared everything ('muffled'); this keeps
    the transients and the 4-8 kHz detail clear while still sounding like one storybook orchestra."""
    n = song.n
    dry = np.zeros((n, 2))
    send = np.zeros((n, 2))
    for name, (x, s) in stems.items():
        dry += x
        send += x * s
    ir = dsp.make_ir(rt60=rt60, predelay=0.018, damp_hz=9000, seed=5)
    wet = dsp.reverb(lp(hp(send, 220), 10000), ir, n) * db(wet_db)
    x = dry + wet
    x = hp(x, 28, 4)
    x = dsp.peak_eq(x, 320, -2.0, 0.8)          # WHY: soundfont strings/brass pile up around 300 Hz (boxy)
    x = dsp.high_shelf(x, air_hz, air_db)          # WHY: a little air so it never reads as muffled
    x = fade_in_out(x, fade_end, fade_len)
    return x


def fade_in_out(x, fade_end=None, fade_len=1.2):
    x = x.copy()
    fi = int(0.008 * SR)
    x[:fi] *= (np.sin(np.linspace(0, np.pi / 2, fi)) ** 2)[:, None]
    if fade_end is not None:
        # WHY: everything must be silent by fade_end (picture's clean end); a cos^2 fade over the last
        # fade_len seconds of an already-decaying chord reads as a natural ring-out, not a cut.
        e = int(round(fade_end * SR))
        s = max(0, e - int(fade_len * SR))
        x[s:e] *= (np.cos(np.linspace(0, np.pi / 2, e - s)) ** 2)[:, None]
        x[e:] = 0
    x[-1] = 0
    return x


def finish(x, path, n, target=-14.0):
    """Master to target LUFS with true peak under -1 dBTP (limiter ceiling -1.3 for margin), write 24-bit wav."""
    y = dsp.master(x, target=target, tp_ceiling=-1.3)
    y = dsp.fit(y, n)
    y[-1] = 0
    sf.write(path, y, SR, subtype='PCM_24')
    return y


# ----------------------------------------------------------------------------- synthesised sounds
def riser(dur, rng, f0=400, f1=7000, shape=2.2):
    """Noise swell whose loudness peaks exactly at its end (place end on the hit). Band sweeps up."""
    k = int(dur * SR)
    t = np.arange(k) / SR
    u = t / dur
    nz = rng.standard_normal((k, 2))
    # WHY: crossfade three fixed bands rather than a time-varying filter: cheap, click-free, reads as a sweep
    # bands spaced evenly in pitch between f0 and f1 (slightly overlapping), valid for any f0 < f1
    e = [f0 * (f1 / f0) ** (k / 3) for k in range(4)]
    bands = [dsp.bp(nz, e[k] * (0.85 if k else 1.0), min(e[k + 1] * 1.15, 0.95 * SR / 2)) for k in range(3)]
    bands = [b_ / (b_.std() + 1e-9) for b_ in bands]
    w = [np.clip(1 - 2 * u, 0, 1), 1 - np.abs(2 * u - 1), np.clip(2 * u - 1, 0, 1)]
    x = sum(b_ * w_[:, None] for b_, w_ in zip(bands, w))
    env = u ** shape
    x *= env[:, None]
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]
    return x / (np.abs(x).max() + 1e-9)


def boom(rng, f=45.0, dur=1.6):
    """Sub 'thump' under a big hit: pitch-dropping sine with a short click, felt more than heard."""
    t = np.arange(int(dur * SR)) / SR
    fr = f + 70 * np.exp(-t / 0.05)
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.minimum(1, t / 0.002) * np.exp(-t / 0.45)
    return dsp.stereo(x / np.abs(x).max())


def sparkle(rng, notes, start_gap=0.045, dur=1.4):
    """Tiny sine-bell glitter (for 'cute' and 'wonder' moments), stereo-spread."""
    out = np.zeros((int((dur + start_gap * len(notes)) * SR), 2))
    for i, mm in enumerate(notes):
        f = 440 * 2 ** ((mm - 69) / 12)
        t = np.arange(int(dur * SR)) / SR
        w = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.08)) * np.minimum(1, t / 0.002) * np.exp(-t / 0.35)
        o = int(i * start_gap * SR)
        out[o:o + len(w)] += dsp.pan(w, (-0.6 + 1.2 * i / max(1, len(notes) - 1)))
    return out / np.abs(out).max()


def marker(rng, strokes, total):
    """Felt-tip marker on paper. strokes: list of (t0, dur, intensity, brightness). Returns mono array of `total` s.
    WHY this recipe: a marker is friction noise, mostly 1.5-7 kHz, whose grain flutters with the hand (random
    amplitude modulation 25-70 Hz), with a soft 'tick' when the tip lands and a squeak-ish resonance that moves
    with speed. Each stroke rises fast, holds, and lifts off quickly."""
    n = int(total * SR)
    out = np.zeros(n)
    for t0, d, inten, br in strokes:
        k = int(d * SR)
        t = np.arange(k) / SR
        nz = rng.standard_normal(k + 2048)
        body = dsp.bp(nz, 1400 * br, 6500 * min(1.25, br))[:k]
        hiss = dsp.bp(nz, 5000, 11000)[:k] * 0.35
        # friction grain: band-limited random AM
        am = lp(rng.standard_normal(k + 4096), float(rng.uniform(25, 70)), 2)[:k]
        am = 1 + 1.6 * am / (np.abs(am).max() + 1e-9)
        am = np.clip(am, 0.15, None)
        # a resonance that glides with stroke speed (the 'squeak' of the felt)
        fres = rng.uniform(2200, 3400) * br * (1 + 0.25 * np.sin(2 * np.pi * rng.uniform(2, 5) * t))
        res = np.sin(2 * np.pi * np.cumsum(fres) / SR) * 0.18 * lp(np.abs(rng.standard_normal(k)), 30, 1) * 4
        env = np.minimum(1, t / 0.012) * np.minimum(1, (d - t) / 0.02).clip(0) ** 1.5
        s = (body / (body.std() + 1e-9) + hiss / (hiss.std() + 1e-9) * 0.35 + res) * am * env * inten
        tick = np.zeros(k)
        tk = int(0.004 * SR)
        # WHY the 0.3 ms rise (round three): the tip's tick started at full level and measured as a digital click
        tick[:tk] = dsp.bp(rng.standard_normal(tk + 512), 800, 4000)[:tk] * np.exp(-np.arange(tk) / (0.0012 * SR)) * 2.5 * np.minimum(1, np.arange(tk) / (0.0003 * SR))
        i = int(t0 * SR)
        j = min(n, i + k)
        out[i:j] += (s + tick * inten)[:j - i]
    return out / (np.abs(out).max() + 1e-9)
