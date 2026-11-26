"""The storybook fairytale, first 38 s (first-shot test C): a small, resigned dark bed under her
quick words while the corporations rule, turning to wonder on "wonderful"."""
import os

import build
import recipes as R
from films import Film, speech_from_words

# TOOLKIT BLOCK, worked around here (this file is the only one this score may edit): a piece with no
# melody at all (no tune phrase and logo="none") crashes build.one, because engine/master.motif_check
# takes r.min() of an empty list. WHY this patch and nothing more: with no melody notes there is
# nothing for "the tune on top" to measure, so it reports 0 of 0 notes and no weakest note; every
# piece that does have melody goes through the original function unchanged. It moves no gauge.
_motif_check = build.motif_check


def _motif_check_empty_ok(raw, raw_b, events):
    if not events:
        return dict(notes=0, above_0db=0, min_db=None, median_db=None, weakest=[])
    return _motif_check(raw, raw_b, events)


build.motif_check = _motif_check_empty_ok

_HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = os.path.normpath(os.path.join(_HERE, "..", "..", "..", "film", "src", "round2", "take1-words-lily.json"))
VOICE = os.path.normpath(os.path.join(_HERE, "..", "..", "..", "film", "public", "audio", "voice-take1-lily.wav"))

# THE PICTURE IS CUT (round6/fairytale-book.mp4, 0-38 s) and its own sound is her voice, starting
# at 0.15 s. WHY start_at=0.0, not the guide's 1.5: the picture's frames and her voice are fixed
# together, so piece time = film time; a 1.5 s pre-roll would mean re-cutting the picture.
LENGTH = 38.0
SPEECH = speech_from_words(WORDS, 0.0, t_to=LENGTH, start_at=0.0)   # to "...a great treasure:" (37.83)
T_WONDERFUL = 24.39                                                  # "wonderful" in her word file
BRIEF = R.Brief("narrated", LENGTH, ("small", "resigned", "storybook", "mischievous", "wondering"), "subtle",
                moments=[(T_WONDERFUL, "peak")], logo_at=None,
                picture=[(0.0, "the book, dark: the corporations rule"),
                         (23.17, "the page turns light: something wonderful")])
# WHY land from 18 bars: no name appears in this 38 s window (logo="none", the hand-on ending), so the
# ending is placed as the last whole bar that fits before the picture ends, at the fit's tempo
BPM, RIT = 118, 0.75                                                 # copied from render.sh --brief, fit 1
LAND = R.land_after(18, BPM, "short", rit=RIT)                       # 37.768 s

PIECE = R.narrated(
    "shot-c", LENGTH, land=LAND, speech=SPEECH, bpm=BPM, rit=RIT, turn=T_WONDERFUL, seed=11, whimsy=True,
    brief=BRIEF,
    logo="none", ending="short",
    # WHY music_db -12 (the example's -10 failed the HARD narrator-masked check: her voice only 5.1 dB
    # over the music at 31.73 s, where she drops her voice on "artificial intelligence"): one static
    # hand-set mux level for the whole film, 2 dB lower, so every word stays clear; no ducking
    voice_mux=dict(path=VOICE, t_from=0.0, start_at=0.0, music_db=-12.0),
    notes="First shot C: recipe C as written under her first 38 s; dark C-minor chords on her sentence ends, "
          "bright from 'wonderful', the two-note high pulse, no logo (her story goes on past the window).",
    explain={"chord-variety": "38 s of her story walks once through the dark family and once into the bright one, a "
                              "chord per sentence end: nothing comes back because the story only goes forward here",
             "narrator-chords": "chords can only change on a half-bar (1.02 s at 118): three sentence ends snap "
                                "0.3-0.45 s off (a known limit of the chord grid)",
             "tilt": "a two-note pulse high and very soft over the pad, no tune and no logo in this window: darker "
                     "than the owner's piano logo (-11). Information for his ear",
             "cell-present": "she speaks to 37.83 s with no pause of a phrase's length: recipe C puts the tune only in "
                             "her pauses and after her last word, which come after this 38 s window",
             "level-rate": "the hand-on ending: the window ends mid-sentence, so the music stops at 37.8 s",
             "payoff-louder": "the peak ('wonderful') is under her words at the one hand-set level: it turns bright, "
                              "it does not get louder (the owner: under a narrator the level does not bounce)",
             "voice-steady": "bar 8 (14.2 s) is the Abmaj9 on her sentence end 'accepted it.', struck with its low "
                             "root: a planned chord change, not a swell"},
    # WHY v3: made before the unity rebuild (2026-11-25); it renders as it was heard
    style="v3")
FILM = Film("shot-c", PIECE, picture=BRIEF.picture, copy_to=None)
