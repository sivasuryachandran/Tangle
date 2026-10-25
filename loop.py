"""Tangle loop: A1 (or --scene) -> anchors -> render -> check -> if FAIL: A2 -> guard -> apply -> v+1 (max --rounds)."""
import argparse, json, shutil, subprocess, sys, time
from pathlib import Path

from agent import repair as A2
from agent.generate import make_scene
from agent.gemini import ROOT

PY = [sys.executable]


def sh(cmd):
    print("$", " ".join(map(str, cmd)), file=sys.stderr)
    subprocess.run([str(c) for c in cmd], check=True, cwd=ROOT)


def times_ms(scene):
    ts = {0}
    ts |= {round(k["t"] * 1000) for o in scene["objects"] for k in o["keyframes"]}
    ts |= set(range(0, int(scene["duration_s"] * 1000) + 1, 1000))
    return sorted(t for t in ts if t <= scene["duration_s"] * 1000)


def run_version(vdir, scene, assumed, true, thresholds, stub):
    vdir.mkdir(parents=True, exist_ok=True)
    (vdir / "scene.json").write_text(json.dumps(scene, indent=1))
    shutil.copy(assumed, vdir / "assumed_screen.json")
    shutil.copy(true, vdir / "true_screen.json")
    ts = times_ms(scene)
    (vdir / "times.json").write_text(json.dumps([f"t_{t}" for t in ts]))
    if stub:
        render, check = PY + ["tests/stubs/fake_render.py"], PY + ["tests/stubs/fake_check.py"]
        (vdir / "anchors.json").write_text(json.dumps({"STUB": True, "label": "STUB — fake anchors"}))
    else:
        render, check = ["node", "headless/render.mjs"], PY + ["-m", "checker.run"]
        sh(PY + ["-m", "checker.anchors", "--scene", vdir / "scene.json", "--out", vdir / "anchors.json"])
    sh(render + ["--scene", vdir / "scene.json", "--assumed", vdir / "assumed_screen.json", "--true", vdir / "true_screen.json",
                 "--anchors", vdir / "anchors.json", "--out", vdir, "--times", ",".join(map(str, ts)), "--video"])
    sh(check + (["--dir", vdir, "--true", vdir / "true_screen.json", "--thresholds", thresholds, "--out", vdir / "report.json"]))
    return json.loads((vdir / "report.json").read_text())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief")
    ap.add_argument("--assumed", required=True)
    ap.add_argument("--true", required=True)
    ap.add_argument("--scene")
    ap.add_argument("--rounds", type=int, default=4)
    ap.add_argument("--thresholds", default=str(ROOT / "config" / "thresholds.json"))
    ap.add_argument("--run-id")
    ap.add_argument("--stub", action="store_true", help="use tests/stubs fakes; run id gets a STUB_ prefix")
    a = ap.parse_args()
    if not a.scene and not a.brief:
        ap.error("need --brief or --scene")
    run_id = a.run_id or (("STUB_" if a.stub else "") + time.strftime("%Y%m%d_%H%M%S"))
    if a.stub and not run_id.startswith("STUB_"):
        run_id = "STUB_" + run_id
    scene = json.loads(Path(a.scene).read_text()) if a.scene else make_scene(a.brief, a.true)
    scene0 = json.loads(json.dumps(scene))  # v1 scene: reference for the hero rule
    thr = json.loads(Path(a.thresholds).read_text()) if Path(a.thresholds).exists() else None
    base = ROOT / "runs" / run_id
    for n in range(1, a.rounds + 1):
        vdir = base / f"v{n}"
        report = run_version(vdir, scene, a.assumed, a.true, a.thresholds, a.stub)
        print(f"v{n}: {report['overall']}{'  [STUB DATA]' if a.stub else ''}")
        if report["overall"] == "PASS":
            print(f"PASS at v{n} → {base}")
            return 0
        if n == a.rounds:
            break
        mp4 = vdir / "street.mp4"
        try:
            diag, patch, scene = A2.repair(scene, report, mp4 if mp4.exists() else None, thr, reference=scene0)
        except Exception as e:
            print(f"repair failed at v{n}: {e}", file=sys.stderr)
            return 2
        (vdir / "repair.json").write_text(json.dumps({"diagnosis": diag, "patch": patch}, indent=1))
        print(f"  Argon: {diag}\n  patch: {json.dumps(patch)}")
    print(f"FAIL after {a.rounds} rounds → {base}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
