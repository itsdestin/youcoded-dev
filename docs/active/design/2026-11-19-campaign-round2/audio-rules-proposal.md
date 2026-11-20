---
status: draft
---

# Brand audio rules — proposal

A proposal for you to approve, change or reject. Once approved, it becomes a section of the brand guide
(`docs/brand/README.md`). Until then it is only a draft.

It comes from what you said about round two: you chose neither the storybook orchestra nor the pop band, asked
what happened to the earlier piano music, said you also liked the newer electronic version of the short type
film, and asked for sound that feels polished and premium.

**Listen first.** Five 20-second sketches of the same tune, each in a different sound, are in
`scripts/campaign/music/out/palette/`:

| File | What it is |
|---|---|
| `1-piano-alone.wav` | Round one's feel: a soft, close piano, nothing else |
| `2-piano-electronic.wav` | The piano tune with modern electronic backing: deep bass, a tight beat, soft synth chords, a quiet echoing pluck |
| `3-electronic-forward.wav` | The electronic version you liked: the tune on a music box and a soft synth, deep 808 bass drums, synth brass hits |
| `4-piano-warm-pads.wav` | Cinematic and hopeful: piano over slowly opening warm synth chords and deep bass, no drums, a soft heartbeat at the end |
| `5-piano-electronic-uptempo.wav` | Faster (120 beats a minute) and playful, for product films: bouncy piano, a steady dance beat, music box on top |

The rules below assume the answer is "the piano tune, with clean electronic production around it", which is what
sketches 2, 4 and 5 are, and what the three films now use. If one sketch is clearly right or wrong to your ear,
say which, and the rules change to match.

---

## 1. The signature: one tune, always

- **Every piece uses the campaign tune.** It is four short notes per chord over four chords (C, G, A minor, F):
  the opening of `hero60.wav` from round one. Someone who has heard one of our films should recognise the next one
  within a few seconds.
- **The tune is played on the piano** whenever there is a piano in the piece. Other sounds (music box, synth) may
  double it, never replace the piano when both are present.
- **The tune can change mood** — slower, quieter, in a minor key, only its first half — but never its notes'
  order. In the fairytale it opens low and detached ("sly"), and ends falling home onto the home note.
- **Short pieces (15 s or less)** must still play the tune at least once in full.

## 2. Sounds we use, and sounds we never use

**Use (few at a time — four to six in any one moment):**

- A soft, close piano (felt-damped, not a bright concert grand). The lead voice.
- Deep sub bass: felt more than heard, always under the piano, never louder than it.
- Tight electronic drums: a short kick, a soft clap or finger snap, light hi-hats, a shaker. Deep 808 bass drums
  for weight on big moments.
- Soft synth chords (warm "pads") whose brightness opens and closes with the story.
- Light sparkle: music box, glass bells, a short plucked synth, a quiet echo.
- Sound design made from the music itself: a piano chord played backwards breathing into a moment, a soft
  noise swell, a deep low "boom" under the biggest hit, a soft synthetic cymbal.

**Never use:**

- Fake orchestra: brass sections, string sections, choirs or timpani carrying the tune.
- Toy or band sounds: brass band, kazoo-like leads, marching drums, pizzicato "sneaking" strings.
- Disco, funk, generic pop band (slap bass, clavinet, horn stabs, live-band drum kit).
- Cartoon effects: slide whistles, boings, "wah-wah" trombones, record scratches, laugh tracks.
- Stock "epic trailer" hits, dubstep wobble, heavy distortion.
- Anything that sounds like a cheap keyboard preset (the test: if it sounds like a demo button, it goes).

## 3. Speed by kind of piece

| Kind of piece | Speed (beats a minute) | Feel |
|---|---|---|
| Narrated story (a voice tells it) | 85–100, free to stretch between lines | The music follows the words; changes land on words |
| Product film (showing the app in use) | 110–124 | Playful, moving, cuts on the beat |
| Short type film (words on screen only) | 96–110 | Every word or cut lands on a beat |
| End card / logo | Same as the piece, then held | One resolved chord, ringing out |

## 4. Music under a narrator

- **The voice always wins.** While the narrator speaks, the music sits at least **10 LU** (about 10 decibels,
  roughly "half as loud, twice over") under her, and in quiet parts much more. Measured per line, every line.
- **The music breathes between lines**: it dips in about 35 thousandths of a second when she starts and comes
  back in about a fifth of a second when she stops. In a short pause it rises only a little (a breath, not a
  surge); in a long pause it comes back fully.
- **Big musical moments land on words** (a chord on "everything"), then swell **after** the word ends, so the
  word and the music never fight.
- **No echo or room sound on the voice.** She sounds close and clear; only the music has space.
- **Quiet parts stay quiet.** The ducking only ever turns music down, so a hushed opening is not raised to the
  same level as the climax.

## 5. Sound effects

- **Only for something the picture does** (a pen writing, a key press, something appearing). No effect without
  a visible cause.
- **Quieter than you think.** Typing sits about 21 LU under the music (round two was 13; you asked for quieter).
  Small interface sounds about 15–20 LU under.
- **Same key as the music** when an effect has a pitch, so it sounds like part of the score.
- **No two identical in a row**: every key press, tick or tap varies slightly in pitch, level and timing, so it
  sounds like a person, not a machine gun.

## 6. Loudness and the technical floor

- Every finished film mix: **−14 LUFS** overall (the level YouTube, Instagram and TikTok play at), peaks no
  higher than **−1 dB true peak**, 48 kHz stereo.
- **Silent before the picture ends** (the last sound gone ~0.4 s before the last frame), the very last sample at
  zero, no click at the start or end.
- **The low end is mono** (bass sounds the same from both speakers), so it survives a phone speaker.

## 7. What "premium" means, in things we can check

| Check | Rule | How it is measured |
|---|---|---|
| Few sounds | No more than six different sounds at any moment | Count in the score file |
| Clear low end | Bass under 250 Hz is 30–55% of the energy in a beat section, and mono | Spectrum and stereo report (`bs_verify.py`) |
| Air on top | 2–12 kHz is at least 3% of the energy | Spectrum report |
| Real dynamics | Quiet parts are really quiet: the score alone has a loudness range of 8+ LU in a story film; the master limiter works hard (over 3 dB) less than 0.5% of the time | Loudness range and limiter report |
| Silence on purpose | Each film has at least one moment of near-silence before its biggest moment | Momentary loudness report |
| On the picture | Every cut and hit lands within 15 thousandths of a second | Onset report |
| Clean | No digital clicks | Click scan (above 17 kHz) |
| Tied to picture | Sound design only at turning points named in the edit | Score file's time table |

---

**What I need from you:** listen to the five sketches; say which one (or which two mixed) sounds like YouCoded,
and anything in sections 1–7 you want changed. Then this becomes brand guide section 13.
