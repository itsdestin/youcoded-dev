#!/usr/bin/env bash
# Re-render every "felt and pulse" file into out/ and print the measurements.
# First run creates the virtualenv and downloads the CC0 piano samples (see SOURCES.md).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -x "$DIR/.venv/bin/python" ]; then
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -q numpy scipy soundfile pyloudnorm
fi
KIT="$DIR/samples/upright-kw/UprightPianoKW-SFZ+FLAC-20220221"
if [ ! -d "$KIT" ]; then
  mkdir -p "$DIR/samples/upright-kw"
  curl -sL -o "$DIR/samples/upright-kw/kw.7z" \
    "https://freepats.zenvoid.org/Piano/UprightPianoKW/UprightPianoKW-SFZ+FLAC-20220221.7z"
  (cd "$DIR/samples/upright-kw" && 7z x -y kw.7z >/dev/null && rm kw.7z)
fi
# -I: isolated mode, so nothing in the sample folder can shadow a Python module
"$DIR/.venv/bin/python" -I "$DIR/src/build.py"
