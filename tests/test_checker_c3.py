"""C3 seam, per CLAUDE.md Section 6 step 6, generalized to N panels and
declared seams (CLAUDE.md Section 3.2, decided 11:35). Both fixture
screens declare "seams": [["L", "R"]].

Three things are tested:
  - no declared seams -> status NOT APPLICABLE, not PASS/FAIL.
  - the hard rule: a text object's footprint spans both panels of a
    declared seam -> FAIL ("text across corner" in the original
    mutation-test list).
  - the seam-discontinuity "value": synthetic probes (since the shared
    scene_test.json fixture happens to have no anchors near the R side
    of the seam) confirming it reads 0 when both panels shift together
    (an eye-height change -- a C2 concern, not a seam artifact) and
    nonzero when only one panel's true geometry changes (the 95 deg
    regression -- a genuine seam artifact).
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


def test_c3_no_seams_is_not_applicable():
    no_seams_screen = {k: v for k, v in CORNER_90.items() if k != "seams"}
    report = checks.compute_c3(no_seams_screen, no_seams_screen, SCENE, ANCHORS, THRESHOLDS)
    print("C3 no seams:", report["status"], report["details"])
    assert report["status"] == "NOT APPLICABLE"
    assert report["details"]["seams"] == []


def test_c3_baseline_passes_no_crossing():
    report = checks.compute_c3(CORNER_90, CORNER_90, SCENE, ANCHORS, THRESHOLDS)
    print("C3 baseline:", report["value"], report["status"])
    assert report["status"] == "PASS"
    assert report["details"]["seams"][0]["seam"] == ["L", "R"]
    assert report["details"]["seams"][0]["text_crossing_edge"] == []


def test_c3_text_across_corner_fails():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "title":
            for kf in obj["keyframes"]:
                kf["pos"][0] = -1.0  # was -4.0 (safely on L); now straddles the seam
    mutated_anchors = anchors_mod.build_anchors(mutated, LIBRARY)
    report = checks.compute_c3(CORNER_90, CORNER_90, mutated, mutated_anchors, THRESHOLDS)
    print("C3 text across corner:", report["value"], report["status"], report["details"])
    assert report["status"] == "FAIL"
    crossing = report["details"]["seams"][0]["text_crossing_edge"]
    assert crossing
    assert all(set(c["panels"]) == {"L", "R"} for c in crossing)


_SYNTHETIC_SEAM_PROBES = {
    "times": [0.0],
    "anchors": [
        {"id": 0, "object": "probe", "t": 0.0, "p": [-0.1, 3.0, 0.0], "kind": "center"},  # on L, near edge
        {"id": 1, "object": "probe", "t": 0.0, "p": [0.0, 3.0, -0.1], "kind": "center"},  # on R, near edge
    ],
}
_EMPTY_SCENE = {"objects": [], "duration_s": 1, "fps": 30, "backdrop": {"type": "room", "depth_m": 1, "color": "#000"}}


def test_c3_seam_value_zero_when_eye_height_changes_symmetrically():
    true_screen = copy.deepcopy(CORNER_90)
    true_screen["eye"] = [CORNER_90["eye"][0], 1.9, CORNER_90["eye"][2]]
    report = checks.compute_c3(CORNER_90, true_screen, _EMPTY_SCENE, _SYNTHETIC_SEAM_PROBES, THRESHOLDS)
    print("C3 seam value, eye height change:", report["value"])
    assert report["value"]["max_seam_deg"] < 1e-9  # both panels remap identically -> no seam-specific jump


def test_c3_seam_value_nonzero_when_only_one_panel_rotates():
    report = checks.compute_c3(CORNER_90, REGRESSION_95, _EMPTY_SCENE, _SYNTHETIC_SEAM_PROBES, THRESHOLDS)
    print("C3 seam value, 95deg regression:", report["value"])
    assert report["value"]["max_seam_deg"] > 0.01  # R alone moved -> a real discontinuity at the seam
