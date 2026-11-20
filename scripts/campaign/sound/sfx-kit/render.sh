#!/usr/bin/env bash
# Re-render the whole youcoded sound-effects kit into out/ and print the checks.
# First run downloads the CC0 source recordings listed in SOURCES.md into samples/.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Python: this folder's own environment, else the sibling "felt and pulse" one (read-only use),
# else make one here.
PY="$DIR/.venv/bin/python"
if [ ! -x "$PY" ]; then
  if [ -x "$DIR/../felt-and-pulse/.venv/bin/python" ]; then
    PY="$DIR/../felt-and-pulse/.venv/bin/python"
  else
    python3 -m venv "$DIR/.venv"
    "$DIR/.venv/bin/pip" install -q numpy scipy soundfile matplotlib
  fi
fi
# Kenney.nl packs (CC0)
bash "$DIR/src/fetch_kenney.sh" rpg-audio casino-audio
# Freesound recordings (CC0 only; the fetcher refuses anything else)
"$PY" -I "$DIR/src/fetch_freesound.py" \
  fredclose/755218 bigmonmulgrew/378083 suspensiondigital/389702 emapuree/848748 \
  SpaceJoe/484968 khenshom/481075 dynamique/617019 SSkiba88/751055 TubbsMedia/377124 \
  Torikari/869328 redsedona/540567 SSkiba88/751062 esperri/119126 IENBA/834340 adina.trx/856380
# -I: isolated mode, so nothing in the sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py"
"$PY" -I "$DIR/src/plots.py"
