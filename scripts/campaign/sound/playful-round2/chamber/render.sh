#!/usr/bin/env bash
# Re-render chamber-1.wav and chamber-2.wav into out/ and print the measurements (out/checks.txt).
# Reuses, read-only: the chosen sound's Python environment, piano samples and logo
# (../../felt-and-pulse) and the earlier round's string samples (../../felt-and-pulse-playful).
# Downloads two extra CC0 string sets on first run (SOURCES.md).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DIR/../../felt-and-pulse/.venv/bin/python"
"$DIR/fetch-extra.sh" >/dev/null
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py"
