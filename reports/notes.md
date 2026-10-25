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
