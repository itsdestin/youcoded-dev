# Sources

**No outside audio was used.** Every sound in `out/` is made by the Python code in this folder
(`dsp.py`, `instruments.py`, `compose.py`): the music box, kalimba, glass bells, clockwork
ratchet, 808 kick and bass, hi-hats, clap, saw/square lead, pad, reverb and the marker-pen sound
are all modelled from maths (sine modes, band-limited oscillators, filtered noise). No samples, no
soundfonts, no impulse responses were downloaded.

Software used to run the code (not part of the sound, nothing redistributed):

| Package | Version | Licence | Used for |
|---|---|---|---|
| numpy | 2.5.5 | BSD-3-Clause | arrays and maths |
| scipy | 1.18.1 | BSD-3-Clause | filters, convolution, resampling |
| soundfile | 0.14.0 | BSD-3-Clause (libsndfile: LGPL-2.1) | writing WAV files |
| pyloudnorm | 0.2.0 | MIT | measuring loudness (ITU-R BS.1770 / EBU R128) |
| matplotlib | (checking only) | PSF-style | drawing spectrograms while checking; not needed to render |

So the whole sound is ours to use commercially with no credit owed to anyone.
