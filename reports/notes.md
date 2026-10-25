# Notes

## 2026-10-25 — P2 checker decisions

Three team decisions on `checker/anchors.py` and `checker/checks.py` (C2),
recorded here per CLAUDE.md Section 1 ("write it in reports/notes.md and
tell the user" for anything not settled by the file itself):

1. **C2 metric**: the angle between rays (true eye -> Q) and (true eye ->
   P) is the PASS/FAIL quantity. `ref_camera` pixel distance between the
   same two points is also computed and included in `report.json` detail
   entries (`px_dist`) for display only — it must never drive a check's
   status.

2. **Object lifecycle**: an object does not exist before its own first
   keyframe — no anchors are sampled for it at earlier times, and it is
   not rendered. It still holds at its last keyframe's value after the
   last keyframe. Reason: a text object whose first keyframe is at t=7
   (e.g. "then the slogan appears") must not be visible, or generate
   anchors, from t=0.

3. **Anchor schema**: anchors carry an additive `"kind": "center"|"corner"`
   field beyond the base `{"id", "object", "t", "p"}` in CLAUDE.md Section
   3.4. Consumers (P1's ID-dot renderer included) must ignore unknown
   fields.

CLAUDE.md Sections 3.3/3.4 are meant to reflect decisions 2-3, but as of
this commit `origin/main`'s CLAUDE.md is still the pre-event version
(d7a31dc) — the update hasn't landed there yet. Checker code implements
the decisions above regardless.

## 2026-10-25 — P1 renderer decisions

1. **Backdrop `depth_m` (decided with the lead, 11:4x):** it is the depth of the room box behind the panels, measured from the panel plane inward (x < 0, z < 0). The renderer builds floor, ceiling and two far walls at x = -depth_m and z = -depth_m; ceiling height is fixed at 6 m. The demo panels are 8 m wide, so with `depth_m` = 6 the outer 2 m of each panel view sees past the room; that area is filled with the backdrop colour (x0.7) as the clear colour, not a wall.
2. **Object sizes** come from `schemas/object_library.json` at load time (`setLibrary` in `web/render/scene_builder.js`); text width (0.6 x height x chars) stays fixed in code because that file only has it as a note.
3. **Object lifecycle** follows CLAUDE.md 3.3: not rendered before the first keyframe, held after the last, hidden at scale 0.
4. **street.mp4** is 1280x720, 30 fps, 4 s (2 s fixed eye with the scene time-lapsed over its full duration, 2 s +-2 m walk-by with the scene held at its last keyframe time). Frames go through JPEG into ffmpeg, so video is slightly lossy; PNGs per time are exact.
5. **social.mp4** uses the night street (daytime for street.mp4 and the viewer), scene played at real speed and looped if shorter than 15 s.

## 2026-10-25 — why config/thresholds.json's C2 limits differ from CLAUDE.md Section 3.6

**For the README, one sentence:** C2's limit is tighter than CLAUDE.md's 0.25°/0.75° starting suggestion (0.08°/0.28° in `config/thresholds.json`) because our pre-event probe showed the renderer holds identity well under 0.01°, so a looser limit would have let real geometry problems through as a false PASS.

**For the README, full version:** `config/thresholds.json` has C2 mean <= 0.08 deg, max <= 0.28 deg. CLAUDE.md Section 3.6 lists mean <= 0.25 deg, max <= 0.75 deg as the starting suggestion. **Deliberate, not a bug** -- team-agreed pre-event (before 10:30, in the P2 setup brief), tighter than the starting suggestion because our pre-event probe showed the renderer easily holds identity well under 0.01 deg, so a looser limit would have let real geometry problems (like the 95 deg regression, or an uncalibrated live-geometry change) through as a false PASS. CLAUDE.md Section 3.6 itself says to "tune on the day and record the final values in the README" -- `config/thresholds.json` is the live authority P2 owns; CLAUDE.md's numbers were never meant to be binding, only a starting point. C3/C4/C5 were left at CLAUDE.md's suggested values unchanged (0.5 deg / 2% / 20 arcmin); only C2 was tightened.

Confirmed directly against `config/thresholds.json` and the real G4 rehearsal (`reports/gates.md`): v1-v3 FAIL on C2 at 0.1215/0.0846/0.0427 deg mean (all above 0.08), v4 PASSes at 0.0353 deg -- the tighter limit is what actually drove those repair rounds, not a false restriction; Argon converged within the 4-round budget regardless.

**C2, C3, C5 need no render outputs** (relevant for P3's planned `--fast` mode, skipping `node headless/render.mjs`): `compute_c2(assumed_screen, true_screen, anchors_doc, thresholds)`, `compute_c3(assumed_screen, true_screen, scene, anchors_doc, thresholds)` and `compute_c5(scene, true_screen, thresholds)` take only `scene.json` + screen specs + `anchors.json` (itself scene-derived, via `python -m checker.anchors`, also no render dependency) -- confirmed by calling all three directly with no `runs/` directory on disk at all. C1 needs rendered panel PNGs (pixel dims on disk) and C4's default path prefers `mask_ref.png` but **already falls back** to the anchor-corner proxy (`compute_c4_analytic`) when no renders exist, so even `checker.run`'s full report degrades gracefully without a render -- only C1 would come back FAIL/MISSING with nothing to check. If `--fast` mode wants a clean report with no false FAIL from missing images, it should call `compute_c2`/`compute_c3`/`compute_c4_analytic`/`compute_c5` directly rather than going through `checker.run`'s `--dir`, or `checker.run` would need a flag to skip C1 -- ping me if you want that added once `--fast`'s interface is decided.

## 2026-10-25 — screen presets (P2, with P1's go-ahead) and C2 NOT RUN

Added `screens/flat_roadside.json`, `screens/curved_wall.json`, `screens/three_face.json` per CLAUDE.md Section 3.2. Every panel faces the eye (and every `eye_path` point), seams name real panels, and panel names are letters/digits only (P1 saves `t_<ms>/<name>.png`). Tested in `tests/test_checker_presets.py`. Choices where Section 3.2 was open:
- **flat_roadside:** panel `F` in z=0 facing +z, x -7..7, y 6..10.8 (2800x960 px). Eye [5, 1.2, 60]. `eye_path` = the lane at x=5, z from 90 m to 30 m in 10 m steps (7 points). `ref_camera` fov 30 deg (the panel is small at 60 m).
- **curved_wall:** "24 m wide" read as **arc length** 24 m, so radius 15.28 m. Convex 90 deg arc rounding the building corner (from (-R,0,0) facing +z to (0,0,-R) facing +x), 16 flat segments `S0`..`S15`, 480x1920 px each, 15 seams. Approximation error stated in the file: max gap between a segment and the true arc 0.018 m.
- **three_face:** a convex box shows at most two faces to one eye, so "left, front, right" is a corner with a 45 deg chamfer: `left` (6 m), `front` (the chamfer, 2.83 m), `right` (6 m), all 6 m tall, 240 px/m like the demo. Seams left/front and front/right. Eye [10, 1.7, 10] as in the demo.

Render-free check of `tests/fixtures/scene_test.json` (assumed = true): curved_wall C2 PASS (1.5e-06 deg max), C3 PASS, C4 FAIL 0.036 (the scene was made for the sharp corner). three_face C2 PASS, C3 FAIL (the 7.7 m title crosses the left/front seam). flat_roadside: no anchor lands on the panel (the scene sits below it). Eye +0.3 m makes C2 FAIL on curved_wall (0.38 deg mean) and three_face (0.18 deg mean). The scene volumes in Section 3.3 are corner-specific, so A1 prompts need per-preset volumes before Argon targets these screens.

**C2 change:** C2 used to report PASS at 0.0 deg when no anchor ray hit any panel, which is a vacuous pass (found on flat_roadside). It now reports **NOT RUN** with `mean_deg`/`max_deg` null, and NOT RUN blocks `overall`. C6 skips such points (min/max over measured points; dark gray cells in `zone_heatmap.png`).

## 2026-10-25 � C3 limit 0.5 -> 0.2 deg, and C4_analytic_xcheck has no status (P2, agreed with the user)

- **C3 limit is now 0.2 deg** (`config/thresholds.json`; was 0.5, CLAUDE.md's starting suggestion, which was never derived from anything).
  - **Reason (one sentence, for the README):** C3 is the angular step between the left and right images where they meet, measured at the true eye; 0.2 deg is 3.6 px of the 1080p, 60 deg reference camera (0.5 deg was 9 px) and 12 arcmin, over ten times the ~1 arcmin of normal visual acuity, so a larger step is a visible break at the corner. It sits next to C2's max limit (0.28 deg, 5 px) so the two image-space limits are of the same size.
  - **Honest history:** I picked 0.2 after seeing that a live corner change read 0.26-0.31 deg and 0.5 could never fire; the pixel argument above is the justification, but the choice was made with those numbers in view. The margin is thin: 85 deg reads 0.256 deg (28% over), so a smaller corner change (e.g. 87 deg) would pass C3 and only C2 would catch it.
  - **Baselines (C3 value, probes + scene anchors, real runs):** identity runs (assumed = true: curved_wall, three_face, g3_argon_v1) read 1e-15 to 1e-14 deg; a symmetric eye-height change reads 5e-5 deg (probe spacing, not a real step); the g4_final repair rounds, 90 deg assumed vs the 95 deg regression, read 0.026 (v1), 0.039, 0.032, 0.033, 0.030, 0.029 (v6). All well under 0.2, so no false FAIL on a good run. Live-form changes: 85 deg 0.256, 95 deg 0.314, 80 deg 0.485, eye 1.9 m 0.000.
  - **Runs made under 0.5 deg** (the old g4_final) are not citable under 0.2. Every report.json now carries `thresholds`, `thresholds_sha256` and `git_commit` (plus `checker_files_modified`), and certificate.json carries `thresholds_sha256` and `checker_git_commit`; cite a number only under the limits stamped in its own report.
- **`C4_analytic_xcheck`** keeps its value but its `status` is now null (the PASS/FAIL it would have had is in `analytic_status_vs_limit`). Its unit is sample count, so on curved_wall it reads 0.0357 (1 of 28 samples) next to a passing mask-based C4 of 0.0158.

## 2026-10-25 � thresholds freeze (P2, decided with the user)

`config/thresholds.json` is **frozen at 14:30 local**. After that, no threshold edits; any change needs the team and a rerun of the evidence runs (a run is citable only under the limits stamped in its own `report.json`: `thresholds`, `thresholds_sha256`, `git_commit`). Final values: C1 exact, C2 mean 0.08 / max 0.28 deg, C3 0.2 deg, C4 0.02, C5 20 arcmin.

# Notes (P3)

## Inline PDF and image input to gemini-4-argon (tested Oct 25)
- Inline **image** parts work on the Interactions API: `{"type":"image","data":<base64>,"mime_type":"image/png"}`. A synthetic product photo came back with the right object, colors and label text. The model also reports the *background* color unless told not to, so the extraction prompt says "product colors only".
- Inline **PDF** works: `{"type":"document","data":<base64>,"mime_type":"application/pdf"}` returned the brand colors, tagline and forbidden words from a one-page test PDF. `{"type":"file", ...}` is rejected. So PDFs are accepted inline (no pasted-text-only fallback needed); pasted text is still supported as an alternative.
- Limits enforced by us (not the API): 1-3 PNG/JPG photos, 5 MB each; brand PDF 5 MB.
- `inputs/` is gitignored: photos/brand files are only ever stored locally, never committed.
- Screen geometry never comes from the model: the analysis prompt does not ask for it, `parse_analysis` drops any such keys (tested), and runs use only the form/preset spec.

## 2026-10-25 13:30 — P1 room depth and text fixes (affect content only, not checked values)
- **Room depth is now max(`depth_m`, widest panel)**, not just `depth_m`. With `depth_m` = 6 and 8 m wide panels, panel R's back wall at x = -6 cut through the room behind panel L and hid scene content in x < -6 (the first letters of the g4_final tagline "Break the frame." were clipped in L.png and in street.mp4). Re-render of g4_final v6 confirms the tagline is whole. This refines the earlier "depth_m = room depth behind the panel plane" note: it is a minimum.
- **Text planes** draw their texture at 96% of the canvas width so glyph edges are not cut; can `label_text` is limited to the middle third of the can (aspect 4.2) so it reads front-on.
- **Checks re-run after both changes:** G1 identity (assumed = true, corner_90): overall PASS, C2 mean 9.8e-08 deg, 32/32 ID dots within 2 reference-camera px (1080p, 60 deg fov, 3.3 arcmin/px), SSIM (my region, edges eroded by 7 reference-camera px) 0.977-0.978. g4_final v6 re-rendered on current main: C2 mean 0.01687 / max 0.349 deg (unchanged), C2_image_xcheck PASS 123/123.
- **Stale evidence note:** the committed `runs/g4_final/v6/t_4200/idpass_street.png` has dot centroids 50-140 reference-camera px (about 2.8-7.7 deg) away from the analytic positions for 9 anchors (burst_sparks), which is why the committed report shows C2_image_xcheck FLAGGED. A fresh render of the same scene, anchors and screens on current main matches the analytic positions to under 1 reference-camera px (PASS, 123/123). The committed images probably came from an older renderer build or an interrupted render; re-render before relying on that FLAG.

## 2026-10-25 14:00 — P1 premium hero (web/hero/), hero-only; checked renders untouched
- **What it is:** `web/hero/index.html` is a live three.js night street (PBR can with aluminium lid and rim, glossy red body, condensation droplets, Nano Banana label via `label_image`, soft sparks; two lamps with soft shadows; wet road and glossy plaza reflecting the screens through a mirrored pass; the screens light the street through RectAreaLights; bloom + ACES tone mapping). Camera drifts 8 s from a high 3/4 view to the true eye ("Stand at eye" jumps there); caption "Simulated street view, not camera footage. Run <id>"; `hero_poster.jpg` shows until the first frame or if WebGL is unavailable; `?dev=1` shows a settings panel with "Copy settings as JSON" (defaults baked in `web/hero/settings.json`). three.js is vendored in `web/hero/vendor/three` (`node headless/vendor_hero.mjs`), no CDN.
- **Checked renders are not touched:** `headless/render.mjs` and the flat Lambert objects are unchanged. `web/render/scene_builder.js` only gained an opt-in hook (`makeMesh`, `lights:false`) that the hero page passes; re-running G1 after all hero work gave 18 of 18 images pixel-identical to the previous G1 run, overall PASS (C2 mean 9.8e-08 deg, 32/32 ID dots within 2 reference-camera px, SSIM 0.977-0.978 in my region).
- **Target image:** `web/hero/target_01.png` (Nano Banana, 1376x768, not 2K: the wrapper has no size setting) is a reference for the critic only; no output uses it.
- **Critic loop (gemini-4-argon, thinking medium, 4 rounds, logged in reports/model_calls.jsonl as `hero_critic_round<N>` and `_result`):** 2.8, 3.5, 5.2, 5.2 out of 10. The target of 9 was not reached. After the last round I changed only exposure/lighting/droplet-count values without a further model review.
- **Things learned:** a `HemisphereLight` added to the street scene next to RectAreaLights made the bloom pass output NaN (black frame), so the street uses an AmbientLight; `clearcoat` = 1 on the can body rendered it black under my lights (cause not found), so the body uses clearcoat 0.5; GL point sprites are capped at 1 px on SwiftShader, so the sparks are camera-facing quads; the anamorphic illusion only holds at the eye, so stills named "overview" are taken at the eye with a wide field of view, while the live drift starts from an off-axis 3/4 pose where the can looks folded by design.
- **Frame rate:** 165 fps at 1302x646, dpr 1.25 on the RTX 3060 Laptop GPU of this machine, measured in the app's browser pane (it cannot be set to 1920x1080). The page lowers its pixel ratio automatically if it drops under 30 fps. Not measured on any other laptop.
- **Honesty:** the demo scene's run `flare_hero/v1` (assumed = true = corner_90_demo, P3's FLARE scene before any repair) is a real render and check, overall FAIL on C5 (tagline scales up from 0.01); the caption only names the run as the source of the geometry.

## 2026-10-25 15:00 — P1 hero page now defaults to the photo scene
- `web/hero/index.html` opens in **photo mode**: an AI-generated street photo (Nano Banana, `web/hero/assets/bg_corner_high.png`) is the backdrop, and the live PBR screen content (the can, sparks, tagline) is perspective-mapped in real time into the two faces of the screen mounted on the building (`web/hero/photo_mode.js`, quads in `web/hero/photo_demo/bg_corner.json`), with bloom and a soft spill on the facade. The old full 3D street is still available at `?mode=3d`.
- The caption reads "AI-generated environment, not a real location. Simulated street view, not camera footage. Run <id>". `hero_poster.jpg` is a still of this view.
- **Geometry:** the photo's screen is not our 8 x 6 m demo preset. A pose fit on the picked corners (solvePnP, mean error 2 pixels of the 1376x768 photo; photo pixels, not LED or reference-camera pixels) gives faces of about 12 m x 6 m with the camera about 4 m below the screen bottom, so `web/hero/photo_demo/*_screen.json` use that geometry and the demo scene is shifted down 2.3 m and scaled 1.5x for this view. This is a demo composite only: it is not a checked run and no certificate or checker number comes from it.
- Frame rate: 165 fps in the app's browser pane on the RTX 3060 Laptop GPU of this machine; adaptive resolution lowers it automatically under 30 fps.

## 2026-10-25 15:30 - P1: how pixels are named in P1 notes (from P2's note on pixel size)
- A pixel is only quoted with its kind. **Reference-camera pixel** = 1080p, 60 deg vertical fov, about 3.3 arcmin per pixel: this is what the ID-dot cross-check, the SSIM region and the mask passes use. **Panel pixel** = one pixel of `L.png` / `R.png` / `delivery.mp4` (3840x1440 for the demo: 1920x1440 per panel), i.e. one LED pixel of the screen when the content is played 1:1; on `corner_90_demo` that is 8 m / 1920 = 4.17 mm pitch, but seen from the eye (17.3 m, 54.6 deg off-axis) a panel pixel is 0.49 x 0.83 arcmin, not 1.0. **Photo pixel** = a pixel of the generated background photos in `web/hero/assets/`; those numbers only describe the demo composite.
- `delivery.mp4`, `street.mp4`, `social.mp4` and the hero page make no certification claim; only a full `checker.run` that passes (all checks, none NOT RUN) may produce `certificate.json`.
