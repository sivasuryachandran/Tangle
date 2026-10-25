"""C2 reprojection tests, per the build-order brief:
  - identity: assumed == true -> mean error ~0 (< 0.05 deg)
  - regression_95deg vs corner_90_demo -> FAIL
  - eye height 1.7 -> 1.9 -> FAIL
"""

import copy
import json

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()
ANCHORS = anchors_mod.build_anchors(SCENE, LIBRARY)

CORNER_90 = geo.load_screen("screens/corner_90_demo.json")
REGRESSION_95 = geo.load_screen("screens/regression_95deg.json")


def test_identity_mean_error_near_zero():
    report = checks.compute_c2(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    print("identity C2:", report["value"], "status:", report["status"])
    assert report["value"]["mean_deg"] < 0.05
    assert report["value"]["max_deg"] < 0.05
    assert report["status"] == "PASS"
    assert report["n_offscreen"] == 0  # every anchor in this fixture is in front of a panel


def test_regression_95deg_fails():
    # Content designed against the 90 deg corner, actually installed at 95 deg.
    report = checks.compute_c2(CORNER_90, REGRESSION_95, ANCHORS, THRESHOLDS)
    print("95deg regression C2:", report["value"], "status:", report["status"])
    assert report["status"] == "FAIL"
    assert report["value"]["max_deg"] > THRESHOLDS["C2"]["max_deg"]


def test_eye_height_change_fails():
    true_screen = copy.deepcopy(CORNER_90)
    true_screen["eye"] = [CORNER_90["eye"][0], 1.9, CORNER_90["eye"][2]]
    report = checks.compute_c2(CORNER_90, true_screen, ANCHORS, THRESHOLDS)
    print("eye height 1.7->1.9 C2:", report["value"], "status:", report["status"])
    assert report["status"] == "FAIL"
    # This mismatch is driven by the mean, not the max -- a smaller, more
    # pervasive error across anchors rather than a few extreme outliers.
    assert report["value"]["mean_deg"] > THRESHOLDS["C2"]["mean_deg"]


def test_object_does_not_exist_before_first_keyframe():
    # "title" first appears at t=7 in the scene fixture -- no anchors for
    # it before that, and it must not be held at its t=7 pose from t=0.
    anchor_times_for_title = {a["t"] for a in ANCHORS["anchors"] if a["object"] == "title"}
    assert min(anchor_times_for_title) == 7.0
    assert all(t >= 7.0 for t in anchor_times_for_title)
    # "can" has a keyframe at t=0, so it exists for the whole scene.
    anchor_times_for_can = {a["t"] for a in ANCHORS["anchors"] if a["object"] == "can"}
    assert min(anchor_times_for_can) == 0.0


def test_c2_detail_carries_display_only_pixel_distance():
    report = checks.compute_c2(CORNER_90, REGRESSION_95, ANCHORS, THRESHOLDS)
    assert report["details"], "expected at least one offending anchor"
    worst = report["details"][0]
    assert "px_dist" in worst
    assert worst["px_dist"] is None or worst["px_dist"] >= 0
    # identity case: Q coincides with the ray through P, so px_dist ~ 0 too.
    identity_report = checks.compute_c2(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    for d in identity_report["details"]:
        if d["px_dist"] is not None:
            assert d["px_dist"] < 0.5
