#!/usr/bin/env bash
# Re-render every playful-backing version into out/ and print the measurements.
# Reuses the chosen candidate's Python environment and CC0 piano read-only
# (../felt-and-pulse/.venv and ../felt-and-pulse/samples); run ../felt-and-pulse/render.sh once
# first if those are missing. Downloads the CC0 string samples on first run (SOURCES.md).
# Optional arguments render only versions whose names start with them, e.g. render.sh 4 11
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DIR/../felt-and-pulse/.venv/bin/python"
"$DIR/fetch-strings.sh" >/dev/null
# -I: isolated mode, so nothing in a sample folder can shadow a Python module
"$PY" -I "$DIR/src/build.py" "$@"
