"""
Face workshop — four treatments of the same character, same camera, same
bright product lighting, so only the face changes between tiles.

  A  flush     : eyes printed flat on the surface, no recess at all,
                 one small catchlight high in each eye
  B  recessed  : shallow crisp recess, same high catchlight
  C  faithful  : shallow recess, the artwork's low sparkle cluster restored
  D  screen    : one dark faceplate holding both eyes and the smile,
                 like a device screen rather than two holes

Usage:
  blender -b -P scene_face_variants.py -- --variant A --out a.png
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from buddy_lib import (  # noqa: E402
    build_buddy, sparkles, assign, principled, emissive, micro_bump,
    rough_variation, edge_wear, elliptic_prism, boolean, reset_scene,
    setup_render, add_camera, studio, world_gradient, backdrop, grade,
    sl, sx, sz, srgb,
)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default


V = arg("--variant", "A").upper()
OUT = arg("--out", f"/tmp/face-{V}.png")
RES_X, RES_Y = (int(v) for v in arg("--res", "760x760").split("x"))
SAMPLES = int(arg("--samples", "160"))

reset_scene()
scene = setup_render(RES_X, RES_Y, SAMPLES)

# --- per-variant face construction -----------------------------------------
SOCKET = {"A": 0.0, "B": 0.045, "C": 0.045, "D": 0.0}[V]
buddy = build_buddy(eye_scale=1.02, mouth_scale=1.30, socket_depth=SOCKET,
                    body_bevel=0.30, body_depth=1.06)

AMBER = srgb("#f5ab2e")
NAVY = srgb("#151a26")
MOUTH = srgb("#151a26")

shell = principled("shell", AMBER, roughness=0.32, coat=1.0, coat_rough=0.10)
rough_variation(shell, scale=5.0, low=0.24, high=0.40)
micro_bump(shell, scale=260, strength=0.04)
edge_wear(shell, wear_color=srgb("#ffd88f"), amount=0.14, rough_add=0.10)

lens_mat = principled("lens", NAVY, roughness=0.16, coat=0.55, coat_rough=0.06)
mouth_mat = principled("mouth", MOUTH, roughness=0.20, coat=0.5, coat_rough=0.05)
spark = emissive("sparkle", (1.0, 0.98, 0.95, 1.0), 14.0)

for name in ("body", "arm_l", "arm_r", "leg_l", "leg_r"):
    assign(buddy[name], shell)
assign(buddy["eye_l"], lens_mat)
assign(buddy["eye_r"], lens_mat)
assign(buddy["mouth"], mouth_mat)

FRONT = -1.06 / 2
LENS_FRONT = -0.045                     # flat lens half-depth, from its centre

if V == "D":
    # One dark faceplate carrying both eyes and the smile — a device screen
    # rather than two holes punched in the shell.
    from buddy_lib import rounded_box, apply_all
    cut = rounded_box("plate_cut", 1.00, 0.10, 0.88, bevel=0.14, segments=10)
    apply_all(cut)
    cut.location = (0, FRONT + 0.020, sz(10.4))
    boolean(buddy["body"], cut)

    plate = rounded_box("plate", 0.985, 0.10, 0.865, bevel=0.135, segments=10)
    apply_all(plate)
    plate.location = (0, FRONT + 0.030, sz(10.4))
    assign(plate, principled("plate", srgb("#10141f"), roughness=0.12,
                             coat=1.0, coat_rough=0.02))
    # Eyes and smile move onto the plate's face in a lighter tone so they read
    # against it.
    plate_face = FRONT + 0.030 - 0.05
    for k in ("eye_l", "eye_r"):
        buddy[k].location.y = plate_face - 0.004 + 0.045
        assign(buddy[k], principled("eye_on_plate", srgb("#39456b"),
                                    roughness=0.10, coat=1.0, coat_rough=0.02))
    buddy["mouth"].location.y = plate_face - 0.014
    assign(buddy["mouth"], principled("mouth_on_plate", srgb("#39456b"),
                                      roughness=0.12, coat=1.0, coat_rough=0.02))

# --- catchlights ------------------------------------------------------------
HIGH = [(sl(-0.55), sl(1.25), sl(0.30)), (sl(0.35), sl(0.55), sl(0.16))]
LOW = [(sl(0.8), sl(-0.8), sl(0.26)),
       (sl(0.1), sl(-1.5), sl(0.18)),
       (sl(1.2), sl(-1.5), sl(0.13))]
CLUSTER = LOW if V == "C" else HIGH
for k in ("eye_l", "eye_r"):
    sparkles(buddy[k], CLUSTER, spark, flat_front=LENS_FRONT)

# --- pose ------------------------------------------------------------------
buddy["arm_r"].location = (0.98, -0.10, 0.28)
buddy["arm_r"].rotation_euler = (0, math.radians(-24), 0)
buddy["arm_l"].location = (-0.94, -0.10, -0.14)
buddy["arm_l"].rotation_euler = (0, math.radians(8), 0)

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.context.view_layer.objects.active = buddy["body"]
bpy.ops.transform.rotate(value=math.radians(-11), orient_axis='Z',
                         center_override=(0, 0, 0))
bpy.ops.object.select_all(action='DESELECT')

# --- bright neutral set ----------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -1.11))
floor = bpy.context.object
floor.name = "floor"
assign(floor, principled("floor", srgb("#e9eaee"), roughness=0.34, coat=0.0))
backdrop(width=34, height=20, y=8.0, top=srgb("#f4f5f7"),
         bottom=srgb("#d7dae1"), strength=1.5)
world_gradient(top=srgb("#dfe3ea"), bottom=srgb("#c9ced8"), strength=0.6)
studio()

DIST = 8.2
ang = math.radians(13)
cam = add_camera(location=(math.sin(ang) * DIST, -math.cos(ang) * DIST, 0.42),
                 look_at=(0, 0, -0.10), lens=110, fstop=6.0)
cam.data.sensor_fit = 'HORIZONTAL'

grade(glare_kw={"threshold": 1.4, "size": 0.20, "strength": 0.18},
      saturation=1.16, contrast=0.6)

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(f"[render] wrote {OUT}")
