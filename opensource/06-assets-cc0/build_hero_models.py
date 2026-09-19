"""Builds the two hero models procedurally, matching the reference images:
1. fishboat.glb  - plump vintage steam trawler (cream hull, dark chimney + mast)
2. lamp-buoy.glb - floating light buoy (tapered base, lattice cage tower, warm lantern)
Run:  blender --background --python build_hero_models.py
Outputs: fishboat.glb, lamp-buoy.glb, hero.blend, hero_preview.png in this folder.
"""
import bpy, os, math
from mathutils import Vector

BASE = os.path.dirname(os.path.abspath(__file__))

# wipe default scene FIRST (it deletes all data, incl. materials)
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- palette (LOCKED, REQUIREMENTS.md §2 - NO RED) ----------
CREAM   = (0.93, 0.89, 0.80, 1.0)   # hull / buoy body
CREAM_D = (0.84, 0.79, 0.68, 1.0)   # float collar / shading
CHARCOAL= (0.16, 0.20, 0.26, 1.0)   # chimney, tower metal, trim
DECK    = (0.87, 0.80, 0.66, 1.0)   # deck planking
GLASSD  = (0.22, 0.30, 0.34, 1.0)   # dark window glass
WARM    = (1.00, 0.85, 0.50, 1.0)   # lantern glow (emissive)

def mat(name, color, emission=None, estr=0.0, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    if emission:
        b.inputs["Emission Color"].default_value = emission
        b.inputs["Emission Strength"].default_value = estr
    return m

M_CREAM  = mat("Cream", CREAM)
M_CREAMD = mat("CreamDark", CREAM_D)
M_CHAR   = mat("Charcoal", CHARCOAL, rough=0.6)
M_DECK   = mat("Deck", DECK)
M_GLASS  = mat("GlassDark", GLASSD, rough=0.3)
M_WARM   = mat("LanternGlow", WARM, emission=WARM, estr=4.0)

def assign(obj, m):
    obj.data.materials.append(m)

def bevel(obj, w=0.12, seg=2):
    mod = obj.modifiers.new("soft", 'BEVEL'); mod.width = w; mod.segments = seg

def box(name, loc, scale, m, bev=0.12):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object; o.name = name
    o.scale = (scale[0]/2, scale[1]/2, scale[2]/2)
    bpy.ops.object.transform_apply(scale=True)
    if bev: bevel(o, bev)
    assign(o, m); return o

def cyl(name, loc, r, h, m, bev=0.06, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    o = bpy.context.active_object; o.name = name
    if bev: bevel(o, bev)
    assign(o, m); return o

def cone(name, loc, r1, r2, h, m, bev=0.05, verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc)
    o = bpy.context.active_object; o.name = name
    if bev: bevel(o, bev)
    assign(o, m); return o

def torus(name, loc, R, r, m):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=20, minor_segments=8, location=loc)
    o = bpy.context.active_object; o.name = name
    assign(o, m); return o

def beam(name, p1, p2, r, m):
    """cylinder between two points"""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    o = cyl(name, (p1+p2)/2, r, d.length, m, bev=0.0, verts=8)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return o

def new_collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

def move_to_collection(objs, coll):
    for o in objs:
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)

# ============================================================
# 1) FISHBOAT - plump steam trawler
# ============================================================
fish_parts = []

# --- hull: lofted rings (fat belly, tapered bow) ---
# (x, half_width, deck_z, keel_z)
SECTIONS = [
    (-3.2, 0.85, 1.05, -0.10),   # stern
    (-2.2, 1.25, 1.15, -0.50),
    ( 0.0, 1.40, 1.15, -0.65),   # mid (fat!)
    ( 1.9, 1.20, 1.10, -0.45),
    ( 3.2, 0.30, 0.90, -0.05),   # bow tip
]
ring_pts = []
for (x, hw, dz, kz) in SECTIONS:
    mid = (dz + kz) / 2
    ring = [
        (x, -hw,        dz),
        (x, -hw*1.06,   mid),
        (x, -hw*0.35,   kz),
        (x,  hw*0.35,   kz),
        (x,  hw*1.06,   mid),
        (x,  hw,        dz),
    ]
    ring_pts.append(ring)

verts = [p for ring in ring_pts for p in ring]
faces = []
N = 6
for r in range(len(ring_pts) - 1):
    for i in range(N):
        a = r*N + i; b = r*N + (i+1) % N
        c = (r+1)*N + (i+1) % N; d = (r+1)*N + i
        faces.append((a, b, c, d))
faces.append(tuple(range(N-1, -1, -1)))                            # stern cap
faces.append(tuple((len(ring_pts)-1)*N + i for i in range(N)))     # bow cap

mesh = bpy.data.meshes.new("HullMesh")
mesh.from_pydata(verts, [], faces); mesh.update()
hull = bpy.data.objects.new("Hull", mesh)
bpy.context.scene.collection.objects.link(hull)
assign(hull, M_CREAM); bevel(hull, 0.15, 3)
fish_parts.append(hull)

# --- deck ---
fish_parts.append(box("Deck", (-0.1, 0, 1.12), (5.6, 2.35, 0.16), M_DECK, 0.06))
# --- gunwale trim (dark line around deck edge) ---
fish_parts.append(box("Trim", (-0.1, 0, 1.16), (5.75, 2.5, 0.10), M_CHAR, 0.05))
# --- wheelhouse (front third): cream cabin, dark roof, windows ---
fish_parts.append(box("Wheelhouse", (1.15, 0, 1.95), (1.9, 1.7, 1.5), M_CREAM, 0.10))
fish_parts.append(box("WHRoof", (1.15, 0, 2.78), (2.15, 1.95, 0.22), M_CHAR, 0.08))
for dy in (-0.86, 0.86):  # side windows
    for dx in (0.75, 1.15, 1.55):
        fish_parts.append(box("Window", (dx, dy, 2.25), (0.32, 0.02, 0.42), M_GLASS, 0.0))
fish_parts.append(box("WindowFront", (2.11, 0, 2.25), (0.02, 1.2, 0.42), M_GLASS, 0.0))
# --- chimney (tall, charcoal, cream band) behind wheelhouse ---
fish_parts.append(cyl("Chimney", (-0.35, 0, 2.6), 0.42, 2.4, M_CHAR, bev=0.08))
fish_parts.append(cyl("ChimneyBand", (-0.35, 0, 3.45), 0.46, 0.28, M_CREAM, bev=0.05))
fish_parts.append(cyl("ChimneyCap", (-0.35, 0, 3.85), 0.5, 0.18, M_CHAR, bev=0.05))
# --- mast at bow + boom ---
fish_parts.append(cyl("Mast", (2.55, 0, 2.9), 0.09, 3.4, M_CHAR, bev=0.02, verts=10))
fish_parts.append(beam("Boom", (2.55, 0, 3.9), (0.9, 0, 2.6), 0.06, M_CHAR))
# --- stern mast (short) ---
fish_parts.append(cyl("MastStern", (-2.6, 0, 2.2), 0.08, 2.0, M_CHAR, bev=0.02, verts=10))
# --- portholes ---
for i, px in enumerate((-1.6, -0.9, -0.2)):
    for py in (-1.28, 1.28):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.16, depth=0.06,
            location=(px, py, 0.75), rotation=(math.pi/2, 0, 0))
        p = bpy.context.active_object; p.name = f"Porthole{i}"
        assign(p, M_GLASS); fish_parts.append(p)

fish_coll = new_collection("Fishboat")
move_to_collection(fish_parts, fish_coll)

# ============================================================
# 2) LAMP BUOY - floating light buoy with lattice tower
# ============================================================
lamp_parts = []
LX = 12.0  # place beside the fishboat for preview

def L(loc): return (loc[0] + LX, loc[1], loc[2])

# --- tapered buoy body + float collar ---
lamp_parts.append(cone("BuoyBody", L((0, 0, 0.55)), 1.15, 0.78, 1.3, M_CREAM, bev=0.10))
lamp_parts.append(torus("FloatCollar", L((0, 0, 0.25)), 1.02, 0.30, M_CREAMD))
lamp_parts.append(cyl("TopDeck", L((0, 0, 1.25)), 0.82, 0.12, M_CHAR, bev=0.04))
# --- lattice tower: 4 posts converging + X braces ---
POST_BOT = [( 0.62,  0.62, 1.3), (-0.62,  0.62, 1.3), (-0.62, -0.62, 1.3), ( 0.62, -0.62, 1.3)]
POST_TOP = [( 0.26,  0.26, 4.0), (-0.26,  0.26, 4.0), (-0.26, -0.26, 4.0), ( 0.26, -0.26, 4.0)]
for i in range(4):
    lamp_parts.append(beam(f"Post{i}", L(POST_BOT[i]), L(POST_TOP[i]), 0.07, M_CHAR))
    j = (i + 1) % 4
    # X braces between adjacent posts (two heights)
    mid_bot = [(POST_BOT[i][k] + POST_BOT[j][k]) / 2 for k in range(3)]
    mid_top = [(POST_TOP[i][k] + POST_TOP[j][k]) / 2 for k in range(3)]
    zA = [mid_bot[0], mid_bot[1], 1.9]; zB = [mid_top[0]*0.55, mid_top[1]*0.55, 3.3]
    zC = [mid_bot[0]*0.9, mid_bot[1]*0.9, 3.3]; zD = [mid_top[0]*0.7, mid_top[1]*0.7, 1.9]
    lamp_parts.append(beam(f"BraceA{i}", L(zA), L(zB), 0.045, M_CHAR))
    lamp_parts.append(beam(f"BraceB{i}", L(zC), L(zD), 0.045, M_CHAR))
# --- mid platform ring ---
lamp_parts.append(cyl("MidRing", L((0, 0, 2.6)), 0.52, 0.08, M_CHAR, bev=0.02))
# --- lamp room: warm glass + dark frame + conical cap + finial ---
lamp_parts.append(cyl("LampGlass", L((0, 0, 4.35)), 0.34, 0.62, M_WARM, bev=0.03))
lamp_parts.append(cyl("LampBase", L((0, 0, 4.02)), 0.40, 0.12, M_CHAR, bev=0.03))
lamp_parts.append(cone("LampCap", L((0, 0, 4.85)), 0.48, 0.06, 0.42, M_CHAR, bev=0.03))
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, radius=0.09, location=L((0, 0, 5.12)))
fin = bpy.context.active_object; fin.name = "Finial"; assign(fin, M_CHAR)
lamp_parts.append(fin)

lamp_coll = new_collection("LampBuoy")
move_to_collection(lamp_parts, lamp_coll)

# ============================================================
# 3) export GLBs
# ============================================================
def export_coll(coll, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                              use_selection=True, export_apply=True)
    print("EXPORTED:", path)

export_coll(fish_coll, os.path.join(BASE, "fishboat.glb"))
export_coll(lamp_coll, os.path.join(BASE, "lamp-buoy.glb"))

# ============================================================
# 4) preview scene + render
# ============================================================
bpy.ops.mesh.primitive_plane_add(size=300, location=(6, 0, -0.6))
pm = mat("WaterTeal", (0.11, 0.56, 0.59, 1.0))
bpy.context.active_object.data.materials.append(pm)
bpy.ops.object.light_add(type='SUN', location=(0, -10, 20))
bpy.context.active_object.rotation_euler = (0.5, 0.15, 0)
w = bpy.data.worlds.new("Mist"); w.color = (0.78, 0.91, 0.93)
bpy.context.scene.world = w
bpy.ops.object.camera_add(location=(6, -22, 4.5))
cam = bpy.context.active_object; cam.rotation_euler = (1.45, 0, 0); cam.data.lens = 32
bpy.context.scene.camera = cam
bpy.context.scene.render.filepath = os.path.join(BASE, "hero_preview.png")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, "hero.blend"))
bpy.ops.render.render(write_still=True)
print("SAVED hero.blend + hero_preview.png")
