---
status: draft
created: 2026-09-02
---

# Mascot 3D renders

Real 3D renders of the YouCoded buddy, built and rendered locally in Blender
5.1 on the machine's GPU (Cycles / HIP). Nothing here is drawn or AI-generated —
the character is modelled from the numbers in
`youcoded/desktop/welcome-mascot.svg`, lit, and path-traced.

## Files

| File | What it is |
|---|---|
| `scripts/buddy_lib.py` | The rig + shared helpers: geometry, materials, lighting, post |
| `scripts/scene_golden.py` | Render 01 — Golden Sunbreak hero |
| `renders/` | Output PNGs (`preview*.png` are the iteration steps) |

## Running one

```bash
cd docs/active/prototypes/mascot-3d
blender -b -P scripts/scene_golden.py -- \
  --out $PWD/renders/hero-golden-sunbreak.png --res 1600x2000 --samples 900
```

Handy flags: `--res 640x800 --samples 128` for a ~7-second look, plus
`--lens`, `--dist`, `--exposure`, `--sat`.

## Notes worth keeping

- **Blender 5.x moved the compositor** to a node *group*
  (`scene.compositing_node_group`); the old `scene.node_tree` and the
  `Composite` node are gone, and the Glare node's settings are now input
  sockets. `grade()` wraps this.
- **AgX desaturates as values climb**, which turned the brand amber to beige on
  the first pass. The fix is a saturation push in post plus a near-neutral key
  light — not brighter, warmer lights.
- **Apply the bevel before booleaning.** Applying a boolean while a bevel is
  still pending silently applies it to the raw cube.
- **Blue rim light on an amber body reads green.** The cool rim has to be a
  pale blue-white, not a saturated blue.
