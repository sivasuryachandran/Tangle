"""Per-panel pixel pitch / angular pixel size, and the thresholds restated in reference-camera pixels."""

import json

import pytest

from checker import geometry as geo
from checker import panel_scale

THRESHOLDS = json.loads(open("config/thresholds.json").read())
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")


def test_corner_demo_pitch_and_off_axis_pixel_size():
    left = panel_scale.panel_pixel_scale(CORNER_90, CORNER_90["panels"][0])
    assert left["pitch_mm"] == pytest.approx([8000 / 1920, 6000 / 1440])  # 4.17 mm both ways
    assert left["centre_distance_m"] == pytest.approx(17.3, abs=0.1)
    assert left["incidence_deg"] == pytest.approx(54.6, abs=0.2)
    across, up = left["arcmin_per_pixel"]
    assert across == pytest.approx(0.49, abs=0.02) and up == pytest.approx(0.83, abs=0.02)  # not 1.0: the eye is off-axis


def test_viewing_a_panel_head_on_gives_the_textbook_figure():
    # 1 m wide, 1000 px (1 mm pitch), eye 3.438 m straight ahead -> 1 mm / 3.438 m = 1 arcmin.
    screen = {"eye": [0.5, 0.5, 3.438], "panels": []}
    panel = {"name": "P", "pa": [0, 0, 0], "pb": [1, 0, 0], "pc": [0, 1, 0], "res": [1000, 1000]}
    scale = panel_scale.panel_pixel_scale(screen, panel)
    assert scale["incidence_deg"] == pytest.approx(0.0, abs=0.01)
    assert scale["arcmin_per_pixel"] == pytest.approx([1.0, 1.0], abs=0.01)


def test_pitch_is_per_panel_not_one_global_number():
    pitches = {sid: panel_scale.screen_pixel_scale(geo.load_screen(f"screens/{sid}.json"))[0]["pitch_mm"][0]
               for sid in ("corner_90_demo", "curved_wall", "flat_roadside")}
    assert pitches["corner_90_demo"] == pytest.approx(4.17, abs=0.01)
    assert pitches["curved_wall"] == pytest.approx(3.12, abs=0.01)
    assert pitches["flat_roadside"] == pytest.approx(5.00, abs=0.01)


def test_limits_in_named_reference_camera_pixels():
    limits = panel_scale.limits_in_reference_pixels(THRESHOLDS, CORNER_90)
    assert panel_scale.reference_camera_scale(CORNER_90) == pytest.approx(3.333, abs=0.001)
    assert limits["C2_mean"]["reference_camera_px"] == pytest.approx(0.08 * 60 / (60 / 1080 * 60), abs=1e-9)
    assert round(limits["C2_mean"]["reference_camera_px"], 1) == 1.4
    assert round(limits["C2_max"]["reference_camera_px"], 1) == 5.0
    assert round(limits["C3"]["reference_camera_px"], 1) == 3.6
    assert "reference-camera pixel" in limits["pixel"] and "1920x1080" in limits["pixel"]
    assert limits["C5_min_arcmin"] == THRESHOLDS["C5"]["min_arcmin"]
