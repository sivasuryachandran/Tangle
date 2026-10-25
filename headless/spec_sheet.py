"""Spec sheet for one run: per-panel pixel pitch and what a pixel subtends at the eye (from P2's checker.panel_scale,
not recomputed here), the checker's limits in degrees and arcmin (pixels only with the pixel named), the measured values
from report.json, and the certification status.

  python headless/spec_sheet.py --run runs/<id>/v<N> [--out runs/<id>/v<N>/spec_sheet.html]

CERTIFIED is printed only when ALL of these hold: report.json overall is PASS, no check is NOT RUN / FLAGGED / skipped,
and certificate.json exists in the run folder. Otherwise the sheet says NOT CERTIFIED and says why. This script never
writes a certificate.
"""
import argparse
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from checker.panel_scale import limits_in_reference_pixels, screen_pixel_scale  # noqa: E402

HARD = ("C1", "C2", "C3", "C4", "C5")


def certification(report, run):
    reasons = []
    if report.get("overall") != "PASS":
        reasons.append(f"overall result is {report.get('overall')}")
    for c in report.get("checks", []):
        if c["check"] in HARD and c.get("status") != "PASS":
            reasons.append(f"{c['check']} is {c.get('status')}")
        if c.get("status") in ("NOT RUN", "FLAGGED"):
            reasons.append(f"{c['check']} is {c.get('status')}")
    if not (run / "certificate.json").exists():
        reasons.append("no certificate.json in this run (it is only written by a full no-skip checker run that passed)")
    return not reasons, sorted(set(reasons))


def fmt(v, nd=3):
    return f"{v:.{nd}g}" if isinstance(v, (int, float)) else str(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    run = Path(a.run)
    true = json.loads((run / "true_screen.json").read_text())
    report = json.loads((run / "report.json").read_text())
    thr_path = ROOT / "config" / "thresholds.json"
    thr = json.loads(thr_path.read_text())
    ok, reasons = certification(report, run)
    lim = limits_in_reference_pixels(thr, true)
    scales = screen_pixel_scale(true)

    rows = "".join(
        f"<tr><td>{html.escape(s['panel'])}</td><td>{s['size_m'][0]:.2f} x {s['size_m'][1]:.2f}</td><td>{s['res'][0]} x {s['res'][1]}</td>"
        f"<td>{s['pitch_mm'][0]:.2f} x {s['pitch_mm'][1]:.2f}</td><td>{s['centre_distance_m']:.1f}</td><td>{s['incidence_deg']:.1f}</td>"
        f"<td>{s['arcmin_per_pixel'][0]:.2f} x {s['arcmin_per_pixel'][1]:.2f}</td></tr>" for s in scales)

    def limit_row(name, key, what):
        e = lim[key]
        return (f"<tr><td>{name}</td><td>{what}</td><td>{fmt(e['deg'])} deg</td><td>{fmt(e['arcmin'])} arcmin</td>"
                f"<td>{fmt(e['reference_camera_px'])} reference-camera px</td></tr>")

    checks = "".join(
        f"<tr><td>{html.escape(c['check'])}</td><td class=\"{html.escape(str(c.get('status')))}\">{html.escape(str(c.get('status')))}</td>"
        f"<td><code>{html.escape(json.dumps(c.get('value'), default=str)[:140])}</code></td></tr>" for c in report.get("checks", []))

    banner = ("CERTIFIED: all checks passed in a full run" if ok else "NOT CERTIFIED")
    why = "" if ok else "<ul>" + "".join(f"<li>{html.escape(r)}</li>" for r in reasons) + "</ul>"
    doc = f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>Tangle spec sheet {html.escape(report.get('run', run.name))}</title>
<style>body{{font:14px/1.45 system-ui,sans-serif;max-width:920px;margin:24px auto;padding:0 16px;color:#16202c}}h1{{margin-bottom:0}}
table{{border-collapse:collapse;width:100%;margin:8px 0 18px}}td,th{{border:1px solid #cdd6e0;padding:5px 8px;text-align:left;font-size:13px}}th{{background:#eef2f7}}
.banner{{padding:10px 14px;border-radius:8px;font-weight:700;margin:14px 0;background:{'#dff5e6' if ok else '#fde4e1'};color:{'#146c3a' if ok else '#9b1c10'}}}
.PASS{{color:#146c3a;font-weight:600}}.FAIL{{color:#9b1c10;font-weight:600}}small{{color:#5b6b7c}}</style>
<h1>Tangle spec sheet</h1><small>Run {html.escape(report.get('run', run.name))} &middot; screen {html.escape(true.get('id', '?'))} &middot; simulation, not a real billboard</small>
<div class="banner">{banner}</div>{why}
<h2>Screen: per-panel pixel pitch and angular pixel size</h2>
<small>From the screen file via checker.panel_scale. Angular pixel size is measured at the true eye, so it depends on distance and viewing angle.</small>
<table><tr><th>Panel</th><th>Size (m)</th><th>Resolution (px)</th><th>Pixel pitch (mm)</th><th>Distance to centre (m)</th><th>Off-axis (deg)</th><th>One LED pixel subtends (arcmin)</th></tr>{rows}</table>
<h2>Checker limits</h2>
<small>Pixels only with the pixel named: {html.escape(lim['pixel'])}. C4 limit {thr['C4']['max_fraction'] * 100:g}% of the hero mask outside the screen; C5 limit {thr['C5']['min_arcmin']:g} arcmin of text height.</small>
<table><tr><th>Check</th><th>Measures</th><th>Degrees</th><th>Arcmin</th><th>Reference-camera pixels</th></tr>
{limit_row('C2 mean', 'C2_mean', 'mean reprojection error')}{limit_row('C2 max', 'C2_max', 'worst reprojection error')}{limit_row('C3', 'C3', 'step across a corner seam')}</table>
<h2>Measured in this run</h2><table><tr><th>Check</th><th>Status</th><th>Value</th></tr>{checks}</table>
<small>Generated by headless/spec_sheet.py. It does not issue certificates; a certificate exists only if certificate.json is in the run folder.</small></html>"""
    out = Path(a.out) if a.out else run / "spec_sheet.html"
    out.write_text(doc, encoding="utf-8")
    print(("CERTIFIED" if ok else "NOT CERTIFIED"), "->", out)
    for r in reasons:
        print("  -", r)


if __name__ == "__main__":
    main()
