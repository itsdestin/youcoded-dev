#!/usr/bin/env bash
# THE SONGBOOK: re-render every demonstration into out/ and print the checks (out/checks.txt;
# every number in out/measurements.json). About 40 seconds; two runs give identical files.
#
#   scripts/campaign/sound/songbook/render.sh                 # everything
#   scripts/campaign/sound/songbook/render.sh demo-journey    # just one piece (by name)
#
# Needs: Python 3 with numpy, scipy, soundfile, pyloudnorm (requirements.txt). It uses
# songbook/.venv if you made one, otherwise the "felt and pulse" environment next door.
# Reads the CC0 recordings in place from the neighbouring folders (SOURCES.md); if they are
# missing it says which download script to run (it never downloads anything itself).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOUND="$(cd "$DIR/.." && pwd)"
PY="$DIR/.venv/bin/python"
[ -x "$PY" ] || PY="$SOUND/felt-and-pulse/.venv/bin/python"
if [ ! -x "$PY" ]; then
  echo "No Python environment. Make one:  python3 -m venv $DIR/.venv && $DIR/.venv/bin/pip install -r $DIR/requirements.txt" >&2
  exit 1
fi
need() { [ -d "$1" ] || { echo "Missing recordings: $1  (run $2 once; see SOURCES.md)" >&2; exit 1; }; }
need "${SONGBOOK_PIANO:-$SOUND/felt-and-pulse/samples/upright-kw/UprightPianoKW-SFZ+FLAC-20220221}" "$SOUND/felt-and-pulse/render.sh"
need "${SONGBOOK_STRINGS_A:-$SOUND/felt-and-pulse-playful/samples/vsco/Strings}/Viola Section" "$SOUND/felt-and-pulse-playful/fetch-strings.sh"
need "${SONGBOOK_STRINGS_B:-$SOUND/playful-round2/chamber/samples/vsco/Strings}/Solo Violin" "$SOUND/playful-round2/chamber/fetch-extra.sh"
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py" "$@" 2> >(grep -v "RuntimeWarning: Unexpected value in sys" >&2)
