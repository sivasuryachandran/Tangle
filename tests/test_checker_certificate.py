"""checker/certificate.py: only issued when overall == PASS, carries the
true spec hash, scene hash, thresholds, and every check's value.
"""

import json

import pytest

from checker import certificate as certificate_mod


def _fake_report(overall):
    return {
        "run": "demo/v1",
        "checks": [{"check": "C2", "status": overall, "value": {"mean_deg": 0.0}, "limit": {"mean_deg": 0.08}}],
        "overall": overall,
    }


def test_build_certificate_rejects_non_pass():
    with pytest.raises(ValueError):
        certificate_mod.build_certificate(".", "screens/corner_90_demo.json", {}, _fake_report("FAIL"))


def test_write_certificate_writes_nothing_on_fail(tmp_path):
    (tmp_path / "scene.json").write_text(json.dumps({"objects": []}))
    result = certificate_mod.write_certificate(tmp_path, "screens/corner_90_demo.json", {}, _fake_report("FAIL"))
    assert result is None
    assert not (tmp_path / "certificate.json").exists()


def test_write_certificate_on_pass(tmp_path):
    (tmp_path / "scene.json").write_text(json.dumps({"objects": []}))
    thresholds = json.loads(open("config/thresholds.json").read())
    report = _fake_report("PASS")
    cert = certificate_mod.write_certificate(tmp_path, "screens/corner_90_demo.json", thresholds, report)

    out = tmp_path / "certificate.json"
    assert out.exists()
    on_disk = json.loads(out.read_text())
    assert on_disk == cert
    assert cert["run"] == "demo/v1"
    assert cert["overall"] == "PASS"
    assert cert["true_screen_hash"].startswith("sha256:")
    assert cert["scene_hash"].startswith("sha256:")
    assert cert["thresholds"] == thresholds
    assert cert["checks"] == [{"check": "C2", "status": "PASS", "value": {"mean_deg": 0.0}, "limit": {"mean_deg": 0.08}}]


def test_certificate_hash_changes_with_scene_content(tmp_path):
    thresholds = {}
    (tmp_path / "scene.json").write_text(json.dumps({"objects": []}))
    cert_a = certificate_mod.build_certificate(tmp_path, "screens/corner_90_demo.json", thresholds, _fake_report("PASS"))
    (tmp_path / "scene.json").write_text(json.dumps({"objects": [{"id": "x"}]}))
    cert_b = certificate_mod.build_certificate(tmp_path, "screens/corner_90_demo.json", thresholds, _fake_report("PASS"))
    assert cert_a["scene_hash"] != cert_b["scene_hash"]
