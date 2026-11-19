#!/usr/bin/env bash
# Re-downloads the soundfont used for the felt-piano voice.
# Source: https://github.com/mrbumpy409/GeneralUser-GS  (GeneralUser GS v2.0.3)
# Licence: free for private AND commercial music; no attribution required (see assets/GeneralUser-GS-LICENSE.txt).
# The file is treated as untrusted data: it is only ever read by fluidsynth, never executed.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p assets
BASE=https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main
curl -fsSL "$BASE/GeneralUser-GS.sf2" -o assets/GeneralUser-GS.sf2
curl -fsSL "$BASE/documentation/LICENSE.txt" -o assets/GeneralUser-GS-LICENSE.txt
echo "9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe  assets/GeneralUser-GS.sf2" | sha256sum -c - || echo "WARNING: checksum differs from the version this was tuned with"
