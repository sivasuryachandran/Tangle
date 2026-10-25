"""C4 out-of-bounds (analytic): anchors projected from the TRUE eye must
land inside the union of the TRUE panels' projected quads.

This is an anchor-count proxy for the pixel-fraction definition in
CLAUDE.md Section 6 step 7 (which needs mask_ref.png); the mask-based
version is a cross-check once P1's renders exist, not a replacement.
"""

import copy
import json

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
