"""scene.json -> anchors.json, per CLAUDE.md Section 3.4.

Sample times are every object keyframe time (unioned across all objects)
plus every 0.5 s from 0 to duration_s inclusive. An object does not exist
before its own first keyframe (no anchors emitted for it at those times --
e.g. a slogan that first appears at t=7 has no anchors at t=0..6.5) and
holds at its last keyframe's value after the last keyframe. An object
keyed to scale 0 at a given time is likewise not rendered and gets no
anchors at that time (CLAUDE.md Section 3.3: scale 0 is how an object
vanishes). At each time an object exists and its scale is nonzero, it
contributes its world-space center plus 8 bounding-box corners (4 for
text, since it's a flat quad), using the primitive sizes in
schemas/object_library.json.

Anchors carry an extra "kind": "center"|"corner" field beyond the base
{"id", "object", "t", "p"} -- additive; consumers must ignore unknown
fields.

CLI: python -m checker.anchors --scene screens/corner_90_demo.json --out anchors.json
(note: despite the flag name, this reads a *scene* JSON — screens/*.json are
screen specs, consumed elsewhere.)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

_LIBRARY_PATH = Path(__file__).resolve().parent.parent / "schemas" / "object_library.json"
_SAMPLE_STEP_S = 0.5

_BOX_CORNER_SIGNS = [
    (-1, -1, -1), (1, -1, -1), (-1, 1, -1), (1, 1, -1),
    (-1, -1, 1), (1, -1, 1), (-1, 1, 1), (1, 1, 1),
]


def load_object_library(path: str | Path | None = None) -> dict:
    return json.loads(Path(path or _LIBRARY_PATH).read_text())


def load_scene(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def euler_deg_to_matrix(rot_deg) -> np.ndarray:
    """Rotation matrix for Euler degrees [rx, ry, rz], intrinsic XYZ order
    (matches three.js's default Euler order, R = Rz @ Ry @ Rx on column
    vectors). Only matters for compound rotations; every fixture scene today
    rotates about a single axis, where order is irrelevant."""
    rx, ry, rz = np.radians(np.asarray(rot_deg, dtype=float))
    cx, sx = np.cos(rx), np.sin(rx)
    cy, sy = np.cos(ry), np.sin(ry)
    cz, sz = np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def object_first_time(obj: dict) -> float:
    return min(kf["t"] for kf in obj["keyframes"])


def object_exists_at(obj: dict, t: float, tol: float = 1e-9) -> bool:
    """An object does not exist before its own first keyframe."""
    return t >= object_first_time(obj) - tol


def interpolate_pose(keyframes: list[dict], t: float):
    """Linear interpolation of pos/scale, linear-degrees interpolation of
    rot, between the two keyframes bracketing t. Holds at the last
    keyframe's value for t after it.

    Callers must check object_exists_at(obj, t) first -- t before the
    first keyframe is a caller bug, not a value to interpolate towards.
    """
    kfs = sorted(keyframes, key=lambda k: k["t"])
    if t < kfs[0]["t"] - 1e-9:
        raise ValueError(
            f"t={t} precedes this object's first keyframe ({kfs[0]['t']}); "
            "caller must check object_exists_at() first"
        )
    if t >= kfs[-1]["t"]:
        k = kfs[-1]
        return np.array(k["pos"], float), np.array(k["rot"], float), float(k["scale"])
    k0, k1 = next((a, b) for a, b in zip(kfs, kfs[1:]) if a["t"] <= t <= b["t"])
    span = k1["t"] - k0["t"]
    frac = 0.0 if span < 1e-12 else (t - k0["t"]) / span
    pos = np.array(k0["pos"], float) + frac * (np.array(k1["pos"], float) - np.array(k0["pos"], float))
    rot = np.array(k0["rot"], float) + frac * (np.array(k1["rot"], float) - np.array(k0["rot"], float))
    scale = k0["scale"] + frac * (k1["scale"] - k0["scale"])
    return pos, rot, float(scale)


_IMAGE_ASPECT_CACHE: dict[str, float] = {}


def image_aspect(path: str | Path) -> float:
    """width / height of an image file (a `photo` card's height comes from this when the
    scene doesn't give height_m). Paths are relative to the repo root, e.g. inputs/car.png."""
    key = str(path)
    if key not in _IMAGE_ASPECT_CACHE:
        import cv2  # local import: only photo scenes need it

        img = cv2.imread(key, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"photo object: cannot read image {key!r} to get its aspect ratio (give height_m, or run from the repo root)")
        h, w = img.shape[:2]
        _IMAGE_ASPECT_CACHE[key] = w / h
    return _IMAGE_ASPECT_CACHE[key]


def quad_size_m(obj: dict) -> tuple[float, float]:
    """(width, height) in metres at scale 1 of a flat quad object. `text`: width = 0.6 * height * chars.
    `photo`: a flat textured card, width_m wide; height is height_m if the scene gives it, else
    width_m / the image's aspect ratio (CLAUDE.md Section 7, step 4). Both lie in the local XY plane
    (normal +z), centred on the object's position."""
    if obj["type"] == "text":
        height = float(obj["height_m"])
        return 0.6 * height * len(obj.get("text", "")), height
    if obj["type"] == "photo":
        width = float(obj["width_m"])
        height = float(obj["height_m"]) if obj.get("height_m") is not None else width / image_aspect(obj["image"])
        return width, height
    raise ValueError(f"{obj['type']!r} is not a quad object")


def local_corners(obj: dict, library: dict) -> np.ndarray:
    """8 (or 4, for text and photo cards) local-space corner offsets at scale 1, before
    rotation/scale/translation."""
    otype = obj["type"]
    if otype in ("text", "photo"):
        width, height = quad_size_m(obj)
        hw, hh = width / 2.0, height / 2.0
        return np.array([[-hw, -hh, 0], [hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]])

    spec = library[otype]
    if otype == "can":
        hx = hz = spec["radius_m"]
        hy = spec["height_m"] / 2.0
    elif otype == "box":
        sx, sy, sz = spec["size_m"]
        hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    elif otype in ("sphere", "particles"):
        hx = hy = hz = spec["radius_m"]
    else:
        raise ValueError(f"unknown object type {otype!r}")
    return np.array([[sx_ * hx, sy_ * hy, sz_ * hz] for sx_, sy_, sz_ in _BOX_CORNER_SIGNS])


def sample_times(scene: dict, step: float = _SAMPLE_STEP_S) -> list[float]:
    duration = scene["duration_s"]
    kf_times = {round(float(kf["t"]), 6) for obj in scene["objects"] for kf in obj["keyframes"]}
    n_steps = int(round(duration / step))
    grid_times = {round(i * step, 6) for i in range(n_steps + 1)}
    return sorted(kf_times | grid_times)


def build_anchors(scene: dict, library: dict) -> dict:
    anchors = []
    next_id = 0
    times = sample_times(scene)
    for t in times:
        for obj in scene["objects"]:
            if not object_exists_at(obj, t):
                continue
            pos, rot_deg, scale = interpolate_pose(obj["keyframes"], t)
            if scale <= 0.0:
                continue  # CLAUDE.md Section 3.3: scale 0 -> not rendered, no anchors
            rot_matrix = euler_deg_to_matrix(rot_deg)
            corners_local = local_corners(obj, library)

            anchors.append({"id": next_id, "object": obj["id"], "t": t, "p": [round(float(x), 9) for x in pos], "kind": "center"})
            next_id += 1
            for corner_local in corners_local:
                world = pos + rot_matrix @ (scale * corner_local)
                anchors.append({"id": next_id, "object": obj["id"], "t": t, "p": [round(float(x), 9) for x in world], "kind": "corner"})
                next_id += 1
    return {"times": times, "anchors": anchors}


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="scene.json -> anchors.json")
    parser.add_argument("--scene", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--library", default=None, help="override schemas/object_library.json")
    args = parser.parse_args(argv)

    scene = load_scene(args.scene)
    library = load_object_library(args.library)
    anchors_doc = build_anchors(scene, library)
    Path(args.out).write_text(json.dumps(anchors_doc, indent=2))
    print(f"wrote {len(anchors_doc['anchors'])} anchors across {len(anchors_doc['times'])} times -> {args.out}")


if __name__ == "__main__":
    main()
