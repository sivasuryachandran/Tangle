import json
import pytest
from agent import inputs as I

IMG = {"name": "a.png", "mime": "image/png", "bytes": b"x" * 100}


def test_upload_limits():
    I.validate_uploads([IMG])
    I.validate_uploads([IMG] * 3)
    with pytest.raises(I.InputError):
        I.validate_uploads([])
    with pytest.raises(I.InputError):
        I.validate_uploads([IMG] * 4)
    with pytest.raises(I.InputError, match="5 MB"):
        I.validate_uploads([{**IMG, "bytes": b"x" * (5 * 1024 * 1024 + 1)}])
    with pytest.raises(I.InputError, match="PNG or JPG"):
        I.validate_uploads([{**IMG, "mime": "image/gif"}])
    with pytest.raises(I.InputError, match="PDF"):
        I.validate_uploads([IMG], {"name": "b.doc", "mime": "application/msword", "bytes": b"x"})


def test_hex_normalization():
    assert I.normalize_hex("#e8341c") == "#E8341C"
    assert I.normalize_hex("f80") == "#FF8800"
    with pytest.raises(I.InputError):
        I.normalize_hex("red")


def test_parse_analysis_cleans_model_output():
    raw = json.dumps({"object_type": "bottle", "colors": ["#abc", "nope", "#112233", "#445566", "#778899"], "label_text": None,
                      "brand": {"colors": ["#1f6feb"], "tagline": "Go.", "forbidden_words": ["Cheap", " "]}})
    a = I.parse_analysis("```json\n" + raw + "\n```")
    assert a["object_type"] == "box"                      # unknown type falls back to a primitive
    assert a["colors"] == ["#AABBCC", "#112233", "#445566"]  # invalid dropped, capped at 3
    assert a["label_text"] is None and a["brand"]["forbidden_words"] == ["cheap"]


def test_no_geometry_keys_survive_parsing():
    a = I.parse_analysis(json.dumps({"object_type": "can", "colors": ["#fff"], "eye": [1, 2, 3], "corner_deg": 80, "panels": []}))
    assert not ({"eye", "corner_deg", "panels"} & set(a))


SCENE = {"objects": [{"id": "hero", "type": "can", "color": "#E8341C", "label_text": "FLARE"},
                     {"id": "tag", "type": "text", "text": "Light up the corner."}]}


def test_brand_violations():
    conf = {"object_type": "can", "colors": ["#E8341C"], "label_text": "FLARE", "tagline": "Light up the corner", "forbidden_words": ["cheap"]}
    assert I.brand_violations(SCENE, conf) == []
    bad = json.loads(json.dumps(SCENE)); bad["objects"][1]["text"] = "So cheap!"
    msgs = " ".join(I.brand_violations(bad, conf))
    assert "forbidden word 'cheap'" in msgs and "tagline" in msgs
    bad2 = json.loads(json.dumps(SCENE)); bad2["objects"][0]["color"] = "#000000"; bad2["objects"][0]["label_text"] = "OTHER"
    msgs = " ".join(I.brand_violations(bad2, conf))
    assert "color must be #E8341C" in msgs and "label_text" in msgs


def test_save_confirmed_roundtrip(tmp_path):
    c = I.save_confirmed(tmp_path, {"object_type": "can", "colors": ["#e8341c"], "label_text": " FLARE ", "tagline": "", "forbidden_words": ["Cheap", ""]})
    assert c == {"object_type": "can", "colors": ["#E8341C"], "label_text": "FLARE", "tagline": None, "forbidden_words": ["cheap"]}
    assert json.loads((tmp_path / "brand.json").read_text())["colors"] == ["#E8341C"]
    with pytest.raises(I.InputError):
        I.save_confirmed(tmp_path, {"object_type": "bottle"})


def test_label_prompt_and_resize():
    import cv2, numpy as np
    from agent import texture
    p = texture.label_prompt({"label_text": "ZING", "colors": ["#E63232", "#F0EBDC"], "tagline": "Taste the spark"})
    assert "ZING" in p and "#E63232" in p and "#F0EBDC" in p and "no script" in p and "Taste the spark" in p
    png = texture.to_2048x1024_png(cv2.imencode(".jpg", np.zeros((720, 1456, 3), np.uint8))[1].tobytes())
    im = cv2.imdecode(np.frombuffer(png, np.uint8), 1)
    assert im.shape[:2] == (1024, 2048)


def test_label_image_field_in_schema_and_not_patchable():
    import jsonschema
    from agent import guard
    sc = json.load(open("tests/fixtures/scene_test.json"))
    sc["objects"][0]["label_image"] = "inputs/x/label.png"
    jsonschema.validate(sc, guard.SCENE_SCHEMA)
    with pytest.raises(guard.PatchRejected):
        guard.check(sc, [{"op": "replace", "path": "/objects/0/label_image", "value": "x"}])


@pytest.mark.parametrize("path,ok", [("inputs/r/label.png", True), ("tests_js/fixtures/label_test.png", True), ("/etc/x.png", False),
                                     ("../x.png", False), ("a/../x.png", False), ("http://x.com/a.png", False), ("file:///a.png", False), ("a.jpg", False)])
def test_label_image_path_rules(path, ok):
    import jsonschema
    from agent import guard
    sc = json.load(open("tests/fixtures/scene_test.json"))
    sc["objects"][0]["label_image"] = path
    if ok:
        jsonschema.validate(sc, guard.SCENE_SCHEMA)
    else:
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(sc, guard.SCENE_SCHEMA)
