#!/usr/bin/env bash
# Re-fetch the OPTIONAL piano recordings the songbook can A/B against its own piano
# (toolkit-plan.md b1; licences and checksums in SOURCES.md). Nothing here is needed for the
# default sound: the default piano (Upright KW) is fetched by ../felt-and-pulse/render.sh.
#
#   scripts/campaign/sound/songbook/fetch-samples.sh            # both
#   scripts/campaign/sound/songbook/fetch-samples.sh vcsl       # VCSL "Upright Piano, Yamaha" (CC0), ~60 MB
#   scripts/campaign/sound/songbook/fetch-samples.sh salamander # Salamander Grand V3 (CC-BY 3.0), 742 MB download,
#                                                               # two layers (~120 MB) kept
# Files land in songbook/samples/ (git-ignored). Every file is checked against samples.sha256.
# WHY data only: the recordings are read as audio; nothing inside the downloads is ever run.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES="$DIR/samples"
SUMS="$DIR/samples.sha256"
what="${1:-all}"
mkdir -p "$SAMPLES"

check() {   # check <file path relative to samples/>
  local want
  want="$(awk -v f="$1" '$2 == f {print $1}' "$SUMS")"
  [ -n "$want" ] || { echo "no checksum for $1 in samples.sha256" >&2; exit 1; }
  echo "$want  $SAMPLES/$1" | sha256sum -c --quiet - || { echo "checksum mismatch: $1" >&2; exit 1; }
}

if [ "$what" = all ] || [ "$what" = vcsl ]; then
  # Pinned to one commit of github.com/sgossner/VCSL so the files never change under us.
  COMMIT=c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e
  BASE="https://raw.githubusercontent.com/sgossner/VCSL/$COMMIT/Chordophones/Zithers/Upright%20Piano,%20Yamaha/Sustains"
  mkdir -p "$SAMPLES/vcsl-upright"
  for f in $(awk '$2 ~ /^vcsl-upright\/.*\.wav$/ {sub("vcsl-upright/", "", $2); print $2}' "$SUMS"); do
    [ -f "$SAMPLES/vcsl-upright/$f" ] || curl -fsSL -o "$SAMPLES/vcsl-upright/$f" "$BASE/$f"
    check "vcsl-upright/$f"
  done
  [ -f "$SAMPLES/vcsl-upright/LICENSE" ] || curl -fsSL -o "$SAMPLES/vcsl-upright/LICENSE" \
    "https://raw.githubusercontent.com/sgossner/VCSL/$COMMIT/LICENSE"
  check "vcsl-upright/LICENSE"
  echo "VCSL upright: ok"
fi

if [ "$what" = all ] || [ "$what" = salamander ]; then
  URL="https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPiano-SFZ+FLAC-V3+20200602.tar.gz"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$SAMPLES/salamander"
  if [ ! -f "$SAMPLES/salamander/readme.txt" ]; then
    curl -fsSL -o "$TMP/salamander.tar.gz" "$URL"
    echo "$(awk '$2 == "salamander.tar.gz" {print $1}' "$SUMS")  $TMP/salamander.tar.gz" | sha256sum -c --quiet -
    # only the two layers the songbook reads (v5 soft, v9 loud) and the readme (licence text)
    tar -xzf "$TMP/salamander.tar.gz" -C "$TMP" --wildcards \
      'SalamanderGrandPiano-SFZ+FLAC-V3+20200602/readme.txt' \
      'SalamanderGrandPiano-SFZ+FLAC-V3+20200602/samples/*v5.flac' \
      'SalamanderGrandPiano-SFZ+FLAC-V3+20200602/samples/*v9.flac'
    mv "$TMP"/SalamanderGrandPiano-SFZ+FLAC-V3+20200602/samples/*.flac "$SAMPLES/salamander/"
    mv "$TMP"/SalamanderGrandPiano-SFZ+FLAC-V3+20200602/readme.txt "$SAMPLES/salamander/"
  fi
  check "salamander/readme.txt"
  echo "Salamander: ok"
fi
