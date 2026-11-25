# First-shot briefs (keep out of the composer's context until its run)

Hand ONE brief to a fresh composer. Times are seconds from the start of the film. Each film file
is `src/film_fs<n>.py` with `copy_to=None`.

## Brief 1 — type-only, 10 s, subtle
- Kind: type-only. Length 10.0 s. Adjectives: quiet, sure, close. Feel: subtle.
- Cards: 0.4 s "it's yours" · 3.9 s "all of it". Name (logo) at 7.6 s.
- Moments: 3.9 s "peak" (the second card).
- Picture: one slow push-in on a dark screen, no cuts.

## Brief 2 — type-only, 20 s, present
- Kind: type-only. Length 20.0 s. Adjectives: bright, confident, warm, open. Feel: present.
- Cards: 0.5 s "one app" · 4.6 s "every device" · 8.9 s "your rules" · 13.2 s "no subscription".
  Name at 17.4 s.
- Moments: 13.2 s "peak".
- Picture: a cut with each card.

## Brief 3 — app demo, 30 s
- Kind: app-demo. Length 30.0 s. Adjectives: easy, curious, capable. Feel: subtle.
- Picture (cuts): 0.0 "a blank chat" · 6.1 "she types a request" · 13.4 "a page builds itself" ·
  20.7 "she drags it onto her phone" · Name at 27.4 s.
- Moments: 13.4 s "the page appears" · 20.7 s "peak".

## Brief 4 — app demo, 60 s
- Kind: app-demo. Length 60.0 s. Adjectives: steady, inventive, friendly, unhurried. Feel: present.
- Picture (cuts): 0.0 "home screen" · 7.8 "a theme is chosen" · 16.2 "the theme spreads across the app" ·
  24.9 "a skill is installed" · 33.5 "the skill runs" · 41.0 "results on a phone" · Name at 56.9 s.
- Moments: 16.2 s "the theme lands" · 41.0 s "peak".
- The first 30 s must stand alone (cut-down).

## Brief 5 — narrated story, about 50 s
- Kind: narrated. Voice: `scripts/campaign/film/public/audio/voice-take1-lily.wav`, words
  `scripts/campaign/film/src/round2/take1-words-lily.json`, from 25.6 s ("Blinded by their own
  hubris...") to the end ("...to open source everything.", 71.5 s in her file), with 1.5 s of
  music before her first word: `speech_from_words(words, 25.6, start_at=1.5)`.
- Adjectives: storybook, defiant, hopeful. Feel: present.
- Her turn from problem to solution: "And so, for the first time..." (find its time in the words file).
- Moments: the turn; "peak" on "open source everything". Name about 2.5 s after her last word.
- No picture list (the editor cuts to the music).

## Brief 6 — menu loop, 90 s, no picture
- Kind: app-demo recipe used as a menu loop. Length 90.0 s. Adjectives: calm, patient, gently
  curious, soothing. Feel: subtle.
- No picture, no cards. The name lands at the end as usual.
- The test: the owner hears it three times in a row. It must stay pleasant on the third pass
  ("easy to listen to indefinitely without it becoming annoying, but still varied").
