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


def m_(name):
    return note(name)


# ====================================================================== dynamics

class Dyn:
    """How hard everyone plays at each beat: the moods' levels joined by smooth ramps at the
    section changes (the transition decides where the ramp sits), times THE LIFT."""

    def __init__(self, plans):
        pts = []
        for k, p in enumerate(plans):
            if k == 0:
                pts.append((p.beat0, p.dyn))
                continue
            q = plans[k - 1]
            body_end = q.beat0 + 4 * len(q.bars)
            into = q.sec.into if not q.ending else "flow"
            if into == "build":
                pts += [(body_end - 4, q.dyn), (p.beat0, p.dyn)]
            elif into in ("hold", "breath"):
                pts += [(body_end, q.dyn), (p.beat0, p.dyn)]
            else:
                pts += [(p.beat0 - 1.0, q.dyn), (p.beat0 + 0.5, p.dyn)]
        pts.append((plans[-1].beat1 + 8, plans[-1].dyn))
        self.b, self.d = map(np.array, zip(*pts))
        # growth curves (beats, gain): THE LIFT rises in one straight line across its section
        # and STAYS up through the next section (the big moment it led to); a BUILD rises over
        # the last bar and settles back over the next bar (the next mood takes over)
        self.curves = []
        self.lift_spans = []
        for k, p in enumerate(plans):
            body_end = p.beat0 + 4 * len(p.bars)
            if p.sec.lift and not p.ending:
                c = plans[k + 1].beat1 if k + 1 < len(plans) else body_end
                self.curves.append(([p.beat0, body_end, c, c + 4], [1.0, 1.0 + LIFT, 1.0 + LIFT, 1.0]))
                self.lift_spans.append((p.beat0, body_end, c))
            if p.sec.into == "build" and not p.ending:
                self.curves.append(([body_end - 4, body_end, body_end + 4], [1.0, 1.0 + BUILD, 1.0]))

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


def play_tune(band, p, dyn, plans):
    body_end = p.beat0 + 4 * len(p.bars)
    tone = p.mood["tone"]
    octaves = ("octaves" in p.layers) or p.sec.lift or p.voice == "both"
    # THE HANDOVER: when the tune passes from the piano to the violin at a section change, the
    # piano plays the first bar with the violin, softly, then lets go (a bowed note speaks
    # slowly; the piano's touch makes the first notes clear, and the hand-over is heard)
    handover = (p.voice == "violin" and p.i > 0 and plans[p.i - 1].voice in ("piano", "both"))
    for bar in p.bars:
        for bb, m, d, canon in bar.tune:
            beat = bar.beat + bb
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
            if handover and bar is p.bars[0]:
                band.piano("double", beat, m, d, min(v, 0.69) * 0.7, tone=tone, pedal=False, p=-0.1,
                           role="double")
            if p.voice in ("violin", "both"):
                # the solo violin sings the tune; the violin section doubles it quietly for body,
                # the cellos sing it an octave lower (chamber-2)
                dig = 1.15 if d <= 0.5 else 1.0       # a quick bowed note needs a firmer bow
                vl = 0.62 * dyn.v(beat) * s * dig
                band.bow("solo", beat, m, d + 0.12, vl, vl, p=-0.1, bus="sing",
                         attack=0.03 if d <= 0.5 else 0.06, release=0.22,
                         role=("double" if piano_on else "lead"), canon=canon)
                band.bow("vln", beat, m, d + 0.12, vl * 0.62, vl * 0.66, p=-0.3, bus="sing",
                         attack=0.05 if d <= 0.5 else 0.1, release=0.25, role="double")
                band.bow("vc", beat, m - 12, d + 0.12, vl * 0.75, vl * 0.8, p=0.25, bus="double",
                         attack=0.05 if d <= 0.5 else 0.1, release=0.25, role="double")


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
    nxt = plans[p.i + 1] if p.i + 1 < len(plans) else None
    # THE LEAD-IN: a still or sparse section that BUILDS into a moving one starts the next
    # section's pattern in its last bar, softly (the player sets the new motion going before
    # the downbeat, so the new section arrives already moving instead of all at once)
    lead_in = (p.sec.into == "build" and not p.ending and nxt is not None and
               p.accomp in ("still", "sparse") and nxt.accomp not in ("still", "sparse"))
    for bar in p.bars:
        cut = 2.0 if p.ending else 4.0
        pat = ACCOMPANIMENTS[nxt.accomp] if (lead_in and bar is p.bars[-1]) else pattern
        fig = pat(band, p, bar, dyn, cut)
        synth_on = "synth" in p.layers and not (p.ending and piece.logo == "piano")
        if synth_on and fig:
            # SOFT SYNTH DOUBLING: the pattern's moving line, quietly, its filter opening slowly
            # across the section (never a sweep: about one octave over the whole section)
            for beat, m in fig:
                while m < 48:
                    m += 12
                frac = np.clip((beat - p.beat0) / max(p.beats, 1), 0, 1)
                band.synth(beat, m, 0.40 * dyn.v(beat), 700 * 2 ** frac, p=(0.25 if int(beat * 2) % 2 else -0.25))
    if p.ending:
        # the ending's held chord (B-flat sus) from beat 2, as everything gives way to the logo
        bar = p.bars[0]
        beat = bar.beat + 2.0
        for q, nm in enumerate(["Bb1", "Eb3", "Ab3"]):
            band.piano("piano", beat + 0.015 * q, m_(nm), 2.6, (0.34 if q == 0 else 0.28) * dyn.v(beat), tone=-0.2, pedal=True)
        if p.accomp in ("bounce", "rocking") or "pizz" in p.layers:
            if piece.logo != "piano":
                band.pizz("vc", beat, m_("Bb2"), 0.58 * dyn.v(beat), p=0.05)
    elif p.hold and p.sec.into == "hold":
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
        out[-1][1] += 1.0           # ring on under the start of the logo; the mix fades it
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


def _had(plans, k, layer):
    return k > 0 and layer in plans[k - 1].layers


def play_held(band, p, dyn, plans, k, piece):
    """HELD STRINGS: three low bowed voices that move as little as possible; their level
    follows the dynamics in straight lines (a lift = one long rise). A layer entering fades in
    over about two seconds; nothing swells and dips."""
    segs = _segments(p)
    piano_end = p.ending and piece.logo == "piano"
    end_beat = p.beat0 + 2.0 if piano_end else None

    def lvl(beat, base):
        v = base * dyn.v(beat) * (1.0 + STRING_LIFT * dyn.lift_progress(beat))
        if p.voice in ("violin", "both"):
            v *= 0.6           # WHY: the held strings step back when a violin carries the tune
        if end_beat is not None:
            v *= np.clip((end_beat - beat) / 2.0, 0, 1)    # strings bow away before the piano logo
        return v

    if "held" in p.layers:
        for voice in range(3):
            line = _line(segs, lambda c: V[c]["bow"][voice])
            for j, (b, nm, d) in enumerate(line):
                m = m_(nm)
                first = j == 0 and not _had(plans, k, "held")
                band.bow("vla" if m < m_("D4") else "vln", b, m, d + 0.15, lvl(b, p.mood["held"]),
                         lvl(b + d, p.mood["held"]), p=(-0.35, 0.35, 0.0)[voice],
                         attack=(band.secs(b, 4) * 0.6 if first else 0.35), release=0.4)
    if "low" in p.layers or p.sec.lift:
        # REGISTER WIDENING: the cellos hold each chord's root low under everything
        first = not (_had(plans, k, "low") or (k > 0 and plans[k - 1].sec.lift))
        for j, (b, nm, d) in enumerate(_line(segs, lambda c: V[c]["root"])):
            m = m_(nm)
            band.bow("vc", b, m, d + 0.15, lvl(b, p.mood["held"] * 0.7 + 0.04), lvl(b + d, p.mood["held"] * 0.7 + 0.04),
                     p=0.1, attack=(band.secs(b, 4) * 0.6 if (j == 0 and first) else 0.35), release=0.4)
    air_on = ("air" in p.layers) or p.sec.lift
    if air_on and not piano_end:
        # AIR: one high held violin line (E-flat, D only on dominant chords): continuous and
        # quiet, it carries the bow's own shimmer above 8 kHz; never an accent
        level = p.mood["air"] or 0.05
        first = not (_had(plans, k, "air") or (k > 0 and plans[k - 1].sec.lift))
        start = p.beat0 + (4 * len(p.bars) / 2 if (p.sec.lift and "air" not in p.layers) else 0)
        line = [x for x in _line(segs, lambda c: V[c]["air"]) if x[0] + x[2] > start]
        for j, (b, nm, d) in enumerate(line):
            if b < start:
                d -= start - b
                b = start
            band.bow("vln", b, m_(nm), d + 0.2, lvl(b, level), lvl(b + d, level), p=-0.2, bus="air",
                     attack=(band.secs(b, 4) * 0.8 if (j == 0 and first) else 0.5), release=0.6)


def play_sub(band, p, dyn, piece, plans, k):
    """SOFT SUB: a round sine on each chord's root, held: weight only, no rhythm of its own."""
    if "sub" not in p.layers:
        return
    if p.ending and piece.logo == "piano":
        return
    first = not _had(plans, k, "sub")
    for j, (b, d, c) in enumerate(_segments(p)):
        # WHY a one-bar fade-in when the sub first enters: weight should arrive, not appear
        band.sub(b, m_(V[c]["sub"]), d - 0.05, 0.6 * min(1.15, dyn.v(b)),
                 fin=(band.secs(b, 4) if (j == 0 and first and k > 0) else 0.0))


def render(band, plans, piece):
    dyn = Dyn(plans)
    band.dyn = dyn
    for k, p in enumerate(plans):
        band.swing = p.mood["swing"]
        play_tune(band, p, dyn, plans)
        play_answer(band, p, dyn, plans, k)
        play_accomp(band, p, dyn, piece, plans)
        play_held(band, p, dyn, plans, k, piece)
        play_sub(band, p, dyn, piece, plans, k)
    return dyn
