"""C4 out-of-bounds.

compute_c4_analytic: every object's surface samples (see
checks._local_surface_samples -- a cylinder's rim, a sphere's surface,
not its axis-aligned bounding-box corners) projected from the TRUE eye
must land inside the union of the TRUE panels' projected quads. This is
a proxy for the pixel-fraction definition in CLAUDE.md Section 6 step 7
(which needs mask_ref.png).

Surface samples, not bounding-box corners, by design: a rounded
object's AABB corners sit well past its real silhouette (a sphere's
corner is at radius*sqrt(3), a cylinder's at radius*sqrt(2), vs. the
real surface at exactly radius), which is exactly the false positive a
real Argon G3 run hit (reports/gates.md, Oct 25) -- the old corner-based
proxy reported 0.26 out-of-bounds at t=6.5s while the actual rendered
mask_ref.png showed 0.0.

compute_c4: the orchestrator checker.run actually uses. It prefers the
real mask_ref.png pixel measurement when renders exist (the literal
spec definition), falling back to compute_c4_analytic only when they
don't.
"""

import copy
import json

import cv2
import numpy as np

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")


def test_c4_baseline_passes():
    report = checks.compute_c4_analytic(SCENE, CORNER_90, THRESHOLDS)
    print("C4 baseline:", report["value"], report["status"])
    assert report["status"] == "PASS"
    assert report["value"]["max_fraction"] == 0.0


def test_c4_hero_moved_outside_panel_union_fails():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "can":
            for kf in obj["keyframes"]:
                kf["pos"] = [50.0, 2.0, 50.0]  # far outside both panels
    report = checks.compute_c4_analytic(mutated, CORNER_90, THRESHOLDS)
    print("C4 hero moved OOB:", report["value"], report["status"])
    assert report["status"] == "FAIL"
    assert report["value"]["max_fraction"] > THRESHOLDS["C4"]["max_fraction"]
    assert any(o["object"] == "can" for o in report["example_offenders"])


def test_surface_samples_sit_on_the_real_radius_not_the_bbox_corner():
    can_radii = np.hypot(*checks._local_surface_samples({"type": "can"}, LIBRARY)[:, [0, 2]].T)
    assert np.allclose(can_radii, 0.4)  # library can radius_m -- not 0.4*sqrt(2), the old bbox corner distance

    sphere_radii = np.linalg.norm(checks._local_surface_samples({"type": "sphere"}, LIBRARY), axis=1)
    assert np.allclose(sphere_radii, 0.5)  # library sphere radius_m -- not 0.5*sqrt(3)


def test_surface_samples_cover_every_library_object_type():
    # Regression test: box crashed in real use (the real Argon scene's
    # "pedestal" object) with a NameError on _BOX_CORNER_SIGNS -- none of
    # the tests above happened to use a box, so it slipped past review
    # until a real G3 re-render hit it. Exercise every library type here.
    for otype in ("can", "box", "sphere", "particles"):
        samples = checks._local_surface_samples({"type": otype}, LIBRARY)
        assert samples.shape[1] == 3 and len(samples) > 0
    text_obj = {"type": "text", "height_m": 0.5, "text": "hi"}
    assert checks._local_surface_samples(text_obj, LIBRARY).shape == (4, 3)


def test_surface_sample_proxy_fixes_a_real_bbox_corner_false_positive():
    # A large sphere near panel L's top-right corner: its bounding-box
    # corner clips past the panel's projected (slanted, perspective)
    # quad edge even though the sphere's real surface doesn't -- the
    # exact mechanism behind the gates.md G3 false positive, reproduced
    # here with a synthetic scene for a deterministic, fast test.
    scene = {
        "duration_s": 1, "fps": 30,
        "objects": [{"id": "s", "type": "sphere", "keyframes": [{"t": 0, "pos": [-1.0, 4.7, -0.1], "rot": [0, 0, 0], "scale": 2.0}]}],
        "backdrop": {"type": "room", "depth_m": 1, "color": "#000"},
    }

    # Old behavior, reconstructed directly from bounding-box corner anchors (not exposed anymore).
    anchors_doc = anchors_mod.build_anchors(scene, LIBRARY)
    true_eye, ref_camera = CORNER_90["eye"], CORNER_90["ref_camera"]
    polygons = [checks._panel_quad_px(p, true_eye, ref_camera) for p in CORNER_90["panels"]]
    outside_flags = []
    for a in anchors_doc["anchors"]:
        proj = geo.pinhole_project(a["p"], true_eye, ref_camera)
        outside_flags.append(proj is None or not checks._inside_panel_union((proj[0], proj[1]), polygons))
    old_bbox_fraction = sum(outside_flags) / len(outside_flags)
    assert old_bbox_fraction > THRESHOLDS["C4"]["max_fraction"]  # the bbox corners really would FAIL

    report = checks.compute_c4_analytic(scene, CORNER_90, THRESHOLDS)
    print("surface-sample proxy:", report["value"], "vs old bbox fraction:", old_bbox_fraction)
    assert report["status"] == "PASS"
    assert report["value"]["max_fraction"] <= THRESHOLDS["C4"]["max_fraction"]


def _mutated_scene_can_moved_oob():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "can":
            for kf in obj["keyframes"]:
                kf["pos"] = [50.0, 2.0, 50.0]
    return mutated


def test_compute_c4_falls_back_to_analytic_when_no_renders_exist(tmp_path):
    mutated = _mutated_scene_can_moved_oob()
    report = checks.compute_c4(tmp_path, mutated, CORNER_90, THRESHOLDS, times_ms=[0])
    print("compute_c4 no renders:", report["value"], report["status"])
    assert report["check"] == "C4"
    assert report["status"] == "FAIL"  # same as compute_c4_analytic alone
    assert report["source"] == "anchor_proxy_no_renders"


def test_compute_c4_prefers_the_real_mask_over_a_conservative_analytic_fail(tmp_path):
    # Reproduces the real discrepancy from reports/gates.md's G3 run: the
    # analytic proxy would FAIL (can moved off both panels), but the
    # actual rendered silhouette (mask_ref.png) shows nothing out of
    # bounds -- compute_c4 must trust the render, not the analytic proxy.
    mutated = _mutated_scene_can_moved_oob()

    analytic_only = checks.compute_c4_analytic(mutated, CORNER_90, THRESHOLDS)
    assert analytic_only["status"] == "FAIL"  # confirms the proxy really would fail here

    true_eye = CORNER_90["eye"]
    ref_camera = CORNER_90["ref_camera"]
    poly_l = checks._panel_quad_px(CORNER_90["panels"][0], true_eye, ref_camera)
    mask = np.zeros((ref_camera["res"][1], ref_camera["res"][0]), dtype=np.uint8)
    cv2.fillConvexPoly(mask, poly_l.astype(np.int32), 255)  # white only inside L -- a clean render

    run_dir = tmp_path / "v1"
    (run_dir / "t_0").mkdir(parents=True)
    cv2.imwrite(str(run_dir / "t_0" / "mask_ref.png"), mask)

    report = checks.compute_c4(run_dir, mutated, CORNER_90, THRESHOLDS, times_ms=[0])
    print("compute_c4 with clean render:", report["value"], report["status"])
    assert report["check"] == "C4"
    assert report["status"] == "PASS"
    assert report["source"] == "mask_ref.png"
    assert report["analytic_estimate"]["status"] == "FAIL"  # visible for debugging, doesn't drive status
