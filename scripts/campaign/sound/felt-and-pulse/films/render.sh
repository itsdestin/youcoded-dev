#!/usr/bin/env bash
# Re-render the three film scores into out/films/ and copy the mixes to
# scripts/campaign/film/public/audio/fp-take{1,2,3}-mix.wav. Optional args: own-everything fairytale make-it-mine
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# the films reuse the candidate's logo.wav, environment and samples: make sure they exist
if [ ! -f "$DIR/out/logo.wav" ] || [ ! -x "$DIR/.venv/bin/python" ]; then "$DIR/render.sh" >/dev/null; fi
"$DIR/.venv/bin/python" -I "$DIR/films/build_films.py" "$@"
