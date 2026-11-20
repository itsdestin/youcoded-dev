# The sound of youcoded: "Open air"

**The idea.** A door swinging open onto a wide, bright morning: four rising notes
(A-D-E-A, "da-da-da-daaa") that bloom into a big, soft chord with a glass bell on top. It never
lands on the "home" note; it ends on an open, still-rising note, because what you make with
youcoded is never finished: it is yours now, and it keeps going.

## The pieces
- **Motif** (hum it): A D E A (long) … F# E D E (long). Key of D major. Every piece uses these exact notes.
- **Logo** (2.5 s, `out/logo.wav`): the first four notes, quick, then the bloom. Used
  untouched, sample for sample, at the end of every film. Never re-played, re-pitched or
  re-mixed. Starts the frame the name appears. Nothing else plays over it except the dying
  echo of the music before it.

## Instruments
**Allowed:** the glass bell (the signature: the mascot's glass face as a sound), wide
detuned-synth pads, short bright plucks playing shimmering arpeggios, one singing lead
(a vowel-like "ah" synth), a clean round sub-bass, deep soft kicks, layered claps,
crisp synthetic hi-hats, rising "breaths" of air, a big hall reverb and echoes timed to the beat.
**Banned:** fake orchestras, toy brass, slap bass and disco/funk guitar, stock "ukulele and
whistling" pop, vocal chops, dubstep wobbles, distorted or aggressive sounds, anything that
sounds like a General MIDI keyboard. A real piano is allowed only for intimate, quiet pieces,
playing the motif.

## Tempo and shape
- Hopeful/narrated: 80-92 BPM. Playful/product: 116-124 BPM. Typography/stark: 96-104 BPM.
- Drums arrive late (never in the first third of a narrated piece). The drop is a "door
  opening": a rising breath of air, then kick + cymbal + the chord opening up together.
- **Under a narrator:** no lead melody while someone speaks; pad filtered dark; arpeggio quiet.
  In `demo-hopeful` the narrated part (0-16.5 s) is 3-10 dB quieter in short-term loudness and
  has 3 dB less energy in the voice band (1-4 kHz) than the payoff.

## What "premium" means here (checkable)
1. -14 LUFS for films, -16 for the logo; true peak at or below -1 dBTP; zero clipped samples.
2. First and last sample exactly zero; no clicks.
3. Nothing below 40 Hz; sub (40-80 Hz) present but not swamping (-4 to -8 dB share of energy);
   lean 80-250 Hz (no boom, no mud); real air above 8 kHz (no worse than -20 dB share).
4. Wide, but loses no more than ~1.2 dB when played on one speaker (mono).
5. Every note band-limited (no aliasing whistle), every tail shaped to silence, reverb rich and
   dense (no metallic ringing). Same tempo-locked echo on every film.

## How it was built (to reproduce)
All synthesis is code in this folder; no samples. `./build.sh` (makes `.venv` from
`requirements.txt` if needed) runs `render.py` (writes `out/`) then `verify.py` (writes
`out/measurements.txt`). `dsp.py` = oscillators, filters, reverb, delay, chorus, compressor,
true-peak limiter; `inst.py` = instruments; `score.py` = motif, logo, the three demos, interface
sounds and mastering. Logo identity: each demo is mastered first, then `logo.wav` is added on top
unchanged.

## What is weak (honest)
- Nobody has listened. Everything is measured, not heard: the lead's "sung" vowel and the pad's
  brightness are the likeliest to sound synthetic or harsh. Tune by ear before anything ships.
- The deadpan half of `demo-stark` is plain sine "beeps" by design; it may read as a test tone
  rather than as wit.
- The logo has a gap at 4-8 kHz (glass partials skip it), so its sparkle is airy rather than crisp.
- Sub energy peaks near 50 Hz from the kick; on large speakers it may still feel heavy.
- `motif.wav` is darker than the rule above (air -22 dB share): it is the intimate version.
- Interface sounds are set to -6 dB true peak, not LUFS (too short to measure in LUFS).
