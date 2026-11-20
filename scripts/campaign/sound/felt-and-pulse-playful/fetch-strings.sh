#!/usr/bin/env bash
# Download the CC0 string samples (Versilian Studios VSCO 2 Community Edition) listed in
# strings-files.txt into samples/vsco/. Skips files already present. See SOURCES.md.
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
done < "$DIR/strings-files.txt" | xargs -P 8 -I{} sh -c 'curl -sfL --retry 3 -o "$0/samples/vsco/{}" "$1/$(printf %s "{}" | sed "s/ /%20/g; s/#/%23/g")"' "$DIR" "$BASE"
echo "strings: $(find "$DIR/samples/vsco" -name '*.wav' | wc -l) files"
