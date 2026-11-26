"""Round 10, film "purple" (sketches only, 2026-11-25): "purple is the new orange / green / blue ...".

The film is not shot. One sentence stays on screen; only its last word and the app's colour change,
each change on a beat; the changes speed up (every 2 bars, every bar, every 2 beats, every beat,
every eighth) and land on "youcoded is the new everything." with the quiet logo. 30 s, no narrator.
Playful, quick, confident: a lively film, so a lively tempo and a fuller figure (SONGBOOK.md
"Energy matches the film"), still our felt piano and pad, no drums.

PICTURE AND MUSIC ON ONE GRID (his A3: yes): the picture is written FROM the music's bars here
(SCHEDULE), and `python film_r10_purple.py cards` draws a plain timing card video of it for each
sketch, so the hits are felt before anything is designed. The sketch lays the music 0.10 s after
the card (his A1 pick: just after the picture, never before).

THE TWO FEEL SKETCHES (the brief's step 2), the same chords and tune, a different pace and pulse:
  A  120 bpm, the straight chord-following pulse (13 bars before the name)
  B  132 bpm, the same pulse gently swung (14 bars before the name: one more bar of "every bar")
HARMONY SPEEDS UP WITH THE PICTURE: one chord per 2 bars while the words change every 2 bars, one
per bar while they change every bar, two per bar through the fast stretch. WHY: the picture's
speed-up is carried by the harmony and the tune's rhythm, not by an added instrument, a riser or a
drum (never), so the whole thing stays one piece of music.
THE TUNE, written first and the chords under it (Rule 1.3): a statement (bars 3-4), its answer as
the colours begin to change every bar, and a three-bar run through the fast stretch that moves in
quarters then eighths with the picture and hangs on F over Cm11, which the quiet logo
(B-flat, G, F) answers on "youcoded is the new everything."
Measured, never heard: `render.sh --notes r10-purple-a`, `render.sh --shelf r10-purple-a`.
The sketches: `render.sh --py film_r10_purple.py cards <dir>`, then
`render.sh --sketch r10-purple-a from=14 picture=<dir>/r10-purple-a-card.mp4 pic_from=14 lag=0.10`
(B: from=13, pic_from=13), then -0.9 dB to about -16 LUFS (round10/sketches/purple-a.mp4, -b).
"""
import os
import subprocess
import sys

import recipes as R
from films import Film
from motif import write

LENGTH = 30.0

# The colours his sentence cycles through (word, background hex); the brand purple leads the
# landing card. WHY real colour words: the joke is "purple is the new <colour>", read in one glance.
COLOURS = [("orange", "#E8833A"), ("green", "#4FA36B"), ("blue", "#3F7BD9"), ("pink", "#E26FA6"),
           ("yellow", "#E9C43B"), ("teal", "#2A9D9A"), ("red", "#D2493F"), ("gold", "#C9A227"),
           ("mint", "#7FD1AE"), ("coral", "#F07C6C"), ("lime", "#9BC53D"), ("navy", "#25386B"),
           ("peach", "#F4A988"), ("sky", "#7EC3EC"), ("rose", "#D9668A"), ("olive", "#7F8A3A"),
           ("amber", "#E0A030"), ("cyan", "#36B5C9"), ("brown", "#8A5A3C"), ("lilac", "#B79AD9"),
           ("cream", "#EFE3C8"), ("indigo", "#4B3F9E"), ("salmon", "#EE8E7A"), ("jade", "#3E9C74"),
           ("plum", "#6E3B6E"), ("tan", "#C9A27E"), ("ruby", "#B0284A"), ("aqua", "#5FD3D0")]
PURPLE = "#9750AA"          # brand purple (docs/brand/README.md)
LAVENDER = "#F7F0FB"

# How often the word changes, bar by bar (changes per 4-beat bar): 2 bars each, then every bar,
# every 2 beats, every beat, every eighth; after the body the short ending (2 beats) is a breath
# on the last colour, then the name.
RATE = {"a": [0.5, 0, 0.5, 0, 0.5, 0, 1, 1, 2, 2, 4, 4, 8],
        "b": [0.5, 0, 0.5, 0, 0.5, 0, 1, 1, 1, 2, 2, 4, 4, 8]}
# Chords per bar, written to the tune (every held tune note is a chord tone, the build refuses
# otherwise). WHY each chord shares a note with the last (Part 3): Eb-G-Bb-D runs through all of them.
CHORDS = {"a": "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Ebmaj9 Cm9 Abmaj9 "
               "[Fm9 Bb9sus] [Ebmaj9 Cm9] [Abmaj9 Cm11]",
          "b": "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Fm9 Bb9sus Ebmaj9 Cm9 Abmaj9 "
               "[Fm9 Bb9sus] [Ebmaj9 Cm9] [Abmaj9 Cm11]"}
# WHY Cm11 (not Bb9sus) on the last half-bar: with Bb9sus the pad's A-flat 4 rang on into the
# ending and rubbed a semitone against its G4 (the clash check failed B at 132 bpm, and A had the
# same rub just under the threshold). Cm11 holds the run's last F and has no A-flat, and the
# ending's own B-flat sus then arrives as a new chord instead of a repeat.
# The tune as whole phrases (bars counted over the piece), the same words in both sketches.
STATEMENT = "Bb4/1 G5/1 F5/1 Eb5/1 | D5/1 Eb5/1 G5/2"              # over Cm9: G held
ANSWER = "F5/1 Ab5/1 F5/2 | Eb5/1 F5/1 G5/2"                       # Bb9sus: F held; Ebmaj9: G held
# WHY quarters then eighths: the run moves at the picture's own new pace (every beat, then every
# eighth), every note a tone of the half-bar chord under it, and ends held on F (Cm11)
RUN = "C6/1 Ab5/1 Bb5/1 F5/1 | G5/1 Bb5/1 G5/1 Eb5/1 | C6/0.5 Bb5/0.5 Ab5/0.5 G5/0.5 F5/2"


def _tune(k):
    ans, run = (7, 11) if k == "a" else (8, 12)
    return [(3, write(STATEMENT, label="statement")), (ans, write(ANSWER, label="answer")),
            (run, write(RUN, label="the run"))]


def _piece(k, bpm, swing):
    bars = len(RATE[k])
    land = R.land_after(bars, bpm, "short")
    return R.app_demo(
        f"r10-purple-{k}", LENGTH, land=land, bpm=bpm, seed=10, subtle=True, ending="short",
        chords=CHORDS[k], tune=_tune(k),
        # the peak is where the words start changing every beat: the lift (2 bars, the recipe's
        # 2.5 dB) runs through the every-2-beats bars into it
        peak=round((bars - 3) * 4 * 60.0 / bpm, 3),
        owner_over=dict(swing=swing),
        notes=f"round 10 purple, sketch {k.upper()}: {bpm:g} bpm, {swing} chord-following pulse; harmony "
              "speeds up with the picture; tune statement, answer, then a run at the picture's pace")


PIECES = {"a": _piece("a", 120.0, "straight"), "b": _piece("b", 132.0, "gentle")}
FILMS = [Film(p.name, p, copy_to=None) for p in PIECES.values()]


def schedule(k):
    """The picture's events on the music's grid: [(seconds, word, colour)], then the name."""
    bpm = PIECES[k].sections[0].bpm
    bar = 4 * 60.0 / bpm
    ev, c = [], 0
    for i, r in enumerate(RATE[k]):
        if r == 0:
            continue
        n = max(1, int(r))
        step = bar / r
        for j in range(n):
            w, col = COLOURS[c % len(COLOURS)]
            ev.append((round(i * bar + j * step, 4), w, col))
            c += 1
    ev.append((PIECES[k].land, "everything", PURPLE))
    return ev


def _font():
    # WHY a fallback: DM Sans is not installed on this machine and nothing may be downloaded; the
    # card is a timing card, not a design, so a plain bold sans stands in (said in the report)
    for f in ("/usr/share/fonts/TTF/DMSans-Bold.ttf", "/usr/share/fonts/adwaita-sans-fonts/AdwaitaSans-Regular.ttf",
              "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            return f
    out = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True).stdout
    return out.strip()


def _esc(s):
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace(",", "\\,")


def card(k, path, w=1080, h=1920, fps=30):
    """A plain timing card (vertical, 30 s): a flat colour that changes on the schedule, the
    sentence in a bold sans; the name card on purple. ffmpeg only."""
    ev = schedule(k)
    font = _font()
    filt, last = [], None
    ends = [t for t, _, _ in ev[1:]] + [LENGTH]
    for (t, word, col), z in zip(ev, ends):
        en = f"between(t\\,{t:.4f}\\,{z:.4f})"
        filt.append(f"drawbox=x=0:y=0:w={w}:h={h}:color={col}@1:t=fill:enable='{en}'")
        if word == "everything":
            lines = [("youcoded is", 0.44), ("the new", 0.5), ("everything.", 0.56)]
        else:
            lines = [("purple is", 0.44), ("the new", 0.5), (word, 0.56)]
        for text, y in lines:
            filt.append(f"drawtext=fontfile='{font}':text='{_esc(text)}':fontsize=120:fontcolor=white:"
                        f"x=(w-text_w)/2:y={int(h * y)}-text_h/2:enable='{en}'")
    vf = ",".join(filt)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={LAVENDER}:s={w}x{h}:r={fps}:d={LENGTH:g}",
                    "-vf", vf, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", path], check=True)
    return path


if __name__ == "__main__":
    # python film_r10_purple.py cards <dir>: the two timing cards (r10-purple-a-card.mp4, -b-)
    if len(sys.argv) >= 3 and sys.argv[1] == "cards":
        os.makedirs(sys.argv[2], exist_ok=True)
        for k in PIECES:
            print(card(k, os.path.join(sys.argv[2], f"r10-purple-{k}-card.mp4")))
            for t, wd, _ in schedule(k):
                print(f"   {t:7.3f} s  {wd}")
