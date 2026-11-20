# Sources and licences: chamber versions

Everything not listed here (the soft sub bass, the reverbs, mastering) is code in `src/`.

| What | Where it came from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW** (FreePats), the chosen "felt and pulse" piano | Read in place from `../../felt-and-pulse/samples/` (see `../../felt-and-pulse/SOURCES.md`) | CC0 1.0 | Every piano note |
| **VSCO 2 Community Edition** (Versilian Studios): Violin, Viola and Cello Section pizzicato; Violin and Viola Section sustain | Read in place from `../../felt-and-pulse-playful/samples/` (downloaded by that folder; see its `SOURCES.md`) | CC0 1.0 | Plucked strings, bowed chords |
| **VSCO 2 Community Edition**: Cello Section sustain (`Strings/Cello Section/susvib`, 27 files) and Solo Violin bowed (`Strings/Solo Violin/Arco Vib`, 30 files) | https://github.com/sgossner/VSCO-2-CE, fetched from `raw.githubusercontent.com/sgossner/VSCO-2-CE/master/...` on 2026-11-20 by `fetch-extra.sh`; exact list in `strings-extra.txt` | CC0 1.0 (same repository and licence as above) | chamber-2: the solo violin and the cellos singing the tune, the cellos' doubling |
| `logo.wav` | `../../felt-and-pulse/out/logo.wav`, pasted unchanged | (our own) | The ending of both files |

Courtesy credit, not required: "Strings: VSCO 2 Community Edition by Versilian Studios (CC0)".

Samples are not stored in the repository (`samples/` is git-ignored); `render.sh` downloads the
extra ones on first run (about 140 MB). Six section-pizzicato takes are skipped on purpose
(`EXCLUDE` in `src/strings.py`): in each, one player plucks 100-190 ms after the rest.
