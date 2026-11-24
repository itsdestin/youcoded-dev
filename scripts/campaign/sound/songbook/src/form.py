"""COMPOSITION CHECKS and THE NOTE DUMP (added 2026-11-23; sharpened after the round-7 test scores).

WHY: the old checks measured only the mix (loudness, peaks, the tune on top, noisy attacks).
"Make it mine" passed every one of them while being one four-bar loop played for 54 s: its
opening bar seven times, one chord loop for 40 s, no bar where the tune rested, its highest note
given away at 2.5 s and its payoff quieter than the bar before it. Nobody here can listen, so
every rule in SONGBOOK.md's "Composing a score" chapter is turned into a number and a limit
here, and a piece that breaks one FAILS with a plain sentence saying where.

WHY round 7 (same day): three test scores passed every check and the critics still found one
shape and one rhythm used throughout (21 of 21 tune bars starting on the downbeat, one rhythm 8
times, 11 transposed copies of the cell), a "drop" with seven parts in it, a 30 s loudness
plateau, and bars the checks called NEW that were the same bar moved up a step. So:
  * a bar is "the same" when it is the same SHAPE (rhythm + intervals, any key), or when three
    quarters of its notes match an earlier bar, not only when it is identical;
  * the tune's rhythms, its entries (downbeat or not) and the cell's shape are counted;
  * harmonic rhythm, the drop, the arrival at the peak, the settle before the logo, the top voice,
    held notes clashing across a chord change and loudness plateaus are checked;
  * some findings are WARNINGS (printed, never failing): they need a musician's judgement.

Two halves:
  * from the NOTES the score plays (Band.log; no audio needed, so `render.sh --notes` runs them
    in about a second);
  * from the AUDIO (after a render): loudness per bar (range, plateaus, the payoff louder than
    what led to it, the logo against the peak), near-copy bars, the level under a narrator.
"""
import math
import re
from collections import Counter

import numpy as np

import tune as T
from dsp import SR, note

NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
VOICE_RANGE = (53, 76)   # F3-E5: a speaking voice's pitch and its strongest overtones (see SONGBOOK)
SIM_COPY = 0.975         # audio: a bar this similar (pitch content) to an earlier one is a near copy
# WHY 0.975 (was 0.985): bars the critics heard as copies measured 0.95-0.98 and passed

# one letter per instrument group, for the bar table's "parts" column (what SOUNDS in a bar)
PART_LETTER = dict(lead="L", sing="V", double="D", answer="A", counter="C", piano="P", pizz="Z", bowed="H",
                   air="R", synth="Y", sub="S")


def nm(m):
    return f"{NAMES[int(m) % 12]}{int(m) // 12 - 1}"


def root_pc(chord):
    """The chord's own root (the letter in its name), NOT its bass note: 'Eb/G' -> E-flat.
    WHY (2026-11-23, mim and tale): bass-moves compared the bass with the voicing's lowest note,
    which for an inversion IS the inverted bass (Eb/G gave G2), so an inversion never counted as
    the bass leaving the root although the guide says it does."""
    g = re.match(r"^([A-G])(b|#)?", chord)
    pc = NAMES.index(g.group(1))
    return (pc + {"b": -1, "#": 1}.get(g.group(2) or "", 0)) % 12


def _cls(e):
    """What a logged note is, for the checks: tune | answer | counter | bass | mid | held | air | synth | sub."""
    if e["role"] == "lead" or e["bus"] == "sing":
        return "tune"
    if e["role"] == "double" or e["bus"] == "double":
        return "double"
    if e["bus"] in ("answer", "counter", "air", "synth", "sub"):
        return e["bus"]
    if e["part"] in ("pizz-vc",) or (e["part"] == "bow-vc" and e["bus"] == "bowed" and e["m"] < 48):
        return "bass"
    if e["bus"] == "piano" and e["m"] < 48:
        return "bass"
    if e["bus"] == "bowed":
        return "held"
    return "mid"


# ====================================================================== the bar table


def _shape(tune):
    """A tune bar's SHAPE: its rhythm (onsets) and its intervals, in any key."""
    if not tune:
        return None
    on = tuple(a for a, _, _ in tune)
    iv = tuple(b[1] - a[1] for a, b in zip(tune, tune[1:]))
    return (on, iv)


def bar_table(band, plans, piece):
    """One row per bar (the ending bar last), built from every note the score placed."""
    rows = []
    for p in plans:
        for j, b in enumerate(p.bars):
            rows.append(dict(k=len(rows) + 1, sec=("ending" if p.ending else (p.sec.label or p.sec.mood)),
                             plan=p.i, j=j, beat=b.beat, blen=p.blen, t0=p.tm.seconds(b.beat),
                             t1=p.tm.seconds(b.beat + p.blen), chords=list(b.chords), ending=p.ending, notes=[],
                             blend=False))
    for p in plans:
        if p.into in ("blend", "build") and not p.ending and p.i + 1 < len(plans) and not plans[p.i + 1].ending:
            b0 = p.beat0 + 4 * len(p.bars) - 4 * p.span
            for r in rows:
                if r["plan"] == p.i and r["beat"] >= b0 - 1e-6:
                    r["blend"] = True
    beats = np.array([r["beat"] for r in rows])
    for e in band.log:
        i = int(np.searchsorted(beats, e["beat"] + 1e-6) - 1)
        if 0 <= i < len(rows):
            if rows[i]["ending"] and e["beat"] - rows[i]["beat"] >= rows[i]["blen"] - 1e-6:
                continue                     # the logo and its ringing chord: not a bar of the score
            rows[i]["notes"].append(dict(e, rel=round(e["beat"] - rows[i]["beat"], 3), cls=_cls(e)))
    for r in rows:
        ns = r["notes"]
        # (the logo's own pick-up notes are not the tune: the logo is counted on its own)
        tune = sorted((n["rel"], n["m"], round(n["dur"], 2)) for n in ns if n["cls"] == "tune" and n["role"] == "lead"
                      and not (n.get("canon") or ("",))[0] == "logo")
        r["tune"] = tune
        r["tune_fp"] = tuple((a, m) for a, m, _ in tune)
        r["shape"] = _shape(tune)
        r["rhythm"] = tuple(round(a * 4) / 4 for a, _, _ in tune) or None
        # WHY only the bass and middle parts count as "the accompaniment": a held string note or
        # the high air line starting in one bar and not the next is not a new rhythm, and
        # switching on a quiet layer is exactly the fake variety these checks exist to catch
        acc = [n for n in ns if n["cls"] in ("bass", "mid", "counter")]
        r["back_rhythm"] = tuple(sorted({(n["cls"], round(n["rel"] * 4) / 4) for n in acc}))
        r["back_fp"] = tuple(sorted((n["cls"], round(n["rel"] * 4) / 4, n["m"])
                                    for n in ns if n["cls"] in ("bass", "mid", "answer", "counter")))
        r["fp"] = (r["tune_fp"], tuple(r["chords"]), r["back_fp"])
        r["n"] = len(ns)
        # the bass = the lowest bass-part note at each moment (so a chord's upper notes never
        # pass for a moving bass)
        low = {}
        for n in ns:
            if n["cls"] == "bass":
                q = round(n["rel"] * 4) / 4
                low[q] = min(low.get(q, 999), n["m"])
        r["bass"] = sorted(set(low.values()))
        r["top"] = max((m for _, m, _ in tune), default=None)
    # WHAT SOUNDS in each bar (round 7): every note that rings in the bar, wherever it started,
    # as the fraction of the bar each instrument group is sounding. WHY: the table listed only
    # notes STARTING in a bar, so a "drop" reported as 3 notes still had a held string chord in it.
    for r in rows:
        r["sounding"] = {}
    for e in band.log:
        s0, s1 = e["beat"], e["beat"] + max(e["dur"], 0.25)
        for r in rows:
            a, b = r["beat"], r["beat"] + r["blen"]
            ov = min(s1, b) - max(s0, a)
            if ov > 1e-6:
                r["sounding"][e["bus"]] = max(r["sounding"].get(e["bus"], 0.0), 0.0) + ov / r["blen"]
    for r in rows:
        r["sounding"] = {k: min(1.0, v) for k, v in r["sounding"].items()}
    return rows


def sounding_buses(band, b0, b1, exclude=("air", "double")):
    """Instrument groups that sound for at least half of the span of beats [b0, b1)."""
    cover = {}
    for e in band.log:
        s0, s1 = e["beat"], e["beat"] + max(e["dur"], 0.25)
        ov = min(s1, b1) - max(s0, b0)
        if ov > 1e-6 and e["bus"] not in exclude:
            cover.setdefault(e["bus"], []).append((max(s0, b0), min(s1, b1)))
    out = []
    for bus, spans in cover.items():
        spans.sort()
        tot, cur0, cur1 = 0.0, None, None
        for a, b in spans:
            if cur1 is None or a > cur1:
                if cur1 is not None:
                    tot += cur1 - cur0
                cur0, cur1 = a, b
            else:
                cur1 = max(cur1, b)
        if cur1 is not None:
            tot += cur1 - cur0
        if tot >= 0.5 * (b1 - b0) - 1e-6:
            out.append(bus)
    return sorted(out)


# ====================================================================== symbolic checks


def _signature_cells(rows, piece=None):
    """Every place the three-note "you-co-ded" shape is heard in the tune (a rise of a sixth, then
    a step down), in any key or octave: (bar, pitches, rhythm, seconds). The ending bar counts,
    and (round 7) the logo itself counts as one more hearing: the critics heard the cell 4 times
    in 9 s in a film whose check said 2."""
    seq = [(r["k"], r["beat"] + a, m, d, r["t0"] + a * (r["t1"] - r["t0"]) / r["blen"])
           for r in rows for a, m, d in r["tune"]]
    out = []
    for i in range(len(seq) - 2):
        a, b, c = seq[i], seq[i + 1], seq[i + 2]
        if b[2] - a[2] in (8, 9) and c[2] - b[2] in (-1, -2) and b[1] - a[1] <= 4.01 and c[1] - b[1] <= 4.01:
            out.append((a[0], (a[2], b[2], c[2]), (round(b[1] - a[1], 2), round(c[1] - b[1], 2)), a[4]))
    if piece is not None and getattr(piece, "logo", "blend") != "none":
        k = rows[-1]["k"]
        land = piece.land_time()
        if not any(x[0] == k and x[1] == (note("Bb4"), note("G5"), note("F5")) for x in out):
            out.append((k, (note("Bb4"), note("G5"), note("F5")), (0.5, 0.5), land - 0.5))
    return out


def _runs(xs):
    best, cur, prev = 0, 0, object()
    for x in xs:
        cur = cur + 1 if x == prev else 1
        prev = x
        best = max(best, cur)
    return best


def _bar_s(rows):
    body = [r for r in rows if not r["ending"]]
    return float(np.median([r["t1"] - r["t0"] for r in body])) if body else 2.0


def _near_same(a, b):
    """Two tune bars are the same bar if three quarters of the notes of the longer one start at
    the same beat on the same pitch (one passing note added or one note changed does not make
    a bar new)."""
    if not a["tune_fp"] or not b["tune_fp"]:
        return False
    sa, sb = set(a["tune_fp"]), set(b["tune_fp"])
    return len(sa & sb) >= 0.75 * max(len(sa), len(sb))


IDLE = {   # a layer switched on by add= that this situation never plays
    "pizz": lambda p: p.accomp in ("bounce", "still"),
    "synth": lambda p: p.accomp in ("sparse", "still"),
    "answer": lambda p: p.voice == "violin",
    "octaves": lambda p: p.voice == "violin",
}


def symbolic(band, plans, piece, rows=None):
    """The checks that need only the notes. Returns a list of dicts: id, ok, value, limit, why,
    level ("fail" = a broken rule fails the piece; "warn" = printed for a musician to judge)."""
    rows = rows or bar_table(band, plans, piece)
    body = [r for r in rows if not r["ending"]]
    bar_s = _bar_s(rows)
    land = piece.land_time()
    out = []
    tk = {r["k"]: r["t0"] for r in rows}

    def add(cid, ok, value, limit, why, level="fail"):
        out.append(dict(id=cid, ok=bool(ok), value=value, limit=limit, why=why, level=level))

    def window_count(items, span):
        """items = [(seconds, key)]: the most of one key inside any `span` seconds, and that key."""
        best, wk = 0, None
        for t, key in items:
            n = sum(1 for t2, k2 in items if k2 == key and 0 <= t2 - t < span)
            if n > best:
                best, wk = n, key
        return best, wk

    # ------------------------------------------------------------------ repetition
    # 1. no whole bar heard more than twice in the same form
    c = Counter(r["fp"] for r in body if r["n"])
    worst = max(c.values(), default=0)
    where = [r["k"] for r in body if c[r["fp"]] == worst] if worst > 2 else []
    add("bar-repeats", worst <= 2, worst, "<= 2",
        f"the same whole bar (tune, chords and accompaniment) is heard {worst} times (bars {where})" if worst > 2 else
        "no whole bar is heard more than twice")
    # 2. no tune bar more than twice the same (round 7: "the same" = identical, or 3/4 of its notes
    # match an earlier bar: bar 13 plus one E-flat was not a new bar)
    tb = [r for r in body if r["tune_fp"]]
    worst, wk = 0, []
    for r in tb:
        same = [x["k"] for x in tb if x["k"] <= r["k"] and (x["tune_fp"] == r["tune_fp"] or _near_same(x, r))]
        if len(same) > worst:
            worst, wk = len(same), same
    add("tune-bar-repeats", worst <= 2, worst, "<= 2",
        f"one bar of the tune is played {worst} times the same or nearly (bars {wk}): develop it the third time" if worst > 2 else
        "no bar of the tune is played more than twice the same, or nearly")
    # 3. the same SHAPE (rhythm and intervals, in any key) at most 3 times in any 30 s.
    # WHY (round 7): 11 transposed copies of one shape passed every check; a sequence (the same
    # shape a step higher) is a device for two or three hearings, not a way to write a film
    worst, wkey = window_count([(r["t0"], r["shape"]) for r in tb if r["shape"] and len(r["shape"][0]) >= 2], 30.0)
    wbars = [r["k"] for r in tb if r["shape"] == wkey]
    add("tune-shapes", worst <= 3, worst, "<= 3 per 30 s",
        f"one tune shape (the same rhythm and intervals, moved) is heard {worst} times in 30 s (bars {wbars}): "
        "change its rhythm, direction or place in the bar" if worst > 3 else
        f"no tune shape more than {worst} times in 30 s, in any key")
    # 4. rhythm variety in the tune: no one-bar rhythm more than 3 times in any 30 s, and enough
    # different rhythms for the length (2 for 10 s, 3 for 30 s, 5 for 60 s)
    rh = [(r["t0"], r["rhythm"]) for r in tb if r["rhythm"] and len(r["rhythm"]) >= 2]
    worst, wkey = window_count(rh, 30.0)
    distinct = len({x for _, x in rh})
    need = int(min(5, max(2, round(land / 12))))
    add("tune-rhythms", worst <= 3 and distinct >= need, f"{distinct}/{worst}", f">= {need} rhythms, <= 3 each per 30 s",
        (f"the tune uses {distinct} different one-bar rhythms (at least {need} for {land:.0f} s)" if distinct < need else "") +
        ("; " if distinct < need and worst > 3 else "") +
        (f"one rhythm {wkey} opens {worst} bars in 30 s" if worst > 3 else "")
        if (worst > 3 or distinct < need) else f"{distinct} different tune rhythms, none more than {worst} times in 30 s")
    # 5. where the tune's phrases START: not always on beat 1
    ents = []
    prev_end = -99.0
    for r in body:
        for a, m, d in r["tune"]:
            g = r["beat"] + a
            if g - prev_end >= 1.0 - 1e-6:
                ents.append((r["k"], a))
            prev_end = max(prev_end, g + d)
    if len(ents) >= 4:
        on1 = sum(1 for _, a in ents if abs(a) < 1e-6)
        share = on1 / len(ents)
        add("tune-entries", share <= 0.7 + 1e-9, f"{on1}/{len(ents)}", "<= 70 % on beat 1",
            f"{on1} of the tune's {len(ents)} entries start on beat 1: start some on a pick-up or off the beat "
            "(write(..., pickup=1), .shift(0.5) or .shift(-1))" if share > 0.7 else
            f"{len(ents) - on1} of {len(ents)} tune entries start off the downbeat")
    # 6. the cell: the identical form at most 3 times in any 30 s, the same SHAPE (any key) at most
    # 2 times in any 20 s, the logo counted; under 20 s, at most 3 hearings in all
    cells = _signature_cells(rows, piece)
    worst, wf = window_count([(x[3], (x[1], x[2])) for x in cells], 30.0)
    add("cell-same-form", worst <= 3, worst, "<= 3 per 30 s",
        f"the 'you-co-ded' cell {'-'.join(nm(m) for m in wf[0])} is heard {worst} times in 30 s in the identical form"
        if worst > 3 else f"the cell is heard {len(cells)} times (the logo counted), never more than {worst} alike in 30 s")
    worst, wf = window_count([(x[3], x[2]) for x in cells], 20.0)
    if land < 20:
        add("cell-shape", len(cells) <= 3, len(cells), "<= 3 with the logo",
            f"the cell is heard {len(cells)} times in a {land:.0f} s film, the logo counted: one idea, said once or twice"
            if len(cells) > 3 else f"the cell is heard {len(cells)} times, the logo counted")
    else:
        add("cell-shape", worst <= 2, worst, "<= 2 per 20 s in one rhythm",
            f"the cell in one rhythm {wf} is heard {worst} times in 20 s (in any key): change its rhythm, direction or "
            "place in the bar" if worst > 2 else f"the cell's rhythm changes (at most {worst} alike in 20 s)")
    bar1 = tuple((float(b), note(n)) for b, n, _ in T.BAR_NOTES[1])
    n_open = sum(1 for r in body if r["tune_fp"] == bar1)
    lim = 0 if land < 20 else max(1, int(round(land / 30)))
    add("opening-statements", n_open <= lim, n_open, f"<= {lim}",
        f"the tune's opening bar is played exactly as written {n_open} times (limit {lim} for a {land:.0f} s piece)")
    if land >= 8:
        body_cells = [x for x in cells if not rows[x[0] - 1]["ending"]]
        add("cell-present", len(body_cells) >= 1 or n_open >= 1, len(body_cells), ">= 1",
            "the 'you-co-ded' cell is heard in the score before the logo" if body_cells else
            "the 'you-co-ded' cell is never heard before the logo: the score does not sound like ours")
    # ------------------------------------------------------------------ development
    # 7. something new at least every 8 seconds. Round 7: a tune bar is new only if its SHAPE is
    # new (moving a bar up a step is not new), and an accompaniment rhythm is new only if it is
    # not part of one already heard (a viola switched off is not a new rhythm)
    seen_s, seen_c, seen_b = set(), set(), []
    run_s, best, at, newk = 0.0, 0.0, None, 0
    for r in body:
        br = frozenset(r["back_rhythm"])
        new_t = r["shape"] is not None and r["shape"] not in seen_s
        new_c = tuple(r["chords"]) not in seen_c
        new_b = bool(br) and not any(br <= x for x in seen_b)
        if r["shape"] is not None:
            seen_s.add(r["shape"])
        seen_c.add(tuple(r["chords"]))
        if br:
            seen_b.append(br)
        r["new"] = "".join(x for x, f in (("t", new_t), ("c", new_c), ("b", new_b)) if f)
        newk += bool(new_t)
        run_s = 0.0 if r["new"] else run_s + (r["t1"] - r["t0"])
        if run_s > best:
            best, at = run_s, r["k"]
    add("nothing-new", best <= 8.0 + 1e-6, round(best, 1), "<= 8 s",
        f"{best:.1f} s pass with nothing new (no new tune shape, chord or accompaniment rhythm), ending at bar {at}"
        if best > 8 else f"something new at least every {max(best, bar_s):.1f} s")
    # warning: a new tune SHAPE in too few bars (the surface changes, the gestures do not)
    if len(tb) >= 6:
        share = newk / len(tb)
        add("new-shapes", share >= 0.4, f"{100 * share:.0f} %", ">= 40 % of tune bars", (
            f"only {newk} of {len(tb)} tune bars bring a shape not heard before: the gestures repeat under changing "
            "surfaces" if share < 0.4 else f"{newk} of {len(tb)} tune bars bring a new shape"), level="warn")
    # 8. the accompaniment keeps developing: within any 6 bars it plays at least one rhythm it has
    # not played (nor a fuller version of) in the 8 bars before
    run, best, wk = 0, 0, None
    for i, r in enumerate(body):
        br = frozenset(r["back_rhythm"])
        recent = [frozenset(x["back_rhythm"]) for x in body[max(0, i - 8): i]]
        run = run + 1 if (i and any(br <= x for x in recent)) else 0
        if run > best:
            best, wk = run, r["k"]
    add("backing-static", best <= 6, best, "<= 6 bars",
        f"for {best} bars (to bar {wk}) the accompaniment plays only rhythms it played (or a thinner copy of) in the "
        "8 bars before" if best > 6 else f"the accompaniment brings something new within every {best + 1} bars")
    # 9. the tune breathes: at least one bar in every 8 with no tune note starting
    if len(body) >= 8:
        bad = [body[i]["k"] for i in range(len(body) - 7) if all(r["tune_fp"] for r in body[i:i + 8])]
        add("tune-breath", not bad, len(bad), "0 windows",
            f"8 bars running with the tune never resting (starting at bars {bad[:6]})" if bad else
            "the tune rests at least one bar in every 8")
    # ------------------------------------------------------------------ harmony and bass
    chords = [c for r in body for c in r["chords"]]
    distinct = len(set(chords))
    need = min(7, 3 + int(land // 15))
    add("chords-distinct", distinct >= need, distinct, f">= {need}",
        f"{distinct} different chords ({', '.join(sorted(set(chords)))})")
    loop = 0
    cur = 0
    for i, r in enumerate(body):
        cur = cur + 1 if i >= 4 and r["chords"] == body[i - 4]["chords"] else 0
        loop = max(loop, cur)
    add("chord-loop", loop <= 4, loop, "<= 4 bars",
        f"the chords repeat the bars four back for {loop} bars running (a loop)" if loop > 4 else
        "the progression never loops more than once")
    # 10. harmonic rhythm both ways (round 7: 23 of 27 bars changed chord exactly on the bar line).
    # No more than 12 bars running of one new chord per bar; in a piece over 30 s, at least one
    # chord held across a bar line (or a pedal) per 30 s
    run, worst, wk = 0, 0, None
    prev = None
    held = 0
    for r in body:
        if len(r["chords"]) == 1 and prev is not None and r["chords"][0] != prev:
            run += 1
        else:
            run = 0
        if len(r["chords"]) >= 1 and prev is not None and r["chords"][0] == prev:
            held += 1
        if run > worst:
            worst, wk = run, r["k"]
        prev = r["chords"][-1]
    pedals = sum(1 for p in plans[:-1] if isinstance(getattr(p.sec, "bass", None), str) and p.sec.bass.startswith("pedal:"))
    want = int(land // 30)
    ok = worst <= 12 and (held + pedals) >= want
    add("harmonic-rhythm", ok, f"{worst}/{held + pedals}", f"<= 12 bars of one chord a bar; >= {want} held/pedal",
        (f"{worst} bars running each change chord exactly on the bar line (to bar {wk}): hold one across a bar, or put "
         "two in a bar" if worst > 12 else "") +
        (("; " if worst > 12 else "") + f"no chord is held across a bar line ({held + pedals}, want {want} in "
         f"{land:.0f} s): a held chord or a pedal is how a score breathes" if held + pedals < want else "")
        if not ok else f"the chords change at different speeds (longest run of one chord a bar: {worst} bars; "
                       f"{held} held across a bar line, {pedals} pedal sections)")

    def moving(r):
        roots = {root_pc(c) for c in r["chords"]}
        return any(m % 12 not in roots for m in r["bass"])
    # 11. the bass moves: in every 8 bars at least one bass note that is not the chord's ROOT (an
    # inversion now counts, as the guide always said)
    if len(body) >= 8:
        bad = [body[i]["k"] for i in range(len(body) - 7) if not any(moving(r) for r in body[i:i + 8])]
        add("bass-moves", not bad, len(bad), "0 windows",
            f"the bass plays only chord roots for 8 bars running (from bars {bad[:6]})" if bad else
            "the bass leaves the root (inversion, passing note or pedal) at least once in every 8 bars")
    # 12. tune notes that clash with a borrowed chord
    clash = []
    for r in body:
        for a, m, _ in r["tune"]:
            c = r["chords"][0] if (len(r["chords"]) == 1 or a < 2) else r["chords"][1]
            if m % 12 in T.CLASH.get(c, set()):
                clash.append((r["k"], nm(m), c))
    add("clashes", not clash, len(clash), "0",
        f"tune notes against a borrowed chord's new note: {clash[:5]}" if clash else "no tune note clashes with its chord")
    # 13. held and backing notes that ring INTO a chord a semitone away (round 7: a viola B3 held
    # under the new B-flat 3; a D3 under E-flat 3 at a turn). A chromatic step is cut at the bar line.
    changes = []
    for r in rows:
        changes.append((r["beat"], r["chords"][0]))
        if len(r["chords"]) == 2:
            changes.append((r["beat"] + 2.0, r["chords"][1]))
    rub = []
    for e in band.log:
        if e["bus"] not in ("bowed", "counter", "answer"):
            continue
        s0, s1 = e["beat"], e["beat"] + e["dur"] - 0.15
        for b, c in changes:
            if s0 + 0.05 < b < s1:
                tones = T.CHORD_TONES.get(c, set())
                pc = e["m"] % 12
                if pc not in tones and any((pc - x) % 12 in (1, 11) for x in tones):
                    rub.append((round(e["t"], 2), nm(e["m"]), c))
    add("held-clash", not rub, len(rub), "0",
        f"{len(rub)} held notes ring into a chord a semitone away (e.g. {rub[:4]}): end them at the change" if rub else
        "no held note rubs a semitone against the next chord")
    # ------------------------------------------------------------------ the peak
    # WHY the ending bar too (round 7): two films had their real top note (C6) in the ending's sigh,
    # and the check, looking only at the body, reported a lower note as "saved for the peak"
    tops = [(r["t0"] + a * (r["t1"] - r["t0"]) / r["blen"], m) for r in rows for a, m, _ in r["tune"]]
    if piece.peak is None:
        add("peak-named", land < 12, None, "Piece.peak",
            "no peak named (set Piece.peak to the second of the climax)" if land >= 12 else "short piece: the logo is the peak")
    elif tops:
        hi = max(m for _, m in tops)
        first = min(t for t, m in tops if m == hi)
        ok = first >= piece.peak - bar_s - 0.05
        where = "in the ending" if first >= rows[-1]["t0"] - 1e-3 else f"at {first:.1f} s"
        add("peak-saved", ok, round(first, 2), f">= {piece.peak - bar_s:.1f} s",
            f"the tune's highest note ({nm(hi)}) is first heard at {first:.1f} s, before the peak at {piece.peak:.1f} s"
            if not ok else f"the highest note ({nm(hi)}) is saved for the peak ({where})")
        before = [m for t, m in tops if t < piece.peak - bar_s - 0.05]
        if before:
            ceil = max(before)
            add("peak-margin", hi - ceil >= 3, f"{nm(ceil)}->{nm(hi)}", ">= a minor third",
                f"the tune reaches {nm(ceil)} before the peak and only {nm(hi)} at it: the climb to the top is a "
                f"{hi - ceil}-semitone step; keep earlier lines a third or more below" if hi - ceil < 3 else
                f"earlier lines stay at or below {nm(ceil)}; the peak reaches {nm(hi)}", level="warn")
        # the ARRIVAL: the first tune note at the peak does not fall more than a fourth from the note
        # before it (round 7: an A-flat fell a seventh onto the climax's downbeat)
        seq = sorted(tops)
        after = [i for i, (t, _) in enumerate(seq) if t >= piece.peak - 0.06]
        if after and after[0] > 0:
            i = after[0]
            drop = seq[i - 1][1] - seq[i][1]
            add("peak-arrival", drop <= 5, drop, "falls <= a fourth",
                f"the tune falls {drop} semitones ({nm(seq[i - 1][1])} to {nm(seq[i][1])}) onto the peak: arrive from below "
                "or by step" if drop > 5 else f"the tune arrives at the peak on {nm(seq[i][1])} from {nm(seq[i - 1][1])}")
        # the DROP before the lift (pieces of 20 s or more): somewhere in the two bars before the
        # peak, half a bar with at most two instrument groups sounding (air and doublings aside)
        if land >= 20:
            pk = peak_row(rows, piece.peak)
            if pk:
                i = rows.index(pk)
                cands = []
                for r in rows[max(0, i - 2): i]:
                    for h in (0.0, 1.0, 2.0):
                        bs = sounding_buses(band, r["beat"] + h, r["beat"] + h + 2.0)
                        cands.append((len(bs), r["k"], h, bs))
                if cands:
                    n_, k_, h_, bs_ = min(cands)
                    add("drop-real", n_ <= 2, n_, "<= 2 groups for half a bar",
                        f"the thinnest half bar before the peak still has {n_} groups sounding ({', '.join(bs_)}, bar {k_}): "
                        "the peak must arrive out of space" if n_ > 2 else
                        f"the drop: bar {k_} beat {h_ + 1:g} thins to {', '.join(bs_) or 'silence'}")
    # 14. the settle: the bar before the ending is not the busiest of the piece (over 20 s)
    if land >= 20 and len(body) >= 4:
        busiest = max(r["n"] for r in body)
        add("settle", body[-1]["n"] < busiest or busiest == 0, body[-1]["n"], f"< {busiest}",
            f"the last bar before the ending is the busiest of the piece ({body[-1]['n']} notes): thin it so the logo "
            "lands into space" if body[-1]["n"] >= busiest else f"the music settles before the logo ({body[-1]['n']} "
            f"notes against {busiest} at the busiest)")
    # ------------------------------------------------------------------ voices
    # 15. the answer listens
    lead_on = [n["beat"] for r in rows for n in r["notes"] if n["cls"] == "tune"]
    ans = [n for r in rows for n in r["notes"] if n["cls"] == "answer" and not r["ending"]]
    hits = [round(a["t"], 2) for a in ans if any(abs(a["beat"] - b) < 0.06 for b in lead_on)]
    add("answer-collisions", not hits, len(hits), "0",
        f"{len(hits)} answer notes start together with a tune note (at {hits[:6]} s)" if hits else
        f"the answer never talks over the tune ({len(ans)} answer notes)")
    # 16. the tune is the TOP voice: no backing note above a tune note as it starts (the air
    # line above C6 aside). Round 7: a held viola C4 sounded above a tune B-flat 3.
    over = []
    lead = [e for e in band.log if e["role"] == "lead" and e["beat"] < rows[-1]["beat"]]
    for e in lead:
        for x in band.log:
            if x["bus"] in ("air", "lead", "sing", "double", "sub") or x["role"] in ("lead", "double"):
                continue
            if x["beat"] <= e["beat"] + 0.02 and x["beat"] + x["dur"] > e["beat"] + 0.05 and x["m"] > e["m"]:
                over.append((round(e["t"], 2), nm(e["m"]), x["bus"], nm(x["m"])))
                break
    add("top-voice", not over, len(over), "0",
        f"{len(over)} tune notes start under a backing note above them (e.g. {over[:3]}): move the tune up or the "
        "backing down" if over else "the tune is the top voice at every note")
    # 17. clutter: one pitch struck in four or more parts at once
    groups = {}
    for e in band.log:
        if e["beat"] >= rows[-1]["beat"]:
            continue
        groups.setdefault((round(e["beat"] * 8) / 8, e["m"]), set()).add((e["bus"], e["part"]))
    pile = [(k[0], nm(k[1]), len(v)) for k, v in groups.items() if len(v) >= 4]
    add("clutter", not pile, len(pile), "0",
        f"{len(pile)} times one pitch is struck by 4 or more parts at once (e.g. beat {pile[0][0]}, {pile[0][1]}): "
        "thin the doublings" if pile else "no pitch is piled up in four parts")
    # 18. blends hand over, they do not pile up (round 7: measured against the busier of the
    # outgoing section and the first FOUR bars of the incoming one, so a thin opening section no
    # longer fails every blend out of it)
    worst = 0.0
    wk = None
    for p in plans[:-1]:
        bl = [r for r in body if r["plan"] == p.i and r["blend"]]
        if not bl:
            continue
        before = [r["n"] for r in body if r["plan"] == p.i and not r["blend"]]
        after = [r["n"] for r in rows if r["plan"] == p.i + 1][:4]
        ref = max(np.median(before) if before else 0, np.median(after) if after else 0, 1)
        for r in bl:
            if r["n"] / ref > worst:
                worst, wk = r["n"] / ref, r["k"]
    add("blend-pileup", worst <= 1.2, round(worst, 2), "<= 1.2x",
        f"bar {wk} (a blend) has {worst:.2f}x the notes of the music either side: two accompaniments piled up"
        if worst > 1.2 else "every blend hands over without piling up")
    # ------------------------------------------------------------------ tempo
    tm = plans[0].tm
    end_beat = plans[-1].beat0 + plans[-1].blen
    worst, wb = 0.0, None
    allowed = set()
    for p in plans[:-1]:
        if p.into in ("hold", "breath") or getattr(p.sec, "broaden", 0):
            allowed.add(round(p.beat1))
    pk_beat = None
    if piece.peak is not None:
        pk_beat = min(range(0, int(end_beat) + 1), key=lambda b: abs(tm.seconds(b) - piece.peak))
    peak_step = 0.0
    for b in range(1, int(end_beat)):
        a0, a1 = tm.bpm_at(b - 1e-6), tm.bpm_at(b + 1e-6)
        st = abs(a1 / a0 - 1)
        if b == pk_beat:
            peak_step = st
        if st > worst and b not in allowed:
            worst, wb = st, b
    t_w = tm.seconds(wb) if wb is not None else 0
    # WHY 0.5 % at the peak (round 7): a 1.7 % step passed and landed exactly on the climax's
    # downbeat; a lurch is most audible where everything arrives
    ok = worst <= 0.02 + 1e-9 and peak_step <= 0.005 + 1e-9
    add("tempo-steps", ok, round(100 * max(worst, peak_step), 1), "<= 2 % (0.5 % on the peak)",
        (f"the speed jumps {100 * worst:.1f} % at {t_w:.2f} s (beat {wb}); leave ending_start unpinned or change a bar count"
         if worst > 0.02 else f"the speed steps {100 * peak_step:.1f} % on the peak's downbeat: pin only land, or move the "
         "speed change a bar earlier") if not ok else "no sudden change of speed")
    moved = [(p.sec.label or p.sec.mood, round(100 * (p.bpm / p.nominal_bpm - 1), 1)) for p in plans[:-1]]
    far = [m for m in moved if abs(m[1]) > 6.0]
    add("tempo-fit", not far, max((abs(m[1]) for m in moved), default=0.0), "<= 6 %",
        "sections pushed far from their own speed to fit the picture: " + ", ".join(f"{a} {b:+.1f} %" for a, b in far) +
        " (change a bar count, the bpm, or add a hold)" if far else "every section within 6 % of its own speed")
    # ------------------------------------------------------------------ layers
    idle = [f"'{l}' in {p.sec.label or p.sec.mood}" for p in plans[:-1] for l in p.sec.add if l in IDLE and IDLE[l](p)]
    add("idle-layers", not idle, len(idle), "0",
        "switched on but never played: " + ", ".join(idle) if idle else "every layer switched on is heard")
    # ------------------------------------------------------------------ the picture (warning)
    pic = getattr(piece, "_picture", None)
    if pic:
        ev = sorted({round(tm.seconds(r["beat"]), 3) for r in rows} |
                    {round(n["t"], 3) for r in rows for n in r["notes"] if n["cls"] == "tune"})
        near = []
        for t, what in pic:
            if t <= 0.05 or t >= piece.length - 0.05:
                continue
            d = min((abs(t - e) for e in ev), default=9.0)
            if 0.04 <= d <= 0.15:
                near.append(f"{what} {t:g} s ({1000 * d:.0f} ms)")
        add("picture-sync", not near, len(near), "on (<40 ms) or clearly off (>150 ms)",
            "near misses between picture and music (an exact hit or a clear gap reads better): " + "; ".join(near[:6])
            if near else "every picture moment is either hit or clearly left alone", level="warn")
    # ------------------------------------------------------------------ a narrator
    if piece.speech:
        mel = [n for r in rows for n in r["notes"] if n["cls"] in ("tune", "answer", "counter")]
        bad = [(round(n["t"], 2), nm(n["m"])) for n in mel if VOICE_RANGE[0] <= n["m"] <= VOICE_RANGE[1]
               and any(t0 <= n["t"] <= t1 for t0, t1 in piece.speech)]
        add("voice-room", not bad, len(bad), "0",
            f"{len(bad)} melody notes in the narrator's range start while she speaks (e.g. {bad[:5]})" if bad else
            "melody in her range only in her pauses")
        talk = sum(t1 - t0 for t0, t1 in piece.speech)
        ons = {round(e["t"] / 0.03) for e in band.log if any(t0 <= e["t"] <= t1 for t0, t1 in piece.speech)}
        rate = len(ons) / max(talk, 1e-6)
        add("voice-busy", rate <= 4.0, round(rate, 1), "<= 4 onsets/s",
            f"{rate:.1f} separate attacks a second under her words (too busy to listen through)" if rate > 4 else
            f"{rate:.1f} attacks a second under her words")
        # the speech map covers every word she says inside the piece (round 7: a map that stopped
        # early was the only reason two voice checks passed)
        src = getattr(piece.speech, "source", None)
        if src:
            import json
            path, t_from, t_to, start_at = src
            end_file = t_from + (piece.length - start_at)
            missed = [w for w in json.load(open(path)) if w["start"] >= t_to and w["start"] < end_file]
            add("speech-covers", not missed, len(missed), "0 words left out",
                f"{len(missed)} of her words fall inside the piece but outside the speech map (from "
                f"'{missed[0]['w']}' at piece {missed[0]['start'] - t_from + start_at:.2f} s): map her real words to the "
                "piece's end, never fade her out to make room" if missed else "the speech map covers every word inside the piece")
    return out


# ====================================================================== audio checks


def _bar_levels(y, rows, lo=None, hi=None):
    import measure as M
    x = y
    if lo or hi:
        from dsp import butter
        x = butter(y.mean(axis=1), "bandpass", [lo, hi], 4)[:, None] * np.ones((1, 2))
    k = M._kw(x) ** 2
    out = []
    for r in rows:
        a, b = int(r["t0"] * SR), int(min(r["t1"], len(k) / SR) * SR)
        out.append(-0.691 + 10 * math.log10(2 * float(np.mean(k[a:b])) + 1e-12) if b > a else -99.0)
    return out


def _low_share(y, rows, cut=150.0):
    m = y.mean(axis=1)
    out = []
    for r in rows:
        seg = m[int(r["t0"] * SR): int(r["t1"] * SR)]
        if len(seg) < 2048:
            out.append(0.0)
            continue
        P = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
        f = np.fft.rfftfreq(len(seg), 1 / SR)
        out.append(float(P[(f > 20) & (f < cut)].sum() / (P[f > 20].sum() + 1e-30)))
    return out


def _chroma(y, rows):
    m = y.mean(axis=1)
    out = []
    for r in rows:
        seg = m[int(r["t0"] * SR): int(r["t1"] * SR)]
        if len(seg) < 4096:
            out.append(np.zeros(12))
            continue
        n = 8192
        frames = [seg[i:i + n] * np.hanning(n) for i in range(0, len(seg) - n, n // 2)] or [np.pad(seg, (0, n - len(seg)))]
        P = np.mean([np.abs(np.fft.rfft(f)) for f in frames], axis=0)
        f = np.fft.rfftfreq(n, 1 / SR)
        sel = (f > 60) & (f < 4000)
        pcs = (np.round(12 * np.log2(f[sel] / 440.0)) + 9) % 12
        c = np.bincount(pcs.astype(int), weights=P[sel], minlength=12)
        out.append(c / (np.linalg.norm(c) + 1e-12))
    return out


def peak_row(rows, peak):
    """The bar the peak names: the bar starting within 0.1 s of it (a peak pinned on a bar line
    must not fall into the bar before by a rounding error), else the bar containing it."""
    near = [r for r in rows if abs(r["t0"] - peak) <= 0.1]
    if near:
        return min(near, key=lambda r: abs(r["t0"] - peak))
    inside = [r for r in rows if r["t0"] <= peak < r["t1"]]
    return inside[0] if inside else None


def _spoken(r, speech):
    return sum(max(0.0, min(r["t1"], b) - max(r["t0"], a)) for a, b in speech) / max(r["t1"] - r["t0"], 1e-6)


def audio(y, band, plans, piece, rows=None):
    import measure as M
    rows = rows or bar_table(band, plans, piece)
    lv = _bar_levels(y, rows)
    ph = _bar_levels(y, rows, 300, 8000)
    low = _low_share(y, rows)
    for r, l, p_, w in zip(rows, lv, ph, low):
        r["lufs"] = round(l, 1)
        r["phone"] = round(p_, 1)
        r["low"] = round(100 * w)
    body = [r for r in rows if not r["ending"]]
    out = []

    def add(cid, ok, value, limit, why, level="fail"):
        out.append(dict(id=cid, ok=bool(ok), value=value, limit=limit, why=why, level=level))
    # WHY every bar now (was body[1:]): a 3-bar film's range then came from two bars, which pushed
    # the composer to carve a valley instead of shaping the whole piece (own, round 7)
    lvb = [r["lufs"] for r in body]
    rng = max(lvb) - min(lvb) if lvb else 0.0
    need = 4.0 if piece.land_time() >= 20 else 3.0
    add("loudness-range", need - 1e-6 <= rng <= 14.0, round(rng, 1), f"{need:g}-14 dB",
        f"bar loudness moves only {rng:.1f} dB across the piece (flat)" if rng < need else
        (f"bar loudness moves {rng:.1f} dB (too wide: a jolt)" if rng > 14 else
         f"bar loudness moves {rng:.1f} dB across the piece"))
    # PLATEAU (round 7): no 16 s whose bars all sit within 1.5 dB, unless she is speaking over it.
    # WHY: a 6 dB range passed while two passages sat within 1.4 dB of each other for 32 s.
    # Measured on two-bar averages (energy), so a strict loud/soft alternation from bar to bar
    # (a rest bar, then a full one, over and over) is read as the plateau it is.
    sm = {}
    for i, r in enumerate(body):
        pair = [x["lufs"] for x in body[i:i + 2]]
        sm[r["k"]] = 10 * math.log10(np.mean([10 ** (x / 10) for x in pair]))
    run, best, at = [], 0.0, None
    for r in body:
        if piece.speech and _spoken(r, piece.speech) > 0.5:
            run = []
            continue
        run.append(r)
        while run and max(sm[x["k"]] for x in run) - min(sm[x["k"]] for x in run) > 1.5:
            run.pop(0)
        span = run[-1]["t1"] - run[0]["t0"] if run else 0.0
        if span > best:
            best, at = span, (run[0]["k"], run[-1]["k"])
    add("plateau", best <= 16.0 + 1e-6, round(best, 1), "<= 16 s within 1.5 dB",
        f"bars {at[0]}-{at[1]} ({best:.1f} s) stay within 1.5 dB of each other (two-bar averages): a turn must change "
        "the level (about 2 dB) or the register" if best > 16 else f"the longest level plateau is {best:.1f} s")
    if piece.peak is not None:
        pk = peak_row(rows, piece.peak)
        if pk:
            i = rows.index(pk)
            nb = 4 if piece.land_time() >= 15 else 2
            before = [r["lufs"] for r in rows[max(0, i - nb): i]]
            at_ = [r["lufs"] for r in rows[i: i + 2]]
            # energy averages, not dB averages: loud moments dominate as they do for a listener
            e = lambda xs: 10 * math.log10(np.mean([10 ** (x / 10) for x in xs]))
            rise = e(at_) - e(before) if before and at_ else 0.0
            add("payoff-louder", rise >= 2.0, round(rise, 1), ">= 2 dB",
                f"the peak bars are {rise:+.1f} dB against the {len(before)} bars before (they must arrive, not fade in)"
                if rise < 2 else f"the peak arrives {rise:+.1f} dB above what led to it")
            loud = max(body + [r for r in rows if r["ending"]], key=lambda r: r["lufs"])
            ok = rows[i]["t0"] - 2.5 <= loud["t0"] <= rows[i]["t0"] + 2 * (rows[i]["t1"] - rows[i]["t0"]) + 0.01 \
                or loud["ending"]
            add("peak-loudest", ok, loud["k"], f"bars {rows[i]['k'] - 1}-{rows[i]['k'] + 2} or the logo",
                f"the loudest bar is bar {loud['k']} ({loud['t0']:.1f} s), not at the peak ({piece.peak:.1f} s)" if not ok
                else f"the loudest bar is bar {loud['k']} ({loud['t0']:.1f} s)")
            # the logo in a SUBTLE film (loudness -16.5 or quieter) lands no louder than the peak + 1 dB
            if getattr(piece, "loudness", -14.0) <= -16.5 and getattr(piece, "logo", "blend") != "none":
                land = piece.land_time()
                k = M._kw(y) ** 2
                a, b = int(land * SR), int(min(land + 1.0, len(k) / SR) * SR)
                ll = -0.691 + 10 * math.log10(2 * float(np.mean(k[a:b])) + 1e-12)
                pk_l = max(at_)
                add("logo-gentle", ll <= pk_l + 1.0, round(ll - pk_l, 1), "<= +1 dB over the peak",
                    f"the logo's first second is {ll - pk_l:+.1f} dB against the peak bar in a subtle film: use logo='quiet'"
                    if ll > pk_l + 1.0 else f"the logo lands {ll - pk_l:+.1f} dB against the peak")
    # under a narrator, the level only rises bar to bar where a swell is planned (> 1.5 dB fails)
    if piece.speech:
        sp = [r for r in body if _spoken(r, piece.speech) > 0.5]
        jumps = [(b["k"], round(b["lufs"] - a["lufs"], 1)) for a, b in zip(sp, sp[1:])
                 if b["k"] == a["k"] + 1 and b["lufs"] - a["lufs"] > 1.5]
        add("voice-steady", not jumps, len(jumps), "<= +1.5 dB bar to bar",
            f"the music rises under her words: {jumps[:4]} (bar, dB): swell in her pauses or after she stops" if jumps
            else "the music under her words never rises more than 1.5 dB from one bar to the next")
    # short films: the 400 ms curve shows what bar averages hide (warning)
    tt, mv = M.momentary(y)
    sel = tt < piece.land_time()
    if sel.sum() > 6:
        v = mv[sel]
        rise = max((float(v[j] - v[i]) for i in range(len(v)) for j in range(i + 1, min(len(v), i + 6))), default=0.0)
        add("momentary-rise", rise <= 6.0 or getattr(piece, "loudness", -14.0) > -16.5, round(rise, 1),
            "<= 6 dB in 0.5 s (subtle films)",
            f"the music rises {rise:.1f} dB within half a second (momentary range {float(np.percentile(v, 95) - np.percentile(v, 5)):.1f} dB)",
            level="warn")
    # phones: weight below 150 Hz in the opening bars (warning)
    heavy = [(r["k"], r["low"]) for r in body[:2] if r["low"] > 45]
    add("phone-low", not heavy, len(heavy), "<= 45 % of a bar's energy below 150 Hz (first 2 bars)",
        f"the opening is bottom-heavy on a phone: {heavy} (bar, % below 150 Hz)" if heavy else
        "the opening carries above 150 Hz", level="warn")
    ch = _chroma(y, rows)
    best, cur, at = 0.0, 0.0, None
    for i, r in enumerate(body):
        sim = max((float(ch[i] @ ch[j]) for j in range(i)), default=0.0)
        r["sim"] = round(sim, 3)
        cur = cur + (r["t1"] - r["t0"]) if sim >= SIM_COPY else 0.0
        if cur > best:
            best, at = cur, r["k"]
    add("audio-nothing-new", best <= 12.0, round(best, 1), "<= 12 s",
        f"{best:.1f} s where every bar sounds like a copy ({SIM_COPY}) of an earlier one (ending at bar {at})" if best > 12 else
        f"the sound renews itself (longest near-copy stretch {best:.1f} s at {SIM_COPY})")
    return out


# ====================================================================== text


def table_text(rows, piece):
    au = "lufs" in rows[0]
    L = [f"NOTES: {piece.name}  ({len(rows)} bars; the last is the ending bar with the logo)",
         "bar  time    section                  chords            tune (beat:note)                                 "
         "answer/counter          bass          notes  back  parts         new" + ("  LUFS  phone low%  sim" if au else "")]
    codes = {}
    for r in rows:
        code = codes.setdefault(r["back_rhythm"], "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[len(codes) % 26] + ("" if len(codes) < 26 else str(len(codes) // 26)))
        tune = " ".join(f"{a:g}:{nm(m)}" for a, m, _ in r["tune"]) or "-"
        other = " ".join(f"{n['rel']:g}:{nm(n['m'])}{'a' if n['cls'] == 'answer' else 'c'}" for n in sorted(
            (n for n in r["notes"] if n["cls"] in ("answer", "counter")), key=lambda n: n["rel"])) or "-"
        bass = " ".join(nm(m) for m in r["bass"]) or "-"
        parts = "".join(sorted(PART_LETTER.get(b, "?") for b, f in r.get("sounding", {}).items() if f >= 0.5))
        new = r.get("new", "")
        new = ("NEW " + new) if new else ""
        line = (f"{r['k']:>3}  {r['t0']:6.2f}  {r['sec'][:24]:<24} {'/'.join(r['chords']):<17} {tune[:48]:<48} "
                f"{other[:23]:<23} {bass[:13]:<13} {r['n']:>5}  {code:<4}  {parts:<12}  {new:<7}")
        if au:
            line += f"  {r['lufs']:5.1f}  {r['phone']:5.1f} {r['low']:>4}  {r.get('sim', '')}"
        L.append(line)
    L.append("back = the accompaniment's rhythm (same letter = identical rhythm); a = answer note, c = counter-line note")
    L.append("parts = groups sounding at least half the bar: L tune piano, V violin tune, D doubling, A answer, C counter, "
             "P piano accompaniment, Z plucked strings, H held strings, R air, Y synth, S sub")
    L.append("new = what is new in the bar: t a tune SHAPE not heard before, c a chord (pair), b an accompaniment rhythm")
    if au:
        L.append("LUFS = the bar's loudness; phone = the same in 300 Hz-8 kHz (what a phone plays); low% = energy below "
                 f"150 Hz; sim = pitch-content similarity to the closest earlier bar (near copy at {SIM_COPY})")
    return L


def verdict_text(name, results):
    bad = [r for r in results if not r["ok"] and r.get("level", "fail") == "fail"]
    warn = [r for r in results if not r["ok"] and r.get("level") == "warn"]
    L = [f"{'PASS' if not bad else 'FAIL'}  composition of {name}: " +
         ("every composing rule kept" if not bad else f"{len(bad)} rule(s) broken: " + ", ".join(r["id"] for r in bad)) +
         (f"; {len(warn)} warning(s): " + ", ".join(r["id"] for r in warn) if warn else "")]
    for r in results:
        tag = "ok  " if r["ok"] else ("FAIL" if r.get("level", "fail") == "fail" else "warn")
        L.append(f"   {tag} {r['id']:<20} {str(r['value']):>7} (limit {r['limit']}): {r['why']}")
    L.append("   (the checks are the floor, not the goal: read the bar table and the note log)")
    return L
