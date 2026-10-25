"""End-to-end test of checker/run.py: build a synthetic runs/<id>/v<N>
directory by hand (scene.json, assumed_screen.json, anchors.json,
t_0/L.png + R.png at the correct resolutions) and confirm report.json
comes out with all 5 checks and the right overall status.
"""

import json

import cv2
import numpy as np

from checker import anchors as anchors_mod
from checker import run as run_mod


def _make_run_dir(tmp_path, scene, assumed_screen, correct_image_sizes=True):
    run_dir = tmp_path / "demo_run" / "v1"
    run_dir.mkdir(parents=True)
    (run_dir / "scene.json").write_text(json.dumps(scene))
    (run_dir / "assumed_screen.json").write_text(json.dumps(assumed_screen))

    library = anchors_mod.load_object_library()
    anchors_doc = anchors_mod.build_anchors(scene, library)
    (run_dir / "anchors.json").write_text(json.dumps(anchors_doc))

    t0 = run_dir / "t_0"
    t0.mkdir()
    for panel in assumed_screen["panels"]:
        w, h = panel["res"]
        if not correct_image_sizes:
            w, h = w // 2, h // 2
        cv2.imwrite(str(t0 / f"{panel['name']}.png"), np.zeros((h, w, 3), dtype=np.uint8))
    return run_dir


def test_run_end_to_end_all_pass(tmp_path):
    scene = anchors_mod.load_scene("tests/fixtures/scene_test.json")
    screen = json.loads(open("screens/corner_90_demo.json").read())
    run_dir = _make_run_dir(tmp_path, scene, screen, correct_image_sizes=True)

    out_path = tmp_path / "report.json"
    report = run_mod.run(run_dir, "screens/corner_90_demo.json", "config/thresholds.json", out_path)

    print("run report:", report["run"], report["overall"])
    for c in report["checks"]:
        print(" ", c["check"], c["status"], c["value"])

    assert out_path.exists()
    assert json.loads(out_path.read_text()) == report
    assert report["run"] == "demo_run/v1"
    check_names = {c["check"] for c in report["checks"]}
    assert {"C1", "C2", "C3", "C4", "C5"}.issubset(check_names)
    assert {"C2_image_xcheck", "C4_mask_xcheck", "C4_analytic_xcheck", "C6"}.issubset(check_names)  # diagnostic/info only
    assert report["overall"] == "PASS"

    cert_path = run_dir / "certificate.json"
    assert cert_path.exists()
    cert = json.loads(cert_path.read_text())
    assert cert["overall"] == "PASS"
    assert cert["run"] == "demo_run/v1"


def test_run_end_to_end_fails_on_wrong_true_geometry(tmp_path):
    # Render was done assuming corner_90_demo, but at check time the true
    # spec is the 95 deg regression fixture -- the demo's "judge changes
    # the geometry" scenario (CLAUDE.md Section 9 step 3).
    scene = anchors_mod.load_scene("tests/fixtures/scene_test.json")
    screen = json.loads(open("screens/corner_90_demo.json").read())
    run_dir = _make_run_dir(tmp_path, scene, screen, correct_image_sizes=True)

    out_path = tmp_path / "report.json"
    report = run_mod.run(run_dir, "screens/regression_95deg.json", "config/thresholds.json", out_path)

    print("run report (regression):", report["run"], report["overall"])
    for c in report["checks"]:
        print(" ", c["check"], c["status"], c["value"])

    assert report["overall"] == "FAIL"
    c2 = next(c for c in report["checks"] if c["check"] == "C2")
    assert c2["status"] == "FAIL"
    assert not (run_dir / "certificate.json").exists()


def test_run_end_to_end_fails_on_wrong_image_dims(tmp_path):
    scene = anchors_mod.load_scene("tests/fixtures/scene_test.json")
    screen = json.loads(open("screens/corner_90_demo.json").read())
    run_dir = _make_run_dir(tmp_path, scene, screen, correct_image_sizes=False)

    out_path = tmp_path / "report.json"
    report = run_mod.run(run_dir, "screens/corner_90_demo.json", "config/thresholds.json", out_path)

    assert report["overall"] == "FAIL"
    c1 = next(c for c in report["checks"] if c["check"] == "C1")
    assert c1["status"] == "FAIL"
