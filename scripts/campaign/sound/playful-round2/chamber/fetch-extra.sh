#!/usr/bin/env bash
# Download the two extra CC0 string sets this folder needs (VSCO 2 Community Edition:
# Cello Section sustain and Solo Violin arco) listed in strings-extra.txt into samples/vsco/.
# Skips files already present. The other strings are read in place from
# ../../felt-and-pulse-playful/samples (see SOURCES.md).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master"
mkdir -p "$DIR/samples/vsco"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  dest="$DIR/samples/vsco/$f"
  [ -s "$dest" ] && continue
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$f"
done < "$DIR/strings-extra.txt" | xargs -P 8 -I{} sh -c 'curl -sfL --retry 3 -o "$0/samples/vsco/{}" "$1/$(printf %s "{}" | sed "s/ /%20/g; s/#/%23/g")"' "$DIR" "$BASE"
echo "extra strings: $(find "$DIR/samples/vsco" -name '*.wav' | wc -l) files"
