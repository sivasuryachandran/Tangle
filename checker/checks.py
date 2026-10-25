"""Individual checker checks (C1-C5), each returning a report.json entry
per CLAUDE.md Section 3.6: {"check", "status", "value", "limit", "details"}.

Also two image-based cross-checks (C2_image_xcheck, C4_mask_xcheck) against
P1's actual renders (idpass_street.png, mask_ref.png) -- CLAUDE.md Section 6
steps 4 and 7. Both are diagnostic only: they verify the analytic checks
and P1's renderer agree, but neither is itself a PASS/FAIL authority (no
threshold for either in config/thresholds.json), and checker/run.py's
overall status ignores them.
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
    """C3 seam, per CLAUDE.md Section 6 step 6, generalized to N panels
    (CLAUDE.md Section 3.2, "Any screen = a list of N flat panels",
    decided 11:35): runs once per pair in the TRUE screen's "seams" list
    ([[name_a, name_b], ...]). No seams declared -> status NOT APPLICABLE
    ("no seams -> NOT APPLICABLE"), not PASS or FAIL -- a single-panel
    screen, or one with no adjacent panels, has no seam to check.

    Per seam, two independent failure modes (same math as the original
    2-panel L/R version, just scoped to that seam's two named panels):
      1. Hard rule: a text object's footprint must not span both of the
         seam's panels. Reuses each text object's 4 corner anchors
         (kind="corner"); if they ray-hit (from the TRUE eye) both named
         panels, its footprint crosses that seam.
      2. Seam discontinuity "value": among anchors within edge_tol_m of
         the seam's edge, compare the mean angular-error vector (azimuth,
         elevation -- see geo.angular_components_deg) of the anchors that
         hit the seam's first panel (via the assumed-eye ray, as in C2)
         against those that hit its second panel. If both sides are off
         by about the same amount, there's no visible jump at the seam (a
         C2 problem, not a C3 one); if they differ, the seam itself will
         show a discontinuity. FAILs if this exceeds thresholds["C3"]["max_deg"].

    Overall status is FAIL if any seam fails, else PASS.
    """
    seams = true_screen.get("seams") or []
    if not seams:
        return {
            "check": "C3",
            "status": "NOT APPLICABLE",
            "value": {},
            "limit": thresholds["C3"],
            "details": {"seams": [], "note": "screen has no declared seams"},
        }

    true_eye = true_screen["eye"]
    true_panels = true_screen["panels"]
    assumed_eye = assumed_screen["eye"]
    assumed_panels = assumed_screen["panels"]
    ref_camera = true_screen["ref_camera"]
    text_object_ids = {obj["id"] for obj in scene["objects"] if obj["type"] == "text"}

    corners_by_obj_t: dict[tuple, list] = {}
    for anchor in anchors_doc["anchors"]:
        if anchor["kind"] == "corner" and anchor["object"] in text_object_ids:
            corners_by_obj_t.setdefault((anchor["object"], anchor["t"]), []).append(anchor["p"])

    seam_results = []
    for name_a, name_b in seams:
        panel_a = geo.panel_by_name(true_panels, name_a)
        panel_b = geo.panel_by_name(true_panels, name_b)
        edge_a, edge_b = geo.find_seam_edge(panel_a, panel_b)

        crossing = []
        for (obj_id, t), corners in corners_by_obj_t.items():
            panels_hit = set()
            for c in corners:
                hit = geo.find_panel_hit(true_eye, c, true_panels)
                if hit is not None:
                    panels_hit.add(hit.panel)
            if {name_a, name_b}.issubset(panels_hit):
                crossing.append({"object": obj_id, "t": t, "panels": sorted(panels_hit)})

        side_a_errs, side_b_errs = [], []
        for anchor in anchors_doc["anchors"]:
            p = anchor["p"]
            if geo.point_to_segment_distance(p, edge_a, edge_b) > edge_tol_m:
                continue
            hit = geo.find_panel_hit(assumed_eye, p, assumed_panels)
            if hit is None or hit.panel not in (name_a, name_b):
                continue
            true_panel = geo.panel_by_name(true_panels, hit.panel)
            q = geo.panel_point_from_uv(true_panel, hit.u, hit.v)
            err_vec = geo.angular_components_deg(true_eye, q, ref_camera) - geo.angular_components_deg(true_eye, p, ref_camera)
            (side_a_errs if hit.panel == name_a else side_b_errs).append(err_vec)

        if side_a_errs and side_b_errs:
            seam_deg = float(np.linalg.norm(np.mean(side_a_errs, axis=0) - np.mean(side_b_errs, axis=0)))
        else:
            seam_deg = 0.0  # not enough anchors near the edge on both sides to judge

        limit = thresholds["C3"]["max_deg"]
        seam_status = "FAIL" if (crossing or seam_deg > limit) else "PASS"
        seam_results.append({
            "seam": [name_a, name_b],
            "status": seam_status,
            "seam_deg": seam_deg,
            "n_near_edge": {name_a: len(side_a_errs), name_b: len(side_b_errs)},
            "text_crossing_edge": crossing,
        })

    status = "FAIL" if any(s["status"] == "FAIL" for s in seam_results) else "PASS"
    return {
        "check": "C3",
        "status": status,
        "value": {"max_seam_deg": max((s["seam_deg"] for s in seam_results), default=0.0)},
        "limit": thresholds["C3"],
        "details": {"seams": seam_results},
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


def decode_id_dot_centroids(image_path) -> dict[int, tuple[float, float]]:
    """{anchor_id: (cx, cy)} pixel centroids from an ID-dot image, per
    CLAUDE.md Section 3.5's encoding: RGB = (id // 256, id % 256, 255),
    black background, no antialiasing. cv2 reads BGR, so the blue channel
    (always 255 on a dot, 0 on background) isolates dot pixels regardless
    of id."""
    img = cv2.imread(str(image_path))
    if img is None:
        return {}
    blue, green, red = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    is_dot = blue == 255
    if not is_dot.any():
        return {}
    ids = (red.astype(np.int32) << 8) | green.astype(np.int32)
    centroids = {}
    for uid in np.unique(ids[is_dot]):
        ys, xs = np.where(is_dot & (ids == uid))
        centroids[int(uid)] = (float(xs.mean()) + 0.5, float(ys.mean()) + 0.5)
    return centroids


def compute_c2_image_crosscheck(
    run_dir,
    assumed_screen: dict,
    true_screen: dict,
    anchors_doc: dict,
    times_ms: list[int],
    px_tol: float = 2.0,
) -> dict:
    """Cross-check compute_c2's analytic Q against the ID-dot centroids
    actually rendered into t_<ms>/idpass_street.png (CLAUDE.md Section 6
    step 4). For each anchor with a visible dot, projects the same
    analytic Q (from the assumed-eye ray-panel hit, remapped onto the
    TRUE panel) into ref_camera and compares pixel position to the
    measured centroid; flags any disagreement over px_tol.

    Diagnostic only -- catches rendering-pipeline bugs (the renderer and
    this analytic math disagreeing), not a certificate gate.
    """
    run_dir = Path(run_dir)
    assumed_eye = assumed_screen["eye"]
    true_eye = true_screen["eye"]
    assumed_panels = assumed_screen["panels"]
    true_panels = true_screen["panels"]
    ref_camera = true_screen["ref_camera"]

    anchors_by_time: dict[float, list] = {}
    for a in anchors_doc["anchors"]:
        anchors_by_time.setdefault(a["t"], []).append(a)

    def _anchors_at(t_sec):
        exact = anchors_by_time.get(t_sec)
        if exact is not None:
            return exact
        return next((v for t, v in anchors_by_time.items() if abs(t - t_sec) < 5e-4), [])

    disagreements = []
    n_checked = 0
    n_images = 0
    for t_ms in times_ms:
        path = run_dir / f"t_{t_ms}" / "idpass_street.png"
        if not path.exists():
            continue
        centroids = decode_id_dot_centroids(path)
        n_images += 1
        for anchor in _anchors_at(t_ms / 1000.0):
            measured = centroids.get(anchor["id"])
            if measured is None:
                continue  # no dot for this anchor at this time (off-panel/off-screen)
            hit = geo.find_panel_hit(assumed_eye, anchor["p"], assumed_panels)
            if hit is None:
                continue
            true_panel = geo.panel_by_name(true_panels, hit.panel)
            q = geo.panel_point_from_uv(true_panel, hit.u, hit.v)
            proj_q = geo.pinhole_project(q, true_eye, ref_camera)
            if proj_q is None:
                continue
            n_checked += 1
            px_dist = float(np.hypot(proj_q[0] - measured[0], proj_q[1] - measured[1]))
            if px_dist > px_tol:
                disagreements.append({
                    "anchor": anchor["id"],
                    "t_ms": t_ms,
                    "analytic_px": [proj_q[0], proj_q[1]],
                    "measured_px": list(measured),
                    "px_dist": px_dist,
                })

    disagreements.sort(key=lambda d: -d["px_dist"])
    return {
        "check": "C2_image_xcheck",
        "status": "PASS" if not disagreements else "FLAGGED",
        "value": {"n_images": n_images, "n_checked": n_checked, "n_disagreements": len(disagreements), "px_tol": px_tol},
        "details": disagreements[:20],
        "note": "diagnostic cross-check against compute_c2; not a certificate gate",
    }


def compute_c4_mask_crosscheck(run_dir, true_screen: dict, times_ms: list[int]) -> dict:
    """Pixel-based C4 cross-check against t_<ms>/mask_ref.png (CLAUDE.md
    Section 6 step 7's original definition): fraction of white mask
    pixels landing outside the union of the TRUE panels' projected
    quads, per time, max over time.

    Cross-checks compute_c4_analytic's anchor-count proxy against the
    actual rendered silhouette; diagnostic only, not a certificate gate
    (no separate threshold for it).
    """
    run_dir = Path(run_dir)
    true_eye = true_screen["eye"]
    ref_camera = true_screen["ref_camera"]
    polygons = [_panel_quad_px(p, true_eye, ref_camera) for p in true_screen["panels"]]

    per_time = []
    for t_ms in times_ms:
        path = run_dir / f"t_{t_ms}" / "mask_ref.png"
        if not path.exists():
            continue
        mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if mask is None:
            continue
        white = mask > 127
        total = int(white.sum())
        if total == 0:
            per_time.append({"t_ms": t_ms, "fraction_outside": 0.0, "white_px": 0})
            continue
        h, w = mask.shape
        union_mask = np.zeros((h, w), dtype=np.uint8)
        for poly in polygons:
            if poly is not None:
                cv2.fillConvexPoly(union_mask, poly.astype(np.int32), 1)
        outside = int(np.count_nonzero(white & (union_mask == 0)))
        per_time.append({"t_ms": t_ms, "fraction_outside": outside / total, "white_px": total})

    max_fraction = max((p["fraction_outside"] for p in per_time), default=0.0)
    return {
        "check": "C4_mask_xcheck",
        "status": None,
        "value": {"max_fraction": max_fraction},
        "details": per_time,
        "note": "same pixel measurement compute_c4() uses as its PASS/FAIL authority when renders exist; exposed standalone too",
    }


def compute_c4(run_dir, scene: dict, true_screen: dict, anchors_doc: dict, thresholds: dict, times_ms: list[int]) -> dict:
    """C4 out-of-bounds, CLAUDE.md Section 6 step 7. Authoritative value is
    the pixel fraction from compute_c4_mask_crosscheck (the literal spec
    definition: white mask_ref.png pixels outside the TRUE panels'
    projected union) whenever at least one rendered mask_ref.png exists.
    Falls back to compute_c4_analytic's anchor-corner proxy only when no
    renders are available (e.g. a pre-render sanity check on a scene
    alone, or these unit tests).

    This ordering is deliberate, not incidental: an object's
    axis-aligned bounding-box corners are a *conservative over-estimate*
    of its real silhouette -- a cylinder's or sphere's corners sit in
    empty space past the actual rounded surface -- so the analytic proxy
    can FAIL where the real render is clean. Observed directly in a real
    Argon run (reports/gates.md, G3, Oct 25): analytic reported a 0.26
    fraction at t=6.5s while the actual mask_ref.png showed 0.0. Using
    the proxy as the certificate gate would risk a false FAIL driving an
    unnecessary Argon repair round, or a false reading live at the demo.
    Both values are always returned; only one drives status.
    """
    mask_result = compute_c4_mask_crosscheck(run_dir, true_screen, times_ms)
    analytic_result = compute_c4_analytic(scene, true_screen, anchors_doc, thresholds)

    if mask_result["details"]:  # at least one real mask_ref.png was found and read
        max_fraction = mask_result["value"]["max_fraction"]
        limit = thresholds["C4"]["max_fraction"]
        status = "PASS" if max_fraction <= limit else "FAIL"
        return {
            "check": "C4",
            "status": status,
            "value": {"max_fraction": max_fraction},
            "limit": thresholds["C4"],
            "details": mask_result["details"],
            "source": "mask_ref.png",
            "analytic_estimate": {"max_fraction": analytic_result["value"]["max_fraction"], "status": analytic_result["status"]},
        }

    analytic_result["source"] = "anchor_proxy_no_renders"
    analytic_result["note"] = "no mask_ref.png renders found; falling back to the anchor-corner proxy (conservative)"
    return analytic_result


def _viewing_zone_grid_points(viewing_zone: dict) -> list[tuple[float, float, float]]:
    """Expand a screen's viewing_zone (center, half_extent, grid counts per
    axis) into the list of candidate eye positions it describes. A grid
    count of 1 on an axis collapses to just the center on that axis
    (CLAUDE.md's demo fixture uses grid [7, 1, 7]: a planar 7x7 sweep at a
    fixed eye height)."""
    center = viewing_zone["center"]
    half_extent = viewing_zone["half_extent"]
    grid = viewing_zone["grid"]

    def axis_values(c, h, g):
        if g <= 1 or h == 0:
            return [c]
        return [c - h + 2 * h * i / (g - 1) for i in range(g)]

    xs = axis_values(center[0], half_extent[0], grid[0])
    ys = axis_values(center[1], half_extent[1], grid[1])
    zs = axis_values(center[2], half_extent[2], grid[2])
    return [(x, y, z) for y in ys for z in zs for x in xs]


def compute_c6_zone_heatmap(assumed_screen: dict, true_screen: dict, anchors_doc: dict, thresholds: dict) -> dict:
    """C6 (CLAUDE.md Section 6 step 9 / Section 3.2's N-panel note, info
    only): C2 mean reprojection error from every candidate TRUE eye
    position, each treated in turn as the TRUE eye (assumed geometry,
    panels and anchors unchanged) -- a "sweet spot" map of how the
    content holds up across where a pedestrian might actually stand, not
    just the one designed eye point.

    Uses the TRUE screen's "eye_path" (an explicit list of eye positions,
    e.g. along a roadside lane) if present, else its "viewing_zone" grid
    (CLAUDE.md: "C6 uses eye_path if present, else the grid"). No
    threshold, no PASS/FAIL, excluded from overall.
    """
    true_eye_path = true_screen.get("eye_path")
    if true_eye_path:
        points = []
        for e in true_eye_path:
            path_screen = dict(true_screen, eye=list(e))
            report = compute_c2(assumed_screen, path_screen, anchors_doc, thresholds)
            points.append({"x": e[0], "y": e[1], "z": e[2], "mean_deg": report["value"]["mean_deg"]})
        mean_degs = [p["mean_deg"] for p in points]
        return {
            "check": "C6",
            "status": None,
            "value": {"layout": "path", "n_points": len(points), "min_mean_deg": min(mean_degs), "max_mean_deg": max(mean_degs)},
            "details": points,
            "note": "informational sweet-spot map along eye_path, not a certificate gate",
        }

    viewing_zone = true_screen.get("viewing_zone")
    if not viewing_zone:
        return {"check": "C6", "status": None, "value": {}, "details": [], "note": "true screen has no eye_path or viewing_zone"}

    grid = viewing_zone["grid"]
    points = []
    for (x, y, z) in _viewing_zone_grid_points(viewing_zone):
        grid_screen = dict(true_screen, eye=[x, y, z])
        report = compute_c2(assumed_screen, grid_screen, anchors_doc, thresholds)
        points.append({"x": x, "y": y, "z": z, "mean_deg": report["value"]["mean_deg"]})

    mean_degs = [p["mean_deg"] for p in points]
    return {
        "check": "C6",
        "status": None,
        "value": {"layout": "grid", "grid": grid, "min_mean_deg": min(mean_degs), "max_mean_deg": max(mean_degs)},
        "details": points,
        "note": "informational sweet-spot map, not a certificate gate",
    }


def render_zone_heatmap_png(c6_report: dict, thresholds: dict, out_path, cell_px: int = 80) -> bool:
    """Render compute_c6_zone_heatmap's result to zone_heatmap.png (blue
    at/below the C2 mean threshold, red at 3x threshold or worse).
    "grid" layout: a gz-row x gx-column grid (one image per gy slice --
    gy is 1 in every fixture so far, i.e. a single planar sweep). "path"
    layout: a single row, one cell per eye_path point, in order. Returns
    False (writes nothing) if there's nothing to show.
    """
    points = c6_report.get("details") or []
    if not points:
        return False
    limit = thresholds["C2"]["mean_deg"]
    layout = c6_report["value"].get("layout", "grid")

    if layout == "path":
        n = len(points)
        panel = np.zeros((cell_px, n * cell_px), dtype=np.uint8)
        for i, p in enumerate(points):
            normalized = min(p["mean_deg"] / (3 * limit), 1.0)
            panel[:, i * cell_px:(i + 1) * cell_px] = int(normalized * 255)
        colored = cv2.applyColorMap(panel, cv2.COLORMAP_JET)
        for i in range(1, n):
            colored[:, i * cell_px, :] = (40, 40, 40)
        cv2.imwrite(str(out_path), colored)
        return True

    gx, gy, gz = c6_report["value"]["grid"]
    panel = np.zeros((gz * cell_px, gx * cell_px), dtype=np.uint8)
    for i, p in enumerate(points[: gx * gy * gz]):
        row, col = (i // gx) % gz, i % gx
        normalized = min(p["mean_deg"] / (3 * limit), 1.0)
        panel[row * cell_px:(row + 1) * cell_px, col * cell_px:(col + 1) * cell_px] = int(normalized * 255)
    colored = cv2.applyColorMap(panel, cv2.COLORMAP_JET)  # blue (0, at/below threshold) -> red (255, >=3x threshold)

    for i in range(1, gx):
        colored[:, i * cell_px, :] = (40, 40, 40)
    for j in range(1, gz):
        colored[j * cell_px, :, :] = (40, 40, 40)

    cv2.imwrite(str(out_path), colored)
    return True
