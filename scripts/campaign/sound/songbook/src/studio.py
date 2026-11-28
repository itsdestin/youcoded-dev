"""THE STUDIO: the composing procedure's commands (the rebuild, 2026-11-24; toolkit-plan a4).

    render.sh --brief  <film>            steps 1-2: the brief, the cards' hold times, the tempo fit
                                         (3 best tempi, every hit's error in ms and frames), her
                                         pace and tempo band, the motion grid for the editor
    render.sh --notes  [--log] <film>    step 6 and after: the notes bar by bar, the recipe, the bed
                                         (voicings, change plan in seconds, cycles placed and
                                         left out), the hard checks and the dashboard (~1 s)
    render.sh --bed    <film>            step 5: the bed alone (sustain, pulse, cycles; no tune),
                                         rendered, with its dashboard
    render.sh --sketch <film> [<film2>] [from=S] [len=15] [picture=x.mp4] [pic_from=S] [lag=0.10] [k=v ...]
                                         a feel sketch: any window of each piece, the music `lag` s
                                         after the picture, to mp3 (+ mp4 with a picture; her voice
                                         from voice_mux); k=v also renders a one-switch B
    render.sh --shelf [<film> ...]       a piece's unity readings and tone next to the reference
                                         shelf's (reference/shelf.json)
    render.sh --deliver <film> <dir> [picture=x.mp4] [from=s]   the music as mp3, and with a picture
                                         the mp4 (music replaces its sound; narrated: her voice + music)

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
    if info.get("whimsy"):
        L.append(f"   whimsy: {info['whimsy']} bell notes doubling the tune an octave up")
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


def brief(piece, rng_over=None):
    import timing as TI
    L = [f"STEP 1 for {piece.name}"]
    b = getattr(piece, "brief", None)
    if b is not None:
        L += b.text()
    hits = list(getattr(piece, "hits", None) or (b.hits() if b is not None else []))
    plans = plan(piece)
    bpm = float(np.median([p.nominal_bpm for p in plans[:-1]]))
    rng = {"type-short": (100, 120), "app-demo": (104, 120)}.get(getattr(piece, "recipe", ""), (bpm - 8, bpm + 8))
    if rng_over:
        rng = rng_over
    words = getattr(piece.speech, "words", None)
    if words:
        pace = films.speech_pace(piece.speech, 0.0, piece.land_time())
        band_ = TI.narrator_band(pace["syl_per_s"], (piece.owner or {}).get("narrator_tempo", "near120"))
        L.append(f"her pace: {pace['syl_per_s']} syllables a second; the band {band_['lo']}-{band_['hi']} bpm; "
                 f"nearest 120: {band_['bpm']:g}")
        # WHY around 120 only: the value nearest 120 in her band is the choice (toolkit-plan a2);
        # the fit then nudges it within 6 bpm so her sentence ends fall near the grid
        rng = rng_over or (max(band_["lo"], band_["bpm"] - 6), min(band_["hi"], band_["bpm"] + 6))
        ends = TI.phrase_ends(piece.speech)
        L.append("her phrase ends (s, kind, pause after): " + "; ".join(f"{e['t']:g} {e['kind'][0]} {e['pause']:.2f}"
                                                                     for e in ends[:24]))
        hits = hits + [(e["t"], 1, "her " + e["kind"]) for e in ends if e["kind"] == "sentence"]
        L.append("her pauses of 1 s or more: " + "; ".join(f"{a:g}-{('end' if z > 1e8 else f'{z:g}')}"
                                                         for a, z in TI.pauses(piece.speech)))
    if hits:
        # WHY "+-3 to land the name" (first-shot d): with a name to land the tempo is moved to the one
        # that lands it after whole bars, up to 3 bpm outside the range; a fit outside it looked wrong
        L.append(f"THE TEMPO FROM THE PICTURE (fit_tempo over {rng[0]:g}-{rng[1]:g} bpm, +-3 to land the name; "
                 "weight 3 on the downbeat, others on a half-beat; on = -15..+45 ms; another range: "
                 "range=LO-HI):")
        fits = TI.fit_tempo(hits, rng, ending_beats=piece.ending_len, rit=piece.rit)
        L += TI.fit_text(fits)
        if not fits:
            # WHY (first-shot f): when nothing fitted, --brief printed nothing at all
            L.append("  no fit: no tempo in the range lands the name after at least one whole bar. The name "
                     "is too early for this range and ending (try range=LO-HI, ending='short', or ask for a later name)")
        if not words and not rng_over and (not fits or not fits[0]["big_ok"]):
            # WHY a wider look (first-shot a, b, e): a picture already cut on its own grid (96 bpm; or
            # 120 with every turn on a bar line) lay outside or between the recipe's searched fits,
            # and the composer was told to "move the picture" when the picture was right
            wide = [f for f in TI.fit_tempo(hits, (84, 132), ending_beats=piece.ending_len, rit=piece.rit)
                    if f["big_ok"]]
            if wide:
                L.append("  ON EVERY WEIGHT-3 HIT over 84-132 bpm (outside the recipe's usual range; prefer it "
                         "when the picture was cut to its own beat):")
                L += TI.fit_text(wide[:2])
                fits = wide[:1] + fits          # the motion grid follows the fit that lands every hit
    else:
        fits = []
        L.append("no hits given (Piece.hits or the brief's moments): the tempo is the recipe's default")
    # WHY the recommended tempo (audit defect 9): the grid was written at the piece's current
    # tempo, so an editor cutting to it before the composer changed bpm cut to the wrong grid
    odd, odd_at = 0, 1
    if fits:
        bpm, odd, odd_at = fits[0]["bpm"], fits[0]["odd"], fits[0]["odd_at"] or 1
    grid = TI.motion_grid(bpm, 30, 0.0, piece.length, odd=odd, odd_at=odd_at)
    os.makedirs(os.path.join(OUT, "notes"), exist_ok=True)
    gp = os.path.join(OUT, "notes", f"{piece.name}.grid.json")
    with open(gp, "w") as f:
        json.dump(grid, f, indent=1)
    L.append(f"motion grid at {bpm:g} bpm{f' (odd bar {odd_at})' if odd else ''}{' (the first fit)' if fits else ''}, 30 fps: {grid['frames_per_beat']} frames a beat, {grid['frames_per_eighth']} an "
             f"eighth, {grid['frames_per_sixteenth']} a sixteenth (out/notes/{piece.name}.grid.json)")
    return L


def without_tune(piece):
    q = copy.deepcopy(piece)
    q.name = piece.name + "-bed-only"
    for s in q.sections:
        s.tune = None
    return q


def _sound_keys():
    import options
    return list(options.DEFAULTS)


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
        import recipes as R
        q.bed = dict(q.bed or {}, sustain=value)
        # the sustain's bus level follows the layer (recipes.sustain_mix): the old trim goes
        q.mix = {k: v for k, v in (q.mix or {}).items() if k not in ("pad", "ring", "bowed")}
        q.mix.update(R.sustain_mix(value, int((q.owner or {}).get("pad_level", -8))))
    elif key == "pulse":
        for s in q.sections:
            if value == "chord":
                s.fig_mode, s.figure, s.fig_floor = "chord", ["b 2 3 2 4 2 3 2", "b 2 3 2 4 3 2 3"], "G3"
            else:
                s.fig_mode = "pedal"
    elif key == "swing":
        # the owner's swing switch (recipes.SWING): every off-beat eighth, tune included
        import recipes as R
        if value not in R.SWING:
            raise SystemExit(f"swing: one of {', '.join(R.SWING)}")
        for s in q.sections:
            s.swing = R.SWING[value]
    elif key == "fig_order":
        if value not in ("circle", "cell"):
            raise SystemExit("fig_order: circle or cell")
        for s in q.sections:
            if getattr(s, "fig_mode", None) == "pedal":
                s.fig_order = value
    elif key == "pad_level":
        # the sustain's level against the pulse ([OWNER], recipes.OWNER["pad_level"]): -8 is the
        # calibrated level; -4 / 0 raise the sustain's bus by 4 / 8 dB (Piece.mix)
        import recipes as R
        lv = int(float(value))
        if lv not in R.PAD_LEVELS:
            raise SystemExit(f"pad_level: one of {R.PAD_LEVELS}")
        q.mix = {k: v for k, v in (q.mix or {}).items() if k not in ("pad", "ring", "bowed")}
        q.mix.update(R.sustain_mix((q.bed or {}).get("sustain", "pad"), lv))
    elif key == "air" and value == "legacy":
        # WHY a preset (audit defect 10): the plan's "air 0 vs 11" A/B needs the cap lifted too
        q.sound = dict(q.sound or {}, air_db=11.0, air_policy="as-written")
    elif key == "chords" and value == "plain":
        for s in q.sections:
            s.chords = [[T.PLAIN.get(c, c) for c in b] for b in (s.chords or [])] or None
    elif key.startswith("bed."):
        q.bed = dict(q.bed or {}, **{key[4:]: num(value)})
    elif key.startswith("sec."):
        for s in q.sections:
            setattr(s, key[4:], num(value))
    elif key.startswith("sound.") or key in _sound_keys():
        # WHY (integration, 2026-11-25): the sound's switches (engine/options.py: piano, pad_timbre,
        # air_db, damper_thump, ...) are most of the owner's A/Bs; they go into Piece.sound, which
        # wins over the environment and the style profile. Before this, `piano=salamander` was set
        # as a plain attribute nobody reads, and the B sketch came out identical to A.
        import options
        k = key[6:] if key.startswith("sound.") else key
        q.sound = dict(q.sound or {}, **options._parse(f"{k}={value}"))
        if k == "air_db" and float(value) > float(options.get("air_max_db", q)) and "air_policy" not in (piece.sound or {}):
            # WHY (audit defect 10): under the default cap, `air_db=11` in a sketch gave +1.5 dB,
            # so the plan's air A/B could not be made with one switch; asking for more than the cap
            # in a sketch means "as written"
            q.sound["air_policy"] = "as-written"
    elif key in ("narrator_tempo", "voice_busy", "under_voice"):
        # these shape the piece when the recipe BUILDS it (tempo, the chord grid, the dashboard's
        # target), so they cannot be flipped on a finished piece: rebuild with the environment
        raise SystemExit(f"{key} is applied when the recipe builds the piece: run "
                         f"SONGBOOK_OWNER={key}={value} render.sh <film> for the B version")
    else:
        if not hasattr(q, key):
            # WHY: a misspelt switch used to become an attribute nobody reads (B identical to A)
            raise SystemExit(f"unknown switch {key!r}: an [OWNER] switch (sustain, pulse, chords, fig_order, "
                             f"pad_level), air=legacy, a sound "
                             f"switch ({', '.join(_sound_keys())}), bed.<field>, sec.<field> or a Piece field")
        setattr(q, key, num(value))
    q.owner = dict(q.owner or {}, **({key: value} if key in ("sustain", "pulse", "chords", "fig_order", "pad_level", "swing") else {}))
    return q


def _ffmpeg():
    import shutil
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is not installed")


def _voice_track(piece, n, sr):
    """Her voice on the piece's clock (Piece.voice_mux: path, t_from, start_at), or None."""
    import soundfile as sf
    vm = getattr(piece, "voice_mux", None)
    if not vm:
        return None
    v, vsr = sf.read(vm["path"], dtype="float64", always_2d=True)
    if vsr != sr:
        from scipy.signal import resample_poly
        v = resample_poly(v, sr, vsr, axis=0)
    if v.shape[1] == 1:
        v = np.repeat(v, 2, axis=1)
    out = np.zeros((n, 2))
    a = int(round(float(vm.get("start_at", 0.0)) * sr))
    b = int(round(float(vm.get("t_from", 0.0)) * sr))
    seg = v[b:b + max(0, n - a)]
    out[a:a + len(seg)] = seg[: n - a]
    return out


def window(piece, y, sr, start, length, lag):
    """The window of the piece a sketch keeps, on the PICTURE's clock: picture time t (from
    `start`) hears the music at start + t - lag (music `lag` s after the picture; never before it),
    and her voice (Piece.voice_mux) unshifted, mixed at voice_mux's music_db and limited."""
    n = int(round(length * sr))
    t0 = int(round((start - lag) * sr))
    seg = np.zeros((n, 2))
    lo, hi = max(0, t0), min(len(y), t0 + n)
    if hi > lo:
        seg[lo - t0:hi - t0] = y[lo:hi]
    if getattr(piece, "voice_mux", None):
        # WHY voicemix.mux (2026-11-27): her voice treated and levelled, the music set by the gap,
        # the same mux the narrator checks measure (it was the raw voice at music_db)
        import voicemix
        v, g = voicemix.mux(piece, y, sr)
        if len(v) < int(round((start + length) * sr)) + 1:
            v = np.vstack([v, np.zeros((int(round((start + length) * sr)) + 1 - len(v), 2))])
        seg = seg * g + v[int(round(start * sr)):int(round(start * sr)) + n]
        pk = np.abs(seg).max()
        if pk > 0.89:
            seg *= 0.89 / pk                     # WHY: a plain gain, not a limiter: the sketch must not pump
    f_in, f_out = int(0.05 * sr), int(0.5 * sr)
    seg[:f_in] *= np.linspace(0, 1, f_in)[:, None]
    if start + length < piece.length - 0.05:
        seg[-f_out:] *= np.linspace(1, 0, f_out)[:, None]
    return seg


def sketch(pieces_, switches, start=0.0, length=15.0, picture=None, pic_from=None, lag=0.10, out_dir=None):
    """THE FEEL SKETCH (the owner's process, R1: palette, then two short sketches per film, then the
    score). Renders each piece whole, keeps `length` s from `start` with the music `lag` s after the
    picture (0.05-0.15; his pick on "Own everything" was the music about 0.15 s after), and writes
    <name>-sketch.mp3 and, with a picture, <name>-sketch.mp4 (the picture's own sound replaced; under
    a narrator, her voice from voice_mux plus the music). Two feels = two pieces, named together:
    `render.sh --sketch feel-a feel-b from=12 picture=film.mp4`. With switches (k=v) each piece is
    also rendered with them changed (B), for a one-switch A/B."""
    import subprocess
    import soundfile as sf
    import build
    from dsp import SR
    if not 0.0 <= lag <= 0.25:
        raise SystemExit("lag: 0 to 0.25 s (the music lands just after the picture, never before it)")
    _ffmpeg()
    d = out_dir or os.path.join(OUT, "sketches")
    os.makedirs(d, exist_ok=True)
    L = [f"SKETCHES: {length:g} s from {start:g} s, music {1000 * lag:.0f} ms after the picture"
         + (f", over {picture}" + (f" from {pic_from:g} s" if pic_from is not None else "") if picture else "")]
    todo = []
    for piece in pieces_:
        a = copy.deepcopy(piece)
        a.name = piece.name + "-sketch" + ("-A" if switches else "")
        todo.append(a)
        if switches:
            b = piece
            for k, v in switches:
                b = apply_switch(b, k, v)
            b.name = piece.name + "-sketch-B"
            todo.append(b)
    for q in todo:
        wav = os.path.join(d, q.name + "-whole.wav")
        _, st = build.one(q, path=wav)
        y, _ = sf.read(wav, dtype="float64", always_2d=True)
        seg = window(q, y, SR, start, length, lag)
        cut = os.path.join(d, q.name + ".wav")
        sf.write(cut, seg, SR, subtype="PCM_24")
        mp3 = os.path.join(d, q.name + ".mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", cut, "-b:a", "256k", mp3], check=True)
        L.append(f"   {q.name}: {mp3}")
        if picture:
            mp4 = os.path.join(d, q.name + ".mp4")
            ps = start if pic_from is None else pic_from
            # WHY the picture's sound dropped even under a narrator: the sketch's audio already has
            # her voice from voice_mux, on the picture's clock, with the music at its mux level
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{ps:g}", "-t", f"{length:g}", "-i", picture,
                            "-i", cut, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "18",
                            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-t", f"{length:g}", mp4], check=True)
            L.append(f"   {q.name}: {mp4}")
        L += ["      " + x for x in D.text(q.name, st["hard"], st["dashboard"], q)]
    return L


SHELF = os.path.normpath(os.path.join(HERE, "..", "reference", "shelf.json"))
AUDIO_KEYS = (("tilt_db_per_oct", "tilt"), ("band_2k_5k_db", "2-5k"), ("band_5k_16k_db", "5-16k"),
              ("momentary_swing_1s_p90_db", "1s-swing"), ("width_side_to_mid_db", "width"))


def _audio(path, cache):
    """The deck's audio measurements of one file (elements_review.analyse_file), cached by mtime."""
    import elements_review as ER
    key = f"{path}|{os.path.getmtime(path):.0f}"
    if key not in cache:
        r = ER.analyse_file(path)
        cache[key] = {k: r.get(k) for k, _ in AUDIO_KEYS}
    return cache[key]


def shelf(pieces_):
    """THE REFERENCE SHELF (the owner's R2): the clips he approved by ear (reference/shelf.json,
    reference/README.md), measured the same way as a new piece, printed side by side. A new
    piece's unity readings come from its last render (out/films/<name>.json); the shelf's
    note-based readings are the mix analysis's numbers (2026-11-25), its audio readings are
    measured here. Numbers to read, not targets."""
    shelf_ = json.load(open(SHELF))
    cpath = os.path.join(OUT, "shelf-cache.json")
    try:
        cache = json.load(open(cpath))
    except (OSError, ValueError):
        cache = {}
    cols = []
    for p in pieces_:
        jp = os.path.join(OUT, "films", p.name + ".json")
        wav = os.path.join(OUT, "films", p.name + ".wav")
        if not os.path.exists(jp):
            jp, wav = os.path.join(OUT, p.name + ".json"), os.path.join(OUT, p.name + ".wav")
        if not (os.path.exists(jp) and os.path.exists(wav)):
            raise SystemExit(f"no render of {p.name}: run render.sh {p.name} first")
        st = json.load(open(jp))
        notes = {r["id"]: str(r["value"]) for r in st.get("dashboard", []) if r.get("group") == "unity"}
        cols.append((p.name, notes, _audio(wav, cache)))
    for e in shelf_["clips"]:
        path = os.path.expanduser(e["path"]) if e["path"].startswith("~") else os.path.normpath(os.path.join(os.path.dirname(SHELF), e["path"]))
        if not os.path.exists(path):
            cols.append((e["id"], dict(e.get("readings", {})), {"_missing": path}))
            continue
        cols.append((e["id"], dict(e.get("readings", {})), _audio(path, cache)))
    with open(cpath, "w") as f:
        json.dump(cache, f, indent=1)
    L = ["READINGS NEXT TO THE SHELF (numbers to read, never targets; audio measured here the deck's way, "
         "note readings: the piece's last render and, for the shelf, the mix analysis of 2026-11-25; '-' = not measured)"]
    aud = [lab for _, lab in AUDIO_KEYS]
    nts = ("tune-duty", "above-tune", "levels-together")
    L.append(f"   {'':<17}" + "".join(f"{h:>9}" for h in aud) + "".join(f"{h:>17}" for h in nts))
    for name, nt, au in cols:
        av = ["missing" if "_missing" in au else ("-" if au.get(k) is None else str(au.get(k))) for k, _ in AUDIO_KEYS]
        nv = [str(nt.get(k, "-"))[:16] for k in nts]
        L.append(f"   {name[:17]:<17}" + "".join(f"{v:>9}" for v in av) + "".join(f"{v:>17}" for v in nv))
    for name, nt, au in cols[:len(pieces_)]:
        L.append(f"   {name}, all its unity readings: " + "; ".join(f"{k} {v}" for k, v in nt.items()))
    for e in shelf_["clips"]:
        L.append(f"   {e['id']}: {e['why']}")
    return L


def deliver(piece, out_dir, picture=None, start=0.0):
    """THE DELIVERABLES: <out_dir>/<name>-music.mp3 (256k) from the last render, and with a
    picture, <out_dir>/<name>.mp4: the picture from `start` s for the piece's length with its sound
    REPLACED by the music, or, for a narrated piece (voice_mux), her voice treated and levelled
    plus the music at the narrator gap (voicemix.mux, the same mux the narrator checks measure).
    WHY (first-shot b, c, d): three composers muxed by hand with ffmpeg, each a little differently
    (one summed voice and music with no limiter)."""
    import shutil
    import subprocess
    wav = os.path.join(OUT, "films", piece.name + ".wav")
    if not os.path.exists(wav):
        wav = os.path.join(OUT, piece.name + ".wav")
    if not os.path.exists(wav):
        raise SystemExit(f"no render of {piece.name}: run render.sh {piece.name} first")
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is not installed")
    os.makedirs(out_dir, exist_ok=True)
    L = []
    mp3 = os.path.join(out_dir, piece.name + "-music.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-b:a", "256k", mp3], check=True)
    L.append(f"   music: {mp3}")
    if picture:
        mp4 = os.path.join(out_dir, piece.name + ".mp4")
        vm = getattr(piece, "voice_mux", None)
        cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:g}", "-t", f"{piece.length:g}", "-i", picture, "-i", wav]
        if vm:
            # WHY a mix made here (2026-11-27): the picture's own sound is her RAW voice; the mux
            # the checks measure is voicemix.mux (her voice treated and levelled, the music set by
            # the gap), so that mix is written and used instead
            import soundfile as sf
            import voicemix
            y, sr_ = sf.read(wav, dtype="float64", always_2d=True)
            v, g_lin = voicemix.mux(piece, y, sr_)
            mixed = y * g_lin + v
            pk = float(np.abs(mixed).max())
            if pk > 0.89:
                mixed *= 0.89 / pk                  # a plain gain, never a pumping limiter
            mixwav = os.path.join(out_dir, piece.name + "-mix.wav")
            sf.write(mixwav, mixed, sr_, subtype="PCM_24")
            cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:g}", "-t", f"{piece.length:g}", "-i", picture,
                   "-i", mixwav, "-map", "0:v", "-map", "1:a"]
            gv, gm = voicemix.levels(piece, y, sr_)
            L.append(f"   picture: {mp4} (her voice treated, {gv:+.1f} dB; the music {gm:+.1f} dB; {mixwav})")
        else:
            cmd += ["-map", "0:v", "-map", "1:a"]
            L.append(f"   picture: {mp4} (the picture's sound replaced by the music)")
        # WHY re-encode the video: a stream copy from a cut point starts on the nearest keyframe
        cmd += ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k",
                "-t", f"{piece.length:g}", mp4]
        subprocess.run(cmd, check=True)
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
        rg = next((r.split("=", 1)[1] for r in rest if r.startswith("range=")), None)
        rg = tuple(float(x) for x in rg.split("-")) if rg else None
        for p in resolve([r for r in rest if not r.startswith("range=")]):
            print("\n".join(brief(p, rg)))
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
    elif cmd == "--deliver":
        kv = dict(r.split("=", 1) for r in rest if "=" in r)
        pos = [r for r in rest if "=" not in r]
        if len(pos) != 2:
            raise SystemExit("render.sh --deliver <film> <out_dir> [picture=film.mp4] [from=SECONDS]")
        for p in resolve(pos[:1]):
            print("\n".join(deliver(p, pos[1], kv.get("picture"), float(kv.get("from", 0.0)))))
    elif cmd == "--sketch":
        names = [r for r in rest if "=" not in r]
        kv = [tuple(r.split("=", 1)) for r in rest if "=" in r]
        opts = {k: v for k, v in kv if k in ("from", "len", "picture", "pic_from", "lag", "out")}
        sw = [(k, v) for k, v in kv if k not in opts]
        print("\n".join(sketch(resolve(names), sw, start=float(opts.get("from", 0.0)),
                               length=float(opts.get("len", 15.0)), picture=opts.get("picture"),
                               pic_from=float(opts["pic_from"]) if "pic_from" in opts else None,
                               lag=float(opts.get("lag", 0.10)), out_dir=opts.get("out"))))
    elif cmd == "--shelf":
        print("\n".join(shelf(resolve(rest) if rest else [])))
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
