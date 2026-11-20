# Sources and licences: "felt and pulse"

Only one outside recording is used. Everything else (sub bass, pads, pulse, glass pluck, drums,
air swells, reverb, all four interface sounds) is synthesised by the code in `src/`.

| What | Where it came from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW**, version 2022-02-21 (SFZ + FLAC, 2 velocity layers, stereo, 44.1 kHz / 24-bit). A Kawai upright in a living room, recorded January 2017 by Gonzalo and Roberto (FreePats project) with a Zoom H1 at the player's head position. | Page: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW. File: https://freepats.zenvoid.org/Piano/UprightPianoKW/UprightPianoKW-SFZ+FLAC-20220221.7z (downloaded 2026-11-20) | **CC0 1.0 public domain dedication** (stated on the page, in the pack's `readme.txt` and `cc0.txt`). Commercial use allowed, no attribution required. | Every piano note. The "felt" character is our processing (soft-velocity filtering, rounded attack, low felt thump), not a different recording. |

A credit is not required by CC0, but a courtesy line is fine: "Piano: Upright Piano KW by FreePats (CC0)".

The samples are not stored in the repository. `render.sh` downloads and unpacks them into
`samples/` on first run (that folder and the Python environment are git-ignored).

## Software (tools, not content)

numpy and scipy (BSD), soundfile (BSD), pyloudnorm (MIT) for loudness to ITU-R BS.1770,
matplotlib (only for the optional pictures in `out/plots/`). None of them ships in the audio.

## Considered and not used

Salamander Grand Piano (CC-BY 3.0): excellent, but a concert grand is the wrong voice for an
intimate, close, slightly homely piano, and it is 700 MB. Nothing with a non-commercial or unclear
licence was downloaded.
