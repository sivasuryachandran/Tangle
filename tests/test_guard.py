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
    guard.check(SCENE, [{"op": "add", "path": "/objects/0/keyframes/-", "value": {"t": 8, "pos": [1, 3, 1], "rot": [0, 0, 0], "scale": 1.4}}])

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


# ---- hero rule (reference = v1 scene) ----
V1 = json.loads((Path(__file__).parent / "fixtures" / "scene_argon_v1.json").read_text())
HERO = guard.hero_index(V1)


def hrej(patch, match=None):
    with pytest.raises(guard.PatchRejected) as e:
        guard.check(V1, patch, V1)
    if match:
        assert match in str(e.value)


def test_hero_is_object_with_label_text():
    assert V1["objects"][HERO]["id"] == "volt_can"


def test_hero_shrunk_below_90pct_rejected():
    hrej([{"op": "replace", "path": f"/objects/{HERO}/keyframes/3/scale", "value": 0.7}], "hero rule")


def test_hero_scale_zero_rejected():
    hrej([{"op": "replace", "path": f"/objects/{HERO}/keyframes/5/scale", "value": 0}], "scale 0")


def test_hero_small_reduction_within_90pct_ok():
    kf = V1["objects"][HERO]["keyframes"][3]["scale"]
    guard.check(V1, [{"op": "replace", "path": f"/objects/{HERO}/keyframes/3/scale", "value": round(kf * 0.95, 3)}], V1)


def test_hero_must_keep_a_popout_keyframe():
    ops = [{"op": "replace", "path": f"/objects/{HERO}/keyframes/{i}/pos", "value": [-1, 2.5, -1]}
           for i, k in enumerate(V1["objects"][HERO]["keyframes"]) if 0 <= k["pos"][0] <= 3 and 0 <= k["pos"][2] <= 3]
    assert ops
    hrej(ops[:6], "pop-out")


def test_hero_may_move_but_stay_in_popout():
    guard.check(V1, [{"op": "replace", "path": f"/objects/{HERO}/keyframes/4/pos", "value": [1.0, 2.5, 1.0]}], V1)


def test_at_most_one_nonhero_vanishes():
    # reference where no non-hero object vanishes: replace their zero keyframes with a small scale
    ref = json.loads(json.dumps(V1))
    for o in ref["objects"]:
        for k in o["keyframes"]:
            if k["scale"] == 0:
                k["scale"] = 0.5
    cands = [i for i, o in enumerate(ref["objects"]) if i != HERO]
    one = [{"op": "replace", "path": f"/objects/{cands[0]}/keyframes/0/scale", "value": 0}]
    guard.check(ref, one, ref)  # one non-hero vanishing is fine
    two = one + [{"op": "replace", "path": f"/objects/{cands[1]}/keyframes/0/scale", "value": 0}]
    with pytest.raises(guard.PatchRejected) as e:
        guard.check(ref, two, ref)
    assert "at most one" in str(e.value)
