---
status: draft
---

# Brand audio rules — proposal

A proposal for you to approve, change or reject. Once approved, it becomes a section of the brand guide
(`docs/brand/README.md`). Until then it is only a draft.

It comes from what you said about round two: you chose neither the storybook orchestra nor the pop band, asked
what happened to the earlier piano music, said you also liked the newer electronic version of the short type
film, and asked for sound that feels polished and premium.

**Listen first.** Twenty-second sketches of the same tune are in `scripts/campaign/music/out/palette/`. There are
now **three choices**, down from five: a sound engineer measured the old five and found two pairs were nearly the
same. All three are set to the same brightness and the same amount of bass, so you compare the character of each
sound, not which one happens to be brighter. Each starts quiet and grows to full.

| File | What it is |
|---|---|
| `1-piano-alone.wav` | Round one's feel: a soft, close piano, nothing else |
| `2-piano-electronic.wav` | The piano tune with modern electronic backing: deep bass, a tight beat, soft synth chords, a quiet echoing pluck |
| `3-electronic-forward.wav` | The electronic version you liked: the tune on a music box and a soft synth, deep 808 bass drums, synth brass hits |
| `tempo-note-120bpm.wav` | Not a choice: sketch 2 played at product-film speed (120 beats a minute), the speed Make it mine uses |

**New piano.** The piano in every file and film is now a recording of a real grand piano (the Salamander Grand
Piano, played note by note at 16 strengths of touch). The old one was a free, basic keyboard sound that had been
doctored to sound brighter. The new one's licence allows ads, as long as we credit it somewhere (for example in a
video's description): "Piano: Salamander Grand Piano by Alexander Holm (CC BY 3.0)".

The rules below assume the answer is "the piano tune, with clean electronic production around it", which is what
sketch 2 is, and what the three films now use. If one sketch is clearly right or wrong to your ear, say which, and
the rules change to match.

---

## 1. The signature: one tune, always

- **Every piece uses the campaign tune.** It is four short notes per chord over four chords (C, G, A minor, F):
  the opening of `hero60.wav` from round one. Someone who has heard one of our films should recognise the next one
  within a few seconds.
- **What makes it ours is the melody and the chord colours, not the chords.** C, G, A minor, F is the most used
  chord pattern in pop music, so on its own it sounds like everything else. The recognisable part is the four-note
  melody on top, and the "open" chord colours under it (each chord with an added ninth, the slightly airy sound of
  round one). Those two never change.
- **The tune is played on the piano** whenever there is a piano in the piece. Other sounds (music box, synth) may
  double it, never replace the piano when both are present.
- **The tune can change mood** — slower, quieter, in a minor key, only its first half — but never its notes'
  order. In the fairytale it opens low and detached ("sly"), and ends falling home onto the home note.
- **Short pieces (15 s or less)** must still play the tune at least once in full.

## 2. Sounds we use, and sounds we never use

**Use (few at a time — four to six in any one moment):**

- A soft, close piano. The lead voice. It is always a **recorded (sampled) piano whose licence allows ads**,
  played softly and gently darkened, never a basic keyboard sound and never doctored to sound brighter.
- Deep sub bass: felt more than heard, always under the piano, never louder than it.
- Tight electronic drums: a short kick, a soft clap or finger snap, light hi-hats, a shaker. Deep 808 bass drums
  for weight on big moments.
- Soft synth chords (warm "pads") whose brightness opens and closes with the story.
- Light sparkle: music box, glass bells, a short plucked synth, a quiet echo.
- Sound design made from the music itself: a piano chord played backwards breathing into a moment, a soft
  noise swell, a deep low "boom" under the biggest hit, a soft synthetic cymbal.

**Never use:**

- Fake orchestra: brass sections, string sections, choirs or timpani carrying the tune. Synth brass stabs
  (clearly electronic, like the ones in `3-electronic-forward.wav`) are allowed for weight on hits; a real or fake
  brass section never carries the tune.
- Toy or band sounds: brass band, kazoo-like leads, marching drums, pizzicato "sneaking" strings.
- Disco, funk, generic pop band (slap bass, clavinet, horn stabs, live-band drum kit).
- Cartoon effects: slide whistles, boings, "wah-wah" trombones, record scratches, laugh tracks.
- Stock "epic trailer" hits, dubstep wobble, heavy distortion.
- Anything that sounds like a cheap keyboard preset (the test: if it sounds like a demo button, it goes).
- **"Pumping"**: the dance-music effect where the backing ducks and swells on every kick drum. It is the
  sound of the pop you turned down. In a product film nothing dips more than 2 dB on a kick, and the piano never
  does. Under a narrator, nothing pumps at all.
- A kick drum on every beat for long stretches (the workout-track feel). Product films use a kick on beats one
  and three; the full every-beat pulse is kept for the last few bars before the big moment.
- One sound sticking out like a whistle: no single pitched sound (a bell, a music box note) stands more than
  15 dB above the sound around it. Small bright sounds in the 1.3-2.6 kHz range are where ears and phone
  speakers are most sensitive, so they pierce first.

## 3. Speed by kind of piece

| Kind of piece | Speed (beats a minute) | Feel |
|---|---|---|
| Narrated story (a voice tells it) | 85–100, free to stretch between lines | The music follows the words; changes land on words |
| Product film (showing the app in use) | 110–124 | Playful, moving, cuts on the beat |
| Short type film (words on screen only) | 96–110 | Every word or cut lands on a beat |
| End card / logo | Same as the piece, then held | One resolved chord, ringing out |

## 4. Music under a narrator

- **The voice always wins.** While the narrator speaks, the music sits at least **10 LU** under her (10 LU under
  sounds about half as loud); on the **last two lines**, where the story peaks, at least **9 LU**. In quiet parts
  it sits further under, but never more than about 20 LU, or it disappears. Measured per line, every line.
- **The story's rise must be heard under her.** The music itself climbs: at least 4 LU louder the moment the
  story turns ("something truly wonderful") than in the hush just before, and at least 7 LU louder at the end
  than at the start.
- **The music must still be heard on a phone.** A phone speaker plays almost nothing below about 150 Hz, so deep
  bass alone does not count as "music under the voice". Checked by cutting everything below 150 Hz from the
  music: the piano tune must still be there in every part of the story, no more than about 18 LU under her.
- **The music breathes between lines**: it dips in about 35 thousandths of a second when she starts and comes
  back in about a fifth of a second when she stops. In a short pause it rises only a little (a breath, not a
  surge); in a long pause it comes back fully.
- **Big musical moments land on words** (a chord on "everything"), then swell **after** the word ends, so the
  word and the music never fight. The swell after the last word takes about half a second and ends about as
  loud as her voice was, never far louder (otherwise it sounds like someone turned the volume up).
- **Timed to her real voice, not to a transcript.** The automatic word timings put some words up to 0.4 s
  early or late (they count each pause as part of a word), which made the music swell over the punchline
  "shareholder" and land the last chord in the breath before "everything". Every word after a pause is now
  checked against the recording, and every hit must land within 15 thousandths of a second of where her voice
  actually starts (checked within 30 thousandths against the recording).
- **The last chord rings and settles.** It fades steadily, never faster than 2 dB in a tenth of a second until
  it is nearly gone, and only the last 0.6 s is a fade to silence. A swell that is cut away sounds rushed.
- **No echo or room sound on the voice.** She sounds close and clear; only the music has space.
- **Quiet parts stay quiet.** The ducking only ever turns music down, so a hushed opening is not raised to the
  same level as the climax.

## 5. Sound effects

- **Only for something the picture does** (a pen writing, a key press, something appearing). No effect without
  a visible cause.
- **Quieter than you think, but never gone.** Typing sits 15 LU under the music (round two was 13; you asked
  for quieter; at 21 LU it vanished on a phone and typing on screen looked like a silent animation). To keep
  quiet clicks audible, the music **makes room** while someone types: the hi-hats, shaker, claps and sparkle
  drop away and the top of the piano and synths softens, so the clicks are the brightest thing playing. The key
  clicks keep only their bright tick (nothing below 2 kHz). Small interface sounds about 15–20 LU under.
- **Placed from the edit itself.** Typing sounds play only where the picture shows typing at true speed, and big
  hits land on the frame where the picture changes; both are read from the film's own timeline, never typed in
  by hand.
- **Same key as the music** when an effect has a pitch, so it sounds like part of the score.
- **No two identical in a row**: every key press, tick or tap varies slightly in pitch, level and timing, so it
  sounds like a person, not a machine gun.

## 6. Loudness and the technical floor

- Every finished film mix: **−14 LUFS** overall (the level YouTube, Instagram and TikTok play at), peaks no
  higher than **−1.5 dB true peak** (we deliver −1.7), 48 kHz stereo.
- **No digital silence inside a film.** A planned pause (a held breath before a big moment) drops to about
  −45 to −50 LUFS, with a faint high chord and air still there. True silence on headphones sounds like the video
  stalled.
- **Silent before the picture ends** (the last sound gone ~0.4 s before the last frame), the very last sample at
  zero, no click at the start or end.
- **The low end is mono** (bass sounds the same from both speakers), so it survives a phone speaker.
- **Nothing below 30 Hz.** The music is filtered below about 30 Hz: no speaker plays it, but it still uses up
  loudness.

## 7. What "premium" means, in things we can check

| Check | Rule | How it is measured |
|---|---|---|
| Few sounds | No more than six different sounds at any moment | Count in the score file |
| Clear low end | Below 160 Hz is 35–40% of a whole film's energy; below 40 Hz under 3%; music filtered below 30 Hz; bass mono | Spectrum and stereo report (`bs_measure.py`, `bs_verify.py`) |
| Air on top | Above 8 kHz is 1.5–4% of the music's energy in a finished film mix (a felt piano alone is naturally darker) | Spectrum report |
| Heard on a phone | With everything below 150 Hz removed, the piano tune is still heard in every section | Phone check (`bs_measure.py`) |
| Nothing pierces | No pitched sound more than 15 dB above the sound around it, in the 1–5 kHz range, in a finished film (20-second sketches of one short loop are exempt: four chords repeated pile up by nature) | Tonal-peak report |
| Real dynamics | Quiet parts are really quiet: the score alone has a loudness range of 8+ LU in a story film; a product film's middle climbs at least 3 LU from its quietest section to its loudest; the master limiter works hard (over 3 dB) less than 0.5% of the time | Loudness range, section loudness and limiter report |
| Silence on purpose | Before each film's turning point (the fairytale's "something wonderful", Make it mine's reveal, Own everything's first hit), the music falls to −30 LUFS or quieter for at least a quarter of a second | Momentary loudness report |
| On the picture | Every cut and hit lands within 15 thousandths of a second of the frame, and every hit's time comes from the film's own edit (a cut or a named moment) or the narrator's measured voice | Onset report; the score stops with a plain message if a picture time is missing |
| No pumping | Nothing dips more than 2 dB on a kick; the piano never; nothing under a narrator | Score file settings |
| Typing heard | While someone types, the clicks are louder than everything else above 2.5 kHz combined | Typing report (`bs_measure.py`) |
| Ending | The last chord falls no faster than 2 dB per tenth of a second until −40 LUFS; the logo chord is within 3 LU of the film's last big hit | Momentary loudness report |
| Breaths | Planned pauses sit at −45 to −50 LUFS, never digital silence | Momentary loudness report |
| Clean | No digital clicks | Click scan (above 17 kHz) |
| Tied to picture | Sound design only at turning points named in the edit, read from the film's own timeline | Score file's time table |

---

**What I need from you:** listen to the three sketches (the fourth file is only a speed reference); say which one (or which two mixed) sounds like YouCoded,
and anything in sections 1–7 you want changed. Then this becomes brand guide section 13.
