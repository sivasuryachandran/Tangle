"""Diagnostic image cross-checks: compute_c2_image_crosscheck (vs
idpass_street.png) and compute_c4_mask_crosscheck (vs mask_ref.png).
Neither is a certificate gate -- these tests only confirm the pixel
decoding and polygon-fraction math themselves are correct, using
synthetic images built from the same encoding P1's renderer uses
(CLAUDE.md Section 3.5).
"""

import cv2
import numpy as np

from checker import checks
from checker import geometry as geo

CORNER_90 = geo.load_screen("screens/corner_90_demo.json")
TRUE_EYE = CORNER_90["eye"]
REF_CAMERA = CORNER_90["ref_camera"]
RES = REF_CAMERA["res"]


def _id_dot_image(dots, res=RES):
    """dots: {id: (x, y)}. BGR array so a dot's actual RGB is (id//256, id%256, 255)."""
    w, h = res
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for anchor_id, (x, y) in dots.items():
        r, g = (anchor_id >> 8) & 255, anchor_id & 255
        cv2.circle(img, (int(round(x)), int(round(y))), 5, (255, g, r), thickness=-1, lineType=cv2.LINE_8)
    return img


def test_decode_id_dot_centroids_round_trip(tmp_path):
    img_path = tmp_path / "idpass_street.png"
    cv2.imwrite(str(img_path), _id_dot_image({7: (100.0, 200.0), 300: (50.0, 60.0)}))
    centroids = checks.decode_id_dot_centroids(img_path)
    assert set(centroids) == {7, 300}
    assert abs(centroids[7][0] - 100.5) < 1.0 and abs(centroids[7][1] - 200.5) < 1.0
    assert abs(centroids[300][0] - 50.5) < 1.0 and abs(centroids[300][1] - 60.5) < 1.0


def _make_c2_xcheck_run_dir(tmp_path, dot_pixel):
    L = geo.panel_by_name(CORNER_90["panels"], "L")
    world_p = geo.panel_point_from_uv(L, 0.5, 0.5)
    anchors_doc = {"times": [0.0], "anchors": [{"id": 0, "object": "probe", "t": 0.0, "p": world_p.tolist(), "kind": "center"}]}

    run_dir = tmp_path / "v1"
    (run_dir / "t_0").mkdir(parents=True)
    cv2.imwrite(str(run_dir / "t_0" / "idpass_street.png"), _id_dot_image({0: dot_pixel}))
    return run_dir, anchors_doc


def test_c2_image_crosscheck_passes_when_dot_matches_analytic_q(tmp_path):
    L = geo.panel_by_name(CORNER_90["panels"], "L")
    world_p = geo.panel_point_from_uv(L, 0.5, 0.5)
    analytic_px = geo.pinhole_project(world_p, TRUE_EYE, REF_CAMERA)
    run_dir, anchors_doc = _make_c2_xcheck_run_dir(tmp_path, (analytic_px[0], analytic_px[1]))

    report = checks.compute_c2_image_crosscheck(run_dir, CORNER_90, CORNER_90, anchors_doc, [0])
    print("C2 image xcheck (matching):", report["value"])
    assert report["status"] == "PASS"
    assert report["value"]["n_checked"] == 1
    assert report["value"]["n_disagreements"] == 0


def test_c2_image_crosscheck_flags_a_shifted_dot(tmp_path):
    run_dir, anchors_doc = _make_c2_xcheck_run_dir(tmp_path, (50.0, 50.0))  # nowhere near the analytic projection
    report = checks.compute_c2_image_crosscheck(run_dir, CORNER_90, CORNER_90, anchors_doc, [0])
    print("C2 image xcheck (shifted):", report["value"])
    assert report["status"] == "FLAGGED"
    assert report["value"]["n_disagreements"] == 1
    assert report["details"][0]["px_dist"] > 2.0


def test_c4_mask_crosscheck_zero_when_white_pixels_are_inside_the_panel_union(tmp_path):
    poly_l = checks._panel_quad_px(CORNER_90["panels"][0], TRUE_EYE, REF_CAMERA)
    mask = np.zeros((RES[1], RES[0]), dtype=np.uint8)
    cv2.fillConvexPoly(mask, poly_l.astype(np.int32), 255)  # white exactly inside L's own silhouette

    run_dir = tmp_path / "v1"
    (run_dir / "t_0").mkdir(parents=True)
    cv2.imwrite(str(run_dir / "t_0" / "mask_ref.png"), mask)

    report = checks.compute_c4_mask_crosscheck(run_dir, CORNER_90, [0])
    print("C4 mask xcheck (inside):", report["value"])
    assert report["value"]["max_fraction"] == 0.0


def test_c4_mask_crosscheck_nonzero_when_white_pixels_are_outside_the_panel_union(tmp_path):
    mask = np.zeros((RES[1], RES[0]), dtype=np.uint8)
    mask[0:50, 0:50] = 255  # top-left corner, well outside both panels' projected quads

    run_dir = tmp_path / "v1"
    (run_dir / "t_0").mkdir(parents=True)
    cv2.imwrite(str(run_dir / "t_0" / "mask_ref.png"), mask)

    report = checks.compute_c4_mask_crosscheck(run_dir, CORNER_90, [0])
    print("C4 mask xcheck (outside):", report["value"])
    assert report["value"]["max_fraction"] == 1.0
