"""TIMING (the rebuild, 2026-11-24): everything about WHEN, measured before a note is written.

  * fit_tempo(hits, bpm_range)  - the tempo (and where bar 1 starts) that puts the picture's
                                  moments on the beat grid; prints the 3 best with the error at
                                  every hit, in ms and in frames (toolkit-plan a2, d3).
  * narrator_band(syl_per_s)    - the tempo band under a narrator: syllables x 60 / 3 to / 2,
                                  and the value in it nearest 120 (a2).
  * motion_grid(...)            - frames per beat / eighth / sixteenth for the editor (d3).
  * phrase_ends(speech)         - her sentence and clause ends and her pauses (a1).
  * pink_line(...)              - ONE shared timing deviation for the whole band, 1/f ("pink")
                                  noise, replacing per-note random nudges (d1).
  * rit_curve(...)              - the final ritardando's shape, v = [1 + (v_end^q - 1) x]^(1/q) (d4).
  * PERCEIVED                   - how late a soft note is HEARD after it starts (d3b), measured.

WHY a module of its own: in rounds 6-8 the tempo was chosen last and by hand, the band's timing
was independent white noise per note (heard as random, not placed), and under the narrator the
beat followed her syllables (too busy). The research (what-we-learned.md items 8-10) says: choose
the tempo from the picture and the voice first, shape timing by phrase, hit very few moments.
"""
import math

import numpy as np

# ---------------------------------------------------------------- the shared time line (d1)


def pink_line(n, seed, sd_ms=5.0, white_share=0.45):
    """A deviation in seconds for each of n sixteenths: mostly 1/f noise (slow, correlated drift
    the way a real player's timing wanders) plus a smaller white part (which gives successive
    intervals the slight negative correlation measured in real drumming, lag-1 about -0.4).
    WHY 1/f: listeners prefer it to both white noise and no deviation (Hennig 2011); WHY shared:
    one band breathing together reads as placed, independent nudges per note read as random."""
    if n <= 0:
        return np.zeros(0)
    rng = np.random.default_rng(seed)
    m = max(16, 1 << int(math.ceil(math.log2(n + 1))))
    f = np.fft.rfftfreq(m)
    spec = np.fft.rfft(rng.standard_normal(m)) / np.sqrt(np.maximum(f, 1.0 / m))
    pink = np.fft.irfft(spec, m)[:n]
    pink = (pink - pink.mean()) / (pink.std() + 1e-12)
    white = rng.standard_normal(n)
    x = np.sqrt(1 - white_share ** 2) * pink + white_share * white
    x = x / (x.std() + 1e-12)
    return np.clip(x, -2.5, 2.5) * sd_ms / 1000.0


def line_sd_ms(bpm):
    """Timing spread for the shared line: 4-6 ms, a little less when the music is slower (a slow
    soft bed has less to carry it, so a wander is more audible)."""
    return float(np.clip(5.0 * bpm / 120.0, 4.0, 6.0))


# ---------------------------------------------------------------- the final ritardando (d4)

RIT_Q = 2.5     # WHY 2.5: Friberg & Sundberg's runner's-stop curve; listeners rated q 2-3 best


def rit_curve(x, v_end, q=RIT_Q):
    """Tempo factor at fraction x (0..1) of the slowing span: 1 at the start, v_end at the end,
    slowing late rather than in a straight line (a brand tag, not a classical stop)."""
    x = np.clip(x, 0.0, 1.0)
    return (1.0 + (v_end ** q - 1.0) * x) ** (1.0 / q)


# ---------------------------------------------------------------- perceived attack (d3b)

# Seconds from a note's start to 50 % of its peak energy (how late it is HEARD), measured on the
# songbook's own felt piano (engine/sounds.felt_piano, E-flat 4, dry, with the 2026-11-24 engine) by
# measure_attacks() below on 2026-11-24. WHY a table and not a live measurement: the note dump
# runs without loading any sample, and it must place notes exactly where the render does.
# Bowed strings speak 50-100 ms late (perceptual attack time studies); the pad is never a hit.
PERCEIVED = {"piano": [(0.15, 0.0175), (0.30, 0.0174), (0.45, 0.0174), (0.60, 0.0173)],
             "pizz": [(0.3, 0.006), (0.6, 0.005)],
             "bowed": [(0.3, 0.080), (0.6, 0.050)]}


def perceived_delay(voice, touch):
    pts = PERCEIVED.get(voice) or PERCEIVED["piano"]
    xs, ys = zip(*pts)
    return float(np.interp(touch, xs, ys))


def measure_attacks(touches=(0.15, 0.30, 0.45, 0.60), m=63):
    """Re-measure PERCEIVED["piano"] from the samples (needs the recordings): the time from the
    note's first sample to 50 % of its peak 5 ms-RMS energy. Run by hand when the piano changes:
    python -I src/timing.py --attacks"""
    import sounds
    from dsp import SR
    out = []
    for v in touches:
        x = sounds.felt_piano(m, v, 1.0).mean(axis=1)
        e = np.convolve(x ** 2, np.ones(int(0.005 * SR)) / int(0.005 * SR), mode="same")
        out.append((v, round(float(np.argmax(e >= 0.5 * e.max()) / SR), 4)))
    return out


# ---------------------------------------------------------------- the narrator (a1, a2)


def narrator_band(syl_per_s, pick="near120"):
    """The tempo band under a narrator: from her syllable rate / 3 to / 2 beats a second (a beat
    every 2 or 3 syllables), and the value chosen in it. pick="near120" (the default) takes the
    value nearest 120 bpm, music's own resting pace; pick="stress" takes her stressed-syllable
    rate (syllables / 2, the round-8 rule). [OWNER] A/B: 115 against 138 at her usual pace.
    WHY near 120: speech stresses come at 1.5-2.5 Hz (Bernardo 2024) and music's home is about
    2 Hz (Ding 2017); a beat on every second syllable put the pulse in her own rhythm."""
    lo, hi = syl_per_s * 60 / 3, syl_per_s * 60 / 2
    bpm = float(np.clip(120.0, lo, hi)) if pick == "near120" else hi
    return dict(lo=round(lo, 1), hi=round(hi, 1), bpm=round(bpm * 2) / 2)


def phrase_ends(speech, min_pause=0.3):
    """Her sentence and clause ends and pauses, from speech_from_words(...): a list of dicts
    (t = when her phrase ends, pause = seconds of silence after it, word, kind = 'sentence' after
    . ! ? or a pause >= 1 s, 'clause' after , ; : or a pause >= 0.3 s)."""
    words = list(getattr(speech, "words", []) or [])
    out = []
    for (w, a, b), nxt in zip(words, words[1:] + [None]):
        gap = (nxt[1] - b) if nxt else 99.0
        punct = w.rstrip()[-1:] if w else ""
        if punct in ".!?" or gap >= 1.0:
            kind = "sentence"
        elif punct in ",;:" or gap >= min_pause:
            kind = "clause"
        else:
            continue
        out.append(dict(t=round(b, 3), pause=round(gap, 3), word=w, kind=kind))
    return out


def pauses(speech, at_least=1.0):
    """(start, end) of her pauses of at least `at_least` seconds, and after her last word."""
    words = list(getattr(speech, "words", []) or [])
    out = [(round(b, 3), round(nxt[1], 3)) for (_, _, b), nxt in zip(words, words[1:])
           if nxt[1] - b >= at_least]
    if words:
        out.append((round(words[-1][2], 3), 1e9))
    return out


# ---------------------------------------------------------------- fitting the tempo (a2, d3)

ON_WINDOW = (-0.015, 0.045)     # perceived onset vs frame that counts as ON (ITU BT.1359, EBU R37)


def fit_tempo(hits, bpm_range=(100, 120), step=0.5, fps=30, top=3, ending_beats=4.0, rit=0.85, odd_bars=(0, 1, 2, 3),
              rits=None):
    """THE TEMPO FROM THE PICTURE. hits = [(seconds, weight, label)] (weight 3 = the peak and the
    logo, 1 = everything else; a narrator's phrase ends go in as weight-1 soft hits; a hit
    labelled "logo" is the name). THE PICTURE IS FIXED HERE: the editor's frames are the input and
    the music is fitted to them.
    Searched (toolkit-plan a2, d3, d4): every tempo in bpm_range (step 0.5); no odd bar, or ONE odd
    bar of 1 (a pick-up), 2 or 3 beats at ANY bar (`odd_at`); and the ending's slowing, ending at
    `rits` of the tempo (default 0.75, 0.8, 0.85; a short ending does not slow). Each hit is
    scored by its error to the nearest downbeat (weight 3) or half-beat (others). When the name is
    given, the tempo is moved to the one that lands it exactly after a whole number of bars and
    the slowing ending (what the tempo map will play), and every other hit is judged on that grid.
    WHY odd_at and the slowing searched (audit 2026-11-25, defect 9): with the odd bar fixed at
    bar 1 a picture cut at 7.9 / peak 19.3 / logo 31.0 s had no fit within 100 ms of its peak; an
    odd bar AFTER the peak moves the name without moving the peak, and a slower or faster
    ending moves the name alone.
    Returns the `top` best, each with the tempo to write (bpm, odd, odd_at, rit), every hit's
    error in ms and frames, and frames per beat at `fps`. A weight-3 hit is ON when the music is
    heard between 15 ms early and 45 ms late."""
    from recipes import Grid
    hits = [(float(h[0]), float(h[1] if len(h) > 1 else 1.0), (h[2] if len(h) > 2 else "")) for h in hits]
    logo = next((h for h in hits if h[2] == "logo"), None)
    if rits is None:
        rits = (1.0,) if rit >= 0.999 else (0.75, 0.8, 0.85)
    res = []
    for rv in rits:
        xs = np.linspace(0, ending_beats, 401)
        c = float(np.trapezoid(60.0 / rit_curve(xs / ending_beats, rv), xs))      # the ending's seconds x bpm
        for odd in odd_bars:
            for bpm0 in np.arange(bpm_range[0], bpm_range[1] + 1e-9, step):
                bpm = float(bpm0)
                n = None
                if logo is not None:
                    n = max(1, round(((logo[0] - c / bpm) * bpm / 60.0 - odd) / 4.0))
                    bpm = (60.0 * (4 * n + odd) + c) / logo[0]
                    if not bpm_range[0] - 3 <= bpm <= bpm_range[1] + 3:
                        continue
                beat = 60.0 / bpm
                nb = n if n is not None else int(max(h[0] for h in hits) / (4 * beat)) + 2
                for at in (range(1, nb + 2) if odd else (1,)):
                    G = Grid(bpm, odd, at)
                    downs = [G.start_beat(g) * beat for g in range(1, nb + 3)]
                    # WHY 0.5 (+0.1 away from bar 1): an odd bar only when it earns its place, and a
                    # pick-up at the start before one in the middle
                    cost, rows = ((0.5 + (0.1 if at > 1 else 0.0)) if odd else 0.0), []
                    for t, w, lab in hits:
                        if lab == "logo":
                            rows.append(dict(t=t, label=lab, weight=w, err_ms=0.0, err_frames=0.0,
                                             bar=(n or 0) + 1 + (1 if odd else 0), beat=1, on=True, logo=True))
                            continue
                        if w >= 3:
                            g = min(downs, key=lambda d: abs(d - t))
                        else:
                            g = round(t / (beat / 2)) * beat / 2
                        mv = g - t                              # the grid point vs the frame: + = music late
                        pen = abs(mv) if ON_WINDOW[0] <= mv <= ON_WINDOW[1] else 3 * abs(mv)
                        cost += w * pen
                        gb = G.bar_of_beat(g / beat + 1e-6)
                        rows.append(dict(t=t, label=lab, weight=w, err_ms=round(1000 * mv, 1), err_frames=round(mv * fps, 2),
                                         bar=int(gb), beat=round(1 + g / beat - G.start_beat(gb), 2),
                                         on=ON_WINDOW[0] <= mv <= ON_WINDOW[1]))
                    res.append(dict(bpm=round(bpm, 2), odd=odd, odd_at=(at if odd else None), rit=rv, bars=n,
                                    cost=round(cost, 4), rows=rows, frames_per_beat=round(fps * beat, 3),
                                    big_ok=all(r["on"] for r in rows if r["weight"] >= 3)))
    res.sort(key=lambda r: (not r["big_ok"], r["cost"]))
    out = []
    for r in res:
        if all(abs(r["bpm"] - o["bpm"]) >= 1.0 or r["odd"] != o["odd"] or r["rit"] != o["rit"] for o in out):
            out.append(r)
        if len(out) >= top:
            break
    return out


def fit_text(fits, fps=30):
    L = []
    for i, f in enumerate(fits):
        L.append(f"  {i + 1}. write bpm={f['bpm']:g}"
                 + (f", odd={f['odd']}, odd_at={f['odd_at']} (one {f['odd']}-beat bar as bar {f['odd_at']})" if f["odd"] else "")
                 + (f", rit={f['rit']:g}" if f.get("rit", 1.0) < 0.999 else "")
                 + (f": {f['bars']} bars of 4 + the ending" if f["bars"] else "")
                 + f"; {f['frames_per_beat']:g} frames a beat at {fps} fps"
                 + ("" if f["big_ok"] else "  -- a weight-3 hit is off: move the picture to the grid, or accept it"))
        for r in f["rows"]:
            if r.get("logo"):
                L.append(f"       {r['t']:7.2f} s  w{r['weight']:g}  the name: lands exactly (the ending slows into it)  {r['label']}")
                continue
            L.append(f"       {r['t']:7.2f} s  w{r['weight']:g}  bar {r['bar']} beat {r['beat']:<5g} "
                     f"{r['err_ms']:+7.1f} ms ({r['err_frames']:+.2f} frames)  {'on' if r['on'] else 'off'}  {r['label']}")
    return L


def motion_grid(bpm, fps=30, start=0.0, length=60.0, odd=0, odd_at=1):
    """THE MOTION GRID for the editor: frames per beat, eighth and sixteenth, and every beat's
    frame. WHY: a move that lasts a beat (500 ms at 120) or an eighth (250 ms), staggered by a
    sixteenth, sits in the music's time without the music having to chase the picture."""
    from recipes import Grid
    beat = 60.0 / bpm
    n = int((length - start) / beat) + 1
    G = Grid(bpm, odd, odd_at)
    # WHY through the grid: with an odd bar the bar lines after it move by its beats
    bars = [G.start_beat(g) for g in range(1, n // 4 + 3)]
    return dict(bpm=bpm, fps=fps, start_s=start, odd=odd, odd_at=(odd_at if odd else None),
                frames_per_beat=round(fps * beat, 4),
                frames_per_eighth=round(fps * beat / 2, 4), frames_per_sixteenth=round(fps * beat / 4, 4),
                beat_frames=[round((start + k * beat) * fps, 2) for k in range(n)],
                bar_frames=[round((start + b * beat) * fps, 2) for b in bars if start + b * beat <= length])


def card_hold(words):
    """Minimum time a text card must stay on screen: 0.2 s a word + 2 s (+3 s at 10 words or
    more), the broadcast clearance rule (BCAP/Clearcast)."""
    return 0.2 * words + 2.0 + (3.0 if words >= 10 else 0.0)


if __name__ == "__main__":
    import os
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine"))
    if "--attacks" in sys.argv:
        print(measure_attacks())
