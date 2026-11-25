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
owner={...}. Every piece records the switches it was made with (Piece.owner, printed in reports).
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
)


def owner(over=None):
    """The switches in force: OWNER, then the environment (SONGBOOK_OWNER), then `over`."""
    o = dict(OWNER)
    for part in (os.environ.get("SONGBOOK_OWNER", "") or "").split(","):
        if "=" in part:
            k, v = (x.strip() for x in part.split("=", 1))
            if k not in o:
                raise KeyError(f"SONGBOOK_OWNER: unknown switch {k!r}; known: {', '.join(o)}")
            o[k] = int(v) if isinstance(OWNER[k], int) else v
    o.update(over or {})
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


def _build(recipe, name, length, land, bpm, *, chords, default_chords, tune, changes, cycles, peak, lift,
           seed, odd, logo, ending, loudness, touch, pulse, sustain_cfg, narration_bars=(), level=0.0,
           narr_level=-6.0, speech=None, hits=(), brief=None, notes="", o=None, rit=RIT, lead=0.8,
           extra=None, explain=None, sound=None):
    o = o or owner()
    n, stretch = _bars_to_land(land, bpm, ending, rit, odd)
    chordbars = _chordlist(chords, n, default_chords, o["chords"] == "rich")
    # tune bars are given as the piece's bars (an odd bar is bar 1); the bank lays them on the 4-beat bars
    whole, tune_report = TB.lay([(b - (1 if odd else 0), ph) for b, ph in (tune or [])], chordbars, seed,
                                shown_offset=1 if odd else 0)
    # where sections must split: the lift, the settle after the peak, the narrator's spans
    g0 = 1 if odd else 0                          # global bar number of body bar 1, minus 1
    spb = 60.0 / bpm

    def bar_of(t):                                # global bar (1-based) that a time falls in, at the nominal tempo
        return 1 + int(max(0.0, t / spb - odd) // 4) + g0
    peak_bar = bar_of(peak) if peak is not None else None
    cuts = {1 + g0, n + g0 + 1}
    lift_bars, lift_db = (lift or (0, 0.0))
    lv = {}                                       # global bar -> (level_db, narration, ramp bars)
    if lift_db and peak_bar:
        a = max(1 + g0, peak_bar - lift_bars)
        z = min(n + g0, peak_bar + 2)
        cuts |= {a, z}
        lv[a] = ("lift", lift_bars)
        lv[z] = ("settle", 2)
    for a, z in narration_bars:
        cuts |= {max(1 + g0, a), min(n + g0 + 1, z)}
    cuts = sorted(c for c in cuts if 1 + g0 <= c <= n + g0 + 1)
    secs = []
    if odd:
        secs.append(Section("bed", 1, bpm=bpm, meter=int(odd), chords=[chordbars[0]], label="odd bar",
                            into="flow", **pulse))
    state_db = level
    was_narr = False
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
        body0 = a - g0 - 1                        # body bar index (0-based)
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
    p = Piece(name, length, secs, logo=logo, seed=seed, land=land, peak=peak, ending=ending, rit=rit, mix={"lead": -2.0},
              loudness=loudness, touch=touch, style="v3", bed=bed, changes=list(changes or []),
              cycles=list(cycles or []), hits=list(hits or []), recipe=recipe, brief=brief, owner=dict(o),
              speech=speech if speech is not None else [], notes=notes, explain=dict(explain or {}),
              sound=dict(sound or {}))
    p.recipe_report = [f"RECIPE {recipe}: {n} bars of 4 at {bpm:g} bpm" + (f" + one odd bar of {odd}" if odd else "")
                       + f", the name at {land:g} s (the tempo map stretches {100 * stretch:+.1f} %"
                       + (")" if abs(stretch) <= 0.03 else "; over 3 %: change bpm, add an odd bar or move the name)"),
                       "   tune: " + ("; ".join(tune_report) if tune_report else "none (the pulse carries the cell)"),
                       "   owner switches: " + ", ".join(f"{k}={v}" for k, v in o.items())]
    if extra:
        for k, v in extra.items():
            setattr(p, k, v)
    return p


def _pulse(o, pool, mask, touch, step=0.5, bass=True, walk=(4, 1), pedal=False):
    """The pulse's section fields for the owner's pulse switch."""
    if o["pulse"] == "pedal":
        return dict(accomp="figure", fig_mode="pedal", fig_pedal=list(pool), fig_mask=mask, fig_touch=touch,
                    step=step, fig_bass=bass, fig_mask_walk=walk, pedal=pedal)
    # round 8's chord-following figure, for the owner's A/B
    return dict(accomp="figure", fig_mode="chord", figure=["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"], fig_floor="G3",
                fig_touch=touch, step=step, pedal=pedal)


# ---------------------------------------------------------------- Recipe A


def type_short(name, length, *, land, bpm=110.0, chords=None, tune=None, changes=None, cycles=None, peak=None,
               lift=None, seed=1, odd=0, subtle=True, ending="short", pool=("Bb4", "G4", "F4", "Eb4"),
               mask="x.xxx.x.x.xxx.x.", touch=0.42, brief=None, hits=(), notes="", owner_over=None, explain=None,
               sound=None):
    """RECIPE A, type-only short (10-20 s): one unbroken, even phrase.
    tempo 100-120 (fit_tempo over the cards); 2 chords alternating, one per 2 bars (default
    Ebmaj9 - Abmaj9); the sustain from frame 0; the pedal pulse in eighths, 10 of 16 steps;
    0-1 cycle; the tune once at most before the logo, or none (the pulse already carries the
    cell); 0-1 change; no lift or at most 1.5 dB; the short ending; the quiet logo if subtle.
    Level -16.5 LUFS (subtle) or -15."""
    o = owner(owner_over)
    return _build("type-short", name, length, land, bpm, chords=chords, default_chords=["Ebmaj9", "Abmaj9"],
                  tune=tune, changes=changes, cycles=cycles, peak=peak, lift=lift or (1, 0.0), seed=seed, odd=odd,
                  logo="quiet" if subtle else "blend", ending=ending, loudness=-16.5 if subtle else -15.0,
                  touch=0.85 if subtle else 0.92, pulse=_pulse(o, pool, mask, touch),
                  sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse")),
                  hits=hits, brief=brief, notes=notes, o=o, rit=1.0 if ending == "short" else RIT, explain=explain,
                  sound=sound)


# ---------------------------------------------------------------- Recipe B

# WHY long periods (23 and 29 half-beats, 11.5 and 14.5 beats; co-prime): the foreground (tune
# and cycles together) should fill at most a third of the time; two cycles of 7-13 half-beats
# filled half of it on their own in the first test. Eno's loops were long with short phrases.
DEMO_CYCLES = [Cycle("Bb5/0.5 G5/1", period=23, offset=5, name="cycle1"),
               Cycle("F5/1 D5/1", period=29, offset=14, name="cycle2", touch=0.26)]


def app_demo(name, length, *, land, bpm=116.0, chords=None, tune=None, changes=None, cycles=None, peak=None,
             lift=(2, 2.5), seed=1, odd=0, subtle=False, ending="sigh", pool=("Bb4", "G4", "F4", "Eb4"),
             mask="x.xxx.x.x.xxx.x.", touch=0.40, brief=None, hits=(), notes="", owner_over=None, explain=None,
             sound=None):
    """RECIPE B, app demo, no narrator (30-75 s): the bed and a few rare tune phrases.
    tempo 104-120; one chord per 2 bars from the rich vocabulary (default Ebmaj9 Cm9 Abmaj9
    Bb9sus); the pad throughout, held strings may join at the peak; the pedal pulse (2.5-4
    attacks a second); 2-3 cycles on co-prime periods (default 23 and 29 half-beats, above C5);
    2-3 tune phrases of 1-2 bars, each followed by at least 2 bars of bed alone (default: one
    phrase picked by seed, said twice, then a peak phrase reaching C6 at the peak); one change every 8-16 s (default plan
    below); one lift of 2.5 dB over 2 bars into the peak, then settle; the full sigh + logo.
    The first 30 s must stand alone (it becomes the :30 cut-down). Level -15 LUFS."""
    o = owner(owner_over)
    spb = 60.0 / bpm
    if peak is None:
        peak = round(land * 0.75, 2)
    n, _ = _bars_to_land(land, bpm, ending, RIT, odd)
    pb = 1 + int((peak / spb - odd) // 4) + (1 if odd else 0)
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
        tune = [(b, ph) for b, ph in tune if 1 <= b <= n]
    if changes is None:
        changes = default_changes(land, bpm, peak, odd)
    if cycles is None:
        cycles = [Cycle(c.cell, c.period, c.offset, c.name, c.voice, c.touch, c.chance) for c in DEMO_CYCLES]
    return _build("app-demo", name, length, land, bpm, chords=chords,
                  default_chords=["Ebmaj9", "Cm9", "Abmaj9", "Bb9sus"], tune=tune, changes=changes, cycles=cycles,
                  peak=peak, lift=lift, seed=seed, odd=odd, logo="quiet" if subtle else "blend", ending=ending,
                  loudness=-16.0 if subtle else -15.0, touch=0.88, pulse=_pulse(o, pool, mask, touch),
                  sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse")),
                  hits=hits, brief=brief, notes=notes, o=o, explain=explain, sound=sound)


def default_changes(land, bpm, peak, odd=0):
    """A starting change plan for recipe B: one change about every 12 s (never closer than 8 or
    further than 16), the held strings joining at the peak. Cycles start OUT and come in one at a
    time. Replace it with the picture's own turns."""
    spb = 60.0 / bpm

    def bar(t):
        return 1 + int(max(0.0, t / spb - odd) // 4) + (1 if odd else 0)
    pb = bar(peak)
    plan = []
    menu = [("in", "cycle1"), ("in", "sub"), ("register", 1), ("in", "cycle2"), ("density", -2)]
    # evenly spaced from about 8 s to the peak, every gap 8-16 s
    k = max(1, int(np.ceil((peak - 8.0) / 14.0)))
    for i in range(min(k, len(menu))):
        plan.append((bar(8.0 + i * (peak - 8.0) / k),) + menu[i])
    plan.append((pb, "in", "held"))
    plan.append((pb, "peak"))
    return plan


# ---------------------------------------------------------------- Recipe C


def narrated(name, length, *, land, speech, bpm=None, chords=None, turn=None, tune=None, changes=None,
             cycles=None, peak=None, seed=1, odd=0, logo="blend", ending="sigh", pool=("Bb5", "G5", "F5"),
             mask="x.x.x.x.x.x.xx.x", touch=0.26, whimsy=False, brief=None, hits=(), notes="", owner_over=None,
             explain=None, sound=None, narr_level=-6.0):
    """RECIPE C, narrated story (30-75 s): a soft, low-information bed under her words.
    speech = films.speech_from_words(..., start_at=1-2 s of pre-roll). Tempo: her band
    (syllables x 60 / 3 to / 2), the value nearest 120 (timing.narrator_band). Chords change on
    her sentence ends (chords = one name per sentence, in order; default dark C-minor family
    turning bright at `turn` seconds, the problem-to-solution turn in her script), at most one
    change per 1.5 s. Sustain >= 95 %. The pulse is soft and high (B-flat 5, G5, F5: above her
    range F3-E5), 9 of 16 steps, never two rests running (about 2.2 attacks a second). One cycle at most, only in her pauses of
    a second or more. The tune only in pauses that fit a whole phrase and after her last word.
    Level: one hand-set level under her words (default -6 dB), set by section, never moving with
    her words. whimsy=True (storybook): a bell-like high double of the cell in a third of its
    rounds."""
    import films
    from timing import narrator_band, phrase_ends
    o = owner(owner_over)
    pace = films.speech_pace(speech, 0.0, land)
    if bpm is None:
        bpm = narrator_band(pace["syl_per_s"], o["narrator_tempo"])["bpm"] if pace else 116.0
    spb = 60.0 / bpm
    n, _ = _bars_to_land(land, bpm, ending, RIT, odd)

    def bar(t):
        return 1 + int(max(0.0, t / spb - odd) // 4) + (1 if odd else 0)

    def halfbar(t):                               # (body bar index, half) nearest t
        x = max(0.0, t / spb - odd) / 2.0
        return int(round(x))
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
        h = halfbar(e["t"])
        if 0 < h < 2 * n and e["t"] - last_t >= 1.5 and halves[h] is None:
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
        narr = [(a, min(z, n + 1 + (1 if odd else 0)))]
    if tune is None:
        # the tune only after her last word (the post-roll), as one phrase if it fits
        tune = []
        if words:
            b_after = bar(words[-1][2] + 0.3) + 1
            if b_after <= n - 1:
                tune.append((b_after, "cell-long" if b_after + 1 <= n else "cell"))
    if cycles is None:
        cycles = [Cycle("G5/1 Bb5/1 F5/1", period=21, offset=4, name="cycle1", touch=0.24)]
        if whimsy:
            cycles.append(Cycle("Bb5/0.5 G5/0.5 F5/1", period=17, offset=9, name="bell", voice="bell",
                                touch=0.2, chance=0.33))
    if changes is None:
        # WHY this default: the bed closes in a little as her problem deepens, the chords turn at
        # her turn, and once she stops the high pulse comes down to its usual register so the
        # tune that follows her last word sings above it (left high, it took the top voice)
        changes = []
        if words and turn is not None and turn - words[0][1] > 12.0:
            changes.append((bar(words[0][1] + (turn - words[0][1]) / 2), "brightness", 0.85))
        if turn is not None:
            changes.append((bar(turn), "family", "bright"))
        if words:
            # once she has stopped, the pulse comes down to its usual place, under the tune
            changes.append((bar(words[-1][2]) + 1, "pool", ["Bb4", "G4", "F4", "Eb4"]))
    p = _build("narrated", name, length, land, bpm, chords=chordbars, default_chords=None, tune=tune,
               changes=changes, cycles=cycles, peak=peak, lift=None, seed=seed, odd=odd, logo=logo, ending=ending,
               loudness=-16.0, touch=0.85, pulse=_pulse(o, pool, mask, touch, bass=True),
               sustain_cfg=dict(sustain=o["sustain"], start=("sustain", "pulse"), cycle_pause=1.0),
               narration_bars=narr, narr_level=narr_level, level=-2.0, speech=speech, hits=hits, brief=brief, notes=notes, o=o,
               explain=explain, sound=sound)
    p.recipe_report.insert(1, "   her pace: " + (f"{pace['syl_per_s']} syllables a second; band "
                                                  f"{narrator_band(pace['syl_per_s'])['lo']}-{narrator_band(pace['syl_per_s'])['hi']} bpm; "
                                                  f"chosen {bpm:g} ({o['narrator_tempo']})" if pace else "no words"))
    p.recipe_report.insert(2, "   chords on her sentence ends (time -> half-bar, chord): "
                           + ", ".join(f"{t:g}s->{h / 2:g} {c}" for t, h, c in placed))
    return p


RECIPES = {"type-short": type_short, "app-demo": app_demo, "narrated": narrated}
