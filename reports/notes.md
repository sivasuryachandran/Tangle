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
