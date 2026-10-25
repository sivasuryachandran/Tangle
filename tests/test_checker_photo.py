"""`photo` objects: a flat textured card (CLAUDE.md Section 7 step 4), e.g. a race-car image on black
that travels across the panels. The checker treats it as a flat quad in the local XY plane: the
object centre plus its 4 corners as anchors (C2), the 4 corners as C4 surface samples, no C5 (not
text), and no C3 text-crossing rule (a card moving across the corner is the point).
"""

import copy
import json

import cv2
import numpy as np
import pytest

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
LIBRARY = anchors_mod.load_object_library()
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")
REGRESSION_95 = geo.load_screen("screens/regression_95deg.json")


def card_scene(pos_a=(-4.0, 2.0, -2.0), pos_b=(-1.0, 2.0, -2.0), width=3.0, height=1.5, image="inputs/car.png", scale=1.0):
    obj = {"id": "car", "type": "photo", "image": image, "width_m": width,
           "keyframes": [{"t": 0, "pos": list(pos_a), "rot": [0, 0, 0], "scale": scale},
                         {"t": 4, "pos": list(pos_b), "rot": [0, 0, 0], "scale": scale}]}
    if height is not None:
        obj["height_m"] = height
    return {"duration_s": 4, "fps": 30, "objects": [obj], "backdrop": {"type": "room", "depth_m": 6, "color": "#000"}}


def test_card_anchors_are_centre_plus_four_corners_in_the_xy_plane():
    doc = anchors_mod.build_anchors(card_scene(), LIBRARY)
    at0 = [a for a in doc["anchors"] if a["t"] == 0.0]
    assert len(at0) == 5
    assert sorted(a["kind"] for a in at0) == ["center", "corner", "corner", "corner", "corner"]
    corners = np.array([a["p"] for a in at0 if a["kind"] == "corner"])
    assert np.allclose(sorted(set(corners[:, 0])), [-5.5, -2.5])  # width 3 centred on x = -4
    assert np.allclose(sorted(set(corners[:, 1])), [1.25, 2.75])  # height 1.5 centred on y = 2
    assert np.allclose(corners[:, 2], -2.0)  # flat: all corners share the centre's z


def test_card_height_comes_from_the_image_aspect_ratio_when_not_given(tmp_path):
    img_path = tmp_path / "car.png"
    cv2.imwrite(str(img_path), np.full((90, 160, 3), 255, np.uint8))  # 16:9
    scene = card_scene(height=None, image=str(img_path))
    assert anchors_mod.quad_size_m(scene["objects"][0]) == pytest.approx((3.0, 3.0 * 9 / 16))
    corners = anchors_mod.local_corners(scene["objects"][0], LIBRARY)
    assert corners[:, 1].max() - corners[:, 1].min() == pytest.approx(3.0 * 9 / 16)


def test_card_with_unreadable_image_and_no_height_says_so():
    with pytest.raises(ValueError, match="cannot read image"):
        anchors_mod.local_corners(card_scene(height=None, image="inputs/does_not_exist.png")["objects"][0], LIBRARY)


def test_card_at_scale_zero_has_no_anchors():
    doc = anchors_mod.build_anchors(card_scene(scale=0.0), LIBRARY)
    assert doc["anchors"] == []


def test_card_identity_passes_c2_and_c3_and_a_changed_corner_fails_c2():
    scene = card_scene()
    anchors = anchors_mod.build_anchors(scene, LIBRARY)
    c2 = checks.compute_c2(CORNER_90, CORNER_90, anchors, THRESHOLDS)
    assert c2["status"] == "PASS" and c2["value"]["mean_deg"] < 0.05
    assert checks.compute_c2(CORNER_90, REGRESSION_95, anchors, THRESHOLDS)["status"] == "FAIL"
    c3 = checks.compute_c3(CORNER_90, CORNER_90, scene, anchors, THRESHOLDS)
    assert c3["status"] == "PASS"  # a card is not text: no text-across-the-seam rule applies


def test_card_c4_uses_its_corners_and_fails_when_it_leaves_the_panels():
    inside = checks.compute_c4_analytic(card_scene(), CORNER_90, THRESHOLDS, LIBRARY)
    assert inside["status"] == "PASS"
    # far to the left of panel L (x from -8): the whole card is outside the panel union
    outside = checks.compute_c4_analytic(card_scene((-14.0, 2.0, -2.0), (-14.0, 2.0, -2.0)), CORNER_90, THRESHOLDS, LIBRARY)
    assert outside["status"] == "FAIL" and outside["value"]["max_fraction"] == 1.0


def test_card_is_ignored_by_c5_which_is_text_only():
    c5 = checks.compute_c5(card_scene(), CORNER_90, THRESHOLDS)
    assert c5["status"] == "PASS" and c5["value"]["min_arcmin"] is None
