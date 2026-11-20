#!/usr/bin/env bash
# Round two: renders all three films' scores (primary + alternative), verifies them, and copies the primary
# mixes to film/public/audio/ where the films read them. WHY one script: the film-to-file pairing and the
# checks live in one place, so a retimed film or a new narration is "edit the score file, run this".
#   film 1 "Once upon a time": take1-mix.wav (voice + score), take1-type-mix.wav (score only), take1-mix-alt.wav
#   film 2 "Make it mine":     take2-mix.wav, take2-mix-alt.wav
#   film 3 "Own everything":   take3-mix.wav, take3-mix-alt.wav
# Alternatives stay in music/out/ for comparison by ear; only the primaries go to the films.
set -euo pipefail
cd "$(dirname "$0")/music"
PY=.venv/bin/python
$PY r2_take1.py primary type alt
$PY r2_take2.py primary alt
$PY r2_take3.py primary alt
$PY r2_verify.py
for f in take1-mix take1-type-mix take2-mix take3-mix; do
  cp "out/$f.wav" "../film/public/audio/$f.wav"
done
echo "copied primaries to film/public/audio/"
