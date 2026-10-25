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

**For the README:** `config/thresholds.json` has C2 mean <= 0.08 deg, max <= 0.28 deg. CLAUDE.md Section 3.6 lists mean <= 0.25 deg, max <= 0.75 deg as the starting suggestion. **Deliberate, not a bug** -- team-agreed pre-event (before 10:30, in the P2 setup brief), tighter than the starting suggestion because our pre-event probe showed the renderer easily holds identity well under 0.01 deg, so a looser limit would have let real geometry problems (like the 95 deg regression, or an uncalibrated live-geometry change) through as a false PASS. CLAUDE.md Section 3.6 itself says to "tune on the day and record the final values in the README" -- `config/thresholds.json` is the live authority P2 owns; CLAUDE.md's numbers were never meant to be binding, only a starting point. C3/C4/C5 were left at CLAUDE.md's suggested values unchanged (0.5 deg / 2% / 20 arcmin); only C2 was tightened.

Confirmed directly against `config/thresholds.json` and the real G4 rehearsal (`reports/gates.md`): v1-v3 FAIL on C2 at 0.1215/0.0846/0.0427 deg mean (all above 0.08), v4 PASSes at 0.0353 deg -- the tighter limit is what actually drove those repair rounds, not a false restriction; Argon converged within the 4-round budget regardless.

**C2, C3, C5 need no render outputs** (relevant for P3's planned `--fast` mode, skipping `node headless/render.mjs`): `compute_c2(assumed_screen, true_screen, anchors_doc, thresholds)`, `compute_c3(assumed_screen, true_screen, scene, anchors_doc, thresholds)` and `compute_c5(scene, true_screen, thresholds)` take only `scene.json` + screen specs + `anchors.json` (itself scene-derived, via `python -m checker.anchors`, also no render dependency) -- confirmed by calling all three directly with no `runs/` directory on disk at all. C1 needs rendered panel PNGs (pixel dims on disk) and C4's default path prefers `mask_ref.png` but **already falls back** to the anchor-corner proxy (`compute_c4_analytic`) when no renders exist, so even `checker.run`'s full report degrades gracefully without a render -- only C1 would come back FAIL/MISSING with nothing to check. If `--fast` mode wants a clean report with no false FAIL from missing images, it should call `compute_c2`/`compute_c3`/`compute_c4_analytic`/`compute_c5` directly rather than going through `checker.run`'s `--dir`, or `checker.run` would need a flag to skip C1 -- ping me if you want that added once `--fast`'s interface is decided.
