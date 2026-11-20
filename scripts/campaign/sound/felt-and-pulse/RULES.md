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

**Films** (first real use, 2026-11-20): `films/render.sh` re-renders the three film scores into
`out/films/` (measurements in `out/films/report.json`) and copies the mixes to
`scripts/campaign/film/public/audio/fp-take{1,2,3}-mix.wav`. Narration is levelled phrase by phrase
(`films/fairytale.py`), typing span by span (`films/make_it_mine.py`, whose hit table is at the top).

## What is weak (honest)

- **Nobody has listened to it.** I can't hear; the balance was set from measurements and stem loudness, not by ear. Expect to adjust levels after a first listen.
- **The piano is a simulated felt piano.** It is a real upright recorded in a living room, softened by filtering. A real felt piano has more mechanical noise and a woollier attack. It has two velocity layers and no repeated-note variation, so the stark demo's 14 identical B-flats are literally the same sample (meant as deadpan, but it may read as mechanical).
- **The synths are clean but simple.** Pads and pluck are good-quality code synths, not a boutique analog synth; they may sound plain next to commercial libraries.
- **The snap and the marker stroke** are the least convincing sounds. The marker is filtered noise with a grain; it may read as "shh" rather than "pen".
- **The logo is quicker than the hopeful piece** (eighth notes at 120 BPM after an 80 BPM film). The breath before it makes this deliberate, but it is a small gear change.
- **Playful is busy:** its weakest motif note is only 2.6 dB above the rest.

## The owner's rulings (Destin, 2026-11-20). These override anything above.

After hearing sixteen versions of the playful piece:

- **No clapping or clacking sounds, ever**: no snare, snap, clap, rimshot, woodblock, tick-tock or
  any dry "clack" used as a beat. His words: "i definitely just hate whatever the
  clapping/clacking sounds are (snare drum? etc)".
- **No kick drum and no drum kit.** He said no to every version with a beat made of drum sounds
  (kick, soft thump, deep bass note, clockwork, half-time) and yes to "no drums at all".
- **Energy comes from instruments playing together**, not from drums: the piano, a second piano,
  plucked strings, long string swells, and (lightly) a warm synth pattern. He said yes to "two
  pianos", "strings, plucked", "strings, long swells"; maybe to a synth arp and to the piano
  playing its own rhythm. So strings ARE allowed (real recorded ones, plucked or long; not short
  bouncing bowed notes, which he rejected).
- **Never a fake-out or a "thwip"**: no moment where the music stops dead and a little flourish,
  zip, quick run, sweep or whoosh answers it, and no such sound as a transition anywhere. His
  words: "i HATEEE the weird little thwip noise/fakeout thing at 13s and 17s. we should never use
  that anywhere. it sounds like a 2005 browser demo switching pages."
- **Tunes should be more interesting** than a three-note figure repeated: he asked for variants
  that "better blend the various instruments and offer slightly more interesting tunes". The
  three-note signature and the logo stay; melodies develop from them.

After hearing the sound score three films ("the dna is there, arrangement is off"):

- **One piece of music per film, not a string of reactions to the picture.** On the Make it mine
  score: "this is just like completely all over the place. this sounds like a different song every
  4-6 seconds. we cant *just* have notes, we need consistent tunes/strings/chords/etc." A film's
  music is one song: one tune, one set of chords, one steady accompaniment that keeps going, in
  clear sections. The picture is followed by how the arrangement grows at a few section changes,
  never by a new sound for each thing that happens on screen.
- **No scattered high jingles.** On the fairytale score: "lots of random high pitched jingles thrown
  throughout (37s, 50s, lots more)". The glassy high plucks used as accents and echoes are out as
  decoration; a high part may exist only as a continuous, sensible line in the arrangement.
- **Volume must not bounce.** "the volume feels like it bounces up and down (11s-15s stretch
  highlights this)". Under a narrator the music holds a steady level through a passage and changes
  level only at section changes, slowly; no fast dipping and rising around each phrase.
- **Building blocks.** "we need better rules and building blocks": the brand needs a small songbook
  (one main tune with its chords, a few accompaniment patterns, a lift, an ending with the logo)
  that every piece is assembled from, so all our music is recognisably the same song family.
- **The sound logo is not final.** "may still want to somewhat refine sound logo or see an array of
  alternatives as we add strings or whatever".

Clarified the same day (Destin: "i do still want sound design that matches what happens in the
films, but the music needs to feel consistent across all of our marketing materials/videos/etc"):

- **Two layers, kept apart.** The MUSIC is the song from the songbook: it stays the same song for
  the whole piece and is the same family across every film, advert and clip. The SOUND DESIGN is
  a separate layer of small real-world sounds that match what happens on screen (typing, a pen
  stroke, something appearing, something changing). Sound design is wanted.
- **Sound design never becomes music.** An on-screen event gets a sound effect, not a new tune,
  chord or melodic jingle. The song underneath carries on unchanged; at most it grows at a
  section change that the film's big moments are timed to.
- **One small kit of sound effects for the whole brand**, reused everywhere, so the effects are as
  consistent as the music. Nothing in it may be a thwip, zip, sweep or whoosh, or a clap or clack.

Clarified again (Destin: "we should also be able to go more like upbeat/downbeat depending on what
happens on screen maybe? like this should match industry best practices in sound design for this
kind of thing"). This replaces "the song carries on unchanged":

- **The music follows the story's feeling, the way film and advert scores normally do.** The same
  tune can turn darker, sparser and slower-feeling for a problem, and brighter, fuller and more
  upbeat for a hopeful turn or a payoff. What must not change is the identity: it is always the
  songbook's tune, chords and instruments, re-dressed (the standard practice of one theme with
  variations), never a different piece of music.
- **Mood changes happen at story beats, a few per film.** Before scoring, the film is "spotted":
  the handful of moments where the feeling genuinely turns are chosen, and the music changes
  there, through a musical transition (a held chord, a breath, a build in the playing), never a
  jolt and never a whoosh.
- **Music answers feelings; sound effects answer actions.** The music does not imitate each thing
  that happens on screen (scoring every action is known as "mickey-mousing" and is avoided outside
  slapstick). Individual actions belong to the sound-effects layer.
- **The voice always wins.** Under a narrator the music stays out of the way of speech and its
  level is set by hand section by section, not by an automatic dip on every word.
