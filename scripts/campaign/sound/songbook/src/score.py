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
# WHY "quiet" and "none" (2026-11-23): "quiet" is the full-blend logo for a subtle film (no plucked
# violin doubling, no low answer after it, a softer touch: the subtle films' logos measured louder
# than their peaks, and the plucked doubling read as a drum-like attack); "none" is a HAND-ON
# ending for a passage cut from the middle of a longer film: the ending bar's sigh over an open
# B-flat chord that keeps ringing, no logo (the name is not on screen there).
LOGO_LEN = {"blend": 3.0, "piano": 2.5, "quiet": 3.0, "none": 2.5}
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
    # ---- round 7 (2026-11-23), from what the three test scores could not say:
    # WHY answer_skip: Section.answer covered a whole section, so silencing the automatic answer in
    # one bar meant writing the whole answer line by hand (mim did, twice)
    answer_skip: tuple = ()          # bar numbers (1-based) where the automatic answer stays silent
    # WHY ramp/ramp_at: the hand-set level (level_db) used to change over 3 s CENTRED on the section
    # change, so a louder section starting on a narrator's word began rising 1.5 s earlier, under
    # the words before it (tale). "after" starts the change exactly at the section's first beat.
    ramp: float = 3.0                # seconds the level_db change into this section takes
    ramp_at: str = "centre"          # "centre" (on the change) | "after" (starts at it) | "before" (ends at it)
    # ---- round 8 (2026-11-24): THE FIGURE. WHY: the owner heard round 7 as "choppy", "busy/harsh"
    # and "oddly thrown in": notes placed one by one, accompaniments switched bar by bar. A score
    # now stands on one continuous, even figure that reads its pitches from the chords, so the
    # harmony can move while the pulse never stumbles. accomp="figure" plays it (blocks.acc_figure).
    figure: object = None            # "b 2 3 2 4 2 3 2" (one bar) or a list of bars, cycled: b = the bass,
                                     # 1..9 = chord tones counted up from fig_floor, r = rest, - = hold
    step: float = 0.5                # beats per figure token (0.5 = eighths, 0.25 = sixteenths, 1 = quarters)
    fig_floor: object = "G3"         # where the chord-tone ladder starts; a pair ("G3", "C4") opens it
                                     # gradually across the section (register that evolves slowly)
    fig_voice: str = "piano"         # "piano" | "pizz" (plucked) | "synth" (the soft machine)
    fig_touch: float = 0.30          # the figure's touch (even; the downbeat a hair stronger)
    # ---- the rebuild (2026-11-24, toolkit-plan c1 and a2). WHY the pedal pulse: the round-8 figure
    # re-picked its notes from every chord, which adds motion that is not the pulse ("busy"). GTA V's
    # map music circles ONE pool of notes "the same way regardless of the chord changes"; the pad
    # carries the harmony. fig_mode=None keeps the round-8 chord-following figure for old pieces;
    # the recipes set it from recipes.OWNER["pulse"] ([OWNER] A/B, default "pedal").
    fig_mode: Optional[str] = None   # "pedal" (fixed pitch pool, ignores the chords) | "chord" (round 8)
    fig_pedal: object = None         # the pool, played in this order: default the cell + tonic, Bb4 G4 F4 Eb4
    fig_mask: Optional[str] = None   # 16 steps, x = play, . = rest (e.g. "x.xxx.x.x.xxx.x.")
    fig_mask_walk: tuple = (4, 1)    # (every N bars, flip K steps): the mask drifts slowly, seeded
    fig_bass: bool = False           # pedal mode: the chord's root, soft and held, at each chord change
    # WHY fig_order (audit 2026-11-25, defect 3): the pool taken in its written order (B-flat G F
    # E-flat) IS bar 1 of the tune, so the pulse played the tune's opening as a 2-bar loop (about
    # 18 times in 36 s: round 6's "opening bar seven times" failure, in the background). "circle"
    # returns to the pool's first note between the others (B-flat G B-flat F B-flat E-flat), the
    # one-note circling the research describes (Quaeschning); "cell" is the written order.
    # [OWNER] A/B through recipes.OWNER["fig_order"]; old pieces (None) keep "cell".
    fig_order: Optional[str] = None  # "circle" | "cell"
    # WHY meter: fit_tempo may find that a weight-3 moment falls half a bar off the grid; the
    # composer's fix is ONE odd bar (2 or 3 beats) at least two bars before it (toolkit-plan a2).
    # Only a section of one bar with no tune may have one.
    meter: int = 4                   # beats in each bar of this section: 4, or 2 / 3 for one odd bar
    # WHY swing on the section (2026-11-25): the owner liked the "gently swung" pulse (deck E2 C,
    # 35 ms on the off-beat eighths); it lived only in the mood table, so a recipe could not ask
    # for it. None = the mood's own value. It moves EVERY off-beat eighth (tune included): one feel.
    swing: Optional[float] = None
    # ---- round 11 (2026-11-27, "Make it mine": "a handful of notes still feel somewhat misplaced",
    # and alternatives "taking heavy inspiration from" Overmono's GTA VI pieces). WHY each:
    # fig_open: the chord figure leaves out a colour tone a semitone from another chord tone
    #   (blocks._ladder), the most frequent rub measured in the round-10 sketch (D4 against E-flat);
    # fig_shadow: dB of a clean sine doubling each figure note (None = off), a glow without grit;
    # low: dict(mask=16 steps, voice="sub"|"thump", vel): the sub root on chosen steps (a 2-step
    #   low line; "thump" bends the no-drums rule and is only for a labelled A/B, blocks.play_low).
    fig_open: bool = False
    fig_shadow: Optional[float] = None
    low: Optional[dict] = None


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
    # ---- round 7 (2026-11-23)
    # WHY ending="short": the ending bar was fixed at four slowing beats, so a 10 s film whose
    # name falls on a half-beat of the editor's 120 BPM grid could not stay on that grid (own had
    # to play at 134). "short" is a two-beat ending: no sigh, just B-flat sus under the logo's two
    # pick-up notes, so the landing can sit one bar-half after the last body bar.
    ending: str = "sigh"             # "sigh" (4 beats: C6, B-flat, then the logo) | "short" (2 beats: the logo's pick-ups)
    # WHY mix: every instrument group is set to a fixed loudness whenever it plays (mix.TARGET), so
    # a softer touch on a sparse line comes back up to the same level (tale's "softer" sighs measured
    # the same). This moves a group's level for one piece, in dB (e.g. {"counter": -2, "lead": -1}).
    mix: dict = field(default_factory=dict)
    # ---- round 8 (2026-11-24). WHY: "too busy/harsh". Every group is levelled to a fixed loudness
    # (mix.TARGET), so a quieter touch alone came back up to the same level; these change the SOUND.
    # touch: multiplies every piano touch (0.8 = softer hammers: a rounder, darker note, same level);
    # tone: dB of a high shelf at 3.5 kHz on the music (-3 = darker); air: the master's air shelf in
    # dB (None = mix.AIR_DB, 11). The defaults leave every earlier piece byte for byte as it was.
    touch: float = 1.0
    tone: float = 0.0
    air: Optional[float] = None
    # ---- the rebuild (2026-11-24). style="v3" (the recipes' default) turns on: the shared 1/f time
    # line instead of per-note random nudges (timing.pink_line), phrase-shaped melody (blocks,
    # KTH rules), the curved final ritardando (timing.rit_curve) and perceived-attack
    # compensation. Old pieces (v1, v2) render as before.
    sound: dict = field(default_factory=dict)    # sound switches for this piece (engine/options.py)
    bed: Optional[dict] = None       # the bed (bed.py): sustain kind, layers on from bar 1, pad colour
    changes: list = field(default_factory=list)  # THE CHANGE PLAN: [(bar, "in"|"out"|..., arg)], bed.py
    cycles: list = field(default_factory=list)   # cycles.Cycle: short parts on unequal periods
    hits: list = field(default_factory=list)     # [(seconds, weight, label)] the moments the music hits
    clash_ok: dict = field(default_factory=dict) # {bar: "why"}: a semitone the composer means (not a fault)
    explain: dict = field(default_factory=dict)  # {dashboard id: "one line"}: why a number is out of range
    recipe: str = ""                 # "type-short" | "app-demo" | "narrated" (recipes.py)
    brief: object = None             # recipes.Brief: what was asked (printed in every report)
    owner: dict = field(default_factory=dict)    # the [OWNER] switches this piece was made with
    # how the film's mux will play her voice against this music, so the hard check can measure her
    # margin: dict(path=voice wav, t_from=s in that file, start_at=s in the piece, music_db=-10)
    voice_mux: Optional[dict] = None

    def land_time(self):
        return self.land if self.land is not None else self.length - (LOGO_LEN[self.logo] - LOGO_LAND)

    @property
    def ending_len(self):
        return 2.0 if self.ending == "short" else 4.0


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
    blen: float = 4.0                # beats in each bar: 4, except a short ending bar (2)

    @property
    def beats(self):
        return self.blen * len(self.bars) + self.hold

    @property
    def beat1(self):
        return self.beat0 + self.beats

    def chord_at(self, beat):
        """Chord sounding at a global beat inside this section."""
        k = int(np.clip((beat - self.beat0) // self.blen, 0, len(self.bars) - 1))   # WHY blen: odd bars
        b = self.bars[k]
        if len(b.chords) == 1 or beat - b.beat < 2:
            return b.chords[0]
        return b.chords[1]


def _tune_bars(sec, form):
    """Lay the section's tune segments (names or motif.Phrase objects) over its bars; give each
    bar its progression position."""
    segs = sec.tune if isinstance(sec.tune, (list, tuple)) else ([sec.tune] if sec.tune else [])
    bars = [Bar(0, None, []) for _ in range(sec.bars)]
    spill = []          # pick-up notes before the section's first bar line (plan() gives them to the bar before)
    k = 0
    for s in segs:
        if hasattr(s, "notes"):
            # a Phrase: its notes carry their own origin tags; it does not set the progression
            for n in s.notes:
                bi = k + int(n.beat // 4)
                # WHY bi < 0 is skipped (not wrapped): a pick-up (negative beat) lands in the bar
                # before the phrase; at the very start of a section there is no such bar here
                if bi < 0:
                    spill.append((n.beat, int(n.m), n.dur, tuple(n.src), n.vel))
                    continue
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
            if bi >= sec.bars or bi < 0:
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
    return bars, spill


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
        meter = int(getattr(s, "meter", 4) or 4)
        if meter != 4 and (s.bars != 1 or s.tune):
            # WHY: one odd bar is a timing fix, not a new metre; the tune's phrases are 4-beat bars
            raise ValueError(f"section '{s.label}': an odd bar (meter={meter}) must be a section of 1 bar with no tune")
        bars, spill = _tune_bars(s, form)
        for j, b in enumerate(bars):
            b.beat = beat + meter * j
        # WHY (2026-11-23): a phrase written with a pick-up (write(..., pickup=1), .shift(-1)) at the
        # start of a section begins in the previous section's last bar, as a singer's breath-in does
        if spill and plans:
            pb = plans[-1].bars[-1]
            for b_, m_, d_, src_, v_ in spill:
                pb.tune.append((4.0 + b_, m_, d_, src_, v_))
            pb.tune.sort(key=lambda x: x[0])
        p = SecPlan(i, s, mood, form, voice, s.accomp or mood["accomp"], layers,
                    s.dyn if s.dyn is not None else mood["dyn"], beat, bars, hold)
        p.blen = float(meter)
        p.nominal_bpm = s.bpm or mood["tempo"][1]
        p.into = into
        p.span = max(1, min(s.span, len(bars)))
        plans.append(p)
        beat += p.beats
    # THE ENDING bar: same players as the last section, ending chords, ending tune
    last = plans[-1]
    L = piece.ending_len
    if L < 4:
        # THE SHORT ENDING (2 beats): only the logo's two pick-up notes over B-flat sus
        eb = Bar(beat, None, ["Bbsus"], [])
    else:
        eb = Bar(beat, None, list(T.ENDING_CHORDS),
                 [(b, note(nm), d, ("ending", b), 1.0) for b, nm, d in T.ENDING])
    ep = SecPlan(len(plans), last.sec, last.mood, "bright", last.voice, last.accomp, set(last.layers),
                 last.dyn, beat, [eb], 0.0, ending=True)
    ep.blen = L
    ep.nominal_bpm = last.nominal_bpm
    ep.into, ep.span = "end", 1
    if piece.logo != "none":
        for b, nm, d in T.LOGO_CELL:    # the logo's pick-up notes belong to the ending bar
            if b < 4:
                eb.tune.append((b - (4 - L), note(nm), d, ("logo", b), 1.0))
    plans.append(ep)
    _fit_tempi(piece, plans)
    return plans


# ---------------------------------------------------------------------- tempo map

class TempoMap:
    """Piecewise tempo: each segment is (beat0, beats, bpm at start, bpm at end), tempo moving
    in a straight line in between. seconds(beat) is exact (closed form). A segment with a fifth
    element q (v3's final ritardando) follows timing.rit_curve instead, integrated numerically."""

    def __init__(self, segs):
        self.segs = segs
        self.t0 = [0.0]
        for s in segs:
            self.t0.append(self.t0[-1] + self._dur(s[1], *s[1:]))

    @staticmethod
    def _dur(x, nb, a, c, q=None):
        if q:
            # WHY numeric: the curved ritardando (d4) has no simple closed form; 400 steps of a
            # smooth curve over one bar are exact to well under a microsecond
            xs = np.linspace(0.0, x, 401)
            from timing import rit_curve
            bpm = a * rit_curve(xs / nb, c / a, q)
            return float(np.trapezoid(60.0 / bpm, xs)) if x > 0 else 0.0
        if abs(c - a) < 1e-9:
            return 60.0 * x / a
        k = (c - a) / nb
        return 60.0 / k * np.log((a + k * x) / a)

    def seconds(self, beat):
        for j, s in enumerate(self.segs):
            b0, nb = s[0], s[1]
            if beat < b0 + nb or j == len(self.segs) - 1:
                return self.t0[j] + self._dur(beat - b0, *s[1:])

    def bpm_at(self, beat):
        for s in self.segs:
            b0, nb, a, c = s[:4]
            if beat < b0 + nb:
                if len(s) > 4 and s[4]:
                    from timing import rit_curve
                    return float(a * rit_curve((beat - b0) / nb, c / a, s[4]))
                return a + (c - a) * (beat - b0) / nb
        return self.segs[-1][3]


def _segments(plans, bpms, rit=RIT, q=None):
    segs = []
    for k, p in enumerate(plans):
        a = bpms[k]
        body = p.blen * len(p.bars)
        if p.ending:
            # THE ENDING: one bar slowing in a straight line into the logo's landing (a
            # ritardando), then the final tempo holds for the logo's last notes and the tail
            # WHY q (v3, toolkit-plan d4): the slowing follows a curve that slows late, like a
            # runner stopping, instead of a straight line; the end tempo (rit) is unchanged
            segs.append((p.beat0, body, a, a * rit, q) if q else (p.beat0, body, a, a * rit))
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


def _rit_q(piece):
    if getattr(piece, "style", "v2") in ("v3", "v4"):    # WHY v4: the unity rebuild keeps every v3 behaviour
        from timing import RIT_Q
        return RIT_Q
    return None


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
        tm = TempoMap(_segments(plans, bpms, piece.rit, _rit_q(piece)))
        worst = 0.0
        for a, b in zip(keys[:-1], keys[1:]):
            ta = tm.seconds(plans[a].beat0)
            tb = tm.seconds(plans[b].beat0) if b < len(plans) else tm.seconds(plans[-1].beat0 + plans[-1].blen)
            want = anchors[b] - anchors[a]
            f = (tb - ta) / want
            worst = max(worst, abs(f - 1))
            for k in range(a, b):
                bpms[k] *= f
        if worst < 1e-10:
            break
    tm = TempoMap(_segments(plans, bpms, piece.rit, _rit_q(piece)))
    for k, p in enumerate(plans):
        p.bpm = bpms[k]
        p.t0 = tm.seconds(p.beat0)
        p.t1 = tm.seconds(p.beat1)
    plans[-1].land_beat = plans[-1].beat0 + plans[-1].blen
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


BUSES = ["lead", "sing", "double", "answer", "counter", "piano", "pizz", "bowed", "air", "synth", "sub",
         # WHY (the rebuild, 2026-11-24): "pad" carries the sustain layer that sounds under everything
         # (bed.py; pad, held strings or pedalled ring) and "cycle" the short parts on unequal periods
         # (cycles.py), each on its own bus so the mix can set them (and send them to the echo) alone
         "pad", "cycle",
         # WHY "ring" (audit 2026-11-25): the pedalled-piano sustain (bed sustain="ring") is a piano,
         # not the saw pad; on the pad bus it took the pad's calibration, centre cut and echo
         "ring"]
TUNE_BUSES = ("lead", "sing", "double")
FOREGROUND_BUSES = TUNE_BUSES + ("answer", "counter", "cycle")   # left out of the no-melody (bed) mix
# The new buses' levels, hall/room sends and echo returns live in mix.py (TARGET, HALL, ROOM, ECHO)
# with every other bus; there is one place to set them.
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
        # WHY options.use: the sound builder's switches (engine/options.py) are per piece; the
        # instruments read the current piece's settings from there (Piece.sound)
        try:
            import options
            options.use(piece)
        except ImportError:
            pass
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
        # THE SHARED TIME LINE (v3, toolkit-plan d1). WHY: round 8 nudged every note by its own
        # random amount, which reads as random; one 1/f deviation per sixteenth, shared by the whole
        # band, wanders the way a player's timing does. Two runs give the same line (seeded).
        self.v3 = getattr(piece, "style", "v2") in ("v3", "v4")
        # WHY woven (v4, the unity rebuild): the tune is played by the bed's own piano (same bus,
        # tone, shine, room), not a separate brighter instrument laid on top; see blocks.play_tune
        self.woven = False
        self.lead_early = 0.015
        self.shine_all = 0.0
        self.pan_max = 1.0
        self.tune_lift = 0.08
        self.voice_touch = 0.0
        try:
            import options as _O
            self.woven = _O.get("tune_voice", piece) == "woven"
            self.lead_early = float(_O.get("lead_early_ms", piece)) / 1000.0
            self.shine_all = float(_O.get("shine_all", piece))
            self.pan_max = float(_O.get("pan_max", piece))
            # WHY (2026-11-27): see engine/options.py "CLEAR PARTS"
            self.tune_lift = float(_O.get("tune_lift", piece))
            self.voice_touch = float(_O.get("voice_touch", piece))
        except ImportError:
            pass
        if self.v3:
            from timing import line_sd_ms, pink_line
            nb = int(plans[-1].beat0 + plans[-1].blen + 64) * 4
            bpm = float(np.median([p.bpm for p in plans]))
            self.line = pink_line(nb, int(piece.seed) * 7919 + 17, line_sd_ms(bpm))

    # ---- time
    def sec(self, beat):
        return float(self.tm.seconds(beat))

    def secs(self, beat, beats):
        return self.sec(beat + beats) - self.sec(beat)

    def when(self, beat, jit_ms, key):
        frac = beat % 1.0
        sw = self.swing if abs(frac - 0.5) < 1e-6 else 0.0
        if self.v3:
            # v3: the shared line at this sixteenth plus a residual of at most 2 ms per note; jit 0
            # (the logo's landing) stays exact
            if not jit_ms:
                return max(0.0, self.sec(beat) + sw)
            k = int(np.clip(round(beat * 4), 0, len(self.line) - 1))
            return max(0.0, self.sec(beat) + sw + float(self.line[k]) + _h("t", self.piece.seed, key) * 0.002)
        # WHY never before 0: the piece's first note must start the file, not be cut off by it
        return max(0.0, self.sec(beat) + sw + _h("t", self.piece.seed, key) * jit_ms / 1000.0)

    def vary(self, v, key, sd=0.03):
        # WHY 0.015 in v3: touch is shaped by the phrase (blocks.kth_shape); a note's own wobble
        # stays well inside the per-phrase spread of 0.12 (toolkit-plan b2)
        if self.v3:
            sd = min(sd, 0.015)
        return float(np.clip(v + sd * _h("v", self.piece.seed, key), 0.04, 0.95))

    def _in_words(self, t, pad=0.05):
        """True when second `t` falls inside one of the narrator's words (Piece.speech.words)."""
        words = getattr(getattr(self.piece, "speech", None), "words", None) or ()
        return any(a - pad <= t < b for _, a, b in words)

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
        if self.backing == "bed" and bus in FOREGROUND_BUSES:
            return                                  # the no-melody (bed) mix: cycles and answers out too
        if p:
            # WHY pan_max (v4): cycles at +-0.3 and strings at +-0.35 put layers in different places;
            # one piece sits in one place (the analysis: pans within +-0.15)
            p = float(np.clip(p, -self.pan_max, self.pan_max))
            x = x * np.array([1 - max(p, 0), 1 + min(p, 0)])
        place(self.bus[bus], x, t)
        self.onsets.append((t, bus))

    # ---- instruments
    def piano(self, bus, beat, m, beats, vel, tone=0.0, pedal=False, p=0.0, jit=5.0, role="", canon=None,
              early=0.0, phrase_vel=None):
        key = (bus, round(beat, 4), int(m))
        if self.v3 and not (canon and canon[0] == "logo"):
            # WHY (v3, toolkit-plan d3b): a soft felt note is HEARD a few ms after it starts; struck
            # that much early, it is heard on its beat (the logo already does this, LAND_EARLY)
            from timing import perceived_delay
            early = early + perceived_delay("piano", vel)
        t = self.when(beat, jit, key) - early
        # WHY Piece.touch (round 8): a softer hand on every piano note, so the felt piano's filter
        # closes and the loud sample layer (touch >= 0.7) is never reached; 1.0 changes nothing
        tch = float(getattr(self.piece, "touch", 1.0) or 1.0)
        v = self.vary(vel, key) if tch == 1.0 else float(np.clip(self.vary(vel, key) * tch, 0.04, 0.95))
        if self.voice_touch and role != "lead" and not (canon and canon[0] == "logo") and self._in_words(t):
            # WHY (2026-11-27, voice_touch; v4 -0.05): "piano is also fighting her voice a bit for
            # attention". A bed note struck while she speaks is played a little softer, which on the
            # felt piano is also rounder and darker (its filter follows the touch); notes already
            # ringing are untouched, so nothing dips or pumps on her words
            v = float(np.clip(v + self.voice_touch, 0.04, 0.95))
        self._log(t, beat, m, beats, v, bus, role, "piano")
        self.log[-1]["pedal"] = bool(pedal)     # WHY: the clear-parts readings model how long a note rings
        self.log[-1]["canon"] = canon        # WHY: the checks tell the logo's own notes from the tune's
        if self.dry:
            return self._put(bus, None, t, p, role, int(m), canon)
        # WHY a tiny per-note tone wobble: the piano has only two recorded loudness layers, so
        # a repeated note would otherwise be the identical sound; a hair of brightness
        # variation is what a real hand does anyway
        kw = {}
        if phrase_vel is not None:
            # WHY: the filter follows the PHRASE's touch, so neighbouring notes keep one colour
            # ("some notes much brighter than their neighbours", toolkit-plan b2)
            kw["phrase_vel"] = float(np.clip(phrase_vel * (getattr(self.piece, "touch", 1.0) or 1.0), 0.04, 0.95))
        x = self.S.felt_piano(m, v, self.secs(beat, beats) * 0.97, pedal=pedal,
                              tone=tone + (0.02 if self.v3 else 0.06) * _h("c", key), shine=(self.shine_all if self.shine_all > 0 else SHINE.get(bus, 0.0)), **kw)
        self._put(bus, x, t, p, role, int(m), canon)

    def pad(self, beat, m, beats, vel, cutoff=None, p=0.0, attack=None, release=None, role="sustain"):
        """THE PAD (the rebuild): one soft held synth note on the "pad" bus. WHY: every calm game
        and ambient reference has a held layer under everything; ours was only separate piano
        attacks, which still sound choppy between notes (what-we-learned.md, item 2). The sound
        is engine/sounds.pad (toolkit-plan b3; its timbre, cutoff, attack and release are the
        switches pad_* in engine/options.py)."""
        t = self.sec(beat)
        p = float(np.clip(p, -self.pan_max, self.pan_max))      # WHY: one place for the band (v4 pan_max)
        self._log(t, beat, m, beats, vel, "pad", role, "pad")
        self.log[-1]["release"] = release        # WHY: the clear-parts readings model each pad tail (None = default)
        if self.dry:
            return self._put("pad", None, t)
        d = self.secs(beat, beats)
        # WHY only what is set: the options (pad_attack, pad_release, pad_cutoff) are the
        # defaults; t0 lets the pad's slow drifts run continuously from note to note. (The interim
        # padvoice.py stand-in was removed once sounds.pad existed: one pad, one specification.)
        kw = {k: v for k, v in dict(cutoff=cutoff, attack=attack, release=release, t0=t).items() if v is not None}
        x = self.S.pad(int(m), d, float(vel), **kw)
        if x.ndim == 1:
            x = pan(x, p)
        elif p:
            x = x * np.array([1 - max(p, 0), 1 + min(p, 0)])
        place(self.bus["pad"], x, t)
        self.onsets.append((t, "pad"))

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
        # WHY counter too (2026-11-23): a bowed counter-line note swells 0.4-0.8 s after it starts,
        # which the attack check flagged as "not on a note"; the held strings were already exempt
        held = bus in ("bowed", "counter")
        if self.dry:
            if held:
                self.held_spans.append((t, t + d))
            return self._put(bus, None, t, 0.0, role, int(m), canon)
        x = self.S.bowed(sec_, int(m), d, v0, v1, attack=attack, release=release,
                         rr=int(abs(_h("rr", key)) * 5), shape=shape)
        if p:
            x = 0.6 * x + 0.4 * pan(x.mean(axis=1), p)
        if held:
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

    def sine(self, beat, m, beats, vel, p=0.0, role=""):
        """A clean sine note on the synth bus (round 11: the figure's shadow and the rare ping).
        WHY its own instrument: `synth` is two saws and a square (a pluck with upper partials); the
        Overmono-inspired glow and bleeps must be the plainest tone there is, so they add no
        brightness and no attack of their own."""
        key = ("sine", round(beat, 4), int(m))
        t = self.when(beat, 3.0, key)
        self._log(t, beat, m, beats, vel, "synth", role, "sine")
        if self.dry:
            return self._put("synth", None, t)
        x = self.S.sine_tone(int(m), self.secs(beat, beats), vel)
        self._put("synth", pan(x, p), t)

    def thump(self, beat, m, vel):
        """A soft, muffled, pitched low pulse on the (dry) sub bus: sounds.thump. BENDS the
        no-drums rule; only for a labelled A/B (blocks.play_low)."""
        t = self.when(beat, 2.0, ("thump", round(beat, 4), int(m)))
        self._log(t, beat, m, 0.5, vel, "sub", "thump", "thump")
        if self.dry:
            return
        place(self.bus["sub"], self.S.thump(int(m), vel), t)

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
