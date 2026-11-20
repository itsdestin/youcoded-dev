#!/usr/bin/env bash
# WHY: Kenney.nl serves its CC0 packs through a short-lived signed link (the page's own
# "Continue without donating" button does this same request), so we ask for a fresh link
# per pack and unzip each pack into its own folder under samples/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
UA="Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0"
JAR="$HERE/samples/.cookies"
for pack in "$@"; do
  dest="$HERE/samples/$pack"
  [ -d "$dest" ] && continue
  id=$(printf 'assets/%s' "$pack" | xxd -p | tr -d '\n')
  curl -s -A "$UA" -c "$JAR" -b "$JAR" -o /dev/null "https://kenney.nl/assets/$pack"
  url=$(curl -s -A "$UA" -c "$JAR" -b "$JAR" -e "https://kenney.nl/assets/$pack" "https://kenney.nl/download-link/$id" | sed -E 's/.*"url":"([^"]+)".*/\1/; s#\\/#/#g')
  mkdir -p "$HERE/samples/dl"
  curl -sL -A "$UA" -b "$JAR" -o "$HERE/samples/dl/$pack.zip" "$url"
  mkdir -p "$dest" && (cd "$dest" && unzip -q -o "$HERE/samples/dl/$pack.zip")
  echo "fetched $pack"
done
