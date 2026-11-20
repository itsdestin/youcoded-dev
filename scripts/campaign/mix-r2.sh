#!/usr/bin/env bash
# Campaign scores: renders the brand-sound palette and all three films' scores, measures them, and copies the film
# mixes to film/public/audio/ where the films read them. WHY one script: the film-to-file pairing and the checks
# live in one place, so a retimed film or a new narration is "edit the score file's time table, run this".
# Round three (2026-11-20): the owner rejected round two's orchestra / band scores; everything is now the campaign
# piano + clean electronic production (music/bs_*.py). The round-two scores (r2_take*.py) are kept only for
# reference and are no longer rendered here.
#   palette:                   out/palette/1..5-*.wav (five 20 s sketches of the motif, to choose a sound by ear)
#   film 1 "Once upon a time": take1-mix.wav (voice + score), take1-type-mix.wav (= take1-score.wav, score only)
#   film 2 "Make it mine":     take2-mix.wav
#   film 3 "Own everything":   take3-mix.wav
set -euo pipefail
cd "$(dirname "$0")/music"
PY=.venv/bin/python
$PY bs_palette.py
$PY bs_fairytale.py
$PY bs_mine.py
$PY bs_own.py
cp out/take1-score.wav out/take1-type-mix.wav
$PY bs_verify.py
$PY bs_verify.py take1-mix.wav take1-score.wav take2-mix.wav take3-mix.wav
for f in take1-mix take1-type-mix take2-mix take3-mix; do
  cp "out/$f.wav" "../film/public/audio/$f.wav"
done
echo "copied film mixes to film/public/audio/"
