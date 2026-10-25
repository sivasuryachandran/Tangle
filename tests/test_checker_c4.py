"""C4 out-of-bounds.

compute_c4_analytic: anchors (object centers + AABB corners) projected
from the TRUE eye must land inside the union of the TRUE panels'
projected quads. This is an anchor-count proxy for the pixel-fraction
definition in CLAUDE.md Section 6 step 7 (which needs mask_ref.png) --
conservative, since a rounded object's AABB corners sit past its real
silhouette.

compute_c4: the orchestrator checker.run actually uses. It prefers the
real mask_ref.png pixel measurement when renders exist (the literal
spec definition), falling back to compute_c4_analytic only when they
don't. This matters in practice: a real Argon G3 run hit exactly this
case (reports/gates.md, Oct 25) -- analytic reported 0.26 at t=6.5s
while the actual rendered mask showed 0.0, because the AABB corners of
a scaled-up can stuck out past its real cylindrical silhouette.
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
    anchors_doc = anchors_mod.build_anchors(SCENE, LIBRARY)
    report = checks.compute_c4_analytic(SCENE, CORNER_90, anchors_doc, THRESHOLDS)
    print("C4 baseline:", report["value"], report["status"])
    assert report["status"] == "PASS"
    assert report["value"]["max_fraction"] == 0.0


def test_c4_hero_moved_outside_panel_union_fails():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "can":
            for kf in obj["keyframes"]:
                kf["pos"] = [50.0, 2.0, 50.0]  # far outside both panels
    anchors_doc = anchors_mod.build_anchors(mutated, LIBRARY)
    report = checks.compute_c4_analytic(mutated, CORNER_90, anchors_doc, THRESHOLDS)
    print("C4 hero moved OOB:", report["value"], report["status"])
    assert report["status"] == "FAIL"
    assert report["value"]["max_fraction"] > THRESHOLDS["C4"]["max_fraction"]
    assert any(o["object"] == "can" for o in report["example_offenders"])


def _mutated_scene_can_moved_oob():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "can":
            for kf in obj["keyframes"]:
                kf["pos"] = [50.0, 2.0, 50.0]
    return mutated


def test_compute_c4_falls_back_to_analytic_when_no_renders_exist(tmp_path):
    mutated = _mutated_scene_can_moved_oob()
    anchors_doc = anchors_mod.build_anchors(mutated, LIBRARY)
    report = checks.compute_c4(tmp_path, mutated, CORNER_90, anchors_doc, THRESHOLDS, times_ms=[0])
    print("compute_c4 no renders:", report["value"], report["status"])
    assert report["check"] == "C4"
    assert report["status"] == "FAIL"  # same as compute_c4_analytic alone
    assert report["source"] == "anchor_proxy_no_renders"


def test_compute_c4_prefers_the_real_mask_over_a_conservative_analytic_fail(tmp_path):
    # Reproduces the real discrepancy from reports/gates.md's G3 run: the
    # anchor-corner proxy would FAIL (can moved off both panels), but the
    # actual rendered silhouette (mask_ref.png) shows nothing out of
    # bounds -- compute_c4 must trust the render, not the AABB proxy.
    mutated = _mutated_scene_can_moved_oob()
    anchors_doc = anchors_mod.build_anchors(mutated, LIBRARY)

    analytic_only = checks.compute_c4_analytic(mutated, CORNER_90, anchors_doc, THRESHOLDS)
    assert analytic_only["status"] == "FAIL"  # confirms the proxy really would fail here

    true_eye = CORNER_90["eye"]
    ref_camera = CORNER_90["ref_camera"]
    poly_l = checks._panel_quad_px(CORNER_90["panels"][0], true_eye, ref_camera)
    mask = np.zeros((ref_camera["res"][1], ref_camera["res"][0]), dtype=np.uint8)
    cv2.fillConvexPoly(mask, poly_l.astype(np.int32), 255)  # white only inside L -- a clean render

    run_dir = tmp_path / "v1"
    (run_dir / "t_0").mkdir(parents=True)
    cv2.imwrite(str(run_dir / "t_0" / "mask_ref.png"), mask)

    report = checks.compute_c4(run_dir, mutated, CORNER_90, anchors_doc, THRESHOLDS, times_ms=[0])
    print("compute_c4 with clean render:", report["value"], report["status"])
    assert report["check"] == "C4"
    assert report["status"] == "PASS"
    assert report["source"] == "mask_ref.png"
    assert report["analytic_estimate"]["status"] == "FAIL"  # visible for debugging, doesn't drive status
