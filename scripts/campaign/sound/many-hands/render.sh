#!/usr/bin/env bash
# Re-render every "Many hands" file into out/ and measure it (one command).
# First run creates the Python environment and downloads the CC0 samples.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -x "$HERE/.venv/bin/python" ]; then
  python3 -m venv "$HERE/.venv"
  "$HERE/.venv/bin/pip" install -q numpy scipy soundfile pyloudnorm
fi
"$HERE/.venv/bin/python" -I "$HERE/src/fetch.py"
"$HERE/.venv/bin/python" -I "$HERE/src/render.py" "$@"
"$HERE/.venv/bin/python" -I "$HERE/src/measure.py"
