"""THE STUDIO: the composing procedure's commands (the rebuild, 2026-11-24; toolkit-plan a4).

    render.sh --brief  <film>            step 1: the brief, the cards' hold times, the tempo fit
                                         (3 best tempi, every hit's error in ms and frames), her
                                         pace and tempo band, the motion grid for the editor
    render.sh --notes  [--log] <film>    every step: the notes bar by bar, the recipe, the bed
                                         (voicings, change plan in seconds, cycles placed and
                                         left out), the hard checks and the dashboard (~1 s)
    render.sh --bed    <film>            step 3: the bed alone (sustain, pulse, cycles; no tune),
                                         rendered, with its dashboard
    render.sh --sketch <film> [k=v ...]  step 5: the first 20 s twice, as written (A) and with ONE
                                         switch changed (B; default: the sustain pad <-> held)
                                         into out/sketches/

<film> is a film's name, a film file's key (film_<key>.py) or a demonstration's name.
"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import blocks  # noqa: E402
import dashboard as D  # noqa: E402
import films  # noqa: E402
import form  # noqa: E402
import notes as NT  # noqa: E402
from demos import DEMOS  # noqa: E402
from score import Band, plan  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "..", "out"))


def pieces():
    ps = {p.name: p for p in DEMOS}
    ps.update({n: f.piece for n, f in films.FILMS.items()})
    return ps


def resolve(names):
    ps = pieces()
    if not names:
        return list(ps.values())               # no names: every demonstration and film
    want = []
    for n in names:
        got = films.resolve([n]) or ([n] if n in ps else [])
        if not got:
            print(f"Unknown piece or film: {n}. Known: {', '.join(ps)}", file=sys.stderr)
            sys.exit(2)
        want += got
    return [ps[n] for n in want]


def bed_text(band):
    info = getattr(band, "bed_info", None)
    if not info:
        return []
    L = [f"THE BED: sustain = {info['sustain']}",
         "   pad voicings (beat, chord, notes): " + "; ".join(f"{b:g} {c} {' '.join(ms)}" for b, c, ms in info["voicing"][:12])
         + (" ..." if len(info["voicing"]) > 12 else "")]
    if info.get("changes"):
        L.append("   change plan: " + "; ".join(f"bar {c['bar']} ({c['t']} s) {c['what']}" + (f" {c['arg']}" if c['arg'] is not None else "")
                                             for c in info["changes"]))
    else:
        L.append("   change plan: none")
    cy = info.get("cycles") or {}
    if cy.get("placed") or cy.get("dropped"):
        drops = {}
        for d in cy.get("dropped", []):
            drops[d["why"]] = drops.get(d["why"], 0) + 1
        L.append(f"   cycles: {cy.get('placed', 0)} notes placed; left out: {drops or 'none'}; duty {cy.get('duty')}; "
                 f"co-prime {cy.get('coprime', (True,))[0]}")
    return L


def dump(piece, log=False):
    """The note dump with the bed, the recipe and the dashboard (no audio)."""
    plans = plan(piece)
    band = Band(piece, plans, dry=True)
    blocks.render(band, plans, piece)
    rows = form.bar_table(band, plans, piece)
    res = form.symbolic(band, plans, piece, rows)
    secs = [f"   {p.sec.label or p.sec.mood}: {p.t0:.2f}-{p.t1:.2f} s, {len(p.bars)} bars, {p.bpm:.1f} bpm "
            f"({100 * (p.bpm / p.nominal_bpm - 1):+.1f} %), {p.accomp}"
            + (f" ({p.sec.fig_mode})" if getattr(p.sec, "fig_mode", None) else "") + f", level {p.sec.level_db}"
            for p in plans[:-1]]
    L = form.table_text(rows, piece) + ["", "sections:"] + secs + [
        f"   ending ({piece.ending}, logo {piece.logo}): {plans[-1].t0:.2f} s, the name lands at {piece.land_time():.2f} s"]
    # WHY rewritten: notes.pauses still states the round-8 rule (the beat = two syllables); the
    # rebuild chooses the tempo in her band, nearest 120 (timing.narrator_band)
    import timing as TI
    for line in NT.pauses(piece, rows, plans[0].tm):
        if line.startswith("her pace:"):
            pace = films.speech_pace(piece.speech, 0.0, piece.land_time())
            b_ = TI.narrator_band(pace["syl_per_s"], (piece.owner or {}).get("narrator_tempo", "near120"))
            line = (f"her pace: {pace['syl_per_s']} syllables a second while speaking ({pace['syllables']} in "
                    f"{pace['speaking_s']} s); her tempo band {b_['lo']}-{b_['hi']} bpm (a beat every 2-3 syllables), "
                    f"nearest 120: {b_['bpm']:g}")
        L.append(line)
    L.append("")
    if getattr(piece, "brief", None) is not None:
        L += piece.brief.text()
    L += getattr(piece, "recipe_report", None) or []
    L += bed_text(band)
    L.append("")
    hard = D.hard(band, plans, piece, res)
    dash = D.dashboard(band, plans, piece, rows, res)
    L += D.text(piece.name, hard, dash, piece)
    L.append("   (audio gauges - tilt, presence, novelty, roughness, loudness - and the mix come with a render)")
    os.makedirs(os.path.join(OUT, "notes"), exist_ok=True)
    with open(os.path.join(OUT, "notes", f"{piece.name}.txt"), "w") as f:
        f.write("\n".join(L) + "\n")
    lg = NT.note_log(band, rows, piece)
    with open(os.path.join(OUT, "notes", f"{piece.name}.log.txt"), "w") as f:
        f.write("\n".join(lg) + "\n")
    return L + (["", *lg] if log else [f"   note log: out/notes/{piece.name}.log.txt"])


def brief(piece):
    import timing as TI
    L = [f"STEP 1 for {piece.name}"]
    b = getattr(piece, "brief", None)
    if b is not None:
        L += b.text()
    hits = list(getattr(piece, "hits", None) or (b.hits() if b is not None else []))
    plans = plan(piece)
    bpm = float(np.median([p.nominal_bpm for p in plans[:-1]]))
    rng = {"type-short": (100, 120), "app-demo": (104, 120)}.get(getattr(piece, "recipe", ""), (bpm - 8, bpm + 8))
    words = getattr(piece.speech, "words", None)
    if words:
        pace = films.speech_pace(piece.speech, 0.0, piece.land_time())
        band_ = TI.narrator_band(pace["syl_per_s"], (piece.owner or {}).get("narrator_tempo", "near120"))
        L.append(f"her pace: {pace['syl_per_s']} syllables a second; the band {band_['lo']}-{band_['hi']} bpm; "
                 f"nearest 120: {band_['bpm']:g}")
        # WHY around 120 only: the value nearest 120 in her band is the choice (toolkit-plan a2);
        # the fit then nudges it within 6 bpm so her sentence ends fall near the grid
        rng = (max(band_["lo"], band_["bpm"] - 6), min(band_["hi"], band_["bpm"] + 6))
        ends = TI.phrase_ends(piece.speech)
        L.append("her phrase ends (s, kind, pause after): " + "; ".join(f"{e['t']:g} {e['kind'][0]} {e['pause']:.2f}"
                                                                     for e in ends[:24]))
        hits = hits + [(e["t"], 1, "her " + e["kind"]) for e in ends if e["kind"] == "sentence"]
        L.append("her pauses of 1 s or more: " + "; ".join(f"{a:g}-{('end' if z > 1e8 else f'{z:g}')}"
                                                         for a, z in TI.pauses(piece.speech)))
    if hits:
        L.append(f"THE TEMPO FROM THE PICTURE (fit_tempo over {rng[0]:g}-{rng[1]:g} bpm; weight 3 on the downbeat, "
                 "others on a half-beat; on = -15..+45 ms):")
        L += TI.fit_text(TI.fit_tempo(hits, rng, ending_beats=piece.ending_len, rit=piece.rit))
    else:
        L.append("no hits given (Piece.hits or the brief's moments): the tempo is the recipe's default")
    grid = TI.motion_grid(bpm, 30, 0.0, piece.length)
    os.makedirs(os.path.join(OUT, "notes"), exist_ok=True)
    gp = os.path.join(OUT, "notes", f"{piece.name}.grid.json")
    with open(gp, "w") as f:
        json.dump(grid, f, indent=1)
    L.append(f"motion grid at {bpm:g} bpm, 30 fps: {grid['frames_per_beat']} frames a beat, {grid['frames_per_eighth']} an "
             f"eighth, {grid['frames_per_sixteenth']} a sixteenth (out/notes/{piece.name}.grid.json)")
    return L


def without_tune(piece):
    q = copy.deepcopy(piece)
    q.name = piece.name + "-bed-only"
    for s in q.sections:
        s.tune = None
    return q


def apply_switch(piece, key, value):
    """One switch changed, for the B sketch: an [OWNER] switch (sustain, pulse, chords), a bed
    field (bed.cutoff=1200), a piece field (touch=0.8) or a field on every section
    (sec.fig_touch=0.3)."""
    import tune as T
    q = copy.deepcopy(piece)

    def num(v):
        try:
            return float(v)
        except ValueError:
            return v
    if key == "sustain":
        q.bed = dict(q.bed or {}, sustain=value)
    elif key == "pulse":
        for s in q.sections:
            if value == "chord":
                s.fig_mode, s.figure, s.fig_floor = "chord", ["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"], "G3"
            else:
                s.fig_mode = "pedal"
    elif key == "chords" and value == "plain":
        for s in q.sections:
            s.chords = [[T.PLAIN.get(c, c) for c in b] for b in (s.chords or [])] or None
    elif key.startswith("bed."):
        q.bed = dict(q.bed or {}, **{key[4:]: num(value)})
    elif key.startswith("sec."):
        for s in q.sections:
            setattr(s, key[4:], num(value))
    else:
        setattr(q, key, num(value))
    q.owner = dict(q.owner or {}, **({key: value} if key in ("sustain", "pulse", "chords") else {}))
    return q


def sketch(piece, switches):
    import soundfile as sf
    import build
    from dsp import SR
    d = os.path.join(OUT, "sketches")
    os.makedirs(d, exist_ok=True)
    if not switches:
        cur = (piece.bed or {}).get("sustain", "pad")
        switches = [("sustain", "held" if cur == "pad" else "pad")]
    b = piece
    for k, v in switches:
        b = apply_switch(b, k, v)
    a = copy.deepcopy(piece)
    a.name = piece.name + "-sketch-A"
    b.name = piece.name + "-sketch-B"
    L = [f"STEP 5 sketches of {piece.name}: A as written, B with " + ", ".join(f"{k}={v}" for k, v in switches)]
    for q in (a, b):
        path = os.path.join(d, q.name + ".wav")
        _, st = build.one(q, path=path)
        y, _ = sf.read(path, dtype="float64", always_2d=True)
        cut = min(len(y), int(20.0 * SR))
        seg = y[:cut].copy()
        w = int(0.5 * SR)
        if cut < len(y):
            seg[-w:] *= np.linspace(1, 0, w)[:, None]
        sf.write(path, seg, SR, subtype="PCM_24")
        L.append(f"   {q.name}: {path} (the first {cut / SR:.0f} s)")
        L += ["      " + x for x in D.text(q.name, st["hard"], st["dashboard"], q)[:1]]
        outs = [r["id"] for r in st["dashboard"] if not r["ok"]]
        L.append(f"      dashboard out of range: {', '.join(outs) or 'none'}")
    return L


def main(argv):
    if not argv:
        print(__doc__)
        return
    cmd, rest = argv[0], argv[1:]
    log = "--log" in rest
    rest = [r for r in rest if r != "--log"]
    if cmd == "--notes":
        for p in resolve(rest):
            print("\n".join(dump(p, log)))
            print()
    elif cmd == "--brief":
        for p in resolve(rest):
            print("\n".join(brief(p)))
            print()
    elif cmd == "--bed":
        import build
        for p in resolve(rest):
            q = without_tune(p)
            print("\n".join(dump(q)))
            path = os.path.join(OUT, "sketches", q.name + ".wav")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            _, st = build.one(q, path=path)
            print("\n".join(D.text(q.name, st["hard"], st["dashboard"], q)))
            print(f"   the bed alone: {path}")
    elif cmd == "--sketch":
        names = [r for r in rest if "=" not in r]
        sw = [tuple(r.split("=", 1)) for r in rest if "=" in r]
        for p in resolve(names):
            print("\n".join(sketch(p, sw)))
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
