"""Round 11 balance sketches, "screens": the same 15 s close as round 10 (src/film_r10_screens.py,
left as it was), built on his pick A (the soft held pad under the piano), a BALANCE test on the
current recording (he chose a calmer re-record later; picture timing is not rebuilt).

HIS WORDS (round-10 sketches deck, SCREENS-1, picked A, "nearly" on both other questions): "the
narrator sounds FAR too loud, against the music. i think we could lower her voice level a bit and
raise the music volume a smidge. piano is also fighting her voice a bit for attention i think?"

WHAT ROUND 11 CHANGES (everything else is round 10's A, note for note):
  both  her voice treated (voicemix.prep "gentle": 70 Hz high-pass, de-esser, gentle levelling,
        -1.5 dB at 3.4 kHz) and set at -16 LUFS with the music 10 LU under her (no music_db: the
        gap sets it). Round 10: raw voice, music at -12 dB, which put her about 15-16 LU over it.
  screens11-a  the piano exactly as written in round 10 (voice_touch 0: no softer touch under her
        words), so A answers only "is this balance right?".
  screens11-b  the same balance, plus the piano made subtler under her words (the diagnosis rules,
        SONGBOOK "Under a narrator"): the high B-flat 5 / G5 tick (fundamentals 784-932 Hz, inside
        her 250 Hz-3 kHz band) plays only where she is silent; under her words the piano steps
        down below her voice: soft low notes (G2/C3 under C minor 9, C3/A-flat 2 under A-flat
        major 9, all under her lowest pitch, measured about 147 Hz), at most one a second, at the
        softer touch. The pad, bass, chords, shape and logo are untouched.
  REVIEW FIX (a fresh reviewer, same day): "silent" and "pause" are now measured on her recording
        (_heard), not read from the word list, whose times are padded: three of B's five low
        notes had been struck mid-word. B's ticks and low notes now start only in her real pauses
        (5.3-5.8, 6.5-6.9, 7.6-7.7, 8.7-9.1 s), and the ending chord's E-flat 3 / A-flat 3, struck
        inside her word "everything.", are left out in B (its low B-flats stay).

ROUND 10 NOTES FOLLOW.
"""
"""Round 10 feel sketches, "screens": the wall-of-screens fairytale's closing stretch, written the
unity way (style v4). Two 15 s sketches for the owner's ear, before any full score.

WINDOW: picture round6/fairytale-screens.mp4 from 60.0 s to its end at 75.0 s; piece time = film
time - 60.0. Her voice (voice-take1-lily.wav, same clock as the picture) is muxed from 62.0 s, so
her line before ("...what happens with our data.", ends 61.63) is not heard and the music has two
seconds alone before "It's time to free ourselves" (62.03 -> 2.03).
Picture turns (film -> piece): 62.03 -> 2.03 the cut on "It's time to free ourselves",
66.20 -> 6.20 the wall of screens ("It's time, at long, long last"), about 69.4 -> 9.4 the
"open source everything." card, the name card's middle 71.933 -> 11.933, the end 75.0 -> 15.0.
Her last word "everything." ends 71.54 -> 11.54, 0.39 s before the name.

FIX PASS (the mix engineer's findings, 2026-11-25). What changed, and why, in plain terms:
  1. Voice-leading by common tones: the held chord keeps G4 when C minor 9 turns to A-flat major 9
     (only the bass moves, C2 -> A-flat 2), so every high G5 and B-flat 5 of the pulse has the same
     note an octave or two below it. The ending holds F4 (B-flat 9 sus), which also sits under the
     name, so the logo's landing F5 is doubled an octave down.
  2. The chord change moved from the middle of "past." (5.18 s) to bar 4's downbeat (6.226 s),
     26 ms after the cut to the wall of screens.
  3. One dynamic shape for the whole stretch: everyone (pulse, bass, held chord) plays a little
     harder from bar 3 into the wall of screens, holds there, and settles under "open source
     everything."; a small shared accent on the downbeats of bars 3, 4 and 6.
  4. The pulse rests where she needs room: on her first word ("It's", bar 2's downbeat) and from
     "source" (9.84 s) to the name. The ending's G5 over B-flat sus is gone with that rest.
  5. Both sketches end on the same piano-only logo (no violin section), played by the same piano
     at the bed's level and touch (a little firmer, never more than +0.08 over the bed's peak),
     centred, on the bed's tone. So the pair differs in ONE thing: the held layer.
  6. B (the ringing piano) re-strikes its chord softly on every bar's downbeat, so the high tick
     never plays over a chord that has died away.
"""
import os as _os

import numpy as _np

import recipes as R
from films import Film, speech_from_words

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_FILM_DIR = _os.path.normpath(_os.path.join(_HERE, "..", "..", "..", "film"))
WORDS = _os.path.join(_FILM_DIR, "src", "round2", "take1-words-lily.json")
VOICE = _os.path.join(_FILM_DIR, "public", "audio", "voice-take1-lily.wav")
PICTURE = "/home/destin/Documents/youcoded-campaign/round6/fairytale-screens.mp4"
T0 = 60.0                      # film second where the piece starts
T_FROM = 62.0                  # her file's second that lands at 2.0 s in the piece
LENGTH = round(75.0 - T0, 3)   # 15.0: the picture ends at 75.0 s

SPEECH = speech_from_words(WORDS, T_FROM, start_at=T_FROM - T0)

BRIEF = R.Brief("narrated", LENGTH, ("hopeful", "widening", "storybook", "warm"), "subtle",
                moments=[(2.03, "free ourselves"), (6.20, "peak"), (9.4, "open source everything.")],
                logo_at=round(71.933 - T0, 3),
                picture=[(0.0, "the asking"), (2.03, "free ourselves"), (6.20, "the wall of screens"),
                         (9.4, "open source everything."), (11.933, "the name")])
LAND = BRIEF.logo_at

# WHY 115.65 bpm, one 1-beat bar as bar 5 (the first fit of `render.sh --brief screens-a
# range=112-124`): his narrator pick was "120 with breaths", and this is the tempo nearest 120 that
# puts BOTH scene cuts on bar lines (the cut on "It's time to free ourselves" 45 ms before bar 2,
# the wall of screens 26 ms before bar 4) and lands the name exactly. 120.67 missed the wall by
# 233 ms. Her own band here is 68-102 (she reads slowly, 3.4 syllables a second); the slower fits
# (100-106) put neither cut on a bar line, so tempo is not the A/B question for this film.
# Bars on this grid (beats from the start): bar 1 at 0 (0.00 s), bar 2 at 4 (2.08 s), bar 3 at 8
# (4.15 s), bar 4 at 12 (6.23 s, the wall of screens), bar 5 the odd 1-beat bar at 16 (8.30 s),
# bar 6 at 17 (8.82 s), the ending at 21 (10.88 s), the name at 23 (11.93 s).
COMMON = dict(land=LAND, bpm=115.65, odd=1, odd_at=5, speech=SPEECH, brief=BRIEF, subtle=True,
              ending="short", chords=["Cm9", "Abmaj9"], seed=10,
              # WHY B-flat 5 and G5 for the high pulse (recipe C's default is B-flat 5 and F5): F is
              # not a tone of C minor 9 or A-flat major 9; B-flat and G belong to both (and are the
              # first two notes of the logo's "you-co-ded"). Both stay above her range. With G4
              # now held under both chords (VOICING below), both are doubled in the bed.
              pool=("Bb5", "G5"),
              # WHY the piano-only logo for BOTH (finding: A's quiet logo brought a violin section in
              # on the name, owning 96 % of 2-6 kHz, and B's differed from A's): he preferred quiet
              # or piano-only ("prefer b/c to a"); one ending for both keeps the pair to ONE question
              logo="piano",
              # WHY no music_db (round 10 had -12 with her raw voice): he heard her "FAR too loud"
              # (measured 15-16 LU over the music). Her voice is now treated (prep "gentle", the v4
              # default, named here so the file says it) and the mux sets her at -16 LUFS with the
              # music 10 LU under her: she comes down about 2 dB and the music up about 3 dB, his
              # "lower her voice a bit, raise the music a smidge". One level for the whole stretch.
              voice_mux=dict(path=VOICE, t_from=T_FROM, start_at=T_FROM - T0, prep="gentle",
                             gap_lu=10.0, voice_lufs=-16.0))

# ---------------------------------------------------------------- the passage, as written here
# THE HELD CHORD'S VOICING (the pad in A, the ringing piano in B), by chord. WHY: C minor 9 to
# A-flat major 9 shares E-flat, B-flat, C and G, so the upper voices stay put and only the bass
# moves; the toolkit's default moved G4 up to A-flat 4 (to hold the root), which left the pulse's
# six G5s with no G anywhere beneath them (the "thrown-in high notes" he flagged). The ending holds
# F4 (G4 steps down to it): B-flat 9 sus without its A-flat on top, and that F4 rings on under the
# name as E-flat 6/9, doubling the logo's landing F5 an octave down.
VOICING = {"Cm9": ["Eb3", "Bb3", "C4", "G4"], "Abmaj9": ["Eb3", "Bb3", "C4", "G4"],
           "Bbsus": ["Eb3", "Bb3", "C4", "F4"], "Eb": ["Eb3", "Bb3", "C4", "F4"]}
# THE ONE DYNAMIC SHAPE, as (beat, how hard everyone plays, x the written touch). WHY: the picture
# widens (the cut at 2.03, the bloom, the wall of screens at 6.20) and the music stayed flat (pulse
# touch 0.19-0.21 throughout). Level through bar 2 (she enters), a rise across bar 3 into the wall of
# screens, held through bar 4, settling across bars 5-6 under "open source everything.". 1.3 takes
# the pulse from about 0.20 to about 0.26.
SHAPE = [(0.0, 1.0), (8.0, 1.0), (12.0, 1.3), (16.0, 1.3), (19.0, 1.08), (23.0, 1.08)]
ACCENT_BEATS = (8.0, 12.0, 17.0)   # bars 3, 4, 6: +0.03 on the pulse and the bed together
ACCENT = 0.03
# WHERE THE PULSE RESTS (beats). WHY: "It's" (2.03 s) is her shortest word and the pulse's B-flat 5
# landed on it; from "source" (9.84 s, beat 19) to the name her last words are her softest, so the
# pulse stops and the held chord alone carries her to the name (this also removes the G5 that sat
# over B-flat sus at 10.88 s). A rest, written; not a duck.
PULSE_REST = [(3.9, 4.1), (18.9, 23.0)]
# THE LOGO, played by the bed's piano. WHY: as written by the toolkit it was struck at 0.42-0.62
# (2-3 times the pulse), on a channel set 5.15 dB louder than the piano's, panned left, a brighter
# tone: the one tune in the piece arriving as a different, louder instrument (cause 2, "thrown in
# on top"). Here its touches sit at most +0.04 over the bed's peak (about 0.29, the accented wall of
# screens), the landing the firmest. WHY 0.33 on the landing F5 (0.30 tried first): at 0.30 the softer
# attack was heard 12.5 ms after the name in A (the hard check allows 10); at 0.33 it is 2.6 ms.
LOGO_TOUCH = {70: 0.24, 79: 0.27, 77: 0.33}   # B-flat 4, G5, F5 (what the note log will show)
LOGO_TONE = -0.25                              # the bed's own tone (the pulse plays at about -0.3)
LEAD_TRIM = -5.15                              # lead bus gain = piano bus gain (computed from mix.py:
                                               # TARGET, REF, CAL and Piece.touch 0.85, 2026-11-25)
LANDING_SCALE = 0.75                           # the piano logo's E-flat chord under the name
ENDING_SCALE = 0.75                            # the ending's held B-flat sus (the piano logo plays it x1.2)
RING_RESTRIKE = 0.16                           # B: the chord again on every bar's downbeat
# WHY the toolkit's own ring touch for a new chord: 0.16 and 0.20 were tried to clear her word
# "time," (6.27 s) at the wall of screens; they moved its margin by only 0.2 dB (the accented pulse
# and the new bass are what sit on that word), so the ring keeps its usual touch
RING_FIRST = 0.24
# WHY bar 2's chord on beat 3 (3.09 s, inside "ourselves"), not its downbeat: her first word "It's"
# (2.03 s, 0.16 s long) takes bar 2's downbeat; struck there, the chord sat 1-2 dB UNDER that word
RING_BAR2_AT = 6.0
MINE = ("screens11-a", "screens11-b")

# ---------------------------------------------------------------- round 11, B only
# THE LOW STEP-ASIDE under her words (B). WHY these pitches:
# her voice's pitch measured 147-308 Hz (5th-95th percentile, median 199), so every note here sits
# under it: G2 98 Hz, C3 131 Hz, A-flat 2 104 Hz. Each is a tone of its chord and none rubs the
# held bass (G2 is a fifth over C2; A-flat 2 doubles the bass; C3 is the common tone of both
# chords, so the line rocks on one shared note). WHY at most one a second: the songbook allows at
# most about one soft attack a second while she speaks. The line stops at beat 18.9, where round
# 10 already rests the pulse under "source everything."
# REVIEW FIX: the line is now placed in her REAL pauses (see _heard), not at fixed beats moved
# into the word list's gaps (three of those five attacks landed mid-word). Pitches by chord, taken
# in turn: G2 then C3 under C minor 9, C3 then A-flat 2 under A-flat major 9.
LOW_PITCH = {"Cm9": (43, 48), "Abmaj9": (48, 44)}
LOW_PAUSE = 0.10          # s: the shortest real pause that takes a low note
LOW_SPACING = 0.9         # s: at most about one soft attack a second
LOW_UNTIL = 18.9          # beat: the line stops where round 10 already rests the pulse
HEARD_DB = 30.0           # dB under her loud syllables that counts as her voice sounding
TICK_CLEAR = 0.10         # s of silence after a high tick's attack before her next syllable
# WHY 0.21 (0.17 tried first): with Piece.touch 0.85 and voice_touch -0.05 it logged 0.09-0.14,
# under half the pulse's 0.20-0.25; 0.21 logs about 0.13-0.18, still softer than the tick in her pauses
LOW_TOUCH = 0.21
# B: the ending chord's notes from this MIDI note up (D3, 147 Hz, her lowest measured pitch) are
# left out where they would be struck inside her word (see the piano wrapper)
ENDING_B_LOWEST = 50


def _mine(piece):
    return getattr(piece, "name", "").split("-sketch")[0] in MINE


def _is_b(piece):
    return getattr(piece, "name", "").split("-sketch")[0] == "screens11-b"


def _words(piece):
    return sorted((a, b) for _, a, b in piece.speech.words)


_HEARD = {}


def _heard(piece):
    """(times, True where her voice is actually sounding) on the piece's clock, 10 ms steps, from
    her recording itself. WHY (round 11 review): the word list's times are padded; measured on
    the recording, "It's time to free ourselves" runs unbroken from 2.21 to 3.62 s, so the
    50-110 ms "gaps" between listed words that B first struck its low notes into were inside
    her speech (her voice at -12 to -15 dB at three of those five attacks), and the listed word
    "time," (6.27-6.83) is really 6.04-6.47 then a real pause. Her real pauses are where the
    piano may move (SONGBOOK "Under a narrator": struck notes go in her pauses)."""
    if piece.name not in _HEARD:
        import voicemix
        from dsp import SR
        v = voicemix.raw_track(piece, int(round(piece.length * SR)), SR)
        h = int(0.01 * SR)
        e = _np.array([10 * _np.log10(_np.mean(v[i:i + h] ** 2) + 1e-20) for i in range(0, len(v) - h, h)])
        loud = _np.percentile(e[e > -90], 95) if (e > -90).any() else 0.0
        # WHY 30 dB under her loud syllables: her words measure -10 to -20 dBFS and her pauses
        # under -50 (room tone about -100); -40 sits between, so breath noise is not "speaking"
        _HEARD[piece.name] = (_np.arange(len(e)) * 0.01, e > loud - HEARD_DB)
    return _HEARD[piece.name]


def _heard_speaking(piece, a, b):
    """True if her voice sounds anywhere in [a, b) s."""
    t, on = _heard(piece)
    sel = (t >= a) & (t < b)
    return bool(on[sel].any())


def _real_pauses(piece, lo, hi, min_len):
    """Her real pauses (start, end) of at least `min_len` s that start in [lo, hi)."""
    t, on = _heard(piece)
    out, s = [], None
    for ti, o in zip(t, on):
        if not o and s is None:
            s = ti
        elif o and s is not None:
            if ti - s >= min_len and lo <= s < hi:
                out.append((round(s, 3), round(ti, 3)))
            s = None
    return out


def _beat_of(band, t):
    """The beat whose time is `t` s (bisection on the band's tempo map)."""
    lo, hi = 0.0, 64.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if band.sec(mid) < t:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _shape(beat):
    xs, ys = zip(*SHAPE)
    return float(_np.interp(beat, xs, ys))


def _install():
    """Scoped to this film's two pieces (by name), like film_mim.py's shine: every other piece
    renders exactly as before. The guards keep a re-import from wrapping twice."""
    import bed as _bed
    import score as _score
    from dsp import note as _note

    if not getattr(_bed.BedLine._voice, "_screens11", False):
        _orig_voice = _bed.BedLine._voice

        def _voice(self):
            out = _orig_voice(self)
            if not _mine(self.piece):
                return out
            # WHY replace, not re-search: the search's cost prefers the chord's root in the held
            # voices (v4); here the bass names the root and the upper voices hold the common tones
            return [(b, n, c, [_note(x) for x in VOICING.get(c, [])] or ms) for b, n, c, ms in out]
        _voice._screens11 = True
        _bed.BedLine._voice = _voice

    if not getattr(_score.Band.piano, "_screens11", False):
        _orig_piano = _score.Band.piano

        def _piano(self, bus, beat, m, beats, vel, tone=0.0, pedal=False, p=0.0, jit=5.0, role="", canon=None,
                   **kw):
            if not _mine(self.piece):
                return _orig_piano(self, bus, beat, m, beats, vel, tone, pedal, p, jit, role, canon, **kw)
            land = self.plans[-1].beat0 + self.plans[-1].blen
            end0 = self.plans[-1].beat0
            tch = float(getattr(self.piece, "touch", 1.0) or 1.0)
            if canon and canon[0] == "logo":
                # the logo by the bed's piano: its touch, its tone, centred (bus kept: the name's
                # landing is measured from the lead track)
                vel = LOGO_TOUCH.get(int(m), vel * tch) / tch
                return _orig_piano(self, bus, beat, m, beats, vel, LOGO_TONE, pedal, 0.0, jit, role, canon, **kw)
            if bus == "ring" and getattr(self, "_screens11_own_ring", False):
                return None                     # B's ring is struck by _ring below
            if role == "pulse" and any(a - 1e-6 <= beat < z for a, z in PULSE_REST):
                return None
            # WHY (round 11, B): "piano is also fighting her voice a bit for attention". The high
            # tick's notes sit inside her 250 Hz-3 kHz band and struck 2.3-2.6 a second while she
            # spoke; in B it keeps only the notes that fall where she is silent. A written rest
            # (the same notes, fewer of them), not a duck: nothing already sounding is turned down
            # (review fix: judged on her recording, not the padded word list; a tick is kept only
            # where she is silent from just before its attack to TICK_CLEAR s after it, so the
            # high attack never lands on a syllable; it may ring on under the next word, softly)
            if role == "pulse" and _is_b(self.piece):
                t = self.sec(beat)
                if _heard_speaking(self.piece, t - 0.03, t + TICK_CLEAR):
                    return None
            # WHY (round 11 review, B): the ending's piano chord is struck on bar 7's downbeat
            # (10.88 s), in the middle of her last and softest word "everything." (10.42-11.54),
            # and its E-flat 3 and A-flat 3 (156 and 208 Hz) sit inside her voice's pitch (about
            # 147-308 Hz): the one place B still struck notes in her range on a word, against B's
            # brief. B keeps the chord's low B-flats (under her voice); the held pad already
            # sounds E-flat 3, B-flat 3, C 4 and F 4 there, so the chord is still B-flat sus.
            # A written omission, not a duck; A keeps the chord as round 10 wrote it.
            if (_is_b(self.piece) and end0 - 1e-6 <= beat < land - 1e-6 and role not in ("pulse", "bass")
                    and int(m) >= ENDING_B_LOWEST and _heard_speaking(self.piece, self.sec(beat) - 0.03,
                                                                      self.sec(beat) + TICK_CLEAR)):
                return None
            if beat >= land - 1e-6:
                vel *= LANDING_SCALE            # the piano logo's E-flat chord under the name
            elif beat >= end0 - 1e-6 and role not in ("pulse", "bass"):
                vel *= ENDING_SCALE             # the ending's held B-flat sus
            else:
                vel *= _shape(beat)
                # WHY a 0.2-beat window: a rolled chord's notes start 0.03 beat apart, all on the downbeat
                if any(-1e-6 <= beat - a < 0.2 for a in ACCENT_BEATS):
                    vel += ACCENT
            return _orig_piano(self, bus, beat, m, beats, vel, tone, pedal, p, jit, role, canon, **kw)
        _piano._screens11 = True
        _score.Band.piano = _piano

    if not getattr(_bed.play, "_screens11", False):
        _orig_play = _bed.play

        def _play(band, plans, piece):
            if not _mine(piece):
                return _orig_play(band, plans, piece)
            ring = (band.bedline.cfg.get("sustain") == "ring")
            band._screens11_own_ring = ring
            try:
                info = _orig_play(band, plans, piece)
            finally:
                band._screens11_own_ring = False
            if ring:
                _ring(band, plans)
            elif not band.dry:
                _pad_shape(band)
            if _is_b(piece):
                _low(band, piece)
            return info
        _play._screens11 = True
        _bed.play = _play


def _bars(plans):
    """(beat, length) of every body bar."""
    return [(b.beat, p.blen) for p in plans if not p.ending for b in p.bars]


def _ring(band, plans):
    """B's held layer: the voicing struck on every bar's downbeat (bar 2's on beat 3, see
    RING_BAR2_AT) and the ending's, each held (pedalled) until the next strike, firmer when
    the chord is new, through the same dynamic shape and accents as the pulse. WHY (finding): the
    toolkit struck the ring once per chord (plus its top two notes halfway), so it fell about 14 dB
    within a second and, for half of B, the high tick played over a chord that had died away."""
    bl = band.bedline
    land = bl.land_beat
    prev = None
    strikes = [(b, n) for b, n in _bars(plans)] + [(bl.end_beat, land - bl.end_beat)]
    strikes = [((RING_BAR2_AT, n - (RING_BAR2_AT - b)) if abs(b - 4.0) < 1e-6 else (b, n)) for b, n in strikes]
    # WHY each held to the next strike: bar 1's chord must ring on until bar 2's later touch
    strikes = [(b, (strikes[i + 1][0] - b) if i + 1 < len(strikes) else n) for i, (b, n) in enumerate(strikes)]
    for b, n in strikes:
        ms = bl.pad_at(b + 1e-6)
        chord = next((c for bb, nn, c, _ in bl.voicing if bb - 1e-6 <= b < bb + nn), None)
        v = RING_FIRST if chord != prev else RING_RESTRIKE
        prev = chord
        for q, m in enumerate(sorted(ms)):
            # through the wrapper: shape, accents and the ending's scale apply as to the pulse
            band.piano("ring", b + 0.03 * q, m, n + 0.25, v, tone=-0.3, pedal=True, p=-0.05, role="sustain")


def _low(band, piece):
    """B's low step-aside line (see LOW_PITCH). WHY attacks in her REAL pauses: a note's attack is
    the event that pulls the ear; struck just after her word ends, in a pause of at least
    LOW_PAUSE s measured on her recording, it rings on softly under her next words without landing
    on a syllable (SONGBOOK: struck notes go in her pauses). At most one per LOW_SPACING s; none
    where her speech runs on without a pause (2.2-5.3 s: the held chord alone carries her there).
    Through the wrapper, so the dynamic shape and accents apply as to the pulse."""
    bl = band.bedline
    first = min(a for _, a, _ in piece.speech.words)
    pauses = _real_pauses(piece, first, band.sec(LOW_UNTIL), LOW_PAUSE)
    times, last = [], -9.0
    for s, e in pauses:
        t = s + 0.03                        # 30 ms after her word's tail
        if t - last >= LOW_SPACING:
            times.append(t)
            last = t
    turn = {}
    tch = float(getattr(piece, "touch", 1.0) or 1.0)
    for k, t in enumerate(times):
        b = _beat_of(band, t)
        chord = next((c for bb, nn, c, _ in bl.voicing if bb - 1e-6 <= b < bb + nn), None)
        pitches = LOW_PITCH.get(chord)
        if not pitches:
            continue
        m = pitches[turn.get(chord, 0) % len(pitches)]
        turn[chord] = turn.get(chord, 0) + 1
        nxt = _beat_of(band, times[k + 1]) if k + 1 < len(times) else LOW_UNTIL
        # WHY let go at the chord change (first render: the G2 struck at 5.32 s rang on over the
        # bass's A-flat 2 at the wall of screens, a semitone, the clash check's one fault)
        nxt = min(nxt, next((bb + nn for bb, nn, c, _ in bl.voicing if bb - 1e-6 <= b < bb + nn), nxt))
        # WHY -0.05 on every note (the band's voice_touch softens only attacks inside a listed
        # word, and these are all in pauses): each rings on under her, so each gets the same
        # softer touch (divided by the shape and Piece.touch the wrapper and the band apply after)
        v = LOW_TOUCH - 0.05 / (_shape(b) * tch)
        band.piano("piano", b, m, max(1.0, nxt - b), v, tone=-0.3, pedal=False, p=0.0, jit=0.0, role="low")


def _pad_shape(band):
    """A's held layer follows the same dynamic shape as the piano. WHY (finding, and the unity
    reading 'levels move together' at -0.49): the pad is one held chord here, so its touch cannot
    move; its bus follows the shape instead, by the dB the shape gives the piano (the felt piano
    moves about 22 dB per unit of touch, mix.bus_gains; the pulse is written at about 0.20)."""
    from dsp import SR
    bl = band.bedline
    grid = _np.arange(0.0, bl.land_beat + 0.01, 0.25)
    secs = _np.array([bl.seconds(b) for b in grid])
    db = _np.array([22.0 * 0.20 * (_shape(b) - 1.0) for b in grid])
    t = _np.arange(band.n) / SR
    env = 10 ** (_np.interp(t, secs, db) / 20)
    band.bus["pad"] *= env[:, None]


_install()


def _fix(piece):
    """What this film writes over the recipe's layout."""
    # the chord change from the middle of "past." (bar 3, beat 3) to bar 4's downbeat, the cut
    s = piece.sections[0]
    if s.chords and len(s.chords) >= 3 and list(s.chords[2]) == ["Cm9", "Abmaj9"]:
        s.chords[2] = ["Cm9"]
    piece.mix = dict(piece.mix or {}, lead=LEAD_TRIM)
    return piece


# A: his pick from round 10 (the soft pad under the high piano tick), note for note, at the new
# balance. WHY voice_touch 0: the v4 default softens bed notes struck in her words by 0.05; A keeps
# the piano exactly as round 10 wrote it, so A and B differ only in the piano under her.
PIECE_A = _fix(R.narrated("screens11-a", LENGTH, **COMMON, sound={"voice_touch": 0.0},
                          notes="round 11 sketch A: round 10's A note for note; voice treated, -16 LUFS, "
                                "music 10 LU under her"))
# B: the same balance, the piano stepping aside under her words (the high tick only in her silences,
# a soft low note per half bar in the gaps between her words, the softer v4 touch in her words).
PIECE_B = _fix(R.narrated("screens11-b", LENGTH, **COMMON, sound={"voice_touch": -0.05},
                          notes="round 11 sketch B: A's balance; high tick only where she is silent, "
                                "one soft low note per half bar under her words, softer touch in her words"))

FILMS = [Film("screens11-a", PIECE_A, picture=BRIEF.picture, copy_to=None),
         Film("screens11-b", PIECE_B, picture=BRIEF.picture, copy_to=None)]
