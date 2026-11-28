"""Round 11, film "purple" (the full score, 2026-11-27): "purple is the new orange / green / blue ...".

HIS PICK (round 10 sketches deck, PURPLE-1/2/3): "a" (steady 120, straight), unified "yes", sounds
like youcoded "yes"; of B: "bouncy has a LOT more of the clashyness/business that i dislike."
So this is sketch A's piece at full length (the whole 30 s film on the timing card, the sketch
was its last 15 s): the same tempo, straight chord-following pulse, chords, tune phrases (statement,
answer, bridge, the run) and the piano-only logo in the same hands. What changed, and why:

1. THE PAD: three notes, above the figure (SONGBOOK rule 9; the round-10 diagnosis). In r10 the
   pad sat Eb3-G4 on top of the figure (B-flat 3 to E-flat 4): two layers in the 150-500 Hz band.
   Now it is three notes from F4 up to C5, between the figure and the tune, never above a tune
   note sounding over it (bed.py pad_range / pad_voices / pad_span / pad_under_tune, added for this).
2. THE BUILD FROM THE NOTES, not from layers (his brief for this score): the figure starts in
   quarter notes while the colours change every 2 bars, fills in through the statement and bars
   5-6, and only reaches round 10's even eighths when the colours change every bar (bar 7). The
   same three layers (bass + figure, pad, tune) play from the first bar to the last; nothing enters.
3. The toolkit's new v4 defaults now apply on their own: tune_lift 0.18 (the tune about 2.5 dB
   over the figure), pad_handover "clean" (a pad note lets go fast when the next chord rubs it).

HOW THE MUSIC FOLLOWS THE COLOURS (one grid, picture written from the bars): colours every 2 bars
(bars 1-6) = one chord per 2 bars, figure in quarters thickening; every bar (7-8) = one chord a
bar, the answer, the figure in eighths; every 2 beats (9-10) = two chords a bar, the bridge in
half notes, one per colour; every beat (11-12) and every eighth (13) = two chords a bar, the run
in quarters (a tune note on each colour change in 11-12), level lifted 2.5 dB over bars 9-13;
then a 2-beat breath on the last colour and the name ("youcoded is the new everything.") on the
piano logo at 27.0 s, ringing to 30 s.
Measured, never heard: `render.sh --notes r11-purple`, `render.sh r11-purple`.
Card: `render.sh --py film_r11_purple.py card <dir>`.
"""
import os
import subprocess
import sys

import mix as _mix
import score as _score
import recipes as R
from films import Film

# WHY reuse round 10's words, colours, logo hands and card helpers: he approved A as it was; the
# full score changes only what the diagnosis asks (pad register, the build), so the shared parts
# come from the r10 file rather than a copy that could drift
import film_r10_purple as R10

LENGTH = R10.LENGTH
NAME = "r11-purple"
BPM = 120.0
RATE = R10.RATE["a"]
CHORDS = R10.CHORDS["a"]

# THE FIGURE, bar by bar over the first section (bars 1-8), then round 10's figure from bar 9.
# Tokens: b = bass, 1..4 = chord tones up from G3, "-" = hold, one token per eighth.
# WHY these shapes: the build comes from the notes (his brief); attacks per bar go 4, 4, 3, 3,
# 6, 6, 8, 8 as the colours go from every 2 bars to every bar. Under the statement (bars 3-4)
# the tune takes the beats and the figure answers on off-eighths only, so the two never strike
# together and the tune is clearly on top (rule 9: "clear parts, not mush").
FIGURE_OPEN = ["b - 2 - 3 - 2 -",      # 1  colours every 2 bars: quarters, the pulse alone
               "b - 2 - 4 - 3 -",      # 2
               "b - - 2 - - - 3",      # 3  the statement on the beats, the figure between them
               "b - - 2 - - 3 -",      # 4  (beat 3 under the held G5: below it, not a new strike on top)
               "b - 2 - 3 2 - 3",      # 5  no tune: the figure fills in
               "b - 2 - 4 3 - 2",      # 6
               "b 2 3 2 4 2 3 2",      # 7  colours every bar: round 10's even eighths from here on
               "b 2 3 2 4 3 2 3"]      # 8
# Pad: three notes from F4 up to C5: above the figure's top note (E-flat 4) and under the tune's
# lowest notes (B-flat 4, D5). WHY not from E-flat 4: tried, the pad's E-flat 4 rubbed a semitone
# against the figure's D4 on every Ebmaj9 bar (the clash check failed bars 1-2). Two notes only
# where the chord has no third tone in that stretch (the plain E-flat under the name: G4 B-flat 4).
PAD = dict(pad_range=("F4", "C5"), pad_voices=(3, 2), pad_span=(3, 12), pad_under_tune=True)
# THE PAD'S COLOUR FOLLOWS THE COLOURS (change the colour, not the notes: the Overmono notes'
# main lesson). WHY: the piano grows through the build (more notes, the lift) and the pad
# should grow with it rather than sit unchanged (rule 5, one dynamic shape). Its filter starts a
# little closed and opens in two steps on the picture's own turns: bar 7 (12 s, the colours
# start changing every bar) and bar 11 (20 s, every beat). 900 Hz x 0.8 = 720 Hz at the start,
# 1035 Hz from bar 11: well under the 1500 Hz where the pad took over 2-6 kHz. Measured: it
# did NOT fix the levels-together reading (-0.38 before, -0.32 after; a shorter pad attack gave
# -0.31), so that reading's cause is still unknown; kept for the musical reason only.
CHANGES = [(1, "brightness", 0.8), (7, "brightness", 1.25), (11, "brightness", 1.15), (13, "peak")]


def _piece():
    bars = len(RATE)
    land = R.land_after(bars, BPM, "short")
    with R10._no_mutation():
        p = R.app_demo(
            NAME, LENGTH, land=land, bpm=BPM, seed=10, subtle=True, ending="short",
            chords=CHORDS, tune=R10._tune("a"),
            # the peak on the every-eighth bar, lifted over the 4 bars before it (as r10 A)
            peak=round((bars - 1) * 4 * 60.0 / BPM, 3), lift=(4, 2.5),
            logo="piano", owner_over=dict(swing="straight"),
            changes=CHANGES,
            notes="round 11 purple, full score of sketch A: 120 bpm straight chord-following pulse; "
                  "pad three notes above the figure; the figure builds from quarters to eighths with the colours")
    for sec in p.sections:
        if sec.label.startswith("settle"):
            # WHY (as r10, fix pass): the recipe's 1 dB settle would fall ON the busiest bar
            sec.level_db = max(sec.level_db or 0.0, 2.5)
            sec.label = sec.label.replace("settle", "peak (held at the lift)")
        if sec.label.startswith("bed (bars 1-"):
            # WHY set here (the recipe has no figure argument; acc_figure reads Section.figure
            # at render time, so this is not a build-time field): the opening's evolving figure
            sec.figure = list(FIGURE_OPEN)
    # WHY on Piece.bed after the build: Bedline reads Piece.bed when the piece is played
    p.bed = dict(p.bed or {}, **PAD)
    return p


PIECE = _piece()
FILM = Film(NAME, PIECE, copy_to=None)


# THE LOGO IN THE SAME HANDS (as r10's fix pass, mix finding 1), for this piece's name only.
# WHY a second wrapper (not r10's): r10 matches its own names; a distinct guard attribute keeps
# the two from skipping each other when both files are loaded.
def _mine(piece):
    return str(getattr(piece, "name", "")).startswith(NAME)


if not getattr(_score.Band.piano, "_purple11_logo", False):
    _orig_piano = _score.Band.piano

    def _piano(self, bus, beat, m, beats, vel, tone=0.0, pedal=False, p=0.0, jit=5.0, role="", canon=None, **kw):
        if _mine(self.piece):
            if (canon or ("",))[0] == "logo":
                vel = vel * R10.LOGO_TOUCH
            else:
                ep = (getattr(self, "plans", None) or [None])[-1]
                if ep is not None and bus == "piano" and ep.beat0 - 1e-6 <= beat < ep.beat0 + ep.blen - 1e-6:
                    vel = vel * R10.ENDING_SOFT       # the 2-beat breath, not a thump
                elif ep is not None and bus == "piano" and beat >= ep.beat0 + ep.blen - 1e-6:
                    vel = vel * R10.LAND_CHORD        # the chord under the name at the body's touch
        return _orig_piano(self, bus, beat, m, beats, vel, tone, pedal, p, jit, role, canon, **kw)
    _piano._purple11_logo = True
    _score.Band.piano = _piano

    _orig_gains = _mix.bus_gains

    def _gains(src, piece):
        g = _orig_gains(src, piece)
        if _mine(piece) and "lead" in g and "piano" in g:
            g["lead"] = g["piano"]
        return g
    _mix.bus_gains = _gains


def schedule():
    """The picture's events on the music's grid: [(seconds, word, colour)], then the name."""
    bar = 4 * 60.0 / BPM
    ev, c = [], 0
    for i, r in enumerate(RATE):
        if r == 0:
            continue
        for j in range(max(1, int(r))):
            w, col = R10.COLOURS[c % len(R10.COLOURS)]
            ev.append((round(i * bar + j * bar / r, 4), w, col))
            c += 1
    ev.append((PIECE.land, "everything", R10.PURPLE))
    return ev


def card(path, w=1080, h=1920, fps=30):
    """The full 30 s timing card (as r10's, on this piece's schedule). ffmpeg only."""
    ev = schedule()
    font = R10._font()
    filt = []
    ends = [t for t, _, _ in ev[1:]] + [LENGTH]
    for (t, word, col), z in zip(ev, ends):
        en = f"between(t\\,{t:.4f}\\,{z:.4f})"
        filt.append(f"drawbox=x=0:y=0:w={w}:h={h}:color={col}@1:t=fill:enable='{en}'")
        lines = ([("youcoded is", 0.44), ("the new", 0.5), ("everything.", 0.56)] if word == "everything"
                 else [("purple is", 0.44), ("the new", 0.5), (word, 0.56)])
        for text, y in lines:
            filt.append(f"drawtext=fontfile='{font}':text='{R10._esc(text)}':fontsize=120:fontcolor=white:"
                        f"x=(w-text_w)/2:y={int(h * y)}-text_h/2:enable='{en}'")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    f"color=c={R10.LAVENDER}:s={w}x{h}:r={fps}:d={LENGTH:g}",
                    "-vf", ",".join(filt), "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", path], check=True)
    return path


if __name__ == "__main__":
    # python film_r11_purple.py card <dir>: the full timing card (r11-purple-card.mp4)
    if len(sys.argv) >= 3 and sys.argv[1] == "card":
        os.makedirs(sys.argv[2], exist_ok=True)
        print(card(os.path.join(sys.argv[2], f"{NAME}-card.mp4")))
        for t, wd, _ in schedule():
            print(f"   {t:7.3f} s  {wd}")
