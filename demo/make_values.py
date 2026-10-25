"""demo/values.json from real reports only (runs/*/v*/report.json). No number is typed by hand.
  python demo/make_values.py <run_id>   (run must have full-mode reports, all carrying the same thresholds hash)"""
import json, sys, glob, re
from pathlib import Path
R = Path(__file__).resolve().parent.parent
run = sys.argv[1]
reps = {}
for f in sorted(glob.glob(str(R / "runs" / run / "v*" / "report.json")), key=lambda p: int(re.search(r"/v(\d+)/", p).group(1))):
    reps[int(re.search(r"/v(\d+)/", f).group(1))] = json.loads(Path(f).read_text())
hashes = {r.get("thresholds_sha256") for r in reps.values()}
assert len(hashes) == 1, f"mixed thresholds hashes: {hashes}"
c = lambda r, k: next(x for x in r["checks"] if x["check"] == k)
ts = json.loads((R / "runs" / run / "v1" / "true_screen.json").read_text())
import math
L, Rp = ts["panels"][0], ts["panels"][1]
a = [L["pa"][i] - L["pb"][i] for i in range(3)]; b = [Rp["pb"][i] - Rp["pa"][i] for i in range(3)]
ang = math.degrees(math.acos(sum(x * y for x, y in zip(a, b)) / (math.hypot(*a) * math.hypot(*b))))
best = min(reps, key=lambda n: c(reps[n], "C2")["value"]["max_deg"])
passed = any(r["overall"] == "PASS" for r in reps.values()) and (R / "runs" / run / f"v{max(n for n, r in reps.items() if r['overall'] == 'PASS')}" / "certificate.json").exists()
summ = json.loads((R / "runs" / run / "loop_summary.json").read_text()) if (R / "runs" / run / "loop_summary.json").exists() else {}
v1 = reps[1]; lim = v1["thresholds"]["C2"]["max_deg"]
vals = {"run_id": run, "best_v": best, "true_angle": round(ang, 1) if abs(ang - round(ang)) > .05 else int(round(ang)),
        "c2_mean_v1": round(c(v1, "C2")["value"]["mean_deg"], 3), "c2_max_v1": round(c(v1, "C2")["value"]["max_deg"], 2),
        "c2_max_best": round(c(reps[best], "C2")["value"]["max_deg"], 2), "c2_max_limit": lim,
        "c3_v1": round(c(v1, "C3")["value"]["max_seam_deg"], 3), "passed": passed, "versions": len(reps),
        "thresholds_hash": hashes.pop(), "run_time": f"{round(summ.get('wall_s', 0))} s" if summ.get("wall_s") else None,
        "modes": sorted({r.get("mode") for r in reps.values()})}
(R / "demo" / "values.json").write_text(json.dumps(vals, indent=1)); print(json.dumps(vals, indent=1))
