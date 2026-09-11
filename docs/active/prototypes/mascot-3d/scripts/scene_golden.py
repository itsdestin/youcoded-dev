"""
Render 01 — "Golden Sunbreak" hero.

The default YouCoded buddy, faithful to the 2D artwork, lit as a product
hero: neutral key from the upper left, a cool teal rim raking the right
edge, an amber kicker from behind-left, on a dark reflective floor in front
of a softly lit studio wall.

Usage:
  blender -b -P scene_golden.py -- --out <path.png> --res 1600x2000 --samples 1200
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from buddy_lib import (  # noqa: E402
    build_buddy, sparkles, assign, principled, emissive, micro_bump,
    edge_wear, rough_variation, backdrop, haze, reset_scene, setup_render,
    add_camera, area_light, world_gradient, grade, sl, srgb,
)

# --- CLI -------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default


OUT = arg("--out", "/tmp/buddy.png")
RES_X, RES_Y = (int(v) for v in arg("--res", "1600x2000").split("x"))
SAMPLES = int(arg("--samples", "1200"))
LENS = float(arg("--lens", "110"))
DIST = float(arg("--dist", "8.5"))
EXPOSURE = float(arg("--exposure", "0.0"))
SAT = float(arg("--sat", "1.34"))

# --- scene -----------------------------------------------------------------
reset_scene()
scene = setup_render(RES_X, RES_Y, SAMPLES)
scene.view_settings.exposure = EXPOSURE

buddy = build_buddy(eye_scale=1.32, mouth_scale=1.45, socket_depth=0.05,
                    body_bevel=0.30, body_depth=1.06)

AMBER = srgb("#f0a828")       # brand amber, nudged toward orange so AgX's
NAVY = srgb("#10131f")        # highlight desaturation still lands on-brand
PLUM = srgb("#4a3c66")
MOUTH = srgb("#1a1826")

# --- materials -------------------------------------------------------------
shell = principled("shell", AMBER, roughness=0.30, coat=1.0, coat_rough=0.08)
rough_variation(shell, scale=5.0, low=0.20, high=0.40)
micro_bump(shell, scale=260, strength=0.05)
edge_wear(shell, wear_color=srgb("#ffcf7a"), amount=0.18, rough_add=0.14)

lens_mat = principled("lens", NAVY, roughness=0.045, coat=1.0, coat_rough=0.012,
                      emission=PLUM, emission_strength=0.30)
micro_bump(lens_mat, scale=900, strength=0.015)

mouth_mat = principled("mouth", MOUTH, roughness=0.22, coat=1.0, coat_rough=0.04)
spark = emissive("sparkle", (1.0, 0.97, 0.93, 1.0), 26.0)

for name in ("body", "arm_l", "arm_r", "leg_l", "leg_r"):
    assign(buddy[name], shell)
assign(buddy["eye_l"], lens_mat)
assign(buddy["eye_r"], lens_mat)
assign(buddy["mouth"], mouth_mat)

# Sparkle cluster, bottom-right of each eye — the SVG's r0.25/0.18/0.13
# circles expressed as offsets from the eye centre.
CLUSTER = [(sl(0.8), sl(-0.8), sl(0.26)),
           (sl(0.1), sl(-1.5), sl(0.18)),
           (sl(1.2), sl(-1.5), sl(0.13))]
EYE_SEMI = (sl(1.6) * 1.32, 0.21, sl(2.2) * 1.32)   # matches build_buddy
sparkles(buddy["eye_l"], CLUSTER, spark, semi=EYE_SEMI)
sparkles(buddy["eye_r"], CLUSTER, spark, semi=EYE_SEMI)

# --- pose: a small friendly wave, right arm up ------------------------------
buddy["arm_r"].location = (1.02, -0.02, 0.34)
buddy["arm_r"].rotation_euler = (0, math.radians(-26), 0)
buddy["arm_l"].location = (-1.00, 0.0, -0.16)
buddy["arm_l"].rotation_euler = (0, math.radians(9), 0)
buddy["leg_l"].rotation_euler = (0, math.radians(3), 0)
buddy["leg_r"].rotation_euler = (0, math.radians(-3), 0)

# Three-quarter turn, so we read volume rather than a flat elevation.
bpy.ops.object.select_all(action='DESELECT')
for o in buddy.all + [o for o in bpy.data.objects if "sparkle" in o.name]:
    o.select_set(True)
bpy.context.view_layer.objects.active = buddy["body"]
bpy.ops.transform.rotate(value=math.radians(-16), orient_axis='Z',
                         center_override=(0, 0, 0))
bpy.ops.object.select_all(action='DESELECT')

# --- set -------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -1.11))
floor = bpy.context.object
floor.name = "floor"
floor_mat = principled("floor", srgb("#0b0d14"), roughness=0.14, coat=0.0)
micro_bump(floor_mat, scale=7, strength=0.09)
assign(floor, floor_mat)

backdrop(width=30, height=18, y=7.5, top=srgb("#0e1526"),
         bottom=srgb("#04050b"), strength=2.2)
world_gradient(top=srgb("#070a14"), bottom=srgb("#020308"), strength=1.0)
haze(size=26, density=0.0016, color=(0.55, 0.72, 1.0, 1))

# --- lighting --------------------------------------------------------------
# Key stays near-neutral: a warm key on top of an amber body is what turned
# the first pass beige.
area_light("key", (-3.1, -3.6, 3.3), (0, 0, 0.05), energy=410,
           color=(1.0, 0.96, 0.92), size=4.5)
area_light("rim_cool", (2.7, 4.3, 1.7), (0.40, 0, 0.10), energy=520,
           color=(0.62, 0.80, 1.0), size=1.4)
area_light("rim_warm", (-3.0, 3.6, 1.3), (-0.40, 0, 0.05), energy=125,
           color=(1.0, 0.50, 0.16), size=1.3)
area_light("fill", (0.8, -5.2, -1.4), (0, 0, 0.0), energy=45,
           color=(0.50, 0.66, 1.0), size=8.0)
area_light("halo", (0.0, 3.2, 1.0), (0, 0, 0.40), energy=110,
           color=(1.0, 0.76, 0.45), size=1.2)
# Eye catchlight: a small hard source dead front, so both lenses carry a
# crisp specular dot the way a real glossy eye does.
area_light("catch", (-0.9, -3.0, 1.5), (-0.1, 0, 0.10), energy=90,
           color=(1.0, 1.0, 1.0), size=0.35)

# --- camera ----------------------------------------------------------------
ang = math.radians(18)
cam = add_camera(
    location=(math.sin(ang) * DIST, -math.cos(ang) * DIST, 0.50),
    look_at=(0, 0, -0.08),
    lens=LENS, fstop=2.8,
)
cam.data.sensor_fit = 'HORIZONTAL'

grade(glare_kw={"threshold": 0.9, "size": 0.26, "strength": 0.40},
      saturation=SAT, contrast=1.2, dispersion=0.006)

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(f"[render] wrote {OUT}")
