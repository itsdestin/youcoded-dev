# Morning Rounds — the mascot

The design record for the Morning Rounds theme's mascot. Destin approved the four
decisions below on a review deck; the theme itself is in
[docs/active/handoffs/2026-09-20-morning-rounds-theme-handoff.md](../../handoffs/2026-09-20-morning-rounds-theme-handoff.md).

## The decisions

| Step | Question | Answer |
|---|---|---|
| A-1 | Is the vet-dog mascot right? | **Yes** |
| D-1 | Which palette ships? | **Rounds Cream** |
| C-1 | Which scrubs on the buddy? | **Clinic blue** `#3A6FA8`, plus the note **"remove the tail"** |
| D-3 | Should the dog hold something? | **Add the clipboard** |

## What the mascot is

`wallpaper-b.jpg` ships two characters: a cream dog in carnelian scrubs and a gray
cat in teal scrubs. The buddy is the **dog**, holding a clipboard like the cat's.

| Part | Slot | Geometry |
|---|---|---|
| Cream-lined dog ears | `slot-hat` | lobes at x 6.6 / 17.4, y 3.1 — inside the slot's box, x 5–19 · y −4..6 |
| Cream muzzle + nose | inside every face group | shallow wide lens, rx 3.9 ry 1.5 at y 13.3 |
| Clipboard of notes | `slot-item` | 2.9 × 4.0 at the hand, tilted 20° |

There is **no tail** — he asked for it removed, and the build asserts one cannot
reappear without someone deliberately re-enabling it.

## Three defects this went through, and the checks that now hold them out

The first version shipped on the deck and looked wrong at full size. Each fix has a
build check, and each check was proved by planting the defect back and watching it
fire.

| Defect | Cause | Check |
|---|---|---|
| Cream halo round each eye | an eye `rim`; five of the seven shipped rigs set a dark `fill` and **no** rim | eye ellipse must carry no `stroke` |
| Orange "fried egg" pupils | `pair` catchlight using the palette's amber, 0.52 units wide in a 1.6-unit eye | catchlight radius must stay ≤ 0.34 |
| Ears hanging off the side of the head | they sat at x 3.8–20.2 · y 4.4–10.8, **outside the hat slot's documented box**, and 0.05 units off the arm | lobes must stay inside the slot box |

Two further traps, learned the hard way:

- **The eye's `rim` strokes the mouth as well as the eye.** `mascot-faces.mjs` applies it
  to every filled shape, so a rim is a decision about the whole face, not just the eyes.
- **The flat art must come from the repo's own `flatten-rig.mjs`.** The builder's
  `--from-rig` projection produces byte-different headers, and the repo's `audit-rigs.mjs`
  fails the theme for it even though the art is identical.

## Answering the deck again later

`mascot-dog.json` is the deck spec, `mascot-dog.answers.json` his saved answers, and
`images/mascot-dog/` the pictures it showed. `preview/` is not committed (`.gitignore`).

To rebuild every candidate and the pictures:

```bash
bash build-variants.sh
```

It needs `decorate-mascot.cjs` (committed here, also at
`~/.claude/wecoded-themes/_preview/`) and the theme-builder skill's `build-mascot.mjs`.

**`decorate-mascot.cjs` is the source of the mascot.** The SVGs are generated, never
hand-edited; editing one is lost the next time the build runs.
