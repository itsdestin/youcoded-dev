# The reference shelf

Clips the owner has approved by ear, listed by path (nothing large is copied into git). Read a new
piece's numbers next to theirs with:

```
render.sh <film>            # render first (writes out/films/<film>.json and .wav)
render.sh --shelf <film>    # its unity readings and tone, column by column against the shelf
```

The list and the note-based numbers live in `shelf.json`; audio numbers (tone, level swing,
width) are measured by `--shelf` the same way the review deck measured them
(`src/elements_review.py analyse_file`) and cached in `out/shelf-cache.json`. **Numbers to read,
never targets.** Nobody here can hear; a reading close to the shelf is not "sounds good".

| Clip | Path | Why it is here |
|---|---|---|
| own-r8 | `~/Documents/youcoded-campaign/round8/own-music.mp3` (picture `own-tall.mp4`) | round 8 "Own everything": "among the better ones i've seen so far" |
| pulse-C-swung | `~/Documents/youcoded-campaign/music-review/elements/pulse-lilt.mp3` | E2 C, gently swung: "i realllllly like BOTH c and d" |
| pulse-D-chord | `.../elements/pulse-chord.mp3` | E2 D, the chord-following pulse (the v4 default) |
| busy-C-full | `.../elements/busy-full.mp3` | E3 C: "totally acceptable ... still feels like a single unified song" |
| piano-A-soft | `.../elements/piano-soft.mp3` | E4 A: "ours, soft" (touch 0.28, the v4 default) |
| bright-B-middle | `.../elements/bright-today.mp3` | E5 B: "middle" (the tone the v4 default is matched to) |
| room-B-today | `.../elements/space-today.mp3` | E6 B: "today" |
| chords-B-rich | `.../elements/chords-rich.mp3` | E7 B: "rich" |
| end-B-quiet | `.../elements/end-quiet.mp3` | E11 B (quiet): "prefer b/c to a" |
| end-C-piano | `.../elements/end-piano.mp3` | E11 C (piano only): "prefer b/c to a" |
| fp-hopeful | `scripts/campaign/sound/felt-and-pulse/out/demo-hopeful.wav` (git-ignored; also `~/Documents/youcoded-campaign/music-review/history/h01-felt-and-pulse-hopeful.mp3`) | the identity demo he said yes to; its motif and chords were chosen together |
| fp-playful | `scripts/campaign/sound/felt-and-pulse-playful/ref/demo-playful.wav` | the playful identity demo he said yes to |

**What the shelf is not.** It is not a set of moods to copy, and the element clips are 20 s
excerpts that each differ from one base in ONE element (pulse, piano, brightness...): they show a
setting he chose, not a finished piece. Round 8 Own and the Felt and pulse demos are the finished
pieces he liked.

**For contrast (rejected, not on the shelf):** `.../elements/held-strings.mp3` (strings owned
69 % of 1-3 kHz and 100 % of 3-6 kHz: "wayyy too harsh/overpowering"), `.../elements/tune-every-bar.mp3`
(a held F5 on a non-chord tone in 4 of 8 bars: "clash with the underlying base"), the family
sketches (`family-*`: "the different instruments are kinda just doing their own thing").

**Where the note readings come from.** The `readings` in `shelf.json` were measured by the mix
analysis of 2026-11-25 on re-rendered stems and note logs (round 8 Own from commit 22001f1ab, its
envelope matching the delivered file at correlation 1.00; the deck clips from the toolkit's source;
Felt and pulse from its own source with a note log added). A shelf clip with no note readings shows
`-`: only its audio is measured.
