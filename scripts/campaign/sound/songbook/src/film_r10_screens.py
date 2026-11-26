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
"""
import os as _os

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
# WHY these chords (recipe C places them on her sentence ends): C minor 9 under "free ourselves from
# the tech monopolies of the past", A-flat major 9 from that sentence's end (it opens at the wall of
# screens) through "open source everything.", then the ending's B-flat sus and E-flat, home, only
# on the name. A third chord (E-flat add9 under "open source everything.") was tried first: it put
# home under her words a bar early, so the name had no arrival of its own; it was not the cause of
# the level fault below (measured: the same 4.6 dB with or without it).
COMMON = dict(land=LAND, bpm=115.65, odd=1, odd_at=5, speech=SPEECH, brief=BRIEF, subtle=True,
              ending="short", chords=["Cm9", "Abmaj9"], seed=10,
              # WHY B-flat 5 and G5 for the high pulse (recipe C's default is B-flat 5 and F5): F is
              # not a tone of C minor 9 or A-flat major 9, so for all of her line the top notes sat
              # outside the chord under them; B-flat and G belong to both (and are the first two
              # notes of the logo's "you-co-ded" that ends the piece). Both stay above her range.
              pool=("Bb5", "G5"),
              # WHY the music 13 dB under her (shot-d used 10): her last line is soft ("source" and
              # "everything." read 10 dB under the rest of her), and at -10 her voice was only
              # 4.6 dB (A) / 3.3 dB (B) over the music at 10.0 s: the narrator-masked hard check.
              # One hand-set level for the whole stretch, never a dip on her words.
              voice_mux=dict(path=VOICE, t_from=T_FROM, start_at=T_FROM - T0, music_db=-13.0))

# A: the toolkit's v4 default under a narrator: the soft pad holds the chords, the piano plays the
# high two-note pulse above her range, the quiet logo on the name.
PIECE_A = R.narrated("screens-a", LENGTH, **COMMON,
                     notes="round 10 sketch A: pad and the soft high piano pulse, quiet logo")
# B: everything is the one piano. The held layer is the ringing piano instead of the pad, and the
# name gets the piano-only logo. WHY this is the A/B for this film: his complaint was layers that
# sound like separate instruments; under her voice the bed is only two layers, so whether the pad
# reads as a second instrument is the one unity question this stretch can ask. Both are his own
# switches (sustain pad | ring, logo quiet | piano), offered for his ear, not decided here.
PIECE_B = R.narrated("screens-b", LENGTH, **COMMON, logo="piano", owner_over={"sustain": "ring"},
                     notes="round 10 sketch B: the one piano, ringing chords and the high pulse, piano-only logo")

FILMS = [Film("screens-a", PIECE_A, picture=BRIEF.picture, copy_to=None),
         Film("screens-b", PIECE_B, picture=BRIEF.picture, copy_to=None)]
