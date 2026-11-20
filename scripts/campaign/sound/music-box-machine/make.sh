#!/usr/bin/env bash
# Re-render every file of "the music-box machine" from scratch, then measure it.
# Usage: bash make.sh      (takes about 20 seconds)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$HERE/.venv/bin/python" ]; then
  python3 -m venv "$HERE/.venv"
  "$HERE/.venv/bin/pip" install -q numpy==2.5.5 scipy==1.18.1 soundfile==0.14.0 pyloudnorm==0.2.0
fi
"$HERE/.venv/bin/python" "$HERE/render.py"
"$HERE/.venv/bin/python" "$HERE/verify.py"
