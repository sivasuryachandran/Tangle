# Tangle — 3D billboard ads that pass the street-view test

> Argon designs an anamorphic 3D ad for a corner screen. Tangle renders it, simulates what a
> pedestrian sees, **measures** whether the illusion holds, lets Argon repair the scene, and issues
> a certificate. **Argon proposes; an independent geometry checker decides.**

**Hackathon disclosure:** `CLAUDE.md` is a design note written before the event (before 10:30).
All code in this repo was written on Oct 25, 2026 during the hacking window.

Track: Problem Statement Two — More Dimensions. Results come from simulation, not footage of a real billboard.

## Status
Every number reported here comes from a run (`runs/`, kept locally except the committed evidence runs) and the gate log in `reports/gates.md`. Statuses: PASS / FAIL / NOT RUN.

| Gate | Status | Evidence |
|---|---|---|
| G0 Argon call works (text + inline video) | PASS | `reports/gates.md` |
| G1 identity test (assumed = true) | PASS | C2 mean 9.8e-08 deg, 32/32 ID dots within 2 reference-camera px; `reports/gates.md` |
| G2 checker mutation tests | PASS | `pytest tests/` (126 tests) |
| G3 Argon scene end to end | RAN, overall FAIL (C4, C5) | `reports/gates.md` |
| G4 live geometry change -> loop -> PASS | **PASS in the rehearsal (v4); NOT reached in the two final 6-round runs** | `g4_rehearsal` reached PASS at v4 (95 deg true corner). The later runs `g4_final` and `g5_flare` (6 rounds each, frozen limits) ended FAIL: C2 max 0.349 deg vs the 0.28 deg limit. We show those numbers as they are. |

Identity runs of the extra ads (`extra_racecar/v2`, `extra_argon_ad/v2`) pass all checks, but C2 and C3 are ~0 there by construction: they show the scene fits and reads, not that a repair across a geometry change worked.

What we do not claim: this is a simulation, not footage of a real billboard. The street photos used behind the screen are AI-generated and are not measured by the checker.

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
