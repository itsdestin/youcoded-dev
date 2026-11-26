"""THE RECIPES (the rebuild, 2026-11-24; toolkit-plan a3): three tested starting points a composer
FILLS IN instead of starting from a blank page.

    type_short(...)   Recipe A: type-only short, 10-20 s
    app_demo(...)     Recipe B: app demo, no narrator, 30-75 s
    narrated(...)     Recipe C: narrated story, 30-75 s

Each returns an ordinary score.Piece (style "v3") with its bed (bed.py), pulse, chords, tune
phrases, cycles, change plan, lift and ending already laid out. Every argument has a working
default, so `app_demo("x", 36.0, land=33.5, bpm=120)` renders a complete, steady piece; the
composer then replaces the defaults with what THIS film needs: its chords, where its 2-4 tune
phrases go, its change plan at the picture's turns, its peak. The same call with one switch
changed is the second sketch (studio.py --sketch).

THE OWNER'S SWITCHES ([OWNER] in the plan: his decisions by ear, not ours). Defaults below;
change one for a whole run with SONGBOOK_OWNER="sustain=held,pulse=chord", or per piece with
owner_over={...}. Every piece records the switches it was made with (Piece.owner, printed in reports).
"""
import os
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

import tune as T
import tunebank as TB
from cycles import Cycle
from score import Piece, Section, TempoMap, RIT

OWNER = dict(
    sustain="pad",          # [OWNER] the held layer under everything: "pad" | "held" (strings) | "ring" (pedalled piano)
    pulse="pedal",          # [OWNER] "pedal" (a fixed pool of the cell's notes) | "chord" (round 8's chord-following figure)
    narrator_tempo="near120",  # [OWNER] under a narrator: "near120" (the band value nearest 120) | "stress" (her stress rate)
    voice_busy=3,           # [OWNER] struck attacks a second in F3-E5 under her words, the dashboard's target: 3 | 5
    under_voice="static",   # [OWNER] the music's tone under her: "static" (a fixed mid-only cut) | "follow" (a dip
                            #   that follows her words; NOT BUILT: his rule forbids it until he hears an A/B)
    chords="rich",          # [OWNER] "rich" (9ths, sus, add9) | "plain" (the same chords as triads and sevenths)
    # [OWNER] the pulse's order (audit 2026-11-25, defect 3): "circle" (the pool's first note between
    # the others, B-flat G B-flat F B-flat E-flat) | "cell" (the written order B-flat G F E-flat,
    # which is bar 1 of the tune played as a 2-bar loop). WHY "circle" first: "cell" repeats the
    # tune's opening ~18 times in 36 s, round 6's failure, and the research's source describes a
    # pattern circling ONE note. Still his ear's call.
    fig_order="circle",
    # [OWNER] the sustain's level against the pulse, dB (audit defect 2): -8 (the plan's pad level,
    # what the first examples used) | -4 | 0. WHY a switch: at -8 the level still swings 4.6-4.8 dB
    # inside each half-second, as much as round 7's "choppy" mim (4.3); a louder pad fills the
    # gaps between pulse notes but makes the bed thicker. Only his ear can set it.
    pad_level=-8,
)
PAD_LEVELS = (-8, -4, 0)
# THE UNITY REBUILD (2026-11-25): what a recipe gives by default now (style "v4"). Older film files
# pass style="v3" and keep OWNER above exactly. WHY each value, from the owner's answers on the
# element deck (~/Documents/youcoded-campaign/music-review/deck.html):
#   pulse "chord"    he liked BOTH the gently swung pulse (C) and round 8's chord-following one (D);
#                    the chord-following one takes its notes from the chord every other layer plays
#                    (one harmonic plan), so it is the default and `swing="gentle"` is the other
#   swing            "straight" | "gentle" (35 ms on the off-beat eighths, the deck's clip C)
#   sustain "pad"    "pad" | "ring" (the ringing piano); held strings are off the palette:
#                    "those strings are wayyy too harsh/overpowering"
#   pad_level -4     the measured unity sign "levels sit close" (see SONGBOOK.md); still his switch
#   ending "quiet"   "prefer b/c to a" (quiet, piano-only over the full blend)
OWNER_V4 = dict(OWNER, pulse="chord", pad_level=-4, swing="straight")
SWING = {"straight": None, "gentle": 0.035}
LOGOS_V4 = ("quiet", "piano", "none")


def sustain_mix(kind, pad_level=-8):
    """Piece.mix trims for the sustain's bus: the [OWNER] pad_level (-8 = the calibrated pad
    level, -4 / 0 louder by 4 / 8 dB) and, for held strings, the bowed bus brought down to the
    pad's level. WHY (audit 2026-11-25, sketch of sustain=held): as the sustain, held strings
    played at the bowed bus's own level (-25 LUFS, made for strings as an extra layer), 8 dB over
    the pad (-33); the narrator's margin failed and the A/B compared a louder, brighter layer
    rather than a different sustain. Both now sit at the same calibrated level."""
    bus = {"pad": "pad", "ring": "ring", "held": "bowed"}.get(kind, "pad")
    import mix as X
    off = float(int(pad_level) + 8)
    if bus != "pad":
        off += X.TARGET["pad"] - X.TARGET[bus]
    return {bus: off} if abs(off) > 1e-9 else {}


def owner(over=None, style="v3"):
    """The switches in force: OWNER (OWNER_V4 for a v4 piece), then the environment
    (SONGBOOK_OWNER), then `over`."""
    o = dict(OWNER_V4 if style == "v4" else OWNER)
    for part in (os.environ.get("SONGBOOK_OWNER", "") or "").split(","):
        if "=" in part:
            k, v = (x.strip() for x in part.split("=", 1))
            if k not in o:
                raise KeyError(f"SONGBOOK_OWNER: unknown switch {k!r}; known: {', '.join(o)}")
            o[k] = int(v) if isinstance(OWNER_V4[k], int) else v
    o.update(over or {})
    if int(o["pad_level"]) not in PAD_LEVELS:
        raise ValueError(f"pad_level {o['pad_level']!r}: one of {PAD_LEVELS} (dB against the pulse)")
    if o["fig_order"] not in ("circle", "cell"):
        raise ValueError(f"fig_order {o['fig_order']!r}: 'circle' or 'cell'")
    if style == "v4" and o["sustain"] not in ("pad", "ring"):
        # WHY refused, not just discouraged: the strings as they sound today are what he called
        # "wayyy too harsh/overpowering"; they come back only after a rebuilt soft string is heard
        raise ValueError(f"sustain={o['sustain']!r}: the held layer is 'pad' or 'ring' (held strings are off the "
                         "palette until a soft, dark string has been rebuilt and approved by ear; style='v3' keeps them)")
    if o.get("swing", "straight") not in SWING:
        raise ValueError(f"swing {o['swing']!r}: one of {', '.join(SWING)}")
    if o["under_voice"] != "static":
        raise NotImplementedError("under_voice='follow' is not built: the owner rules out an automatic dip on "
                                  "every word until he has heard an A/B (toolkit-plan b4)")
    return o


@dataclass
class Brief:
    """THE BRIEF (toolkit-plan a1), written before any note. Five lines and the picture:
    kind ("type-only" | "app-demo" | "narrated"), length (s), 3-5 adjectives, "subtle" or
    "present", and the 1-3 moments that matter as (seconds, label), one labelled "peak".
    picture: the cut list [(seconds, label)]; cards: [(seconds, "the words on the card")];
    logo_at: when the name appears; references: tracks the owner named (read about, never
    downloaded)."""
    kind: str
    length: float
    adjectives: tuple = ()
    feel: str = "subtle"
    moments: list = field(default_factory=list)
    picture: list = field(default_factory=list)
    cards: list = field(default_factory=list)
    logo_at: Optional[float] = None
    references: tuple = ()

    def peak(self):
        return next((t for t, lab in self.moments if lab == "peak"), None)

    def hits(self):
        """Weighted hits for timing.fit_tempo: the peak and the logo weigh 3, other moments 1."""
        h = [(t, 3 if lab == "peak" else 1, lab) for t, lab in self.moments]
        if self.logo_at is not None:
            h.append((self.logo_at, 3, "logo"))
        return h

    def text(self):
        L = [f"BRIEF: {self.kind}, {self.length:g} s, {self.feel}; {', '.join(self.adjectives)}",
             "   moments: " + ", ".join(f"{lab} {t:g} s" for t, lab in self.moments)
             + (f"; the name at {self.logo_at:g} s" if self.logo_at is not None else "")]
        if self.cards:
            from timing import card_hold
            for (t, words), nxt in zip(self.cards, list(self.cards[1:]) + [(self.logo_at or self.length, "")]):
                hold = card_hold(len(words.split()))
                L.append(f"   card {t:6.2f} s  {len(words.split()):>2} words, on screen {nxt[0] - t:5.2f} s "
                         f"(minimum {hold:.1f} s{'' if nxt[0] - t >= hold - 1e-6 else ' -- TOO SHORT, ask the editor'}): {words}")
        if self.references:
            L.append("   references (read about, never downloaded): " + "; ".join(self.references))
        return L


# ---------------------------------------------------------------- the shared builder


def _chordlist(chords, nbars, default, rich):
    """chords: None (the recipe's default, repeated), a string "Ebmaj9 Abmaj9 | Cm9" (one chord
    per bar, | optional, "A/B" not allowed as a pair: write two names in brackets "[Ab Bbsus]"),
    or a list of per-bar lists. Returns one list per bar, nbars long (the last chord carried on)."""
    if chords is None:
        out = [[default[(k // 2) % len(default)]] for k in range(nbars)]
    elif isinstance(chords, str):
        toks, out, pair = chords.replace("|", " ").split(), [], None
        for t in toks:
            if t.startswith("["):
                pair = [t[1:]]
            elif t.endswith("]") and pair is not None:
                pair.append(t[:-1])
                out.append(pair)
                pair = None
            else:
                out.append([t])
    else:
        out = [list(b) if isinstance(b, (list, tuple)) else [b] for b in chords]
    if chords is not None and len(out) > nbars:
        # WHY (first-shot b): with an odd bar a composer wrote one name per global bar, and every
        # chord after the odd bar silently slid a bar; say so instead of dropping names quietly
        import sys
        print(f"WARNING: {len(out)} chord names for {nbars} four-beat bars: chords= names only the 4-beat "
              f"bars (the odd bar keeps the chord before it, the ending has its own); the last "
              f"{len(out) - nbars} were dropped", file=sys.stderr)
    out = (out + [out[-1]] * nbars)[:nbars]
    if not rich:
        out = [[T.PLAIN.get(c, c) for c in b] for b in out]
    for b in out:
        for c in b:
            if c not in T.V:
                raise KeyError(f"unknown chord {c!r}; the vocabulary: {', '.join(T.VOCAB)}")
    return out


def land_after(bars, bpm, ending="sigh", odd=0, rit=None):
    """Where the name lands if the body is `bars` bars of 4 (plus an odd bar) at `bpm`: the time
    to give the editor, or to put in Brief.logo_at. WHY: the ending slows (it is not on the steady
    grid), so this is not simply bars x 4 beats."""
    from timing import RIT_Q
    L = 2.0 if ending == "short" else 4.0
    r = (1.0 if ending == "short" else RIT) if rit is None else rit
    return round((4 * bars + odd) * 60.0 / bpm + TempoMap._dur(L, L, bpm, bpm * r, RIT_Q), 3)


class Grid:
    """The piece's bar grid at the written tempo, with at most ONE odd bar (2 or 3 beats) at global
    bar `odd_at` (1 = the first bar). Global bars count from 1 over the whole piece (the odd bar is
    one of them; the ending bar is not); "body" bars are the 4-beat ones, indexed from 0.
    WHY a class (audit 2026-11-25, defect 9): the odd bar could only be bar 1, so a weight-3
    moment late in the film could not be landed by putting the odd bar after an earlier one;
    every recipe now maps times and bars through this one grid."""

    def __init__(self, bpm, odd=0, odd_at=1):
        self.spb, self.odd = 60.0 / bpm, int(odd or 0)
        self.at = int(odd_at or 1) if self.odd else None

    def start_beat(self, g):
        if not self.odd or g <= self.at:
            return 4.0 * (g - 1)
        return 4.0 * (g - 2) + self.odd

    def bar_of_beat(self, b):
        b = max(0.0, b)
        if not self.odd:
            return 1 + int(b // 4)
        a = 4.0 * (self.at - 1)
        if b < a - 1e-9:
            return 1 + int(b // 4)
        if b < a + self.odd - 1e-9:
            return self.at
        return self.at + 1 + int((b - a - self.odd) // 4)

    def bar_of(self, t):
        """The global bar (1-based) that a time falls in, at the nominal tempo."""
        return self.bar_of_beat(t / self.spb)

    def moment_bar(self, t):
        """The bar a picture MOMENT belongs to: the bar of its nearest beat. WHY (first-shot b, c):
        a peak 34 ms before a bar line, or a turn 20 ms before one, is that bar line's moment, but
        bar_of put it in the bar before, so the peak's layers and the bright turn came a bar early."""
        return self.bar_of_beat(round(max(0.0, t) / self.spb) + 1e-6)

    def body(self, g):
        """The body (4-beat) index of global bar g, or None for the odd bar."""
        if not self.odd:
            return g - 1
        if g == self.at:
            return None
        return g - 1 if g < self.at else g - 2

    def glob(self, i):
        """The global bar of body index i."""
        if not self.odd:
            return i + 1
        return i + 1 if i + 1 < self.at else i + 2

    def halfbar(self, t):
        """(body index * 2 + half) nearest time t, or None inside the odd bar."""
        b = max(0.0, t / self.spb)
        g = self.bar_of_beat(b)
        i = self.body(g)
        if i is None:
            return None
        return 2 * i + int(round((b - self.start_beat(g)) / 2.0))


def _bars_to_land(land, bpm, ending, rit, odd):
    """How many 4-beat body bars fit before the name lands at this tempo, and how far the tempo
    must stretch to land it exactly (the tempo map does that; keep it under about 3 %)."""
    from timing import RIT_Q
    L = 2.0 if ending == "short" else 4.0
    end_s = TempoMap._dur(L, L, bpm, bpm * rit, RIT_Q)
    body_beats = (land - end_s) * bpm / 60.0 - odd
    n = max(1, int(round(body_beats / 4.0)))
    stretch = (4.0 * n + odd) / max(body_beats + odd, 1e-6) - 1.0
    return n, stretch


def _from_brief(brief, subtle, peak, hits):
    """WHY (audit 2026-11-25, defect 7): the recipes never read the Brief, so a brief marked
    "subtle" still got the loud logo, and the worked example patched Piece.peak after building
    (the same set-an-attribute-afterwards pattern that made a sketch switch do nothing). The
    recipe's own arguments win; anything left out comes from the brief."""
    if brief is not None:
        if subtle is None:
            subtle = (brief.feel == "subtle")
        if peak is None:
            peak = brief.peak()
        if not hits:
            hits = brief.hits()
    return bool(subtle), peak, list(hits or [])


# ---------------------------------------------------------------- the woven tune (v4)

# WHY this order: when a chord must change under a held tune note, the first chord here that holds
# the note is taken, so the substitutes stay inside the brand's few chords (tune.VOCAB)
TUNE_LED = ["Ebmaj9", "Ebadd9", "Cm9", "Cm11", "Abmaj9", "Bb9sus", "Fm9", "Abmaj7#11", "Gm7", "Ebsus2"]


def _held(whole, lo=1.5):
    """The tune's held notes (at least `lo` beats) as (body beat, midi, beats). WHY 1.5: a quarter
    note may pass between chord tones (that is melody); a note held longer is heard AS harmony."""
    return [(n.beat, int(n.m), n.dur) for n in whole.notes if n.dur >= lo - 1e-6]


def tune_misfits(whole, chordbars):
    """Every held tune note (1.5 beats or longer) that is NOT a tone of the chord under it, as
    (body bar from 1, note name, chord, the chords from TUNE_LED that would hold it). Empty = the
    tune is woven into the harmony. WHY (the mix analysis): the cell's F5 landed on non-chord
    tones over Cm9 and Abmaj9 (4 of 8 in the every-bar clip): "the way this is integrated feels to
    clash with the underlying base music/notes quite a bit"."""
    from motif import name as nm
    out = []
    for b, m, d in _held(whole):
        for x in sorted({b, *[k for k in (2.0 * (int(b // 2) + 1),) if k < b + d - 0.5]}):
            c = TB._chord_at(chordbars, x)
            row = (int(x // 4) + 1, nm(m), c, [k for k in TUNE_LED if m % 12 in T.CHORD_TONES[k]])
            if c is not None and m % 12 not in T.CHORD_TONES.get(c, set()) and row not in out:
                out.append(row)
    return out


def tune_led(whole, chordbars):
    """HARMONY FIRST FROM THE TUNE (v4, chords=None): the recipe's default chords, with each half-bar
    under a held tune note that the chord does not hold changed to the nearest chord from TUNE_LED
    that does (sharing the most notes with the chord it replaces). Composer-written chords are never
    changed: they are checked (tune_misfits) and a misfit stops the build."""
    out = [list(b) for b in chordbars]
    for b, m, d in _held(whole):
        k = int(b // 4)
        if k >= len(out):
            continue
        half = 0 if (b - 4 * k) < 2 else 1
        cur = out[k][min(half, len(out[k]) - 1)]
        if m % 12 in T.CHORD_TONES.get(cur, set()):
            continue
        cands = [c for c in TUNE_LED if m % 12 in T.CHORD_TONES[c]]
        if not cands:
            continue
        new = max(cands, key=lambda c: (len(T.CHORD_TONES[c] & T.CHORD_TONES.get(cur, set())), -TUNE_LED.index(c)))
        if len(out[k]) == 1:
            out[k] = [new] if half == 0 and d >= 4 - (b - 4 * k) - 1e-6 else ([cur, new] if half else [new, cur])
        else:
            out[k][half] = new
        out[k] = [out[k][0]] if len(out[k]) == 2 and out[k][0] == out[k][1] else out[k]
    return out


def _build(recipe, name, length, land, bpm, *, chords, default_chords, tune, changes, cycles, peak, lift,
           seed, odd, logo, ending, loudness, touch, pulse, sustain_cfg, narration_bars=(), level=0.0,
           narr_level=-6.0, speech=None, hits=(), brief=None, notes="", o=None, rit=RIT, lead=0.8,
           extra=None, explain=None, sound=None, odd_at=1, voice_mux=None, style="v3", tune_fit="refuse", led=None):
    # WHY v3 by default here (not in the recipes): older callers of _build and owner() (the element
    # deck's clips, first-shot F) must keep rendering what was heard; the recipes pass style="v4"
    o = o or owner(style=style)
    n, stretch = _bars_to_land(land, bpm, ending, rit, odd)
    G = Grid(bpm, odd, odd_at)
    total = n + (1 if odd else 0)                 # global bars before the ending
    if odd and not 1 <= G.at <= total:
        raise ValueError(f"odd_at={odd_at}: the odd bar must be one of bars 1-{total}")
    chordbars = _chordlist(chords, n, default_chords, o["chords"] == "rich")
    # tune bars are given as the piece's (global) bars; the bank lays them on the 4-beat body bars
    tb = []
    for b, ph in (tune or []):
        i = G.body(b)
        if i is None:
            raise ValueError(f"tune phrase at bar {b}: that is the odd bar (no tune may sit on it)")
        tb.append((i + 1, ph))
    whole, tune_report = TB.lay(tb, chordbars, seed, shown_offset=lambda i: G.glob(i - 1))
    fit_report = []
    if style == "v4" and whole.notes:
        # WHY led: recipe C computes its chords itself (from her sentence ends) and passes them in;
        # they are still the recipe's default, so they bend to the tune like chords=None does
        if (chords is None) if led is None else led:
            # harmony first: the default chords bend to the tune (never the tune to the chords)
            led = tune_led(whole, chordbars)
            changed = [(i + 1, chordbars[i], led[i]) for i in range(len(led)) if led[i] != chordbars[i]]
            chordbars = led
            if changed:
                fit_report.append("   tune-led chords (the default chords changed under held tune notes): "
                                  + "; ".join(f"body bar {i}: {' '.join(a)} -> {' '.join(b)}" for i, a, b in changed))
            whole, tune_report = TB.lay(tb, chordbars, seed, shown_offset=lambda i: G.glob(i - 1))
        bad = tune_misfits(whole, chordbars)
        if bad:
            lines = [f"body bar {b}: held {n} over {c} (chords that hold it: {', '.join(ok[:4])})" for b, n, c, ok in bad]
            if tune_fit == "refuse":
                # WHY refuse (the unity principle): a held tune note that is not in the chord under
                # it is the tune "randomly thrown in on top"; change the chord, move the phrase
                # within the key, or leave the tune out (tune_fit="allow" only for a rub you MEAN)
                raise ValueError("the tune does not sit in the harmony (v4 weaves it in):\n   " + "\n   ".join(lines)
                                 + "\n   change those chords, move the phrase, or pass tune_fit='allow' for a rub you mean")
            fit_report.append("   tune misfits allowed by the composer: " + "; ".join(lines))
    bar_of = G.bar_of
    peak_bar = G.moment_bar(peak) if peak is not None else None
    cuts = {1, total + 1}
    if odd:
        cuts |= {G.at, G.at + 1}
    lift_bars, lift_db = (lift or (0, 0.0))
    lv = {}                                       # global bar -> (tag, ramp bars)
    if lift_db and peak_bar:
        a = max(1, peak_bar - lift_bars)
        z = min(total, peak_bar + 2)
        cuts |= {a, z}
        lv[a] = ("lift", lift_bars)
        lv[z] = ("settle", 2)
    for a, z in narration_bars:
        cuts |= {max(1, a), min(total + 1, z)}
    cuts = sorted(c for c in cuts if 1 <= c <= total + 1)
    secs = []
    state_db = level
    was_narr = False
    spb = G.spb
    for a, z in zip(cuts[:-1], cuts[1:]):
        nb = z - a
        narr = any(x <= a < y for x, y in narration_bars)
        tag, rb = lv.get(a, (None, 0))
        if tag == "lift":
            state_db = level + lift_db
        elif tag == "settle":
            state_db = level + lift_db - 1.0
        db = narr_level if narr else state_db
        if was_narr and not narr:
            rb = rb or 2                          # after her last word the music comes up over 2 bars
        was_narr = narr
        if odd and a == G.at:
            # the odd bar: one bar of `odd` beats, no tune, the chord of the bar before it
            secs.append(Section("bed", 1, bpm=bpm, meter=int(odd), chords=[chordbars[max(0, G.body(a - 1) or 0) if a > 1 else 0]],
                                label=f"odd bar ({odd} beats, bar {a})", into="flow", narration=narr, level_db=db,
                                **pulse))
            continue
        body0 = G.body(a)                         # body bar index (0-based)
        tsl = TB.slice_bars(whole, body0, nb)
        kw = dict(pulse)
        sec = Section("bed", nb, bpm=bpm, chords=chordbars[body0:body0 + nb], tune=[tsl] if tsl.notes else None,
                      into="flow", narration=narr, level_db=db, lead=lead,
                      ramp=(rb * 4 * spb if rb else 3.0), ramp_at=("after" if rb else "centre"),
                      label=(("under her words" if narr else (tag or "bed")) + f" (bars {a}-{z - 1})"), **kw)
        secs.append(sec)
    bed = dict(sustain_cfg)
    # WHY the tune 2 dB under its bus's usual level (and lead 0.8): in a bed the tune is one voice
    # among the others; at full level each entry lifted the whole mix 3 dB for a bar and dropped
    # back (the first recipe B test), the "popping in and out" round 8 was criticised for
    # WHY the sustain bus trim (audit defect 2, [OWNER] pad_level): -8 dB under the pulse is the
    # calibrated level (mix.TARGET); -4 and 0 raise the sustain's bus by 4 and 8 dB
    mixd = {"lead": -2.0, **sustain_mix(bed.get("sustain", "pad"), o["pad_level"])}
    if style == "v4":
        # WHY no -2 dB on a lead bus: the woven tune plays on the piano bus (its level is the bed's)
        mixd.pop("lead", None)
    p = Piece(name, length, secs, logo=logo, seed=seed, land=land, peak=peak, ending=ending, rit=rit, mix=mixd,
              loudness=loudness, touch=touch, style=style, bed=bed, changes=list(changes or []),
              cycles=list(cycles or []), hits=list(hits or []), recipe=recipe, brief=brief, owner=dict(o),
              speech=speech if speech is not None else [], notes=notes, explain=dict(explain or {}),
              sound=dict(sound or {}))
    if voice_mux:
        p.voice_mux = dict(voice_mux)
    p.recipe_report = [f"RECIPE {recipe}: {n} bars of 4 at {bpm:g} bpm" + (f" + one odd bar of {odd} (bar {G.at})" if odd else "")
                       + f", the name at {land:g} s (the tempo map stretches {100 * stretch:+.1f} %"
                       + (")" if abs(stretch) <= 0.03 else "; over 3 %: change bpm, add an odd bar or move the name)")
                       + (f"; ending slows to {rit:g}" if ending != "short" else ""),
                       "   tune: " + ("; ".join(tune_report) if tune_report else ("none (the pulse carries the cell)" if recipe != "narrated" else
                                                                           "none (the two-note pulse does not play the cell)")),
                       "   owner switches: " + ", ".join(f"{k}={v}" for k, v in o.items())] + fit_report
    if extra:
        for k, v in extra.items():
            setattr(p, k, v)
    return p


def _pulse(o, pool, mask, touch, step=0.5, bass=True, walk=(4, 1), pedal=False):
    """The pulse's section fields for the owner's pulse switch (and, v4, his swing switch)."""
    sw = {"swing": SWING[o["swing"]]} if o.get("swing") in SWING and SWING[o["swing"]] else {}
    if o["pulse"] == "pedal":
        return dict(accomp="figure", fig_mode="pedal", fig_pedal=list(pool), fig_mask=mask, fig_touch=touch,
                    step=step, fig_bass=bass, fig_mask_walk=walk, pedal=pedal, fig_order=o["fig_order"], **sw)
    # round 8's chord-following figure (deck E2 "D", which he liked): every note from the chord
    return dict(accomp="figure", fig_mode="chord", figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"], fig_floor="G3",
                fig_touch=touch, step=step, pedal=pedal, **sw)


def _v4_args(style, cycles, logo, subtle, touch, v3_touch, v4_touch=0.28):
    """What v4 changes in every recipe's arguments. WHY: the cycles (the "menu music" form) are
    retired ("Keep the sound improvements, drop the menu-music form"); the ending is quiet or
    piano-only ("prefer b/c to a"); the pulse touch is the soft one he chose ("A: ours, soft",
    touch 0.28 in the deck). style="v3" keeps the old recipe exactly."""
    if style != "v4":
        return cycles, (logo or ("quiet" if subtle else "blend")), (v3_touch if touch is None else touch)
    if cycles:
        raise ValueError("cycles are retired from the recipes (his ruling: 'drop the menu-music form'); "
                         "fill the upper register with the tune's own phrases, or use style='v3'")
    logo = logo or "quiet"
    if logo not in LOGOS_V4:
        raise ValueError(f"logo={logo!r}: v4 endings are {', '.join(LOGOS_V4)} (he preferred quiet and "
                         "piano-only to the full blend: 'a sounds a bit too harsh'); style='v3' keeps 'blend'")
    return [], logo, (v4_touch if touch is None else touch)


# ---------------------------------------------------------------- Recipe A


def type_short(name, length, *, land, bpm=110.0, chords=None, tune=None, changes=None, cycles=None, peak=None,
               lift=None, seed=1, odd=0, odd_at=1, subtle=None, ending="short", pool=("Bb4", "G4", "F4", "Eb4"),
               mask="x.xxx.x.x.xxx.x.", touch=None, brief=None, hits=(), notes="", owner_over=None, explain=None,
               sound=None, rit=None, logo=None, style="v4", tune_fit="refuse"):
    """RECIPE A, type-only short (10-20 s): one unbroken, even phrase.
    tempo 100-120 (fit_tempo over the cards); 2 chords alternating, one per 2 bars (default
    Ebmaj9 - Abmaj9); the sustain from frame 0; the pedal pulse in eighths, 10 of 16 steps;
    0-1 cycle; the tune once at most before the logo, or none (the pulse already carries the
    cell); 0-1 change; no lift or at most 1.5 dB; the short ending; the quiet logo if subtle.
    Level -16.5 LUFS (subtle) or -15."""
    o = owner(owner_over, style)
    subtle, peak, hits = _from_brief(brief, True if subtle is None and brief is None else subtle, peak, hits)
    cycles, logo, touch = _v4_args(style, cycles, logo, subtle, touch, 0.42)
    return _build("type-short", name, length, land, bpm, chords=chords, default_chords=["Ebmaj9", "Abmaj9"],
                  tune=tune, changes=changes, cycles=cycles, peak=peak, lift=lift or (1, 0.0), seed=seed, odd=odd,
                  odd_at=odd_at, logo=logo, ending=ending, loudness=-16.5 if subtle else -15.0, style=style,
                  tune_fit=tune_fit,
                  touch=0.85 if subtle else 0.92, pulse=_pulse(o, pool, mask, touch),
                  sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse")),
                  hits=hits, brief=brief, notes=notes, o=o,
                  rit=(1.0 if ending == "short" else RIT) if rit is None else rit, explain=explain, sound=sound)


# ---------------------------------------------------------------- Recipe B

# WHY long periods (23 and 29 half-beats, 11.5 and 14.5 beats; co-prime): the foreground (tune
# and cycles together) should fill at most a third of the time; two cycles of 7-13 half-beats
# filled half of it on their own in the first test. Eno's loops were long with short phrases.
DEMO_CYCLES = [Cycle("Bb5/0.5 G5/1", period=23, offset=5, name="cycle1"),
               Cycle("F5/1 D5/1", period=29, offset=14, name="cycle2", touch=0.26)]


def app_demo(name, length, *, land, bpm=116.0, chords=None, tune=None, changes=None, cycles=None, peak=None,
             lift=(2, 2.5), seed=1, odd=0, odd_at=1, subtle=None, ending="sigh", pool=("Bb4", "G4", "F4", "Eb4"),
             mask="x.xxx.x.x.xxx.x.", touch=None, brief=None, hits=(), notes="", owner_over=None, explain=None,
             sound=None, rit=None, logo=None, style="v4", tune_fit="refuse"):
    """RECIPE B, app demo, no narrator (30-75 s): the bed and a few rare tune phrases.
    tempo 104-120; one chord per 2 bars from the rich vocabulary (default Ebmaj9 Cm9 Abmaj9
    Bb9sus); the pad throughout, held strings may join at the peak; the pedal pulse (2.5-4
    attacks a second); 2-3 cycles on co-prime periods (default 23 and 29 half-beats, above C5);
    2-3 tune phrases of 1-2 bars, each followed by at least 2 bars of bed alone (default: one
    phrase picked by seed, said twice, then a peak phrase reaching C6 at the peak); one change every 8-16 s (default plan
    below); one lift of 2.5 dB over 2 bars into the peak, then settle; the full sigh + logo.
    The first 30 s must stand alone (it becomes the :30 cut-down). Level -15 LUFS."""
    o = owner(owner_over, style)
    subtle, peak, hits = _from_brief(brief, subtle, peak, hits)
    # WHY (first-shot c): a short ending does not slow (land_after, type_short), but these
    # recipes defaulted it to 0.85, so --brief searched slowing endings for a "short" piece
    rit = (1.0 if ending == "short" else RIT) if rit is None else rit
    G = Grid(bpm, odd, odd_at)
    v4_cycles = cycles
    cycles, logo, touch = _v4_args(style, cycles, logo, subtle, touch, 0.40)
    if style != "v4":
        cycles = v4_cycles
    if peak is None:
        peak = round(land * 0.75, 2)
    n, _ = _bars_to_land(land, bpm, ending, rit, odd)
    pb = G.moment_bar(peak)
    if tune is None and style == "v4":
        # WHY whole 2-bar phrases about half the time (v4): the accepted pieces carry a real line
        # (round 8 Own: the tune sounds 66 % of the time; felt and pulse 55-60 %), where the
        # clips he heard as "thrown in" dropped a 3-note fragment every ~5 s (12-43 %). Each
        # phrase is followed by two bars of bed; the chords under them are tune-led (_build).
        seq = ["cell-long", "question", "rise", "cell-long"]
        tune, b, k = [], 3, 0
        while b + 1 <= n:
            if k and b <= pb <= b + 3 and pb + 1 <= n and G.body(pb) is not None and G.body(pb + 1) is not None:
                tune.append((pb, "peak-arc"))     # the peak phrase starts ON the peak's bar
                k += 1
                b = pb + 4
            elif G.body(b) is not None and G.body(b + 1) is not None:
                tune.append((b, seq[k % len(seq)]))
                k += 1
                b += 4
            else:
                b += 1
    if tune is None:
        # WHY this shape (statement, answer, restatement, the peak): a phrase heard once and never
        # echoed or answered sounds "thrown in"; one answered, then said again, is a theme
        names = TB.pick(seed, 2, peak=True, bars=1)       # WHY one-bar phrases: rare and short
        a, top = names
        na = TB.phrase(a).nbars
        first = max(3, int(round(0.22 * n)))
        tune = [(first, a)]
        again = first + na + max(2, (pb - first - 2 * na) // 2)
        if again + na <= pb - 2:
            tune.append((again, a))          # said again (it may come back mutated: tunebank.lay)
        tune.append((pb, top))
        tune = [(b, ph) for b, ph in tune if 1 <= b <= n and G.body(b) is not None]
    if cycles is None:
        cycles = [Cycle(c.cell, c.period, c.offset, c.name, c.voice, c.touch, c.chance) for c in DEMO_CYCLES]
    if changes is None:
        # WHY only the peak (v4): no cycles to bring in, no held strings; the music grows by the
        # tune's phrases and the lift, not by adding instruments
        changes = ([(G.moment_bar(peak), "peak")] if style == "v4" else
                   default_changes(land, bpm, peak, odd, odd_at, cycles=[c.name for c in cycles]))
    return _build("app-demo", name, length, land, bpm, chords=chords,
                  default_chords=["Ebmaj9", "Cm9", "Abmaj9", "Bb9sus"], tune=tune, changes=changes, cycles=cycles,
                  peak=peak, lift=lift, seed=seed, odd=odd, odd_at=odd_at, logo=logo,
                  ending=ending, loudness=-16.0 if subtle else -15.0, touch=0.88, pulse=_pulse(o, pool, mask, touch),
                  sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse")),
                  hits=hits, brief=brief, notes=notes, o=o, explain=explain, sound=sound, rit=rit, style=style,
                  tune_fit=tune_fit)


def default_changes(land, bpm, peak, odd=0, odd_at=1, cycles=("cycle1", "cycle2")):
    """A starting change plan for recipe B: one change about every 12 s (never closer than 8 or
    further than 16), the held strings joining at the peak. Cycles start OUT and come in one at a
    time; a cycle the menu does not reach comes in at the peak. WHY every cycle brought in (audit
    defect 5): a cycle the plan never names plays from the start, an unplanned change the
    change-plan gauge could not see. Replace it with the picture's own turns."""
    bar = Grid(bpm, odd, odd_at).bar_of
    pb = Grid(bpm, odd, odd_at).moment_bar(peak)
    plan = []
    cyc = list(cycles)
    menu = ([("in", cyc[0])] if cyc else []) + [("in", "sub")] + [("in", c) for c in cyc[1:2]] + [("density", -2)]
    # evenly spaced from about 8 s to the peak, every gap 8-16 s
    k = max(1, int(np.ceil((peak - 8.0) / 14.0)))
    for i in range(min(k, len(menu))):
        plan.append((bar(8.0 + i * (peak - 8.0) / k),) + menu[i])
    named = {c[2] for c in plan if len(c) > 2 and c[1] == "in"}
    for c in cyc:
        if c not in named:
            plan.append((pb, "in", c))            # the peak is the one bar line that may carry two
    plan.append((pb, "in", "held"))
    plan.append((pb, "peak"))
    return plan


# ---------------------------------------------------------------- Recipe C


def narrated(name, length, *, land, speech, bpm=None, chords=None, turn=None, tune=None, changes=None,
             cycles=None, peak=None, seed=1, odd=0, odd_at=1, logo=None, ending="sigh", pool=("Bb5", "F5"),
             mask="x.x.x.x.x.x.xx.x", touch=None, whimsy=False, brief=None, hits=(), notes="", owner_over=None,
             explain=None, sound=None, narr_level=-6.0, subtle=None, voice_mux=None, rit=None, style="v4",
             tune_fit="refuse"):
    """RECIPE C, narrated story (30-75 s): a soft, low-information bed under her words.
    speech = films.speech_from_words(..., start_at=1-2 s of pre-roll). Tempo: her band
    (syllables x 60 / 3 to / 2), the value nearest 120 (timing.narrator_band). Chords change on
    her sentence ends (chords = one name per sentence, in order; default dark C-minor family
    turning bright at `turn` seconds, the problem-to-solution turn in her script), at most one
    change per 1.5 s. Sustain >= 95 %. The pulse is soft, high and nearly still under her words:
    TWO notes (B-flat 5 and F5, above her range F3-E5), 9 of 16 steps, never two rests running
    (about 2.2 attacks a second). One cycle at most, only in her pauses of a second or more. The
    tune only in pauses that fit a whole phrase and after her last word.
    Level: one hand-set level under her words (default -6 dB), set by section, never moving with
    her words; after them -2 dB (present) or the same level (subtle). subtle (default from the brief's
    feel) also gives the quiet logo and -16.5 LUFS. whimsy=True (storybook): a bell-like high
    double (an octave up, very soft) of the tune's first phrase and every third one after. voice_mux = dict(path, t_from,
    start_at, music_db) measures her margin over the music."""
    import films
    from timing import narrator_band, phrase_ends
    o = owner(owner_over, style)
    subtle, peak, hits = _from_brief(brief, subtle, peak, hits)
    # WHY (first-shot c): a short ending does not slow (land_after, type_short), but these
    # recipes defaulted it to 0.85, so --brief searched slowing endings for a "short" piece
    rit = (1.0 if ending == "short" else RIT) if rit is None else rit
    v3_cycles = cycles
    cycles, logo, touch = _v4_args(style, cycles, logo, subtle, touch, 0.26, 0.26)
    if style == "v4" and "pulse" not in (owner_over or {}) and "pulse=" not in os.environ.get("SONGBOOK_OWNER", ""):
        # WHY the pedal pulse under her (v4): the chord-following figure starts at G3, inside her
        # range (F3-E5); the high two-note pulse is what his narrator clip (E1 "D") was heard with
        o = dict(o, pulse="pedal")
    if style != "v4":
        cycles = v3_cycles
    pace = films.speech_pace(speech, 0.0, land)
    if bpm is None:
        bpm = narrator_band(pace["syl_per_s"], o["narrator_tempo"])["bpm"] if pace else 116.0
    G = Grid(bpm, odd, odd_at)
    n, _ = _bars_to_land(land, bpm, ending, rit, odd)
    bar = G.bar_of
    total = n + (1 if odd else 0)
    # chords on her sentence ends, snapped to the nearest half-bar, at most one per 1.5 s
    ends = [e for e in phrase_ends(speech) if e["kind"] == "sentence" and e["t"] < land - 2.0]
    dark = ["Cm9", "Abmaj9", "Fm9", "Cm11", "Abmaj9", "Bb9sus"]
    bright = ["Ebmaj9", "Abmaj9", "Cm9", "Ebadd9", "Abmaj7#11", "Bb9sus"]
    seq, k_d, k_b = [], 0, 0
    if chords is None:
        for e in ends:
            if turn is not None and e["t"] >= turn:
                seq.append(bright[k_b % len(bright)])
                k_b += 1
            else:
                seq.append(dark[k_d % len(dark)])
                k_d += 1
    else:
        seq = list(chords)
    halves = [None] * (2 * n)
    first = seq[0] if seq else ("Cm9" if turn else "Ebmaj9")
    halves[0] = first
    last_t = -9.0
    placed = []
    for e, c in zip(ends, seq[1:] + ([seq[-1]] if seq else [])):
        h = G.halfbar(e["t"])
        if h is not None and 0 < h < 2 * n and e["t"] - last_t >= 1.5 and halves[h] is None:
            halves[h] = c
            last_t = e["t"]
            placed.append((round(e["t"], 2), h, c))
    cur = halves[0]
    for i in range(2 * n):
        cur = halves[i] or cur
        halves[i] = cur
    chordbars = [[halves[2 * k]] if halves[2 * k] == halves[2 * k + 1] else [halves[2 * k], halves[2 * k + 1]]
                 for k in range(n)]
    # narration spans as bars: a section under her words from her first word to her last
    words = list(getattr(speech, "words", []) or [])
    narr = []
    if words:
        a, z = bar(words[0][1]), bar(words[-1][2]) + 1
        narr = [(a, min(z, total + 1))]
    if tune is None:
        # the tune only after her last word (the post-roll), as one phrase if it fits
        tune = []
        if words:
            b_after = bar(words[-1][2] + 0.3) + 1
            if b_after <= total - 1 and G.body(b_after) is not None:
                tune.append((b_after, "cell-long" if b_after + 1 <= total else "cell"))
    if cycles is None and style != "v4":
        # WHY these pitches (audit 2026-11-25, defect 5): the old cycle (G5 B-flat 5 F5) used the
        # pulse's own notes in its own octave, so the two met in unison (both B-flat 5 at 1.49 s);
        # G5 D5 E-flat 5 is a different shape on notes the pulse under her words does not play
        cycles = [Cycle("G5/1 D5/1 Eb5/1", period=21, offset=4, name="cycle1", touch=0.24)]
    if changes is None:
        # WHY this default: the bed closes in a little as her problem deepens, the chords turn at
        # her turn, and once she stops the high pulse comes down to its usual register so the
        # tune that follows her last word sings above it (left high, it took the top voice)
        changes = []
        if words and turn is not None and turn - words[0][1] > 12.0:
            changes.append((bar(words[0][1] + (turn - words[0][1]) / 2), "brightness", 0.85))
        if turn is not None:
            changes.append((G.moment_bar(turn), "family", "bright"))
        if words:
            # once she has stopped, the pulse comes down to its usual place, under the tune
            # WHY only inside the piece (first-shot c, d): when she speaks into the ending this bar
            # was past the last body bar, printed as a change that never sounds
            if bar(words[-1][2]) + 1 <= total:
                changes.append((bar(words[-1][2]) + 1, "pool", ["Bb4", "G4", "F4", "Eb4"]))
    # WHY no step when subtle (audit defect 7): after her last word the music rose 7.6 dB in 6 s
    # (-18.8 to -11.2 LUFS) into the full logo, in a brief that asked for subtle; a 2 dB step still
    # measured a 7.8 dB rise (the tune entering, the pulse coming down into the louder middle of
    # the piano, the logo), so a subtle film keeps her level and lets the tune alone lift it
    after_db = narr_level if subtle else -2.0
    p = _build("narrated", name, length, land, bpm, chords=chordbars, default_chords=None, tune=tune,
               changes=changes, cycles=cycles, peak=peak, lift=None, seed=seed, odd=odd, odd_at=odd_at, logo=logo,
               ending=ending, loudness=-16.5 if subtle else -16.0, touch=0.85, pulse=_pulse(o, pool, mask, touch, bass=True),
               sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse"), cycle_pause=1.0, whimsy=bool(whimsy)),
               narration_bars=narr, narr_level=narr_level, level=after_db, speech=speech, hits=hits, brief=brief,
               notes=notes, o=o, explain=explain, sound=sound, rit=rit, voice_mux=voice_mux, style=style,
               tune_fit=tune_fit, led=(chords is None),
               # WHY a softer tune when subtle: the owner's ruling "subtle: fewer notes, softer touch"
               lead=0.7 if subtle else 0.8)
    p.recipe_report.insert(1, "   her pace: " + (f"{pace['syl_per_s']} syllables a second; band "
                                                  f"{narrator_band(pace['syl_per_s'])['lo']}-{narrator_band(pace['syl_per_s'])['hi']} bpm; "
                                                  f"chosen {bpm:g} ({o['narrator_tempo']})" if pace else "no words"))
    p.recipe_report.insert(2, "   chords on her sentence ends (time -> half-bar, chord): "
                           + ", ".join(f"{t:g}s->{h / 2:g} {c}" for t, h, c in placed))
    return p


RECIPES = {"type-short": type_short, "app-demo": app_demo, "narrated": narrated}
