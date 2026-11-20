# The sound of youcoded: "felt and pulse"

## The idea

A soft felt piano is the person: close, warm, a little imperfect, asking for something in three
notes. Clean, quiet electronics are the machine: they repeat the request back in glass and then
make it bigger, without ever taking over.

## The signature

- **Key:** always E-flat major.
- **The cell ("you-co-ded"):** B-flat, up to G, down to F. The person asks.
- **The echo:** the glass pluck plays the same three notes an octave higher. The machine repeats it back.
- **The answer:** B-flat, G, high B-flat, A-flat, then a long G (it lands at home).
- **Chords under it:** E-flat, C minor 7, A-flat major 7, E-flat. Bass moves E-flat, C, A-flat, E-flat.

Every piece uses these exact notes; the code reads them from one list (`MOTIF_A`, `MOTIF_ECHO`, `MOTIF_B` in `src/arrange.py`).

## Instruments

**Allowed (nothing else):** felt piano (the lead, always) · round sub bass (a sine, kept in the
centre) · warm analog-style pad · the pulse (a pad that breathes in eighth notes) · glass pluck
(only for the machine's echo, arpeggios and sparkle) · tight electronic drums: soft kick, snap,
closed hats, shaker · air swells (rising noise into a downbeat) · soft sub bloom (logo only).

**Banned:** orchestra or strings of any kind, brass, choirs, guitars, slap or funk bass, disco or
four-on-the-floor house beats, big trap hi-hat rolls, risers that scream, vocal chops, "stock
ukulele and claps" pop, General MIDI or soundfont instruments, any instrument playing the
melody instead of the piano.

## Tempo

- Narrated, hopeful: **72-84 BPM** (demo: 80).
- Product, playful, cut on the beat: **116-124 BPM** (demo: 120).
- Typography, stark: **120 BPM**, or no beat at all for the deadpan part.

## Under a narrator

- While the voice talks: piano plays only the cell or long chords, the pluck only fills the gaps
  between sentences, no drums until the voice pauses or the film lifts.
- Leave space: the hopeful demo's first 12 seconds are one quiet piano line with gaps between phrases (around 3 s and 5-6 s), about 5 dB under the later lift; that is where the voice goes.
- Mix the music **8-10 dB under the voice** (voice around -16 LUFS short-term, music -24 to -26).
  The hopeful master already carries a gentle 2 dB dip around 2.5 kHz where speech is understood.
- Never put a new piano phrase on top of a key word; move the phrase, not the word.

## The logo (`out/logo.wav`, 2.5 s)

- Always this exact file. Never replay it on another instrument, re-pitch it, speed it up or cut it short.
- Its third note lands **0.5 s after the file starts**: start the file 0.5 s before the name
  appears or the cut lands.
- Give it room: the music fades or stops as it begins (only a reverb tail may ring under its first second). Nothing new plays over it.
- Level: -16 LUFS on its own; inside a -14 LUFS piece, 2 dB louder (as in all three demos).
- It ends itself (the bloom fades to silence by 2.5 s); never fade it out early.

## "Premium", in checkable terms

Every file is measured on each render (`out/checks.txt`, raw numbers in `out/measurements.json`):

1. Loudness on target: -14 LUFS (logo -16) within 0.1 LU; true peak at or below -1 dBTP; zero clipped samples.
2. Starts and ends on silence: first and last sample below -90 dBFS, no DC offset.
3. Survives a phone speaker: folding to mono loses under 1.5 LU; everything below 140 Hz is mono.
4. Healthy low end: the 40-80 Hz band is 3-9 dB below the total (present, not boomy); 80-250 Hz at least 3 dB below (no mud).
5. Real air: 8-16 kHz between 18 and 32 dB below the total.
6. The melody is heard: every motif note is louder than everything else at its own pitch.
7. The logo is identical: inside every demo it matches `logo.wav` (correlation ≥ 0.95, same level).
8. Deliberate silence (a design rule, not in checks.txt): the music thins out or stops as the logo begins; the hopeful demo leaves a full half-second of silence.
9. Real instruments only where an instrument is meant: real piano recording, never a soundfont.

## How it is built

One command re-renders everything and prints the checks:

    scripts/campaign/sound/felt-and-pulse/render.sh

On first run it creates a Python environment in the folder and downloads the CC0 piano
(`SOURCES.md`). Takes about a minute and gives identical files every time. `src/dsp.py` holds the
signal tools (band-limited oscillators, filters, a synthetic stereo reverb, ping-pong delay,
compressor, true-peak limiter). `src/instruments.py` holds the instruments. `src/arrange.py` holds the
notes and the three arrangements. `src/sfx.py` holds the four interface sounds. `src/master.py` holds mastering and
measurement, and `src/build.py` ties it together. `src/plots.py` draws optional spectrogram pictures into `out/plots/`.

## What is weak (honest)

- **Nobody has listened to it.** I can't hear; the balance was set from measurements and stem loudness, not by ear. Expect to adjust levels after a first listen.
- **The piano is a simulated felt piano.** It is a real upright recorded in a living room, softened by filtering. A real felt piano has more mechanical noise and a woollier attack. It has two velocity layers and no repeated-note variation, so the stark demo's 14 identical B-flats are literally the same sample (meant as deadpan, but it may read as mechanical).
- **The synths are clean but simple.** Pads and pluck are good-quality code synths, not a boutique analog synth; they may sound plain next to commercial libraries.
- **The snap and the marker stroke** are the least convincing sounds. The marker is filtered noise with a grain; it may read as "shh" rather than "pen".
- **The logo is quicker than the hopeful piece** (eighth notes at 120 BPM after an 80 BPM film). The breath before it makes this deliberate, but it is a small gear change.
- **Playful is busy:** its weakest motif note is only 2.6 dB above the rest.
