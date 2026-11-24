"""Own everything, the 10 s cut (take3.tsx at 112fcd2cf): one quiet idea, one turn, the logo.

THE PLAN (written before the notes; the picture is type only, stark night turning to bright day)

  Spotting. Feeling changes, not words: (a) 0-2.0 the lie, deadpan; (b) 2.0-3.3 the lie is struck
  and corrected by hand (tension, the music holds its breath); (c) 4.08-4.25 the page goes bright
  ("own your data.") = THE TURN; (d) 5.75-6.5 "software." / "everything.", the closer = THE PEAK;
  (e) 7.75 the name = the logo. 10.0 end. The four "own your" lines (every 0.75 s) are NOT followed.

  Grid. The logo's landing must fall on 7.75 s, and the songbook's ending bar (four beats slowing to
  85 %) has to sit just before it. Three bars plus the ending at the picture's 120 BPM would land at
  8.2 s, so the band plays at about 134 with ONE held beat (a fermata) after bar 2. That hold is the
  only "deadpan pause" in the film and it puts the bright chord's downbeat at 4.03 s, a frame before
  the colour dissolve (4.08), so the music turns WITH the page instead of half a second early.

  bar  seconds     picture                      harmony              tune (how it is changed)          texture / loudness
  1    0.00-1.79   the lie, all four lines      C minor              the cell an octave LOW, plain      sparse, dry; quiet
                                                                     rhythm (Bb3 G4 F4): deadpan
  2    1.79-3.58   strike 2.0 / 2.25, the hand  F minor 7 | G major  rests: the pen speaks             bass + one pulse; quietest
       3.58-4.03   "everything." settles        G (held one beat)    -                                 a soft fresh chord, held
  3    4.03-5.82   the page goes bright,        E-flat over G        the cell a STEP HIGHER and an      rolling piano, half its
                   own your data / intelligence (same bass note G:   octave up, breathing in on the     notes, growing
                                                the dark chord        off-beat (C5 Ab5 G5): bright
                                                opens into home)
  end  5.82-7.75   software. / everything.      A-flat | B-flat sus  the ending's sigh C6 -> B-flat     the band's ending; the
                                                                     (C6 is the tune's top: saved for   loudest bar; then fade
                                                                     here), then the logo B-flat G F
  The cell climbs through the whole film: Bb3-G4-F4 (low, minor) -> C5-Ab5-G5 (a step up, bright)
  -> C6-Bb5 (the top) -> Bb4-G5-F5 (the logo, home). One idea, developed, never restated as written.
  The bass climbs by step from the turn: G (held through the turn) -> A-flat -> B-flat -> E-flat.
  The only borrowed chord is G major (its B natural is the dark pull, heard only under the pen,
  never under a B-flat or C in the tune). Subtle: -17 LUFS, the tune touched inward (lead 0.85), no
  sub bass until the page goes bright, half the rolling piano's notes.

  The pen (made here, one sound for the whole film: a soft felt-tip on paper, never scratchy):
  two strokes through "nothing." (2.00-2.18, 2.25-2.42), the word written (2.50-3.11, letter by
  letter as take3.tsx paces it), the full stop tapped (3.21).
"""
import numpy as np
from scipy import signal as sg

from dsp import SR
from films import Film, place_effect, soften
from motif import motif, rest
from score import Piece, Section as S

BPM = 134.0          # WHY 134 (not the picture's 120): see "Grid" above; the hold makes the turn land on the page

cell_low = motif("signature").octave(-1)                     # Bb3 G4 F4, 1 + 1 + 2 beats: the lie, flat
cell_bright = motif("signature").up(1).rhythm([1, 1, 1.5]).shift(0.5)   # C5 Ab5 G5 from the off-beat

PIECE = Piece(
    "own-everything-10s", 10.0, land=7.75, peak=5.82, seed=7, loudness=-17.0,
    notes="Own everything, 10 s: the cell low and deadpan over C minor, a held G major under the pen, "
          "the same bass note opening into E-flat as the page turns bright, the cell a step higher, "
          "the ending's top C on 'software.', B-flat on 'everything.', the logo on the name at 7.75 s.",
    sections=[
        S("stark", 2, bpm=BPM, tune=[cell_low, rest(1)], chords=[["Cm"], ["Fm7", "G"]],
          drop=("sub",), lead=0.85, into="hold", hold=1.0,
          # WHY a sudden drop on the strike (beat 4): the lie is crossed out and the band steps back
          # (about -4 dB from an already quiet bar 1) so the pen is heard and bar 2 is the valley the bright page rises out of
          shape=[(0, 0.9), (3.6, 0.9), (4.0, 0.55), (8, 0.55)],
          label="the lie, struck and corrected"),
        S("hopeful", 1, bpm=BPM, tune=[cell_bright], chords=[["Eb/G"]],
          # WHY register +12: Eb/G's rolling figure is G1 Eb2 Bb2; an octave up its middle notes
          # (Eb3 Bb3) open the sound as the page turns white, while the bass G stays where it was
          accomp="rolling", density=0.5, register=12, lead=0.85, shape="grow",
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
