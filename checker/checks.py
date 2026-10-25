"""Individual checker checks (C1-C5), each returning a report.json entry
per CLAUDE.md Section 3.6: {"check", "status", "value", "limit", "details"}.
"""

from __future__ import annotations

import numpy as np

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
