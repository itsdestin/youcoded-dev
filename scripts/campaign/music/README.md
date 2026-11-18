# Campaign music: "you coded that."

Four cues composed entirely in code (Python + numpy, no samples, no soundfont, no third-party audio,
so there is no licence or attribution to carry). Key D major, 120 BPM, one bar = 2.0 s.

| File | Length | Notes |
|---|---|---|
| hero_60.wav | 60 s | intro bars 1-3, swell bar 4, bass + percussion bar 5, accent hit 12.0, groove 14-32, four stabs 32.0/32.5/33.0/33.5, groove to 38, breakdown 38-46, logo hit 46.0, ring, silence by 59.8 |
| hero_30.wav | 30 s | intro, groove hit 6.0, stabs 14.0-15.5, breakdown 18-22, logo 22.0, silence by 29.8 |
| short_16.wav | 16 s | intro, hit + groove 4.0, logo 12.0, silence by 15.8 |
| short_16_alt.wav | 16 s | same map, different hook (bouncier), different chord order, bass and ep rhythm |

`grid.json` (written next to the WAVs) lists bpm, bar start times and every named hit in seconds.

## Sound
Felt/electric-piano chord pulse (soft FM tines), round sine sub bass with kick sidechain, deep kick,
soft clap + snap, offbeat hats, 16th shaker, glassy plucked hook with a dotted-eighth ping-pong delay,
warm detuned pad for breakdowns and the logo bloom. Chords: Dmaj9, Bm11, Gmaj7(add9), A7sus4(add9)
resolving to a wide open Dmaj9 for the logo. Master: nothing above ~5 kHz, 200-400 Hz kept thin,
stereo removed below 150 Hz, a 60 ms hush before each hit, then ffmpeg gain + `alimiter` iterated until
-14.0 LUFS integrated and true peak <= -1.4 dBTP. 48 kHz, 24-bit stereo.

## Re-render and check
    SCRATCH=/some/tmp/dir python3 compose.py [out_dir]     # default ~/Videos/youcoded-campaign/music
    python3 verify.py [out_dir] [png_dir]                  # loudness, silence, clicks, hit timing, spectrogram PNGs

Needs python3, numpy, ffmpeg. `kit.py` = sounds and filters, `compose.py` = song maps and mastering.
It does not use `scripts/promo/`.
