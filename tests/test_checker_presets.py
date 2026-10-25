"""The N-panel screen presets (CLAUDE.md Section 3.2): flat_roadside,
curved_wall, three_face. Contract checks the renderer also relies on
(every panel faces every eye, seams name real panels, eye_path is a list
of [x, y, z], panel names safe as file names), identity C2, and that the
checks generalize: C2 catches a moved eye on N panels, C3 runs per seam,
and C2 never PASSes when nothing lands on a panel.
"""

import copy
import json
import re

import cv2
import numpy as np
import pytest

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()
ANCHORS = anchors_mod.build_anchors(SCENE, LIBRARY)
PRESETS = ["flat_roadside", "curved_wall", "three_face"]
# P1's renderer writes t_<ms>/<name>.png; these names would clobber its other outputs.
RESERVED = {"street", "reference", "mask_ref", "idpass_street"}


def load(preset_id):
    return geo.load_screen(f"screens/{preset_id}.json")


@pytest.mark.parametrize("preset_id", PRESETS)
def test_preset_contract(preset_id):
    spec = load(preset_id)
    assert spec["id"] == preset_id
    eyes = [spec["eye"]] + spec.get("eye_path", [])
    for e in eyes:
        assert len(e) == 3
    names = [p["name"] for p in spec["panels"]]
    assert len(set(names)) == len(names)
    for p in spec["panels"]:
        assert re.fullmatch(r"[A-Za-z0-9_-]+", p["name"]) and p["name"] not in RESERVED
        pa, pb, pc = (np.array(p[k], float) for k in ("pa", "pb", "pc"))
        n = np.cross(pb - pa, pc - pa)
        n /= np.linalg.norm(n)
        for e in eyes:
            assert np.dot(n, np.array(e, float) - pa) > 0, (p["name"], e)
    for a, b in spec.get("seams", []):
        assert a in names and b in names


def test_curved_wall_has_16_segments_and_15_seams():
    spec = load("curved_wall")
    assert len(spec["panels"]) == 16
    assert len(spec["seams"]) == 15
    assert spec["approximation"]["segments"] == 16


@pytest.mark.parametrize("preset_id", ["curved_wall", "three_face"])
def test_identity_c2_passes_and_moved_eye_fails(preset_id):
    spec = load(preset_id)
    c2 = checks.compute_c2(spec, spec, ANCHORS, THRESHOLDS)
    assert c2["status"] == "PASS" and c2["value"]["mean_deg"] < 0.05
    moved = copy.deepcopy(spec)
    moved["eye"][1] += 0.3
    assert checks.compute_c2(spec, moved, ANCHORS, THRESHOLDS)["status"] == "FAIL"


def test_three_face_c3_runs_per_seam_and_catches_text_across_a_seam():
    # scene_test's 16-char title (7.7 m wide from x=-4) crosses the left/front seam at x=-2.
    spec = load("three_face")
    c3 = checks.compute_c3(spec, spec, SCENE, ANCHORS, THRESHOLDS)
    assert len(c3["details"]["seams"]) == 2
    assert c3["status"] == "FAIL"


def test_c2_is_not_run_when_no_anchor_lands_on_a_panel():
    # scene_test sits in the corner volumes, below the roadside panel (y 6-10.8 m).
    spec = load("flat_roadside")
    c2 = checks.compute_c2(spec, spec, ANCHORS, THRESHOLDS)
    assert c2["status"] == "NOT RUN"
    assert c2["value"]["mean_deg"] is None
    assert c2["n_offscreen"] == len(ANCHORS["anchors"])


def test_c6_along_eye_path_tolerates_unmeasured_points(tmp_path):
    spec = load("flat_roadside")
    c6 = checks.compute_c6_zone_heatmap(spec, spec, ANCHORS, THRESHOLDS)
    assert c6["value"]["layout"] == "path"
    assert c6["value"]["n_points"] == len(spec["eye_path"])
    assert c6["value"]["min_mean_deg"] is None
    out = tmp_path / "zone_heatmap.png"
    assert checks.render_zone_heatmap_png(c6, THRESHOLDS, out)
    assert cv2.imread(str(out)) is not None
