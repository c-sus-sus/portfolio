"""
Re-author the CB2 spaceship GLB so it follows the glTF convention the site relies on:
nose along +Z, up along +Y, centred on the origin, with three empties ("thruster_0..2") sitting
at the exhaust bells (left, centre, right). Each empty's uniform scale is the nozzle radius, and the exhaust
leaves along the asset's -Z.

Run headless (Blender 4.x / 5.x):
    blender -b --python tools/blender/fix_ship.py
Output: tools/blender/out/spaceship_cb2_fixed.glb (then optimise with gltf-transform, see README).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SOURCE = os.path.join(ROOT, "spaceship_-_cb2", "scene.gltf")
OUT_DIR = os.path.join(ROOT, "tools", "blender", "out")
OUT = os.path.join(OUT_DIR, "spaceship_cb2_fixed.glb")
# The three exhaust bells at the tail: centre (Cylinder.002) and the two side engines.
NOZZLE_PREFIXES = ("Cylinder.002", "Cylinder.003", "Cylinder.005")


def log(*parts):
    print("[fix_ship]", *parts)
    sys.stdout.flush()


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def world_bbox(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objects:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def flatten(meshes, everything):
    """Detach every mesh from the Sketchfab hierarchy, keeping its world transform, and drop the empties."""
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in everything:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()


def apply_all(meshes):
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()


def main():
    clear_scene()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    imported = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]
    log("imported objects:", len(imported), "meshes:", len(meshes))
    for o in meshes:
        log("  mesh", o.name, "verts", len(o.data.vertices))

    flatten(meshes, imported)
    apply_all(meshes)

    lo, hi = world_bbox(meshes)
    size = hi - lo
    centre = (hi + lo) / 2
    log("bbox before  min", tuple(round(v, 2) for v in lo), "max", tuple(round(v, 2) for v in hi), "size", tuple(round(v, 2) for v in size))

    # Long axis in the ground plane (Blender X/Y; Z is up after the importer's Y-up conversion).
    long_axis = 0 if size.x >= size.y else 1
    nozzles = [o for o in meshes if o.name.startswith(NOZZLE_PREFIXES)]
    if len(nozzles) < 3:
        raise SystemExit(f"expected three exhaust bells, found {[o.name for o in nozzles]}")
    nozzle_centre = Vector((0, 0, 0))
    for o in nozzles:
        nlo, nhi = world_bbox([o])
        nozzle_centre += (nlo + nhi) / 2
    nozzle_centre /= len(nozzles)
    tail_sign = 1 if nozzle_centre[long_axis] > centre[long_axis] else -1
    nose = Vector((0, 0, 0))
    nose[long_axis] = -tail_sign
    log("long axis", "XY"[long_axis], "nozzle centre", tuple(round(v, 2) for v in nozzle_centre), "nose direction", tuple(nose))

    # Rotate about world Z so the nose points along Blender -Y, which the glTF exporter maps to +Z.
    current = math.atan2(nose.y, nose.x)
    target = math.atan2(-1.0, 0.0)
    yaw = target - current
    rot = Matrix.Rotation(yaw, 4, "Z")
    shift = Matrix.Translation(-centre)
    for o in meshes:
        o.matrix_world = rot @ shift @ o.matrix_world
    bpy.context.view_layer.update()
    apply_all(meshes)

    lo, hi = world_bbox(meshes)
    size = hi - lo
    centre = (hi + lo) / 2
    log("bbox after   min", tuple(round(v, 2) for v in lo), "max", tuple(round(v, 2) for v in hi), "centre", tuple(round(v, 3) for v in centre))
    if size.y < size.x or size.y < size.z * 0.9:
        log("WARNING: after rotation the long axis is not Y; check the nozzle detection")

    # Exhaust anchors: the tail is now +Y in Blender (-Z in glTF). Place an empty at each nozzle's
    # rear face, with a uniform scale equal to the nozzle radius so the site can size the plume.
    for index, o in enumerate(sorted(nozzles, key=lambda m: world_bbox([m])[0].x)):
        nlo, nhi = world_bbox([o])
        nsize = nhi - nlo
        ncentre = (nlo + nhi) / 2
        radius = min(nsize.x, nsize.z) * 0.42
        exit_point = Vector((ncentre.x, nhi.y - nsize.y * 0.06, ncentre.z))
        empty = bpy.data.objects.new(f"thruster_{index}", None)
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 1.0
        empty.location = exit_point
        empty.scale = (radius, radius, radius)
        bpy.context.scene.collection.objects.link(empty)
        log(f"thruster_{index}", "at", tuple(round(v, 2) for v in exit_point), "radius", round(radius, 3), "from", o.name)

    # Keep the shared material's emission readable by the site (it reads the emissive map).
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 1.0

    os.makedirs(OUT_DIR, exist_ok=True)
    kwargs = dict(
        filepath=OUT,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    try:
        # No tangents: the exporter's TANGENT data came out corrupt for this mesh and three.js derives
        # tangents per pixel for normal maps anyway.
        bpy.ops.export_scene.gltf(**kwargs, export_image_format="AUTO", export_tangents=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    log("exported", OUT, "bytes", os.path.getsize(OUT))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "spaceship_cb2_fixed.blend"))


if __name__ == "__main__":
    main()
