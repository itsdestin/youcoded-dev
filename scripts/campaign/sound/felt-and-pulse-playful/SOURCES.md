# Sources and licences: playful-backing experiments

Everything not listed here (thumps, brushes, ticks, woodblocks, 808-style sub, synth arpeggio,
synth bass, the piano-case knock, all reverbs) is synthesised by the code in `src/`.

| What | Where it came from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW** (FreePats), the same recording the chosen "felt and pulse" sound uses | Read in place from `../felt-and-pulse/samples/` (downloaded by that folder's `render.sh`; details in `../felt-and-pulse/SOURCES.md`) | CC0 1.0 | Every piano sound, including the second piano and the muted "piano as a drum" notes |
| **VSCO 2 Community Edition**, Versilian Studios (Sam Gossner): Violin Section (spiccato, pizzicato, sustain with vibrato), Viola Section (spiccato, pizzicato, sustain), Cello Section (spiccato, pizzicato) | https://github.com/sgossner/VSCO-2-CE, files fetched from `raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/...` on 2026-11-20. Exact list: `strings-files.txt`; downloader: `fetch-strings.sh` | CC0 1.0 Universal (the repository's `LICENSE` file, checked 2026-11-20). Commercial use allowed, no attribution required | Versions 11, 12 and 13 (all string sounds) |

Courtesy credit, not required: "Strings: VSCO 2 Community Edition by Versilian Studios (CC0)".

The samples are not stored in the repository (`samples/` is git-ignored); `render.sh` downloads
them on first run (about 190 MB). VSCO names its notes one octave below concert pitch; the
code corrects this (`OCTAVE_FIX` in `src/kit.py`), checked by measuring the recordings' pitch.

No General MIDI or soundfont instruments are used.
