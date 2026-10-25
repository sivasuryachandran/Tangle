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


def prepare(vdir, scene, assumed, true, stub):
    vdir.mkdir(parents=True, exist_ok=True)
    (vdir / "scene.json").write_text(json.dumps(scene, indent=1))
    shutil.copy(assumed, vdir / "assumed_screen.json")
    shutil.copy(true, vdir / "true_screen.json")
    ts = times_ms(scene)
    (vdir / "times.json").write_text(json.dumps([f"t_{t}" for t in ts]))
    if stub:
        (vdir / "anchors.json").write_text(json.dumps({"STUB": True, "label": "STUB — fake anchors"}))
    else:
        sh(PY + ["-m", "checker.anchors", "--scene", vdir / "scene.json", "--out", vdir / "anchors.json"])
    return ts


def render(vdir, ts, stub):
    """Renders at P1's `key` times (first, last + up to two in between: ~6 s instead of ~1 min). The stub uses the full list."""
    cmd = PY + ["tests/stubs/fake_render.py"] if stub else ["node", "headless/render.mjs"]
    sh(cmd + ["--scene", vdir / "scene.json", "--assumed", vdir / "assumed_screen.json", "--true", vdir / "true_screen.json",
              "--anchors", vdir / "anchors.json", "--out", vdir, "--times", ",".join(map(str, ts)) if stub else "key", "--video"])
    done = sorted((p.name for p in vdir.glob("t_*") if p.is_dir()), key=lambda n: int(n[2:]))
    (vdir / "times.json").write_text(json.dumps(done))  # the UI scrubber lists only what was actually rendered


def label_methods(report, mode):
    """Tag every check with how it was measured: analytic (math on anchors) vs image-based (needs renders)."""
    present = {c["check"] for c in report["checks"]}
    for c in report["checks"]:
        k = c["check"]
        if mode == "analytic":
            c["method"] = "analytic"
        elif k == "C1":
            c["method"] = "image-based"
        elif k == "C2":
            c["method"] = "analytic + image x-check" if "C2_image_xcheck" in present else "analytic"
        elif k == "C4":
            c["method"] = "analytic + mask x-check" if "C4_mask_xcheck" in present else "analytic"
        elif k in ("C3", "C5"):
            c["method"] = "analytic"
    report["mode"] = mode
    return report


def full_check(vdir, thresholds, stub):
    cmd = PY + ["tests/stubs/fake_check.py"] if stub else PY + ["-m", "checker.run"]
    sh(cmd + ["--dir", vdir, "--true", vdir / "true_screen.json", "--thresholds", thresholds, "--out", vdir / "report.json"])
    rep = label_methods(json.loads((vdir / "report.json").read_text()), "full")
    (vdir / "report.json").write_text(json.dumps(rep, indent=2))
    return rep


def analytic_check(vdir, thresholds, stub):
    """Render-free round: `checker.run --skip C1` (C2, C3, C5 analytic; C4 via P2's surface-sample proxy).
    A skipped check makes overall FAIL by design and suppresses the certificate, so a fast round can never be certified.
    A round whose every non-skipped hard check passes is a CANDIDATE; only the full render + full check can declare PASS."""
    if stub:
        sh(PY + ["tests/stubs/fake_check.py", "--dir", vdir, "--true", vdir / "true_screen.json", "--thresholds", thresholds, "--out", vdir / "report.json"])
        rep = json.loads((vdir / "report.json").read_text())
        rep["checks"] = [c for c in rep["checks"] if c["check"] != "C1"]
        (vdir / "certificate.json").unlink(missing_ok=True)
    else:
        sh(PY + ["-m", "checker.run", "--dir", vdir, "--true", vdir / "true_screen.json", "--thresholds", thresholds, "--out", vdir / "report.json", "--skip", "C1"])
        rep = json.loads((vdir / "report.json").read_text())
    hard = [c for c in rep["checks"] if c["check"] in ("C1", "C2", "C3", "C4", "C5") and c["status"] != "NOT RUN"]
    rep["candidate"] = bool(hard) and all(c["status"] == "PASS" for c in hard)
    rep["not_run"] = ["C1", "image cross-checks", "street.mp4"]
    rep = label_methods(rep, "analytic")
    (vdir / "report.json").write_text(json.dumps(rep, indent=2))
    return rep


def run_version(vdir, scene, assumed, true, thresholds, stub):
    ts = prepare(vdir, scene, assumed, true, stub)
    render(vdir, ts, stub)
    return full_check(vdir, thresholds, stub)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief")
    ap.add_argument("--assumed", required=True)
    ap.add_argument("--true", required=True)
    ap.add_argument("--scene")
    ap.add_argument("--rounds", type=int, default=6)
    ap.add_argument("--thresholds", default=str(ROOT / "config" / "thresholds.json"))
    ap.add_argument("--run-id")
    ap.add_argument("--inputs", help="inputs/<run_id> dir with photos + confirmed.json (brand facts) for A1")
    ap.add_argument("--fast", action="store_true", help="analytic checks each round; render only v1 and the final passing version")
    ap.add_argument("--stub", action="store_true", help="use tests/stubs fakes; run id gets a STUB_ prefix")
    a = ap.parse_args()
    if not a.scene and not a.brief and not a.inputs:
        ap.error("need --brief or --scene")
    run_id = a.run_id or (("STUB_" if a.stub else "") + time.strftime("%Y%m%d_%H%M%S"))
    if a.stub and not run_id.startswith("STUB_"):
        run_id = "STUB_" + run_id
    if not a.scene and len(json.loads(Path(a.true).read_text())["panels"]) != 2:
        ap.error("generation for this screen type is not enabled yet (A1 only has corner volumes); pass --scene to verify a saved scene")
    scene = json.loads(Path(a.scene).read_text()) if a.scene else make_scene(a.brief, a.true, inputs_dir=a.inputs)
    if a.inputs and not a.stub:
        from agent import inputs as I, texture
        conf = I.load_confirmed(a.inputs)
        if conf and conf.get("object_type") == "can" and conf.get("label_text"):
            try:
                texture.attach(scene, texture.make_label(a.inputs))
                print(f"label texture → {scene['objects'][next(i for i, o in enumerate(scene['objects']) if 'label_image' in o)]['label_image']}")
            except Exception as e:  # texture is optional: the can still renders with its flat color
                print(f"label texture skipped: {e}", file=sys.stderr)
    scene0 = json.loads(json.dumps(scene))  # v1 scene: reference for the hero rule
    thr = json.loads(Path(a.thresholds).read_text()) if Path(a.thresholds).exists() else None
    base = ROOT / "runs" / run_id
    t_start = time.time()
    rounds = []

    def finish(code, final_v):
        wall = round(time.time() - t_start, 1)
        (base / "loop_summary.json").write_text(json.dumps({"mode": "fast" if a.fast else "full", "stub": a.stub, "wall_s": wall,
                                                            "rounds": rounds, "final_version": final_v, "exit": code}, indent=1))
        print(f"wall time {wall} s ({'fast' if a.fast else 'full'} mode)")
        return code

    for n in range(1, a.rounds + 1):
        vdir = base / f"v{n}"
        t_r = time.time()
        if a.fast:
            ts = prepare(vdir, scene, a.assumed, a.true, a.stub)
            report = analytic_check(vdir, a.thresholds, a.stub)
            tag = "analytic (C1 skipped, FAIL by design)"
            if report.get("candidate"):
                # clean fast round = candidate: confirm with real renders + the full checker (and render v1 for before/after)
                (vdir / "report_analytic.json").write_text(json.dumps(report, indent=2))
                render(vdir, ts, a.stub)
                report = full_check(vdir, a.thresholds, a.stub)
                tag = "analytic → rendered + full check"
                if n > 1:
                    v1 = base / "v1"
                    (v1 / "report_analytic.json").write_text((v1 / "report.json").read_text())
                    render(v1, [int(t[2:]) for t in json.loads((v1 / "times.json").read_text())], a.stub)
                    full_check(v1, a.thresholds, a.stub)
        else:
            report = run_version(vdir, scene, a.assumed, a.true, a.thresholds, a.stub)
            tag = "full"
        c2 = next((c for c in report["checks"] if c["check"] == "C2"), None)
        rounds.append({"v": n, "overall": report["overall"], "how": tag, "seconds": round(time.time() - t_r, 1),
                       "c2_mean_deg": (c2 or {}).get("value", {}).get("mean_deg")})
        print(f"v{n}: {report['overall']} [{tag}]{'  [STUB DATA]' if a.stub else ''}  ({rounds[-1]['seconds']} s)")
        if report["overall"] == "PASS":
            print(f"PASS at v{n} → {base}")
            return finish(0, n)
        if n == a.rounds:
            break
        mp4 = vdir / "street.mp4"
        try:
            diag, patch, scene, extra = A2.repair(scene, report, mp4 if mp4.exists() else None, thr, reference=scene0)
        except Exception as e:
            print(f"repair failed at v{n}: {e}", file=sys.stderr)
            return finish(2, None)
        (vdir / "repair.json").write_text(json.dumps({"diagnosis": diag, "patch": patch, **extra}, indent=2))
        ag = extra["agreement"]
        print(f"  timestamps: argon {extra['failure_timestamps_s']} vs checker {extra['checker_failure_times_s']}  (precision {ag['precision']}, recall {ag['recall']}, tol ±{ag['tolerance_s']} s)")
        print(f"  Argon: {diag}\n  patch: {json.dumps(patch)}")
    print(f"FAIL after {a.rounds} rounds → {base}")
    return finish(1, None)


if __name__ == "__main__":
    sys.exit(main())
