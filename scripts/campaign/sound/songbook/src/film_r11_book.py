"""Round 11 balance test, "book": the storybook fairytale under its narrator, the same 15 s as round 10
("However, recently..." through "...artificial intelligence.", the turn on "wonderful").

His round-10 words (BOOK-1): "maybe a bit of both somehow lmao. i think i like both clips here quite
a bit, but her voice is still a bit too loud/harsh and the piano still doesn't quite strike the right
balance of blending and supporting her" ("nearly" on both). He also picked a calmer re-record
(VOICE-1); until it exists this is a balance test on the current read.

  book-a  A TRUE BLEND of round-10 A and B:
          from B: the calm 120 bpm, the soft held pad and the low bass under her, the bass waiting
                  until "However," has ended, her pauses and the picture timing exactly as B had them,
                  the turn's long E-flat chord (3 bars), the soft E-flat on the quill cut;
          from A: the moving upper line (A's own notes: the chords' tones repeated above her range),
                  gently swung, running in eighths in her pauses (A's run in the turn's pause and
                  its run down after "intelligence.");
          new:    while she speaks the line is slowed to ONE soft held note a bar (with the bass,
                  about one attack a second, the songbook's "Under a narrator" rule), never ticking;
                  her voice treated (voicemix.prep) plus a gentle de-harsh EQ, set 10 LU over the
                  music (round 10: 15-17 LU), so she is lower and the music is up.
  book-b  THE SAME with the piano further simplified: while she speaks only the pad and the bass
          (no upper notes at all); in her pauses two or three quarter notes instead of eighth runs.

Nobody here can hear: everything below was decided from word timings, the picture's measured cuts,
the note list and the readings. Nothing here claims it sounds good.

    render.sh --py film_r11_book.py prep        # her edited voice, the edited picture (out/r11-book/)
    render.sh --notes r11_book
    render.sh --sketch book11-a book11-b picture=<out/r11-book/picture.mp4> lag=0.12
    render.sh --py film_r11_book.py deliver     # round11/sketches/book-a.mp4, book-b.mp4
"""
import json as _json
import os as _os

import numpy as _np

import recipes as R
from films import Film, speech_from_words
# WHY reuse round 10's clock and EQ helpers: the brief for this round is "do not rebuild picture
# timing beyond what round 10 did", so the window, the held frames and the time map are B's, unchanged
from film_r10_book import (F0, FPS, HOLD_AT, LENGTH, PICTURE, V_OFF, V_ON, VOICE, WORDS, _biquad,
                           edit_time)

_HERE = _os.path.dirname(_os.path.abspath(__file__))
WORK = _os.path.normpath(_os.path.join(_HERE, "..", "out", "r11-book"))
DELIVER = "/home/destin/Documents/youcoded-campaign/round11/sketches"
LAG = 0.12
BPM = 120.0
HOLDS = (21, 13)               # round-10 B's inserted pauses (frames): the cuts on bars 1 and 4
# WHY 10 LU (the toolkit's default, said out loud): round 10 put her 15.4-17.3 LU over the music
# and he heard "too loud"; narration beds usually sit 8-12 LU under a voice. 10 lowers her and
# raises the music by about 5-6 LU relative to each other, the middle of that range
GAP_LU = 10.0
# WHY this EQ on top of voicemix.prep (which already does a de-esser and -1.5 dB at 3.4 kHz): he
# still heard "harsh" on round-10 B, which had -3 dB at 3.2 kHz and -2 dB above 7 kHz but no
# treatment. Measured, prep alone moves her 2-5 kHz only 0.1-0.2 dB. Two dB gentler than B's own
# dip at 3.2 kHz, because prep adds its own 1.5 dB next to it (about -3.5 dB combined, not -4.5)
VOICE_EQ = (("peak", 3200.0, -2.0, 1.0), ("shelf", 7000.0, -1.5, 0.7))


def _words():
    allw = _json.load(open(WORDS))
    w = [dict(w=x["w"], start=round(edit_time(x["start"], HOLDS), 4), end=round(edit_time(x["end"], HOLDS), 4))
         for x in allw if x["start"] >= V_ON and x["end"] <= V_OFF]
    _os.makedirs(WORK, exist_ok=True)
    path = _os.path.join(WORK, "words.json")
    txt = _json.dumps(w, indent=0)
    if not _os.path.exists(path) or open(path).read() != txt:
        with open(path, "w") as f:
            f.write(txt)
    return path


def make_voice():
    """Her stretch on the sketch's clock (round-10 B's edit: silence outside 21.10-33.15 s, the two
    pauses inserted, speed and pitch untouched) with the gentle EQ above. The treatment
    (voicemix.prep: high-pass, de-esser, levelling, -1.5 dB at 3.4 kHz) and her level are applied
    by the mux, the same way for the sketch, the checks and the delivery."""
    import soundfile as sf
    from scipy.signal import lfilter
    v, sr = sf.read(VOICE, dtype="float64", always_2d=True)
    v = v.mean(axis=1)
    g = _np.zeros_like(v)
    a, z = int(V_ON * sr), int(V_OFF * sr)
    g[a:z] = 1.0
    r = int(0.02 * sr)
    g[a:a + r] = _np.linspace(0, 1, r)
    g[z - r:z] = _np.linspace(1, 0, r)
    v = v * g
    for kind, f0, db, q in VOICE_EQ:
        b, aa = _biquad(kind, f0, db, q, sr)
        v = lfilter(b, aa, v)
    parts, last = [], int(round(F0 / FPS * sr))
    for f, h in zip(HOLD_AT, HOLDS):
        cut = int(round((f + 1) / FPS * sr))
        parts += [v[last:cut], _np.zeros(int(round(h / FPS * sr)))]
        last = cut
    parts.append(v[last:])
    out = _np.concatenate(parts)[: int(round((LENGTH + 2.0) * sr))]
    _os.makedirs(WORK, exist_ok=True)
    path = _os.path.join(WORK, "voice.wav")
    sf.write(path, out, sr, subtype="PCM_24")
    return path


def make_picture():
    """Round-10 B's picture edit (frames 628..768, 768 held 21 frames, 769..994, 994 held 13)."""
    import subprocess
    h2, h3 = HOLDS
    n = int(LENGTH * FPS)
    a = HOLD_AT[0] + 1 - F0
    b = HOLD_AT[1] - HOLD_AT[0]
    c = n - (a + h2) - (b + h3)
    fc = (f"[0:v]trim=start_frame={F0}:end_frame={HOLD_AT[0] + 1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop={h2}[a];"
          f"[0:v]trim=start_frame={HOLD_AT[0] + 1}:end_frame={HOLD_AT[1] + 1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop={h3}[b];"
          f"[0:v]trim=start_frame={HOLD_AT[1] + 1}:end_frame={HOLD_AT[1] + 1 + c},setpts=PTS-STARTPTS[c];"
          "[a][b][c]concat=n=3:v=1:a=0,fps=30[v]")
    path = _os.path.join(WORK, "picture.mp4")
    _os.makedirs(WORK, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", PICTURE, "-filter_complex", fc, "-map", "[v]",
                    "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-frames:v", str(n), path], check=True)
    return path


# Round-10 B's chord plan on its bar lines (120 bpm, bars of 2 s): 1 Cm9 | 2 Abmaj9 | 3-5 Ebmaj9 (the
# turn on the bar line at 4.0 s, heard 4.12 s) | 6-7 Abmaj9 | 8-9 Bb9sus (the quill cut, 13.5 s, is on
# beat 4 of bar 7; its small event is one soft E-flat 5, a note both pads hold)
CHORDS = ["Cm9", "Abmaj9", "Ebmaj9", "Ebmaj9", "Ebmaj9", "Abmaj9", "Abmaj9", "Bb9sus", "Bb9sus"]
# The pitches the bed holds under each chord: the three-note pad (read off render.sh --notes: Cm9 Eb3
# C4 G4, Abmaj9 Eb3 C4 Ab4, Ebmaj9 Eb3 Bb3 G4, Bb9sus Eb3 Bb3 Ab4) plus the bass's root. WHY rewritten
# from round 10's: with one pad note fewer, A-flat major 9 no longer holds B-flat, so A's B-flat 5 in
# the run after "intelligence." is left out (the run goes C6, A-flat 5, E-flat 5)
BED_PCS = {"Cm9": {"C", "Eb", "G"}, "Abmaj9": {"Ab", "C", "Eb"},
           "Ebmaj9": {"Eb", "G", "Bb"}, "Bb9sus": {"Bb", "Ab", "Eb"}}

# THE FIGURES: eight eighth-note steps a bar ("b" the bass, held; a note; "-" hold; "r" rest). The
# music is heard LAG (0.12 s) after her voice's clock, so a step at t is heard at t + 0.12 (+35 ms on an
# off-beat, swung). Her speech: 0.45-4.47 s, pause 4.47-5.58 s, 5.58-12.81 s, silent from 12.81 s.
# Every upper note is a pitch the pad holds lower (BED_PCS, checked at build), so it is the bed's own
# chord sounding again higher. Under her, upper notes stay at G5 and above (over her range, F3-E5),
# one held half note a bar; in her pauses the line may come down to E-flat 5 / B-flat 4.
FIG = {
    "a": [
        # 1 Cm9: bass waits for "However," to end (B: beat 3, 1.0 s), and nothing else: the window
        # opens as B did. WHY no G5 here (first render had A's G5 on beat 4): it measured 1.1
        # attacks a second under her words, over the songbook's "about one"; this was the one
        # upper note with no musical job (the line starts properly on the next chord)
        "r - - - b - - -",
        # 2 Abmaj9: she speaks: the bass and one held A-flat 5 on beat 3 (A's quarter-note line,
        # slowed to one note)
        "b - - - Ab5 - - -",
        # 3 Ebmaj9, THE TURN: "happened." ends 4.47 s; A's run in her pause, swung eighths on steps
        # 2-5 (heard 4.62, 4.90, 5.12, 5.40 s), coming down to E-flat 5, all before "Blinded" (5.58)
        "b - G5 Bb5 G5 Eb5 - -",
        # 4 Ebmaj9: "Blinded by their own hubris," one held G5 on beat 3
        "b - - - G5 - - -",
        # 5 Ebmaj9: "these corporations created": the bass alone (a thinner bar, room for the
        # level to move; the songbook's rule 9)
        "b - - - - - - -",
        # 6 Abmaj9: "a new kind of technology:" one held A-flat 5
        "b - - - Ab5 - - -",
        # 7 Abmaj9: "intelligence." ends 12.81 s; A's run down starts on step 3 (C6, heard 12.90 s),
        # A-flat 5 on step 5, and lands B's soft E-flat 5 on step 6, the quill cut (13.5 s, heard
        # 13.62 s): a note this chord's pad and the next one's both hold
        "b - - C6 - Ab5 Eb5 -",
        # 8 Bb9sus, the still quill, she is silent: A's quarters, ending on B's fall to B-flat 4
        "b - Eb5 - Ab5 - Bb4 -",
        "b - - - - - - -",
    ],
    "b": [
        # the same bars, simplified: while she speaks only the pad and the bass (r10 B), and in her
        # two pauses two or three quarter notes in place of A's eighth runs
        "r - - - b - - -",
        "b - - - - - - -",
        # 3 the turn's pause: G5 then E-flat 5 (heard 4.62 and 5.12 s), clear of "Blinded" (5.58)
        "b - G5 - Eb5 - - -",
        "b - - - - - - -",
        "b - - - - - - -",
        "b - - - - - - -",
        # 7 after "intelligence.": A-flat 5 on beat 3 (heard 13.12 s), the quill's E-flat 5 on beat 4
        "b - - - Ab5 - Eb5 -",
        # 8 the quiet answer, falling back to the pad's B-flat
        "b - - - Eb5 - Bb4 -",
        "b - - - - - - -",
    ],
}

# WHY the ladder from B-flat 4: low enough for the pause notes (B-flat 4, E-flat 5), and with ladder
# numbers up to 9 high enough for C6 (round 10's floor, unchanged)
FLOOR = "Bb4"


def _figure(key, sections):
    """FIG[key] -> ladder-number tokens per section, refusing any upper note the pad does not hold."""
    import blocks as B
    from dsp import note
    pcs = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    out, k = [], 0
    for s in sections:
        bars = []
        for j in range(s.bars):
            chord = CHORDS[k + j]
            toks = []
            for t in FIG[key][k + j].split():
                if t in ("b", "-", "r"):
                    toks.append(t)
                    continue
                m = note(t)
                if pcs[m % 12] not in BED_PCS[chord]:
                    raise SystemExit(f"book11-{key} bar {k + j + 1}: {t} is not held by the pad's {chord}")
                lad = B._ladder(chord, note(FLOOR))
                if m not in lad or lad.index(m) >= 9:
                    raise SystemExit(f"book11-{key} bar {k + j + 1}: {t} is not on {chord}'s ladder from {FLOOR}")
                toks.append(str(lad.index(m) + 1))
            bars.append(" ".join(toks))
        out.append(bars)
        k += s.bars
    return out


def _piece(key):
    speech = speech_from_words(_words(), 0.0, start_at=0.0)
    land = R.land_after(9, BPM, "short")      # the body runs past the 15 s window; the ending is never heard
    cuts = [round(edit_time(f / FPS, HOLDS), 3) for f in (F0, 787, 999)]
    brief = R.Brief("narrated", round(land + 2.0, 3), ("storybook", "warm", "mischievous", "hopeful"), "subtle",
                    moments=[(round(edit_time(24.394, HOLDS), 3), "wonderful")],
                    picture=[(cuts[0], "the page turns"), (cuts[1], "the corporations"), (cuts[2], "the quill")],
                    logo_at=land)
    turn_bar = R.Grid(BPM).moment_bar(edit_time(25.408, HOLDS))
    p = R.narrated(
        f"book11-{key}", round(land + 2.0, 3), land=land, speech=speech, bpm=BPM,
        chords=["Cm9", "Abmaj9", "Ebmaj9", "Bb9sus"], brief=brief, subtle=True, ending="short",
        changes=[(turn_bar, "family", "bright")], seed=10,
        # WHY no tune (as round 10): she speaks until 12.8 s of a 15 s window; the after-her-words
        # phrase would be a two-second fragment cut by the fade ("absent when it would be forced")
        tune=[],
        # WHY pad (B) and the gentle swing (A): the pad holds the chord under her with no attacks
        # (A's ringing piano re-struck chords under her words); the swing is A's lilt, and it only
        # touches the off-beat eighths, which here fall in her pauses
        owner_over=dict(pulse="chord", swing="gentle", sustain="pad"), touch=0.24,
        notes=("round 11 book A: blend of r10 A and B; B's pad, bass and tempo, A's line slowed to one note a bar "
               "under her and running in her pauses" if key == "a" else
               "round 11 book B: the blend simplified; pad and bass only under her, a few quarter notes in her pauses"),
        # WHY no music_db: the gap sets the music (her treated voice at -16 LUFS, music 10 LU under)
        voice_mux=dict(path=_os.path.join(WORK, "voice.wav"), t_from=0.0, start_at=0.0, gap_lu=GAP_LU))
    body = [s for s in p.sections if not getattr(s, "ending", False)]
    k = 0
    for s, fig in zip(body, _figure(key, body)):
        s.chords = [[c] for c in CHORDS[k:k + s.bars]]
        s.figure = fig
        s.fig_floor = FLOOR
        k += s.bars
    # WHY a three-note pad (songbook rule 9, "the pad three notes"; the knob is bed.py's pad_voices,
    # round 11): round 10's book pad was four notes (Eb3 Bb3 C4 G4) on top of the bass. The figure
    # here sits ABOVE the pad (G5 and up under her), so "above the figure's top" cannot apply.
    # Measured on this score: four notes 59-61 % of the music in the 150-500 Hz "mud" band (liked
    # 48-52 %); the pad lifted to G3-B-flat 4 (pad_range) only reached 57-59 % and pushed the music's
    # share of her voice's band (250 Hz-3 kHz) from 59 % to 70 %, so it stays in its usual place with
    # one note fewer. Set on the piece after the recipe because recipes.narrated takes no bed argument
    # (the bed is read only at render, so this is what renders)
    p.bed = dict(p.bed or {}, pad_voices=3)
    # WHY the music mastered 2 dB quieter (-18.5 LUFS, the recipe's subtle level is -16.5): this
    # score is mostly a soft pad with a few struck notes, so pushing it to -16.5 made the final
    # limiter work up to 3.3 dB (0.9-1.0 % of the time) on those notes, against round 10's 1.2 dB
    # (the "poor/compressed" suspect). Under a narrator this level is only an intermediate: the mux
    # sets the music 10 LU under her whatever it is mastered at, so nothing gets louder or softer in
    # the film, the notes just keep their attacks
    p.loudness = -18.5
    return p


PIECE_A = _piece("a")
PIECE_B = _piece("b")
FILMS = [Film("book11-a", PIECE_A, picture=PIECE_A.brief.picture, copy_to=None),
         Film("book11-b", PIECE_B, picture=PIECE_B.brief.picture, copy_to=None)]


def deliver():
    """book-a.mp4 / book-b.mp4 from the sketches (out/sketches/book11-?-sketch.wav): a plain gain to
    -16 LUFS (no limiter), refused if the true peak would pass -1 dBTP; the edited picture."""
    import subprocess
    import pyloudnorm as pyln
    import soundfile as sf
    from scipy.signal import resample_poly
    _os.makedirs(DELIVER, exist_ok=True)
    rep = {}
    for key in ("a", "b"):
        y, sr = sf.read(_os.path.join(_HERE, "..", "out", "sketches", f"book11-{key}-sketch.wav"), always_2d=True)
        lu = pyln.Meter(sr).integrated_loudness(y)
        tp0 = 20 * _np.log10(_np.abs(resample_poly(y, 4, 1, axis=0)).max())
        # WHY -16 LUFS OR the true-peak ceiling, whichever is lower (round 10 refused to deliver
        # instead): measured, both sketches sit at -16.9 LUFS with one peak of her voice (2.31 s, a
        # consonant the levelling compressor's 15 ms attack lets through) at -1.0 dBTP; at -16 it
        # would reach -0.1 dBTP. No limiter is added (nothing may pump), so the clip is delivered up
        # to 0.9 dB under -16 and the report says so
        gain = min(-16.0 - lu, -1.0 - tp0)
        y = y * 10 ** (gain / 20)
        tp = tp0 + gain
        if tp > -1.0 + 1e-6:
            raise SystemExit(f"book11-{key}: true peak {tp:.2f} dBTP; not delivered")
        wav = _os.path.join(WORK, f"book-{key}-16.wav")
        sf.write(wav, y, sr, subtype="PCM_24")
        mp4 = _os.path.join(DELIVER, f"book-{key}.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", _os.path.join(WORK, "picture.mp4"), "-i", wav,
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                        "-t", f"{LENGTH:g}", mp4], check=True)
        rep[key] = (round(pyln.Meter(sr).integrated_loudness(y), 2), round(tp, 2))
        print(f"book-{key}: {mp4}  {rep[key][0]} LUFS, true peak {rep[key][1]} dBTP")
    return rep


if __name__ == "__main__":
    import sys
    if "prep" in sys.argv:
        print(make_voice(), make_picture())
    if "deliver" in sys.argv:
        deliver()
