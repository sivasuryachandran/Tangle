"""STUB checker. Same CLI as `python -m checker.run`. Numbers are FAKE: C5 'fails' when text height_m < 1.0."""
import argparse, json
from pathlib import Path

ap = argparse.ArgumentParser()
for k in ("dir", "true", "thresholds", "out"):
    ap.add_argument("--" + k, required=True)
a = ap.parse_args()
d = Path(a.dir)
scene = json.loads((d / "scene.json").read_text())
texts = [o for o in scene["objects"] if o["type"] == "text"]
arcmin = min((o["height_m"] * 20 for o in texts), default=99.0)
c5 = "PASS" if arcmin >= 20 else "FAIL"
ok = lambda c: {"check": c, "status": "PASS", "value": {"STUB": True}, "limit": {"STUB": True}}
checks = [ok("C1"), ok("C2"), ok("C3"), ok("C4"),
          {"check": "C5", "status": c5, "value": {"min_arcmin": arcmin}, "limit": {"min_arcmin": 20},
           "details": [{"object": o["id"], "arcmin": o["height_m"] * 20} for o in texts]}]
for c in checks:
    c["label"] = "STUB — fake value"
overall = "PASS" if c5 == "PASS" else "FAIL"
Path(a.out).write_text(json.dumps({"STUB": True, "label": "STUB — fake data, not a real measurement",
                                   "run": f"{d.parent.name}/{d.name}", "checks": checks, "overall": overall}, indent=1))
if overall == "PASS":
    (d / "certificate.json").write_text(json.dumps({"STUB": True, "label": "STUB — NOT a real certificate"}, indent=1))
