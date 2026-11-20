#!/usr/bin/env bash
# Re-render every logo alternative into out/ and print the measurements (about 30 seconds).
# Uses the chosen sound's Python environment and recordings, read-only:
#   piano   ../felt-and-pulse/samples/        (that folder's render.sh downloads it)
#   strings ../felt-and-pulse-playful/samples/ (that folder's render.sh downloads it)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DIR/../felt-and-pulse/.venv/bin/python"
[ -x "$PY" ] || { echo "Run ../felt-and-pulse/render.sh once first (it sets up Python and the piano)."; exit 1; }
[ -d "$DIR/../felt-and-pulse-playful/samples/vsco/Strings" ] || { echo "Run ../felt-and-pulse-playful/render.sh once first (it downloads the strings)."; exit 1; }
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py"
