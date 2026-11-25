"""THE BED (the rebuild, 2026-11-24; toolkit-plan a3, c1-c4): the quiet, steady background that
sounds under everything, and the CHANGE PLAN that evolves it slowly.

The stack, in order of importance:
  1. SUSTAIN  something held under everything, >= 95 % of the time: a soft pad (default), held
              strings or a pedalled piano ring ([OWNER] recipes.OWNER["sustain"]). Voiced 3-4
              notes between B-flat 2 and B-flat 4, moving as little as possible from chord to
              chord, keeping its top note where it can, never a semitone against itself or the
              pulse's pool below C5.
  2. PULSE    the pedal figure (blocks.acc_figure, fig_mode="pedal"): one pool of notes taken from
              the "you-co-ded" cell, the same whatever the chord; its mask drifts by one step
              every few bars.
  3. CYCLES   1-3 short cells on unequal periods (cycles.py).
  4. TUNE     rare, in phrases (the sections' tune; tunebank.py).
  5. ENDING   the existing endings and logo.
Optional layers in the palette: "held" (bowed strings over a pad, e.g. at the peak), "sub".

THE CHANGE PLAN (Piece.changes) is data, one entry per change, checked by the dashboard:
    (bar, "in", "held")          a layer enters: a straight 2-bar fade up from that bar line
    (bar, "out", "cycle1")       a layer leaves: a straight 2-bar fade down
    (bar, "register", +1)        the pulse pool moves one scale step up (at most 3 = a fourth)
    (bar, "density", -2)         the pulse mask loses (or gains) that many steps
    (bar, "brightness", 1.3)     the pad's filter opens (x1.3) or closes; +-30 % at most
    (bar, "echo", 0.5)           the echo send on pad and cycles (read by the mix if it has one)
    (bar, "pool", ["Bb4","G4"])  the pulse moves to a new set of notes (a bigger change than register)
    (bar, "family", "bright")    the chords turn (the chords themselves are written in the sections;
                                 this entry only tells the checks a change was meant there)
    (bar, "peak")                the peak (the one place two changes may share a bar line)
Bars are counted from 1 over the whole piece (the ending bar not counted). A change happens on a
bar line, and a layer never switches: it fades over `fade` bars (default 2).

WHY: the research (what-we-learned.md items 1-5) found ad and game composers write the bed first,
keep it steady and change it slowly, one thing every 8-16 s, while variety comes from layers
entering and leaving and from loops of unequal length; never from new notes everywhere.
"""
import hashlib

import numpy as np

import tune as T
from dsp import SR, note

LAYERS = ("sustain", "pulse", "held", "sub")
DEFAULT_POOL = ["Bb4", "G4", "F4", "Eb4"]      # the cell's three notes + the tonic
DEFAULT_MASK = "x.xxx.x.x.xxx.x."              # 10 of 16 steps on
PAD_RANGE = (note("Bb2"), note("Bb4"))
C5 = note("C5")
ROUGH = (1, 11, 13)                            # semitone, major seventh, minor ninth


def _u(*key):
    d = hashlib.sha1(repr(key).encode()).digest()
    return int.from_bytes(d[:8], "little") / 2 ** 64


class BedLine:
    """Everything the bed knows about one render: the global bars, the layers' levels over time
    (from the change plan), the pulse's mask and register at each bar, the pad's voicings."""

    def __init__(self, piece, plans):
        self.piece, self.plans = piece, plans
        # WHY touch 0.40: at 0.30 the pad sat 10 dB under the pulse, so every gap between pulse
        # notes dropped the level 8-10 dB (the first tests): the sustain must hold the floor
        self.cfg = dict(sustain="pad", start=("sustain", "pulse"), cutoff=None, fade=2.0, touch=0.40)
        self.cfg.update(piece.bed or {})
        self.bars = []                              # (bar no, beat, blen, chords)
        for p in plans:
            if p.ending:
                continue
            for b in p.bars:
                self.bars.append((len(self.bars) + 1, b.beat, p.blen, list(b.chords)))
        self.end_beat = plans[-1].beat0                    # where the ending bar starts
        self.land_beat = plans[-1].beat0 + plans[-1].blen
        self.changes = [tuple(c) for c in (piece.changes or [])]
        self._masks = {}
        self.voicing = self._voice()

    # ---- bars and time
    def bar_beat(self, bar_no):
        if bar_no <= len(self.bars):
            return self.bars[max(1, bar_no) - 1][1]
        return self.end_beat

    def bar_no(self, beat):
        k = 1
        for no, b, blen, _ in self.bars:
            if beat >= b - 1e-6:
                k = no
        return k

    def seconds(self, beat):
        return float(self.plans[0].tm.seconds(beat))

    # ---- layers
    def gain(self, layer, beat):
        """0..1: the layer's level at this beat, from the change plan (straight fades). A layer is
        on from the first beat if it is in the bed's `start`, or if it is a cycle the change plan
        never brings "in" (a cycle is written to be heard)."""
        on = layer in self.cfg["start"] or (layer not in LAYERS and not any(
            len(c) > 2 and c[1] == "in" and c[2] == layer for c in self.changes))
        g = 1.0 if on else 0.0
        fade = float(self.cfg["fade"]) * 4.0
        for c in sorted(self.changes, key=lambda c: c[0]):
            if len(c) < 3 or c[1] not in ("in", "out") or c[2] != layer:
                continue
            b0 = self.bar_beat(int(c[0]))
            if beat < b0:
                break
            x = float(np.clip((beat - b0) / fade, 0, 1))
            g = x if c[1] == "in" else 1.0 - x
        return g

    def heard(self, layer):
        """Does this layer sound anywhere?"""
        return layer in self.cfg["start"] or any(len(c) > 2 and c[1] == "in" and c[2] == layer for c in self.changes)

    def silent(self, layer, b, d):
        """Is the layer at zero over the whole span [b, b + d] beats? (then nothing is placed)"""
        return all(self.gain(layer, x) <= 1e-3 for x in np.arange(b, b + d + 0.25, 0.5))

    def param(self, what, bar_no, default=0.0):
        """The pulse register (scale steps), density (steps), pad brightness (x) or echo at a bar:
        register/density add up, brightness multiplies, echo is the latest value."""
        v = default
        for c in sorted(self.changes, key=lambda c: c[0]):
            if c[0] > bar_no or len(c) < 3 or c[1] != what:
                continue
            if what in ("register", "density"):
                v += float(c[2])
            elif what == "brightness":
                v *= float(c[2])
            else:
                v = float(c[2])
        return v

    # ---- the pulse's mask (c1): drifts by one step every few bars, seeded; density changes add/remove
    def mask(self, sec, bar_no):
        key = (id(sec), bar_no)
        if key in self._masks:
            return self._masks[key]
        base = list((sec.fig_mask or DEFAULT_MASK).replace(" ", ""))
        if len(base) != 16 or set(base) - set("x."):
            raise ValueError(f"fig_mask {sec.fig_mask!r}: 16 steps of x (play) and . (rest)")
        every, k = sec.fig_mask_walk or (4, 1)
        m = list(base)
        seed = self.piece.seed

        def gap_ok(mm, i):
            # WHY: a drift that leaves two rests in a row opens a hole of 3/4 of a second in the
            # bed (the first recipe B test dropped 10 dB there): never two rests running
            t = mm[:]
            t[i] = "."
            ring = "".join(t) * 2
            return ".." not in ring
        for w in range(1, (bar_no - 1) // max(1, int(every)) + 1):
            for j in range(int(k)):
                i = int(_u(seed, "walk", w, j) * 16)
                on = m.count("x")
                # WHY the density band 6-10 of 16 (toolkit-plan c1): the drift may never thin the
                # pulse into gaps or fill it into a stream
                if m[i] == "x" and on > 6 and gap_ok(m, i):
                    m[i] = "."
                elif m[i] == "." and on < 10:
                    m[i] = "x"
        dens = int(round(self.param("density", bar_no)))
        for j in range(abs(dens)):
            # off-beat steps first: the downbeats of the pattern stay where they are
            cands = [i for i, s in enumerate(m) if s == (".", "x")[dens < 0] and i % 2 == 1]
            cands = cands or [i for i, s in enumerate(m) if s == (".", "x")[dens < 0]]
            if dens < 0:
                cands = [i for i in cands if gap_ok(m, i)]
            if cands:
                i = cands[int(_u(seed, "dens", bar_no, j) * len(cands))]
                m[i] = "x" if dens > 0 else "."
        self._masks[key] = "".join(m)
        return self._masks[key]

    def pool(self, sec, bar_no):
        base = sec.fig_pedal or DEFAULT_POOL
        for c in sorted(self.changes, key=lambda c: c[0]):
            # (bar, "pool", [...]): the pulse moves to a new set of notes (e.g. back down to its
            # usual register once the narrator has stopped)
            if c[1] == "pool" and c[0] <= bar_no:
                base = c[2]
        pool = [note(x) if isinstance(x, str) else int(x) for x in base]
        r = int(round(self.param("register", bar_no)))
        r = int(np.clip(r, -3, 3))
        return [T.scale_step(m, r) if m % 12 in T._SCALE else m for m in pool] if r else pool

    # ---- the pad's voicing (b3): minimum total movement, >= 1 common tone, top held where possible
    def _spans(self):
        out = []
        for no, b, blen, chords in self.bars:
            if len(chords) == 1 or blen < 4:
                out.append([b, blen, chords[0]])
            else:
                out += [[b, 2.0, chords[0]], [b + 2.0, blen - 2.0, chords[1]]]
        ep = self.plans[-1]
        eb = ep.bars[0]
        if ep.blen >= 4 and len(eb.chords) == 2:
            out += [[eb.beat, 2.0, eb.chords[0]], [eb.beat + 2.0, ep.blen - 2.0, eb.chords[1]]]
        else:
            out.append([eb.beat, ep.blen, eb.chords[-1]])
        if self.piece.logo != "none":
            # WHY: the logo lands on E-flat; a pad still holding the ending's B-flat sus rubbed a
            # semitone (A-flat 4) against the logo's own string swell (G4). The pad resolves with it.
            out.append([eb.beat + ep.blen, 8.0, "Eb"])
        merged = []
        for s in out:
            if merged and merged[-1][2] == s[2] and abs(merged[-1][0] + merged[-1][1] - s[0]) < 1e-6:
                merged[-1][1] += s[1]
            else:
                merged.append(s)
        return merged

    def pulse_at(self, beat):
        """The pulse's notes sounding around this beat (its pool after every register and pool
        change), for voicing the pad against them."""
        for p in self.plans:
            if p.ending:
                continue
            if p.beat0 - 1e-6 <= beat < p.beat0 + p.blen * len(p.bars) + 1e-6 and getattr(p.sec, "fig_mode", None) == "pedal":
                return self.pool(p.sec, self.bar_no(beat))
        return []

    def _voice(self):
        lo, hi = PAD_RANGE
        prev = None
        out = []
        for beat, beats, chord in self._spans():
            # the pulse's notes over this whole span (a register change may fall inside it)
            pulse = sorted({m for x in np.arange(beat, beat + beats, 2.0) for m in self.pulse_at(x) if m < C5})
            tones = T.CHORD_TONES[chord]
            bass = note(T.V[chord]["root"])
            cands = [m for m in range(lo, hi + 1) if m % 12 in tones]
            best = None
            # every 3- and 4-note choice in range; small search (at most ~15 candidates)
            import itertools
            for n in (4, 3):
                for combo in itertools.combinations(cands, n):
                    # WHY these spacings: low close intervals are mud (the "low interval limit":
                    # nothing closer than a major third below G3), and a pad wider than a 12th
                    # stops sounding like one chord
                    if combo[-1] - combo[0] > 19 or combo[-1] - combo[0] < 9:
                        continue
                    if any(y - x < (4 if x < note("G3") else 2) for x, y in zip(combo, combo[1:])):
                        continue
                    if any(abs(x - y) in ROUGH for x, y in itertools.combinations(combo, 2)):
                        continue
                    if any(abs(x - q) in ROUGH for x in combo for q in pulse if x < C5):
                        continue
                    # nor against the bass the pulse plays under this chord (fig_bass): a major
                    # seventh held over the root below C5 grinds as much as a semitone
                    if any(abs(x - bass) in ROUGH for x in combo):
                        continue
                    pcs = {m % 12 for m in combo}
                    root = T.root_of(chord)
                    cost = 0.0
                    # recognisable: the third (or the sus note), and not two of the same pitch class
                    third = tones & {(root + 3) % 12, (root + 4) % 12}
                    need = third or (tones & {(root + 5) % 12, (root + 2) % 12})
                    if not pcs & need:
                        cost += 12
                    cost += 2.0 * (n - len(pcs))
                    if prev is not None:
                        cost += sum(min(abs(x - y) for y in prev) for x in combo)
                        cost += 0 if set(combo) & set(prev) else 8
                        cost += 0 if combo[-1] == prev[-1] else 2.5
                    else:
                        cost += abs(combo[-1] - note("G4")) * 0.5 + abs(combo[0] - note("Eb3")) * 0.3
                    cost += (4 - n) * 1.5
                    if best is None or cost < best[0]:
                        best = (cost, combo)
            if best is None:
                combo = tuple(sorted({T.scale_step(note("Eb3"), 0)}))
            else:
                combo = best[1]
            out.append((beat, beats, chord, list(combo)))
            prev = combo
        return out

    def pad_at(self, beat):
        for b, n, c, ms in self.voicing:
            if b - 1e-6 <= beat < b + n:
                return ms
        return []


def play(band, plans, piece):
    """Play the bed's sustain, its optional layers and the cycles; apply the layer fades."""
    import cycles as CY
    bl = band.bedline
    cfg = bl.cfg
    kind = cfg.get("sustain") or "pad"
    land = bl.land_beat
    info = dict(sustain=kind, voicing=[(round(b, 2), c, [_nm(m) for m in ms]) for b, n, c, ms in bl.voicing])
    # 1. SUSTAIN: one line per voice; a note common to two chords is held through (no re-attack)
    lines = {}
    tail_beats = (piece.length - bl.seconds(land)) * plans[-1].tm.bpm_at(land) / 60.0
    for b, n, c, ms in bl.voicing:
        for v, m in enumerate(sorted(ms)):
            L = lines.setdefault(v, [])
            # the pad rings on under the logo (its own release then the file's last-second fade)
            end = min(b + n, land + max(0.0, tail_beats - 1.0))
            if L and L[-1][1] == m and abs(L[-1][0] + L[-1][2] - b) < 1e-6:
                L[-1][2] = end - L[-1][0]
            else:
                L.append([b, m, end - b])
    sus_bus = {"pad": "pad", "ring": "pad", "held": "bowed"}[kind]
    cut = cfg.get("cutoff")
    if cut is None:
        try:                                     # the sound builder's pad colour (engine/options.py)
            import options
            cut = float(options.get("pad_cutoff", piece))
        except (ImportError, KeyError):
            cut = 900.0
    for v, L in lines.items():
        for i, (b, m, d) in enumerate(L):
            if bl.silent("sustain", b, d):
                continue
            # WHY no overlap into a step: a voice moving by a semitone or tone (a suspension
            # resolving) hands over at the bar line; overlapped, the two notes rub
            nxt = L[i + 1][1] if i + 1 < len(L) else None
            ov = 0.0 if (nxt is not None and abs(nxt - m) <= 2) else 0.25
            bright = bl.param("brightness", bl.bar_no(b), 1.0)
            if kind == "pad":
                # WHY the slight overlap (0.25 beat): the release of one note and the attack of the
                # next cross-fade, so a voice moving to a new pitch never leaves a hole
                band.pad(b, m, d + ov, cfg["touch"], cutoff=cut * bright,
                         p=(-0.3, 0.3, -0.12, 0.12)[v % 4])
            elif kind == "held":
                band.bow("vla" if m < note("D4") else "vln", b, m, d + 0.15, 0.16, 0.16, p=(-0.35, 0.35, 0.0, 0.15)[v % 4],
                         bus="bowed", attack=min(1.2, band.secs(b, 2)), release=0.6)
    if kind == "ring":
        # the pedalled piano ring: one soft rolled chord per chord, its upper notes touched again
        # halfway through a long chord so the sound never dies away
        for b, n, c, ms in bl.voicing:
            if bl.silent("sustain", b, n) or b >= land:
                continue
            for q, m in enumerate(sorted(ms)):
                band.piano("pad", b + 0.03 * q, m, n, 0.24, tone=-0.3,
                           pedal=True, p=-0.05, role="sustain")
            if n >= 4:
                for q, m in enumerate(sorted(ms)[-2:]):
                    band.piano("pad", b + n / 2 + 0.03 * q, m, n / 2, 0.18,
                               tone=-0.3, pedal=True, p=-0.05, role="sustain")
    # 2. HELD STRINGS as an extra layer (over a pad or ring), and the SUB
    if bl.heard("held") and kind != "held":
        # WHY the pad's own voicing (its lower three notes): strings voiced separately rubbed a
        # semitone against the pad (G3 against A-flat 3 in the first test)
        for v in range(3):
            line = []
            for b, n, c, ms in bl.voicing:
                m = sorted(ms)[min(v, len(ms) - 1)]
                if line and line[-1][1] == m and abs(line[-1][0] + line[-1][2] - b) < 1e-6:
                    line[-1][2] += n
                else:
                    line.append([b, m, n])
            for b, m, d in line:
                if bl.silent("held", b, d) or b >= land:
                    continue
                d = min(d, land - b)
                band.bow("vla" if m < note("D4") else "vln", b, m, d + 0.15, 0.15, 0.15,
                         p=(-0.35, 0.35, 0.0)[v], bus="bowed", attack=min(1.0, band.secs(b, 2)), release=0.5)
    if bl.heard("sub"):
        for b, n, c, ms in bl.voicing:
            if bl.silent("sub", b, n) or b >= land:
                continue
            band.sub(b, note(T.V[c]["sub"]), min(n, land - b) - 0.05, 0.55, fin=0.0)
    # 3. CYCLES
    # WHY whole phrases (toolkit-plan a3: "cycles count as one group with the tune: they never
    # sound in the same half-bar as a tune PHRASE"): a cycle note under a held tune note sat above
    # it and took the top voice
    tn = sorted((bar.beat + bb, bar.beat + bb + d) for p in plans for bar in p.bars
                for bb, m, d, canon, _ in bar.tune if canon[0] != "logo")
    tune_hb = set()
    ph = None
    for a, z in tn + [(1e9, 1e9)]:
        if ph and a - ph[1] > 1.0:
            for h in range(int(ph[0] // 2), int(np.ceil(ph[1] / 2)) + 1):
                tune_hb.add(h)
            ph = None
        if a < 1e8:
            ph = [a, z] if ph is None else [ph[0], max(ph[1], z)]
    speech = [list(x) for x in (getattr(piece, "speech", []) or [])]
    # WHY cycle_pause (recipe C): a cell dropped into a 0.3 s breath is a note "oddly thrown in"
    # (round 7); under a narrator a cycle may only speak in pauses of `cycle_pause` seconds or more
    cp = float(cfg.get("cycle_pause", 0.0) or 0.0)
    if cp and speech:
        merged = [speech[0]]
        for a, z in speech[1:]:
            if a - merged[-1][1] < cp:
                merged[-1][1] = z
            else:
                merged.append([a, z])
        speech = merged
    peak_beat = _beat_at(plans, piece.peak) if piece.peak else None
    guards = dict(
        tune_halfbar=lambda b: int(b // 2) in tune_hb,
        speaking=lambda b: any(a - 0.05 <= bl.seconds(b) <= z + 0.05 for a, z in speech),
        near_peak=lambda b: peak_beat is not None and abs(b - peak_beat) < 1.0,
        pad=bl.pad_at,
        gain=bl.gain,
    )
    cyc = list(piece.cycles or [])
    for i, c in enumerate(cyc):
        if not c.name:
            c.name = f"cycle{i + 1}"
    notes, dropped = CY.placed(cyc, bl.end_beat, piece.seed, guards) if cyc else ([], [])
    for n in notes:
        m, touch = n["m"], n["touch"]
        tone = -0.3
        if n["voice"] == "bell":
            m, touch, tone = m + 12, touch * 0.8, -0.5
        band.piano("cycle", n["beat"], m, n["dur"], touch, tone=tone, pedal=False,
                   p=(0.3 if hash(n["name"]) % 2 else -0.3), role="cycle")
    info["cycles"] = dict(placed=len(notes), dropped=dropped, coprime=CY.coprime(cyc) if cyc else (True, []),
                          duty={c.name: round(c.duty(), 2) for c in cyc})
    # 4. THE FADES: each layer's bus follows the change plan (straight lines, never a switch)
    if not band.dry:
        t = np.arange(band.n) / SR
        grid = np.arange(0.0, bl.land_beat + 64, 0.25)
        secs = np.array([bl.seconds(b) for b in grid])
        for layer, bus in (("sustain", sus_bus), ("held", "bowed"), ("sub", "sub")):
            if layer == "held" and kind == "held":
                continue
            if not (bl.heard(layer) or layer == "sustain"):
                continue
            g = np.array([bl.gain(layer, b) for b in grid])
            # after the landing the layer keeps its last level (the logo's own swell takes over)
            env = np.interp(t, secs, g)
            band.bus[bus] *= env[:, None]
    info["changes"] = [dict(bar=c[0], what=c[1], arg=(c[2] if len(c) > 2 else None),
                            t=round(bl.seconds(bl.bar_beat(int(c[0]))), 2)) for c in bl.changes]
    band.bed_info = info
    band.echo_curve = [(round(bl.seconds(bl.bar_beat(int(c[0]))), 3), float(c[2])) for c in bl.changes
                       if len(c) > 2 and c[1] == "echo"]
    return info


def _beat_at(plans, t):
    tm = plans[0].tm
    lo, hi = 0.0, plans[-1].beat0 + plans[-1].blen + 16
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if tm.seconds(mid) < t:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def _nm(m):
    return f"{['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12]}{m // 12 - 1}"
