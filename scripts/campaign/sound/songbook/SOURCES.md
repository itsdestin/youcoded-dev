# Sources and licences: the songbook

The default sound downloads nothing of its own: every recording it uses is read in place,
read-only, from the folders next door (they download them on their first run). Everything
else (the soft sub bass, the soft synth, the held pad, the piano's sympathetic ring and added
upper partials, the hall, room and echo, mixing and mastering) is code in `src/`.

Two OPTIONAL pianos exist only for the owner's A/B against the current one (toolkit-plan b1;
`SONGBOOK_SOUND="piano=vcsl-upright"` or `"piano=salamander"`, same felt processing). They are
fetched by `fetch-samples.sh` into `samples/` (git-ignored) and checked against `samples.sha256`. At load
(`src/engine/sounds.py`, `_piano_pitched` and `_evenness`) the A/B recordings, and only they, are
repaired as data: a recording whose two channels are in opposite polarity gets one turned (7 VCSL
files, 13 Salamander), one that stops while still sounding gets a 20 ms fade (4 VCSL), and each
is levelled flat across the keyboard so the comparison is between pianos, not registers. The
files on disk are untouched.

| What | Where it is read from | Licence | Used for |
|---|---|---|---|
| **Upright Piano KW** (FreePats), the "felt and pulse" piano | `../felt-and-pulse/samples/upright-kw/` (downloaded by `../felt-and-pulse/render.sh`; details in `../felt-and-pulse/SOURCES.md`) | CC0 1.0 | Every piano note: the tune, the answer, every accompaniment pattern |
| **VSCO 2 Community Edition** (Versilian Studios): Violin, Viola and Cello Section pizzicato; Violin and Viola Section sustain | `../felt-and-pulse-playful/samples/vsco/Strings/` (downloaded by `../felt-and-pulse-playful/fetch-strings.sh`; see its `SOURCES.md`) | CC0 1.0 | Plucked strings, held strings, the high "air" line |
| **VSCO 2 Community Edition**: Cello Section sustain, Solo Violin arco | `../playful-round2/chamber/samples/vsco/Strings/` (downloaded by `../playful-round2/chamber/fetch-extra.sh`; see its `SOURCES.md`) | CC0 1.0 | The solo violin taking the tune, the cellos singing it an octave lower, the low held cello |
| **Sound-effects kit** (`marker-stroke-short-c`, `handwriting-a`) | Read in place from `../sfx-kit/out/` (see `../sfx-kit/SOURCES.md` for each recording and its licence) | CC0 1.0 (Freesound: Torikari marker recording) | The film's sound-effects layer only (never the music) |
| `logo/02-piano-only.wav`, `logo/10-full-blend.wav` | Byte-for-byte copies of `../logo-alternatives/out/` (the two logos the owner chose, 2026-11-20) | our own | `out/logo-alone.wav` (a copy of the piano-only logo). Inside pieces the logo is now played live with the same notes and instruments, so these files are not mixed in |

**Optional, A/B only** (downloaded by `fetch-samples.sh`, 2026-11-24):

| What | Source | Licence | Checksum | Used for |
|---|---|---|---|---|
| **VCSL "Upright Piano, Yamaha"** (Versilian Community Sample Library; a remaster of VSCO 2's Upright No. 1): sustains G1-C6, soft layer `vl1` and middle layer `vl2`, round-robin 1 (19 files, 47 MB; there is no `C6_vl1`) | `https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano,%20Yamaha/Sustains/` (pinned commit) | CC0 1.0 (the repo's `LICENSE`, kept as `samples/vcsl-upright/LICENSE`) | SHA-256 per file in `samples.sha256` | `piano=vcsl-upright` only |
| **Salamander Grand Piano V3** (Alexander Holm; Yamaha C5; FreePats SFZ+FLAC build v3+20200602): layers `v5` (soft) and `v9` (loud) of 16, every minor third (60 files, 88 MB kept of a 742 MB archive) | `https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPiano-SFZ+FLAC-V3+20200602.tar.gz` | **CC-BY 3.0: credit required** if it is ever used in a published piece: "Salamander Grand Piano by Alexander Holm (CC BY 3.0)". Licence text in the kept `samples/salamander/readme.txt` | archive SHA-256 `b7760e168494cf095344e217b0af013fc449ad033abbbdf1c65211cf11dc038b` | `piano=salamander` only |

Not used: the plan's optional OpenAIR hall impulse response (its site failed certificate checks
on 2026-11-24, so nothing was fetched; the code-made hall stays). "Piano in 162" and the Iowa
MIS pianos stay unused (licence not stated / unverified).

The recording folders can be pointed elsewhere with the environment variables
`SONGBOOK_PIANO`, `SONGBOOK_STRINGS_A` and `SONGBOOK_STRINGS_B` (see `src/engine/sounds.py`).

Courtesy credits, not required by CC0: "Piano: Upright Piano KW by FreePats (CC0)";
"Strings: VSCO 2 Community Edition by Versilian Studios (CC0)".

Code reused (our own): `src/engine/dsp.py` and `src/engine/master.py` began as copies of
`../felt-and-pulse/src/` (changes since are marked WHY); `src/engine/sounds.py` is assembled from
`../felt-and-pulse/src/instruments.py` (felt piano, sub), `../playful-round2/blend/src/kit.py`
(synth) and `../playful-round2/chamber/src/strings.py` (strings), with changes marked WHY.

Software (tools, not content): numpy, scipy, soundfile (BSD), pyloudnorm (MIT).
No General MIDI or soundfont instrument is used.
