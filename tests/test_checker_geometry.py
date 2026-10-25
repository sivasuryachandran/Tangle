"""Sanity checks for checker/geometry.py: the ray-panel intersection round
trip and the Kooima frustum's correspondence to panel corners. These
de-risk the C2 computation, which depends on both being correct.
"""

import numpy as np
import pytest

from checker import geometry as geo

SCREEN = geo.load_screen("screens/corner_90_demo.json")


def test_panels_face_eye():
    for panel in SCREEN["panels"]:
        assert geo.assert_panel_faces_eye(panel, SCREEN["eye"]) > 0


def test_eye_height_change_still_faces_eye():
    # CLAUDE.md Section 6 test: eye height 1.7 -> 1.9 should not itself
    # violate the facing assertion (it's a C2 geometry change, not a
    # degenerate one).
    eye_19 = [SCREEN["eye"][0], 1.9, SCREEN["eye"][2]]
    for panel in SCREEN["panels"]:
        assert geo.assert_panel_faces_eye(panel, eye_19) > 0


def test_panel_facing_assertion_rejects_eye_behind_panel():
    panel = SCREEN["panels"][0]  # L: z=0 plane, faces +z
    with pytest.raises(ValueError):
        geo.assert_panel_faces_eye(panel, [-5, 1.7, -5])  # behind the panel


def test_ray_panel_hit_round_trip():
    L = geo.panel_by_name(SCREEN["panels"], "L")
    for u0, v0 in [(0.0, 0.0), (0.3, 0.7), (1.0, 1.0), (0.5, 0.5)]:
        target = geo.panel_point_from_uv(L, u0, v0)
        hit = geo.find_panel_hit(SCREEN["eye"], target, SCREEN["panels"])
        assert hit is not None
        assert hit.panel == "L"
        assert abs(hit.u - u0) < 1e-9
        assert abs(hit.v - v0) < 1e-9


def test_ray_panel_hit_picks_correct_panel_near_corner():
    R = geo.panel_by_name(SCREEN["panels"], "R")
    target = geo.panel_point_from_uv(R, 0.1, 0.5)
    hit = geo.find_panel_hit(SCREEN["eye"], target, SCREEN["panels"])
    assert hit is not None and hit.panel == "R"


def test_ray_missing_both_panels_returns_none():
    # A point far behind the corner, with the eye on the far side, never
    # crosses either panel's bounded extent.
    hit = geo.find_panel_hit(SCREEN["eye"], [-20, 20, -20], SCREEN["panels"])
    assert hit is None


def test_kooima_matrix_maps_panel_corners_to_frustum_edges():
    L = geo.panel_by_name(SCREEN["panels"], "L")
    M = geo.kooima_matrix(L, SCREEN["eye"])
    ndc_pa = geo.clip_to_ndc(geo.project_clip(M, L["pa"]))
    ndc_pb = geo.clip_to_ndc(geo.project_clip(M, L["pb"]))
    ndc_pc = geo.clip_to_ndc(geo.project_clip(M, L["pc"]))
    assert np.allclose(ndc_pa[:2], [-1, -1], atol=1e-9)
    assert np.allclose(ndc_pb[:2], [1, -1], atol=1e-9)
    assert np.allclose(ndc_pc[:2], [-1, 1], atol=1e-9)


def test_ray_angle_deg_zero_for_same_point():
    assert geo.ray_angle_deg(SCREEN["eye"], [0, 3, 0], [0, 3, 0]) < 1e-12


def test_ray_angle_deg_symmetric():
    a = geo.ray_angle_deg(SCREEN["eye"], [0, 3, 0], [1, 4, -1])
    b = geo.ray_angle_deg(SCREEN["eye"], [1, 4, -1], [0, 3, 0])
    assert abs(a - b) < 1e-12
