"""checker/run.py: assemble report.json from a render output directory
(scene.json, assumed_screen.json, anchors.json, t_<ms>/L.png + R.png) and a
TRUE screen spec, per CLAUDE.md Section 6 step 10 and Section 3.6. Also
writes certificate.json alongside it when overall == PASS.

The TRUE screen comes from --true, not from true_screen.json inside --dir:
at demo time (CLAUDE.md Section 9 step 3), the judge changes the live
geometry and the *existing* render is checked against the *new* true
spec, without re-rendering. --dir's own true_screen.json (what was true
when it was rendered) is left untouched for provenance.

CLI: python -m checker.run --dir runs/<id>/v<N> --true T.json --thresholds config/thresholds.json --out report.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from checker import certificate as certificate_mod
from checker import checks
from checker import geometry as geo


def load_json(path) -> dict:
    return json.loads(Path(path).read_text())


def discover_times_ms(run_dir: Path) -> list[int]:
    return sorted(int(p.name.split("_", 1)[1]) for p in run_dir.glob("t_*") if p.is_dir())


def run(run_dir, true_screen_path, thresholds_path, out_path) -> dict:
    run_dir = Path(run_dir)
    scene = load_json(run_dir / "scene.json")
    assumed_screen = load_json(run_dir / "assumed_screen.json")
    anchors_doc = load_json(run_dir / "anchors.json")
    true_screen = geo.load_screen(true_screen_path)  # also asserts panels face eye
    thresholds = load_json(thresholds_path)
    times_ms = discover_times_ms(run_dir)

    hard_checks = [
        checks.compute_c1(run_dir, true_screen, times_ms),
        checks.compute_c2(assumed_screen, true_screen, anchors_doc, thresholds),
        checks.compute_c3(assumed_screen, true_screen, scene, anchors_doc, thresholds),
        checks.compute_c4(run_dir, scene, true_screen, anchors_doc, thresholds, times_ms),
        checks.compute_c5(scene, true_screen, thresholds),
    ]
    # Diagnostic cross-checks against P1's actual renders (idpass_street.png,
    # mask_ref.png) -- informational only, never part of overall (CLAUDE.md
    # Section 6 steps 4 and 7; "Argon proposes, the checker decides" means
    # the 5 named checks above, not these). C4_analytic_xcheck is the
    # anchor-corner proxy that used to be C4's own authority -- kept
    # visible since it's a useful (conservative) pre-render estimate, but
    # demoted once a real mask_ref.png is available (see checks.compute_c4).
    c4_analytic_xcheck = dict(checks.compute_c4_analytic(scene, true_screen, anchors_doc, thresholds))
    c4_analytic_xcheck["check"] = "C4_analytic_xcheck"
    xchecks = [
        checks.compute_c2_image_crosscheck(run_dir, assumed_screen, true_screen, anchors_doc, times_ms),
        checks.compute_c4_mask_crosscheck(run_dir, true_screen, times_ms),
        c4_analytic_xcheck,
    ]
    # C6 (info only): sweet-spot heatmap, if the TRUE screen has a viewing_zone.
    c6_report = checks.compute_c6_zone_heatmap(assumed_screen, true_screen, anchors_doc, thresholds)
    checks.render_zone_heatmap_png(c6_report, thresholds, run_dir / "zone_heatmap.png")
    check_reports = hard_checks + xchecks + [c6_report]

    # NOT APPLICABLE (e.g. C3 on a screen with no declared seams) is not a
    # failure -- there was nothing for that check to find wrong.
    overall = "PASS" if all(r["status"] in ("PASS", "NOT APPLICABLE") for r in hard_checks) else "FAIL"
    report = {
        "run": f"{run_dir.parent.name}/{run_dir.name}",
        "checks": check_reports,
        "overall": overall,
    }
    Path(out_path).write_text(json.dumps(report, indent=2))
    certificate_mod.write_certificate(run_dir, true_screen_path, thresholds, report)
    return report


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="render output dir + true screen spec -> report.json")
    parser.add_argument("--dir", required=True)
    parser.add_argument("--true", required=True)
    parser.add_argument("--thresholds", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    report = run(args.dir, args.true, args.thresholds, args.out)
    print(f"{report['run']}: overall {report['overall']} -> {args.out}")
    for c in report["checks"]:
        print(f"  {c['check']}: {c['status']} value={c['value']}")


if __name__ == "__main__":
    main()
