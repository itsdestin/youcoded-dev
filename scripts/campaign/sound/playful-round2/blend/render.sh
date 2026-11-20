#!/usr/bin/env bash
# Re-render blend-1.wav and blend-2.wav into out/ and print the measurements (about a minute).
# Reuses, read-only: the Python environment and CC0 piano in ../../felt-and-pulse/, the CC0
# strings downloaded in ../../felt-and-pulse-playful/samples/, and the logo
# ../../felt-and-pulse/out/logo.wav. Run those folders' render.sh once first if any is missing.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DIR/../../felt-and-pulse/.venv/bin/python"
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py"
