# Campaign music (youcoded underscore)

One generator, six cuts. Key C major, 100 BPM, 4/4 (beat 0.6 s, bar 2.4 s), 48 kHz / 24-bit stereo, -14 LUFS, true peak <= -1 dBTP.
Progression (one chord per bar): Cadd9 - Gadd9 - Am7 - Fadd9. Dark sections: Am7 - Fsus2 - Am7 - Gsus4.

## Render
```
bash fetch-assets.sh                         # soundfont (once)
python3 -m venv .venv && .venv/bin/pip install scipy soundfile pyloudnorm matplotlib   # once
.venv/bin/python song.py                     # all six cuts -> out/<name>.wav + .map.json
.venv/bin/python song.py hero60 short15b     # or just some
.venv/bin/python verify.py                   # loudness, peak, length, clicks, spectrum, stereo, onsets (+ spectrogram PNGs)
.venv/bin/python -c "import song;[song.harmony_table(n) for n in song.FORMS]"   # chord/voicing table + minor-2nd check
```
New cut: add a line to `FORMS` in `song.py` (`name: (length_s, [(kind, bars), ...])`; the `end` section is added automatically
and runs to the length). Kinds: rent, breath, ask, bloom, pulse, peak, stance.

## Sound effects over the music
```
.venv/bin/python mix.py --music out/hero60.wav --cues example-cues.json --out out/final.wav [--sfx-db -20]
```
`cues.json`: `{"t": s, "type": "key|send|bloom|whoosh|pop|toggle", "gain": dB?}` or `{"t0":s,"t1":s,"type":"typing","cps":9}`.
Output is re-normalised to -14 LUFS / -1 dBTP, exact music length, deterministic (seed = hash of the cues file).

## Soundfont licence
GeneralUser GS v2.0.3, https://github.com/mrbumpy409/GeneralUser-GS (`assets/GeneralUser-GS-LICENSE.txt`): free for private and
commercial music, no attribution required. The author notes some samples were sourced from freely-available banks and cannot
guarantee provenance of every one (none from commercial packages). `assets/` is git-ignored; re-fetch with `fetch-assets.sh`.
