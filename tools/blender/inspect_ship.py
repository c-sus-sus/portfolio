"""
Inspect the re-authored CB2: print every mesh's world bounds (Blender axes: X right, Y aft, Z up)
and write quick Workbench renders (side / rear / top / three-quarter) with red markers at the
thruster anchors, so the engine nozzles can be identified by eye.

    blender -b --python tools/blender/inspect_ship.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.path.join(ROOT, "tools", "blender", "out")
BLEND = os.path.join(OUT_DIR, "spaceship_cb2_fixed.blend")


def bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def main():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    print("[inspect] name | size (x,y,z) | centre | y range (aft is +Y)")
    for o in sorted(meshes, key=lambda m: -bbox(m)[1].y):
        lo, hi = bbox(o)
        size = hi - lo
        c = (lo + hi) / 2
        print(f"[inspect] {o.name:32s} size=({size.x:6.2f},{size.y:6.2f},{size.z:6.2f}) centre=({c.x:6.2f},{c.y:6.2f},{c.z:6.2f}) y=[{lo.y:6.2f},{hi.y:6.2f}]")
    for o in scene.objects:
        if o.type == "EMPTY":
            print(f"[inspect] empty {o.name} at {tuple(round(v, 2) for v in o.matrix_world.translation)} scale {round(o.scale.x, 3)}")
    sys.stdout.flush()

    # Red marker spheres at the anchors (empties do not render).
    marker_mat = bpy.data.materials.new("Marker")
    marker_mat.diffuse_color = (1.0, 0.05, 0.05, 1.0)
    for o in list(scene.objects):
        if o.type != "EMPTY":
            continue
        bpy.ops.mesh.primitive_uv_sphere_add(radius=max(0.6, o.scale.x), location=o.matrix_world.translation)
        m = bpy.context.active_object
        m.name = f"Marker_{o.name}"
        m.data.materials.append(marker_mat)

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Grey")
    world.color = (0.18, 0.18, 0.2)
    scene.world = world

    cam_data = bpy.data.cameras.new("InspectCam")
    cam = bpy.data.objects.new("InspectCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        "side": ((90.0, 0.0, 0.0), (math.radians(90), 0.0, math.radians(90)), "ORTHO", 62),
        "rear": ((0.0, 90.0, 0.0), (math.radians(90), 0.0, math.radians(180)), "ORTHO", 56),
        "top": ((0.0, 0.0, 90.0), (0.0, 0.0, 0.0), "ORTHO", 62),
        "front34": ((55.0, -70.0, 32.0), None, "PERSP", 40),
    }
    for name, (loc, rot, kind, scale) in views.items():
        cam.location = loc
        cam_data.type = kind
        if kind == "ORTHO":
            cam_data.ortho_scale = scale
            cam.rotation_euler = rot
        else:
            cam_data.lens = scale
            direction = Vector((0.0, 0.0, 0.0)) - Vector(loc)
            cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUT_DIR, f"inspect_{name}.png")
        bpy.ops.render.render(write_still=True)
        print("[inspect] wrote", scene.render.filepath)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
