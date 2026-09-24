"""
Shared Blender library for the YouCoded mascot 3D renders.

The character is rebuilt from the canonical 2D artwork
(youcoded/desktop/welcome-mascot.svg) at 1 Blender unit = 10 SVG units,
so every proportion below traces back to a number in that file. The SVG's
24x24 viewBox has +y pointing DOWN, Blender has +z pointing UP, hence the
`svg_z()` flip. Body centre (SVG 12,10) is the world origin.

WHY a library: every theme render shares the same rig and only swaps
materials, lighting and pose, so a proportion fix lands in one place.
"""

import math
import bpy
from mathutils import Vector

# --- SVG -> Blender coordinate helpers ------------------------------------
S = 0.1                      # 1 SVG unit = 0.1 Blender units
CX, CY = 12.0, 10.0          # SVG coords of the body centre


def sx(v):   return (v - CX) * S          # SVG x  -> Blender x
def sz(v):   return (CY - v) * S          # SVG y  -> Blender z (flipped)
def sl(v):   return v * S                 # SVG length -> Blender length


# --- geometry helpers ------------------------------------------------------
def apply_all(obj):
    """Bake every modifier into the mesh. WHY: a boolean applied while a bevel
    is still pending gets applied to the RAW cube (Blender only respects stack
    order for the first modifier), so the eye sockets end up cut in the wrong
    place. Always flatten the bevel before cutting."""
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return obj


def rounded_box(name, dx, dy, dz, bevel, segments=14, collection=None):
    """A box of the given dimensions with a heavy bevel — the mascot's
    signature squircle silhouette. Built by editing vertex coordinates rather
    than object scale so the bevel width stays uniform on all three axes."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)

    hx, hy, hz = dx / 2, dy / 2, dz / 2
    verts = [(x * hx, y * hy, z * hz)
             for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
             (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    b = obj.modifiers.new("bevel", 'BEVEL')
    b.width = bevel
    b.segments = segments
    b.limit_method = 'NONE'
    b.harden_normals = False
    obj.data.shade_smooth()
    return obj


def ellipsoid(name, dx, dy, dz, collection=None, segs=64, rings=32):
    """A smooth ellipsoid — used for the eye lenses."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0)
    obj = bpy.context.object
    obj.name = name
    for v in obj.data.vertices:
        v.co = Vector((v.co.x * dx / 2, v.co.y * dy / 2, v.co.z * dz / 2))
    obj.data.shade_smooth()
    if collection:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        collection.objects.link(obj)
    return obj



def elliptic_prism(name, dx, dz, depth, bevel=0.012, verts=96):
    """A flat-fronted elliptical slug: the eye shape from the artwork given
    thickness. WHY not a sphere: a domed, glossy black eye reads as a wet
    organic eyeball. The 2D buddy's eyes are flat dark holes, and flat is what
    keeps it a friendly object instead of a creature."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=1.0, depth=1.0)
    obj = bpy.context.object
    obj.name = name
    for v in obj.data.vertices:
        x, y, z = v.co
        # NOTE the minus. Swapping two axes MIRRORS the mesh, which inverts
        # every normal; an inside-out cutter makes a DIFFERENCE boolean do
        # nothing at all (measured: the eye sockets never got cut, so the
        # lenses stayed buried inside the body and the face rendered blank).
        # Negating one of the swapped axes restores the winding.
        v.co = Vector((x * dx / 2, -z * depth, y * dz / 2))
    if bevel:
        b = obj.modifiers.new("bevel", 'BEVEL')
        b.width = bevel
        b.segments = 6
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(30)
    # Angle-limited smoothing: the elliptical rim shades smooth while the flat
    # front stays flat. A plain shade_smooth() would round the whole slug off.
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    except AttributeError:
        obj.data.shade_smooth()
    return obj


def boolean(target, cutter, op='DIFFERENCE', apply=True):
    m = target.modifiers.new("bool", 'BOOLEAN')
    m.operation = op
    m.object = cutter
    m.solver = 'EXACT'
    if apply:
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    return target


# --- material helpers ------------------------------------------------------
def _set(node, key, value):
    """Set a Principled input by name, tolerating socket renames across
    Blender versions (Coat/Clearcoat, Emission/Emission Color, ...)."""
    for k in (key,) if isinstance(key, str) else key:
        if k in node.inputs:
            node.inputs[k].default_value = value
            return True
    return False


def principled(name, base, roughness=0.3, metallic=0.0, coat=0.0,
               coat_rough=0.05, emission=None, emission_strength=0.0,
               ior=1.5, subsurface=0.0, sheen=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, "Base Color", base)
    _set(bsdf, "Roughness", roughness)
    _set(bsdf, "Metallic", metallic)
    _set(bsdf, "IOR", ior)
    _set(bsdf, ("Coat Weight", "Clearcoat"), coat)
    _set(bsdf, ("Coat Roughness", "Clearcoat Roughness"), coat_rough)
    _set(bsdf, ("Subsurface Weight", "Subsurface"), subsurface)
    _set(bsdf, ("Sheen Weight", "Sheen"), sheen)
    if emission:
        _set(bsdf, ("Emission Color", "Emission"), emission)
        _set(bsdf, "Emission Strength", emission_strength)
    return mat


def emissive(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = color
    em.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return mat


def micro_bump(mat, scale=340.0, strength=0.06):
    """Barely-there surface noise. WHY: a perfectly smooth plastic highlight
    reads as CG; a trace of orange-peel is what sells 'moulded object'."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 4.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# --- the character ---------------------------------------------------------
class Buddy:
    """Holds every part so poses and per-theme tweaks can address them."""

    def __init__(self):
        self.parts = {}

    def add(self, name, obj):
        self.parts[name] = obj
        return obj

    def __getitem__(self, k):
        return self.parts[k]

    @property
    def all(self):
        return list(self.parts.values())


def build_buddy(eye_gap=0.0, socket_depth=0.055, eye_scale=1.0,
                mouth_scale=1.0, body_depth=1.02, body_bevel=0.38):
    """Build the default buddy at the origin.

    Proportions (SVG -> Blender):
      body   x 5..19  y 4..16   r4     -> 1.40 x 1.20, bevel 0.40
      eyes   rx1.6 ry2.2 at (9.3,9.55) and (14.7,9.25)
      mouth  half-disc w2.4 h1.0 at (12,13.3)
      arms   3x4 r0.8 at x 2.5 / 21.5
      legs   3.5x4 r1.2 at x 8.95 / 15.05, y 17..21
    """
    b = Buddy()

    # --- body: a squircle slab, deeper than it is thick in the artwork so it
    # reads as an object rather than a sticker.
    body = rounded_box("body", sl(14), body_depth, sl(12),
                       bevel=body_bevel, segments=20)
    apply_all(body)
    b.add("body", body)

    # --- eyes: a shallow flat recess with a flat lens set into it.
    #
    # WHY flat and shallow: the first hero render used a DEEP ellipsoid cutter
    # and a DOMED lens. The cutter reached past the flat front panel into the
    # rounded edge and carved a trough across the whole face; the dome turned
    # the lenses into wet black eyeballs. Together they read as a skull.
    #
    # Depth bookkeeping, since getting this wrong hides the eyes entirely:
    # the camera looks down -y, so the body's front surface is at
    # front = -body_depth/2 and SMALLER (more negative) y is CLOSER to camera.
    # A lens whose front face lands even a few thousandths behind `front`
    # disappears inside the body.
    eyes = [("eye_l", sx(9.3), sz(9.55)), ("eye_r", sx(14.7), sz(9.25))]
    ew, eh = sl(1.6) * 2 * eye_scale, sl(2.2) * 2 * eye_scale
    front = -body_depth / 2
    lens_half = 0.045
    for name, ex, ez in eyes:
        ex = ex * (1.0 + eye_gap)
        if socket_depth > 0:
            # Cutter spans from just proud of the surface to socket_depth in.
            cutter = elliptic_prism(name + "_cut", ew + 0.016, eh + 0.016,
                                    socket_depth + 0.04, bevel=0.005)
            cutter.location = (ex, front + socket_depth - 0.02, ez)
            boolean(body, cutter)
            face_y = front + socket_depth * 0.45      # sits inside the recess
        else:
            face_y = front - 0.003                    # flush, a hair proud

        lens = elliptic_prism(name, ew, eh, lens_half * 2, bevel=0.010)
        lens.location = (ex, face_y + lens_half, ez)
        b.add(name, lens)

    # --- mouth: flat-topped half-disc, slightly proud of the face.
    # The cylinder's axis is +Z, so the rotation is baked into the VERTEX
    # coordinates (mesh z -> world y). Passing rotation= to the operator only
    # rotates the OBJECT, which left the later per-axis scale acting on the
    # wrong axes and produced a rectangular bar instead of a smile.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=1.0)
    mouth = bpy.context.object
    mouth.name = "mouth"
    mrx, mrz, mth = sl(1.2) * mouth_scale, sl(1.0) * mouth_scale, 0.13
    for v in mouth.data.vertices:
        x, y, z = v.co
        v.co = Vector((x * mrx, -z * mth, y * mrz))   # see elliptic_prism
    mouth.data.shade_smooth()
    trim = rounded_box("mouth_trim", 1.0, 1.0, 1.0, 0.001, 2)
    apply_all(trim)
    trim.location = (0, 0, 0.5)
    boolean(mouth, trim)
    mouth.location = (sx(12), -body_depth / 2 - 0.01, sz(13.35))
    mouth.rotation_euler = (0, math.radians(-2), 0)
    b.add("mouth", mouth)

    # --- limbs: detached capsules that float beside the body.
    arm_l = rounded_box("arm_l", sl(3), 0.30, sl(4), bevel=0.085, segments=12)
    arm_l.location = (sx(2.5), 0.0, sz(11.0))
    b.add("arm_l", arm_l)

    arm_r = rounded_box("arm_r", sl(3), 0.30, sl(4), bevel=0.085, segments=12)
    arm_r.location = (sx(21.5), 0.0, sz(11.0))
    b.add("arm_r", arm_r)

    leg_l = rounded_box("leg_l", sl(3.5), 0.34, sl(4), bevel=0.12, segments=12)
    leg_l.location = (sx(8.95), 0.0, sz(19.0))
    b.add("leg_l", leg_l)

    leg_r = rounded_box("leg_r", sl(3.5), 0.34, sl(4), bevel=0.12, segments=12)
    leg_r.location = (sx(15.05), 0.0, sz(19.0))
    b.add("leg_r", leg_r)

    return b


def sparkles(parent_eye, spec, mat, semi=None, flat_front=None):
    """Tiny emissive beads sitting ON the eye's front surface — the 2D
    artwork's sparkle cluster, promoted to real light sources so they bloom in
    the glare pass.

    WHY the ellipsoid maths: a fixed depth offset buries the beads inside the
    (opaque) lens for any sparkle that is off-centre, which is why they were
    invisible in the first passes. Solve the ellipsoid for y at each bead's
    (x, z) instead, then park the bead just proud of that point."""
    a, b, c = semi or (0.19, 0.21, 0.26)
    out = []
    for i, (ox, oz, r) in enumerate(spec):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r)
        s = bpy.context.object
        s.name = f"{parent_eye.name}_sparkle{i}"
        s.data.shade_smooth()
        if flat_front is not None:
            surface_y = flat_front          # flat lens: one plane, no solve
        else:
            k = max(0.0, 1.0 - (ox / a) ** 2 - (oz / c) ** 2)
            surface_y = -b * math.sqrt(k)
        s.location = (parent_eye.location.x + ox,
                      parent_eye.location.y + surface_y - r * 0.35,
                      parent_eye.location.z + oz)
        assign(s, mat)
        out.append(s)
    return out


# --- scene plumbing --------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def use_gpu(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    chosen = None
    for backend in ('HIP', 'OPTIX', 'CUDA', 'ONEAPI', 'METAL'):
        try:
            devices = prefs.get_devices_for_type(backend)
        except Exception:
            devices = []
        if devices:
            chosen = backend
            break
    if not chosen:
        print("[render] no GPU backend found — falling back to CPU")
        scene.cycles.device = 'CPU'
        return False
    prefs.compute_device_type = chosen
    prefs.get_devices()
    for d in prefs.devices:
        d.use = (d.type == chosen)
    scene.cycles.device = 'GPU'
    print(f"[render] GPU backend {chosen}: "
          f"{[d.name for d in prefs.devices if d.use]}")
    return True


def setup_render(res_x, res_y, samples, denoise=True, fstop=None,
                 focus=None, transparent=False):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    use_gpu(scene)
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.006
    scene.cycles.use_denoising = denoise
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 12
    scene.cycles.caustics_reflective = True
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Punchy'
    except TypeError:
        try:
            scene.view_settings.look = 'Punchy'
        except TypeError:
            pass
    return scene


def add_camera(location, look_at=(0, 0, 0), lens=85.0, fstop=2.4,
               focus_distance=None):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(look_at) - Vector(location)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = fstop
    cam_data.dof.focus_distance = focus_distance or direction.length
    cam_data.dof.aperture_blades = 7
    bpy.context.scene.camera = cam
    return cam


def area_light(name, location, look_at, energy, color=(1, 1, 1),
               size=2.0, size_y=None, spread=math.radians(120)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'RECTANGLE' if size_y else 'SQUARE'
    data.size = size
    if size_y:
        data.size_y = size_y
    data.spread = spread
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    d = Vector(look_at) - Vector(location)
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return obj


def world_gradient(top, bottom, strength=1.0):
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = bottom
    ramp.color_ramp.elements[1].color = top
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = 'EASING'
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[1] = math.radians(-90)
    texco = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(texco.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    return world


def glare(threshold=1.0, size=0.35, strength=0.5, kind='Bloom'):
    """Compositor bloom. WHY: emissive eyes and rim lights only read as
    *bright* once they bleed; without it the render looks flat.

    Blender 5.x replaced the per-scene compositor tree with a node GROUP
    (Group Input -> ... -> Group Output), and the Glare node's settings moved
    from properties onto sockets — hence the shape of this function.
    """
    scene = bpy.context.scene
    ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out='INPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    # The render result reaches the group through an explicit Render Layers
    # node; wiring the Group Input instead renders pure white.
    gi = ng.nodes.new("CompositorNodeRLayers")
    gi.scene = scene
    go = ng.nodes.new("NodeGroupOutput")
    g = ng.nodes.new("CompositorNodeGlare")
    g.inputs["Type"].default_value = kind
    g.inputs["Quality"].default_value = 'High'
    g.inputs["Threshold"].default_value = threshold
    g.inputs["Size"].default_value = size
    g.inputs["Strength"].default_value = strength
    ng.links.new(gi.outputs["Image"], g.inputs["Image"])
    ng.links.new(g.outputs["Image"], go.inputs[0])
    scene.compositing_node_group = ng
    return g


def edge_wear(mat, wear_color=(1, 1, 1, 1), amount=0.35, rough_add=0.25,
              contrast=3.0):
    """Lighten and roughen the convex edges. WHY: on a real moulded part the
    edges are the first thing to scuff and the first thing to catch light, and
    that single cue does more for 'this is a physical object' than any amount
    of extra polygons. Driven by Cycles' geometry Pointiness."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[1].position = 0.5 + 0.5 / contrast
    nt.links.new(geo.outputs["Pointiness"], ramp.inputs["Fac"])

    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = 'MULTIPLY'
    fac.inputs[1].default_value = amount
    nt.links.new(ramp.outputs["Color"], fac.inputs[0])

    base_link = bsdf.inputs["Base Color"].default_value[:]
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = 'RGBA'
    mix.inputs["A"].default_value = base_link
    mix.inputs["B"].default_value = wear_color
    nt.links.new(fac.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    r = nt.nodes.new("ShaderNodeMath")
    r.operation = 'ADD'
    r.inputs[1].default_value = bsdf.inputs["Roughness"].default_value
    rm = nt.nodes.new("ShaderNodeMath")
    rm.operation = 'MULTIPLY'
    rm.inputs[1].default_value = rough_add
    nt.links.new(ramp.outputs["Color"], rm.inputs[0])
    nt.links.new(rm.outputs[0], r.inputs[0])
    nt.links.new(r.outputs[0], bsdf.inputs["Roughness"])
    return mat


def rough_variation(mat, scale=6.0, low=0.18, high=0.42):
    """Large-scale roughness breakup — smudge/handling variation. Real plastic
    is never one roughness value across a whole panel."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if bsdf.inputs["Roughness"].is_linked:
        return mat
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 3.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (low, low, low, 1)
    ramp.color_ramp.elements[1].color = (high, high, high, 1)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    return mat


def backdrop(width=26.0, height=16.0, y=7.0, top=(0.02, 0.03, 0.06, 1),
             bottom=(0.005, 0.006, 0.012, 1), strength=1.6):
    """A lit studio wall behind the subject. WHY: an empty black background
    gives the silhouette nothing to separate against; a soft vertical falloff
    reads as depth and is what every product hero sits in front of."""
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.object
    obj.name = "backdrop"
    obj.scale = (width, height, 1)
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location = (0, y, height / 2 - 2.0)

    mat = bpy.data.materials.new("backdrop")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = bottom
    ramp.color_ramp.elements[1].color = top
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = 'QUADRATIC'
    texco = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(90)
    nt.links.new(texco.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    assign(obj, mat)
    return obj


def grade(glare_kw=None, saturation=1.0, contrast=0.0, dispersion=0.0,
          grain=0.0, vignette=0.0):
    """Full post chain: bloom -> saturation -> S-curve -> lens dispersion.

    WHY saturation: AgX (the default view transform) deliberately desaturates
    as values climb, which turns the brand amber into beige. Pushing chroma
    back in post is the standard fix — grading the lights instead just blows
    the highlights out."""
    scene = bpy.context.scene
    ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    go = ng.nodes.new("NodeGroupOutput")
    rl = ng.nodes.new("CompositorNodeRLayers")
    rl.scene = scene
    cur = rl.outputs["Image"]

    if glare_kw:
        g = ng.nodes.new("CompositorNodeGlare")
        g.inputs["Type"].default_value = glare_kw.get("kind", "Bloom")
        g.inputs["Quality"].default_value = 'High'
        g.inputs["Threshold"].default_value = glare_kw.get("threshold", 1.0)
        g.inputs["Size"].default_value = glare_kw.get("size", 0.3)
        g.inputs["Strength"].default_value = glare_kw.get("strength", 0.5)
        ng.links.new(cur, g.inputs["Image"])
        cur = g.outputs["Image"]

    if saturation != 1.0:
        hs = ng.nodes.new("CompositorNodeHueSat")
        hs.inputs["Saturation"].default_value = saturation
        ng.links.new(cur, hs.inputs["Image"])
        cur = hs.outputs["Image"]

    if contrast:
        c = ng.nodes.new("CompositorNodeBrightContrast")
        c.inputs["Contrast"].default_value = contrast
        ng.links.new(cur, c.inputs["Image"])
        cur = c.outputs["Image"]

    if dispersion:
        ld = ng.nodes.new("CompositorNodeLensdist")
        for key in ("Dispersion", "Distortion"):
            if key in ld.inputs:
                ld.inputs[key].default_value = dispersion if key == "Dispersion" else 0.0
        ng.links.new(cur, ld.inputs["Image"])
        cur = ld.outputs["Image"]

    ng.links.new(cur, go.inputs[0])
    scene.compositing_node_group = ng
    return ng


def srgb(hexstr):
    """sRGB hex -> linear RGBA. WHY: Blender colour inputs are linear, so
    pasting a brand hex straight in renders it washed out."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def haze(size=26.0, density=0.0035, anisotropy=0.35, color=(0.55, 0.7, 1.0, 1)):
    """A box of thin fog around the set. WHY: rim lights only turn into visible
    beams when there is something in the air for them to catch — it is the
    single cheapest thing that separates 'a model on black' from 'a shot'."""
    bpy.ops.mesh.primitive_cube_add(size=size)
    obj = bpy.context.object
    obj.name = "haze"
    mat = bpy.data.materials.new("haze")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vs = nt.nodes.new("ShaderNodeVolumeScatter")
    vs.inputs["Color"].default_value = color
    vs.inputs["Density"].default_value = density
    vs.inputs["Anisotropy"].default_value = anisotropy
    nt.links.new(vs.outputs[0], out.inputs["Volume"])
    assign(obj, mat)
    obj.visible_shadow = False
    return obj


def studio(key=520, fill=140, rim=260, top=300, warmth=1.0, ground=1.0):
    """Bright, neutral product lighting: big soft key front-left, a broad fill
    front-right that keeps the shadow side readable, a soft top light for the
    long specular streak along the shoulder, and a modest back rim for
    separation. WHY this rig: it is what an object looks like on a table in a
    showroom, and none of it carves the face into shadow."""
    lights = {}
    lights["key"] = area_light("key", (-3.0, -3.4, 2.6), (0, 0, 0.0),
                               energy=key, color=(1.0, 0.98, 0.96),
                               size=5.5)
    lights["fill"] = area_light("fill", (3.4, -3.2, 0.6), (0, 0, -0.05),
                                energy=fill, color=(0.96, 0.98, 1.0),
                                size=6.0)
    lights["top"] = area_light("top", (-0.4, -0.6, 4.2), (0, 0, 0.3),
                               energy=top, color=(1.0, 0.99, 0.97),
                               size=4.0)
    lights["rim"] = area_light("rim", (2.2, 3.6, 1.6), (0.3, 0, 0.1),
                               energy=rim, color=(0.90, 0.95, 1.0),
                               size=1.8)
    lights["bounce"] = area_light("bounce", (0.0, -2.2, -2.4), (0, 0, -0.4),
                                  energy=90 * ground, color=(1.0, 0.97, 0.93),
                                  size=7.0)
    return lights
