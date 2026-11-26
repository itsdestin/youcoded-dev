"""HARD FAILS and THE DASHBOARD (the rebuild, 2026-11-24; toolkit-plan e, made stricter).

Two kinds of number, and only one of them can fail a render:

  HARD FAILS - genuine faults whatever the music: clipping, silence where music should be, a
               note clash the composer did not mark, the narrator masked, the wrong length (or
               the name not landing on its frame). A piece with one of these is broken.

  THE DASHBOARD - everything else (how steady, how busy, how dark, how often it changes, how
               it sits with the picture and the voice), each with a target range and what it
               means in plain words. It NEVER fails a render. An out-of-range number is read
               like a gauge: the composer either explains it in one line (Piece.explain =
               {"id": "why"}) or changes the music for a MUSICAL reason.

WHY this split (round 8, 2026-11-24): composers fought the checks - one added a held violin only
to satisfy a brightness check, another wrapped a tool function to dodge one. A number that can
fail a piece becomes the goal, and the music bends to it. Nothing musical is ever added, removed
or bent to move a dashboard number. The older composition checks (form.py) and mix checks still
run; they are shown on the dashboard, and only the faults among them stay hard.
"""
import numpy as np

import form
import tune as T
from dsp import note

# WHY: the bar table's "parts" column (form.py) predates the pad and the cycles; U = the sustain
# pad, K = a cycle (shown instead of "?")
form.PART_LETTER.setdefault("pad", "U")
form.PART_LETTER.setdefault("cycle", "K")
form.PART_LETTER.setdefault("ring", "N")      # R is the air layer

C5 = note("C5")
VOICE = form.VOICE_RANGE                    # F3-E5
ROUGH = (1, 11, 13)
FG_BUSES = ("lead", "sing", "cycle", "answer", "counter")
SUSTAIN_BUSES = ("pad", "bowed", "ring")
HARD_IDS = ("clipping", "silence", "clash", "narrator-masked", "length")
# WHY REMOVED (audit 2026-11-25, defect 8; toolkit-plan e3): round 7's novelty quotas, which the
# plan forbids under any name: "audio-nothing-new" (something new every 16 s) and "plateau" (a
# level change every 30 s). They are no longer shown or counted anywhere.
REMOVED = ("audio-nothing-new", "plateau")
# older checks the dashboard measures in a new way (they are not shown twice)
SUPERSEDED = {"chords-distinct": "chord-variety", "narrator-tempo": "narrator-tempo", "voice-busy": "voice-busy",
              "touch": "touch", "attack-rate": "attack-rate", "layers": "groups", "picture-sync": "picture-sync",
              "clashes": "clash (hard)", "held-clash": "clash (hard)", "voice-room": "narrator-masked (hard)"}
# mix checks that are faults (folded into the hard checks)
MIX_HARD = ("true peak <= -1 dBTP", "no clipped samples", "silent first/last sample")
# short, stable ids for the mix gauges (what Piece.explain is keyed by)
MIX_IDS = {"loudness": "mix-loudness", "mono": "mix-mono", "every tune note on top": "mix-tune-on-top",
           "tune notes = canonical": "mix-tune-identity", "every attack": "mix-attacks-on-notes",
           "no noise-like": "mix-no-drum-like", "air:": "mix-air-band", "low end:": "mix-low-end"}


def _row(out, cid, group, value, target, ok, meaning, detail="", calibrated=True):
    """One gauge. calibrated=False: a reading only, shown with "~" and never as OUT. WHY (audit
    2026-11-25, defect 8): ranges nobody has checked by ear (roughness, novelty, gap-fill) read
    OUT on the approved logo itself, and composers pasted the same excuse into every piece; an
    uncalibrated number is information, not something to explain away."""
    out.append(dict(id=cid, group=group, value=value, target=target, ok=bool(ok) or not calibrated, meaning=meaning,
                    detail=detail, calibrated=bool(calibrated), reading_in=bool(ok)))


def _secs(band, e):
    return band.tm.seconds(e["beat"] + e["dur"]) - band.tm.seconds(e["beat"])


def _speech_words(piece):
    w = list(getattr(piece.speech, "words", []) or [])
    return [(a, b) for _, a, b in w] if w else [tuple(x) for x in (piece.speech or [])]


def _spoken(t, spans):
    return any(a <= t <= b for a, b in spans)


# ================================================================== HARD


def hard(band, plans, piece, form_results=(), y=None, st=None):
    out = []
    land_b = plans[-1].beat0 + plans[-1].blen
    land = piece.land_time()
    log = [e for e in band.log if e["beat"] < land_b - 1e-6]
    # CLASH: a semitone, major seventh or minor ninth held for more than half a beat between two
    # sustained notes below C5, or a tune note on a borrowed chord's clashing note, unless marked
    ok_bars = {int(k) for k in (getattr(piece, "clash_ok", None) or {})}
    bar_beats = [(i + 1, b.beat) for i, b in enumerate([b for p in plans for b in p.bars])]

    def bar_of(beat):
        k = 1
        for no, b in bar_beats:
            if beat >= b - 1e-6:
                k = no
        return k
    sus = [e for e in log if e["dur"] >= 1.0 and e["m"] < C5 and e["bus"] not in ("sub",)]
    chord_at = {}
    for p in plans:
        for bar in p.bars:
            for i, c in enumerate(bar.chords):
                chord_at[round(bar.beat + 2.0 * i, 3)] = c
    keys = sorted(chord_at)

    def chord(beat):
        k = [x for x in keys if x <= beat + 1e-6]
        return chord_at[k[-1]] if k else None
    found, sevenths = [], []
    for i, a in enumerate(sus):
        for b in sus[i + 1:]:
            iv = abs(a["m"] - b["m"])
            if iv not in ROUGH:
                continue
            ov = min(a["beat"] + a["dur"], b["beat"] + b["dur"]) - max(a["beat"], b["beat"])
            at = max(a["beat"], b["beat"])
            # WHY exempt the logo's own entry: its string swell starts a breath before the name
            # and resolves the ending's held suspension (A-flat to G), a prepared dissonance
            if ov <= 0.5 or at >= land_b - 0.3:
                continue
            c = chord(at)
            tones = T.colour_tones(c) if c in T.CHORD_TONES else set()
            row = (bar_of(at), form.nm(a["m"]), a["bus"], form.nm(b["m"]), b["bus"], round(ov, 2))
            # WHY a major seventh between two notes of the chord is colour (Abmaj7 voiced A-flat 3 to
            # G4), not a fault: it goes to the dashboard; a semitone or minor ninth, or any of these
            # with a note outside the chord, is a clash
            if iv == 11 and a["m"] % 12 in tones and b["m"] % 12 in tones:
                sevenths.append(row)
            elif bar_of(at) not in ok_bars:
                found.append(row)
    band._held_sevenths = sorted(set(sevenths), key=str)
    for r in form_results:
        if r["id"] in ("clashes", "held-clash") and not r["ok"]:
            found.append(("-", r["id"], r["why"][:90], "", "", 0))
    found = sorted(set(found), key=str)
    out.append(dict(id="clash", ok=not found, value=len(found), limit="0 unmarked",
                    why=("no unmarked semitone held between sustained notes below C5, and no tune note on a "
                         "borrowed chord's clashing note") if not found else
                    "unmarked clashes (bar, note, part, note, part, beats held): " + "; ".join(map(str, found[:6]))
                    + " -- revoice, or if it is meant, mark the bar: Piece.clash_ok={bar: 'why'}"))
    # SILENCE where music should be: from 0.3 s to the name, nothing sounding for over a second
    spans = sorted((e["t"], e["t"] + max(_secs(band, e), 0.15)) for e in band.log)
    gaps, cur = [], 0.3
    for a, b in spans:
        if a - cur > 1.0 and cur < land:
            gaps.append((round(cur, 2), round(min(a, land), 2)))
        cur = max(cur, b)
    if land - cur > 1.0:
        gaps.append((round(cur, 2), round(land, 2)))
    if y is not None:
        import measure as M
        gaps += [("audio", s) for s in M.silences(y, 0.5, land - 0.2)]
    out.append(dict(id="silence", ok=not gaps, value=len(gaps), limit="0 s of silence before the name",
                    why="music sounds from the first frame to the name" if not gaps else f"silent stretches: {gaps[:5]}"))
    # NARRATOR MASKED: melody (tune, cycles) starting in her range F3-E5 under her words; and,
    # when the film's mux is known (Piece.voice_mux), her voice under 6 dB above the music
    words = _speech_words(piece)
    if words:
        # WHY role "lead" too (v4): the woven tune plays on the piano bus, so its bus no longer says "tune"
        bad = [(round(e["t"], 2), form.nm(e["m"])) for e in log if (e["bus"] in FG_BUSES or e["role"] == "lead")
               and VOICE[0] <= e["m"] <= VOICE[1]
               and _spoken(e["t"], words) and not (e.get("canon") or ("",))[0] == "logo"]
        margin = None
        vm = getattr(piece, "voice_mux", None)
        if y is not None and vm:
            import measure as M
            margin = M.voice_margin(y, vm["path"], piece.speech.words, start_at=vm.get("start_at", 0.0),
                                    t_from=vm.get("t_from", 0.0), music_db=vm.get("music_db", -10.0))
        masked = margin is not None and margin[1] < 6.0
        out.append(dict(id="narrator-masked", ok=not bad and not masked,
                        value=(f"{len(bad)} notes" + (f", margin {margin[0]}/{margin[1]} dB" if margin else "")),
                        limit="no melody in F3-E5 under her words; voice >= 6 dB over the music",
                        why=("her words are clear of melody in her own range" + (
                            f"; her voice stands {margin[0]} dB (median) above the music in the phone band, "
                            f"{margin[1]} dB at worst ({margin[2]} s)" if margin else
                            # WHY (first-shot d): --notes and the first half of --bed have no audio, and
                            # "no mux given" read as a pass of a margin that fails on the render
                            (" (margin not measured: no audio here; the render measures it)" if vm else
                             " (no voice_mux given: margin not measured)")))
                        if not bad and not masked else
                        (f"melody notes in her range while she speaks: {bad[:6]}" if bad else "") +
                        (f" her voice only {margin[1]} dB above the music at {margin[2]} s" if masked else "")))
    # LENGTH: the file is the piece's length, the name lands on its frame, the ends are clean,
    # and the name has at least 1.5 s of ring after it
    probs = []
    if st is not None:
        if abs(st["seconds"] - piece.length) > 1.5 / 48000:
            probs.append(f"file {st['seconds']} s, asked {piece.length} s")
        li = st.get("logo", {})
        if li and li.get("kind") != "none" and (li.get("notes") != ["Bb4", "G5", "F5"] or abs(li.get("error_ms", 99)) > 10):
            probs.append(f"logo {li.get('notes')} heard {li.get('error_ms')} ms off the name")
        if not (st["first_sample_dbfs"] <= -90 and st["last_sample_dbfs"] <= -90):
            probs.append("first or last sample not silent")
    # WHY (first-shot f): a name asked for earlier than a whole bar allows was "landed" by squeezing
    # a bar to ~360 bpm (+227 %) and every hard check still passed; past 50 % it is a broken score
    for p in plans[:-1]:
        if p.nominal_bpm and abs(p.bpm / p.nominal_bpm - 1) > 0.5:
            probs.append(f"tempo squeezed {100 * (p.bpm / p.nominal_bpm - 1):+.0f} % at {p.t0:.2f} s to land the name "
                         "(too few beats before it: fewer bars, a later name, or a shorter odd bar)")
            break
    if piece.logo != "none" and piece.length - land < 1.5 - 1e-6:
        probs.append(f"only {piece.length - land:.2f} s after the name (>= 1.5 s of ring)")
    out.append(dict(id="length", ok=not probs, value=len(probs), limit="exact length, name within 10 ms",
                    why="the right length, the name on its frame, clean ends" if not probs else "; ".join(probs)))
    if st is not None:
        clip = st["clipped_samples"] > 0 or st["true_peak_dbtp"] > -1.0
        out.append(dict(id="clipping", ok=not clip, value=f"{st['clipped_samples']} / {st['true_peak_dbtp']} dBTP",
                        limit="0 clipped, true peak <= -1 dBTP",
                        why="no clipping, true peak within the limit" if not clip else "clipped or over the true-peak limit"))
    for r in out:
        r["level"] = "fail"
    return out


# ================================================================== THE DASHBOARD


def _phrases(notes, gap=1.0):
    out, cur = [], []
    for e in sorted(notes, key=lambda e: e["beat"]):
        if cur and e["beat"] - (cur[-1]["beat"] + cur[-1]["dur"]) > gap + 1e-6:
            out.append(cur)
            cur = []
        cur.append(e)
    if cur:
        out.append(cur)
    return out


def dashboard(band, plans, piece, rows, form_results=(), y=None, st=None, mix_tests=()):
    if getattr(piece, "style", "") == "v4":
        # WHY only the unity readings (v4, the owner's R3 "replace the long guide and the gauges"):
        # the 40-odd gauges measured what the old tools did, and composers bent music to them
        # (round 8). A v4 report is the hard faults plus the handful of signs that separated the
        # pieces he accepted from those he rejected (unity.py), read next to the reference shelf.
        import unity
        return unity.rows(band, plans, piece, y)
    out = []
    tm = band.tm
    land_b = plans[-1].beat0 + plans[-1].blen
    body_b = plans[-1].beat0
    land = piece.land_time()
    L = piece.length
    body = [e for e in band.log if e["beat"] < body_b - 1e-6]
    is_logo = lambda e: (e.get("canon") or ("",))[0] in ("logo", "ending")
    fg = [e for e in body if e["bus"] in FG_BUSES and not is_logo(e)]
    pulse = [e for e in body if e["role"] in ("pulse", "bass")] or \
            [e for e in body if e["bus"] in ("piano", "pizz", "synth") and e["role"] == ""]
    o = getattr(piece, "owner", None) or {}
    bl = getattr(band, "bedline", None)
    t_body = max(tm.seconds(body_b), 1e-6)

    # ---------------- the bed
    cov = np.zeros(int(land * 10) + 1)
    for e in band.log:
        if e["bus"] in SUSTAIN_BUSES or e["role"] == "sustain" or (e["bus"] == "piano" and _secs(band, e) >= 1.0):
            a, b = int(e["t"] * 10), int(min(land, e["t"] + _secs(band, e)) * 10)
            cov[max(0, a):max(0, b)] = 1
    share = float(cov[:max(1, int(land * 10))].mean())
    heard = None
    stems = getattr(band, "stems", None)
    if y is not None and stems:
        # WHY from the audio as well (audit 2026-11-25, defect 1): the note log said the held
        # strings sounded for 64 beats while their recording had stopped after 8-11 s; the gauge
        # read 100 % over a hole. A 100 ms frame counts when the sustain buses sound within 30 dB
        # of their own loudest second (a held layer fading in or out still counts).
        sus = sum(stems[b] for b in SUSTAIN_BUSES if b in stems)
        if np.abs(sus).max() > 1e-7:
            from dsp import SR as _SR
            h = int(0.1 * _SR)
            nfr = int(land * 10)
            e = np.array([np.sqrt(np.mean(sus[i * h:(i + 1) * h] ** 2)) for i in range(nfr)]) + 1e-12
            ref = np.percentile(e, 95)
            heard = float(np.mean(20 * np.log10(e / ref) > -30.0))
    val = f"{100 * share:.0f} %" + (f" (heard {100 * heard:.0f} %)" if heard is not None else "")
    worst = min(share, heard) if heard is not None else share
    _row(out, "sustain", "the bed", val, ">= 95 % to the name", worst >= 0.95,
         "something held (pad, held strings, a pedalled chord) sounds under everything; without it a pulse of "
         "separate notes sounds choppy between its notes (written in the notes / heard in the audio)")
    pr = len({round(e["t"], 2) for e in pulse}) / t_body
    # WHY a lower band under a narrator (toolkit-plan a3, recipe C): there the pulse is "soft,
    # low-information", at most 3 struck notes a second in her range
    lo_, hi_ = (1.5, 3.0) if getattr(piece, "recipe", "") == "narrated" else (2.0, 4.0)
    _row(out, "pulse-rate", "the bed", f"{pr:.1f}/s", f"{lo_:g}-{hi_:g} a second", lo_ - 1e-9 <= pr <= hi_ + 1e-9,
         "how many notes a second the pulse plays: too few and it stops being a pulse, too many and it gets busy")
    sims = []
    by_bar = {}
    for e in pulse:
        k = int(np.searchsorted([r["beat"] for r in rows], e["beat"] + 1e-6) - 1)
        by_bar.setdefault(k, set()).add(round((e["beat"] - rows[k]["beat"]) * 8) / 8)
    ks = sorted(by_bar)
    # WHY one AND two bars back: the pedal pulse's 16-step mask in eighths is a two-bar pattern,
    # so a bar repeats the bar two before it, not the one before
    for b in ks:
        cand = [len(by_bar[b] & by_bar[a]) / max(1, len(by_bar[b] | by_bar[a])) for a in (b - 1, b - 2)
                if a in by_bar and rows[a]["plan"] == rows[b]["plan"] and not rows[b]["ending"]]
        if cand:
            sims.append(max(cand))
    ps = float(np.mean(sims)) if sims else 1.0
    _row(out, "pulse-sim", "the bed", f"{ps:.2f}", ">= 0.85 (bar to bar)", ps >= 0.8,
         "how alike neighbouring bars of the pulse are in rhythm: a steady bed repeats (real music about 0.86)")
    if bl is not None and any(getattr(p.sec, "fig_mode", None) == "pedal" for p in plans[:-1]):
        bad = []
        for p in plans[:-1]:
            if getattr(p.sec, "fig_mode", None) != "pedal":
                continue
            pool = {note(x) % 12 if isinstance(x, str) else int(x) % 12 for x in (p.sec.fig_pedal or ["Bb4", "G4", "F4", "Eb4"])}
            for b in p.bars:
                for c in b.chords:
                    miss = [form.NAMES[x] for x in pool if x not in T.colour_tones(c)]
                    if miss:
                        bad.append(f"{c}:{'/'.join(miss)}")
        bad = sorted(set(bad))
        _row(out, "pedal-fit", "the bed", len(bad), "0 chords", not bad,
             "the pulse keeps its notes whatever the chord; each must be a chord note or its 9th, 11th or 6th",
             ", ".join(bad[:6]))

    # ---------------- how busy
    ts = sorted({round(e["t"], 3) for e in band.log if e["beat"] < body_b and e["bus"] not in ("pad", "sub")})
    best = 0.0
    for i, t in enumerate(ts):
        j = np.searchsorted(ts, t + 4.0)
        best = max(best, (j - i) / 4.0)
    _row(out, "attack-rate", "how busy", f"{best:.1f}/s", "2-4 a second (at most 4.5)", best <= 4.5,
         "notes starting per second in the busiest 4 s, all parts together; above about 4.5 reads as busy")
    groups_max, where = 0, None
    for r in rows:
        if r["ending"]:
            continue
        for h in (0.0, 2.0):
            b0, b1 = r["beat"] + h, r["beat"] + min(h + 2.0, r["blen"])
            if b1 <= b0:
                continue
            on = form.sounding_buses(band, b0, b1, exclude=("air", "double", "sub"))
            g = set()
            for bus in on:
                # in a bed piece the held strings play the pad's own voicing (bed.play), so they are
                # the sustain made richer, one group, not a new part
                if bus in ("pad", "ring") or (bus == "bowed" and bl is not None):
                    g.add("sustain")
                elif bus == "bowed":
                    g.add("held")
                elif bus in FG_BUSES:
                    g.add("tune/cycles")
                else:
                    g.add("pulse")
            if len(g) > groups_max:
                groups_max, where = len(g), (r["k"], sorted(g))
    _row(out, "groups", "how busy", groups_max, "<= 3 at once", groups_max <= 3,
         "how many groups sound together (sustain, pulse, held strings, tune and cycles as one); four is busy",
         f"most at bar {where[0]}: {', '.join(where[1])}" if where else "")
    # WHY over 8-bar windows, not per section (audit 2026-11-25, defect 8): a 2-bar section after
    # her last word that holds the tune's one phrase read 94 %; "rare" is about a stretch a
    # listener hears as a passage, about 16 s at 120
    body_rows = [r for r in rows if not r["ending"]]
    cover = np.zeros(int(body_b * 4) + 1)
    for e in fg:
        a = int(e["beat"] * 4)
        cover[a:a + max(1, int(e["dur"] * 4))] = 1
    duty = []
    W = min(8, len(body_rows))
    for i in range(0, max(1, len(body_rows) - W + 1)):
        if not body_rows:
            break
        b0 = body_rows[i]["beat"]
        b1 = body_rows[min(len(body_rows) - 1, i + W - 1)]["beat"] + body_rows[min(len(body_rows) - 1, i + W - 1)]["blen"]
        seg = cover[int(b0 * 4):int(b1 * 4)]
        if len(seg):
            duty.append((float(seg.mean()), f"bars {body_rows[i]['k']}-{body_rows[min(len(body_rows) - 1, i + W - 1)]['k']}"))
    dmax = max(duty) if duty else (0.0, "")
    _row(out, "fg-duty", "how busy", f"{100 * dmax[0]:.0f} %", "<= 33 % of any 8 bars", dmax[0] <= 0.33 + 1e-9,
         "how much of the music the tune and cycles fill; silence at least twice the sound keeps them rare",
         f"fullest: {dmax[1]}")
    fgr = len(fg) / t_body
    worst = 0
    for r in rows:
        b0, b1 = r["beat"], r["beat"] + 16
        nf = sum(1 for e in fg if b0 <= e["beat"] < b1)
        npu = sum(1 for e in pulse if b0 <= e["beat"] < b1)
        worst = max(worst, nf - npu)
    _row(out, "fg-onsets", "how busy", f"{fgr:.2f}/s", "<= 1 a second, never more than the pulse in 4 bars",
         fgr <= 1.0 and worst <= 0, "tune and cycle notes per second: the foreground stays sparser than the bed")
    words = _speech_words(piece)
    if words:
        speak_s = sum(b - a for a, b in words)
        n_att = len({round(e["t"], 2) for e in band.log if e["beat"] < body_b and e["bus"] not in ("pad", "sub", "bowed")
                     and VOICE[0] <= e["m"] <= VOICE[1] and _spoken(e["t"], words)})
        vb = n_att / max(speak_s, 1e-6)
        lim = float(o.get("voice_busy", 3))
        _row(out, "voice-busy", "how busy", f"{vb:.1f}/s", f"<= {lim:g} a second [OWNER: 3 or 5]", vb <= lim,
             "struck notes in her own range (F3-E5) per second while she speaks; more and they compete with her")
    if L >= 20:
        phs = _phrases([e for e in fg if e["bus"] in ("lead", "sing")])
        # a phrase's opening gesture: its first two intervals, in any key
        shapes = [tuple(b["m"] - a["m"] for a, b in zip(ph, ph[1:]))[:2] for ph in phs]
        orph = 0
        for i, ph in enumerate(phs):
            recurs = len(shapes[i]) == 2 and sum(1 for s in shapes if s == shapes[i]) > 1
            end = ph[-1]["beat"] + ph[-1]["dur"]
            # answered: another phrase follows within a bar, or the ending's sigh and the logo (the
            # tune's own last words) within two
            answered = any(0 <= q[0]["beat"] - end <= 4.0 for q in phs[i + 1:]) or body_b - end <= 8.0
            orph += 0 if (recurs or answered) else 1
        _row(out, "orphan", "how busy", orph, "0 phrases heard once and never answered", orph == 0,
             "a phrase that comes once and is never echoed or answered sounds 'thrown in'")

    # ---------------- harmony
    seq = []
    for r in rows:
        if r["ending"]:
            continue
        for c in r["chords"]:
            if not seq or seq[-1] != c:
                seq.append(c)
    shared = [len(T.CHORD_TONES[a] & T.CHORD_TONES[b]) for a, b in zip(seq, seq[1:])]
    zero = sum(1 for x in shared if x == 0)
    low = sum(1 for x in shared if x < 2)
    _row(out, "common-tone", "harmony", f"{min(shared) if shared else '-'} (min)", ">= 1 shared note every change (2 is better)",
         zero == 0, "each new chord keeps a note of the last one: smooth, soothing harmony",
         f"{zero} changes share nothing, {low} share fewer than 2")
    need = 2 if L < 25 else (3 if L < 45 else 4)
    distinct = len(set(seq))
    tri = [tuple(seq[i:i + 3]) for i in range(len(seq) - 2)]
    irr = len(set(tri)) / len(tri) if tri else 0.0
    # WHY the run rule only from 6 changes (audit defect 8): with fewer changes almost every
    # 3-chord run is new because the piece is short, not because the harmony wanders
    runs_apply = len(seq) - 1 >= 6
    _row(out, "chord-variety", "harmony", f"{distinct} chords, {100 * irr:.0f} %", f">= {need} chords; 3-chord runs "
         f"<= 55 % unique (from 6 changes)", distinct >= need and (irr <= 0.55 or not runs_apply),
         "a few chords that come back (not many): real music repeats its 3-chord runs; ~40 % unique is typical")
    bor = sorted({c for c in seq if c in T.BORROWED})
    _row(out, "borrowed", "harmony", len(bor), "<= 1 borrowed chord", len(bor) <= 1,
         "a chord from outside the key is a surprise; once is colour", ", ".join(bor))
    hs = getattr(band, "_held_sevenths", [])
    _row(out, "held-sevenths", "harmony", len(hs), "0 major sevenths held below C5", not hs,
         "a major seventh held low inside a chord (the chord's own colour, softer than a clash, but it can sound "
         "heavy low down)", "; ".join(map(str, hs[:4])))
    marked = getattr(piece, "clash_ok", None) or {}
    if marked:
        _row(out, "clash-marked", "harmony", len(marked), "the composer's marked rubs", True,
             "semitones the composer means: " + "; ".join(f"bar {k}: {v}" for k, v in marked.items()))

    # ---------------- change
    ch = [c for c in (getattr(piece, "changes", None) or [])]
    implicit = []
    if bl is not None:
        # WHY (audit 2026-11-25, defect 5): a cycle the plan never brings "in" plays from the start;
        # its first note is a change the listener hears (recipe B's cycle2 at 3.6 s, a novelty peak at
        # 4.0 s) even though no entry names it, so it is counted here at its first note
        named = {c[2] for c in ch if len(c) > 2 and c[1] == "in"}
        for c in (getattr(piece, "cycles", None) or []):
            if c.name and c.name not in named:
                first = min((e["t"] for e in body if e["bus"] == "cycle" and e.get("cyc") == c.name), default=None)
                if first is not None:
                    implicit.append((round(first, 2), c.name))
    if bl is not None:
        times = sorted({round(bl.seconds(bl.bar_beat(int(c[0]))), 2) for c in ch if c[1] != "peak"}
                       | {t for t, _ in implicit})
        per_bar = {}
        for c in ch:
            per_bar.setdefault(int(c[0]), []).append(c[1])
        peak_bars = {int(c[0]) for c in ch if c[1] == "peak"}
        crowded = [b for b, w in per_bar.items() if len([x for x in w if x != "peak"]) > 1 and b not in peak_bars]
        gaps = [b - a for a, b in zip(times, times[1:])]
        if L < 20:
            ok = len(times) <= 1 and not crowded
            tgt = "0-1 change under 20 s"
        else:
            # WHY 0.25 s of slack (first-shot b and e): turns sit on bar lines, so a picture's 16.0 s
            # became 16.1 s and 8 s became 7.95 s; the gauge failed gaps it printed as "8.0"
            ok = all(8.0 - 0.25 <= g <= 16.0 + 0.25 for g in gaps) and not crowded and len(times) >= 1
            tgt = "one change every 8-16 s, one per bar line (two only at the peak)"
        _row(out, "change-plan", "change", f"{len(times)} at {times}", tgt, ok,
             "the bed evolves slowly: one small change every 8-16 s, never two at once except at the peak",
             (f"gaps {[round(g, 2) for g in gaps]} s" if gaps else "") + (f"; crowded bars {crowded}" if crowded else "")
             + (f"; unplanned: {', '.join(f'{n} starts at {t} s' for t, n in implicit)} (bring it in with "
                f"(bar, 'in', name))" if implicit else ""))
    events = []
    for c in sorted(set(seq) & T.BORROWED):
        k = next(r for r in rows if c in r["chords"])
        events.append((k["t0"], f"borrowed {c}"))
    lead = sorted([e for e in fg if e["bus"] in ("lead", "sing")], key=lambda e: e["beat"])
    for a, b in zip(lead, lead[1:]):
        if abs(b["m"] - a["m"]) > 12 and b["beat"] - a["beat"] < 4:
            events.append((b["t"], f"leap {form.nm(a['m'])}-{form.nm(b['m'])}"))
    for ph in _phrases(lead):
        if abs(ph[0]["beat"] % 1.0) > 1e-6:
            events.append((ph[0]["t"], "off-beat entry"))
    seen = set(bl.cfg["start"]) if bl is not None else set()
    for c in sorted(ch, key=lambda c: c[0]):
        if c[1] == "in" and c[2] not in seen and c[2] in ("held",):
            events.append((bl.seconds(bl.bar_beat(int(c[0]))), f"new timbre {c[2]}"))
        if c[1] == "in":
            seen.add(c[2])
    events.sort()
    budget = 1 if L < 20 else 3
    close = [round(b[0] - a[0], 1) for a, b in zip(events, events[1:]) if b[0] - a[0] < 8.0]
    _row(out, "surprise-budget", "change", len(events), f"<= {budget}, >= 8 s apart (one at the peak)",
         len(events) <= budget and not close,
         "pattern-breaking moments (an outside chord, a big leap, a new instrument, an off-beat entry): rationed",
         "; ".join(f"{t:.1f}s {w}" for t, w in events[:6]))
    cyc = list(getattr(piece, "cycles", None) or [])
    if cyc:
        import cycles as CY
        okc, badp = CY.coprime(cyc)
        nmax = CY.budget(L)[0]
        cn = sum(1 for e in body if e["bus"] == "cycle") / t_body
        dmx = max(c.duty() for c in cyc)
        info = getattr(band, "bed_info", {}).get("cycles", {})
        drop = {}
        for d in info.get("dropped", []):
            drop[d["why"]] = drop.get(d["why"], 0) + 1
        _row(out, "cycles", "change", f"{len(cyc)}, {cn:.2f}/s, duty {dmx:.2f}",
             f"<= {nmax} cycles, co-prime periods, duty <= 0.33, <= 1 onset a second",
             len(cyc) <= nmax and okc and dmx <= 0.33 + 1e-9 and cn <= 1.0,
             "short parts on unequal periods line up differently every time round: variety without new notes",
             (f"periods sharing a factor {badp}; " if badp else "") + (f"left out: {drop}" if drop else ""))

    # ---------------- touch and tone
    piano = [e for e in body if e["part"] == "piano"]
    vmax = max((e["vel"] for e in piano), default=0.0)
    spreads = []
    # each line on its own (the tune; each cycle): a cycle's soft notes beside the tune are two
    # voices, not one uneven phrase
    lines = [[e for e in fg if e["part"] == "piano" and e["bus"] == "lead"]]
    lines += [[e for e in fg if e["bus"] == bus_] for bus_ in ("cycle", "answer", "counter")]
    for ph in [ph for ln in lines for ph in _phrases(ln)]:
        v = [e["vel"] for e in ph]
        if len(v) >= 3:
            spreads.append(float(np.percentile(v, 95) - np.percentile(v, 5)))
    pv = [e["vel"] for e in pulse]
    psp = float(np.percentile(pv, 95) - np.percentile(pv, 5)) if len(pv) > 4 else 0.0
    sp = max(spreads + [psp]) if (spreads or pv) else 0.0
    _row(out, "touch", "touch and tone", f"max {vmax:.2f}, spread {sp:.2f}", "max <= 0.62; each phrase's spread <= 0.12",
         vmax <= 0.62 and sp <= 0.12 + 1e-9,
         "how hard the piano is played, and how much neighbouring notes differ: bigger jumps sound uneven and bright")

    # ---------------- timing, the picture and the voice
    if plans[:-1]:
        moved = max(abs(p.bpm / p.nominal_bpm - 1) for p in plans[:-1])
        _row(out, "tempo-stretch", "timing", f"{100 * moved:.1f} %", "<= 3 % from the written tempo", moved <= 0.03 + 1e-9,
             "how far the tempo had to move to land the name on its frame; more and the bars or the tempo want changing")
    if words and getattr(piece.speech, "words", None):
        import films
        from timing import narrator_band, phrase_ends
        pace = films.speech_pace(piece.speech, 0.0, land)
        if pace:
            band_ = narrator_band(pace["syl_per_s"])
            bpm = float(np.median([p.bpm for p in plans[:-1]]))
            _row(out, "narrator-tempo", "timing", f"{bpm:.1f} bpm", f"{band_['lo']}-{band_['hi']} bpm (her band)",
                 band_["lo"] - 0.5 <= bpm <= band_["hi"] + 0.5,
                 f"her pace is {pace['syl_per_s']} syllables a second; a beat every 2-3 syllables moves with her "
                 "without sitting in her own rhythm")
            ends = [e["t"] for e in phrase_ends(piece.speech)]
            chg, prev = [], None
            for r in rows:
                if r["ending"]:
                    continue
                for i, c in enumerate(r["chords"]):
                    if prev is not None and c != prev:
                        chg.append(round(tm.seconds(r["beat"] + 2.0 * i), 3))
                    prev = c
            beat_s = 60.0 / bpm
            far = [round(t, 2) for t in chg if _spoken(t, words) and ends and min(abs(t - x) for x in ends) > beat_s / 2]
            fast = sum(1 for a, b in zip(chg, chg[1:]) if b - a < 1.5 and _spoken(a, words))
            _row(out, "narrator-chords", "timing", f"{len(far)} off her phrase ends", "chords change on her phrase ends; "
                 "<= 1 change per 1.5 s under words", not far and fast == 0,
                 "the harmony turns where her sentences end, so the music breathes with her",
                 f"changes under her words not near a phrase end: {far[:6]}")
    if y is not None and words and getattr(piece, "voice_mux", None) and getattr(piece.speech, "words", None):
        import measure as M
        vm = piece.voice_mux
        mg = M.voice_margin(y, vm["path"], piece.speech.words, start_at=vm.get("start_at", 0.0),
                            t_from=vm.get("t_from", 0.0), music_db=vm.get("music_db", -10.0))
        if mg:
            # WHY the worst too (first-shot d): a median in range printed "in" beside a worst of
            # -1.5 dB, which is the hard narrator-masked failure
            _row(out, "voice-margin", "timing", f"{mg[0]:+.1f} dB (worst {mg[1]:+.1f})", "10-14 dB over the music "
                 "(phone band, in the film's mux); worst >= 6", 10.0 <= mg[0] <= 14.5 and mg[1] >= 6.0,
                 "how far her voice stands above the music where a phone plays (300 Hz-8 kHz)", f"worst at {mg[2]} s")
    hits = list(getattr(piece, "hits", None) or [])
    if hits:
        from timing import ON_WINDOW, perceived_delay
        cand = [e for e in body + [e for e in band.log if is_logo(e)] if e["bus"] not in ("pad", "sub", "bowed")]
        res = []
        for h in hits:
            t, w, lab = float(h[0]), float(h[1] if len(h) > 1 else 1), (h[2] if len(h) > 2 else "")
            near = [(e["t"] + perceived_delay("piano", e["vel"]) - t, e) for e in cand if abs(e["t"] - t) < 0.2]
            if not near:
                res.append((lab or t, w, None, "apart"))
                continue
            d = min(near, key=lambda x: abs(x[0]))[0]
            kind = "on" if ON_WINDOW[0] <= d <= ON_WINDOW[1] else ("EARLY" if -0.15 <= d < ON_WINDOW[0] else
                                                                   ("late" if ON_WINDOW[1] < d <= 0.13 else "apart"))
            res.append((lab or t, w, round(1000 * d), kind))
        bad = [r for r in res if r[1] >= 3 and r[3] != "on"] + [r for r in res if r[3] == "EARLY"]
        # WHY the weight-3 count first (first-shot d): the line said "weight-3 hits" but counted every
        # moment, so a weight-1 turn between beats read as a missed hit
        big = [r for r in res if r[1] >= 3]
        _row(out, "picture-sync", "timing", f"weight-3 {sum(1 for r in big if r[3] == 'on')}/{len(big)} on; "
             f"all {sum(1 for r in res if r[3] == 'on')}/{len(res)}",
             "weight-3 hits heard on the frame (-15..+45 ms); nothing heard early", not bad,
             "music that arrives before the picture feels wrong; up to 45 ms late still feels on",
             "; ".join(f"{a}: {c}" + (f" {b:+d} ms" if b is not None else "") for a, _, b, c in
                       [(r[0], r[1], r[2], r[3]) for r in res][:8]))
    pic = list(getattr(piece, "_picture", None) or [])
    if pic:
        accents = []
        starts = [ph[0]["t"] for ph in _phrases(fg)]
        chg_t = [r["t0"] for r in rows if not r["ending"]]
        for t, lab in pic:
            if any(-0.015 <= s - t <= 0.045 for s in starts) or (bl is not None and any(
                    abs(bl.seconds(bl.bar_beat(int(c[0]))) - t) < 0.05 for c in ch if c[1] == "in")):
                accents.append(t)
        allowed = 3 + int(L // 15)
        pairs = sum(1 for (a, _), (b, _) in zip(pic, pic[1:]) if a in accents and b in accents)
        _row(out, "hit-budget", "timing", len(accents), f"<= {allowed} accented cuts, never two in a row",
             len(accents) <= allowed and pairs == 0,
             "the music accents very few picture moments (music-in, the peak, the logo): more sounds like a cartoon")

    # ---------------- audio
    if y is not None:
        import measure as M
        til, bands = M.tilt(y, until=land)
        # WHY -5 to -12 (audit 2026-11-25, defect 8): judged against the owner's own logo, which is
        # what he chose: the piano logo reads -11 and the blend -3.9 over the whole file; -8 put his
        # piano logo and recipe A (a soft pulse and a pad) out of range for being like the logo
        _row(out, "tilt", "touch and tone", f"{til:+.1f} dB/oct", "-5 to -12 dB an octave (125 Hz-8 kHz; logo -11)",
             -12.0 - 1e-9 <= til <= -5.0 + 1e-9,
             "how quickly the sound gets quieter going up: flatter is brighter (round 7, 'harsh': -2 to -3; "
             "a pop record about -5; the owner's piano logo -11)", f"octave bands re 125 Hz: {bands}")
        p1, p2 = M.presence(y, until=land)
        _row(out, "presence", "touch and tone", f"{p1:+.1f} / {p2:+.1f} dB", "2-5 kHz <= -17, 5-16 kHz <= -30",
             p1 <= -17 and p2 <= -30, "the energy where the ear is most sensitive (2-5 kHz) and the sparkle above it")
        nv, nt = M.novelty_peaks(y, until=land)
        planned = len([c for c in ch if c[1] != "peak"])
        _row(out, "novelty-peaks", "change", f"{len(nt)} at {nt[:8]}", f"<= {planned + 1} (planned changes + 1)",
             len(nt) <= planned + 1, "moments where the sound turns into something else; more than planned may read "
             "as choppy (a reading: calibration waits for the owner's choppy/fine ratings)", calibrated=False)
        rr, rt = M.roughness(y, until=land)
        # WHY against the logo (audit defect 8): the approved logo reads 1.88x (piano) and 1.98x
        # (blend) a plain triad; 1.5x put the owner's own sound out of range
        _row(out, "roughness", "touch and tone", f"{rr:.2f}x", "about the logo's 1.9-2.0x a plain triad",
             rr <= 2.0, "beating between close notes (a grating, buzzy quality); a reading until the owner rates "
             "harsh/fine", f"roughest at {rt} s", calibrated=False)
        gf, gw = M.gap_fill(y, 1.0, land - 0.3)
        _row(out, "gap-fill", "the bed", f"{gf:.1f} dB", "steadier is lower (round 8 mim-r5 1.9; round 7 'choppy' 4.3)",
             gf <= 3.0, "how far the level dips between the pulse's notes, the median swing inside each half-second "
             "(200 ms loudness): the held layer is there to fill those gaps; a reading until the owner rates "
             "choppy/fine", (f"worst {gw[0]} dB at {gw[1]} s" if gw else ""), calibrated=False)

    # ---------------- the older checks and the mix checks, shown as gauges
    v3 = getattr(piece, "style", "") in ("v3", "v4")
    fig_bass = any(getattr(p.sec, "fig_bass", False) for p in plans)
    for r in form_results:
        if r["id"] in SUPERSEDED or r["id"] in REMOVED:
            continue
        ok, lim, why = r["ok"], r["limit"], r["why"]
        # WHY per-recipe targets (audit 2026-11-25, defect 8): each of these read OUT on the recipes'
        # own defaults, and every piece had to explain the same thing away
        if r["id"] == "bass-moves" and fig_bass:
            continue                              # the pulse's bass plays roots by design (fig_bass)
        if r["id"] == "loudness-range" and v3:
            # a ceiling only: a steady bed under a voice or a 12 s card barely moves (plan e3 forbids
            # a minimum above 1.5-2 dB)
            top = float(str(lim).split("-")[-1].split()[0])
            ok, lim = float(r["value"]) <= top + 1e-6, f"<= {top:g} dB (a ceiling)"
        if r["id"] == "cell-present" and getattr(piece, "recipe", "") == "type-short" and not ok:
            ok, why = True, "recipe A may leave the tune out: in 10-20 s the logo is the one statement"
        _row(out, r["id"], "older checks", r["value"], lim, ok, why)
    for name, ok in mix_tests:
        if name in MIX_HARD or name.startswith("logo played") or name.startswith("no logo"):
            continue
        short = next((v for k, v in MIX_IDS.items() if name.startswith(k)), name[:30])
        _row(out, short, "mix", "ok" if ok else "out", name, ok, "")
    return out


# ================================================================== the report


GROUP_ORDER = ["unity", "the bed", "how busy", "harmony", "change", "touch and tone", "timing", "older checks", "mix"]


def text(name, hard_rows, dash_rows, piece):
    bad = [r for r in hard_rows if not r["ok"]]
    if dash_rows and all(r["group"] == "unity" for r in dash_rows):
        return _text_v4(name, hard_rows, dash_rows, bad)
    L = [f"{'PASS' if not bad else 'FAIL'}  {name}: hard checks (faults whatever the music: clipping, silence, an "
         f"unmarked clash, the narrator masked, the wrong length)" + ("" if not bad else " -- " + ", ".join(r['id'] for r in bad))]
    for r in hard_rows:
        L.append(f"   {'ok  ' if r['ok'] else 'FAIL'} {r['id']:<17} {str(r['value']):>10}  {r['why']}")
    expl = getattr(piece, "explain", None) or {}
    outs = [r for r in dash_rows if not r["ok"]]
    nread = sum(1 for r in dash_rows if not r.get("calibrated", True))
    L.append(f"DASHBOARD {name}: {len(dash_rows) - len(outs) - nread} in range, {len(outs)} out of range, {nread} "
             "readings (~, uncalibrated: information, nothing to explain) "
             "(gauges, never a failure: explain an out-of-range number in one line in Piece.explain, or change the "
             "music for a musical reason; never add or bend anything to move a number)")
    for g in GROUP_ORDER:
        rs = [r for r in dash_rows if r["group"] == g]
        if not rs:
            continue
        L.append(f"  [{g}]")
        for r in rs:
            tag = ("~  " if not r.get("calibrated", True) else (" in " if r["ok"] else "OUT"))
            line = f"   {tag} {r['id']:<20} {str(r['value']):>18}  target {r['target']}"
            L.append(line)
            if r["meaning"] and g not in ("older checks", "mix"):
                L.append(f"        {r['meaning']}" + (f" ({r['detail']})" if r["detail"] else ""))
            elif not r["ok"] and r["meaning"]:
                L.append(f"        {r['meaning'][:160]}")
            if not r["ok"]:
                L.append(f"        explained: {expl[r['id']]}" if r["id"] in expl else
                         "        (not explained: explain it in one line, or change the music for a musical reason)")
    return L


def _text_v4(name, hard_rows, dash_rows, bad):
    """A v4 report: the hard faults, then the unity readings (never a failure, never a target)."""
    L = [f"{'PASS' if not bad else 'FAIL'}  {name}: hard checks (faults whatever the music)"
         + ("" if not bad else " -- " + ", ".join(r['id'] for r in bad))]
    for r in hard_rows:
        L.append(f"   {'ok  ' if r['ok'] else 'FAIL'} {r['id']:<17} {str(r['value']):>10}  {r['why']}")
    L.append(f"UNITY READINGS {name} (information, never a failure; '*' = outside where the accepted pieces sit; "
             "read them next to the shelf: render.sh --shelf <film>. Never change music only to move one)")
    for r in dash_rows:
        L.append(f"   {'~' if r.get('near', True) else '*'} {r['id']:<17} {str(r['value']):>34}  {r['meaning']}")
    return L


def summary(hard_rows, dash_rows):
    return dict(hard_ok=all(r["ok"] for r in hard_rows), hard=[r["id"] for r in hard_rows if not r["ok"]],
                out_of_range=[r["id"] for r in dash_rows if not r["ok"]])
