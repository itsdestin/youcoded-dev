# Sources and licences: the songbook

No new recordings were downloaded for the songbook. Every recording is read in place,
read-only, from the folders next door (they download them on their first run). Everything
else (the soft sub bass, the soft synth, the piano's added upper partials, the hall and room,
mixing and mastering) is code in `src/`.

| What | Where it is read from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW** (FreePats), the "felt and pulse" piano | `../felt-and-pulse/samples/upright-kw/` (downloaded by `../felt-and-pulse/render.sh`; details in `../felt-and-pulse/SOURCES.md`) | CC0 1.0 | Every piano note: the tune, the answer, every accompaniment pattern |
| **VSCO 2 Community Edition** (Versilian Studios): Violin, Viola and Cello Section pizzicato; Violin and Viola Section sustain | `../felt-and-pulse-playful/samples/vsco/Strings/` (downloaded by `../felt-and-pulse-playful/fetch-strings.sh`; see its `SOURCES.md`) | CC0 1.0 | Plucked strings, held strings, the high "air" line |
| **VSCO 2 Community Edition**: Cello Section sustain, Solo Violin arco | `../playful-round2/chamber/samples/vsco/Strings/` (downloaded by `../playful-round2/chamber/fetch-extra.sh`; see its `SOURCES.md`) | CC0 1.0 | The solo violin taking the tune, the cellos singing it an octave lower, the low held cello |
| `logo/02-piano-only.wav`, `logo/10-full-blend.wav` | Byte-for-byte copies of `../logo-alternatives/out/` (the two logos the owner chose, 2026-11-20) | our own | The endings; `out/logo-alone.wav` is a copy of the piano-only logo |

The recording folders can be pointed elsewhere with the environment variables
`SONGBOOK_PIANO`, `SONGBOOK_STRINGS_A` and `SONGBOOK_STRINGS_B` (see `src/engine/sounds.py`).

Courtesy credits, not required by CC0: "Piano: Upright Piano KW by FreePats (CC0)";
"Strings: VSCO 2 Community Edition by Versilian Studios (CC0)".

Code reused (our own): `src/engine/dsp.py` and `src/engine/master.py` are unchanged copies of
`../felt-and-pulse/src/`; `src/engine/sounds.py` is assembled from
`../felt-and-pulse/src/instruments.py` (felt piano, sub), `../playful-round2/blend/src/kit.py`
(synth) and `../playful-round2/chamber/src/strings.py` (strings), with changes marked WHY.

Software (tools, not content): numpy, scipy, soundfile (BSD), pyloudnorm (MIT).
No General MIDI or soundfont instrument is used.
