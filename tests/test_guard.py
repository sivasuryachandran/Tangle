import copy, json, pytest
from pathlib import Path
from agent import guard

SCENE = json.loads((Path(__file__).parent / "fixtures" / "scene_test.json").read_text())

def rej(patch):
    with pytest.raises(guard.PatchRejected):
        guard.check(SCENE, patch)

def test_ok_move_and_height():
    new = guard.check(SCENE, [{"op": "replace", "path": "/objects/0/keyframes/1/pos", "value": [1.5, 3, 1.0]},
                              {"op": "replace", "path": "/objects/1/height_m", "value": 1.0}])
    assert new["objects"][1]["height_m"] == 1.0 and SCENE["objects"][1]["height_m"] == 0.8

def test_ok_add_keyframe():
    guard.check(SCENE, [{"op": "add", "path": "/objects/0/keyframes/-", "value": {"t": 8, "pos": [1, 3, 1], "rot": [0, 0, 0], "scale": 0}}])

def test_rejects_object_add_remove():
    rej([{"op": "remove", "path": "/objects/1"}])
    rej([{"op": "add", "path": "/objects/-", "value": {}}])

def test_rejects_other_paths():
    rej([{"op": "replace", "path": "/backdrop/color", "value": "#000"}])
    rej([{"op": "replace", "path": "/duration_s", "value": 5}])
    rej([{"op": "replace", "path": "/objects/1/text", "value": "x"}])
    rej([{"op": "replace", "path": "/objects/0/id", "value": "x"}])

def test_rejects_too_many_ops():
    rej([{"op": "replace", "path": "/objects/0/color", "value": "#111"}] * 7)

def test_rejects_volume():
    rej([{"op": "replace", "path": "/objects/0/keyframes/0/pos", "value": [5, 3, 5]}])
    rej([{"op": "replace", "path": "/objects/1/keyframes/0/pos", "value": [-4, 4.5, 0.05]}])

def test_rejects_bad_ops_and_unapplicable():
    rej([{"op": "move", "from": "/objects/0/color", "path": "/objects/1/color"}])
    rej([{"op": "replace", "path": "/objects/0/keyframes/9/pos", "value": [0, 0, -1]}])
    rej([{"op": "replace", "path": "/objects/0/keyframes/0/scale", "value": 99}])
