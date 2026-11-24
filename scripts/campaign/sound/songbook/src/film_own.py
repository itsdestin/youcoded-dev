"""Own everything, the 10 s cut (take3.tsx at 112fcd2cf): one quiet idea, one turn, the logo.

SECOND PASS (round 7 critics). What changed and why, in one line each:
  * 120 BPM, the picture's own grid (was 134 with a fermata): every bar line, the strike and the
    lines of type now share one pulse; no more 0.2-0.3 s near misses.
  * bar 1 is quieter and nothing sits above the tune (no held strings in bar 1; was a viola C4 over
    Bb3). Measured: bar 1 -20.1 LUFS, bar 3 -16.7 (was -18.2 and -17.7).
  * the turn is clean: no G major any more (its B natural rubbed against the bright chord's
    B-flat). Bar 2 moves F minor 7 -> C minor over G, so the strings step C -> B-flat into E-flat
    over the same bass G; nothing a semitone apart rings across 4.0.
  * no restruck chord in the pause (into="breath", not "hold"), no sigh in the ending, the quiet
    logo (no plucked doublings, no low answer after the name), so the logo lands -0.3 dB against
    the peak bar and the bar-1 cell is not played again under the name.
  * the bass climb G, A-flat is played an octave up (G2, Ab2) so a phone can hear it.

THE PLAN (the picture is type only, stark night turning to bright day; 120 BPM: a beat is 0.5 s)

  Spotting. Feeling changes, not words: (a) 0-2.0 the lie, deadpan; (b) 2.0-3.3 the lie is struck
  and corrected by hand (the music steps back, the pen speaks); (c) 4.0-4.25 the page goes bright,
  "own your data." = THE TURN and the start of the payoff; (d) 4.25-6.5 the four "own your" lines,
  the payoff passage, its top note at 5.0 = THE PEAK (Piece.peak); (e) 6.5 "everything." settles
  inside a held breath; (f) 7.75 the name = the logo. 10.0 end.

  Beats to the name: 7.75 s x 2 = 15.5 = 3 bars (12) + a 1.5-beat breath + the 2-beat short ending.

  bar  seconds    picture                      harmony               tune (how it is changed)              texture / level (bar LUFS)
  1    0.0-2.0    the lie, four lines          C minor (open C, G)   the cell an octave LOW in the lie's    piano alone, one soft open
                                                                     own speech rhythm: Bb3 0.0, G4 0.75,   fifth on the downbeat;
                                                                     F4 1.0 (on "you'll own", "and you'll", -20.1
                                                                     "be happy."), flat touch: deadpan
  2    2.0-4.0    strike 2.0 / 2.25, the hand  F minor 7 | C minor   rests: the pen speaks                  the piano's sparse pulse,
                  writes 2.5-3.3               over G at 3.0                                                held strings enter far
                                                                                                            under the pen; -21.7,
                                                                                                            the valley
  3    4.0-6.0    page bright 4.08-4.25,       E-flat over G |       the cell a step higher and an octave   rolling piano (half its
                  own your data 4.25,          A-flat at 5.0         up, in a NEW, wider rhythm that takes  notes, upper octave), the
                  intelligence 5.0,            (the bass climbs      one line each: C5 4.25, Ab5 5.0 (the   strings carry on, air and
                  software 5.75                G2 -> Ab2)            top note, the peak), G5 5.75 (softer:  a trimmed sub arrive;
                                                                     the sigh resolves down, not up)        -16.7
  br   6.0-6.75   "everything." 6.5            A-flat rings          G5 held over the A-flat (its major     nothing new struck: the
                                                                     seventh), no new attack                closer arrives into space
  end  6.75-7.75  "everything." settles        B-flat sus (soft)     the logo's pick-ups B-flat 7.25,       quiet logo: softer touch,
       7.75       the name                     E-flat                G 7.5, F landing on 7.75               no doublings, no answer;
                                                                                                            -15.7 (logo -0.3 dB vs peak)

  The cell climbs through the film: Bb3-G4-F4 (low, minor, the lie) -> C5-Ab5-G5 (a step higher, an
  octave up, bright, stretched) -> Bb4-G5-F5 (the logo, home). Three hearings with the logo, each
  in its own rhythm (1.5/0.5/2, 1.5/1.5/held, the logo's quick pick-ups). Not a bookend: the low
  answer that would echo bar 1 after the name is gone (logo="quiet").
  The bass climbs: C (bar 1), F, G (bar 2 at 3.0), G held into bar 3 (the common tone of the
  turn), A-flat, B-flat (ending), E-flat (the name). No borrowed chord: in 10 s the one colour
  change that matters is minor to major over the same G.
  The strings voice-lead by step from 2.0: (Eb3 Ab3 C4) -> (Eb3 G3 C4) at 3.0 -> (Eb3 G3 Bb3) at 4.0
  -> (Eb3 Ab3 C4) at 5.0.
"""
import numpy as np
from scipy import signal as sg

from dsp import SR
from films import Film, place_effect, soften
from motif import motif, write, rest
from score import Piece, Section as S

BPM = 120.0          # WHY 120: the editor cut every hit on a 120 BPM grid (take3.tsx); the music keeps it

# WHY this rhythm (1.5, 0.5, 2): it is the lie's own speech rhythm, so the three notes land exactly
# on "you'll own", "and you'll" and "be happy." (0.0, 0.75, 1.0) instead of 0.1-0.15 s off them.
# Touch: flat and soft (the lie read out without inflection; a looping feed restarts on it).
cell_low = motif("signature").octave(-1).rhythm([1.5, 0.5, 2]).touch(0.8, 0.78, 0.68)
# WHY a step higher, an octave up and stretched (1.5, 1.5): the same three words said brightly and
# with room, one note per line of type (4.25, 5.0, 5.75); the G5 is touched softer than the A-flat
# because a sigh resolves down, and it ends on the bar line so it rings through the breath.
cell_bright = motif("signature").up(1).rhythm([1.5, 1.5, 0.5]).shift(0.5).touch(1.0, 0.9, 0.74)

PIECE = Piece(
    "own-everything-10s", 10.0, land=7.75, peak=5.0, seed=7, loudness=-17.0,
    ending="short", rit=1.0, logo="quiet", mix={"sub": -3.0, "air": 3.0},
    notes="Own everything, 10 s at the picture's 120 BPM: the cell low in the lie's speech rhythm, F minor "
          "and C minor over G under the pen, the same bass G opening into E-flat as the page turns bright, the cell a step "
          "higher one note per line, a held breath under 'everything.', the quiet logo on the name at 7.75 s.",
    sections=[
        # WHY held and sub dropped in bar 1: nothing above the low cell (top-voice), nothing heavy
        # under it (phone-low). vary "thin": the piano keeps only its downbeat (C2, G2 and the G3
        # pulse) so the cell is said over one soft open fifth, deadpan; shape 0.62 keeps it about
        # 2-3 dB under the bright page.
        S("stark", 1, bpm=BPM, tune=[cell_low], chords=[["Cm"]],
          drop=("held", "sub"), lead=0.8, vary={1: "thin"}, into="flow",
          # WHY the step back to 1.0 at the very end: a section's shape is held one beat past its
          # end and then eased back to 1.0 (blocks.Dyn), multiplying the next section's own shape;
          # ending at 1.0 keeps bar 1's 0.62 out of the strike bar
          shape=[(0, 0.62), (3.95, 0.62), (4.0, 1.0)],
          label="the lie"),
        # WHY a section of its own for the strike (same mood, same speed, so it simply flows on at
        # 2.00, the strike's downbeat): the held strings may enter here, far under the pen, as a
        # quiet bed that carries straight through the turn, so the bright page blooms out of a
        # sound instead of jumping out of silence. Their voices move by step: F minor 7, then C minor
        # over G at 3.0, then E-flat over the same G at 4.0 (C falls to B-flat, nothing a semitone
        # apart). WHY Cm/G, not G major: no B natural against the coming B-flat, and the bass G is
        # already the common tone of the turn.
        S("stark", 1, bpm=BPM, tune=[rest(1)], chords=[["Fm7", "Cm/G"]],
          drop=("sub",), lead=0.8, into="flow", shape=[(0, 0.4), (2, 0.55), (4, 0.5)],
          label="struck and corrected"),
        # WHY into="breath" (not "hold"): a hold restrikes the chord at 6.0 where nothing happens on
        # screen; a breath lets the A-flat chord and the G5 ring, so "everything." lands in space.
        # WHY bass written G2 Ab2 (an octave above the roll's G1): the climb must be heard on a phone.
        # WHY air and sub kept (sub trimmed 3 dB, air +3 in Piece.mix): without them the mix fails its
        # band checks (no air above 8 kHz, nothing at 40-80 Hz); they arrive with the white page.
        S("hopeful", 1, bpm=BPM, tune=[cell_bright], chords=[["Eb/G", "Ab"]],
          accomp="rolling", density=0.5, register=12, lead=0.95,
          bass=write("G2/2 Ab2/2"), into="breath", hold=1.5, shape="grow",
          label="the page turns bright"),
    ])


# ------------------------------------------------------------------ the pen (made for this film)

def _ease_speed(n, landing=0.12, brake=0.8):
    """Pen speed through one marker stroke, from take3.tsx's penCurve: a quick landing (slow for the
    first 12 %), fast through the middle, a slight drag as it lifts. Returned as 0..1 per sample."""
    x = np.linspace(0, 1, n)
    pos = np.interp(x, [0, landing, brake, 1], [0, 0.07, 0.9, 1])
    v = np.gradient(pos, x)
    return v / v.max()


def _letters_speed(n):
    """Pen speed while 'everything' is written: each letter eases in and out (take3.tsx LETTER_TIME),
    so the sound swells through a letter and thins at its turns, but never stops (cursive)."""
    w = [1, 0.85, 1, 0.75, 1.35, 0.9, 1.2, 0.55, 1, 1.45]          # e v e r y t h i n g
    edges = np.concatenate([[0], np.cumsum(w) / sum(w)])
    x = np.linspace(0, 1, n, endpoint=False)
    v = np.zeros(n)
    for a, b in zip(edges[:-1], edges[1:]):
        sel = (x >= a) & (x < b)
        q = (x[sel] - a) / (b - a)
        v[sel] = (0.85 * np.sin(np.pi * q) ** 2 + 0.15) / (b - a) ** 0.25   # quick letters a little louder
    return 0.3 + 0.7 * v / v.max()


def _felt(speed, seed, body_hz=1100.0, bright=3600.0):
    """A felt tip on paper: noise in the 250 Hz - 3.6 kHz band with a soft body resonance, loudness
    following the pen's speed (smoothed 12 ms, so no grain or crackle), slightly wide in stereo.
    WHY no recording: the owner's rule is effects made for each film, and his ruling on pens is
    "soft, never scratchy"; built from filtered noise, nothing above ~4 kHz exists to scratch."""
    r = np.random.default_rng(seed)
    n = len(speed)
    out = np.zeros((n, 2))
    k = int(0.012 * SR)
    amp = np.convolve(speed, np.ones(k) / k, mode="same") ** 0.8
    # a tiny, slow wobble of pressure (a hand, not a machine)
    amp *= 1 + 0.12 * np.sin(2 * np.pi * 7.3 * np.arange(n) / SR + seed)
    for ch in range(2):
        w = r.standard_normal(n)
        band = sg.sosfiltfilt(sg.butter(2, [250, bright], btype="bandpass", fs=SR, output="sos"), w)
        body = sg.sosfiltfilt(sg.butter(2, [body_hz * 0.8, body_hz * 1.25], btype="bandpass", fs=SR, output="sos"), w)
        out[:, ch] = (0.6 * band + 0.9 * body) * amp
    return out


def _tap(seed):
    """The full stop: the pen touching down once (40 ms), soft and low."""
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    env = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.012)
    return _felt(env / env.max(), seed, body_hz=700.0, bright=2400.0)


def effects(music, plans, piece):
    out = np.zeros_like(music)
    rows = []
    # WHY -11 dB (the guide's range is 8-12 under the music): the owner asked for this film to be
    # subtle, and the pen must be felt more than heard; the strike is the loudest of the three
    for t0, t1, seed, rel, what in ((2.00, 2.18, 11, -10.0, "strike 1 through 'nothing.'"),
                                    (2.25, 2.42, 12, -11.5, "strike 2, back the other way")):
        n = int((t1 - t0 + 0.04) * SR)
        x = soften(_felt(_ease_speed(n), seed, body_hz=950.0), 4000.0)
        r = place_effect(out, x, t0, music, rel)
        rows.append(dict(r, what=what))
    n = int(0.608 * SR)                     # take3.tsx SWEEP: 0.76 * 0.8 s for "everything"
    x = soften(_felt(_letters_speed(n), 21, body_hz=1300.0), 4000.0)
    rows.append(dict(place_effect(out, x, 2.50, music, -12.0), what="'everything' written"))
    x = soften(_tap(31), 3500.0, dot=True)
    rows.append(dict(place_effect(out, x, 2.50 + 0.608 + 0.1, music, -14.0), what="the full stop"))
    return out, rows


FILM = Film(
    "own-everything-10s", PIECE, effects=effects, copy_to=None,
    picture=[(0.0, "you'll own"), (0.25, "nothing."), (0.75, "and you'll"), (1.0, "be happy."),
             (2.0, "strike 1"), (2.25, "strike 2"), (2.5, "everything. (written)"), (3.21, "full stop"),
             (4.08, "dissolve to day"), (4.25, "own your data."), (5.0, "intelligence."), (5.75, "software."),
             (6.5, "everything."), (7.75, "youcoded (name)"), (10.0, "end")])
