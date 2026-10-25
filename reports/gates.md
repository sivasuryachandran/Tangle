# Gates

## G0 — Argon call + video input (P3) — PASS (Oct 25)
- `gemini-4-argon` text call via Interactions API (`client.interactions.create`, `generation_config.thinking_level`): returned the expected string in 4.3 s, 47 tokens. Logged in `reports/model_calls.jsonl`.
- Video input: a 2 s local MP4 (red → blue, 320x180) sent **inline as base64**, `{"type":"video","data":<b64>,"mime_type":"video/mp4"}` plus a `{"type":"text"}` part. The model answered "Red, blue." Decision: use inline MP4 (no Files API); PNG-strip fallback not needed so far. Clip size limits for a real `street.mp4` NOT RUN yet.
- Notes: `client.files.upload` also works (file starts in PROCESSING state, so inline is simpler). The `genai.Client` must be kept referenced during the call or httpx reports "client has been closed".

## G1 — identity render, assumed = true (P1 + P2) — PASS (Oct 25)
Real end-to-end run via `node headless/render.mjs`, not a synthetic fixture: `--scene tests/fixtures/scene_test.json --assumed screens/corner_90_demo.json --true screens/corner_90_demo.json --times 0,3500,7000`, then `python -m checker.run` against the output. Full numbers in `runs/g1_identity/v1/report.json` (gitignored; not committed, per CLAUDE.md Section 4 -- re-run to reproduce).
- **C2 mean = 9.8e-08 deg, max = 1.2e-06 deg** (limit: mean < 0.05 deg). Effectively zero, as expected when assumed == true: the ray through any anchor point, remapped through an identical panel, is colinear with itself.
- **C2 image cross-check: 32/32 anchors agree within 2 px** between the analytic Q and the actual ID-dot centroids decoded from `idpass_street.png`, across all 3 frames, 0 disagreements. This is real cross-validation between P1's renderer and P2's independent geometry -- not just a C2-vs-itself identity check.
- **SSIM(street.png, reference.png), restricted to the true panels' projected pixel region** (181150/2,073,600 px, via `checker.checks._panel_quad_px` + `cv2.fillConvexPoly`): **t=0: 0.9525, t=3500: 0.9523, t=7000: 0.9507** (limit: > 0.95). All PASS, but margin is thin (~0.002-0.003 above threshold) -- visually the two renders are indistinguishable in the panel region (same can, same label, same lighting); the SSIM gap looks like texture-filtering/resampling softness from the street-sim's textured-quad pass vs. a direct render, not a geometry bug. Full-image SSIM is low (~0.555) but that's expected and not part of the gate -- street.png's backdrop is a simulated street (sky + ground), reference.png's is the scene's own room backdrop; they're only supposed to agree *inside the panels*.
- **Go/no-go: GO.** Both legs of G1 pass. Flagging the SSIM margin for awareness, not blocking -- worth a second look if antialiasing/texture-filter settings change later in the day.

## G2 — checker mutation tests (P2) — PASS (Oct 25)
All five required behaviors confirmed via `pytest tests/` (48 tests, all passing): identity (mean 9.8e-08 deg < 0.05 deg); `regression_95deg` vs `corner_90_demo` -> C2 FAIL (mean 0.057 deg, max 0.338 deg); hero object moved outside the panel union -> C4 FAIL (max_fraction 1.0); text height /10 -> C5 FAIL (15.8 arcmin < 20); text positioned across the building corner -> C3 FAIL (footprint spans both panels). Test files: `tests/test_checker_*.py`.
- **Blocker found, not mine to fix:** `ffmpeg` is not on PATH on this machine (checked both Git Bash and PowerShell), which `headless/render.mjs` requires for `--video`/`--delivery` and `loop.py`'s real (non-stub) path always requests `--video`. Flagging for P1/P3 -- if the actual demo runs from this machine, `street.mp4`/`delivery.mp4` generation and any real (non-`--stub`) `loop.py` round will fail at the render step until ffmpeg is installed (`winget install Gyan.FFmpeg` is what `headless/render.mjs`'s own fallback already looks for).

## G3 — one Argon-generated scene, rendered and checked end to end (P1 + P3 + P2) — RAN, overall FAIL (a FAIL is acceptable for G3) (Oct 25)
Run id `g3_argon_v1/v1` (local, gitignored under `runs/`; reproduce with the commands below). Scene `tests/fixtures/scene_argon_v1.json` (P3's Argon output), assumed = true = `screens/corner_90_demo.json`.
- Commands: `python -m checker.anchors --scene tests/fixtures/scene_argon_v1.json --out anchors.json` (578 anchors, 27 times), then `node headless/render.mjs --scene … --assumed screens/corner_90_demo.json --true screens/corner_90_demo.json --anchors anchors.json --out runs/g3_argon_v1/v1 --times 0,2500,5000,7500,10000 --video`, then `python -m checker.run --dir runs/g3_argon_v1/v1 --true screens/corner_90_demo.json --thresholds config/thresholds.json --out report.json`. A second render added t=6500 ms (6 frame sets in the final report).
- **Render time:** 1 min 16 s wall clock for 5 frame sets (L, R, street, reference, mask, ID pass each) plus `street.mp4`, on this machine's software GL (SwiftShader).
- **street.mp4:** 0.193 MB (120 frames, 1280x720, 30 fps, H.264). Path: `runs/g3_argon_v1/v1/street.mp4`.
- **Per check:**
  - C1 PASS (all panel images match res).
  - C2 PASS: mean 1.9e-07 deg, max 1.2e-06 deg (identity, as expected with assumed = true). C2 image cross-check PASS: 94/94 anchors within 2 px, 0 disagreements.
  - C3 PASS: seam 0.0 deg.
  - **C4 FAIL**: analytic max_fraction 0.261 (limit 0.02); worst at t = 6.5 s and 6.8 s, 20 times over the limit.
  - **C5 FAIL**: min 13.7 arcmin (limit 20), object `tagline` at t = 5.2 s where it is scaled up from height 0.07 m; it is 75.5 arcmin by 5.5 s.
  - C6: informational, min/max mean C2 over the 7x1x7 grid = 1.9e-07 / 3.36 deg.
- **Disagreement worth a look (P2/P1):** the image-based C4 cross-check (rendered `mask_ref.png`) reports 0.0 of white pixels outside the panel polygon at every rendered time, including 6500 ms, while the analytic C4 (anchor corners) reports 0.26 at 6.5 s. Likely cause: the analytic proxy tests bounding-box corners, which stick out past the real silhouette. Not resolved; the analytic value is the one the report uses for PASS/FAIL.
