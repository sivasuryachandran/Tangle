"""compute_failure_times_s: seconds where C2/C4/C5 genuinely exceeded
their own limit, for agent/timeline.py's Argon-vs-checker agreement
metric (does Argon cite the same moments the checker flagged?).

agent/timeline.py's checker_failure_times() prefers report["failure_times_s"]
when present, falling back to reverse-engineering report.json's details
otherwise -- that fallback silently returns [] for a FAIL on C4's
mask-based path (details use "t_ms", not "t"), so checker.run always
providing this field directly (not leaving P3's code to guess) matters.
These tests confirm the field end to end, including real cross-checks
against agent.timeline itself.
"""

import json

from agent import timeline
from checker import anchors as anchors_mod
from checker import checks
from checker import geometry as geo

THRESHOLDS = json.loads(open("config/thresholds.json").read())
SCENE = anchors_mod.load_scene("tests/fixtures/scene_test.json")
LIBRARY = anchors_mod.load_object_library()
ANCHORS = anchors_mod.build_anchors(SCENE, LIBRARY)
CORNER_90 = geo.load_screen("screens/corner_90_demo.json")
REGRESSION_95 = geo.load_screen("screens/regression_95deg.json")


def test_c2_fail_produces_failure_times():
    c2 = checks.compute_c2(CORNER_90, REGRESSION_95, ANCHORS, THRESHOLDS)
    assert c2["status"] == "FAIL"
    times = checks.compute_failure_times_s([c2])
    print("C2 FAIL failure_times_s:", times)
    assert times  # non-empty
    assert all(isinstance(t, float) for t in times)
    assert times == sorted(times)


def test_c2_pass_produces_no_failure_times():
    c2 = checks.compute_c2(CORNER_90, CORNER_90, ANCHORS, THRESHOLDS)
    assert c2["status"] == "PASS"
    assert checks.compute_failure_times_s([c2]) == []


def test_c4_mask_based_details_use_t_ms_and_still_convert_correctly():
    # Reproduces the real risk directly: C4's mask-based path reports
    # "t_ms", not "t" -- compute_failure_times_s must handle that
    # explicitly rather than silently missing it (as P3's own fallback
    # parser does when this field is absent -- see module docstring).
    c4_mask_based = {
        "check": "C4",
        "status": "FAIL",
        "limit": {"max_fraction": 0.02},
        "details": [{"t_ms": 6500, "fraction_outside": 0.26, "white_px": 100}, {"t_ms": 0, "fraction_outside": 0.0, "white_px": 50}],
    }
    times = checks.compute_failure_times_s([c4_mask_based])
    print("C4 (t_ms) failure_times_s:", times)
    assert times == [6.5]  # only the over-limit one, converted ms -> s


def test_c4_analytic_fallback_details_use_t_in_seconds():
    c4_analytic = checks.compute_c4_analytic(SCENE, CORNER_90, THRESHOLDS)
    mutated_detail = {**c4_analytic, "details": [{"t": 6.5, "fraction_outside": 0.3}], "status": "FAIL"}
    times = checks.compute_failure_times_s([mutated_detail])
    assert times == [6.5]


def test_c5_fail_produces_failure_times():
    shrunk = {**SCENE, "objects": [dict(o, height_m=o["height_m"] / 10) if o["type"] == "text" else o for o in SCENE["objects"]]}
    c5 = checks.compute_c5(shrunk, CORNER_90, THRESHOLDS)
    assert c5["status"] == "FAIL"
    times = checks.compute_failure_times_s([c5])
    print("C5 FAIL failure_times_s:", times)
    assert times  # non-empty
    assert times[0] == 7.0  # the title's first keyframe/sample time in this fixture
    assert all(7.0 <= t <= 10.0 for t in times)  # title exists (and stays shrunk) from t=7 onward


def test_c1_and_c3_are_excluded_even_on_fail():
    # C1/C3 aren't time-indexed the same way (per-panel dims, per-seam) --
    # agent/timeline.py's own check list excludes them too.
    c1_fail = {"check": "C1", "status": "FAIL", "limit": {}, "details": [{"panel": "L", "t_ms": 0, "status": "MISSING"}]}
    c3_fail = {"check": "C3", "status": "FAIL", "limit": {"max_deg": 0.5}, "details": {"seams": []}}
    assert checks.compute_failure_times_s([c1_fail, c3_fail]) == []


def test_agent_timeline_prefers_this_field_and_matches_exactly():
    # End-to-end cross-check against P3's actual consumer, not just our
    # own assumption of its interface.
    c2 = checks.compute_c2(CORNER_90, REGRESSION_95, ANCHORS, THRESHOLDS)
    report = {"checks": [c2], "failure_times_s": checks.compute_failure_times_s([c2])}
    assert timeline.checker_failure_times(report) == report["failure_times_s"]
