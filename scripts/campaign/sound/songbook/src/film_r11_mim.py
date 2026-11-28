"""Round 11, "Make it mine": three 15-second sketches over the same stretch of the re-cut picture
the owner heard in round 10 (film/out/r10/mim-recut.mp4; 128 bpm, every cut on a bar line).

Written the unity way (SONGBOOK.md Part 1), measured, never heard: nobody here can listen.

WHAT HE SAID about round 10 (campaign-round2-sketches answers, MIM-1..3): both sketches "too
chaotic", "the notes almost feel like they mush together", "the different layers still clash/fight
for attention", "the audio quality feels kinda poor/compressed", "definitely moving in the right
direction"; "a handful of notes still feel somewhat misplaced and the layers still fight a bit but
its a big improvement"; "i still want to explore some slightly more unique/different alternatives,
taking heavy inspiration from gta tracks like 'windsor drop' and 'welcome to leonida' from overmono."

THE WINDOW: 39.375-54.375 s (bars 22-29: the bills cut to just before the odd bar). WHY not 37.5:
the round-10 deck's text said 37.5-52.5, but the clips he actually judged start on the bills cut
at 39.375 (checked frame by frame against the re-cut: the delivered clip's first frames match the
picture at 40.4 s, not 38.5 s). "The same stretch as before" is the stretch he heard.

THE THREE SKETCHES (one piece each; bars 1-21 stay round 10's so the film around the window is
unchanged, apart from the clear-parts fixes that apply to the whole piece):

  A "cleaned up": round 10's straight sketch with fewer notes ringing at once.
     The misplaced notes, found in round 10's note list (every struck note checked against what was
     still sounding; counts are the round-10 window):
       1. D4 in the piano figure over E-flat major 9 and C minor 9, struck right next to E-flat 4
          (and over the pad's E-flat 3): the most frequent rub (13 of 26). The figure now leaves out
          a colour note a semitone from another chord note (Section.fig_open): D over E-flat and C
          minor, G over A-flat and F minor. The pad and the tune still carry the colour.
       2. The tune's held D5 at the end of the bills phrase (bar 23, the "question" phrase), over
          the figure's E-flat 4 and the pad: a held major seventh on a scene cut. The phrase now
          ends on G5 (a tone of the chord), the line A-flat E-flat F | E-flat F G (its old G5 passed
          over the pad's A-flat 4 on the F minor bar; E-flat is F minor 9's own seventh).
       3. The peak's lower voice D5 under B-flat 5 (bar 26), a major seventh over the figure's
          E-flat 4: now E-flat 5 (G4 B-flat 4 E-flat 5 under E-flat 5 G5 B-flat 5).
       4. The tune's G4/G5 against the pad's A-flat 4 (bars 22 and 26): the pad is now three notes
          above the figure, kept clear of the figure's notes and under the tune.
     And: the figure plays eighths (8 a bar, round 10 A played 10, B 14), the left hand strikes the
     root once a bar (twice only on the payoff), and bar 25 (the email, just before the payoff)
     breathes (5 notes) so the payoff arrives from something quieter.
  B "Night drive" (Overmono recipe A; fully inside the rules): a skipping 2-step piano figure on
     steps 1, 4, 7, 11 and 14 of each bar, gently swung, the first step firmest; NO piano bass: a
     soft sine sub plays the root on steps 1 and 11 only (pitched, held to the next step, never a
     drum); chords two bars each (half-time harmony); a darker, rounder pad (triangle) whose filter
     opens toward the payoff and closes after; a rare clean sine ping on a chord note, below the
     tune, every two bars.
  C "Piano chop" (Overmono recipe C, with a SOFT MUFFLED LOW PULSE that BENDS THE NO-DRUMS RULE,
     for his decision): the three-note tune cut into "you-co" (B-flat G) and "co-ded" (G F),
     struck on the off-beats and answered an octave lower by the same piano, each note shadowed by
     a clean sine 10 dB under it (a glow, no grit); a muffled pitched low pulse on beats 1 and 3
     (a sine on the chord's root that falls into pitch, low-passed: no click, no snare, no hat);
     the pad only from the email on; at the payoff the fragments join into the whole tune; after
     it the chop pattern starts one eighth later.

    render.sh --sketch r11-mim-a r11-mim-b r11-mim-c from=39.375 len=15 picture=<mim-recut.mp4> lag=0.15
    render.sh --py film_r11_mim.py deliver
"""
import os as _os
import re

import numpy as _np

import film_r10_mim as R10
import recipes as R
import tunebank as TB
from films import Film
from dsp import note
from motif import N, Phrase, write

BPM = R10.BPM
LAND = R10.LAND
PEAK = R10.PEAK
WINDOW = (39.375, 15.0)
LAG = R10.LAG
PICTURE_FILE = R10.PICTURE_FILE
DELIVER = "/home/destin/Documents/youcoded-campaign/round11/sketches"

# ---------------------------------------------------------------- chords (bars 22-29 per sketch)
HEAD = R10.CHORDS[:21]
CHORDS = {
    # A: round 10's window chords (they were not the fault; the notes played over them were)
    "a": HEAD + [["Fm9"], ["Ebmaj9"], ["Bb9sus"], ["Ab/Bb"], ["Ebmaj9"], ["Abmaj9"], ["Cm9"], ["Abmaj9"]],
    # B: two bars a chord where the picture allows (the Overmono "half-time" harmony: fewer changes,
    # so colour, not new notes, carries the variety): C minor 9 under the bills and the chat, A-flat
    # then A-flat over B-flat through the email, E-flat ON the payoff, A-flat on the money, C minor,
    # then B-flat 9sus leading to the logo. Every change keeps a note of the last chord.
    "b": HEAD + [["Cm9"], ["Cm9"], ["Abmaj9"], ["Ab/Bb"], ["Ebmaj9"], ["Abmaj9"], ["Cm9"], ["Bb9sus"]],
    # C: one chord a bar, each paired with its chop fragment (recipe C, checked note by note):
    # C minor 7 / "you-co" (B-flat G), F minor 9 / "co-ded" (G F), A-flat major 9 / "you-co",
    # B-flat sus4 resolving to B-flat / B-flat F; the payoff E-flat major 9 and C minor 9 under the
    # whole tune; A-flat major 9 / "you-co", B-flat 9sus / B-flat F.
    "c": HEAD + [["Cm7"], ["Fm9"], ["Abmaj9"], ["Bbsus4", "Bb"], ["Ebmaj9"], ["Cm9"], ["Abmaj9"], ["Bb9sus"]],
}

# ---------------------------------------------------------------- the tune
HEAD_TUNE = [t for t in R10.TUNE if t[0] < 22]
TUNE = {
    # WHY (fix 2 above): the bills phrase ends on G5, a tone of E-flat major 9, not on the held
    # D5; WHY (fix 3): the peak's lower voice takes E-flat 5 under B-flat 5, not D5
    "a": HEAD_TUNE + [(22, write("Ab5/1 Eb5/1 F5/2 | Eb5/1.5 F5/0.5 G5/2", label="bills, ends on G")),
                      (26, TB.phrase("peak-arc") & write("G4/1 Bb4/1 Eb5/2 | Eb5/4", label="peak, lower voice"))],
    # B: the cell said over C minor (its F only a passing half beat), and a payoff line that
    # climbs to C6 over A-flat and comes home to E-flat; no lower voice (the 2-step figure is thin)
    "b": HEAD_TUNE + [(22, write("Bb5/1 G5/1 F5/0.5 Eb5/1.5 | G5/1.5 F5/0.5 Eb5/2", label="cell over C minor")),
                      (26, write("Eb5/1 G5/1 Bb5/2 | C6/1.5 Bb5/0.5 Eb5/2", label="payoff climb"))],
    # C: the fragments join into the whole tune at the payoff, as a two-bar line
    "c": HEAD_TUNE + [(26, write("Bb5/1 G5/1 F5/2 | Eb5/1 F5/1 G5/2", label="the chop joined: the whole tune"))],
}

# ---------------------------------------------------------------- the figure, 16 steps a bar
OLD = R10.OLD                                      # bars 1-16: round 8's eighths (as round 10)
EIGHTHS = ["b - 2 - 3 - 4 - 3 - 2 - 4 - 3 -", "b - 2 - 3 - 4 - 3 - 2 - 3 - 4 -"]
FIG = {
    # A: eighths, the root once a bar. WHY bar 25 thin and bar 26 with a second root: the payoff
    # arrives from a quieter bar and lands with the left hand's weight, so the loudness moves with
    # the picture (rule 9: "the loudness moves").
    "a": OLD * 8 + EIGHTHS * 2 + EIGHTHS[:1] + [
        EIGHTHS[0],                              # 22 bills
        EIGHTHS[1],                              # 23 chat
        EIGHTHS[0],                              # 24 the email
        "b - - - 3 - - - 4 - - - 3 - 2 -",      # 25 a breath before the payoff
        "b - 2 - 3 - 4 - b - 3 - 4 - 3 -",      # 26 THE PAYOFF
        EIGHTHS[0],                              # 27 money
        "b - 2 - 3 - 2 - 4 - 2 - 3 - 2 -",      # 28 line one: the settle
        "b - 2 - 3 - - - 4 - 3 - - - 2 -"],     # 29 thinning toward the logo
}
# B: Overmono's 2-step skip in the piano (steps 1, 4, 7, 11, 14; 5, 9 and 13 empty), the first
# step firmest ("^"), no "b": the sub carries the root. WHY each note held to the next ("-"):
# a skipping figure that rings reads as a groove, struck dry it ticks.
TWO_STEP = ["3^ - - 2 - - 4 - - - 3 - - 2 - -", "3^ - - 2 - - 4 - - - 2 - - 3 - -"]
FIG["b"] = OLD * 8 + EIGHTHS * 2 + EIGHTHS[:1] + [
    TWO_STEP[0], TWO_STEP[1], TWO_STEP[0],
    "3^ - - 2 - - - - - - 3 - - - - -",          # 25 the breath before the payoff (3 notes)
    TWO_STEP[0], TWO_STEP[1],
    TWO_STEP[0],
    "3^ - - 2 - - - - - - 3 - - - - -"]          # 29 thinning toward the logo
# C: the chop, written pitches (each checked against its bar's chord above). Off-beat eighths
# (steps 3, 7, 11, 15), the high pair answered an octave lower; after the payoff the same pattern
# one eighth later (it rotates against the bar without a new note).
YOU_CO = "r - Bb4 - - - G4 - - - Bb3 - - - G3 -"
CO_DED = "r - G4 - - - F4 - - - G3 - - - F3 -"
BB_F = "r - Bb4 - - - F4 - - - Bb3 - - - F3 -"
UNDER = "r - - - - - - - - - Bb3 - - - G3 -"          # under the whole tune: the low answer only
FIG["c"] = OLD * 8 + EIGHTHS * 2 + [
    YOU_CO, YOU_CO, YOU_CO, YOU_CO, YOU_CO,          # 17-21 (the money chat: the chop starts here)
    YOU_CO,                                          # 22 Cm7
    CO_DED,                                          # 23 Fm9
    YOU_CO,                                          # 24 Abmaj9
    BB_F,                                            # 25 Bbsus4 -> Bb
    UNDER, UNDER,                                    # 26-27 the payoff: the whole tune on top
    "G3 - - - Bb4 - - - G4 - - - Bb3 - - -",         # 28 Abmaj9, one eighth later
    "F3 - - - Bb4 - - - F4 - - - Bb3 - - -"]         # 29 Bb9sus, one eighth later


def _pings(sec_bar0, nbars, pings):
    """The sine pings of one section as a Phrase laid from the section's first beat: pings is
    [(global bar, beat in bar, note, beats)]."""
    notes = [N((b - sec_bar0) * 4.0 + bt, note(nm), d, 0.5, ("written", 0, "ping"))
             for b, bt, nm, d in pings if sec_bar0 <= b < sec_bar0 + nbars]
    return Phrase(notes, max(1, nbars), "pings") if notes else None


# B's pings: rare, on a chord note in the pad's register, on an off-beat, and only in bars with NO
# tune phrase (WHY: with a ping in a tune bar, five layers sounded in one bar, rule 8 says three or
# four): bar 24 A-flat major 9's C5, bar 28 C minor 9's B-flat 4 (and bar 20, before the window)
PINGS_B = [(20, 2.5, "Bb4", 1.0), (24, 2.5, "C5", 1.0), (28, 2.5, "Bb4", 1.0)]

# the pad, per sketch (bed.py: pad_range, pad_voices, pad_span, pad_under_tune, pad_avoid_figure).
# WHY three notes above the figure and under the tune (rule 9; fix 4): round 10's pad sat E-flat 3
# to G4, on top of the figure (G3-G4), the two layers filling 150-500 Hz together
PAD = {
    "a": dict(pad_range=("F4", "Eb5"), pad_voices=3, pad_span=(5, 12), pad_under_tune=True, pad_avoid_figure=True),
    "b": dict(pad_range=("G4", "F5"), pad_voices=3, pad_span=(5, 12), pad_under_tune=True, pad_avoid_figure=True),
    # WHY C's pad from B-flat 4: from A-flat 4 it held A-flat 4 into the logo against its G4 (a
    # hard-check clash); up to F5 because B-flat 4 to E-flat 5 leaves E-flat major 9 no voicing
    # without a semitone (D5 E-flat 5), and the toolkit then falls back to a single E-flat 3
    "c": dict(pad_range=("Bb4", "F5"), pad_voices=3, pad_span=(5, 12), pad_under_tune=True, pad_avoid_figure=True,
              start=("pulse",)),
}
FLOOR = {"a": "G3", "b": "Bb3", "c": "G3"}
NOTES = {
    "a": "A cleaned up: round 10's straight sketch, eighths, the root once a bar, the figure without the "
         "semitone colour notes, the tune's held D5s removed, the pad three notes above the figure.",
    "b": "B Night drive (inside the rules): a 2-step skipping piano, gently swung, a sine sub on steps 1 "
         "and 11, two bars a chord, a dark triangle pad opening to the payoff, a rare sine ping.",
    "c": "C Piano chop (BENDS no-drums: a soft muffled low pulse on beats 1 and 3): the tune cut into "
         "you-co / co-ded on the off-beats, a sine shadow, the pad from the email, the whole tune at the payoff.",
}


def piece(name, key):
    changes = [(26, "peak")]
    sound = {}
    owner = {"swing": "straight"}
    if key == "a":
        changes += R10.PAD_CURVE
    if key == "b":
        owner = {"swing": "gentle"}
        sound = {"pad_timbre": "triangle"}
        # the pad's colour opens toward the payoff and closes after it (Overmono: "the notes
        # repeat; the colour changes"); each entry multiplies the last, at most x1.25 (1125 Hz)
        changes += [(22, "brightness", 1.08), (24, "brightness", 1.08), (25, "brightness", 1.07),
                    (28, "brightness", 0.85)]
    if key == "c":
        sound = {"pad_timbre": "triangle"}
        changes += [(24, "in", "sustain")]
    p = R.app_demo(
        name, 60.0, land=LAND, bpm=BPM, peak=PEAK, odd=2, odd_at=30, ending="short", seed=11,
        chords=CHORDS[key], tune=TUNE[key], lift=R10.LIFT, changes=changes, owner_over=owner,
        sound=sound, notes=f"Make it mine round 11, sketch {NOTES[key]}")
    # WHY set on the built piece (as round 10 did): the bed and the sections are read at render
    # time, and app_demo has no argument for them
    p.bed = dict(p.bed or {}, **PAD[key])
    bars = FIG[key]
    for s in p.sections:
        m = re.search(r"\(bars (\d+)-(\d+)\)", s.label)
        if m:
            a, z = int(m.group(1)), int(m.group(2))
            s.step = 0.25
            s.figure = bars[a - 1:z]
            s.fig_floor = FLOOR[key]
            s.shape = R10.SHAPES.get(a)
            s.fig_open = True
            if key == "b":
                # WHY 0.25 (first render at 0.55: 59 % of the window's energy sat below 150 Hz,
                # against 15 % in round 8's liked "Own everything"; the sub drowned the piano)
                s.low = dict(mask="x.........x.....", voice="sub", vel=0.25)
                s.counter, s.counter_voice = _pings(a, z - a + 1, PINGS_B), "sine"
            if key == "c":
                # WHY 0.4 (first render at 0.7: 35 % of the energy below 150 Hz and the final limiter
                # working 2.7 dB on the pulse's peaks; a soft pulse must never be what the master squashes)
                s.low = dict(mask="x.......x.......", voice="thump", vel=0.4)
                s.fig_shadow = -10.0
        elif s.label.startswith("odd bar"):
            s.step = 0.25
            s.figure = bars[28]
            s.fig_floor = FLOOR[key]
            s.fig_open = True
            if key == "c":
                s.fig_shadow = -10.0
    return p


FILMS = [Film(f"r11-mim-{k}", piece(f"r11-mim-{k}", k), picture=R10.PICTURE, copy_to=None) for k in ("a", "b", "c")]


def deliver():
    """mim-a/b/c.mp4 from the sketches (out/sketches/r11-mim-?-sketch.*): the sketch's audio, a plain
    gain to -16 LUFS (no limiter), refused if the true peak would pass -1 dBTP; the picture copied."""
    import subprocess
    import tempfile
    import pyloudnorm as pyln
    import soundfile as sf
    from scipy.signal import resample_poly
    _os.makedirs(DELIVER, exist_ok=True)
    sk = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "out", "sketches"))
    for key in ("a", "b", "c"):
        y, sr = sf.read(_os.path.join(sk, f"r11-mim-{key}-sketch.wav"), always_2d=True)
        y = y * 10 ** ((-16.0 - pyln.Meter(sr).integrated_loudness(y)) / 20)
        tp = 20 * _np.log10(_np.abs(resample_poly(y, 4, 1, axis=0)).max())
        if tp > -1.0:
            raise SystemExit(f"mim-{key}: true peak {tp:.2f} dBTP at -16 LUFS; not delivered")
        with tempfile.TemporaryDirectory() as td:
            wav = _os.path.join(td, "a.wav")
            sf.write(wav, y, sr, subtype="PCM_24")
            mp4 = _os.path.join(DELIVER, f"mim-{key}.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", _os.path.join(sk, f"r11-mim-{key}-sketch.mp4"),
                            "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                            "-t", f"{WINDOW[1]:g}", mp4], check=True)
        print(f"mim-{key}: {mp4}  -16.0 LUFS, true peak {tp:.2f} dBTP")


if __name__ == "__main__":
    import sys
    if "deliver" in sys.argv:
        deliver()
