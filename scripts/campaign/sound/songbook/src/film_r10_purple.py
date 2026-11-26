"""Round 10, film "purple" (sketches only, 2026-11-25): "purple is the new orange / green / blue ...".

The film is not shot. One sentence stays on screen; only its last word and the app's colour change,
each change on a beat; the changes speed up (every 2 bars, every bar, every 2 beats, every beat,
every eighth) and land on "youcoded is the new everything." with the piano-only logo. 30 s, no
narrator. Playful, quick, confident: a lively film, so a lively tempo and a fuller figure
(SONGBOOK.md "Energy matches the film"), still our felt piano and pad, no drums, no strings.

PICTURE AND MUSIC ON ONE GRID (his A3: yes): the picture is written FROM the music's bars here
(schedule()), and `cards` draws a plain timing card video of it for each sketch, so the hits are
felt before anything is designed. In the swung sketch the card's off-eighths swing with the music.

THE TWO FEEL SKETCHES (the brief's step 2), the same chords and tune, a different pace and pulse:
  A  120 bpm, the straight chord-following pulse (13 bars before the name)
  B  132 bpm, the same pulse gently swung (14 bars before the name: one more bar of "every bar")
HARMONY SPEEDS UP WITH THE PICTURE: one chord per 2 bars while the words change every 2 bars, one
per bar while they change every bar, two per bar from the moment they change every 2 beats. WHY:
the speed-up is carried by the harmony, the tune's rhythm and one 4-bar rise in level, not by an
added instrument, a riser or a drum (never), so the whole thing stays one piece of music.
THE TUNE, written first and the chords under it (Rule 1.3): a statement (bars 3-4), then from the
moment the colours change every bar ONE line to the name: the answer, a bridge in half notes (one
per picture change), and a run in quarters whose last note leads into the logo (B-flat, G, F).
Fix pass 2026-11-25 (the mix engineer's findings): piano-only logo in the same hands, the bridge,
quarters instead of eighths, the peak on the every-eighth bar, no random tune mutation, swung card.
Measured, never heard: `render.sh --notes r10-purple-a`, `render.sh --shelf r10-purple-a`.
The sketches: `render.sh --py film_r10_purple.py cards <dir>`, then
`render.sh --sketch r10-purple-a from=14 picture=<dir>/r10-purple-a-card.mp4 pic_from=14 lag=0.15`
(B: from=14.545, pic_from=14.545, both windows open on the answer's second bar), then a gain
trim to about -16 LUFS (round10/sketches/purple-a.mp4, -b).
"""
import contextlib
import functools
import os
import subprocess
import sys

import mix as _mix
import recipes as R
import score as _score
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
CHORDS = {"a": "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus Ebmaj9 [Cm9 Abmaj9] [Ebmaj9 Bb9sus] "
               "[Fm9 Bb9sus] [Ebmaj9 Cm9] [Abmaj9 Cm11]",
          "b": "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Fm9 Bb9sus Ebmaj9 [Cm9 Abmaj9] [Ebmaj9 Bb9sus] "
               "[Fm9 Bb9sus] [Ebmaj9 Cm9] [Abmaj9 Cm11]"}
# WHY two chords a bar from the moment the words change every 2 beats (fix pass, mix finding 3):
# with one chord a bar there, the picture doubled its pace over music that did not move at all;
# now every picture change in those bars brings a new chord, and the tune's half notes move with it.
# WHY Cm11 (not Bb9sus) on the last half-bar: with Bb9sus the pad's A-flat 4 rang on into the
# ending and rubbed a semitone against its G4 (the clash check failed B at 132 bpm, and A had the
# same rub just under the threshold). Cm11 holds the run's last F and has no A-flat, and the
# ending's own B-flat sus then arrives as a new chord instead of a repeat.
# The tune as whole phrases (bars counted over the piece), the same words in both sketches.
STATEMENT = "Bb4/1 G5/1 F5/1 Eb5/1 | D5/1 Eb5/1 G5/2"              # over Cm9: G held
ANSWER = "F5/1 Ab5/1 F5/2 | Eb5/1 F5/1 G5/2"                       # Bb9sus: F held; Ebmaj9: G held
# WHY a bridge (fix pass, mix finding 3): the tune used to stop for about 4 s right where the colours
# first double their pace, a fragment then a hole. Now the answer runs straight on into half notes,
# one per picture change, each held note a tone of its chord (Cm9: B-flat, Abmaj9: A-flat,
# Ebmaj9: G, Bb9sus: B-flat), climbing toward the run: one line from the answer to the name.
BRIDGE = "Bb5/2 Ab5/2 | G5/2 Bb5/2"
# WHY quarters to the end, never eighths (fix pass, mix finding 2): woven, a tune note takes the
# pulse's step, so the old eighth-note run silenced the pulse for two beats and left a lone line 16
# semitones over the bed at the picture's busiest moment. In quarters the tune takes the beats and
# the pulse keeps every off-eighth, so the every-eighth picture changes land on one continuous
# line of piano. Every note is a tone of the half-bar chord under it; the last bar ends on E-flat,
# a step above the logo's first B-flat, so the name follows as the line's own end.
RUN = "C6/1 Ab5/1 Bb5/1 F5/1 | G5/1 Bb5/1 G5/1 Eb5/1 | C6/1 Bb5/1 G5/1 Eb5/1"


def _tune(k):
    ans = 7 if k == "a" else 8
    return [(3, write(STATEMENT, label="statement")), (ans, write(ANSWER, label="answer")),
            (ans + 2, write(BRIDGE, label="bridge")), (ans + 4, write(RUN, label="the run"))]


@contextlib.contextmanager
def _no_mutation():
    """WHY (fix pass, mix finding 6): tunebank.lay mutates a phrase ending on every 4th bar at
    random (for generated phrases, so a repeat is not literal). These phrases are written by hand:
    the mutation turned the answer's held G5 into F5 in A only, so A and B differed in a note,
    not just in pace and pulse. Off for this film's build only; every other piece is unchanged."""
    orig = R.TB.lay
    R.TB.lay = functools.partial(orig, mutate_rate=0.0)
    try:
        yield
    finally:
        R.TB.lay = orig


# THE LOGO PLAYED BY THE SAME HANDS (fix pass, mix finding 1). WHY: even the piano-only logo is
# written on its own "lead" bus at the logo files' velocities (0.50-0.72) with that bus's own
# calibrated gain (about 5 dB over the piano bus), so on the name a louder, brighter piano would
# still step in from outside. For this film's pieces only: the logo's three notes at 0.6 of their
# written touch (pickups at the body tune's touch, the landing about 0.08 firmer), and the lead
# bus at exactly the piano bus's gain. It stays on its own bus because the landing-time check
# measures the name from that track. Scoped by name, guarded against a second wrap on re-import.
LOGO_TOUCH = 0.6
ENDING_SOFT = 0.85 / 1.2
LAND_CHORD = 0.75
_MINE = ("r10-purple-a", "r10-purple-b")


def _mine(piece):
    # WHY a prefix: the sketch renders a copy named "r10-purple-a-sketch"; an exact-name match
    # missed it and the sketch played the logo louder than the full render
    return str(getattr(piece, "name", "")).startswith(_MINE)
if not getattr(_score.Band.piano, "_purple_logo", False):
    _orig_piano = _score.Band.piano

    # WHY Band.piano's own named parameters (not *a, **kw): another film's wrapper calls the chain
    # with `canon` positional, so a kw-only look-up missed the logo in a full render
    def _piano(self, bus, beat, m, beats, vel, tone=0.0, pedal=False, p=0.0, jit=5.0, role="", canon=None, **kw):
        if _mine(self.piece):
            if (canon or ("",))[0] == "logo":
                vel = vel * LOGO_TOUCH
            else:
                ep = (getattr(self, "plans", None) or [None])[-1]
                if ep is not None and bus == "piano" and ep.beat0 - 1e-6 <= beat < ep.beat0 + ep.blen - 1e-6:
                    # WHY: the piano logo strikes the ending bar's chord 1.2x firmer (the quiet
                    # logo 0.85x); measured on A, its low B-flat 1 read as the one drum-like
                    # attack in the piece. Back at the quiet logo's touch, the 2-beat ending
                    # bar is the breath before the name, not a thump.
                    vel = vel * ENDING_SOFT
                elif ep is not None and bus == "piano" and beat >= ep.beat0 + ep.blen - 1e-6:
                    # WHY: the piano logo's open E-flat chord under the name is written at 0.27-0.42,
                    # firmer than anything in the body (pulse 0.22-0.28); with it the name jumped
                    # about 4 LU over the body. At 0.75 it sits at the body's own touch: the
                    # name is the line's end in the same hands, not a new, louder event.
                    vel = vel * LAND_CHORD
        return _orig_piano(self, bus, beat, m, beats, vel, tone, pedal, p, jit, role, canon, **kw)
    _piano._purple_logo = True
    _score.Band.piano = _piano

    _orig_gains = _mix.bus_gains

    def _gains(src, piece):
        g = _orig_gains(src, piece)
        if _mine(piece) and "lead" in g and "piano" in g:
            g["lead"] = g["piano"]
        return g
    _mix.bus_gains = _gains


def _piece(k, bpm, swing):
    bars = len(RATE[k])
    land = R.land_after(bars, bpm, "short")
    with _no_mutation():
        p = R.app_demo(
            f"r10-purple-{k}", LENGTH, land=land, bpm=bpm, seed=10, subtle=True, ending="short",
            chords=CHORDS[k], tune=_tune(k),
            # WHY the peak on the every-eighth bar, lifted over the 4 bars before it (fix pass, mix
            # finding 2): the old peak sat 2 bars earlier and the music settled a step just as the
            # picture reached its busiest; now the level climbs through the whole speed-up
            peak=round((bars - 1) * 4 * 60.0 / bpm, 3), lift=(4, 2.5),
            # WHY the piano-only logo (his E11: "prefer b/c to a"; fix pass, mix finding 1): the quiet
            # logo brought a string chord, the sub and a separately voiced logo in for the first
            # time on the name, the one place "strings overpower" and "separate instruments" could
            # come back at once. The piano logo is the same piano, an open low E-flat under it.
            logo="piano",
            owner_over=dict(swing=swing),
            notes=f"round 10 purple, sketch {k.upper()}: {bpm:g} bpm, {swing} chord-following pulse; harmony "
                  "speeds up with the picture; tune statement, answer, bridge, then a run in quarters")
    for sec in p.sections:
        if sec.label.startswith("settle"):
            # WHY (fix pass, mix finding 2): the recipe settles 1 dB after its peak, and with the
            # peak on the last body bar that step fell ON the busiest bar. Held at the build-up
            # level; the 2-beat ending bar is the breath before the name.
            sec.level_db = max(sec.level_db or 0.0, 2.5)
            sec.label = sec.label.replace("settle", "peak (held at the lift)")
    return p


PIECES = {"a": _piece("a", 120.0, "straight"), "b": _piece("b", 132.0, "gentle")}


FILMS = [Film(p.name, p, copy_to=None) for p in PIECES.values()]


def schedule(k):
    """The picture's events on the music's grid: [(seconds, word, colour)], then the name."""
    bpm = PIECES[k].sections[0].bpm
    bar = 4 * 60.0 / bpm
    sw = float(PIECES[k].sections[0].swing or 0.0)
    ev, c = [], 0
    for i, r in enumerate(RATE[k]):
        if r == 0:
            continue
        n = max(1, int(r))
        step = bar / r
        for j in range(n):
            w, col = COLOURS[c % len(COLOURS)]
            t = i * bar + j * step
            if r == 8 and j % 2 and sw:
                # WHY (fix pass, mix finding 5): in a swung sketch the music's off-eighths sound
                # `sw` s late; the picture's off-eighth changes swing with them (one shared grid)
                t += sw
            ev.append((round(t, 4), w, col))
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
