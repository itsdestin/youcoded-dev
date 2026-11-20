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
            body_end = q.beat0 + 4 * len(q.bars)
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
            body_end = p.beat0 + 4 * len(p.bars)
            if p.sec.lift and not p.ending:
                c = plans[k + 1].beat1 + 64 if (k + 1 < len(plans) and plans[k + 1].ending) else \
                    (plans[k + 1].beat1 if k + 1 < len(plans) else body_end)
                self.curves.append(([p.beat0, body_end, c, c + 4], [1.0, 1.0 + LIFT, 1.0 + LIFT, 1.0]))
                self.lift_spans.append((p.beat0, body_end, c))
            if p.into == "build" and not p.ending:
                self.curves.append(([body_end - 4 * p.span, body_end, body_end + 4], [1.0, 1.0 + BUILD, 1.0]))

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
    return nxt, p.beat0 + 4 * len(p.bars) - 4 * p.span


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
    body_end = p.beat0 + 4 * len(p.bars)
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
    for bar in p.bars:
        last_bar = bar is p.bars[-1]
        for bb, m, d, canon in bar.tune:
            beat = bar.beat + bb
            if canon[0] == "logo":
                continue                              # the logo's pick-ups: play_logo
            if p.hold and abs(beat + d - body_end) < 1e-6:
                d = d + p.hold                       # the tune holds through a fermata
            s = phrase_shape(beat, p.beat0, d, bb)
            v = 0.60 * p.mood.get("lead", 1.0) * dyn.v(beat) * s * (0.72 if p.sec.narration else 1.0)   # softer under a voice
            piano_on = p.voice in ("piano", "both") or p.ending
            if piano_on:
                band.piano("lead", beat, m, d, min(v, 0.69), tone=tone, pedal=p.mood["pedal"], p=-0.1,
                           role="lead", canon=canon)
                if octaves:
                    band.piano("double", beat + 0.003, m - 12, d, min(v, 0.69) * 0.74, tone=tone - 0.1,
                               pedal=p.mood["pedal"], p=-0.1, role="double")
            if (handover and bar is p.bars[0]) or (join_piano and last_bar):
                band.piano("double", beat, m, d, min(v, 0.69) * 0.7, tone=tone, pedal=False, p=-0.1,
                           role="double")
            if p.voice in ("violin", "both"):
                _violin(band, beat, m, d, 0.62 * dyn.v(beat) * s, role=("double" if piano_on else "lead"),
                        canon=canon)
            elif join_violin and last_bar:
                _violin(band, beat, m, d, 0.62 * 0.7 * dyn.v(beat) * s, role="double")


# ====================================================================== THE ANSWER

def play_answer(band, p, dyn, plans, k_plan):
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


def acc_rolling(band, p, bar, dyn, cut=4.0):
    """ROLLING PIANO (blend-1): the left hand rolls through each chord in even eighths (low
    root, fifth, tenth, fifth), leaning on beat 1 and just before beat 3. Plucked strings, if
    on, double its low notes (cellos) and middle notes (violas)."""
    fig = []
    for off, i, d, vel in ROLL:
        if off >= cut:
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = m_(ch["fig"][i])
        if p.mood["pedal"]:
            # WHY: in the warm moods the rolled notes are pedalled, each ringing on until the
            # chord changes (where a pianist changes the pedal), so the figure flows
            d = (2.0 if (len(bar.chords) == 2 and off < 2) else 4.0) - off
        band.piano("piano", beat, m, d, vel * dyn.v(beat), tone=-0.2 + 0.3 * p.mood["tone"], p=-0.1)
        fig.append((beat, m + 12))
        if "pizz" in p.layers:
            if i == 0:
                band.pizz("vc", beat, m_(ch["root"]), 0.62 * vel / 0.5 * dyn.v(beat), p=0.05)
            if i == 2:
                for q, nm in enumerate(ch["off"]):
                    band.pizz("vla", beat + 0.008 * q, m_(nm), 0.46 * dyn.v(beat), p=0.3)
    return fig


def acc_bounce(band, p, bar, dyn, cut=4.0):
    """PIZZICATO BOUNCE (chamber-1): cellos pluck the root on 1 and just after 2, and the
    root an octave up just after 3; violas pluck a two-note chord between every beat. The two
    parts interlock. A soft held left-hand chord on the piano underneath, for warmth."""
    fig = []
    soft = 0.82 if p.voice in ("violin", "both") else 1.0   # step back when the strings sing
    for off, kind, vel in ((0.0, "root", 0.66), (1.5, "root", 0.56), (2.5, "oct", 0.58)):
        if off >= cut:
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = m_(ch["root"]) + (12 if kind == "oct" else 0)
        band.pizz("vc", beat, m, vel * soft * dyn.v(beat), p=0.05)
        fig.append((beat, m + 12))
    for off in (0.5, 1.5, 2.5, 3.5):
        if off >= cut:
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        for q, nm in enumerate(ch["off"]):
            band.pizz("vla", beat + 0.008 * q, m_(nm), (0.46 if off in (1.5, 3.5) else 0.40) * soft * dyn.v(beat), p=0.3)
    for a, b, c in _chord_spans(bar, cut):
        for q, nm in enumerate(V[c]["lh"]):
            band.piano("piano", bar.beat + a + 0.012 * q, m_(nm), b - a - 0.1,
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
        if off >= cut:
            continue
        beat = bar.beat + off
        ch = V[_chord(bar, off)]
        m = m_(ch["rock"][s % 4])
        band.piano("piano", beat, m, 0.55, accents.get(off, 0.28) * soft * dyn.v(beat), tone=-0.15 + 0.3 * p.mood["tone"], p=-0.15)
        fig.append((beat, m))
    for off, vel in ((0.0, 0.64), (2.5, 0.52)):
        if off < cut:
            beat = bar.beat + off
            band.pizz("vc", beat, m_(V[_chord(bar, off)]["root"]), vel * dyn.v(beat), p=0.05)
    if "pizz" in p.layers:
        for off in (0.5, 1.5, 2.5, 3.5):
            if off < cut:
                beat = bar.beat + off
                for q, nm in enumerate(V[_chord(bar, off)]["off"]):
                    band.pizz("vla", beat + 0.008 * q, m_(nm), (0.40 if off in (0.5, 2.5) else 0.45) * dyn.v(beat), p=0.35)
    return fig


PULSE = "G3"     # the stark pulse: one note, the tune's own second note, two octaves down


def acc_sparse(band, p, bar, dyn, cut=4.0):
    """SPARSE (stark, deadpan): a low open fifth held under each chord, and one note, G,
    pulsing slowly on beats 1 and 3, the same note whatever the chord. Nothing else moves."""
    for a, b, c in _chord_spans(bar, cut):
        lh = V[c]["lh"]
        for q, nm in enumerate(lh[:2]):
            band.piano("piano", bar.beat + a + 0.015 * q, m_(nm), b - a, 0.42 * dyn.v(bar.beat + a) * (1 if q == 0 else 0.8),
                       tone=-0.3, pedal=True, p=-0.05)
        if "pizz" in p.layers:
            band.pizz("vc", bar.beat + a, m_(V[c]["root"]), 0.5 * dyn.v(bar.beat + a), p=0.05)
    for off in (0.0, 2.0):
        if off < cut:
            band.piano("piano", bar.beat + off, m_(PULSE), 1.6, 0.25 * dyn.v(bar.beat + off), tone=-0.3, p=0.1)
    return []


def acc_still(band, p, bar, dyn, cut=4.0):
    """STILL (the hush): one soft rolled chord per chord change, pedalled, and its upper two
    notes touched again halfway through a long chord so the sound never dies away."""
    for a, b, c in _chord_spans(bar, cut):
        for q, nm in enumerate(V[c]["lh"]):
            band.piano("piano", bar.beat + a + 0.03 * q, m_(nm), b - a, 0.30 * dyn.v(bar.beat + a) * (1 if q == 0 else 0.8),
                       tone=-0.2, pedal=True, p=-0.05)
        if b - a >= 4 and a + 2 < cut:
            for q, nm in enumerate(V[c]["lh"][1:]):
                band.piano("piano", bar.beat + a + 2 + 0.03 * q, m_(nm), 2.0, 0.22 * dyn.v(bar.beat + a + 2),
                           tone=-0.2, pedal=True, p=-0.05)
    return []


ACCOMPANIMENTS = {"rolling": acc_rolling, "bounce": acc_bounce, "rocking": acc_rocking,
                  "sparse": acc_sparse, "still": acc_still}


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
    out_dyn = Scaled(dyn, lambda beat: 1.0 - 0.55 * frac(beat)) if cross else dyn
    in_dyn = Scaled(dyn, lambda beat: 0.3 + 0.6 * frac(beat))
    for bar in p.bars:
        # the ending bar's pattern stops at beat 2 (the band holds the chord); in the piano-only
        # ending the piano keeps its pattern going to beat 3, since nothing else holds the sound
        cut = (3.0 if piece.logo == "piano" else 2.0) if p.ending else 4.0
        fig = pattern(band, p, bar, out_dyn if bar.beat >= b0 - 1e-6 else dyn, cut)
        if cross and bar.beat >= b0 - 1e-6:
            ACCOMPANIMENTS[nxt.accomp](band, nxt, bar, in_dyn, cut)
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
        beat = bar.beat + 2.0
        for q, nm in enumerate(["Bb1", "Eb3", "Ab3"]):
            band.piano("piano", beat + 0.015 * q, m_(nm), 2.0, (0.34 if q == 0 else 0.28) * dyn.v(beat)
                       * (1.2 if piece.logo == "piano" else 1.0), tone=-0.2, pedal=True)
        if (p.accomp in ("bounce", "rocking") or "pizz" in p.layers) and piece.logo != "piano":
            band.pizz("vc", beat, m_("Bb2"), 0.58 * dyn.v(beat), p=0.05)
    elif p.hold and p.into == "hold":
        # THE HOLD: a fresh, soft, pedalled chord on the section's last chord, held (a fermata)
        beat = p.beat0 + 4 * len(p.bars)
        c = p.bars[-1].chords[-1]
        for q, nm in enumerate(V[c]["lh"]):
            band.piano("piano", beat + 0.025 * q, m_(nm), p.hold + 0.4, (0.30 if q == 0 else 0.25) * dyn.v(beat),
                       tone=-0.2, pedal=True)


# ====================================================================== LAYERS

def _segments(p):
    """(start beat, length, chord) for the whole section, the hold included in the last."""
    out = []
    for bar in p.bars:
        for a, b, c in _chord_spans(bar):
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
    end_beat = p.beat0 + 3.5 if piano_end else None
    nxt, b0 = _blend(plans, p)
    body_end = p.beat0 + 4 * len(p.bars)
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
    land = ep.beat0 + 4.0
    t_land = band.sec(land)
    tail = piece.length - t_land
    bpm_end = ep.tm.bpm_at(land)
    blend = piece.logo == "blend"
    tone = 0.0 if blend else -0.15
    cell = [(ep.beat0 + b, m_(nm)) for b, nm, _ in T.LOGO_CELL]
    for i, (beat, m) in enumerate(cell):
        is_land = i == 2
        dur = (tail - 1.2) * bpm_end / 60.0 if is_land else 0.5
        # WHY 6 ms early: measured, this piano recording speaks about 6.5 ms after the sample
        # starts (its rounded attack); struck early, the name's note is HEARD on the frame
        band.piano("lead", beat, m, dur, T.LOGO_VEL[i], tone=tone, pedal=True, p=-0.1,
                   jit=(0.0 if is_land else 2.0), role="lead", canon=("logo", beat - ep.beat0),
                   early=LAND_EARLY)
        if blend:
            band.pizz("vln", beat, m, (0.38, 0.42, 0.48)[i], p=0.0, jit=(0.0 if is_land else 3.0))
    ring = (tail - 1.0) * bpm_end / 60.0      # beats the landing chord rings (pedalled)
    if blend:
        for q, (nm, v) in enumerate((("Eb2", 0.38), ("Eb3", 0.28))):
            band.piano("piano", land + q * 0.03 * bpm_end / 60, m_(nm), ring, v, tone=-0.1, pedal=True)
        band.pizz("vc", land, m_("Eb2"), 0.55, p=0.05, jit=0.0)
        band.sub(land, m_("Eb2"), min(2.2, tail - 0.5) * bpm_end / 60.0, 0.55, fin=0.03)
        # the swell: the held strings open into the landing chord and settle with it
        lvl = max(0.15, plans[-2].mood["held"]) * 1.25 * band.dyn.v(land)
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
        # the second piano answers low, a little slower (the logo's own echo)
        for (off, nm, v) in ((1.0, "Bb3", 0.36), (1.6, "G4", 0.38), (2.2, "F4", 0.42)):
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
    for k, p in enumerate(plans):
        band.swing = p.mood["swing"]
        play_tune(band, p, dyn, plans)
        play_answer(band, p, dyn, plans, k)
        play_accomp(band, p, dyn, piece, plans)
        play_held(band, p, dyn, plans, k, piece)
        play_sub(band, p, dyn, piece, plans, k)
    band.swing = 0.0
    play_logo(band, plans, piece)
    return dyn
