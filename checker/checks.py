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

    limit = thresholds["C2"]
    if not details:
        # No anchor lands on any panel (e.g. a corner scene on the flat
        # roadside screen): there is nothing to measure, so NOT RUN, which
        # blocks overall -- never a vacuous PASS at 0.0 deg.
        return {
            "check": "C2",
            "status": "NOT RUN",
            "value": {"mean_deg": None, "max_deg": None},
            "limit": limit,
            "details": [],
            "n_anchors": len(anchors_doc["anchors"]),
            "n_offscreen": n_offscreen,
            "note": "no anchor ray from the assumed eye hits any panel",
        }

    errs = np.array([d["err_deg"] for d in details], dtype=float)
    mean_deg = float(np.mean(errs))
    max_deg = float(np.max(errs))

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

    With no times_ms at all (no renders to check -- e.g. a fast,
    render-free pass over just scene.json + screens), there is nothing
    to compare, so this reports NOT RUN rather than a vacuous PASS --
    CLAUDE.md Section 1: "Statuses: PASS / FAIL / NOT RUN."
    """
    if not times_ms:
        return {
            "check": "C1",
            "status": "NOT RUN",
            "value": {"all_match": None},
            "limit": {"mode": "exact"},
            "details": [],
            "note": "no rendered times to check",
        }

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


def _local_surface_samples(obj: dict, library: dict) -> np.ndarray:
    """Surface-conforming sample points for compute_c4_analytic, in local
    object space at scale 1, before rotation/scale/translation.

    Unlike anchors.py's local_corners (bounding-box corners -- fixed by
    the CLAUDE.md Section 3.4 anchors.json contract, since P1's ID-dot
    renderer also reads those exact points), these sit ON the object's
    actual surface. A box or a flat text quad already equal their own
    convex hull, so corners stay exact; a cylinder's or sphere's
    bounding-box corners sit in empty space well past the real rounded
    surface, which is exactly the false-positive a real Argon run hit
    (reports/gates.md, G3, Oct 25: analytic FAILed at 0.26 while the
    actual rendered silhouette was clean, 0.0) -- sampling the rim /
    sphere surface directly fixes that over-estimate.
    """
    otype = obj["type"]
    if otype == "text":
        height = float(obj["height_m"])
        width = 0.6 * height * len(obj.get("text", ""))
        hw, hh = width / 2.0, height / 2.0
        return np.array([[-hw, -hh, 0], [hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]])

    spec = library[otype]
    if otype == "box":
        sx, sy, sz = spec["size_m"]
        hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
        return np.array([[sx_ * hx, sy_ * hy, sz_ * hz] for sx_, sy_, sz_ in anchors_mod._BOX_CORNER_SIGNS])

    if otype == "can":
        r, h = spec["radius_m"], spec["height_m"]
        n = 12  # points around the rim, at each of the top and bottom circles
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
        pts = []
        for a in angles:
            x, z = r * np.cos(a), r * np.sin(a)
            pts.append((x, h / 2.0, z))
            pts.append((x, -h / 2.0, z))
        return np.array(pts)

    if otype in ("sphere", "particles"):
        r = spec["radius_m"]
        n = 24
        golden_angle = np.pi * (3.0 - np.sqrt(5.0))
        pts = []
        for i in range(n):
            y = 1 - (i / (n - 1)) * 2 if n > 1 else 0.0
            radius_at_y = np.sqrt(max(0.0, 1 - y * y))
            theta = golden_angle * i
            pts.append((r * radius_at_y * np.cos(theta), r * y, r * radius_at_y * np.sin(theta)))
        return np.array(pts)

    raise ValueError(f"unknown object type {otype!r}")


def _build_surface_sample_points(scene: dict, library: dict) -> list[dict]:
    """Surface samples for every object at every time it exists, parallel
    to anchors.build_anchors but using _local_surface_samples instead of
    the fixed 8-corner bounding box. Not the anchors.json contract --
    this is internal to compute_c4_analytic only."""
    points = []
    for t in anchors_mod.sample_times(scene):
        for obj in scene["objects"]:
            if not anchors_mod.object_exists_at(obj, t):
                continue
            pos, rot_deg, scale = anchors_mod.interpolate_pose(obj["keyframes"], t)
            if scale <= 0.0:
                continue
            rot_matrix = anchors_mod.euler_deg_to_matrix(rot_deg)
            for local in _local_surface_samples(obj, library):
                world = pos + rot_matrix @ (scale * local)
                points.append({"object": obj["id"], "t": t, "p": world.tolist()})
    return points


def compute_c4_analytic(scene: dict, true_screen: dict, thresholds: dict, library: dict | None = None) -> dict:
    """C4 out-of-bounds (analytic proxy): project every object's surface
    sample (see _local_surface_samples) from the TRUE eye into
    ref_camera, and check whether it lands inside the union of the TRUE
    panels' projected quads. Value = fraction of samples outside, per
    sample time, max over time -- a proxy for CLAUDE.md Section 6 step
    7's pixel fraction (which needs mask_ref.png; compute_c4_mask_crosscheck
    is the real measurement, compute_c4() prefers it when renders exist).

    A sample point behind the camera counts as outside (can't be on-screen).
    """
    library = library or anchors_mod.load_object_library()
    true_eye = true_screen["eye"]
    ref_camera = true_screen["ref_camera"]
    polygons = [_panel_quad_px(p, true_eye, ref_camera) for p in true_screen["panels"]]

    outside_by_time: dict[float, list[bool]] = {}
    outside_examples = []
    for sample in _build_surface_sample_points(scene, library):
        t = sample["t"]
        proj = geo.pinhole_project(sample["p"], true_eye, ref_camera)
        outside = proj is None or not _inside_panel_union((proj[0], proj[1]), polygons)
        outside_by_time.setdefault(t, []).append(outside)
        if outside:
            outside_examples.append({"object": sample["object"], "t": t})

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


_SEAM_PROBE_FRACTIONS = (0.1, 0.3, 0.5, 0.7, 0.9)  # heights along the shared edge
_SEAM_PROBE_OFFSET_M = 0.1   # how far into each panel the near-edge probes sit
_SEAM_PROBE_DEPTH_M = 3.0    # second probe per spot, pushed this far behind the screen


def seam_probe_points(panel_a: dict, panel_b: dict, true_eye) -> list[np.ndarray]:
    """Synthetic probe points hugging a seam on both sides, independent of
    scene content, so C3's seam value is always measured (a scene with
    nothing within edge_tol_m of the corner used to give a vacuous 0.0).

    Placed from the TRUE edge geometry: at several heights along the shared
    edge, a point _SEAM_PROBE_OFFSET_M into each panel's surface, plus the
    same spot pushed _SEAM_PROBE_DEPTH_M behind the screen along the true
    eye's line of sight (content that sits just behind the seam).
    """
    edge_a, edge_b = geo.find_seam_edge(panel_a, panel_b)
    edge_dir = geo.normalize(edge_b - edge_a)
    true_eye = np.asarray(true_eye, dtype=float)
    probes = []
    for panel in (panel_a, panel_b):
        pa, pb, pc = (np.asarray(panel[k], dtype=float) for k in ("pa", "pb", "pc"))
        centre = pa + 0.5 * (pb - pa) + 0.5 * (pc - pa)
        for f in _SEAM_PROBE_FRACTIONS:
            e = edge_a + f * (edge_b - edge_a)
            across = centre - e
            across = geo.normalize(across - np.dot(across, edge_dir) * edge_dir)
            surface = e + _SEAM_PROBE_OFFSET_M * across
            probes.append(surface)
            probes.append(surface + _SEAM_PROBE_DEPTH_M * geo.normalize(surface - true_eye))
    return probes


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

        def side_errors(points):
            side_a, side_b = [], []
            for p in points:
                hit = geo.find_panel_hit(assumed_eye, p, assumed_panels)
                if hit is None or hit.panel not in (name_a, name_b):
                    continue
                true_panel = geo.panel_by_name(true_panels, hit.panel)
                q = geo.panel_point_from_uv(true_panel, hit.u, hit.v)
                err_vec = geo.angular_components_deg(true_eye, q, ref_camera) - geo.angular_components_deg(true_eye, p, ref_camera)
                (side_a if hit.panel == name_a else side_b).append(err_vec)
            return side_a, side_b

        def jump_deg(side_a, side_b):
            if not (side_a and side_b):
                return None
            return float(np.linalg.norm(np.mean(side_a, axis=0) - np.mean(side_b, axis=0)))

        near_edge = [a["p"] for a in anchors_doc["anchors"]
                     if geo.point_to_segment_distance(a["p"], edge_a, edge_b) <= edge_tol_m]
        scene_a, scene_b = side_errors(near_edge)
        probe_a, probe_b = side_errors(seam_probe_points(panel_a, panel_b, true_eye))
        scene_deg = jump_deg(scene_a, scene_b)
        probe_deg = jump_deg(probe_a, probe_b)
        measured = [d for d in (scene_deg, probe_deg) if d is not None]
        seam_deg = max(measured) if measured else None  # None: nothing could be measured (see below)

        limit = thresholds["C3"]["max_deg"]
        if crossing or (seam_deg is not None and seam_deg > limit):
            seam_status = "FAIL"
        elif seam_deg is None:
            seam_status = "NOT RUN"  # no probe or anchor reached both panels (e.g. the seam is hidden from the assumed eye)
        else:
            seam_status = "PASS"
        seam_results.append({
            "seam": [name_a, name_b],
            "status": seam_status,
            "seam_deg": seam_deg if seam_deg is not None else 0.0,
            "seam_deg_scene_anchors": scene_deg,
            "seam_deg_probes": probe_deg,
            "n_near_edge": {name_a: len(scene_a), name_b: len(scene_b)},
            "n_probes": {name_a: len(probe_a), name_b: len(probe_b)},
            "text_crossing_edge": crossing,
        })

    if any(s["status"] == "FAIL" for s in seam_results):
        status = "FAIL"
    elif any(s["status"] == "NOT RUN" for s in seam_results):
        status = "NOT RUN"
    else:
        status = "PASS"
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


def compute_c4(run_dir, scene: dict, true_screen: dict, thresholds: dict, times_ms: list[int]) -> dict:
    """C4 out-of-bounds, CLAUDE.md Section 6 step 7. Authoritative value is
    the pixel fraction from compute_c4_mask_crosscheck (the literal spec
    definition: white mask_ref.png pixels outside the TRUE panels'
    projected union) whenever at least one rendered mask_ref.png exists.
    Falls back to compute_c4_analytic's surface-sample proxy only when no
    renders are available (e.g. fast rounds during repair iteration, or
    these unit tests) -- the exact rendered pixels are always preferred
    once they exist; the analytic proxy, even using surface samples
    rather than bounding-box corners, is still an approximation.

    A real Argon run hit exactly this gap with the *old* corner-based
    proxy (reports/gates.md, G3, Oct 25): it reported 0.26 at t=6.5s
    while the actual mask_ref.png showed 0.0, because a cylinder's
    bounding-box corners sit in empty space well past its real rounded
    surface. compute_c4_analytic now samples the object's actual surface
    (a cylinder's rim, a sphere's surface) instead, fixing that
    over-estimate -- this orchestrator's mask-preferred ordering is kept
    regardless, since real pixels beat any analytic estimate. Both
    values are always returned; only one drives status.
    """
    mask_result = compute_c4_mask_crosscheck(run_dir, true_screen, times_ms)
    analytic_result = compute_c4_analytic(scene, true_screen, thresholds)

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


def _min_or_none(values):
    """C6 points where no anchor lands on a panel carry mean_deg None (C2 NOT RUN); skip them."""
    measured = [v for v in values if v is not None]
    return min(measured) if measured else None


def _max_or_none(values):
    measured = [v for v in values if v is not None]
    return max(measured) if measured else None


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
            "value": {"layout": "path", "n_points": len(points), "min_mean_deg": _min_or_none(mean_degs), "max_mean_deg": _max_or_none(mean_degs)},
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
        "value": {"layout": "grid", "grid": grid, "min_mean_deg": _min_or_none(mean_degs), "max_mean_deg": _max_or_none(mean_degs)},
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
            if p["mean_deg"] is not None:
                normalized = min(p["mean_deg"] / (3 * limit), 1.0)
                panel[:, i * cell_px:(i + 1) * cell_px] = int(normalized * 255)
        colored = cv2.applyColorMap(panel, cv2.COLORMAP_JET)
        for i, p in enumerate(points):
            if p["mean_deg"] is None:  # nothing lands on a panel from here: no data, dark gray
                colored[:, i * cell_px:(i + 1) * cell_px, :] = (60, 60, 60)
        for i in range(1, n):
            colored[:, i * cell_px, :] = (40, 40, 40)
        cv2.imwrite(str(out_path), colored)
        return True

    gx, gy, gz = c6_report["value"]["grid"]
    panel = np.zeros((gz * cell_px, gx * cell_px), dtype=np.uint8)
    for i, p in enumerate(points[: gx * gy * gz]):
        row, col = (i // gx) % gz, i % gx
        if p["mean_deg"] is not None:
            normalized = min(p["mean_deg"] / (3 * limit), 1.0)
            panel[row * cell_px:(row + 1) * cell_px, col * cell_px:(col + 1) * cell_px] = int(normalized * 255)
    colored = cv2.applyColorMap(panel, cv2.COLORMAP_JET)  # blue (0, at/below threshold) -> red (255, >=3x threshold)
    for i, p in enumerate(points[: gx * gy * gz]):
        if p["mean_deg"] is None:  # nothing lands on a panel from here: no data, dark gray
            row, col = (i // gx) % gz, i % gx
            colored[row * cell_px:(row + 1) * cell_px, col * cell_px:(col + 1) * cell_px, :] = (60, 60, 60)

    for i in range(1, gx):
        colored[:, i * cell_px, :] = (40, 40, 40)
    for j in range(1, gz):
        colored[j * cell_px, :, :] = (40, 40, 40)

    cv2.imwrite(str(out_path), colored)
    return True


def compute_worst_by_check(hard_checks: list[dict], c4_offenders: list[dict] | None = None) -> dict:
    """For A2 (agent/repair.py): per hard check that is not PASS, the single worst
    moment/object, so the repair step doesn't have to dig through details.
    Keys are check names; each value has "status", "t" (seconds) and "object" where the
    check can say, plus the number that failed. C4's pixel measurement is per time only
    (a mask has no object ids), so its "object" comes from the analytic surface-sample
    proxy (flagged by "object_source") and is None if the proxy sees nothing outside.
    """
    worst = {}
    for check in hard_checks:
        name, status = check["check"], check["status"]
        if status in ("PASS", "NOT APPLICABLE"):
            continue
        entry = {"status": status}
        details = check.get("details")
        if name == "C2" and isinstance(details, list) and details:
            d = details[0]  # already sorted worst first
            entry.update({"t": round(d["t"], 3), "object": d["object"], "err_deg": d["err_deg"], "panel": d.get("panel")})
        elif name == "C3" and isinstance(details, dict):
            seams = details.get("seams") or []
            crossing = [(s_["seam"], x) for s_ in seams for x in s_.get("text_crossing_edge", [])]
            if crossing:
                seam, x = crossing[0]
                entry.update({"t": round(x["t"], 3), "object": x["object"], "seam": seam, "reason": "text footprint crosses the seam"})
            elif seams:
                s_ = max(seams, key=lambda s2: s2["seam_deg"])
                entry.update({"t": None, "object": None, "seam": s_["seam"], "seam_deg": s_["seam_deg"], "reason": "seam step above limit"})
        elif name == "C4" and isinstance(details, list) and details:
            d = max(details, key=lambda d: d.get("fraction_outside", 0))
            t = d["t_ms"] / 1000.0 if "t_ms" in d else d.get("t")
            near = [o for o in (c4_offenders or []) if t is not None and abs(o["t"] - t) < 0.26]
            entry.update({"t": round(t, 3) if t is not None else None, "fraction_outside": d.get("fraction_outside"),
                          "object": near[0]["object"] if near else None, "object_source": "analytic_proxy"})
        elif name == "C5" and isinstance(details, list) and details:
            d = details[0]  # smallest angular height first
            entry.update({"t": round(d["t"], 3), "object": d["object"], "arcmin": d["arcmin"]})
        worst[name] = entry
    return worst


def compute_failure_times_s(hard_checks: list[dict]) -> list[float]:
    """Seconds where a hard check (C2, C4 or C5 -- the time-indexed ones)
    genuinely exceeded its own limit, for agent/timeline.py's
    Argon-vs-checker agreement metric (does Argon cite the same moments
    the checker actually flagged?).

    Computed directly from the same per-check data the status itself
    came from, not reverse-engineered from report.json's details after
    the fact: those differ in shape between checks and even between a
    single check's own code paths (compute_c4's mask-based details use
    "t_ms", its analytic-fallback details use "t" in seconds already),
    which a generic parser over report.json alone can't tell apart
    reliably. C1/C3 aren't time-indexed the same way (C1 is per-panel
    dims, C3 is per-seam) so they're excluded, matching
    agent/timeline.py's own check list.
    """
    times: set[float] = set()
    for check in hard_checks:
        name = check["check"]
        details = check.get("details")
        limit = check.get("limit") or {}
        if not isinstance(details, list):
            continue
        if name == "C2":
            for d in details:
                if "t" in d and d.get("err_deg", 0) > limit.get("max_deg", float("inf")):
                    times.add(round(d["t"], 1))
        elif name == "C4":
            for d in details:
                if d.get("fraction_outside", 0) <= limit.get("max_fraction", float("inf")):
                    continue
                if "t_ms" in d:
                    times.add(round(d["t_ms"] / 1000.0, 1))
                elif "t" in d:
                    times.add(round(d["t"], 1))
        elif name == "C5":
            for d in details:
                if "t" in d and d.get("arcmin", float("inf")) < limit.get("min_arcmin", 0):
                    times.add(round(d["t"], 1))
    return sorted(times)
