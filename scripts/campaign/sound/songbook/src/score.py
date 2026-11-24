"""How a piece is DESCRIBED and TIMED: sections, transitions, and the tempo map that makes
section boundaries land on given times (scoring to picture).

A piece is a list of Sections. Each section names a mood and a number of bars, optionally the
tune segments it plays, layers to add or drop, and a target start time. See SONGBOOK.md,
"Technical appendix", for a worked example.

Timing (how boundaries land on picture):
  * Every section has a usual tempo (from its mood, or `bpm=`).
  * Times you pin (`start=` on a section, and the logo's landing time at the end) split the
    piece into spans. Within a span, every section's tempo is scaled by the same small factor
    so the span fills its time exactly. So boundaries land EXACTLY (to the sample), and the
    composer's job is to choose bar counts that keep that factor small (the report prints
    every section's final tempo and how far it moved; keep it within about 5 %).
  * A held chord (`into="hold"`, `hold=` beats) adds a fermata at a section's end: use it when
    a cut comes a little later than the bars allow, instead of stretching the tempo.
  * `into="build"` grows into the next section over the last bar; if the next section is at a
    different tempo, that last bar also speeds up or slows down smoothly toward it.
"""
import hashlib
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

import tune as T
from dsp import SR, note, pan, place
from moods import MOODS

LOGO_LAND = 0.5       # in both logo files the name lands 0.50 s after the file starts
LOGO_LEN = {"blend": 3.0, "piano": 2.5}
RIT = 0.85            # THE ENDING slows into the logo: its last bar ends at 85 % of the tempo
BLEND_BARS = 2        # a mood change is prepared over this many bars (Section.span)


@dataclass
class Section:
    mood: str
    bars: int
    tune: object = None              # None, a segment name, or a list of them (tune.SEGMENTS)
    start: Optional[float] = None    # pin this section's start to a time (seconds)
    bpm: Optional[float] = None      # override the mood's usual tempo
    voice: Optional[str] = None      # "piano" | "violin" | "both"
    accomp: Optional[str] = None     # override the accompaniment pattern
    add: tuple = ()                  # layers to switch on
    drop: tuple = ()                 # layers to switch off
    chords: Optional[list] = None    # explicit chords, one list per bar (rarely needed)
    form: Optional[str] = None       # override "bright" / "dark"
    turn: bool = False               # last bar becomes A-flat, B-flat sus (leads to brighter)
    lift: bool = False               # THE LIFT: the whole section grows (see blocks.lift)
    into: str = "auto"               # transition into the NEXT section: auto|blend|build|flow|hold|breath
    span: int = BLEND_BARS           # bars a blend/build takes (the new mood grows in underneath)
    hold: Optional[float] = None     # beats of held chord for hold/breath
    narration: bool = False          # a voice talks here: level down, speech-range dip
    level_db: Optional[float] = None # hand-set music level for this section (dB)
    dyn: Optional[float] = None      # override how hard everyone plays
    label: str = ""                  # a name for the report
    # ---- composing controls (2026-11-23; see SONGBOOK.md "Composing a score"). WHY: the blocks
    # above could only switch whole layers on for whole sections, so the only kind of change a
    # score could make was "more instruments". These let a section develop instead.
    counter: object = None           # a motif.Phrase sung against the tune (a second line)
    counter_voice: str = "cello"     # "cello" | "viola" | "violin" | "piano" | "pizz"
    answer: object = None            # a motif.Phrase for the second piano instead of the automatic answer
    bass: object = None              # None (chord roots) | "walk" | "pedal:Eb2" | a motif.Phrase (the bass line itself)
    vary: Optional[dict] = None      # {bar number (1-based): "thin"|"half"|"drop"|"rest"|"bass"|"full"} per-bar texture
    density: Optional[float] = None  # 0-1: leave out the accompaniment's weaker beats (1 = all)
    register: int = 0                # move the accompaniment's middle notes (not the bass) by semitones (+12 / -12)
    shape: object = None             # loudness across the section: "swell"|"fade"|"arch"|"drop-lift" or [(beat, x)]
    broaden: float = 0.0             # slow the section's last two beats by this fraction (0.02 = 2 %), then a tempo
    push: float = 0.0                # ms the tune sits ahead (-) or behind (+) the beat (timing feel)
    legato: float = 0.0              # beats each tune note overlaps the next (a singing, joined touch)
    lead: Optional[float] = None     # tune touch relative to the band (1.0 = mood default; 0.8 = more inward)
    pedal: Optional[bool] = None     # override the mood's sustain pedal for this section


@dataclass
class Piece:
    name: str
    length: float                    # seconds, including the logo
    sections: list
    logo: str = "blend"              # "blend" (piece with music) or "piano"
    seed: int = 1
    notes: str = ""
    land: Optional[float] = None     # when the name lands (default: length - logo tail)
    ending_start: Optional[float] = None  # pin the ending bar's start too (e.g. on a cut)
    rit: float = RIT                 # how much the ending bar slows (end tempo / start tempo)
    # WHY (Destin, 2026-11-20, on "Own everything": "for this specific ad, the music should be a
    # little more subtle"): a piece may sit below the usual -14 LUFS, so a thinner arrangement is
    # not simply turned back up to full loudness by the final stage.
    loudness: float = -14.0
    # ---- 2026-11-23. WHY style: the new defaults (a blend that hands over instead of stacking two
    # accompaniments, an answer that listens for space in the tune, no tempo lurch into the ending)
    # change how a piece sounds, so the pieces the owner has already heard pin "v1" and stay
    # byte-for-byte what he heard; every new piece gets "v2".
    style: str = "v2"
    peak: Optional[float] = None     # seconds: THE climax (the composition checks hold the score to it)
    speech: list = field(default_factory=list)   # [(t0, t1)] seconds where a narrator is speaking

    def land_time(self):
        return self.land if self.land is not None else self.length - (LOGO_LEN[self.logo] - LOGO_LAND)


# ====================================================================== the plan

@dataclass
class Bar:
    beat: float                      # global beat of its downbeat
    pos: Optional[int]               # position in the eight-bar progression (0-7)
    chords: list                     # one or two chord names
    tune: list = field(default_factory=list)   # (beat in bar, midi, beats, canonical id, touch)


@dataclass
class SecPlan:
    i: int
    sec: Section
    mood: dict
    form: str
    voice: str
    accomp: str
    layers: set
    dyn: float
    beat0: float
    bars: list
    hold: float
    bpm: float = 0.0
    nominal_bpm: float = 0.0
    t0: float = 0.0
    t1: float = 0.0
    ending: bool = False

    @property
    def beats(self):
        return 4 * len(self.bars) + self.hold

    @property
    def beat1(self):
        return self.beat0 + self.beats

    def chord_at(self, beat):
        """Chord sounding at a global beat inside this section."""
        k = int(np.clip((beat - self.beat0) // 4, 0, len(self.bars) - 1))
        b = self.bars[k]
        if len(b.chords) == 1 or beat - b.beat < 2:
            return b.chords[0]
        return b.chords[1]


def _tune_bars(sec, form):
    """Lay the section's tune segments (names or motif.Phrase objects) over its bars; give each
    bar its progression position."""
    segs = sec.tune if isinstance(sec.tune, (list, tuple)) else ([sec.tune] if sec.tune else [])
    bars = [Bar(0, None, []) for _ in range(sec.bars)]
    k = 0
    for s in segs:
        if hasattr(s, "notes"):
            # a Phrase: its notes carry their own origin tags; it does not set the progression
            for n in s.notes:
                bi = k + int(n.beat // 4)
                if bi >= sec.bars:
                    continue
                bars[bi].tune.append((n.beat - 4 * int(n.beat // 4), int(n.m), n.dur, tuple(n.src), n.vel))
            k += s.nbars
            continue
        # "phrase1:3" = only the first 3 bars of the first phrase (the rest of its 4 bars rest)
        s, _, cut = s.partition(":")
        notes, nbars, p0 = T.SEGMENTS[s]
        if cut:
            notes = [x for x in notes if x[0] < 4 * int(cut)]
        for j in range(nbars):
            if k + j >= sec.bars:
                break
            if p0 is not None:
                bars[k + j].pos = (p0 + j) % 8
        for b, nm, d in notes:
            bi = k + int(b // 4)
            if bi >= sec.bars:
                continue
            canon = (s, b)
            bars[bi].tune.append((b - 4 * int(b // 4), note(nm), d, canon, 1.0))
        k += nbars
    # bars without a position continue counting from the previous bar
    last = -1
    for b in bars:
        if b.pos is None:
            b.pos = (last + 1) % 8
        last = b.pos
    for j, b in enumerate(bars):
        if sec.chords:
            b.chords = list(sec.chords[j])
        else:
            b.chords = list(T.PROGRESSION[form][b.pos])
    if sec.turn:
        bars[-1].chords = list(T.TURN)
    return bars


def plan(piece):
    """Turn a Piece into timed section plans (plus the ending bar)."""
    plans = []
    beat = 0.0
    for i, s in enumerate(piece.sections):
        mood = dict(MOODS[s.mood])
        form = s.form or mood["form"]
        layers = (set(mood["layers"]) | set(s.add)) - set(s.drop)
        voice = s.voice or mood["voice"]
        if voice in ("violin", "both"):
            layers.add("violin")
        into = s.into
        if into == "auto":
            # WHY the default: a change of mood is prepared over two bars (BLEND), the way a band
            # moves into a new feel; the same mood carrying on simply flows
            nxt = piece.sections[i + 1] if i + 1 < len(piece.sections) else None
            into = "blend" if (nxt is not None and (nxt.mood != s.mood or (nxt.bpm or 0) != (s.bpm or 0))) else "flow"
        hold = s.hold if s.hold is not None else {"hold": 2.0, "breath": 1.0}.get(into, 0.0)
        bars = _tune_bars(s, form)
        for j, b in enumerate(bars):
            b.beat = beat + 4 * j
        p = SecPlan(i, s, mood, form, voice, s.accomp or mood["accomp"], layers,
                    s.dyn if s.dyn is not None else mood["dyn"], beat, bars, hold)
        p.nominal_bpm = s.bpm or mood["tempo"][1]
        p.into = into
        p.span = max(1, min(s.span, len(bars)))
        plans.append(p)
        beat += p.beats
    # THE ENDING bar: same players as the last section, ending chords, ending tune
    last = plans[-1]
    eb = Bar(beat, None, list(T.ENDING_CHORDS),
             [(b, note(nm), d, ("ending", b), 1.0) for b, nm, d in T.ENDING])
    ep = SecPlan(len(plans), last.sec, last.mood, "bright", last.voice, last.accomp, set(last.layers),
                 last.dyn, beat, [eb], 0.0, ending=True)
    ep.nominal_bpm = last.nominal_bpm
    ep.into, ep.span = "end", 1
    for b, nm, d in T.LOGO_CELL:        # the logo's pick-up notes belong to the ending bar
        if b < 4:
            eb.tune.append((b, note(nm), d, ("logo", b), 1.0))
    plans.append(ep)
    _fit_tempi(piece, plans)
    return plans


# ---------------------------------------------------------------------- tempo map

class TempoMap:
    """Piecewise tempo: each segment is (beat0, beats, bpm at start, bpm at end), tempo moving
    in a straight line in between. seconds(beat) is exact (closed form)."""

    def __init__(self, segs):
        self.segs = segs
        self.t0 = [0.0]
        for b0, nb, a, c in segs:
            self.t0.append(self.t0[-1] + self._dur(nb, nb, a, c))

    @staticmethod
    def _dur(x, nb, a, c):
        if abs(c - a) < 1e-9:
            return 60.0 * x / a
        k = (c - a) / nb
        return 60.0 / k * np.log((a + k * x) / a)

    def seconds(self, beat):
        for j, (b0, nb, a, c) in enumerate(self.segs):
            if beat < b0 + nb or j == len(self.segs) - 1:
                return self.t0[j] + self._dur(beat - b0, nb, a, c)

    def bpm_at(self, beat):
        for b0, nb, a, c in self.segs:
            if beat < b0 + nb:
                return a + (c - a) * (beat - b0) / nb
        return self.segs[-1][3]


def _segments(plans, bpms, rit=RIT):
    segs = []
    for k, p in enumerate(plans):
        a = bpms[k]
        body = 4 * len(p.bars)
        if p.ending:
            # THE ENDING: one bar slowing in a straight line into the logo's landing (a
            # ritardando), then the final tempo holds for the logo's last notes and the tail
            segs.append((p.beat0, body, a, a * rit))
            segs.append((p.beat0 + body, 64, a * rit, a * rit))
            continue
        nxt = bpms[k + 1]
        ramp = (p.into in ("blend", "build") and abs(nxt / a - 1) > 0.03)
        if ramp:
            # WHY the change of speed spreads over the blend's bars: the players speed up (or
            # broaden) gradually INTO the new section, while its pattern is already growing
            # underneath, instead of a jump at the bar line
            r = 4 * p.span
            segs.append((p.beat0, body - r, a, a))
            segs.append((p.beat0 + body - r, r, a, nxt))
        elif getattr(p.sec, "broaden", 0.0) and not p.ending:
            # WHY: a phrase end that broadens a little (a singer taking time before the next
            # line) is the most human timing gesture there is; the next section starts a tempo
            segs.append((p.beat0, body - 2, a, a))
            segs.append((p.beat0 + body - 2, 2, a, a * (1 - p.sec.broaden)))
        else:
            segs.append((p.beat0, body, a, a))
        if p.hold:
            segs.append((p.beat0 + body, p.hold, a, a))
    return [s for s in segs if s[1] > 0]


def _fit_tempi(piece, plans):
    """Scale tempi span by span so pinned times land exactly (see module docstring)."""
    anchors = {0: 0.0}
    for k, p in enumerate(plans[:-1]):
        if p.sec.start is not None and k > 0:
            anchors[k] = float(p.sec.start)
    if piece.ending_start is not None:
        anchors[len(plans) - 1] = float(piece.ending_start)
    anchors[len(plans)] = piece.land_time()          # the downbeat after the ending bar
    keys = sorted(anchors)
    bpms = [p.nominal_bpm for p in plans]
    for _ in range(80):
        tm = TempoMap(_segments(plans, bpms, piece.rit))
        worst = 0.0
        for a, b in zip(keys[:-1], keys[1:]):
            ta = tm.seconds(plans[a].beat0)
            tb = tm.seconds(plans[b].beat0) if b < len(plans) else tm.seconds(plans[-1].beat0 + 4)
            want = anchors[b] - anchors[a]
            f = (tb - ta) / want
            worst = max(worst, abs(f - 1))
            for k in range(a, b):
                bpms[k] *= f
        if worst < 1e-10:
            break
    tm = TempoMap(_segments(plans, bpms, piece.rit))
    for k, p in enumerate(plans):
        p.bpm = bpms[k]
        p.t0 = tm.seconds(p.beat0)
        p.t1 = tm.seconds(p.beat1)
    plans[-1].land_beat = plans[-1].beat0 + 4
    plans[0].tempo_map = tm
    for p in plans:
        p.tm = tm


# ====================================================================== the players

def _h(*key):
    """Deterministic humanising noise in [-1, 1] keyed by the note itself, so leaving the tune
    out (for measurement) never shifts any other note's timing or loudness."""
    d = hashlib.sha1(repr(key).encode()).digest()
    u = int.from_bytes(d[:4], "little") / 2 ** 32
    v = int.from_bytes(d[4:8], "little") / 2 ** 32
    return (u + v) - 1.0          # sum of two uniforms: a soft bell


BUSES = ["lead", "sing", "double", "answer", "counter", "piano", "pizz", "bowed", "air", "synth", "sub"]
TUNE_BUSES = ("lead", "sing", "double")
# How much string brilliance each piano part gets (engine/sounds.py, _brilliance): a fraction
# of the note's peak. The tune gets the most (it should sparkle); the low accompaniment none.
SHINE = dict(lead=0.08, answer=0.04, double=0.035)


class Band:
    """Places notes on buses, by beat, through the tempo map, with humanised timing and
    loudness. `backing=True` leaves the tune (and its doublings) out, for the
    'is the tune on top' measurement; nothing else moves."""

    def __init__(self, piece, plans, backing=False, dry=False):
        # WHY dry: the note dump and the composition checks need every note the score plays but
        # not the sound; skipping synthesis makes a 60 s score readable in about a second
        self.dry = dry
        self.log = []           # every note placed: dict(t, beat, m, dur, vel, bus, role, part)
        if not dry:
            import sounds
            self.S = sounds
        self.piece = piece
        self.plans = plans
        self.tm = plans[0].tm
        self.n = int(round(piece.length * SR))
        self.bus = {b: np.zeros((self.n if not dry else 1, 2)) for b in BUSES}
        self.backing = backing
        self.melody = []        # (seconds, midi) of every audible tune note (lead voice)
        self.tune_log = []      # (seconds, midi, canonical id, voice) for the identity check
        self.onsets = []        # (seconds, bus)
        self.held_spans = []
        self.swing = 0.0

    # ---- time
    def sec(self, beat):
        return float(self.tm.seconds(beat))

    def secs(self, beat, beats):
        return self.sec(beat + beats) - self.sec(beat)

    def when(self, beat, jit_ms, key):
        frac = beat % 1.0
        sw = self.swing if abs(frac - 0.5) < 1e-6 else 0.0
        # WHY never before 0: the piece's first note must start the file, not be cut off by it
        return max(0.0, self.sec(beat) + sw + _h("t", self.piece.seed, key) * jit_ms / 1000.0)

    def vary(self, v, key, sd=0.03):
        return float(np.clip(v + sd * _h("v", self.piece.seed, key), 0.04, 0.95))

    def _log(self, t, beat, m, beats, vel, bus, role, part):
        self.log.append(dict(t=float(t), beat=float(beat), m=int(m), dur=float(beats), vel=float(vel), bus=bus,
                             role=role or "", part=part))

    def _put(self, bus, x, t, p=0.0, role="", m=None, canon=None):
        if x is None:                               # dry: bookkeeping only
            if role == "lead":
                self.melody.append((t, m))
                self.tune_log.append((t, m, canon, bus))
            self.onsets.append((t, bus))
            return
        if role == "lead":
            self.melody.append((t, m))
            self.tune_log.append((t, m, canon, bus))
        if self.backing and (role in ("lead", "double") or bus in TUNE_BUSES):
            return
        if p:
            x = x * np.array([1 - max(p, 0), 1 + min(p, 0)])
        place(self.bus[bus], x, t)
        self.onsets.append((t, bus))

    # ---- instruments
    def piano(self, bus, beat, m, beats, vel, tone=0.0, pedal=False, p=0.0, jit=5.0, role="", canon=None,
              early=0.0):
        key = (bus, round(beat, 4), int(m))
        t = self.when(beat, jit, key) - early
        v = self.vary(vel, key)
        self._log(t, beat, m, beats, v, bus, role, "piano")
        if self.dry:
            return self._put(bus, None, t, p, role, int(m), canon)
        # WHY a tiny per-note tone wobble: the piano has only two recorded loudness layers, so
        # a repeated note would otherwise be the identical sound; a hair of brightness
        # variation is what a real hand does anyway
        x = self.S.felt_piano(m, v, self.secs(beat, beats) * 0.97, pedal=pedal,
                              tone=tone + 0.06 * _h("c", key), shine=SHINE.get(bus, 0.0))
        self._put(bus, x, t, p, role, int(m), canon)

    def pizz(self, sec_, beat, m, vel, p=0.0, jit=7.0, role="", bus="pizz"):
        key = (sec_, "pz", round(beat, 4), int(m))
        if self.dry:
            t = self.when(beat, jit, key)
            self._log(t, beat, m, 0.25, self.vary(vel, key), bus, role, "pizz-" + sec_)
            if role == "lead":
                self.melody.append((t, int(m)))
            self.onsets.append((t, bus))
            return
        x, early = self.S.pizz(sec_, int(m), self.vary(vel, key), rr=int(abs(_h("rr", key)) * 7))
        if p:
            from dsp import pan as _pan
            x = 0.5 * x + 0.5 * _pan(x.mean(axis=1), p)
        t = self.when(beat, jit, key)
        self._log(t, beat, m, 0.25, self.vary(vel, key), bus, role, "pizz-" + sec_)
        if role == "lead":
            self.melody.append((t, int(m)))
        if self.backing and role in ("lead", "double"):
            return
        place(self.bus[bus], x, t - early)
        self.onsets.append((t, bus))

    def bow(self, sec_, beat, m, beats, v0, v1, p=0.0, attack=0.3, release=0.35, bus="bowed",
            role="", jit=6.0, canon=None, shape=None):
        key = (sec_, "bw", round(beat, 4), int(m))
        t = self.when(beat, jit, key)
        d = self.secs(beat, beats)
        self._log(t, beat, m, beats, max(v0, v1) if shape is None else max(y for _, y in shape), bus, role, "bow-" + sec_)
        if self.dry:
            if bus == "bowed":
                self.held_spans.append((t, t + d))
            return self._put(bus, None, t, 0.0, role, int(m), canon)
        x = self.S.bowed(sec_, int(m), d, v0, v1, attack=attack, release=release,
                         rr=int(abs(_h("rr", key)) * 5), shape=shape)
        if p:
            x = 0.6 * x + 0.4 * pan(x.mean(axis=1), p)
        if bus == "bowed":
            self.held_spans.append((t, t + d))
        self._put(bus, x, t, 0.0, role, int(m), canon)

    def synth(self, beat, m, vel, cutoff, p=0.0, gate_beats=0.4):
        key = ("syn", round(beat, 4), int(m))
        t = self.when(beat, 3.0, key)
        self._log(t, beat, m, gate_beats, vel, "synth", "", "synth")
        if self.dry:
            return self._put("synth", None, t)
        x = self.S.synth(int(m), self.vary(vel, key, 0.02), cutoff=cutoff,
                         gate=self.secs(beat, gate_beats), seed=int(abs(_h("s", key)) * 1000))
        self._put("synth", pan(x, p), t)

    def sub(self, beat, m, beats, vel, fin=0.0):
        t = self.sec(beat)
        self._log(t, beat, m, beats, vel, "sub", "", "sub")
        if self.dry:
            return
        x = self.S.sub(int(m), self.secs(beat, beats), vel)
        if fin > 0:
            k = min(len(x), int(fin * SR))
            x[:k] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k))
        place(self.bus["sub"], x, t)
