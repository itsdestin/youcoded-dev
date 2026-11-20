# Sources and licences: the youcoded sound-effects kit

Every outside recording is **CC0 1.0 (public domain dedication)**: free for commercial use, no
attribution required, no account needed to download. Nothing with a non-commercial, attribution
("BY") or unclear licence was used. Downloaded 2026-11-20.

The recordings are not stored in the repository. `render.sh` downloads them into `samples/`
(git-ignored) on first run.

## Kenney.nl packs (CC0, stated on each page and in each pack's `License.txt`)

| Pack | Page | Files used | Used in |
|---|---|---|---|
| RPG Audio | https://kenney.nl/assets/rpg-audio | `cloth1`, `cloth2`, `cloth3`, `dropLeather`, `handleSmallLeather`, `bookClose`, `bookOpen`, `bookFlip1`, `metalLatch`, `metalClick` | send-b, appear-b, change-a, reply-arrives-c, grow-b, lock-a/b, unlock-a/b, page-turn-b, reveal-c |
| Casino Audio | https://kenney.nl/assets/casino-audio | `card-slide-2`, `card-slide-8`, `card-place-1..4`, `card-shove-2` | send-a, reply-arrives-a, appear-a, move-a, reveal-c |

The download goes through the page's own "Continue without donating" link (a fresh signed
link per pack, fetched by `src/fetch_kenney.sh`).

## Freesound.org recordings (each page states CC0 1.0)

Freesound only gives original files to signed-in users, so the kit uses each sound's public
high-quality preview (an MP3 of the same recording). `src/fetch_freesound.py` reads the sound's
page first and refuses to download anything whose page does not show the CC0 deed; it logs
what it fetched to `samples/freesound/manifest.tsv`.

| Recording (author) | Page | Used in |
|---|---|---|
| Soft fast typing on a laptop keyboard (fredclose) | https://freesound.org/people/fredclose/sounds/755218/ | key-press-a, typing-demo-a |
| mechanical key soft (bigmonmulgrew) | https://freesound.org/people/bigmonmulgrew/sounds/378083/ | key-press-b, typing-demo-b |
| Enter Key Soft (suspensiondigital) | https://freesound.org/people/suspensiondigital/sounds/389702/ | key-press-b, typing-demo-b |
| tap on felt (emapuree) | https://freesound.org/people/emapuree/sounds/848748/ | key-press-c, typing-demo-c, reply-arrives-b, appear-c, move-b, grow-a, grow-c, count-up-b |
| Quiet Page Turn - 8 (SpaceJoe) | https://freesound.org/people/SpaceJoe/sounds/484968/ | send-c, page-turn-c |
| Cotton clothes rustling (khenshom) | https://freesound.org/people/khenshom/sounds/481075/ | change-b |
| Rustle of rough fabric (dynamique) | https://freesound.org/people/dynamique/sounds/617019/ | move-c |
| pen (marker pen) writes on paper (SSkiba88) | https://freesound.org/people/SSkiba88/sounds/751055/ | marker-stroke-a |
| Marker Lines (TubbsMedia) | https://freesound.org/people/TubbsMedia/sounds/377124/ | marker-stroke-b |
| Writing on paper with a marker pen (Torikari) | https://freesound.org/people/Torikari/sounds/869328/ | marker-stroke-c, handwriting-a |
| Pen and Paper Writing (redsedona) | https://freesound.org/people/redsedona/sounds/540567/ | handwriting-b |
| pen writes on paper (SSkiba88) | https://freesound.org/people/SSkiba88/sounds/751062/ | handwriting-c |
| Book Turn Page 1 (esperri) | https://freesound.org/people/esperri/sounds/119126/ | page-turn-a |
| Tapping and handling paper (IENBA) | https://freesound.org/people/IENBA/sounds/834340/ | count-up-a |
| Bed sheets and blanket rustling (adina.trx) | https://freesound.org/people/adina.trx/sounds/856380/ | reveal-a |

A courtesy credit is not required by CC0 but is welcome: "Sound effects include CC0 recordings
from Kenney.nl and Freesound.org contributors."

## Synthesised parts (made by the code in `src/`, no outside material)

- the plastic key-cap ring in key-press-c (a few inharmonic resonances lasting about 10 ms)
- the air "pff" in appear-c, the breath-and-bloom in change-c, the felt slide in move-b
- the rubber "puk" resonance in grow-c, the latch contacts in lock-c and unlock-c
- the paper-grain trickle in count-up-c, the deep bloom in reveal-b, the low warmth under reveal-c
- the kit's shared small "close room" (a handful of 3-23 ms desk reflections)

## Downloaded and examined (spectrograms), not used

Kenney "Interface Sounds", "UI Audio", "Impact Sounds" (all CC0): kept only as reference clacks
to calibrate the clack measurement. Freesound (CC0): 565206, 481076 (marker writing, too hissy),
186914 (pen, a loud click in it), 337087, 79711, 749425 (typing, clicky), 382651, 698636 (page
turns, high noise floor), 850704 (fabric, very quiet).

## Software

numpy, scipy, soundfile (BSD), matplotlib (pictures only). None of it ships in the audio.
