"""Round 10 feel sketches, "book": the storybook fairytale under its narrator (quick, mischievous,
British), the stretch from "However, recently..." through "...artificial intelligence." (the turn
on "wonderful"). Two 15 s sketches that answer the owner's doubt about her voice against our music
("she just seems to fast/harsh for our music selection maybe") in two honest ways:

  book-a  MEET HER: a warmer, fuller, slightly livelier bed (124 bpm, gently swung, an even
          eighth-note piano figure that follows the chords above her range, the chords ringing
          on the same piano underneath); her voice untouched.
  book-b  GIVE HER ROOM: a calm bed (120 bpm, straight, only three soft piano notes a bar that
          follow the chords, the soft pad holding underneath), her pauses a little longer, and her
          voice sat back 1.5 dB and gently de-harshened (EQ below).

Nobody here can hear: everything below was decided from word timings, the picture's measured
cuts and the note list, and nothing claims it sounds good.

THE WINDOW (round6/fairytale-book.mp4; its sound is voice-take1-lily.wav on the same clock,
measured: correlation 1.0000 at 0 ms). Sketch time 0 = film frame 628 (20.933 s), the cut where the
page starts to turn, just after "...the cost of convenience." Measured cuts in the stretch: 20.933
(the page turns), 26.233 (the corporations at their table), 33.300 (the quill). The turn: the
picture's glow starts on "wonderful" (24.39 s) and is steepest about 25.0 s.

HER PAUSES (the only edit to her: silence inserted, speed and pitch untouched, the picture held on
a still frame for exactly as long):
  after "happened." (inserted at 25.633 s, frame 768 held; that frame is still: motion 0.23)
  after "intelligence." (inserted at 33.167 s, frame 994 held; motion 0.3)
WHY these lengths: they put the picture's cuts on the music's bar lines (his A2 pick, "the cut
re-timed so every cut lands on a bar line"), within the brief's "up to about 0.7 s":
  A at 124.14 bpm (bar 1.933 s): +0.500 s and +0.667 s -> the cuts at 0, 5.800 (bar 4), 13.533 (bar 8)
  B at 120 bpm (bar 2.000 s):    +0.700 s and +0.433 s -> the cuts at 0, 6.000 (bar 4), 13.500 (bar 7, beat 4:
                                 a bar line needs +0.933 s, more than the brief allows)
Her voice before 21.10 s (the tail of "convenience.") and after 33.15 s ("A technology...") is
silent in the sketch: the stretch is "However" to "intelligence."

Make the edited voice and picture first (out/r10-book/), then the sketches and the delivery:
    render.sh --py film_r10_book.py prep
    render.sh --notes r10_book
    render.sh --sketch book-a picture=<out/r10-book/picture-a.mp4> lag=0.12  (and book-b)
    render.sh --py film_r10_book.py deliver
"""
import json as _json
import os as _os

import numpy as _np

import recipes as R
from films import Film, speech_from_words

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_FILM_DIR = _os.path.normpath(_os.path.join(_HERE, "..", "..", "..", "film"))
WORDS = _os.path.join(_FILM_DIR, "src", "round2", "take1-words-lily.json")
VOICE = _os.path.join(_FILM_DIR, "public", "audio", "voice-take1-lily.wav")
PICTURE = "/home/destin/Documents/youcoded-campaign/round6/fairytale-book.mp4"
WORK = _os.path.normpath(_os.path.join(_HERE, "..", "out", "r10-book"))
DELIVER = "/home/destin/Documents/youcoded-campaign/round10/sketches"
FPS = 30
F0 = 628                       # the page-turn cut (20.933 s): sketch time 0
HOLD_AT = (768, 994)           # frames held (still frames inside her two sentence-end pauses)
V_ON, V_OFF = 21.10, 33.15     # her stretch in the voice file ("However" 21.38 to "intelligence." 33.04)
LENGTH = 15.0
LAG = 0.12                     # music after the picture (his A1 pick was about 0.15 s; the brief 0.05-0.15)

# per sketch: tempo, the two holds in frames, the music's level under her (voice_mux music_db)
SPEC = {
    # WHY -11.5 for A (first try -10): her last word, "intelligence.", trails off; at -10 the fuller
    # bed sat only 5.0 dB under it (0.5 s windows, 300 Hz-8 kHz). One level for the whole sketch,
    # set by hand, never a dip on the word: -11.5 keeps that word 6.5 dB over the music
    "a": dict(bpm=240.0 / (5.8 / 3), holds=(15, 20), music_db=-11.5, voice_eq=False),
    # WHY -10 for B: "her voice sat back" = 1.5 dB less voice over the music than A
    "b": dict(bpm=120.0, holds=(21, 13), music_db=-10.0, voice_eq=True),
}


def edit_time(t, holds):
    """A time in her file / the film -> sketch time, with the pauses inserted."""
    e = t - F0 / FPS
    for f, h in zip(HOLD_AT, holds):
        if t >= (f + 1) / FPS - 1e-9:
            e += h / FPS
    return e


def _words(key):
    """Her words in the stretch on the sketch's clock (written to out/r10-book/words-<key>.json, the
    file the speech map and its checks read)."""
    holds = SPEC[key]["holds"]
    allw = _json.load(open(WORDS))
    w = [dict(w=x["w"], start=round(edit_time(x["start"], holds), 4), end=round(edit_time(x["end"], holds), 4))
         for x in allw if x["start"] >= V_ON and x["end"] <= V_OFF]
    _os.makedirs(WORK, exist_ok=True)
    path = _os.path.join(WORK, f"words-{key}.json")
    txt = _json.dumps(w, indent=0)
    if not _os.path.exists(path) or open(path).read() != txt:
        with open(path, "w") as f:
            f.write(txt)
    return path


def _biquad(kind, f0, db, q, sr):
    """RBJ cookbook peaking / high-shelf coefficients."""
    A = 10 ** (db / 40)
    w = 2 * _np.pi * f0 / sr
    cw, sw = _np.cos(w), _np.sin(w)
    if kind == "peak":
        al = sw / (2 * q)
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    else:                                   # high shelf, slope 1
        al = sw / 2 * _np.sqrt(2)
        sA = 2 * _np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sA)]
        a = [(A + 1) - (A - 1) * cw + sA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sA]
    return _np.array(b) / a[0], _np.array(a) / a[0]


def make_voice(key):
    """Her stretch on the sketch's clock: silence before 21.10 s and after 33.15 s (20 ms fades),
    silence inserted at the two held frames, nothing else moved. B also gets the gentle EQ:
    -3 dB at 3.2 kHz (Q 1.0, the presence band where a bright read sounds hard) and a -2 dB high
    shelf from 7 kHz (the 's' and breath edge). No compression, no speed or pitch change."""
    import soundfile as sf
    from scipy.signal import lfilter
    sp = SPEC[key]
    v, sr = sf.read(VOICE, dtype="float64", always_2d=True)
    v = v.mean(axis=1)
    g = _np.zeros_like(v)
    a, z = int(V_ON * sr), int(V_OFF * sr)
    g[a:z] = 1.0
    r = int(0.02 * sr)
    g[a:a + r] = _np.linspace(0, 1, r)
    g[z - r:z] = _np.linspace(1, 0, r)
    v = v * g
    if sp["voice_eq"]:
        for kind, f0, db, q in (("peak", 3200.0, -3.0, 1.0), ("shelf", 7000.0, -2.0, 0.7)):
            b, aa = _biquad(kind, f0, db, q, sr)
            v = lfilter(b, aa, v)
    parts, last = [], int(round(F0 / FPS * sr))
    for f, h in zip(HOLD_AT, sp["holds"]):
        cut = int(round((f + 1) / FPS * sr))
        parts += [v[last:cut], _np.zeros(int(round(h / FPS * sr)))]
        last = cut
    parts.append(v[last:])
    out = _np.concatenate(parts)[: int(round((LENGTH + 2.0) * sr))]
    path = _os.path.join(WORK, f"voice-{key}.wav")
    _os.makedirs(WORK, exist_ok=True)
    sf.write(path, out, sr, subtype="PCM_24")
    return path


def make_picture(key):
    """The picture on the sketch's clock: frames 628..768, frame 768 held, 769..994, frame 994 held,
    then on to 15 s (ffmpeg trim + tpad clone, re-encoded; no audio)."""
    import subprocess
    h2, h3 = SPEC[key]["holds"]
    n = int(LENGTH * FPS)
    a = HOLD_AT[0] + 1 - F0
    b = HOLD_AT[1] - HOLD_AT[0]
    c = n - (a + h2) - (b + h3)
    fc = (f"[0:v]trim=start_frame={F0}:end_frame={HOLD_AT[0] + 1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop={h2}[a];"
          f"[0:v]trim=start_frame={HOLD_AT[0] + 1}:end_frame={HOLD_AT[1] + 1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop={h3}[b];"
          f"[0:v]trim=start_frame={HOLD_AT[1] + 1}:end_frame={HOLD_AT[1] + 1 + c},setpts=PTS-STARTPTS[c];"
          "[a][b][c]concat=n=3:v=1:a=0,fps=30[v]")
    path = _os.path.join(WORK, f"picture-{key}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", PICTURE, "-filter_complex", fc, "-map", "[v]",
                    "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-frames:v", str(n), path], check=True)
    return path


def _piece(key):
    sp = SPEC[key]
    bpm, holds = sp["bpm"], sp["holds"]
    speech = speech_from_words(_words(key), 0.0, start_at=0.0)
    bar = 240.0 / bpm
    land = R.land_after(9, bpm, "short")      # the body runs past the 15 s window; the ending is never heard
    cuts = [round(edit_time(f / FPS, holds), 3) for f in (F0, 787, 999)]
    brief = R.Brief("narrated", round(land + 2.0, 3), ("storybook", "warm", "mischievous", "hopeful"), "subtle",
                    moments=[(round(edit_time(24.394, holds), 3), "wonderful")],
                    picture=[(cuts[0], "the page turns"), (cuts[1], "the corporations"), (cuts[2], "the quill")],
                    logo_at=land)
    # WHY these chords (one per sentence, placed by the recipe on her sentence ends, the nearest
    # half-bar): C minor 9 for "However, recently..." (still the old story), A-flat major 9 from the
    # end of "recently..." (lifting, the held breath of her ellipsis), E-flat major 9 from the end
    # of "...something truly wonderful happened." (the turn, the home chord, as the page's glow
    # completes), and B-flat 9sus after "...artificial intelligence." (unresolved: her story goes
    # on to "a technology they believed would bring about a great treasure"). Ab -> Eb is the
    # plagal step; every change keeps notes of the last chord (Eb and G or Bb in each).
    chords = ["Cm9", "Abmaj9", "Ebmaj9", "Bb9sus"]
    turn_bar = R.Grid(bpm).moment_bar(edit_time(25.408, holds))
    common = dict(land=land, speech=speech, bpm=bpm, chords=chords, brief=brief, subtle=True, ending="short",
                  changes=[(turn_bar, "family", "bright")], seed=10,
                  # WHY no tune: she speaks until 12.6-12.8 s and the window ends at 15 s, so the
                  # recipe's after-her-words phrase would be a two-second fragment cut by the fade
                  # (the brief: a line or nothing; "it may be absent when it would be forced")
                  tune=[],
                  voice_mux=dict(path=_os.path.join(WORK, f"voice-{key}.wav"), t_from=0.0, start_at=0.0,
                                 music_db=sp["music_db"]))
    if key == "a":
        p = R.narrated(
            "book-a", round(land + 2.0, 3),
            # WHY the chord-following figure, gently swung, and the ringing piano (his E2 "both C
            # and D"; "ring" keeps every layer on the one piano): her read is quick and bright, so
            # this answer meets it with an even eighth-note line instead of the near-still two-note
            # pulse, one instrument from bass to top
            owner_over=dict(pulse="chord", swing="gentle", sustain="ring"), touch=0.28,
            notes="round 10 book A: meet her energy; 124 bpm, swung chord figure above her range, ringing piano",
            **common)
    else:
        p = R.narrated(
            "book-b", round(land + 2.0, 3),
            owner_over=dict(pulse="chord", swing="straight", sustain="pad"), touch=0.24,
            notes="round 10 book B: give her room; 120 bpm, three soft chord notes a bar, the pad, voice softened",
            **common)
    for s in p.sections:
        # WHY the figure's floor at E-flat 5 (both): the chord figure's tones 2-4 then sit F5-C6,
        # above her range (F3-E5) the whole time she speaks, the same place recipe C's high pulse
        # sits, while every note comes from the chord the bass and the held layer play (rule 1: one
        # harmonic plan; recipe C's fixed B-flat/F pool ignores the chords). The "b" token stays the
        # chord's low root (C2-B-flat 2), under her.
        s.fig_floor = "Eb5"
        if key == "b":
            # WHY three notes a bar for B (a calm film gets fewer notes, not just quieter ones): the
            # low root on beat 1, held, and two high chord tones on beats 3 and 4, about 1.5 notes a
            # second against A's 4
            s.figure = ["b - - - 3 - 2 -", "b - - - 2 - 3 -"]
    return p


PIECE_A = _piece("a")
PIECE_B = _piece("b")
FILMS = [Film("book-a", PIECE_A, picture=PIECE_A.brief.picture, copy_to=None),
         Film("book-b", PIECE_B, picture=PIECE_B.brief.picture, copy_to=None)]


def deliver():
    """book-a.mp4 / book-b.mp4 from the sketches (out/sketches/book-?-sketch.wav): a plain gain to
    -16 LUFS (no limiter, so nothing pumps), refused if the true peak would pass -1 dBTP; the
    edited picture; book.json."""
    import subprocess
    import pyloudnorm as pyln
    import soundfile as sf
    from scipy.signal import resample_poly
    _os.makedirs(DELIVER, exist_ok=True)
    rep = {}
    for key in ("a", "b"):
        y, sr = sf.read(_os.path.join(_HERE, "..", "out", "sketches", f"book-{key}-sketch.wav"), always_2d=True)
        lu = pyln.Meter(sr).integrated_loudness(y)
        y = y * 10 ** ((-16.0 - lu) / 20)
        tp = 20 * _np.log10(_np.abs(resample_poly(y, 4, 1, axis=0)).max())
        if tp > -1.0:
            raise SystemExit(f"book-{key}: true peak {tp:.2f} dBTP at -16 LUFS; not delivered")
        wav = _os.path.join(WORK, f"book-{key}-16.wav")
        sf.write(wav, y, sr, subtype="PCM_24")
        mp4 = _os.path.join(DELIVER, f"book-{key}.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", _os.path.join(WORK, f"picture-{key}.mp4"), "-i", wav,
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                        "-t", f"{LENGTH:g}", mp4], check=True)
        rep[key] = (round(pyln.Meter(sr).integrated_loudness(y), 2), round(tp, 2))
        print(f"book-{key}: {mp4}  {rep[key][0]} LUFS, true peak {rep[key][1]} dBTP")
    return rep


if __name__ == "__main__":
    import sys
    if "prep" in sys.argv:
        for k in ("a", "b"):
            print(make_voice(k), make_picture(k))
    if "deliver" in sys.argv:
        deliver()
