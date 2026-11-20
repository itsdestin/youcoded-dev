#!/usr/bin/env bash
# Campaign scores: renders the brand-sound palette and all three films' scores, measures them, and copies the film
# mixes to film/public/audio/ where the films read them. WHY one script: the film-to-file pairing and the checks
# live in one place, so a retimed film or a new narration is "edit the score file's time table, run this".
# Round three (2026-11-20): the owner rejected round two's orchestra / band scores; everything is now the campaign
# piano + clean electronic production (music/bs_*.py). The round-two scores (r2_take*.py) are kept only for
# reference and are no longer rendered here.
# Round four (2026-11-20): a mix engineer's measured review fixed (score audible under the narrator on a phone, air on
# top, Make it mine refitted from the film's own timeline by music/bs_picture.py, real near-silences, rising hits);
# music/bs_measure.py prints the brand audio rules as PASS/FAIL numbers for each film.
# Round five (2026-11-20): a second measured review. The brand piano is now the sampled Salamander Grand
# (music/bs_piano.py; download once with `.venv/bin/python bs_piano.py fetch`), the fairytale's hits are keyed to the
# narrator's REAL onsets (bs_voice.snap_words), Make it mine reads its payoff times from the re-cut picture again,
# no score pumps more than 2 dB, breaths hold a faint bed instead of digital silence, delivery peak is -1.7 dBTP.
#   palette:                   out/palette/1-3 (three tone-matched choices) + tempo-note-120bpm.wav (not a choice)
#   film 1 "Once upon a time": take1-mix.wav (voice + score), take1-type-mix.wav (= take1-score.wav, score only)
#   film 2 "Make it mine":     take2-mix.wav
#   film 3 "Own everything":   take3-mix.wav
set -euo pipefail
cd "$(dirname "$0")/music"
PY=.venv/bin/python
$PY -c 'import bs_piano, sys; bs_piano.available() or sys.exit("piano sound bank missing: run .venv/bin/python bs_piano.py fetch")'
$PY bs_palette.py
$PY bs_fairytale.py
$PY bs_mine.py
$PY bs_own.py
cp out/take1-score.wav out/take1-type-mix.wav
$PY bs_verify.py
$PY bs_verify.py take1-mix.wav take1-score.wav take2-mix.wav take3-mix.wav
$PY bs_measure.py films
$PY bs_measure.py out/palette/*.wav
for f in take1-mix take1-type-mix take2-mix take3-mix; do
  cp "out/$f.wav" "../film/public/audio/$f.wav"
done
echo "copied film mixes to film/public/audio/"
