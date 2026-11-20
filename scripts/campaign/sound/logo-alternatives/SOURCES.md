# Sources and licences: sound logo alternatives

No new recordings were downloaded. Both instruments are read in place, read-only, from the
folders that already hold them.

| What | Where it is read from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW** (FreePats), the same recording the chosen "felt and pulse" logo uses | `../felt-and-pulse/samples/upright-kw/` (details in `../felt-and-pulse/SOURCES.md`) | CC0 1.0 | Every piano note, including the "second piano" (same recording, darker and panned) |
| **VSCO 2 Community Edition**, Versilian Studios: Violin Section (pizzicato, sustain with vibrato), Viola Section (pizzicato, sustain with vibrato), Cello Section (pizzicato) | `../felt-and-pulse-playful/samples/vsco/Strings/` (downloaded there from https://github.com/sgossner/VSCO-2-CE; details in `../felt-and-pulse-playful/SOURCES.md`) | CC0 1.0 | Plucked strings (versions 05, 07, 08, 10), bowed swells and the bowed answer (06, 07, 09, 10, 11) |

Everything else (the round sub under the landing, the analog pad in 03-05, reverb) is
synthesised by the code in `src/`, copied from `../felt-and-pulse/src/`.

Courtesy credits, not required by CC0: "Piano: Upright Piano KW by FreePats (CC0)";
"Strings: VSCO 2 Community Edition by Versilian Studios (CC0)".

Software (tools, not content): numpy, scipy, soundfile (BSD), pyloudnorm (MIT), from
`../felt-and-pulse/.venv`.
