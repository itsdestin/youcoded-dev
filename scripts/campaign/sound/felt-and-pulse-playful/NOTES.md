# Playful demo: what's behind the piano

16 versions of the same 20-second playful demo, all in `out/`. Each has the same tempo (120 BPM),
piano tune, chords and length, and the same logo at the end. Only what plays behind the piano
changes. Every file is -14 LUFS, peaks at or below -1 dB, has no clipping and starts and ends in
silence (`out/checks.txt`).

Re-render everything (about 30 seconds; downloads the string samples on first run):

    scripts/campaign/sound/felt-and-pulse-playful/render.sh

## How to listen

Listen to **0, then 1, 2 and 3**, to find the sound you don't like. Then go through the groups below.

## Finding the sound you don't like (diagnostic versions)

- **0-original**: the current playful demo, unchanged.
- **1-no-kick**: the same with only the kick drum (the low "boom") removed. If this fixes it, the kick was the problem.
- **2-no-drums**: every drum removed: no kick, no snaps, no hi-hats. Only piano, bass, the breathing pad and the glass notes are left.
- **3-no-pulse**: drums kept, but the background stops "breathing" in time with the beat (the sucking, pumping movement is gone).

## Softer drums

- **4-soft-thump**: the kick becomes a soft, round felt thump, like a hand on a piano lid, in the same rhythm; quiet brushes and a shaker.
- **5-piano-is-the-drum**: no drums. The piano plays the rhythm: muted low notes and a knock on its wooden case as the kick, key clicks and tiny stopped high notes as the hi-hat.
- **6-deep-sub**: no kick. A long, deep, soft bass note starts each bar, with tiny crisp ticks and quiet snaps on top. Spacious and modern.
- **7-clockwork**: dry woodblock tocks and ticks plus the app's typing click running fast, like clockwork. No low drum.
- **8-half-time**: same speed, half the hits. A deep soft thump once a bar and one soft snap in a big room. Relaxed and confident.

## Synths

- **9-synth-arp**: a warm, bubbling synth pattern drives it, starting dark and getting brighter over the piece; deep bass under it; only the softest thump.
- **10-synth-bass-drive**: a bouncing, slightly gritty synth bass line is the engine; tiny ticks on the off-beats.

## Strings (real orchestra recordings)

- **11-strings-staccato**: short, bouncing violin, viola and cello notes give the pulse, like energetic chamber strings. No drums.
- **12-strings-pizzicato**: plucked strings: cellos on the bass notes, violas on the off-beats, violins answering the tune. Light and witty. No drums.
- **13-strings-swell**: no rhythm at all. Long violin and viola notes swell and lift under the piano. Momentum comes from the chords and the volume growing, not from a beat.

## Pianos

- **14-two-pianos**: a second, muted piano plays a low repeating pattern and short chords. No drums.
- **15-piano-and-synth-hybrid**: the second piano's pattern, a lighter synth pattern that brightens over the piece, and a soft thump twice a bar.

## Measurements that matter

| Version | Low-end jumpiness (dB) | Attacks per second | Tune's weakest note above the rest (dB) |
|---|---|---|---|
| 0-original | 7.2 | 6.1 | 2.6 |
| 1-no-kick | 4.9 | 6.1 | 2.6 |
| 2-no-drums | 4.0 | 0.4 | 14.0 |
| 3-no-pulse | 7.6 | 6.1 | 2.6 |
| 4-soft-thump | 5.8 | 3.7 | 8.9 |
| 5-piano-is-the-drum | 4.0 | 6.4 | 14.1 |
| 6-deep-sub | 3.0 | 6.3 | 7.4 |
| 7-clockwork | 3.7 | 6.6 | 14.1 |
| 8-half-time | 2.8 | 2.4 | 6.4 |
| 9-synth-arp | 2.5 | 5.1 | 9.9 |
| 10-synth-bass-drive | 3.8 | 1.9 | 14.1 |
| 11-strings-staccato | 2.4 | 1.0 | 5.7 |
| 12-strings-pizzicato | 3.1 | 1.9 | 14.1 |
| 13-strings-swell | 1.7 | 0.3 | 8.5 |
| 14-two-pianos | 2.3 | 0.5 | 12.9 |
| 15-piano-and-synth-hybrid | 3.2 | 3.1 | 13.5 |

- **Low-end jumpiness** is how much the bass region (40-150 Hz) jumps up and down. A thumping kick reads high.
- **Attacks per second** counts sharp hits above 1 kHz (snaps, hats, ticks). Higher is busier.
- **Weakest note** is how far the quietest tune note stands above everything else at its own pitch. Higher means the tune is easier to hear.
- The last two numbers undercount smooth sounds (string bows, synth notes), so they say how "hit-like" a version is, not how full it is.

What the measurements show about the original:

- **The kick was as loud as the piano.** Measured on its own, the kick was -18.2 LUFS and the piano -18.0. With the kick removed (1) the piano is 0.7 LU louder than everything else put together; in 0 it was 2.2 LU quieter.
- **The pumping is not what makes the bass jump.** Removing the breathing (3) leaves the jumpiness unchanged (7.6 vs 7.2). Removing the kick (1) drops it to 4.9.
- **The snap crowds the tune, not the kick.** The tune's weakest note (the high G at 8.5 s) lands on a snap. Its margin stays at 2.6 dB without the kick, and rises to 14 dB when the drums go.

Every new version gives the tune at least twice the original's margin.

Other measured checks:

- The piano part is bit-identical in all 16 files.
- The logo is the same file in all 16 (correlation 0.984 to 0.993 with `logo.wav`; the rest is the music's reverb tail).
- Mono fold-down loses 0.4 to 1.0 LU, under the 1.5 LU limit. The strings versions are the widest.
- This code's rebuild of 0 matches the chosen candidate's file to within 24-bit rounding.
- Two renders in a row give bit-identical files.

## What changed besides the backing

- In the new versions (4 to 15), the pad's breathing is gentler than the original's (depth 0.5 instead of 0.8). In 8 it breathes once per beat instead of twice. In 13 the breathing pad is gone, because the strings take its place.
- In 9, 11, 12, 13 and 15, the glass pluck's fast runs (bars 5, 6 and 8) are left out because the synth or strings take that role. Its echo of the tune stays in every version.
- Several versions have a steadier sub bass line (6, 8, 9, 11 to 15) or none at all (10, where the synth bass replaces it).

## Recommendation

1. **Start with 1-no-kick against 0.** The numbers point to the kick: it is as loud as the piano and causes most of the low-end jumping. If 1 already sounds right, the fix is just a softer kick, and **4-soft-thump** is that version.
2. **For a new direction: 15-piano-and-synth-hybrid.** It best fits "felt and pulse", piano for the person and warm electronics for the machine, because both halves carry the rhythm: a second piano and a synth pattern. Only a soft thump is left of the drums. The tune keeps a 13.5 dB margin, and it has about half the original's hits.
3. **14-two-pianos** is the calmest, most premium-sounding option on paper, if "playful" can be gentler.

## What is weakest (honest)

- **Nobody has listened to any of this.** Every balance was set by measuring loudness, not by ear.
- **The strings break the brand rules.** RULES.md bans strings. They are here only because the owner asked to hear them. If one wins, the rules need changing.
- **The strings may sound stiff.** The samples are good free recordings, but 11's violins repeat one note in sixteenths, which may sound mechanical. 11 also has the thinnest tune margin of the new versions (5.7 dB): violin overtones sit on the tune's high G.
- **The synthesised thumps, brushes, woodblocks and ticks** (4, 7, 8) are code, not recordings. The brushes in 4 are the least convincing.
- **13-strings-swell loses the playfulness by design.** It may feel like a different film.
