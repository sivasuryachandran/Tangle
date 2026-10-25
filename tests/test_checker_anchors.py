"""checker/anchors.py object-lifecycle rules (CLAUDE.md Section 3.3):
  - no anchors before an object's first keyframe
  - no anchors while an object's interpolated scale is 0 ("vanish")
"""

import copy

from checker import anchors as anchors_mod

SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()


def test_scale_zero_at_a_keyframe_has_no_anchors_at_that_time():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "can":
            obj["keyframes"].append({"t": 3.0, "pos": [-1.0, 2.5, -1.0], "rot": [0, 0, 0], "scale": 0.0})
    anchors_doc = anchors_mod.build_anchors(mutated, LIBRARY)
    can_times = {a["t"] for a in anchors_doc["anchors"] if a["object"] == "can"}
    assert 3.0 not in can_times
    # still exists before and after the vanish point
    assert 2.5 in can_times
    assert 3.5 in can_times


def test_scale_held_at_zero_after_last_keyframe_has_no_anchors():
    mutated = copy.deepcopy(SCENE)
    for obj in mutated["objects"]:
        if obj["id"] == "title":
            obj["keyframes"] = [{"t": 7.0, "pos": [-4, 4.5, -0.05], "rot": [0, 0, 0], "scale": 0.0}]
    anchors_doc = anchors_mod.build_anchors(mutated, LIBRARY)
    assert not [a for a in anchors_doc["anchors"] if a["object"] == "title"]
