# README text from P2 (checker section) — for P3 to paste

Drop-in replacement for the README's checks table and the "Why C2 is tighter" paragraph (README.md lines ~26-32). Every number below comes from `config/thresholds.json`, the code, or `reports/notes.md`. Nothing here is a run result; the evidence table at the end stays empty until a final run exists.

---

## How we decide PASS or FAIL

Argon proposes; an independent geometry checker decides. The checker is a separate Python process that re-implements the projection maths from scratch (it does not reuse the renderer's JavaScript), reads the scene and screen files, and never trusts the model. It judges the **true** screen: the geometry the creative has to hold on, which can differ from the geometry it was designed for.

| Check | What it measures | Limit |
|---|---|---|
| C1 | Panel images have exactly the panel's pixel size | exact |
| C2 | Reprojection error at the true eye: the angle between where a point should appear and where the (assumed-geometry) panel content puts it, mean / max over all anchors and times | mean ≤ 0.08°, max ≤ 0.28° |
| C3 | Seam step: the angular jump between neighbouring panels where they meet, measured with probe points on both sides of every seam, and no text footprint crossing a seam | ≤ 0.2° |
| C4 | Fraction of the hero object's rendered pixels that land outside the union of the panels | ≤ 2% |
| C5 | Angular height of text from the true eye | ≥ 20 arcmin |

A check that could not be measured is **NOT RUN**, and NOT RUN blocks the result: a skipped or unmeasurable check is never a pass. `certificate.json` is written only when every check passed in a full run with nothing skipped.

### The limits, in plain units

Pixels only mean something when you say which pixel. In the proof view (`street.png`: 1920×1080, 60° vertical field of view, 3.33 arcmin per pixel):

| Limit | Degrees | Arcmin | Proof-view pixels |
|---|---|---|---|
| C2 mean | 0.08° | 4.8 | 1.4 px |
| C2 max | 0.28° | 16.8 | 5.0 px |
| C3 seam step | 0.2° | 12.0 | 3.6 px |

These are visible errors by design, not invisible ones: a mean error of 1–2 pixels in the proof view is barely noticeable, while the 5-pixel maximum is visible. C5's 20 arcmin is the smallest text height we accept as readable.

On the LED panels themselves, one pixel is finer than the eye resolves from the demo position. The demo panels are 8 m × 6 m at 1920×1440 (4.17 mm pixel pitch). The eye is 17.3 m from each panel centre and 54.6° off the panel's normal, so one LED pixel subtends about 0.49 × 0.83 arcmin there (across × up), not the textbook 1 arcmin. Readability is therefore limited by the eye (C5, in arcmin), not by pixel pitch. Per-panel figures come from `checker/panel_scale.py`.

### Why these numbers

- **C2 (0.08° / 0.28°)** is tighter than the design note's starting 0.25° / 0.75°. Before the event our probe showed the renderer holds identity well under 0.01°, so a looser limit would let real geometry problems (the 95° corner, an uncalibrated live-geometry change) pass falsely.
- **C3 (0.2°, changed from the design note's 0.5°)**: C3 is the angular step between the left and right images where they meet, seen from the true eye. 0.2° is 3.6 px of the proof view (0.5° would be 9 px) and 12 arcmin, over ten times the roughly 1 arcmin limit of normal visual acuity, so a larger step shows as a visible break at the corner. The limit also sits near C2's max (0.28°, 5 px) so the two image-space limits are about the same size. We chose it after seeing that a live corner change reads 0.26–0.31° and 0.5° could never fire; the pixel argument is the justification, and the margin is thin (85° reads 0.256°, so a 2–3° corner error would pass C3 and only C2 would catch it).
- **C4 (2%) and C5 (20 arcmin)** keep the design note's values.
- `config/thresholds.json` was frozen at 14:30 on the day. Every `report.json` records the thresholds it was judged under, their sha256, and the git commit of the checker; a number is citable only under the limits stamped in its own report.

### What the checker does not claim

- Everything is a **simulation**. We did not measure a real billboard.
- The checks cover anchor points (object centres and bounding corners, text corners, card corners), the rendered mask for C4, and probe points at seams. They do not inspect every pixel of the artwork.
- A photo card is checked as a flat quad: its corners, not the picture inside it.
- The composited street photo (`scene.jpeg`) is an AI-generated environment and is **not** measured by the checker. Any PASS shown next to it comes from the simulated street view.
- C2 and C3 are near zero when the assumed and true screens are the same; a PASS on an identity run shows the scene fits the screen and reads, not that a repair across a geometry change worked.

### How to verify a result yourself

```bash
python -m checker.run --dir runs/<id>/v<N> --true runs/<id>/v<N>/true_screen.json --thresholds config/thresholds.json --out report.json
```

Then compare `report.json`'s `thresholds_sha256` with `sha256sum config/thresholds.json`, and check that the run has no `skipped` field. `worst_by_check` names the worst moment and object for anything that failed.

### Evidence (fill from the final run; do not fill from memory)

| Version | Overall | C2 mean / max | C3 | C4 | C5 min arcmin | Thresholds sha256 | Checker commit |
|---|---|---|---|---|---|---|---|
| _run id and version_ | | | | | | | |

Run ids that exist today are listed in `reports/gates.md`. Runs made before the C3 change (0.5° to 0.2°), before the C5 scale-0 fix (`d298e9f`), or without a stamped `thresholds_sha256` are not citable under the final limits.
