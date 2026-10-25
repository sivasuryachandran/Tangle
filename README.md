# Tangle — 3D billboard ads that pass the street-view test

> Argon designs an anamorphic 3D ad for a corner screen. Tangle renders it, simulates what a
> pedestrian sees, **measures** whether the illusion holds, lets Argon repair the scene, and issues
> a certificate. **Argon proposes; an independent geometry checker decides.**

**Hackathon disclosure:** `CLAUDE.md` is a design note written before the event (before 10:30).
All code in this repo was written on Oct 25, 2026 during the hacking window.

Track: Problem Statement Two — More Dimensions. Results come from simulation, not footage of a real billboard.

## Status
Work in progress. Every number reported here comes from a run in `runs/` (PASS / FAIL / NOT RUN).

| Gate | Status |
|---|---|
| G0 Argon call works | NOT RUN |
| G1 identity test | NOT RUN |
| G2 checker mutation tests | NOT RUN |
| G3 Argon scene end to end | NOT RUN |
| G4 live geometry change → loop → PASS | NOT RUN |

## Verification thresholds (final values, `config/thresholds.json`)
| Check | What | Limit |
|---|---|---|
| C1 | Panel image dimensions match each panel's `res` | exact |
| C2 | Reprojection error from the true eye (mean / max) | ≤ 0.08° / ≤ 0.28° |
| C3 | Corner-seam discontinuity (and no text across the seam) | ≤ 0.5° |
| C4 | Hero pixels outside the screen union (rendered mask fraction) | ≤ 2% |
| C5 | Text angular height from the true eye | ≥ 20 arcmin |

**Why C2 is tighter than the design note's 0.25° / 0.75°:** the pre-event probe showed the renderer holds identity far below 0.01°, so a looser limit would let real geometry problems (the 95° corner, an uncalibrated live-geometry change) pass falsely. C3, C4 and C5 keep the design note's values. Source: `reports/notes.md`.

## Run the UI
```
uv sync --python 3.12
python3 web/app/server.py          # http://localhost:8000/web/app/index.html
```
Pages: Overview, New Test (geometry form → `screens/live_*.json` → `loop.py`), Street-View Test, Repair, Certificate, Screens.
Every number comes from `runs/<id>/v<N>/report.json` / `certificate.json`. Runs whose id starts with `STUB_` use fake data from `tests/stubs/` and show an orange banner.
The UI is built on Stitch designs (Tailwind CDN, Geist + JetBrains Mono, Material Symbols).
