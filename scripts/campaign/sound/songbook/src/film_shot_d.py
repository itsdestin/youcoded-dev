"""The fairytale, wall of screens, closing stretch (first-shot d): from "But in their excitement"
to the name, recipe C (narrated story). Hopeful and widening, landing on "open source
everything." and the name.

WINDOW: picture round6/fairytale-screens.mp4 from 37.933 s (frame 1138, 1.5 s before her "But"
at 39.43) to its end at 75.0 s; piece time = film time - 37.933. The video's own sound is her
voice alone (voice-take1-lily.wav, measured: same timing, correlation 1.00).
Picture turns (scene cuts, film time -> piece time): 43.80 -> 5.87 (the phone), 48.77 -> 10.83,
51.33 -> 13.40 ("And so, ... we get to decide"), 56.53 -> 18.60, 62.03 -> 24.10 ("It's time to
free ourselves"), 66.20 -> 28.27 (the wall of screens, "It's time, at long, long last"), the
"open source everything." card about 69.4 -> 31.5, the name card fading in 71.87-72.03 (its
middle 71.933 -> 34.0).
"""
import os as _os

import recipes as R
from films import Film, speech_from_words

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_FILM_DIR = _os.path.normpath(_os.path.join(_HERE, "..", "..", "..", "film"))
WORDS = _os.path.join(_FILM_DIR, "src", "round2", "take1-words-lily.json")
VOICE = _os.path.join(_FILM_DIR, "public", "audio", "voice-take1-lily.wav")
PICTURE = "/home/destin/Documents/youcoded-campaign/round6/fairytale-screens.mp4"
T0 = 37.933                    # film second where the piece starts (picture cut here)
T_FROM = T0 + 1.5              # her file's second that lands at 1.5 s in the piece
LENGTH = round(75.0 - T0, 3)   # the picture ends at 75.0 s

SPEECH = speech_from_words(WORDS, T_FROM, start_at=1.5)

# THE PICTURE IS CUT: its frames are the input
BRIEF = R.Brief("narrated", LENGTH, ("hopeful", "widening", "storybook", "warm"), "present",
                moments=[(13.40, "we get to decide"), (31.417, "peak")],   # "open" of "open source everything."
                logo_at=34.0,
                picture=[(0.0, "the Assistant card"), (5.87, "the phone"), (10.83, "the asking"),
                         (13.40, "we get to decide"), (18.60, "what our computers can do"),
                         (24.10, "free ourselves"), (28.27, "the wall of screens"),
                         (31.5, "open source everything."), (34.0, "the name")])
LAND = BRIEF.logo_at

PIECE = R.narrated(
    "shot-d", LENGTH, land=LAND, speech=SPEECH, turn=13.40, seed=31, whimsy=True, brief=BRIEF,
    # WHY this tempo line: copied from the first fit of `render.sh --brief shot_d` after the
    # short ending (below) was chosen; the name lands exactly. With the sigh ending the first fit
    # was bpm=101.15, odd=1, odd_at=1, rit=0.85 (peak on); with the short ending no fit puts
    # the peak ("open", 31.42 s) on: +170 ms here, accepted (nothing in the music marks it)
    bpm=106.37, odd=2, odd_at=15, rit=0.75,
    # WHY this change plan (step 4: one entry per turn of the picture, 8-16 s apart): the chords
    # turn bright on her turn "And so, ... we get to decide" (13.4 s; bar 7 is the nearest bar
    # line, 13.54 s), and the pad opens a little at "It's time to free ourselves" (24.1 s cut;
    # bar 12, 24.82 s, the nearest bar line), the story widening toward the wall of screens. Nothing at 28.3 s (only
    # 4 s later). The recipe's default "pool" entry is left out: she stops 0.4 s before the
    # name, inside the ending, so there is no bar after her last word to bring the pulse down in. The cycle is not brought in: with no
    # pause of a second before her last word it can place nothing.
    changes=[(7, "family", "bright"), (12, "brightness", 1.15)],
    # WHY subtle (a hard-fail fix, not taste): her last words "open source everything." run to
    # 33.5 s, so the whole ending bar (31.44 s on) sits under her, and "everything." is soft
    # (-25 to -33 dB in her file). As "present" the ending rose to the after-her-words level
    # (-2 dB, 4 dB over her -6) with the full blend: +5.5 dB under her, her voice -1.2 dB over
    # the music (narrator-masked FAILED). The quiet logo alone still read -1.2. subtle keeps her
    # level through the ending (the recipe's only argument for that) and gives the quiet logo.
    subtle=True,
    # WHY the short ending (the same hard-fail fix): even subtle, the sigh ending's C6 and B-flat 5
    # tune notes, its cadence chord and the logo's pick-ups all sounded under "open source
    # everything." (a 5.1 dB jump at 31.4 s; margin -1.0 dB). The short ending is only the logo's
    # two pick-ups, from about 32.9 s, so the music does not rise under her last line.
    ending="short",
    voice_mux=dict(path=VOICE, t_from=T_FROM, start_at=1.5, music_db=-10.0),
    notes="first-shot d: the fairytale's closing stretch, recipe C: pad and the soft two-note high pulse "
          "under her, dark chords turning bright at 'And so, ... we get to decide', the pad opening at "
          "'free ourselves', the short ending and the quiet logo on the name 0.4 s after her last word.",
    # WHY these explanations (the dashboard rule: explain an out-of-range gauge, never bend the music)
    explain={"tilt": "-13.8: a pad and a two-note pulse high and very soft under her the whole way, no tune, the "
                     "quiet logo; darker than the owner's piano logo (-11), like recipe C's example (-13.0)",
             "narrator-chords": "chords change only on a half-bar (1.13 s at 106 bpm): her sentence ends at 18.41 and "
                                "27.59 s fall 0.36 and 0.52 s after the half-bars the chords took (the grid's limit)",
             "picture-sync": "'we get to decide' (a weight-1 moment) is the chord turn on the nearest bar line, 130 ms "
                             "late; the peak ('open', 31.42 s) is under her words, where nothing in the music is "
                             "accented, and with the short ending no fit lands it",
             "cell-present": "under her the pulse is B-flat 5 and F5 only (recipe C) and no tune fits: she talks "
                             "until 0.4 s before the name; the cell is heard once, as the logo's own pick-ups",
             "level-rate": "the short ending's B-flat sus chord with its low B-flat (32.69 s) after the 2-beat odd "
                           "bar's two quiet pulse notes, then the logo: the one rise in the piece, on her last line",
             "payoff-louder": "the 'peak' is her last line, under her words at the one hand-set level; recipe C has "
                              "no lift and a subtle piece does not rise under her",
             "logo-gentle": "the logo is already 'quiet'; the 'peak bar' it is compared with is the 2-beat odd bar "
                            "under her words (two soft pulse notes), so the name is the first full chord",
             "voice-steady": "bar 7 rises 1.7 dB under her: the bright E-flat chord with its low root on her turn "
                             "('And so, ... we get to decide'), a planned chord change, not a swell"})
FILM = Film("shot-d", PIECE, picture=BRIEF.picture, copy_to=None)
