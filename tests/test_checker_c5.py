"""C5 readability: text angular height = 2*atan(h/2/d) in arcmin.

Mutation test shrinks text height 10x, not 4x -- 4x still passes at
~40 arcmin (team-agreed override, see the P2 setup brief / reports/notes.md).
"""

import copy
import json

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")


def _scaled_text_height(scene, factor):
    mutated = copy.deepcopy(scene)
    for obj in mutated["objects"]:
        if obj["type"] == "text":
            obj["height_m"] *= factor
    return mutated


def test_c5_baseline_passes():
    report = checks.compute_c5(SCENE, CORNER_90, THRESHOLDS)
    print("C5 baseline:", report["value"], report["status"])
    assert report["status"] == "PASS"
    assert report["value"]["min_arcmin"] >= THRESHOLDS["C5"]["min_arcmin"]


def test_c5_quarter_height_still_passes():
    report = checks.compute_c5(_scaled_text_height(SCENE, 0.25), CORNER_90, THRESHOLDS)
    print("C5 height/4:", report["value"], report["status"])
    assert report["status"] == "PASS"
    assert 30 < report["value"]["min_arcmin"] < 50  # ~40 arcmin per the pre-event probe


def test_c5_tenth_height_fails():
    report = checks.compute_c5(_scaled_text_height(SCENE, 0.10), CORNER_90, THRESHOLDS)
    print("C5 height/10:", report["value"], report["status"])
    assert report["status"] == "FAIL"
    assert report["value"]["min_arcmin"] < THRESHOLDS["C5"]["min_arcmin"]


def test_c5_no_text_objects_passes_trivially():
    no_text = copy.deepcopy(SCENE)
    no_text["objects"] = [o for o in no_text["objects"] if o["type"] != "text"]
    report = checks.compute_c5(no_text, CORNER_90, THRESHOLDS)
    assert report["status"] == "PASS"
    assert report["value"]["min_arcmin"] is None


def test_c5_skips_text_at_scale_zero_because_it_is_not_rendered():
    """Argon fades text in from scale 0; that frame is invisible (Section 3.3), so it must not read as 0 arcmin."""
    screen = geo.load_screen("screens/corner_90_demo.json")
    scene = {"duration_s": 4, "fps": 30, "backdrop": {"type": "room", "depth_m": 6, "color": "#000"}, "objects": [
        {"id": "t", "type": "text", "text": "Hello", "height_m": 0.8, "keyframes": [
            {"t": 1.0, "pos": [-4, 3, -0.2], "rot": [0, 0, 0], "scale": 0},
            {"t": 2.0, "pos": [-4, 3, -0.2], "rot": [0, 0, 0], "scale": 1}]}]}
    report = checks.compute_c5(scene, screen, THRESHOLDS)
    assert report["status"] == "PASS"
    assert all(d["height_m"] > 0 for d in report["details"])
    # visible but tiny text still fails: scale 0.02 at the first keyframe is rendered
    scene["objects"][0]["keyframes"][0]["scale"] = 0.02
    assert checks.compute_c5(scene, screen, THRESHOLDS)["status"] == "FAIL"
