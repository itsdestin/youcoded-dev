# Sound logo: eleven versions to pick from by ear

Files are in `out/`. Every one is a complete logo, 2 to 3 seconds long, ending in silence.
In every one the name lands at **exactly half a second** into the file, so any of them can
replace the current logo without moving anything in a film.

All versions are equally loud on a loudness meter, so you are comparing the sound, not the
volume. Play them in order; 01 is the current logo for reference.

## The versions

| # | What you hear | When to use it |
|---|---|---|
| **01 current** | The logo as it is today: three piano notes, a warm low chord with a soft "thump", a little rush of air into the landing, then a glassy high echo of the three notes. | Reference only. |
| **02 piano only** | Just the felt piano: the three notes and an open, low chord in the left hand. Nothing else. The most intimate and quiet-sounding. | Quiet, personal films; under a soft voice-over ending. Can feel small on big speakers (almost no deep bass). |
| **03 piano, no echo** | The current logo with the high glass echo taken out, plus the "thump" swapped for a smooth deep hum and the little air rush removed. Piano, warm chord, soft bass. | The safest refinement: the logo you know, minus the parts your rulings rule out. |
| **04 piano answered by piano** | The three notes, then a second, darker piano repeats them lower and slower, like someone across the room saying it back. | When you like the "call and answer" idea of the echo but not its high sound. |
| **05 piano and plucked strings** | Plucked violins play the three notes together with the piano, giving each a soft "pluck" edge; plucked cellos give the low note. Lighter and a bit playful. | Playful product films. |
| **06 piano and string swell** | The piano notes land into a short, warm swell of real strings that blooms for about a second and fades. The piano stays the voice. | Hopeful or emotional endings; the most "premium" feeling. |
| **07 strings lead** | Plucked strings play the three notes, then the violins hold the last note as a long bowed note; the piano only plays the chord underneath. | If you want the strings, not the piano, to be the brand's voice. |
| **08 two notes** | Shorter and firmer: only "co-ded" (the last two notes), played in octaves on a strong chord; gone in 2 seconds. | 5-second ads, bumpers, the end of very short clips. |
| **09 rising** | Same rhythm, but the last note goes UP instead of down and lands on a brighter, open chord, with a soft string swell. Feels like "and there's more". | Teasers, "coming soon", the end of a series episode. It changes the tune, so it is a sister logo, not a replacement. |
| **10 full blend** | Everything you said yes to, spread out so each has its moment: piano with plucked violins, plucked cello and deep bass under the landing, a string swell, and the second piano answering low. Richest. | Big launch film; the end of a long ad. |
| **11 piano answered by strings** (extra) | The piano asks; violas answer it with the same three notes, low and smooth (bowed, joined up), instead of the glass echo. Warm and human, under the tune instead of above it. | Anywhere the current logo is used: it keeps the "asks, then is answered" story the logo was built on. |

## My top three

1. **06 piano and string swell.** It keeps the felt piano exactly as you love it and adds the
   one thing you said yes to most clearly (long string swells). One gesture, no clutter,
   nothing high or jingly: the most premium and restrained of the set.
2. **11 piano answered by strings.** It keeps the logo's idea (the person asks, something
   answers) but the answer is now warm, low and human instead of a high glass jingle.
   The most distinctive one.
3. **03 piano, no echo.** The smallest step from today: if you mostly like the current logo,
   this is it with the high echo, the thump and the air rush gone.

Runner-up: **10 full blend**, if 06 feels too plain. It is the busiest, so check it on a phone
speaker too.

## What is weakest (honest)

- **Nobody has listened to these.** I can't hear; balance was set by measurement (each part's
  loudness relative to the piano, written as numbers in `src/logos.py`). Expect to adjust a
  level or two after your first listen. Tell me "strings louder in 06" and it is a one-number change.
- **07 strings lead** is the version I trust least. The plucked strings are recordings of a
  whole section, so each pluck is several players slightly apart; on quick notes that is a
  little less crisp than one piano. It also gives up the felt piano as the voice.
- **09 rising** changes the tune itself, so it is not interchangeable with the others as "the" logo.
- **The string swells are shaped by me, not played that way.** The recordings are steady
  bowed notes; I fade them in and out to make the swell (and skip the bow's first scrape).
  They may sound slightly more like a smooth fade than like players swelling.
- **The strings are a free library** (good quality, not the best money can buy).

## What changed from the current logo, in every new version

- The **high glass echo is gone** (your "no random high jingles" ruling). 04 and 11 answer the
  notes low instead.
- The **"thump"** under the landing is replaced by a smooth deep hum: the old one dropped in
  pitch like a soft kick drum, which your "no kick, no soft thump" ruling rules out.
- The **little air rush into the landing is gone**: it is a tiny whoosh (your "no whoosh/riser"
  ruling). My checker flags it in the current logo as a sound that is not a note.
- The warm pad (03-05) now starts **with** the landing rather than 0.15 s before it.
- Very faint low rumbles inside two piano recordings (50 dB below the tune) are filtered out.

## Measurements (all from `out/checks.txt`; re-run below)

- **Loudness:** every file -16.0 LUFS integrated (within 0.02), the same as the current logo.
  Loudest moment (400 ms) -12.8 to -14.6 LUFS (current -13.6).
- **Peak:** true peak -3.3 to -5.1 dBTP (rule: at or below -1). Kept under -3.3 like the current,
  so each still fits when the demos play the logo 2 dB louder.
- **Landing:** measured from the audio, 0.4994 to 0.5034 s (current 0.5030); all within 5 ms of 0.500.
- **Clean ends:** first sample exactly silent in all; last sample -132 dBFS or quieter; last
  50 ms -71 to -80 dBFS.
- **Phone speakers (mono):** loudness lost when folded to mono 0.40 to 1.12 LU (rule: under 1.5).
- **No stray hits:** every attack found in every new version sits on a written note (0 strays).
  The checker was proven by planting quiet drum sounds 14 dB under each file's peak: snaps and
  hats caught 11/11, ticks 8/11 and kicks 9/11 (misses are where a pad or the deep hum already
  covers them). Separately, no version's code calls any drum, thump, riser or glass sound.
- **String tuning:** the recordings play within 4 cents of the intended notes.
- **Same every time:** re-rendering gives bit-identical files.

## Re-render

    scripts/campaign/sound/logo-alternatives/render.sh

(about 30 seconds; it uses the piano and strings already downloaded by `../felt-and-pulse`
and `../felt-and-pulse-playful`, read-only). The notes and the levels of each version are in
`src/logos.py`; the checks are in `src/build.py`.
