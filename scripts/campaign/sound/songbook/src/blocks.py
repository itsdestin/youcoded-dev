"""The songbook's BLOCKS turned into notes: the tune (and who plays it), the answer, the four
accompaniment patterns, the layers, the lift, the transitions and the two endings.

Every block reads its pitches from tune.py (the tune, the chords and their voicings) and its
timing in beats, so each works at any tempo and over either form of the chords.

Rules honoured by construction (the owner's rulings): no drum or noise sound exists (see
engine/sounds.py); no block stops the music dead or answers a stop with a flourish; nothing
sweeps or rises like a riser; the only high part is the "air" layer, one continuous held
line; held strings change level only in straight lines across whole sections.
"""
import numpy as np

import tune as T
from dsp import note

V = T.V
LIFT = 0.16      # how much harder everyone plays by the end of a lift (about +1.5 dB on the piano)
BUILD = 0.10     # the crescendo of a one-bar build
STRING_LIFT = 0.5  # held strings rise further in a lift: +50 % on top (about +3.5 dB in all)
LAND_EARLY = 0.0062  # seconds the logo's piano notes are struck early (see play_logo)


def m_(name):
    return note(name)


# Section loudness shapes (Section.shape), as (fraction of the section, touch multiplier). On the
# felt piano at its usual touch a multiplier f moves the level by about 10 x (f - 1) dB (1.15 is
# about +1.5 dB, 0.7 about -3 dB); the strings follow in proportion. Combine a shape with a
# change of texture (density, vary) for the 3-6 dB swells the guide asks for.
SHAPES = {
    "swell": [(0.0, 0.85), (0.65, 1.15), (1.0, 1.02)],      # a phrase that opens and settles
    "fade": [(0.0, 1.0), (1.0, 0.72)],                      # recedes (under a voice, after a peak)
    "arch": [(0.0, 0.85), (0.6, 1.12), (1.0, 0.9)],
    "grow": [(0.0, 0.8), (1.0, 1.18)],                      # one long crescendo
    "drop-lift": [(0.0, 1.0), (0.7, 1.0), (0.7, 0.68), (1.0, 1.15)],   # sudden hush, then rise into the next
    "inward": [(0.0, 0.8), (1.0, 0.8)],                     # everything smaller (subtle films)
}

# How strong each eighth of the bar is (for Section.density): weaker beats leave first.
STRENGTH = {0.0: 1.0, 2.0: 0.85, 1.0: 0.7, 3.0: 0.7, 1.5: 0.55, 2.5: 0.55, 0.5: 0.4, 3.5: 0.4}
_DENSITY = {}     # temporary density per plan during a v2 blend (id(plan) -> 0..1)


def _bar_index(p, bar):
    return int(round((bar.beat - p.beat0) / 4.0))


def _variant(p, bar):
    """The texture variant asked for this bar (Section.vary, or the section-end gesture)."""
    j = _bar_index(p, bar)
    if not 0 <= j < len(p.bars):
        return None
    v = (getattr(p.sec, "vary", None) or {}).get(j + 1)
    if v is None and j == len(p.bars) - 1 and p.into == "drop":
        v = "drop"
    return v


def _own_bass(p):
    return hasattr(getattr(p.sec, "bass", None), "notes")


def _walk_bar(p, bar):
    """Bars whose last two beats walk the bass to the next chord: with bass="walk", the end of
    every four-bar phrase and of the section; with into="pickup", the section's last bar."""
    j = _bar_index(p, bar)
    if not 0 <= j < len(p.bars) or p.ending:
        return False
    last = j == len(p.bars) - 1
    if getattr(p.sec, "bass", None) == "walk" and ((j + 1) % 4 == 0 or last):
        return True
    return last and p.into == "pickup"


def keep(p, bar, off, kind):
    """Does the accompaniment play this note? kind = "bass" (the lowest part) or "mid". With no
    composing controls set this is always True, so the original pieces are unchanged."""
    if p.ending:
        return True                              # the ending bar is the logo's: always whole
    v = _variant(p, bar)
    if v == "rest":
        return False
    if v == "bass" and kind != "bass":
        return False
    if v == "drop" and off >= 2.0 - 1e-6:
        return False
    if v == "half" and off not in (0.0, 2.0):
        return False
    if v == "thin" and kind != "bass" and off != 0.0:
        return False
    if kind == "bass":
        if _own_bass(p):
            return False                         # the section's own bass line replaces the pattern's
        if _walk_bar(p, bar) and off >= 2.5 - 1e-6:
            return False                         # the walk takes over the last beats
        return True
    d = _DENSITY.get(id(p), getattr(p.sec, "density", None))
    if d is not None and STRENGTH.get(round(off * 2) / 2, 0.4) <= 1.0 - d + 1e-9:
        return False
    return True


def bn(p, val):
    """A bass note: the voicing's note, or the section's pedal note (bass="pedal:Eb2") in the
    nearest octave at or below it."""
    m = m_(val)
    b = getattr(p.sec, "bass", None) if (p is not None and not p.ending) else None
    if isinstance(b, str) and b.startswith("pedal:"):
        pd = m_(b.split(":", 1)[1])
        return m - ((m - pd) % 12)
    return m


def mid(p, val):
    return m_(val) + (0 if p.ending else int(getattr(p.sec, "register", 0) or 0))


# ====================================================================== dynamics

class Dyn:
    """How hard everyone plays at each beat: the moods' levels joined by smooth ramps at the
    section changes (a blend or build ramps across its whole span, so a change of mood never
    dips), times THE LIFT."""

    def __init__(self, plans):
        pts = []
        for k, p in enumerate(plans):
            if k == 0:
                pts.append((p.beat0, p.dyn))
                continue
            q = plans[k - 1]
            body_end = q.beat0 + q.blen * len(q.bars)
            if q.into in ("blend", "build"):
                pts += [(body_end - 4 * q.span, q.dyn), (p.beat0, p.dyn)]
            elif q.into in ("hold", "breath"):
                pts += [(body_end, q.dyn), (p.beat0, p.dyn)]
            else:
                pts += [(p.beat0 - 1.0, q.dyn), (p.beat0 + 0.5, p.dyn)]
        pts.append((plans[-1].beat1 + 64, plans[-1].dyn))
        self.b, self.d = map(np.array, zip(*pts))
        # growth curves (beats, gain): THE LIFT rises in one straight line across its section
        # and STAYS up through the next section (the big moment it led to); a BUILD rises over
        # its span and settles back over the next bar (the next mood takes over)
        self.curves = []
        self.lift_spans = []
        for k, p in enumerate(plans):
            body_end = p.beat0 + p.blen * len(p.bars)
            if p.sec.lift and not p.ending:
                c = plans[k + 1].beat1 + 64 if (k + 1 < len(plans) and plans[k + 1].ending) else \
                    (plans[k + 1].beat1 if k + 1 < len(plans) else body_end)
                self.curves.append(([p.beat0, body_end, c, c + 4], [1.0, 1.0 + LIFT, 1.0 + LIFT, 1.0]))
                self.lift_spans.append((p.beat0, body_end, c))
            if p.into == "build" and not p.ending:
                self.curves.append(([body_end - 4 * p.span, body_end, body_end + 4], [1.0, 1.0 + BUILD, 1.0]))
            # WHY section shapes (2026-11-23): loudness used to move only in straight lines between
            # moods, so a 60 s film crept up 2.8 dB and its payoff came out quieter than the bar
            # before it. A shape gives each section its own swell, fade or "drop before the lift".
            sh = getattr(p.sec, "shape", None)
            if sh and not p.ending:
                pts = SHAPES[sh] if isinstance(sh, str) else None
                L = body_end - p.beat0
                if pts is not None:
                    xs = [p.beat0 + f * L for f, _ in pts]
                    ys = [y for _, y in pts]
                else:
                    xs = [p.beat0 + b for b, _ in sh]
                    ys = [y for _, y in sh]
                xs = [x + 1e-4 * i for i, x in enumerate(xs)]          # equal beats = a sudden step
                xs += [body_end + 1e-3, body_end + 1.0]
                ys += [ys[-1], 1.0]
                self.curves.append((xs, ys))

    def base(self, beat):
        return float(np.interp(beat, self.b, self.d))

    def lift(self, beat):
        g = 1.0
        for xs, ys in self.curves:
            g *= float(np.interp(beat, xs, ys, left=1.0, right=ys[-1]))
        return g

    def lift_progress(self, beat):
        """0..1 through a lift section (1 after it), for the strings' stronger rise."""
        pr = 0.0
        for a, b, c in self.lift_spans:
            if beat < c:
                pr = max(pr, float(np.clip((beat - a) / (b - a), 0, 1)))
            else:
                pr = max(pr, float(np.clip(1 - (beat - c) / 4, 0, 1)))
        return pr

    def v(self, beat):
        return self.base(beat) * self.lift(beat)


class Scaled:
    """The same dynamics times a curve: how a pattern fades out (or grows in) across a blend."""

    def __init__(self, dyn, f):
        self.dyn, self.f = dyn, f

    def v(self, beat):
        return self.dyn.v(beat) * self.f(beat)


def _blend(plans, p):
    """(next plan, first beat of the blend) if p blends into the next section, else (None, inf)."""
    nxt = plans[p.i + 1] if p.i + 1 < len(plans) else None
    if nxt is None or nxt.ending or p.into not in ("blend", "build"):
        return None, float("inf")
    return nxt, p.beat0 + p.blen * len(p.bars) - 4 * p.span


# ====================================================================== THE TUNE

def phrase_shape(beat, beat0, d, bb):
    """A singer's shape: a gentle arch over each four-bar phrase, a lean on downbeats and long
    notes. Small (a few per cent), so the tune breathes without bouncing."""
    ph = ((beat - beat0) % 16) / 16.0
    s = 1 + 0.06 * np.sin(np.pi * ph)
    if abs(bb) < 1e-6:
        s *= 1.03
    if d >= 1.5:
        s *= 1.03
    return s


# KTH phrase rules (the rebuild, 2026-11-24; toolkit-plan d2; Friberg's rule system at k about 1).
# WHY: a pianist shapes the PHRASE - a small arch in loudness peaking about 60 % through, a breath
# before the next phrase, the last note a little longer, a tiny gap before a leap or a repeated
# note, short notes a little lighter, the melody a hair ahead of the chords. Round 8 instead nudged
# each note by its own random amount, which is why it sounded random rather than placed.
ARCH_DB = 1.0          # +-1 dB arch (the source's 1.5-2.5 dB is held to the 0.12 touch spread here)
HIGH_DB_OCT = 1.0      # higher is a little louder: capped at +1 dB an octave (the source's 3 fights `tone`)
DB_PER_TOUCH = 22.0    # the felt piano: about 22 dB from touch 0 to 1 (engine/sounds.py)
LEAD_EARLY = 0.015     # the melody sounds 15 ms ahead of the band (Goebl 2001: 20-30 ms, scaled down)


def kth_shape(notes, secs_per_beat):
    """notes = [(global beat, midi, beats)] of one section's tune. Returns {(beat, midi):
    (touch delta, beats delta, phrase id)}: loudness and length adjustments by phrase."""
    out = {}
    ns = sorted(notes)
    phrases, cur = [], []
    for n in ns:
        if cur and n[0] - (cur[-1][0] + cur[-1][2]) > 1.0 + 1e-6:
            phrases.append(cur)
            cur = []
        cur.append(n)
    if cur:
        phrases.append(cur)
    for pi, ph in enumerate(phrases):
        b0 = ph[0][0]
        L = max(ph[-1][0] + ph[-1][2] - b0, 1e-6)
        mean_m = float(np.mean([m for _, m, _ in ph]))
        nxt = phrases[pi + 1][0][0] if pi + 1 < len(phrases) else None
        for i, (b, m, d) in enumerate(ph):
            x = (b - b0) / L
            arch = ARCH_DB * (2 * (1 - abs(x - 0.6) / (0.6 if x < 0.6 else 0.4)) - 1)
            db = arch + HIGH_DB_OCT * (m - mean_m) / 12.0
            sec = d * secs_per_beat
            gap = 0.0
            if sec <= 0.25:
                db -= 0.8
                gap += 0.016
            elif sec <= 0.45:
                db -= 0.5
                gap += 0.010
            if i + 1 < len(ph):
                step = abs(ph[i + 1][1] - m)
                if step == 0:
                    gap += 0.035                              # a repeated note is re-struck, not smeared
                elif step >= 3:
                    gap += 0.004 * min(step, 9)               # a leap takes a breath
                dd = -gap / secs_per_beat
            else:
                # the phrase-final note: 40 ms longer, then at least 80 ms of breath before the next
                room = ((nxt - b - d) * secs_per_beat - 0.08) if nxt is not None else 0.04
                dd = max(0.0, min(0.04, room)) / secs_per_beat
            out[(round(b, 4), int(m))] = (db / DB_PER_TOUCH, dd, pi)
    return out


def _violin(band, beat, m, d, vl, role, canon=None, solo_only=False):
    """The tune sung by the strings (chamber-2): the solo violin, the violin section doubling it
    quietly for body, the cellos an octave lower."""
    dig = 1.15 if d <= 0.5 else 1.0       # a quick bowed note needs a firmer bow
    vl = vl * dig
    band.bow("solo", beat, m, d + 0.12, vl, vl, p=-0.1, bus="sing",
             attack=0.03 if d <= 0.5 else 0.06, release=0.22, role=role, canon=canon)
    if solo_only:
        return
    band.bow("vln", beat, m, d + 0.12, vl * 0.62, vl * 0.66, p=-0.3, bus="sing",
             attack=0.05 if d <= 0.5 else 0.1, release=0.25, role="double")
    band.bow("vc", beat, m - 12, d + 0.12, vl * 0.75, vl * 0.8, p=0.25, bus="double",
             attack=0.05 if d <= 0.5 else 0.1, release=0.25, role="double")


def play_tune(band, p, dyn, plans):
    body_end = p.beat0 + p.blen * len(p.bars)
    tone = p.mood["tone"]
    octaves = ("octaves" in p.layers) or p.sec.lift or p.voice == "both"
    # THE HANDOVER: when the tune passes from the piano to the violin at a section change, the
    # piano plays the first bar with the violin, softly, then lets go (a bowed note speaks
    # slowly; the piano's touch makes the first notes clear, and the hand-over is heard)
    handover = (p.voice == "violin" and p.i > 0 and plans[p.i - 1].voice in ("piano", "both"))
    # THE JOIN: in a blend, the next section's voice joins the tune in the last bar before the
    # change, so the tune itself is carried across the join (no voice appears from nowhere)
    nxt, b0 = _blend(plans, p)
    join_violin = nxt is not None and p.voice == "piano" and nxt.voice in ("violin", "both")
    join_piano = nxt is not None and p.voice == "violin" and nxt.voice in ("piano", "both")
    # composing controls (all neutral by default, so earlier pieces are unchanged)
    sec = p.sec
    pedal = p.mood["pedal"] if (sec.pedal is None or p.ending) else sec.pedal
    lead = 1.0 if (sec.lead is None or p.ending) else sec.lead
    legato = 0.0 if p.ending else sec.legato
    early = 0.0 if p.ending else -sec.push / 1000.0   # WHY: push < 0 = ahead of the beat (eager), > 0 = laid back
    kth = {}
    if band.v3:
        allnotes = [(bar.beat + bb, int(m), d) for bar in p.bars for bb, m, d, canon, _ in bar.tune if canon[0] != "logo"]
        kth = kth_shape(allnotes, 60.0 / max(p.bpm, 1e-6))
        ph_touch = {}
    for bar in p.bars:
        last_bar = bar is p.bars[-1]
        for bb, m, d, canon, touch in bar.tune:
            beat = bar.beat + bb
            if canon[0] == "logo":
                continue                              # the logo's pick-ups: play_logo
            if p.hold and abs(beat + d - body_end) < 1e-6:
                d = d + p.hold                       # the tune holds through a fermata
            d = d + legato
            k3 = kth.get((round(beat, 4), int(m)))
            s = 1.0 if k3 is not None else phrase_shape(beat, p.beat0, d, bb)
            v = 0.60 * p.mood.get("lead", 1.0) * lead * touch * dyn.v(beat) * s * (0.72 if p.sec.narration else 1.0)   # softer under a voice
            e_note, pv = early, None
            if k3 is not None:
                # v3: the phrase's shape (kth_shape) instead of the old 16-beat arch
                base = v
                v = float(np.clip(v + k3[0], 0.05, 0.62))
                d = max(0.1, d + k3[1])
                e_note = early + LEAD_EARLY
                pv = ph_touch.setdefault(k3[2], base)
            piano_on = p.voice in ("piano", "both") or p.ending
            if piano_on:
                band.piano("lead", beat, m, d, min(v, 0.69), tone=tone, pedal=pedal, p=-0.1,
                           role="lead", canon=canon, early=e_note, phrase_vel=pv)
                if octaves:
                    band.piano("double", beat + 0.003, m - 12, d, min(v, 0.69) * 0.74, tone=tone - 0.1,
                               pedal=pedal, p=-0.1, role="double", early=early)
            if (handover and bar is p.bars[0]) or (join_piano and last_bar):
                band.piano("double", beat, m, d, min(v, 0.69) * 0.7, tone=tone, pedal=False, p=-0.1,
                           role="double")
            if p.voice in ("violin", "both"):
                _violin(band, beat, m, d, 0.62 * dyn.v(beat) * s, role=("double" if piano_on else "lead"),
                        canon=canon)
            elif join_violin and last_bar:
                _violin(band, beat, m, d, 0.62 * 0.7 * dyn.v(beat) * s, role="double")


# ====================================================================== THE ANSWER

def _phrase_notes(p, ph):
    """(global beat, midi, beats, touch, src) for a Phrase laid from the section's first beat."""
    end = p.beat0 + p.blen * len(p.bars) + p.hold
    return [(p.beat0 + n.beat, n.m, min(n.dur, end - p.beat0 - n.beat), n.vel, n.src)
            for n in ph.notes if n.beat < end - p.beat0 - 1e-6]


def _tune_onsets(p):
    """Every tune onset in the section as (global beat, midi, beats)."""
    return sorted((b.beat + bb, m, d) for b in p.bars for bb, m, d, c, _ in b.tune if c[0] != "logo")


def _blend_fade(plans, p, beat, layer):
    """v2: a layer the next section does not have fades out across the blend (instead of stopping)."""
    nxt, b0 = _blend(plans, p)
    if nxt is None or layer in nxt.layers or beat < b0:
        return 1.0
    return float(np.clip(1.0 - (beat - b0) / (4.0 * p.span), 0.0, 1.0))


def play_answer_v2(band, p, dyn, plans, k_plan):
    """THE ANSWER that LISTENS (2026-11-23). WHY: the old answer played the same three-note ladder
    on beats 3, 3.5 and 4 of every bar, but the tune's own short note sits on 3.5: in "Make it
    mine" 30 of 72 answer notes started together with a tune note. Now the second piano speaks
    only where the tune leaves at least a beat of space, and it answers with the tune's own last
    notes (an echo an octave down; every other answer turned upside down), landing on a note of
    the chord. Where the tune leaves no space, it waits. Section.answer may instead hold a
    hand-written motif.Phrase; answer=False silences it."""
    a = p.sec.answer
    if a is False or p.ending:
        return
    if hasattr(a, "notes"):
        for beat, m, d, touch, src in _phrase_notes(p, a):
            band.piano("answer", beat, m, d, 0.48 * touch * dyn.v(beat), tone=0.05, p=0.35)
        return
    if "answer" not in p.layers or p.voice == "violin":
        return
    on = _tune_onsets(p)
    if not on:
        return
    nxt = plans[k_plan + 1] if k_plan + 1 < len(plans) else None
    following = [x[0] for x in on]
    if nxt is not None:
        following += [b.beat + bb for b in nxt.bars for bb, *_ in b.tune][:1]
    count = 0
    skip = set(getattr(p.sec, "answer_skip", ()) or ())
    for j, bar in enumerate(p.bars):
        mine = [x for x in on if bar.beat <= x[0] < bar.beat + 4]
        if not mine or (j + 1) in skip:
            continue
        last_on = mine[-1][0]
        later = [b for b in following if b > last_on + 1e-6]
        nxt_on = later[0] if later else bar.beat + 6.0
        start = max(last_on + mine[-1][2] * 0.5, last_on + 0.5)
        start = np.ceil(start * 2 - 1e-6) / 2                       # on an eighth
        slots = int(round((nxt_on - 0.5 - start) / 0.5)) + 1         # eighths before the next tune note
        if slots < 2:
            continue
        n = 3 if slots >= 3 else 2
        src = [x[1] for x in on if x[0] <= last_on + 1e-6][-n:]     # the tune's last n notes
        if len(src) < 2:
            continue
        line = [m - 12 for m in src]
        if count % 2 == 1:                                           # every other answer, upside down
            ax = line[0]
            line = [ax - (m - ax) for m in line]
        line = [m if m % 12 in T._SCALE else m - 1 for m in line]
        while min(line) < 55:
            line = [m + 12 for m in line]
        # the last note lands on a note of the chord sounding then, and never doubles the tune
        # WHY both conditions in ONE search (2026-11-23): the old code found a chord note, then
        # stepped down off it to avoid doubling the tune without looking at the chord again; under
        # the held A-flat over D-flat in mim it landed on G, a tritone against the D-flat
        land_b = start + 0.5 * (len(line) - 1)
        ch = p.chord_at(min(land_b, p.beat0 + p.blen * len(p.bars) - 0.01))
        ring = {x[1] % 12 for x in on if x[0] <= land_b < x[0] + x[2]}
        lm = line[-1]
        for _ in range(14):
            if lm % 12 in T.CHORD_TONES.get(ch, set()) and lm % 12 not in ring:
                break
            lm = T.scale_step(lm, -1) if lm % 12 in T._SCALE else lm - 1
        line[-1] = lm
        for i, m in enumerate(line):
            beat = start + 0.5 * i
            sounding = [x for x in on if x[0] <= beat < x[0] + x[2]]
            if i < len(line) - 1 and sounding and (sounding[-1][1] - m) % 12 == 0:
                m = T.scale_step(m, -1) if m % 12 in T._SCALE else m - 1
            # and a passing note never sits on a borrowed chord's clashing note
            if i < len(line) - 1 and m % 12 in T.CLASH.get(p.chord_at(beat), set()):
                m = T.scale_step(m, -1) if m % 12 in T._SCALE else m - 1
            d = 0.5 if i < len(line) - 1 else max(0.5, min(1.5, nxt_on - beat))
            v = (0.42 + 0.05 * i) * dyn.v(beat) * _blend_fade(plans, p, beat, "answer")
            band.piano("answer", beat, m, d, v, tone=0.05, p=0.35)
        count += 1


def play_counter(band, p, dyn, plans):
    """A SECOND LINE (Section.counter, a motif.Phrase) sung against the tune: by the cellos
    (default), violas, violins, the second piano, or plucked. It is mixed under the tune
    (mix.TARGET["counter"]) and played with the section's dynamics."""
    ph = getattr(p.sec, "counter", None)
    if ph is None or p.ending:
        return
    vo = p.sec.counter_voice
    for beat, m, d, touch, src in _phrase_notes(p, ph):
        v = 0.5 * touch * dyn.v(beat)
        if vo == "piano":
            band.piano("counter", beat, m, d, v * 0.95, tone=0.0, pedal=p.mood["pedal"], p=0.3, role="counter")
        elif vo == "pizz":
            band.pizz("vc" if m < m_("C4") else "vla", beat, m, v * 1.1, p=0.2, bus="counter", role="counter")
        else:
            sec_ = {"cello": "vc", "viola": "vla", "violin": "vln"}.get(vo, "vc")
            band.bow(sec_, beat, m, d + 0.1, v * 0.9, v * 0.95, p=(0.25 if sec_ == "vc" else -0.25), bus="counter",
                     attack=0.06 if d <= 0.5 else 0.14, release=0.3, role="counter")


def play_bass(band, p, dyn, plans, k_plan):
    """THE BASS LINE (Section.bass). A motif.Phrase is the bass itself (plucked cello for short
    notes, bowed cello for long ones; the pattern's own bass notes step aside). "walk": at the
    end of every four-bar phrase (and into="pickup": the section's last bar) the cello walks two
    scale steps into the next bar's bass note on beats 3 and 3.5 (from below when it rises, from
    above when it falls). WHY: a bass that only plays chord roots was half of what made the old
    film sound like a loop."""
    b = getattr(p.sec, "bass", None)
    if p.ending:
        return
    # WHY a piano figure too (round 8): under an even piano figure a written bass is the pianist's
    # left hand, not a cello appearing from nowhere
    piano_bass = p.accomp in ("rolling", "still") or (p.accomp == "figure" and p.sec.fig_voice == "piano")
    if hasattr(b, "notes"):
        for beat, m, d, touch, src in _phrase_notes(p, b):
            v = 0.58 * touch * dyn.v(beat)
            if piano_bass:
                band.piano("piano", beat, m, d, v * 0.8, tone=-0.2, pedal=True, p=-0.05)
            elif d <= 1.0:
                band.pizz("vc", beat, m, v, p=0.05)
            else:
                band.bow("vc", beat, m, d + 0.1, v * 0.55, v * 0.5, p=0.1, bus="bowed", attack=0.1, release=0.3)
        return
    nxt = plans[k_plan + 1] if k_plan + 1 < len(plans) else None
    for j, bar in enumerate(p.bars):
        if not _walk_bar(p, bar):
            continue
        here = bn(p, V[bar.chords[-1]]["root"])
        if j + 1 < len(p.bars):
            tgt_c, tp = p.bars[j + 1].chords[0], p
        elif nxt is not None:
            tgt_c, tp = nxt.bars[0].chords[0], nxt
        else:
            continue
        tgt = bn(tp, V[tgt_c]["root"])
        if tgt == here:
            steps = [T.scale_step(tgt, 2), T.scale_step(tgt, 1)] if tgt % 12 in T._SCALE else [tgt + 3, tgt + 1]
        elif tgt > here:
            steps = [T.scale_step(tgt, -2), T.scale_step(tgt, -1)] if tgt % 12 in T._SCALE else [tgt - 3, tgt - 1]
        else:
            steps = [T.scale_step(tgt, 2), T.scale_step(tgt, 1)] if tgt % 12 in T._SCALE else [tgt + 3, tgt + 1]
        for i, m in enumerate(steps):
            beat = bar.beat + 3.0 + 0.5 * i
            v = (0.52 + 0.04 * i) * dyn.v(beat)
            if piano_bass:
                band.piano("piano", beat, m, 0.5, v * 0.8, tone=-0.2, p=-0.05)
            else:
                band.pizz("vc", beat, m, v, p=0.05)


def play_answer(band, p, dyn, plans, k_plan):
    if band.piece.style != "v1":
        return play_answer_v2(band, p, dyn, plans, k_plan)
    if "answer" not in p.layers or p.ending or p.voice == "violin":
        return              # (when the violin sings, the piano conversation pauses: one voice at a time)
    nxt = plans[k_plan + 1] if k_plan + 1 < len(plans) else None
    for j, bar in enumerate(p.bars):
        if not bar.tune:
            continue                                   # the answer only answers the tune
        if j + 1 < len(p.bars):
            land = p.bars[j + 1].chords[0]
        elif p.hold == 0 and nxt is not None:
            land = nxt.bars[0].chords[0]
        else:
            continue
        ladder = T.fit_ladder(T.ANSWER[bar.pos], land)
        thirds = bar.pos >= 4                          # second time round: in two voices (blend-1)
        for (off, d), m, vv in zip(T.ANSWER_RHYTHM, ladder, (0.46, 0.48, 0.53)):
            beat = bar.beat + off
            v = vv * dyn.v(beat)
            band.piano("answer", beat, m, d, v, tone=0.05, p=0.35)
            if thirds:
                band.piano("answer", beat + 0.008, T.third_below(m), d, v * 0.8, tone=0.0, p=0.35)


# ====================================================================== ACCOMPANIMENT PATTERNS
# Each is one bar of rhythm that repeats, reading pitches from whatever chord is sounding.
# `cut` = the beat in the bar after which nothing new starts (the ending bar stops at 2).

def _chord(bar, off):
    return bar.chords[0] if (len(bar.chords) == 1 or off < 2) else bar.chords[1]


def _chord_spans(bar, cut=4.0):
    if len(bar.chords) == 1:
        return [(0.0, min(4.0, cut), bar.chords[0])]
    return [(0.0, 2.0, bar.chords[0]), (2.0, 4.0, bar.chords[1])][: (1 if cut <= 2 else 2)]


ROLL = [(0.0, 0, 0.9, 0.50), (0.5, 1, 0.4, 0.30), (1.0, 2, 0.4, 0.34), (1.5, 1, 0.9, 0.42),
        (2.0, 2, 0.4, 0.30), (2.5, 0, 0.9, 0.44), (3.0, 2, 0.4, 0.32), (3.5, 1, 0.4, 0.30)]


# WHY every note below asks keep() and reads its bass through bn() and its middle through mid()
# (2026-11-23): that is how Section.vary / density / bass / register reach the patterns. With none
# of them set, keep() is always True and bn()/mid() return the voicing's own note, so the earlier
# pieces render exactly as before.

def acc_rolling(band, p, bar, dyn, cut=4.0):
    """ROLLING PIANO (blend-1): the left hand rolls through each chord in even eighths (low
    root, fifth, tenth, fifth), leaning on beat 1 and just before beat 3. Plucked strings, if
    on, double its low notes (cellos) and middle notes (violas)."""
    fig = []
    pedal = p.mood["pedal"] if (p.ending or p.sec.pedal is None) else p.sec.pedal
    # WHY (2026-11-23, tale): thinned below about half, the strong eighths that survive are the
    # ones the roll gives to its top note, so the figure became one note ticked on every beat
    # (C3 C3 C3). A thinned roll (v2) now alternates fifth and tenth over the notes it keeps.
    d_ = _DENSITY.get(id(p), getattr(p.sec, "density", None))
    thinned = band.piece.style != "v1" and not p.ending and d_ is not None and d_ < 1.0
    kept = 0
    for off, i, d, vel in ROLL:
        if off >= cut:
            continue
        kind = "bass" if i == 0 else "mid"
        if not keep(p, bar, off, kind):
            continue
        if thinned and kind == "mid":
            i = (1, 2)[kept % 2]
            kept += 1
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = bn(p, ch["fig"][i]) if i == 0 else mid(p, ch["fig"][i])
        if pedal:
            # WHY: in the warm moods the rolled notes are pedalled, each ringing on until the
            # chord changes (where a pianist changes the pedal), so the figure flows
            d = (2.0 if (len(bar.chords) == 2 and off < 2) else 4.0) - off
        band.piano("piano", beat, m, d, vel * dyn.v(beat), tone=-0.2 + 0.3 * p.mood["tone"], p=-0.1)
        fig.append((beat, m + 12))
        if "pizz" in p.layers:
            if i == 0:
                band.pizz("vc", beat, bn(p, ch["root"]), 0.62 * vel / 0.5 * dyn.v(beat), p=0.05)
            if i == 2:
                for q, nm in enumerate(ch["off"]):
                    band.pizz("vla", beat + 0.008 * q, mid(p, nm), 0.46 * dyn.v(beat), p=0.3)
    return fig


def acc_bounce(band, p, bar, dyn, cut=4.0):
    """PIZZICATO BOUNCE (chamber-1): cellos pluck the root on 1 and just after 2, and the
    root an octave up just after 3; violas pluck a two-note chord between every beat. The two
    parts interlock. A soft held left-hand chord on the piano underneath, for warmth."""
    fig = []
    soft = 0.82 if p.voice in ("violin", "both") else 1.0   # step back when the strings sing
    for off, kind, vel in ((0.0, "root", 0.66), (1.5, "root", 0.56), (2.5, "oct", 0.58)):
        if off >= cut or not keep(p, bar, off, "bass"):
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = bn(p, ch["root"]) + (12 if kind == "oct" else 0)
        band.pizz("vc", beat, m, vel * soft * dyn.v(beat), p=0.05)
        fig.append((beat, m + 12))
    for off in (0.5, 1.5, 2.5, 3.5):
        if off >= cut or not keep(p, bar, off, "mid"):
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        for q, nm in enumerate(ch["off"]):
            band.pizz("vla", beat + 0.008 * q, mid(p, nm), (0.46 if off in (1.5, 3.5) else 0.40) * soft * dyn.v(beat), p=0.3)
    for a, b, c in _chord_spans(bar, cut):
        for q, nm in enumerate(V[c]["lh"]):
            if not keep(p, bar, a, "bass" if q == 0 else "mid"):
                continue
            band.piano("piano", bar.beat + a + 0.012 * q, bn(p, nm) if q == 0 else mid(p, nm), b - a - 0.1,
                       0.27 * soft * dyn.v(bar.beat + a) * (1.0 if q == 0 else 0.85), tone=-0.2, p=-0.1)
    return fig


def acc_rocking(band, p, bar, dyn, cut=4.0):
    """ROCKING PIANO (chamber-2): the piano's left hand rocks low-high in even eighths (root,
    fifth, tenth, fifth), accented on 1, just after 2, and 4, so it skips instead of marching;
    the cellos pluck the root on 1 and just after 3. With plucked strings on, the violas add
    their between-beat chords."""
    accents = {0.0: 0.40, 1.5: 0.37, 3.0: 0.37}
    soft = 0.72 if p.voice in ("violin", "both") else 1.0   # step back when the strings sing
    fig = []
    for s in range(8):
        off = s * 0.5
        kind = "bass" if s % 4 == 0 else "mid"
        if off >= cut or not keep(p, bar, off, kind):
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = bn(p, ch["rock"][0]) if kind == "bass" else mid(p, ch["rock"][s % 4])
        band.piano("piano", beat, m, 0.55, accents.get(off, 0.28) * soft * dyn.v(beat), tone=-0.15 + 0.3 * p.mood["tone"], p=-0.15)
        fig.append((beat, m))
    for off, vel in ((0.0, 0.64), (2.5, 0.52)):
        if off < cut and keep(p, bar, off, "bass"):
            beat = bar.beat + off
            band.pizz("vc", beat, bn(p, V[_chord(bar, off)]["root"]), vel * dyn.v(beat), p=0.05)
    if "pizz" in p.layers:
        for off in (0.5, 1.5, 2.5, 3.5):
            if off < cut and keep(p, bar, off, "mid"):
                beat = bar.beat + off
                for q, nm in enumerate(V[_chord(bar, off)]["off"]):
                    band.pizz("vla", beat + 0.008 * q, mid(p, nm), (0.40 if off in (0.5, 2.5) else 0.45) * dyn.v(beat), p=0.35)
    return fig


PULSE = "G3"     # the stark pulse: one note, the tune's own second note, two octaves down


def acc_sparse(band, p, bar, dyn, cut=4.0):
    """SPARSE (stark, deadpan): a low open fifth held under each chord, and one note, G,
    pulsing slowly on beats 1 and 3, the same note whatever the chord. Nothing else moves."""
    for a, b, c in _chord_spans(bar, cut):
        lh = V[c]["lh"]
        for q, nm in enumerate(lh[:2]):
            if not keep(p, bar, a, "bass" if q == 0 else "mid"):
                continue
            band.piano("piano", bar.beat + a + 0.015 * q, bn(p, nm) if q == 0 else mid(p, nm), b - a,
                       0.42 * dyn.v(bar.beat + a) * (1 if q == 0 else 0.8), tone=-0.3, pedal=True, p=-0.05)
        if "pizz" in p.layers and keep(p, bar, a, "bass"):
            band.pizz("vc", bar.beat + a, bn(p, V[c]["root"]), 0.5 * dyn.v(bar.beat + a), p=0.05)
    for off in (0.0, 2.0):
        if off < cut and keep(p, bar, off, "mid"):
            band.piano("piano", bar.beat + off, mid(p, PULSE), 1.6, 0.25 * dyn.v(bar.beat + off), tone=-0.3, p=0.1)
    return []


def acc_still(band, p, bar, dyn, cut=4.0):
    """STILL (the hush): one soft rolled chord per chord change, pedalled, and its upper two
    notes touched again halfway through a long chord so the sound never dies away."""
    for a, b, c in _chord_spans(bar, cut):
        for q, nm in enumerate(V[c]["lh"]):
            if not keep(p, bar, a, "bass" if q == 0 else "mid"):
                continue
            band.piano("piano", bar.beat + a + 0.03 * q, bn(p, nm) if q == 0 else mid(p, nm), b - a,
                       0.30 * dyn.v(bar.beat + a) * (1 if q == 0 else 0.8), tone=-0.2, pedal=True, p=-0.05)
        if b - a >= 4 and a + 2 < cut and keep(p, bar, a + 2, "mid"):
            for q, nm in enumerate(V[c]["lh"][1:]):
                band.piano("piano", bar.beat + a + 2 + 0.03 * q, mid(p, nm), 2.0, 0.22 * dyn.v(bar.beat + a + 2),
                           tone=-0.2, pedal=True, p=-0.05)
    return []


def _fig_bars(sec):
    """Section.figure as a list of bars of tokens (a single string = one bar, cycled)."""
    f = sec.figure
    bars = [f] if isinstance(f, str) else list(f)
    out = []
    for b in bars:
        toks = b.replace("|", " ").split()
        if abs(len(toks) * sec.step - 4.0) > 1e-6:
            raise ValueError(f"figure bar '{b}' has {len(toks)} steps of {sec.step} beats = "
                             f"{len(toks) * sec.step:g} beats; a bar is 4")
        out.append(toks)
    return out


def _ladder(chord, floor):
    """The chord's tones from `floor` (midi) upwards, two octaves: index 1 is the first chord tone
    at or above the floor. WHY counted from a fixed floor (not from each chord's root): the
    figure's notes then stay in one register and move by the smallest step when the chord
    changes, which is what good voice-leading in an accompaniment is."""
    tones = T.CHORD_TONES[chord]
    return [m for m in range(int(floor), int(floor) + 25) if m % 12 in tones]


def acc_figure(band, p, bar, dyn, cut=4.0):
    """THE FIGURE (round 8): one even, continuous pattern, written as tokens (Section.figure),
    reading its pitches from whatever chord is sounding. "b" = the bass (the chord's root or its
    inversion's bass), 1..9 = chord tones counted up from fig_floor, "r" = rest, "-" = hold the
    note before one step longer. A list of bars is cycled, so a figure can evolve slowly (one
    token changed every few bars) without ever stopping.
    WHY: the owner heard round 7 as "choppy/inconsistent" and its notes as "oddly thrown in".
    A steady figure under changing chords is what makes a bed feel put together; variety then
    comes from the chords, the register (fig_floor as a pair opens it across the section), a
    layer entering or leaving, and the tune, rarely."""
    sec = p.sec
    if getattr(sec, "fig_mode", None) == "pedal":
        return acc_pedal(band, p, bar, dyn, cut)
    if not getattr(sec, "figure", None):
        return acc_rolling(band, p, bar, dyn, cut)          # the ending of a figure-less section
    bars = _fig_bars(sec)
    j = _bar_index(p, bar)
    toks = bars[j % len(bars)]
    fl = sec.fig_floor
    if isinstance(fl, (tuple, list)):
        a, b = m_(fl[0]), m_(fl[1])
        x = 0.0 if len(p.bars) <= 1 else float(np.clip(j / (len(p.bars) - 1), 0, 1))
        floor = int(round(a + (b - a) * x))
    else:
        floor = m_(fl)
    floor += int(getattr(sec, "register", 0) or 0) if not p.ending else 0
    pedal = p.mood["pedal"] if (p.ending or sec.pedal is None) else sec.pedal
    st = float(sec.step)
    fig = []
    i = 0
    while i < len(toks):
        tok = toks[i]
        off = i * st
        n = 1
        while i + n < len(toks) and toks[i + n] == "-":
            n += 1
        i += n
        if tok in ("r", "-") or off >= cut - 1e-9:
            continue
        kind = "bass" if tok == "b" else "mid"
        if not keep(p, bar, off, kind):
            continue
        beat = bar.beat + off
        c = _chord(bar, off)
        if tok == "b":
            m = bn(p, V[c]["root"])
        else:
            lad = _ladder(c, floor)
            m = lad[min(int(tok) - 1, len(lad) - 1)]
        d = n * st
        if tok == "b":
            # WHY the bass held to the next bass token or chord change: a pianist's left hand keeps
            # its bass note down under the moving figure; struck short it left a hole every bar
            nxt_b = next((k * st for k in range(i, len(toks)) if toks[k] == "b"), 4.0)
            chg = 2.0 if (len(bar.chords) == 2 and off < 2) else 4.0
            d = max(d, min(nxt_b, chg, cut) - off)
        if pedal and sec.fig_voice == "piano":
            # WHY pedalled to the chord change like the rolling piano: an even figure that rings is
            # a bed; dry, it ticks
            d = max(d, (2.0 if (len(bar.chords) == 2 and off < 2) else 4.0) - off)
        # WHY the downbeat only a hair stronger (1.1): an even touch is the point; accents are
        # what made the old patterns skip and bounce
        v = sec.fig_touch * (1.1 if abs(off % 4.0) < 1e-6 else 1.0) * dyn.v(beat)
        if sec.fig_voice == "pizz":
            band.pizz("vc" if m < m_("C3") else "vla", beat, m, v * 1.6, p=0.15)
        elif sec.fig_voice == "synth":
            band.synth(beat, m, v * 1.3, 900.0, p=(0.2 if i % 2 else -0.2), gate_beats=max(0.3, d * 0.9))
        else:
            band.piano("piano", beat, m, d, v, tone=-0.25 + 0.2 * p.mood["tone"], pedal=bool(pedal), p=-0.1)
        fig.append((beat, m))
    return fig


def _tune_near(band, beat, m, st):
    """Is a tune note on this same key starting within a step of `beat`? (the pulse yields)"""
    tn = getattr(band, "_tune_keys", None)
    if tn is None:
        tn = band._tune_keys = [(bar.beat + bb, int(mm)) for pl in band.plans for bar in pl.bars
                                for bb, mm, d, canon, _ in bar.tune if canon[0] != "logo"]
    return any(mm == m and abs(b - beat) < st - 1e-6 for b, mm in tn)


def acc_pedal(band, p, bar, dyn, cut=4.0):
    """THE PEDAL PULSE (the rebuild, 2026-11-24; toolkit-plan c1): one pool of notes (default the
    "you-co-ded" cell B-flat G F plus E-flat), taken in a fixed order on the steps of a 16-step
    mask, the SAME whatever the chord. The pad carries the harmony; the brand's three notes are
    heard all the time without becoming a jingle (Mastercard does this with its melody). The
    mask drifts by one step every few bars (Section.fig_mask_walk) and the change plan may move
    the pool up or down a step or two (register) or thin and fill the mask (density).
    WHY: GTA V's map music is "one 16-step pattern circling a single note ... the same way
    regardless of the chord changes" (Quaeschning); round 8's figure re-picked notes from every
    chord, motion that is not the pulse, heard as "busy"."""
    sec = p.sec
    bl = getattr(band, "bedline", None)
    st = float(sec.step)
    bar_no = bl.bar_no(bar.beat) if bl is not None else 1 + int(bar.beat // 4)
    mask = bl.mask(sec, bar_no) if bl is not None else (sec.fig_mask or "x.xxx.x.x.xxx.x.")
    pool = bl.pool(sec, bar_no) if bl is not None else [m_(x) for x in (sec.fig_pedal or ["Bb4", "G4", "F4", "Eb4"])]
    g_pulse = bl.gain("pulse", bar.beat) if bl is not None else 1.0
    pedal = bool(sec.pedal) if (sec.pedal is not None and not p.ending) else False
    fig = []
    n_steps = int(round(p.blen / st))
    for i in range(n_steps):
        off = i * st
        if off >= cut - 1e-9:
            break
        beat = bar.beat + off
        s16 = int(round(beat / st)) % 16
        if mask[s16] != "x" or not keep(p, bar, off, "mid"):
            continue
        g = bl.gain("pulse", beat) if bl is not None else g_pulse
        if g <= 1e-3:
            continue
        # the k-th sounding step of this 16-step round takes the k-th pool note: a fixed order
        k = sum(1 for j in range(s16) if mask[j] == "x")
        if (getattr(sec, "fig_order", None) or "cell") == "circle" and len(pool) > 1:
            # circling: the pool's first note on every other step, the rest in turn between
            # (B-flat G B-flat F B-flat E-flat): never the cell's three notes in a row
            m = pool[0] if k % 2 == 0 else pool[1 + (k // 2) % (len(pool) - 1)]
        else:
            m = pool[k % len(pool)]
        if _tune_near(band, beat, m, st):
            # WHY (audit defect 6): the pulse's B-flat 4 and the tune's B-flat 4 struck 17 ms apart
            # on the same key is a flam; the pulse yields that one step to the tune
            continue
        # WHY legato (each note held into the next, a quarter-step overlap): a dry felt note dies
        # in half a second, and the gap after it read as a hole in the bed
        nxt = next((j for j in range(1, 17) if mask[(s16 + j) % 16] == "x"), 2)
        d = st * (nxt + 0.25)
        bar_end = bar.beat + p.blen
        if bl is not None and beat + d > bar_end and bl.pulse_at(bar_end) != pool:
            # WHY (audit 2026-11-25, defect 6): legato across a pool change let the high B-flat 5
            # ring into the tune's first note after her last word; the old pool stops at the bar line
            d = max(st * 0.5, bar_end - 0.1 - beat)
        if pedal:
            d = max(d, (2.0 if (len(bar.chords) == 2 and off < 2) else p.blen) - off)
        v = sec.fig_touch * dyn.v(beat) * g
        if sec.fig_voice == "pizz":
            band.pizz("vla", beat, m, v * 1.6, p=0.15, role="pulse")
        else:
            band.piano("piano", beat, m, d, v, tone=-0.3 + 0.2 * p.mood["tone"], pedal=pedal,
                       p=(0.12 if k % 2 else -0.12), role="pulse")
        fig.append((beat, m))
    if getattr(sec, "fig_bass", False):
        # the chord's root, soft and held, struck once at each chord CHANGE and held until the next
        # one. WHY once (audit 2026-11-25, defect 12): it was struck again every bar under an
        # unchanged chord (E-flat 2 at bars 1 and 2), which the guide never said. WHY at all: a
        # felt-piano root gives the bed a low edge to the attack and names the chord; the sub
        # and the pad's lowest note have no attack. (C2-A-flat 2 is 65-104 Hz: a phone plays
        # little of it, so this is NOT "a floor a phone can hear", as an older comment said.)
        spans = bl._spans() if bl is not None else None
        for a, b, c in _chord_spans(bar, min(cut, p.blen)):
            if bar.beat + a >= (bl.end_beat if bl is not None else 1e9) and not p.ending:
                continue
            if not keep(p, bar, a, "bass"):
                continue
            d = b - a
            if spans is not None and not p.ending:
                sp = next((x for x in spans if x[0] - 1e-6 <= bar.beat + a < x[0] + x[1]), None)
                if sp is not None:
                    if abs(sp[0] - (bar.beat + a)) > 1e-6:
                        continue                  # the same chord goes on: the root is still held
                    d = min(sp[0] + sp[1], bl.end_beat) - (bar.beat + a)
            g = bl.gain("pulse", bar.beat + a) if bl is not None else 1.0
            if g > 1e-3:
                band.piano("piano", bar.beat + a, bn(p, V[c]["root"]), d, sec.fig_touch * 0.95 * dyn.v(bar.beat + a) * g,
                           tone=-0.35, pedal=False, p=-0.05, role="bass")
    return fig


ACCOMPANIMENTS = {"rolling": acc_rolling, "bounce": acc_bounce, "rocking": acc_rocking,
                  "sparse": acc_sparse, "still": acc_still, "figure": acc_figure}


def play_accomp(band, p, dyn, piece, plans):
    pattern = ACCOMPANIMENTS[p.accomp]
    if p.ending and piece.logo == "piano" and p.accomp == "bounce":
        pattern = acc_still                 # the piano-only ending: the piano keeps the chords
    # THE BLEND: over the last `span` bars the next section's pattern grows in underneath
    # (from 30 % to 90 % of its strength) while this one thins (to 45 %) and stops at the
    # change, so the new feel is already moving when its section starts: no gap, no restart
    nxt, b0 = _blend(plans, p)
    cross = nxt is not None and nxt.accomp != p.accomp
    L = 4.0 * p.span

    def frac(beat):
        return float(np.clip((beat - b0) / L, 0, 1))
    v2 = piece.style != "v1"
    if v2:
        # WHY v2 (2026-11-23): the old blend kept both accompaniments near full strength, so the
        # two bars BEFORE the payoff of "Make it mine" were its busiest (51 notes in a bar against
        # 36-41 in the payoff). Now it is a hand-over: the old pattern thins (its weak beats go
        # first) and fades to a quarter, while the new one enters with only its strong beats and
        # fills in, so the note count across the join stays level.
        out_dyn = Scaled(dyn, lambda beat: 1.0 - 0.75 * frac(beat)) if cross else dyn
        in_dyn = Scaled(dyn, lambda beat: 0.35 + 0.55 * frac(beat))
    else:
        out_dyn = Scaled(dyn, lambda beat: 1.0 - 0.55 * frac(beat)) if cross else dyn
        in_dyn = Scaled(dyn, lambda beat: 0.3 + 0.6 * frac(beat))
    for bar in p.bars:
        # the ending bar's pattern stops at beat 2 (the band holds the chord); in the piano-only
        # ending the piano keeps its pattern going to beat 3, since nothing else holds the sound
        cut = (3.0 if piece.logo == "piano" else 2.0) if p.ending else p.blen   # WHY blen: an odd bar
        if p.ending and p.blen < 4:
            # the short ending: the held chord alone carries it; WHY the pedal pulse plays its first
            # beat (v3): stopped a whole second before the name, the bed dropped 7 dB at once
            cut = 1.0 if getattr(p.sec, "fig_mode", None) == "pedal" else 0.0
        blending = cross and bar.beat >= b0 - 1e-6
        if v2 and blending:
            f = frac(bar.beat + 2.0)
            _DENSITY[id(p)] = min(p.sec.density if p.sec.density is not None else 1.0, 1.0 - 0.6 * f)
            _DENSITY[id(nxt)] = min(nxt.sec.density if nxt.sec.density is not None else 1.0, 0.3 + 0.6 * f)
        fig = pattern(band, p, bar, out_dyn if bar.beat >= b0 - 1e-6 else dyn, cut)
        if blending:
            ACCOMPANIMENTS[nxt.accomp](band, nxt, bar, in_dyn, cut)
        _DENSITY.pop(id(p), None)
        _DENSITY.pop(id(nxt), None)
        synth_on = "synth" in p.layers and not (p.ending and piece.logo == "piano")
        if synth_on and fig:
            # SOFT SYNTH DOUBLING: the pattern's moving line, quietly, its filter opening slowly
            # across the section (never a sweep: about one octave over the whole section)
            for beat, m in fig:
                while m < 48:
                    m += 12
                frac_s = np.clip((beat - p.beat0) / max(p.beats, 1), 0, 1)
                band.synth(beat, m, 0.40 * dyn.v(beat), 700 * 2 ** frac_s, p=(0.25 if int(beat * 2) % 2 else -0.25))
    if p.ending:
        # the ending's held chord (B-flat sus) from beat 2: the band holds while the tune sighs
        # and the logo's pick-up notes lead to the landing
        bar = p.bars[0]
        beat = bar.beat + p.blen - 2.0
        quiet = piece.logo in ("quiet", "none")
        for q, nm in enumerate(["Bb1", "Eb3", "Ab3"]):
            band.piano("piano", beat + 0.015 * q, m_(nm), 2.0, (0.34 if q == 0 else 0.28) * dyn.v(beat)
                       * (1.2 if piece.logo == "piano" else (0.85 if quiet else 1.0)), tone=-0.2, pedal=True)
        if (p.accomp in ("bounce", "rocking") or "pizz" in p.layers) and piece.logo not in ("piano", "quiet", "none"):
            band.pizz("vc", beat, m_("Bb2"), 0.58 * dyn.v(beat), p=0.05)
    elif p.hold and p.into == "hold":
        # THE HOLD: a fresh, soft, pedalled chord on the section's last chord, held (a fermata)
        beat = p.beat0 + p.blen * len(p.bars)
        c = p.bars[-1].chords[-1]
        for q, nm in enumerate(V[c]["lh"]):
            band.piano("piano", beat + 0.025 * q, m_(nm), p.hold + 0.4, (0.30 if q == 0 else 0.25) * dyn.v(beat),
                       tone=-0.2, pedal=True)


# ====================================================================== LAYERS

def _segments(p):
    """(start beat, length, chord) for the whole section, the hold included in the last."""
    out = []
    for bar in p.bars:
        for a, b, c in _chord_spans(bar, p.blen):
            out.append([bar.beat + a, b - a, c])
    out[-1][1] += p.hold
    if p.ending:
        out[-1][1] += 0.25          # overlap the logo's own string swell, which takes over
    return out


def _line(segs, pick):
    """Join a line of held notes: a note that stays the same across a chord change keeps
    the same bow (no re-attack)."""
    notes = []
    for b, d, c in segs:
        nm = pick(c)
        if nm is None:
            continue
        if notes and notes[-1][1] == nm and abs(notes[-1][0] + notes[-1][2] - b) < 1e-6:
            notes[-1][2] += d
        else:
            notes.append([b, nm, d])
    return notes


def _on(p, layer, piece):
    piano_end = p.ending and piece.logo == "piano"
    if layer == "held":
        return "held" in p.layers
    if layer == "low":
        return ("low" in p.layers or p.sec.lift) and not piano_end
    if layer == "air":
        return ("air" in p.layers or p.sec.lift) and not piano_end
    if layer == "sub":
        return "sub" in p.layers and not piano_end
    return False


def _base(p, layer):
    return {"held": p.mood["held"], "low": p.mood["held"] * 0.7 + 0.04,
            "air": p.mood["air"] or 0.05}[layer]


# held layers: (voices, note picker, section, pan, bus)
HELD = {
    "held": [(lambda c, v=v: V[c]["bow"][v], None, (-0.35, 0.35, 0.0)[v], "bowed") for v in range(3)],
    "low": [(lambda c: V[c]["root"], "vc", 0.1, "bowed")],
    "air": [(lambda c: V[c]["air"], "vln", -0.2, "air")],
}


def play_held(band, p, dyn, plans, k, piece):
    """HELD STRINGS, LOW CELLOS, AIR: long bowed lines that move as little as possible. Their
    level follows the dynamics in straight lines (a lift is one long rise). In a BLEND they
    move to the next section's level across the blend's bars: a layer the next section adds
    enters there (from nothing), one it drops bows away there, so nothing appears or stops at
    the join itself. A note common to both sides of a join is held straight through it (one
    bow), carrying the sound across the bar line."""
    segs_all = _segments(p)
    piano_end = p.ending and piece.logo == "piano"
    end_beat = p.beat0 + p.blen - 0.5 if piano_end else None
    nxt, b0 = _blend(plans, p)
    body_end = p.beat0 + p.blen * len(p.bars)
    follow = plans[k + 1] if (k + 1 < len(plans)) else None

    def factor(q, beat):
        f = dyn.v(beat) * (1.0 + STRING_LIFT * dyn.lift_progress(beat))
        if q.voice in ("violin", "both"):
            f *= 0.6           # WHY: the held strings step back when a violin carries the tune
        return f

    for layer, voices in HELD.items():
        here = _on(p, layer, piece)
        there = nxt is not None and _on(nxt, layer, piece)
        if not here and not there:
            continue

        def lvl(beat, layer=layer, here=here, there=there):
            v_here = _base(p, layer) * factor(p, beat) if here else 0.0
            if nxt is None or beat <= b0:
                v = v_here
            else:
                v_next = _base(nxt, layer) * factor(nxt, beat) if there else 0.0
                w = float(np.clip((beat - b0) / (body_end - b0), 0, 1))
                v = v_here + (v_next - v_here) * w
            if end_beat is not None:
                v *= np.clip((end_beat - beat) / 3.5, 0, 1)    # strings bow away before the piano logo
            return max(v, 0.0)

        start = p.beat0
        if layer == "air" and p.sec.lift and "air" not in p.layers:
            start = p.beat0 + 2 * len(p.bars)                  # in a lift the air joins halfway
        if not here:
            start = b0                                         # entering during the blend
        had = band.held_on.get((layer, k), False)
        for vi, (pick, sec_, pan_, bus) in enumerate(voices):
            line = [x for x in _line(segs_all, pick) if x[0] + x[2] > start + 1e-6]
            # a note carried in from the previous section's last note: skip what it covers
            carried = band.carry.get((layer, vi, k))
            if carried is not None:
                line = [x for x in line if x[0] + x[2] > carried + 1e-6]
                if line and line[0][0] < carried:
                    line[0][2] -= carried - line[0][0]
                    line[0][0] = carried
            # carry this section's last note through the join if the next section starts on it
            if line and follow is not None and _on(follow, layer, piece) and not follow.ending \
                    and (here or there):
                fl = _line(_segments(follow), pick)
                if fl and fl[0][1] == line[-1][1] and abs(fl[0][0] - (line[-1][0] + line[-1][2])) < 1e-6:
                    line[-1][2] += fl[0][2]
                    band.carry[(layer, vi, k + 1)] = fl[0][0] + fl[0][2]
            for j, (b, nm, d) in enumerate(line):
                if b < start:
                    d -= start - b
                    b = start
                m = m_(nm)
                sec = sec_ or ("vla" if m < m_("D4") else "vln")
                first = j == 0 and not had and carried is None
                if first and not here:
                    att = band.secs(b, 4.0 * p.span) * 0.8          # grows in across the blend
                elif first:
                    att = band.secs(b, 4) * (0.8 if layer == "air" else 0.6)
                else:
                    att = 0.5 if layer == "air" else 0.35
                end = b + d
                v1 = (_base(follow, layer) * factor(follow, end)) if (follow is not None and end > body_end + 1e-6
                                                                   and not follow.ending) else lvl(end)
                band.bow(sec, b, m, d + (0.2 if layer == "air" else 0.15), lvl(b), v1, p=pan_, bus=bus,
                         attack=att, release=0.6 if layer == "air" else 0.4)
        if here or there:
            band.held_on[(layer, k + 1)] = there or (here and nxt is None and follow is not None
                                                     and _on(follow, layer, piece))


def play_sub(band, p, dyn, piece, plans, k):
    """SOFT SUB: a round sine on each chord's root, held: weight only, no rhythm of its own.
    It fades in over a bar when it first arrives, or across a blend's bars."""
    here = _on(p, "sub", piece)
    nxt, b0 = _blend(plans, p)
    there = nxt is not None and _on(nxt, "sub", piece)
    if not here and not there:
        return
    first = not band.held_on.get(("sub", k), False)
    j0 = True
    for b, d, c in _segments(p):
        if not here and b + d <= b0:
            continue
        if not here and b < b0:
            d -= b0 - b
            b = b0
        g = 1.0
        if here and nxt is not None and not there and b >= b0:
            g = 1.0 - (b - b0) / (4.0 * p.span)              # bows away across the blend
        fin = 0.0
        if j0 and first and (k > 0 or not here):
            fin = band.secs(b, 4.0 * (p.span if not here else 1))
        band.sub(b, m_(V[c]["sub"]), d - 0.05, 0.6 * min(1.15, dyn.v(b)) * g, fin=fin)
        j0 = False
    band.held_on[("sub", k + 1)] = there or here


# ====================================================================== THE LOGO, PLAYED

def play_logo(band, plans, piece):
    """THE LOGO as the piece's own last phrase, played live by the same instruments in the
    piece's own (slowing) tempo. Notes, velocities and instruments are those of the chosen
    logo files: 10-full-blend (piano cell doubled by plucked violins, landing E-flat chord on
    piano with plucked cello and sub, a string swell, the second piano answering low) or
    02-piano-only (piano cell, open low E-flat chord). The third note (F) lands exactly on
    the piece's landing time; everything then rings and resolves to the end of the file."""
    ep = plans[-1]
    land = ep.beat0 + ep.blen
    t_land = band.sec(land)
    tail = piece.length - t_land
    bpm_end = ep.tm.bpm_at(land)
    if piece.logo == "none":
        # THE HAND-ON ENDING (no logo): an open B-flat chord rings on under the next part of the
        # film; the sigh (C6, B-flat) above it is the question left open
        ring = (tail - 0.3) * bpm_end / 60.0
        for q, (nm, v) in enumerate((("Bb1", 0.30), ("F2", 0.24), ("D3", 0.22), ("Bb3", 0.2))):
            band.piano("piano", land + q * 0.03 * bpm_end / 60, m_(nm), ring, v * band.dyn.v(land), tone=-0.15, pedal=True)
        band.landing = None
        return
    # WHY "quiet" (2026-11-23): the same logo for a subtle film: no plucked doubling (it measured
    # as the most drum-like attack in two films), no low answer after it, a softer touch and a
    # smaller swell, so the logo does not land louder than the film's own peak
    quiet = piece.logo == "quiet"
    blend = piece.logo in ("blend", "quiet")
    touch = 0.85 if quiet else 1.0
    tone = 0.0 if blend else -0.15
    cell = [(ep.beat0 + b - (4.0 - ep.blen), m_(nm), b) for b, nm, _ in T.LOGO_CELL]
    for i, (beat, m, b0) in enumerate(cell):
        is_land = i == 2
        dur = (tail - 1.2) * bpm_end / 60.0 if is_land else 0.5
        # WHY 6 ms early: measured, this piano recording speaks about 6.5 ms after the sample
        # starts (its rounded attack); struck early, the name's note is HEARD on the frame
        band.piano("lead", beat, m, dur, T.LOGO_VEL[i] * touch, tone=tone, pedal=True, p=-0.1,
                   jit=(0.0 if is_land else 2.0), role="lead", canon=("logo", b0),
                   early=LAND_EARLY)
        if blend and not quiet:
            band.pizz("vln", beat, m, (0.38, 0.42, 0.48)[i], p=0.0, jit=(0.0 if is_land else 3.0))
    cell = [(beat, m) for beat, m, _ in cell]
    ring = (tail - 1.0) * bpm_end / 60.0      # beats the landing chord rings (pedalled)
    if blend:
        for q, (nm, v) in enumerate((("Eb2", 0.38), ("Eb3", 0.28))):
            band.piano("piano", land + q * 0.03 * bpm_end / 60, m_(nm), ring, v * touch, tone=-0.1, pedal=True)
        if not quiet:
            band.pizz("vc", land, m_("Eb2"), 0.55, p=0.05, jit=0.0)
        band.sub(land, m_("Eb2"), min(2.2, tail - 0.5) * bpm_end / 60.0, 0.55 * touch, fin=0.03)
        # the swell: the held strings open into the landing chord and settle with it
        lvl = max(0.15, plans[-2].mood["held"]) * 1.25 * band.dyn.v(land) * (0.75 if quiet else 1.0)
        t0 = band.sec(land) - 0.15
        L = tail - 0.05
        pk = min(1.0 / L, 0.4)
        for q, nm in enumerate(("Eb3", "Bb3", "G4", "Eb5")):
            m = m_(nm)
            band.bow("vla" if m < m_("D4") else "vln", land - 0.15 * bpm_end / 60, m, L * bpm_end / 60, 0, 0,
                     p=(-0.3, 0.3, -0.15, 0.15)[q], attack=0.2, release=0.3,
                     shape=[(0, 0.0), (pk, lvl), (max(pk + 0.05, 0.55), lvl * 0.8), (1.0, 0.0)])
        if _on(plans[-2], "air", piece):
            band.bow("vln", land, m_("Eb6"), L * bpm_end / 60, 0, 0, p=-0.2, bus="air", attack=0.3, release=0.4,
                     shape=[(0, (plans[-2].mood["air"] or 0.05) * band.dyn.v(land)), (1.0, 0.0)])
        # the second piano answers low, a little slower (the logo's own echo); not in "quiet"
        for (off, nm, v) in () if quiet else ((1.0, "Bb3", 0.36), (1.6, "G4", 0.38), (2.2, "F4", 0.42)):
            d = 0.6 if nm != "F4" else max(0.6, (tail - 2.0) * bpm_end / 60)
            band.piano("answer", land + off, m_(nm), d, v, tone=-0.7, p=-0.25, pedal=True)
    else:
        for q, (nm, v) in enumerate((("Eb2", 0.42), ("Bb2", 0.30), ("G3", 0.27))):
            band.piano("piano", land + q * 0.015 * bpm_end / 60, m_(nm), ring, v, tone=-0.15, pedal=True)
    band.landing = (t_land, cell[2][1])


def render(band, plans, piece):
    dyn = Dyn(plans)
    band.dyn = dyn
    band.carry, band.held_on = {}, {}
    # THE BED (the rebuild): a piece with a bed (every recipe) gets its sustain, layers, cycles
    # and change plan from bed.py; the BedLine is made first because the pedal pulse reads it
    import bed as BED
    band.bedline = BED.BedLine(piece, plans) if piece.bed is not None else None
    for k, p in enumerate(plans):
        band.swing = p.mood["swing"]
        play_tune(band, p, dyn, plans)
        play_answer(band, p, dyn, plans, k)
        play_counter(band, p, dyn, plans)
        play_bass(band, p, dyn, plans, k)
        play_accomp(band, p, dyn, piece, plans)
        play_held(band, p, dyn, plans, k, piece)
        play_sub(band, p, dyn, piece, plans, k)
    band.swing = 0.0
    if band.bedline is not None:
        BED.play(band, plans, piece)
    play_logo(band, plans, piece)
    return dyn
