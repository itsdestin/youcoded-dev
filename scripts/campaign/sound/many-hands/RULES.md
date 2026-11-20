# The sound of youcoded: "Many hands"

## The idea

One person plays a little tune, and more and more people answer it with their hands and voices
until it's a room full of people. It sounds made by people, together: a warm, slightly cheeky
alternative to the glossy music big tech uses.

**The tune (key of D):** A D E F♯ … *clap clap* / A D E B A … *clap clap*.
The two claps answering the tune are the signature. Whatever else changes, keep the tune and the
answering claps.

## Instruments

**Allowed**
- Plucked strings (harp played short, like a nylon guitar) for the tune
- Marimba: the "second player" who joins in on the tune
- Hands: claps (from one person up to a crowd of 14), finger snaps, foot stomps, hand drum,
  conga, bongos, shaker
- Wordless voices: humming ("mmm") that opens into "ooh" and "ah". Never words.
- Underneath: a clean sine sub-bass, a soft filtered synth bass, and a tuned 808-style kick in the
  upbeat pieces. This is what keeps it modern rather than folky.

**Banned**
- Whistling, ukulele strumming and "happy clap" stock loops (the advert cliché)
- Orchestras, brass, cymbal crashes, timpani rolls, "epic" drums (pompous)
- Disco or funk guitar, slap bass, bouncy stock pop
- Robot/vocoder voices, risers, dubstep wobbles, anything that sounds like a phone ringtone
- Sung words of any kind

## Tempo

| Use | Speed (beats per minute) |
|---|---|
| Calm, narrated films | 88-100 (the hopeful demo is 96) |
| Upbeat product films cut on the beat | 116-124 (the playful demo is 120) |
| Typography / deadpan | 120, but sparse: a note every beat or less |
| The logo | always the same audio; its own internal speed is 120 |

## Under a narrator

- Start small: one plucked tune and one hummer. Add people as the story builds, never all at once.
  The hopeful demo grows from about -21 to -10 LUFS short-term over 25 seconds.
- Voices stay low and wordless ("mmm", "ooh") while someone is speaking; open to "ah" only in the
  gaps.
- The music has a built-in dip around 1.2 kHz and 2.8 kHz (where speech is understood), so a
  narrator sits on top without fighting it. Apply the same dip (`pocket=True`) to anything new.
- No sung voices hold notes in the narrator's pitch range during a line of speech.

## The logo

- "da-da-da-DAAA (clap clap)": the first notes of the tune squeezed into one breath, a warm chord
  of voices, a stomp, and the whole crowd's double clap. 2.9 seconds, ends in silence.
- Use the file `out/logo.wav` exactly. Never re-record, re-pitch, speed up or shorten it.
  Only its volume may change.
- In a film it arrives when the youcoded name appears, after the music has cleared (the music
  fades out in 0.8 s as the logo starts). It is level-matched to the music just before it.
- It may be used alone (end cards, app start, social posts). Never more than once in a piece.

## What makes it premium (checkable)

Run `./render.sh`; it writes `out/measurements.txt`. Each finished piece must show:

| Check | Target | Current files |
|---|---|---|
| Loudness | -14 LUFS (logo -16) | all on target ±0.05 |
| True peak | at or below -1 dBTP | -1.16 to -1.43 |
| Clipping | 0 clipped samples | 0 |
| Clean edges | file starts and ends on silence | first/last samples 0 in every file |
| Mono-safe | under 1 dB lost when summed to mono | 0.4-0.6 dB |
| Low end | 40-80 Hz share between -5 and -11 dB of the total | -5.2 to -10.5 (demos and logo; the motif alone has no bass on purpose) |
| Air | 8-16 kHz share above -20 dB | -16.2 to -19.4 |
| Human | no two hits identical; every hand has its own timing habit | built in (see below) |
| Motif | the tune's notes are found in every piece | tracker finds both halves in all three demos |
| Logo identity | same audio wherever it plays | 0-sample offset, 0.97-0.999 correlation |
| Dynamics | peak-to-loudness ratio about 12-13 dB (not squashed) | yes |

## How it is built (to reproduce)

`scripts/campaign/sound/many-hands/render.sh` does everything: makes a Python environment in
`.venv/`, downloads the CC0 samples listed in `SOURCES.md` into `samples/`, renders every file into
`out/`, then measures them. Renders are bit-identical every time.

- `src/fetch.py`: the sample list.
- `src/dsp.py`: filters, a synthetic hall and room reverb, a tape-style delay, compressor,
  oversampled saturation and a true-peak look-ahead limiter; loudness by ITU-R BS.1770
  (pyloudnorm). Samples use one microphone channel, because several library recordings partly
  cancel when summed to mono; all width comes from panning and reverb.
- `src/instruments.py`: harp and marimba (tuned to correct the library's ~10-cent flat tuning),
  synthesised claps (each "person" has their own hand sound, place, loudness and lateness, and every
  clap is different), synthesised voices (each voice has its own pitch drift, scoop and vibrato,
  shaped by real vowel resonances), sub-bass and kick built so they cannot alias.
- `src/compose.py`: the tune, the logo and the three demos written out note by note.
- `src/sfx.py`: the four interface sounds. `src/measure.py`: the checks above.

## What is weak

- **Nobody has listened.** Everything here was checked by measurement only. The ear test is
  still to do.
- **The voices are synthesised.** They are the most likely part to sound artificial (a bit
  "organ-like"), especially the exposed hum in the first five seconds of the hopeful demo. Real
  recorded group humming would be the biggest upgrade.
- **The claps are synthesised.** Built as many slightly different people, but a real recorded
  crowd would be more convincing.
- **There is no real nylon guitar.** The harp, played short, stands in. Only one dynamic level of
  harp and marimba was available, so soft notes are made by darkening loud ones.
- **The logo's tune is quicker than the hopeful film's tempo** (120 against 96). That is
  intentional (the logo never changes) but the gear change may be noticeable.
- **The stark demo's logo has more music under it** (13 dB below the logo, against 21-23 dB in the
  others) because the bright section is still ringing when the logo arrives.
- The interface sounds are too short for a LUFS reading, so they are set to -3 dB true peak.
