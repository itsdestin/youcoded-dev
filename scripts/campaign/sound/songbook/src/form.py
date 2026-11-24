"""COMPOSITION CHECKS and THE NOTE DUMP (added 2026-11-23).

WHY: the old checks measured only the mix (loudness, peaks, the tune on top, noisy attacks).
"Make it mine" passed every one of them while being one four-bar loop played for 54 s: its
opening bar seven times, one chord loop for 40 s, no bar where the tune rested, its highest note
given away at 2.5 s and its payoff quieter than the bar before it. Nobody here can listen, so
every rule in SONGBOOK.md's "Composing a score" chapter is turned into a number and a limit
here, and a piece that breaks one FAILS with a plain sentence saying where.

Two halves:
  * from the NOTES the score plays (Band.log; no audio needed, so `render.sh --notes` runs them
    in about a second): repetition, development, harmony, bass, breath, peak placement, the
    answer listening, blends, tempo steps, idle layers, room for a narrator;
  * from the AUDIO (after a render): loudness per bar (range, the payoff louder than what led to
    it) and how often a bar's sound is a near copy of an earlier one.
"""
import math
from collections import Counter

import numpy as np

import tune as T
from dsp import SR, note

NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
VOICE_RANGE = (53, 76)   # F3-E5: a speaking voice's pitch and its strongest overtones (see SONGBOOK)


def nm(m):
    return f"{NAMES[int(m) % 12]}{int(m) // 12 - 1}"


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


def bar_table(band, plans, piece):
    """One row per bar (the ending bar last), built from every note the score placed."""
    rows = []
    for p in plans:
        for j, b in enumerate(p.bars):
            rows.append(dict(k=len(rows) + 1, sec=("ending" if p.ending else (p.sec.label or p.sec.mood)),
                             plan=p.i, j=j, beat=b.beat, t0=p.tm.seconds(b.beat), t1=p.tm.seconds(b.beat + 4),
                             chords=list(b.chords), ending=p.ending, notes=[], blend=False))
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
            if rows[i]["ending"] and e["beat"] - rows[i]["beat"] >= 4 - 1e-6:
                continue                     # the logo and its ringing chord: not a bar of the score
            rows[i]["notes"].append(dict(e, rel=round(e["beat"] - rows[i]["beat"], 3), cls=_cls(e)))
    for r in rows:
        ns = r["notes"]
        tune = sorted((n["rel"], n["m"], round(n["dur"], 2)) for n in ns if n["cls"] == "tune" and n["role"] == "lead")
        r["tune"] = tune
        r["tune_fp"] = tuple((a, m) for a, m, _ in tune)
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
    return rows


# ====================================================================== symbolic checks


def _signature_cells(rows):
    """Every place the three-note "you-co-ded" shape is heard in the tune (a rise of a sixth, then
    a step down), in any key or octave: (bar, pitches, rhythm)."""
    seq = [(r["k"], r["beat"] + a, m, d) for r in rows if not r["ending"] for a, m, d in r["tune"]]
    out = []
    for i in range(len(seq) - 2):
        a, b, c = seq[i], seq[i + 1], seq[i + 2]
        if b[2] - a[2] in (8, 9) and c[2] - b[2] in (-1, -2):
            out.append((a[0], (a[2], b[2], c[2]), (round(b[1] - a[1], 2), round(c[1] - b[1], 2))))
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


IDLE = {   # a layer switched on by add= that this situation never plays
    "pizz": lambda p: p.accomp in ("bounce", "still"),
    "synth": lambda p: p.accomp in ("sparse", "still"),
    "answer": lambda p: p.voice == "violin",
    "octaves": lambda p: p.voice == "violin",
}


def symbolic(band, plans, piece, rows=None):
    """The checks that need only the notes. Returns a list of dicts: id, ok, value, limit, why."""
    rows = rows or bar_table(band, plans, piece)
    body = [r for r in rows if not r["ending"]]
    bar_s = _bar_s(rows)
    land = piece.land_time()
    out = []

    def add(cid, ok, value, limit, why):
        out.append(dict(id=cid, ok=bool(ok), value=value, limit=limit, why=why))

    # 1. no whole bar heard more than twice in the same form
    c = Counter(r["fp"] for r in body if r["n"])
    worst = max(c.values(), default=0)
    where = [r["k"] for r in body if c[r["fp"]] == worst] if worst > 2 else []
    add("bar-repeats", worst <= 2, worst, "<= 2",
        f"the same whole bar (tune, chords and accompaniment) is heard {worst} times (bars {where})" if worst > 2 else
        "no whole bar is heard more than twice")
    # 2. no tune bar more than twice in the same form
    c = Counter(r["tune_fp"] for r in body if r["tune_fp"])
    worst = max(c.values(), default=0)
    fp = max(c, key=c.get) if c else None
    where = [r["k"] for r in body if r["tune_fp"] == fp] if worst > 2 else []
    add("tune-bar-repeats", worst <= 2, worst, "<= 2",
        f"one bar of the tune is played {worst} times unchanged (bars {where})" if worst > 2 else
        "no bar of the tune is played more than twice unchanged")
    # 3. the opening stated in full: never in a film under 20 s (the logo is the statement), one per 30 s
    bar1 = tuple((float(b), note(n)) for b, n, _ in T.BAR_NOTES[1])
    n_open = sum(1 for r in body if r["tune_fp"] == bar1)
    lim = 0 if land < 20 else max(1, int(round(land / 30)))
    add("opening-statements", n_open <= lim, n_open, f"<= {lim}",
        f"the tune's opening bar is played exactly as written {n_open} times (limit {lim} for a {land:.0f} s piece)")
    # 4. the signature cell: the same form (pitch and rhythm) at most 3 times in any 30 s
    cells = _signature_cells(rows)
    tk = {r["k"]: r["t0"] for r in rows}
    worst, wf = 0, None
    for i, (k, pp, rr) in enumerate(cells):
        n = sum(1 for k2, p2, r2 in cells if (p2, r2) == (pp, rr) and 0 <= tk[k2] - tk[k] < 30.0)
        if n > worst:
            worst, wf = n, pp
    add("cell-same-form", worst <= 3, worst, "<= 3 per 30 s",
        f"the 'you-co-ded' cell {'-'.join(nm(m) for m in wf)} is heard {worst} times in 30 s in the identical form"
        if worst > 3 else f"the cell is heard {len(cells)} times, never more than {worst} alike in 30 s")
    if land >= 8:
        add("cell-present", len(cells) >= 1 or n_open >= 1, len(cells), ">= 1",
            "the 'you-co-ded' cell is heard in the score before the logo" if cells else
            "the 'you-co-ded' cell is never heard before the logo: the score does not sound like ours")
    # 5. something new at least every 8 seconds
    seen_t, seen_b, run_s, best, at = set(), set(), 0.0, 0.0, None
    for r in body:
        fam = (r["tune_fp"] in seen_t) and ((tuple(r["chords"]), r["back_rhythm"]) in seen_b)
        seen_t.add(r["tune_fp"])
        seen_b.add((tuple(r["chords"]), r["back_rhythm"]))
        run_s = run_s + (r["t1"] - r["t0"]) if fam else 0.0
        if run_s > best:
            best, at = run_s, r["k"]
    add("nothing-new", best <= 8.0 + 1e-6, round(best, 1), "<= 8 s",
        f"{best:.1f} s pass with nothing new (no new tune bar, chord or accompaniment rhythm), ending at bar {at}"
        if best > 8 else f"something new at least every {max(best, bar_s):.1f} s")
    # 6. the accompaniment keeps developing: within any 6 bars it plays at least one rhythm it has
    # not played in the 8 bars before (a drop, a fill, a thinner bar, a new pattern, a counter-line)
    run, best, wk = 0, 0, None
    for i, r in enumerate(body):
        recent = {x["back_rhythm"] for x in body[max(0, i - 8): i]}
        run = run + 1 if (i and r["back_rhythm"] in recent) else 0
        if run > best:
            best, wk = run, r["k"]
    add("backing-static", best <= 6, best, "<= 6 bars",
        f"for {best} bars (to bar {wk}) the accompaniment plays only rhythms it played in the 8 bars before" if best > 6 else
        f"the accompaniment brings something new within every {best + 1} bars")
    # 7. the tune breathes: at least one bar in every 8 with no tune note starting
    if len(body) >= 8:
        bad = [body[i]["k"] for i in range(len(body) - 7) if all(r["tune_fp"] for r in body[i:i + 8])]
        add("tune-breath", not bad, len(bad), "0 windows",
            f"8 bars running with the tune never resting (starting at bars {bad[:6]})" if bad else
            "the tune rests at least one bar in every 8")
    # 8. harmony: distinct chords, and no long literal loop
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
    # 9. the bass moves: in every 8 bars at least one bass note that is not the chord's root
    if len(body) >= 8:
        def moving(r):
            roots = {note(T.V[c]["root"]) % 12 for c in r["chords"]}
            return any(m % 12 not in roots for m in r["bass"])
        bad = [body[i]["k"] for i in range(len(body) - 7) if not any(moving(r) for r in body[i:i + 8])]
        add("bass-moves", not bad, len(bad), "0 windows",
            f"the bass plays only chord roots for 8 bars running (from bars {bad[:6]})" if bad else
            "the bass leaves the root (inversion, passing note or pedal) at least once in every 8 bars")
    # 10. the peak: named, and its top note saved for it
    tops = [(r["t0"] + a * (r["t1"] - r["t0"]) / 4, m) for r in body for a, m, _ in r["tune"]]
    if piece.peak is None:
        add("peak-named", land < 12, None, "Piece.peak",
            "no peak named (set Piece.peak to the second of the climax)" if land >= 12 else "short piece: the logo is the peak")
    elif tops:
        hi = max(m for _, m in tops)
        first = min(t for t, m in tops if m == hi)
        ok = first >= piece.peak - bar_s - 0.05
        add("peak-saved", ok, round(first, 2), f">= {piece.peak - bar_s:.1f} s",
            f"the tune's highest note ({nm(hi)}) is first heard at {first:.1f} s, before the peak at {piece.peak:.1f} s"
            if not ok else f"the highest note ({nm(hi)}) is saved for the peak ({first:.1f} s)")
    # 11. the answer listens
    lead_on = [n["beat"] for r in rows for n in r["notes"] if n["cls"] == "tune"]
    ans = [n for r in rows for n in r["notes"] if n["cls"] == "answer" and not r["ending"]]
    hits = [round(a["t"], 2) for a in ans if any(abs(a["beat"] - b) < 0.06 for b in lead_on)]
    add("answer-collisions", not hits, len(hits), "0",
        f"{len(hits)} answer notes start together with a tune note (at {hits[:6]} s)" if hits else
        f"the answer never talks over the tune ({len(ans)} answer notes)")
    # 12. blends hand over, they do not pile up
    worst = 0.0
    wk = None
    for p in plans[:-1]:
        bl = [r for r in body if r["plan"] == p.i and r["blend"]]
        if not bl:
            continue
        before = [r["n"] for r in body if r["plan"] == p.i and not r["blend"]]
        after = [r["n"] for r in rows if r["plan"] == p.i + 1][:2]
        ref = max(np.median(before) if before else 0, np.median(after) if after else 0, 1)
        for r in bl:
            if r["n"] / ref > worst:
                worst, wk = r["n"] / ref, r["k"]
    add("blend-pileup", worst <= 1.2, round(worst, 2), "<= 1.2x",
        f"bar {wk} (a blend) has {worst:.2f}x the notes of the music either side: two accompaniments piled up"
        if worst > 1.2 else "every blend hands over without piling up")
    # 13. tempo: no lurch
    tm = plans[0].tm
    end_beat = plans[-1].beat0 + 4
    worst, wb = 0.0, None
    allowed = set()
    for p in plans[:-1]:
        if p.into in ("hold", "breath") or getattr(p.sec, "broaden", 0):
            allowed.add(round(p.beat1))
    for b in range(1, int(end_beat)):
        a0, a1 = tm.bpm_at(b - 1e-6), tm.bpm_at(b + 1e-6)
        st = abs(a1 / a0 - 1)
        if st > worst and b not in allowed:
            worst, wb = st, b
    t_w = tm.seconds(wb) if wb is not None else 0
    add("tempo-steps", worst <= 0.02 + 1e-9, round(100 * worst, 1), "<= 2 %",
        f"the speed jumps {100 * worst:.1f} % at {t_w:.2f} s (beat {wb}); leave ending_start unpinned or change a bar count"
        if worst > 0.02 else "no sudden change of speed")
    # 13b. the speeds the picture forced: a section pushed far from its usual speed is a
    # different piece (a playful bounce at 140 is frantic; a hush at 60 falls apart)
    moved = [(p.sec.label or p.sec.mood, round(100 * (p.bpm / p.nominal_bpm - 1), 1)) for p in plans[:-1]]
    far = [m for m in moved if abs(m[1]) > 6.0]
    add("tempo-fit", not far, max((abs(m[1]) for m in moved), default=0.0), "<= 6 %",
        "sections pushed far from their own speed to fit the picture: " + ", ".join(f"{a} {b:+.1f} %" for a, b in far) +
        " (change a bar count, the bpm, or add a hold)" if far else "every section within 6 % of its own speed")
    # 14. layers that do nothing
    idle = [f"'{l}' in {p.sec.label or p.sec.mood}" for p in plans[:-1] for l in p.sec.add if l in IDLE and IDLE[l](p)]
    add("idle-layers", not idle, len(idle), "0",
        "switched on but never played: " + ", ".join(idle) if idle else "every layer switched on is heard")
    # 15. tune notes that clash with a borrowed chord
    clash = []
    for r in body:
        for a, m, _ in r["tune"]:
            c = r["chords"][0] if (len(r["chords"]) == 1 or a < 2) else r["chords"][1]
            if m % 12 in T.CLASH.get(c, set()):
                clash.append((r["k"], nm(m), c))
    add("clashes", not clash, len(clash), "0",
        f"tune notes against a borrowed chord's new note: {clash[:5]}" if clash else "no tune note clashes with its chord")
    # 16. a narrator: no melody in her range while she speaks; a light texture under her words
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
    return out


# ====================================================================== audio checks


def _bar_levels(y, rows):
    import measure as M
    k = M._kw(y) ** 2
    out = []
    for r in rows:
        a, b = int(r["t0"] * SR), int(min(r["t1"], len(k) / SR) * SR)
        out.append(-0.691 + 10 * math.log10(2 * float(np.mean(k[a:b])) + 1e-12) if b > a else -99.0)
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


def audio(y, band, plans, piece, rows=None):
    rows = rows or bar_table(band, plans, piece)
    lv = _bar_levels(y, rows)
    for r, l in zip(rows, lv):
        r["lufs"] = round(l, 1)
    body = [r for r in rows if not r["ending"]]
    out = []

    def add(cid, ok, value, limit, why):
        out.append(dict(id=cid, ok=bool(ok), value=value, limit=limit, why=why))
    lvb = [r["lufs"] for r in body[1:]] or [r["lufs"] for r in body]
    rng = max(lvb) - min(lvb) if lvb else 0.0
    need = 4.0 if piece.land_time() >= 20 else 3.0
    add("loudness-range", need - 1e-6 <= rng <= 14.0, round(rng, 1), f"{need:g}-14 dB",
        f"bar loudness moves only {rng:.1f} dB across the piece (flat)" if rng < need else
        (f"bar loudness moves {rng:.1f} dB (too wide: a jolt)" if rng > 14 else
         f"bar loudness moves {rng:.1f} dB across the piece"))
    if piece.peak is not None:
        pk = [r for r in rows if r["t0"] - 1e-3 <= piece.peak < r["t1"] - 1e-3]
        if pk:
            i = rows.index(pk[0])
            nb = 4 if piece.land_time() >= 15 else 2
            before = [r["lufs"] for r in rows[max(0, i - nb): i]]
            at = [r["lufs"] for r in rows[i: i + 2]]
            # energy averages, not dB averages: loud moments dominate as they do for a listener
            e = lambda xs: 10 * math.log10(np.mean([10 ** (x / 10) for x in xs]))
            rise = e(at) - e(before) if before and at else 0.0
            add("payoff-louder", rise >= 2.0, round(rise, 1), ">= 2 dB",
                f"the peak bars are {rise:+.1f} dB against the {len(before)} bars before (they must arrive, not fade in)"
                if rise < 2 else f"the peak arrives {rise:+.1f} dB above what led to it")
            loud = max(body + [r for r in rows if r["ending"]], key=lambda r: r["lufs"])
            ok = rows[i]["t0"] - 2.5 <= loud["t0"] <= rows[i]["t0"] + 2 * (rows[i]["t1"] - rows[i]["t0"]) + 0.01 \
                or loud["ending"]
            add("peak-loudest", ok, loud["k"], f"bars {rows[i]['k'] - 1}-{rows[i]['k'] + 2} or the logo",
                f"the loudest bar is bar {loud['k']} ({loud['t0']:.1f} s), not at the peak ({piece.peak:.1f} s)" if not ok
                else f"the loudest bar is bar {loud['k']} ({loud['t0']:.1f} s)")
    ch = _chroma(y, rows)
    best, cur, at = 0.0, 0.0, None
    for i, r in enumerate(body):
        sim = max((float(ch[i] @ ch[j]) for j in range(i)), default=0.0)
        r["sim"] = round(sim, 3)
        cur = cur + (r["t1"] - r["t0"]) if sim >= 0.985 else 0.0
        if cur > best:
            best, at = cur, r["k"]
    add("audio-nothing-new", best <= 12.0, round(best, 1), "<= 12 s",
        f"{best:.1f} s where every bar sounds like a copy of an earlier one (ending at bar {at})" if best > 12 else
        f"the sound renews itself (longest near-copy stretch {best:.1f} s)")
    return out


# ====================================================================== text


def table_text(rows, piece):
    L = [f"NOTES: {piece.name}  ({len(rows)} bars; the last is the ending bar with the logo)",
         "bar  time    section                  chords            tune (beat:note)                                 "
         "answer/counter          bass          notes  back  new" + ("  LUFS  sim" if "lufs" in rows[0] else "")]
    codes, seen_t, seen_b = {}, set(), set()
    for r in rows:
        code = codes.setdefault(r["back_rhythm"], "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[len(codes) % 26] + ("" if len(codes) < 26 else str(len(codes) // 26)))
        fam = (r["tune_fp"] in seen_t) and ((tuple(r["chords"]), r["back_rhythm"]) in seen_b)
        seen_t.add(r["tune_fp"])
        seen_b.add((tuple(r["chords"]), r["back_rhythm"]))
        tune = " ".join(f"{a:g}:{nm(m)}" for a, m, _ in r["tune"]) or "-"
        other = " ".join(f"{n['rel']:g}:{nm(n['m'])}{'a' if n['cls'] == 'answer' else 'c'}" for n in sorted(
            (n for n in r["notes"] if n["cls"] in ("answer", "counter")), key=lambda n: n["rel"])) or "-"
        bass = " ".join(nm(m) for m in r["bass"]) or "-"
        line = (f"{r['k']:>3}  {r['t0']:6.2f}  {r['sec'][:24]:<24} {'/'.join(r['chords']):<17} {tune[:48]:<48} "
                f"{other[:23]:<23} {bass[:13]:<13} {r['n']:>5}  {code:<4}  {'' if fam else 'NEW'}")
        if "lufs" in r:
            line += f"  {r['lufs']:5.1f}  {r.get('sim', '')}"
        L.append(line)
    L.append("back = the accompaniment's rhythm (same letter = identical rhythm); a = answer note, c = counter-line note")
    return L


def verdict_text(name, results):
    bad = [r for r in results if not r["ok"]]
    L = [f"{'PASS' if not bad else 'FAIL'}  composition of {name}: " +
         ("every composing rule kept" if not bad else f"{len(bad)} rule(s) broken: " + ", ".join(r["id"] for r in bad))]
    for r in results:
        L.append(f"   {'ok  ' if r['ok'] else 'FAIL'} {r['id']:<20} {str(r['value']):>7} (limit {r['limit']}): {r['why']}")
    return L
