# The sound of youcoded: "the music-box machine"

**The idea.** A tiny, handmade wind-up music box plays a five-second tune, and underneath it a big,
clean modern bass and drum machine turns that little tune into something powerful. Small and
personal on top, surprising strength underneath: your own little app that can do anything.

## The tune and the logo
- **Key:** D, with one cheeky raised note (G sharp) that "lifts" into the top A. That lift is the
  signature: every piece contains it.
- **Motif** (hum it): A D F#, E G# A | F# E D, B C# D. Then the cadence: A D, G#-A, landing on a big D.
- **Logo** = that cadence: a quick wind-up click, three music-box notes, a tiny G#-to-A flick, then
  one 808 drop with a glass-and-saw chord bloom. 2.6 s. Its landing hit is 0.64 s in.
- **Use the logo file as-is, never re-played or re-mixed.** Every piece ends on the same file at the
  same gain (+1 dB over `logo.wav`). Place it so the landing hit falls on a beat or a cut. Fade the
  music out within 0.25 s of the logo starting. Nothing plays over the logo except picture.

## Instruments
- **Allowed, on top (the "box"):** music box, kalimba, small glass bells, clockwork ratchet/ticks.
  At least one of these carries the tune in every piece.
- **Allowed, underneath (the "machine"):** 808 sub kick and 808 bass, crisp 808 hi-hats, a soft
  clap, a warm detuned saw or square lead (big moments only, never alone), a soft saw pad.
- **Banned:** orchestra or soundfont strings/brass, brass bands, disco/funk guitar and four-on-the-
  floor kicks, stock "ukulele and claps" pop, risers/whooshes from sample packs, vocal chops, any
  sample whose licence is not CC0/CC-BY with commercial use.

## Tempo and shape
- **60-95 BPM** for hopeful/narrated films (default 90). **115-125 BPM** for product cuts (default 120).
  Deadpan pieces: a clock tick at 90, no reverb, then the machine switches on.
- Always build: box alone, then box + machine, then the lead sings the motif, then the logo.

## Under a narrator
- While someone speaks: no full motif, only 2-3 note answers in the gaps; pad and kalimba with the
  speech band cut (about -5 dB at 2.4 kHz, -2 dB at 900 Hz); bass and low kalimba carry the motion.
- Measured in `demo-hopeful.wav`: the speech band (300 Hz-3.4 kHz) is 5 dB quieter in the narration
  section than in the musical sections. Keep it that way; the music returns in full only when the
  voice stops.

## What "premium" means here (all checkable with `verify.py`)
- Loudness -14 LUFS integrated (logo alone -16), true peak at or below -1 dBTP, zero clipped samples.
- The limiter barely works: at most 2.1 dB of gain reduction at the worst moment, and more than
  1 dB only about 1% of the time (hopeful; playful and stark under 1 dB throughout). Peak-to-loudness ratio about 12.7 dB (punchy, not squashed).
- Every file starts and ends on an exact zero sample; no clicks found by the click detector.
- Sub energy lives at 40-80 Hz, almost nothing below 40 Hz (-37 dB or less), 80-250 Hz kept lean
  (-12 to -14 dB of the total) so it never booms; real air above 8 kHz (about -22 to -25 dB).
- Mono-safe: summing to mono loses under 1 dB (0.25-0.8 dB measured).
- Every sound is modelled, not sampled; the whole set re-renders bit-for-bit identically.

## How it was built
`bash make.sh` in this folder (about 20 s) creates a Python virtualenv if needed, renders every
file into `out/`, then writes `out/measurements.txt`.
- `dsp.py`: band-limited saw/square oscillators, filters, a synthetic stereo hall (band-split
  decaying noise, so lows ring longer than highs), ping-pong delay, compressor, look-ahead
  true-peak limiter.
- `instruments.py`: each instrument as a physical-style model, e.g. the music box tine uses the
  inharmonic modes of a clamped steel bar (1 : 6.27 : 17.55) plus a pin scrape and wooden box body.
- `compose.py`: the motif, logo, chords and the arrangement of each piece. `render.py`: loudness
  and limiting. `verify.py`: every measurement in this page.

## What is weak (honest)
- **Nobody has listened to it.** Every check is a measurement; taste has not been checked by ear.
- The modelled music box may sound a touch too pure next to a recorded one (no mechanical noise
  between notes, no comb "damper buzz").
- The saw lead and pad are simple; in the "grand" section they could sound plain rather than rich.
- The hopeful film's arc is modest: the opening is only about 2.5 dB quieter than the climax.
- Stereo is on the narrow side (left/right correlation 0.84-0.91 in the demos): safe, not spacious.
- The deadpan half of `demo-stark` is very quiet next to its bright half (that contrast is the
  point, but on a phone the ticks may be hard to hear).
- The key tick is set 8 dB softer than the other interface sounds (on purpose, it repeats) and its
  single peak touches the limiter by 0.5 dB.
