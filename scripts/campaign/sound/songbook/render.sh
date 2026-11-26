#!/usr/bin/env bash
# THE SONGBOOK: re-render every demonstration, the join excerpts and the films into out/ and
# print the hard checks and the dashboard (out/checks.txt, out/films/checks.txt; every number in the .json files next to
# them). About 80 seconds; two runs give identical files. The films "Own everything" and "Make it
# mine" are also copied to scripts/campaign/film/public/audio/ (sb-take3-mix.wav, sb-take2-mix.wav)
# unless SONGBOOK_NO_COPY=1 is set (render into out/ only, e.g. to check the toolkit).
#
#   scripts/campaign/sound/songbook/render.sh                 # everything
#   scripts/campaign/sound/songbook/render.sh demo-journey    # just one piece (by name)
#   scripts/campaign/sound/songbook/render.sh own-everything  # just one film
#   scripts/campaign/sound/songbook/render.sh mim             # every film in src/film_mim.py
#   scripts/campaign/sound/songbook/render.sh --notes [--log] mim   # no audio: the notes bar by bar, the
#                                                             # hard checks and the dashboard (out/notes/), ~1 s
#   scripts/campaign/sound/songbook/render.sh --brief mim     # step 1: brief, tempo fit, her pace, motion grid
#   scripts/campaign/sound/songbook/render.sh --bed mim       # step 5: the bed alone, rendered
#   scripts/campaign/sound/songbook/render.sh --sketch mim [pad_level=-4]   # step 7: two 20 s sketches
#   scripts/campaign/sound/songbook/render.sh --deliver mim <dir> [picture=x.mp4] [from=s]  # mp3 (+ mp4)
#   scripts/campaign/sound/songbook/render.sh --py -c "import recipes as R; print(R.land_after(12, 116))"
#
# New films live in their own file, src/film_<key>.py (exposing FILM or FILMS); they are found
# automatically. Each film's report: out/films/<name>.checks.txt; notes: out/notes/<name>.txt.
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
# WHY studio.py (the rebuild, 2026-11-24): the composing procedure's steps (brief, notes with the
# dashboard, the bed alone, two sketches) share one entry point; see SONGBOOK.md "The procedure"
case "${1:-}" in
  --py)
    # WHY (first-shot a, c): composers hunted for the right Python and import path to call one
    # toolkit function (land_after, fit_tempo); this runs it with both set
    shift; cd "$DIR/src" && PYTHONPATH="$DIR/src:$DIR/src/engine" exec "$PY" "$@";;
  --notes|--brief|--bed|--sketch|--deliver|--shelf)
    "$PY" -I "$DIR/src/studio.py" "$@" 2> >(grep -v "RuntimeWarning: Unexpected value in sys" >&2)
    exit;;
esac
"$PY" -I "$DIR/src/build.py" "$@" 2> >(grep -v "RuntimeWarning: Unexpected value in sys" >&2)
