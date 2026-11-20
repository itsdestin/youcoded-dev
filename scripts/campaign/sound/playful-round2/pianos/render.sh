#!/usr/bin/env bash
# Re-render pianos-1.wav and pianos-2.wav into out/ and print the measurements (out/checks.txt).
# Reuses felt-and-pulse's Python environment, CC0 piano samples and logo.wav, read only
# (run ../../felt-and-pulse/render.sh once first if those are missing).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DIR/../../felt-and-pulse/.venv/bin/python"
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py"
