#!/usr/bin/env bash
# One command re-renders every Open air file into out/ and measures it.
# WHY a local venv: keeps the exact library versions (requirements.txt) away from the system Python.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$HERE/.venv/bin/python" ]; then
  python3 -m venv "$HERE/.venv"
  "$HERE/.venv/bin/pip" install -q -r "$HERE/requirements.txt"
fi
"$HERE/.venv/bin/python" "$HERE/render.py"
"$HERE/.venv/bin/python" "$HERE/verify.py"
