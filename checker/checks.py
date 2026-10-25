"""Individual checker checks (C1-C5), each returning a report.json entry
per CLAUDE.md Section 3.6: {"check", "status", "value", "limit", "details"}.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from checker import anchors as anchors_mod
from checker import geometry as geo


def compute_c2(assumed_screen: dict, true_screen: dict, anchors_doc: dict, thresholds: dict) -> dict:
    """C2 reprojection error, per CLAUDE.md Section 6 step 3.

    For each anchor P: intersect the ray (assumed eye -> P) with the
    assumed panels to get (panel, u, v); remap (panel, u, v) onto the TRUE
    panel to get Q; the error is the angle between the rays (true eye -> Q)
    and (true eye -> P).

    That angle is a pure 3D quantity between two rays sharing the same
    origin (the true eye) -- it does not depend on ref_camera's FOV or
    resolution, so this computes it directly rather than projecting to
    ref_camera pixels and converting a pixel distance back to degrees
    (which would be an approximation, exact only on the optical axis).
    This is the metric PASS/FAIL is decided on.

    Each detail also carries px_dist: the pixel distance between Q and P
    projected into ref_camera, for display only. It is informational (lets
    a viewer see "how many pixels off" on an actual image) and must never
    factor into status.

    Anchors whose ray never hits any assumed panel are excluded from the
    C2 statistics and counted in n_offscreen -- that is a C4 concern, not
    a C2 one, per CLAUDE.md Section 6 step 3.
    """
    assumed_eye = assumed_screen["eye"]
    true_eye = true_screen["eye"]
    assumed_panels = assumed_screen["panels"]
    true_panels = true_screen["panels"]
    ref_camera = true_screen.get("ref_camera")

    details = []
    n_offscreen = 0
    for anchor in anchors_doc["anchors"]:
        p = anchor["p"]
        hit = geo.find_panel_hit(assumed_eye, p, assumed_panels)
        if hit is None:
            n_offscreen += 1
            continue
        true_panel = geo.panel_by_name(true_panels, hit.panel)
        q = geo.panel_point_from_uv(true_panel, hit.u, hit.v)
        err_deg = geo.ray_angle_deg(true_eye, q, p)

        px_dist = None
        if ref_camera is not None:
            proj_p = geo.pinhole_project(p, true_eye, ref_camera)
            proj_q = geo.pinhole_project(q, true_eye, ref_camera)
            if proj_p is not None and proj_q is not None:
                px_dist = float(np.hypot(proj_p[0] - proj_q[0], proj_p[1] - proj_q[1]))

        details.append({
            "anchor": anchor["id"],
            "object": anchor["object"],
            "t": anchor["t"],
            "panel": hit.panel,
            "err_deg": err_deg,
            "px_dist": px_dist,
        })

    errs = np.array([d["err_deg"] for d in details], dtype=float)
    mean_deg = float(np.mean(errs)) if len(errs) else 0.0
    max_deg = float(np.max(errs)) if len(errs) else 0.0

    limit = thresholds["C2"]
    status = "PASS" if (mean_deg <= limit["mean_deg"] and max_deg <= limit["max_deg"]) else "FAIL"

    details.sort(key=lambda d: -d["err_deg"])
    return {
        "check": "C2",
        "status": status,
        "value": {"mean_deg": mean_deg, "max_deg": max_deg},
        "limit": limit,
        "details": details[:20],
        "n_anchors": len(anchors_doc["anchors"]),
        "n_offscreen": n_offscreen,
    }


def compute_c1(run_dir, true_screen: dict, times_ms: list[int]) -> dict:
    """C1 dims: each t_<ms>/<panel>.png must match that panel's res exactly.

    Per CLAUDE.md Section 3.5, the panel content (L.png/R.png) is rendered
    at the panel's own `res`, not ref_camera's -- this reads actual pixel
    dimensions off disk, no tolerance (thresholds.json: C1 is exact).
    """
    run_dir = Path(run_dir)
    details = []
    all_match = True
    for panel in true_screen["panels"]:
        name = panel["name"]
        expected = list(panel["res"])  # [width, height]
        for t_ms in times_ms:
            path = run_dir / f"t_{t_ms}" / f"{name}.png"
            if not path.exists():
                details.append({"panel": name, "t_ms": t_ms, "status": "MISSING", "path": str(path)})
                all_match = False
                continue
            img = cv2.imread(str(path))
            if img is None:
                details.append({"panel": name, "t_ms": t_ms, "status": "UNREADABLE", "path": str(path)})
                all_match = False
                continue
            h, w = img.shape[:2]
            actual = [w, h]
            match = actual == expected
            all_match = all_match and match
            details.append({"panel": name, "t_ms": t_ms, "expected": expected, "actual": actual, "match": match})

    status = "PASS" if all_match else "FAIL"
    return {
        "check": "C1",
        "status": status,
        "value": {"all_match": all_match},
        "limit": {"mode": "exact"},
        "details": [d for d in details if not d.get("match", False)][:20] or details[:5],
    }


def _panel_quad_px(panel: dict, eye, ref_camera: dict) -> np.ndarray | None:
    """Project a panel's 4 rectangle corners (pa, pb, pb+pc-pa, pc) into
    ref_camera pixel space, in winding order, for a point-in-polygon test.
    Returns None if any corner is behind the camera."""
    pa, pb, pc = np.array(panel["pa"]), np.array(panel["pb"]), np.array(panel["pc"])
    pd = pb + pc - pa
    pts = []
    for corner in (pa, pb, pd, pc):
        proj = geo.pinhole_project(corner, eye, ref_camera)
        if proj is None:
            return None
        pts.append((proj[0], proj[1]))
    return np.array(pts, dtype=np.float32)


def _inside_panel_union(point_px, polygons: list[np.ndarray | None]) -> bool:
    for poly in polygons:
        if poly is not None and cv2.pointPolygonTest(poly, point_px, False) >= 0:
            return True
    return False


def compute_c4_analytic(scene: dict, true_screen: dict, anchors_doc: dict, thresholds: dict) -> dict:
    """C4 out-of-bounds (analytic proxy): project every anchor (object
    centers + bbox corners) from the TRUE eye into ref_camera, and check
    whether it lands inside the union of the TRUE panels' projected
    quads. Value = fraction of anchors outside, per sample time, max over
    time -- an anchor-count proxy for CLAUDE.md Section 6 step 7's pixel
    fraction (which needs mask_ref.png and is the cross-check once P1's
    renders exist, not this).

    An anchor behind the camera counts as outside (can't be on-screen).
    """
    true_eye = true_screen["eye"]
    ref_camera = true_screen["ref_camera"]
    polygons = [_panel_quad_px(p, true_eye, ref_camera) for p in true_screen["panels"]]

    outside_by_time: dict[float, list[bool]] = {}
    outside_examples = []
    for anchor in anchors_doc["anchors"]:
        t = anchor["t"]
        proj = geo.pinhole_project(anchor["p"], true_eye, ref_camera)
        outside = proj is None or not _inside_panel_union((proj[0], proj[1]), polygons)
        outside_by_time.setdefault(t, []).append(outside)
        if outside:
            outside_examples.append({"anchor": anchor["id"], "object": anchor["object"], "t": t, "kind": anchor.get("kind")})

    fraction_by_time = {t: (sum(flags) / len(flags)) for t, flags in outside_by_time.items()}
    max_fraction = max(fraction_by_time.values()) if fraction_by_time else 0.0

    limit = thresholds["C4"]["max_fraction"]
    status = "PASS" if max_fraction <= limit else "FAIL"

    details = [{"t": t, "fraction_outside": f} for t, f in sorted(fraction_by_time.items(), key=lambda kv: -kv[1])]
    return {
        "check": "C4",
        "status": status,
        "value": {"max_fraction": max_fraction},
        "limit": thresholds["C4"],
        "details": details[:20],
        "example_offenders": outside_examples[:20],
    }


def compute_c3(
    assumed_screen: dict,
    true_screen: dict,
    scene: dict,
    anchors_doc: dict,
    thresholds: dict,
    edge_tol_m: float = 0.3,
) -> dict:
    """C3 seam, per CLAUDE.md Section 6 step 6.

    Two independent failure modes:
      1. Hard rule: a text object's footprint must not span both panels.
         Reuses each text object's 4 corner anchors (kind="corner"); if
         they ray-hit (from the TRUE eye) more than one distinct TRUE
         panel, its footprint crosses the architectural corner.
      2. Seam discontinuity "value": among anchors within edge_tol_m of
         the TRUE corner edge, compare the mean angular-error vector
         (azimuth, elevation -- see geo.angular_components_deg) of the
         anchors that hit panel L (via the assumed-eye ray, as in C2)
         against those that hit panel R. If both sides are off by about
         the same amount, there's no visible jump at the seam (a C2
         problem, not a C3 one); if they differ, the seam itself will
         show a discontinuity. FAILs if this difference exceeds
         thresholds["C3"]["max_deg"].
    """
    true_eye = true_screen["eye"]
    true_panels = true_screen["panels"]
    assumed_eye = assumed_screen["eye"]
    assumed_panels = assumed_screen["panels"]
    ref_camera = true_screen["ref_camera"]

    edge_a, edge_b = geo.find_corner_edge(true_panels)
    text_object_ids = {obj["id"] for obj in scene["objects"] if obj["type"] == "text"}

    corners_by_obj_t: dict[tuple, list] = {}
    for anchor in anchors_doc["anchors"]:
        if anchor["kind"] == "corner" and anchor["object"] in text_object_ids:
            corners_by_obj_t.setdefault((anchor["object"], anchor["t"]), []).append(anchor["p"])

    crossing = []
    for (obj_id, t), corners in corners_by_obj_t.items():
        panels_hit = set()
        for c in corners:
            hit = geo.find_panel_hit(true_eye, c, true_panels)
            if hit is not None:
                panels_hit.add(hit.panel)
        if len(panels_hit) > 1:
            crossing.append({"object": obj_id, "t": t, "panels": sorted(panels_hit)})

    l_errs, r_errs = [], []
    for anchor in anchors_doc["anchors"]:
        p = anchor["p"]
        if geo.point_to_segment_distance(p, edge_a, edge_b) > edge_tol_m:
            continue
        hit = geo.find_panel_hit(assumed_eye, p, assumed_panels)
        if hit is None:
            continue
        true_panel = geo.panel_by_name(true_panels, hit.panel)
        q = geo.panel_point_from_uv(true_panel, hit.u, hit.v)
        err_vec = geo.angular_components_deg(true_eye, q, ref_camera) - geo.angular_components_deg(true_eye, p, ref_camera)
        (l_errs if hit.panel == "L" else r_errs).append(err_vec)

    if l_errs and r_errs:
        seam_deg = float(np.linalg.norm(np.mean(l_errs, axis=0) - np.mean(r_errs, axis=0)))
    else:
        seam_deg = 0.0  # not enough anchors near the edge on both sides to judge

    limit = thresholds["C3"]["max_deg"]
    status = "FAIL" if (crossing or seam_deg > limit) else "PASS"

    return {
        "check": "C3",
        "status": status,
        "value": {"seam_deg": seam_deg, "n_l_near_edge": len(l_errs), "n_r_near_edge": len(r_errs)},
        "limit": thresholds["C3"],
        "details": {"text_crossing_edge": crossing},
    }


def compute_c5(scene: dict, true_screen: dict, thresholds: dict) -> dict:
    """C5 readability: for each text object, at every time it exists,
    angular height = 2*atan((height_m*scale/2) / distance_from_true_eye),
    in arcmin. FAILs if the worst (smallest) angular height across all
    text objects/times is below the threshold.
    """
    true_eye = np.array(true_screen["eye"], dtype=float)
    times = anchors_mod.sample_times(scene)

    details = []
    for obj in scene["objects"]:
        if obj["type"] != "text":
            continue
        for t in times:
            if not anchors_mod.object_exists_at(obj, t):
                continue
            pos, _rot_deg, scale = anchors_mod.interpolate_pose(obj["keyframes"], t)
            height = obj["height_m"] * scale
            distance = float(np.linalg.norm(pos - true_eye))
            arcmin = float(np.degrees(2 * np.arctan((height / 2) / distance)) * 60)
            details.append({"object": obj["id"], "t": t, "height_m": height, "distance_m": distance, "arcmin": arcmin})

    limit = thresholds["C5"]["min_arcmin"]
    if not details:
        return {"check": "C5", "status": "PASS", "value": {"min_arcmin": None}, "limit": thresholds["C5"], "details": []}

    min_arcmin = min(d["arcmin"] for d in details)
    status = "PASS" if min_arcmin >= limit else "FAIL"
    details.sort(key=lambda d: d["arcmin"])
    return {
        "check": "C5",
        "status": status,
        "value": {"min_arcmin": min_arcmin},
        "limit": thresholds["C5"],
        "details": details[:20],
    }
