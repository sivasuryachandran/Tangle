"""C1 dims: L.png/R.png must match the panel's res exactly."""

import numpy as np
import cv2

from checker import checks
from checker import geometry as geo

CORNER_90 = geo.load_screen("screens/corner_90_demo.json")


def _write_panel_images(run_dir, t_ms, sizes_wh):
    out = run_dir / f"t_{t_ms}"
    out.mkdir(parents=True, exist_ok=True)
    for name, (w, h) in sizes_wh.items():
        cv2.imwrite(str(out / f"{name}.png"), np.zeros((h, w, 3), dtype=np.uint8))


def test_c1_passes_when_dims_match(tmp_path):
    _write_panel_images(tmp_path, 0, {"L": (1920, 1440), "R": (1920, 1440)})
    report = checks.compute_c1(tmp_path, CORNER_90, [0])
    assert report["status"] == "PASS"
    assert report["value"]["all_match"] is True


def test_c1_fails_on_wrong_resolution(tmp_path):
    _write_panel_images(tmp_path, 0, {"L": (1920, 1440), "R": (1000, 1000)})
    report = checks.compute_c1(tmp_path, CORNER_90, [0])
    assert report["status"] == "FAIL"
    bad = [d for d in report["details"] if not d.get("match", True)]
    assert bad and bad[0]["panel"] == "R" and bad[0]["actual"] == [1000, 1000]


def test_c1_fails_on_missing_file(tmp_path):
    _write_panel_images(tmp_path, 0, {"L": (1920, 1440)})  # R.png never written
    report = checks.compute_c1(tmp_path, CORNER_90, [0])
    assert report["status"] == "FAIL"
    assert any(d.get("status") == "MISSING" and d["panel"] == "R" for d in report["details"])
