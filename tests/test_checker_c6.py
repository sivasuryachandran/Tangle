"""C6 (info only): C2 mean at each viewing_zone grid point -> sweet-spot
map. No threshold, not a certificate gate -- these tests just confirm
the grid expansion and heatmap rendering are correct.
"""

import json

import cv2

from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()
ANCHORS = anchors_mod.build_anchors(SCENE, LIBRARY)
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")


def test_viewing_zone_grid_expands_to_49_points():
    points = checks._viewing_zone_grid_points(CORNER_90["viewing_zone"])
    assert len(points) == 7 * 1 * 7
    # grid [7,1,7] with half_extent y=0 -> every point shares the center's y.
    assert all(p[1] == CORNER_90["viewing_zone"]["center"][1] for p in points)
    assert points[0] == (7.0, 1.7, 7.0)  # center - half_extent on x and z
    assert points[-1] == (13.0, 1.7, 13.0)  # center + half_extent on x and z


def test_c6_at_the_designed_eye_matches_c2_identity():
    report = checks.compute_c6_zone_heatmap(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    print("C6 value:", report["value"])
    assert report["check"] == "C6"
    assert report["status"] is None  # informational, not a gate
    assert len(report["details"]) == 49
    # the grid's exact center point is the designed eye -> same as the C2 identity test.
    center_point = next(p for p in report["details"] if abs(p["x"] - 10) < 1e-9 and abs(p["z"] - 10) < 1e-9)
    assert center_point["mean_deg"] < 1e-5


def test_c6_degrades_away_from_the_designed_eye():
    report = checks.compute_c6_zone_heatmap(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    center_point = next(p for p in report["details"] if abs(p["x"] - 10) < 1e-9 and abs(p["z"] - 10) < 1e-9)
    corner_point = report["details"][0]  # x=7, z=7 -- furthest grid corner from the designed eye
    print("center mean_deg:", center_point["mean_deg"], "corner mean_deg:", corner_point["mean_deg"])
    assert corner_point["mean_deg"] > center_point["mean_deg"]


def test_c6_missing_viewing_zone_is_informational_noop():
    screen_no_zone = dict(CORNER_90)
    del screen_no_zone["viewing_zone"]
    report = checks.compute_c6_zone_heatmap(CORNER_90, screen_no_zone, ANCHORS, THRESHOLDS)
    assert report["details"] == []
    assert report["status"] is None


def test_render_zone_heatmap_png_writes_a_correctly_sized_image(tmp_path):
    report = checks.compute_c6_zone_heatmap(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    out_path = tmp_path / "zone_heatmap.png"
    wrote = checks.render_zone_heatmap_png(report, THRESHOLDS, out_path, cell_px=20)
    assert wrote is True
    assert out_path.exists()
    img = cv2.imread(str(out_path))
    gx, gy, gz = report["value"]["grid"]
    assert img.shape == (gz * 20, gx * 20, 3)


def test_render_zone_heatmap_png_noop_when_no_zone(tmp_path):
    empty_report = {"check": "C6", "status": None, "value": {}, "details": []}
    out_path = tmp_path / "zone_heatmap.png"
    wrote = checks.render_zone_heatmap_png(empty_report, THRESHOLDS, out_path)
    assert wrote is False
    assert not out_path.exists()
