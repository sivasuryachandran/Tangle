# CLAUDE.md — Tangle (Gemini 4 Argon SF Hackathon, Sun Oct 25 2026)

> **Tangle — 3D billboard ads that pass the street-view test.**
> Argon designs an anamorphic (forced-perspective) 3D ad for a real corner screen. Tangle renders it, simulates what a pedestrian actually sees, **measures** whether the illusion holds, lets Argon repair the scene, and issues a certificate. **Argon proposes; an independent geometry checker decides.**

Repo: https://github.com/sivasuryachandran/Tangle (shared by 3 people).
Track: **Problem Statement Two — More Dimensions** (render what it made, watch the result, critique against the goal, fix in a loop).

---

## ⚠️ FIRST THING IN EVERY SESSION (Claude Code must do this)

1. **Ask the user:** "Which person are you — **P1 (Renderer)**, **P2 (Checker)**, or **P3 (Argon + Loop + UI)**?" Do not write any code before they answer.
2. Read §3 (Shared contracts) and your role section (§5, §6 or §7) fully.
3. Work **only** inside the folders your role owns (§4). If a change is needed in another person's folder or in a shared contract, **stop and tell the user** to coordinate with that person. Never edit it yourself.
4. Run `git pull --rebase` before starting, and before every commit.
5. After each finished step, tell the user what passed, with evidence (test output, file paths), then continue with the next step in your role list.

---

## 1. Hard rules (hackathon + team)

- **New work only.** All code written today (hacking 10:30–17:00). This file is a design note written before 10:30. Say so in the README.
- **Public repo.** Never commit secrets. `GEMINI_API_KEY` comes from the environment only. `.env*` is gitignored except `.env.example`.
- **Git:**
  - Small commits with clear messages, pushed often.
  - Branches `p1-renderer`, `p2-checker`, `p3-loop`, merged to `main` at each sync point (§8), or push straight to `main` if the team agrees. Pull/rebase first either way.
  - **Never force-push, never rewrite history,** and never add `Co-Authored-By` trailers.
- **Banned-project check:** not a dashboard-first app, not an image analyzer, no Streamlit. The street-view simulation and repair loop are the product.
- **Assets:**
  - No brand logos and no copyrighted characters.
  - No downloaded 3D models unless CC0 and recorded in `CREDITS.md`.
  - Use procedural primitives only.
- **Honesty:**
  - Every number on screen or in the README comes from a run in `runs/`. Statuses: PASS / FAIL / NOT RUN.
  - Never claim "first", "only", "works on any screen", "validated a real billboard" (we simulate), or "only possible with Argon".
- **Model calls:**
  - Hard timeout of 120 s per call.
  - On HTTP 429, stop and report it; no silent retries.
  - Cache by request hash in `cache/`.
  - Log the model id, settings and token usage.
- If this file conflicts with what an API or library actually does, the real behavior wins. Write it in `reports/notes.md` and tell the user.

---

## 2. System flow

```
 judge input (live): brief text  +  screen geometry change (form)
                     │
 (A1) Argon: brief + spec ─────────────► scene.json  (schema-validated)        [P3]
                     │
 anchors.py: scene.json ───────────────► anchors.json                          [P2]
                     │
 (R1) Panel render (ASSUMED spec, off-axis per panel) ─► L.png, R.png, idpass   [P1]
 (R2) Street-view sim (TRUE spec): panels as textured quads, true eye
        ─► street.png, idpass_street.png, reference.png, mask_ref.png, street.mp4 [P1]
                     │
 (C)  Checker (Python, separate process, TRUE spec only) ─► report.json         [P2]
        C1 dims · C2 reprojection · C3 seam · C4 out-of-bounds · C5 readability · C6 zone map (info)
                     │
        all hard checks PASS? ── yes ─► certificate.json + results view         [P2/P3]
                     │ no
 (A2) Argon watches street.mp4 + report.json + scene.json ─► JSON Patch
        ─► guard ─► new scene version ─► back to R1   (max 4 rounds)           [P3]
```

**Authority:** Argon writes `scene.json` and patches only. It never writes engine code, never edits screen specs or thresholds, and never marks a check as passed. **Only the checker decides PASS/FAIL.**

---

## 3. Shared contracts (agree at 10:30–10:45; change only by team agreement)

### 3.1 Coordinates
Meters, right-handed, Y up. The demo screen is a **convex 90° building corner at the origin**.

### 3.2 Screen spec `screens/<id>.json`
```json
{
  "id": "corner_90_demo",
  "panels": [
    {"name": "L", "pa": [-8,0,0], "pb": [0,0,0],  "pc": [-8,6,0], "res": [1920,1440]},
    {"name": "R", "pa": [0,0,0],  "pb": [0,0,-8], "pc": [0,6,0],  "res": [1920,1440]}
  ],
  "eye": [10, 1.7, 10],
  "ref_camera": {"look_at": [0, 3, 0], "fov_y_deg": 60, "res": [1920, 1080]},
  "viewing_zone": {"center": [10,1.7,10], "half_extent": [3,0,3], "grid": [7,1,7]}
}
```
- `pa` = lower-left, `pb` = lower-right, `pc` = upper-left of each panel, seen from the front.
- L lies in z=0 and faces +z. R lies in x=0 and faces +x.
- **Assert in code:** for each panel, `dot(normalize(cross(pb-pa, pc-pa)), eye - pa) > 0`.
- `ref_camera` is the ordinary pinhole camera at `eye`, used by BOTH P1 and P2 for street/reference images. Same intrinsics everywhere.

**Files to create:**
- `screens/corner_90_demo.json`: the above.
- `screens/regression_95deg.json`: same, but panel R rotated 5° about the y-axis at the corner, so the corner is 95°. Label it "regression fixture".
- `screens/live_*.json`: written by P3's form at demo time.

### 3.3 Scene `schemas/scene.schema.json` (P3 owns; P1 and P2 read)
```json
{"duration_s": 10, "fps": 30,
 "objects": [
   {"id":"can","type":"can","color":"#d33","label_text":"FIZZ",
    "keyframes":[{"t":0,"pos":[-3,2,-3],"rot":[0,0,0],"scale":1.0},
                 {"t":6,"pos":[1.5,3,1.5],"rot":[0,90,0],"scale":1.4}]},
   {"id":"title","type":"text","text":"Taste the corner","height_m":0.8,
    "keyframes":[{"t":7,"pos":[-4,4.5,0.05],"rot":[0,0,0],"scale":1.0}]}
 ],
 "backdrop": {"type":"room","depth_m":6,"color":"#123044"}}
```
- Interpolation: linear for position and scale, linear Euler degrees for rotation. Hold after the last keyframe.
- Object library sizes at scale 1, in `schemas/object_library.json`:
  - can: cylinder r=0.4, h=1.2
  - box: 1×1×1
  - sphere: r=0.5
  - text: `height_m` tall, width = 0.6·height·chars
  - particles: 200 points in a 1 m sphere
- `tests/fixtures/scene_test.json` is the hand-written scene above. Everyone uses it until Argon scenes exist.

### 3.4 Anchors `anchors.json` (P2 produces from scene.json)
- `{"times":[...], "anchors":[{"id":0,"object":"can","t":6.0,"p":[x,y,z]}, ...]}`.
- Sampled at every keyframe time plus every 0.5 s: the object center plus 8 bounding-box corners. Text gets its 4 corners.

### 3.5 Render output layout (P1 writes, P2 reads)
```
runs/<run_id>/v<N>/
  scene.json  assumed_screen.json  true_screen.json  anchors.json
  t_<ms>/L.png  R.png                 # panel content (ASSUMED spec), panel res
  t_<ms>/street.png                   # street sim (TRUE spec) from ref_camera
  t_<ms>/reference.png                # scene rendered directly from TRUE eye, ref_camera
  t_<ms>/idpass_street.png            # ID dots seen through street sim (no AA)
  t_<ms>/mask_ref.png                 # hero objects white on black, direct from TRUE eye
  street.mp4                          # street sim video, ~2-4 s walk-by + fixed eye
```
- **ID dot encoding:** anchor id `i` is drawn as a 5-px-radius disk with RGB = `(i // 256, i % 256, 255)`. The background is black, antialiasing off, no lighting.

### 3.6 Report `report.json` (P2 writes)
```json
{"run":"<id>/v<N>","checks":[
  {"check":"C2","status":"FAIL","value":{"mean_deg":0.9,"max_deg":2.1},"limit":{"mean_deg":0.25,"max_deg":0.75},
   "details":[{"anchor":12,"object":"can","t":6.0,"err_deg":2.1}]}
 ],"overall":"FAIL"}
```
Thresholds live in `config/thresholds.json` (P2 owns):
- C2: mean ≤ 0.25°, max ≤ 0.75°
- C3: ≤ 0.5°
- C4: ≤ 2%
- C5: ≥ 20 arcmin
- C1: exact

Tune on the day and record the final values in the README.

### 3.7 Command-line interfaces (the loop calls these)
- **P1:** `node headless/render.mjs --scene S --assumed A.json --true T.json --anchors anchors.json --out runs/<id>/v<N> --times 0,500,1000,... --video`
- **P2:**
  - `python -m checker.anchors --scene S --out anchors.json`
  - `python -m checker.run --dir runs/<id>/v<N> --true T.json --thresholds config/thresholds.json --out report.json`
- **P3:** `python loop.py --brief "..." --assumed A.json --true T.json [--scene S] --rounds 4`

---

## 4. Ownership map

| Path | Owner |
|---|---|
| `web/render/`, `web/viewer/` (3D views), `headless/`, `package.json` | **P1** |
| `checker/`, `config/thresholds.json`, `schemas/object_library.json`, `tests/test_checker*.py`, `tests/test_identity.py` | **P2** |
| `agent/`, `loop.py`, `schemas/scene.schema.json`, `schemas/patch.schema.json`, `web/app/` (form + results view), `README.md`, `.env.example`, `.gitignore`, `pyproject.toml` | **P3** |
| `screens/`, `tests/fixtures/`, `CLAUDE.md` | **Shared** (change only by team agreement) |
| `runs/`, `cache/`, `reports/` | Generated (`runs/` committed only for final evidence runs) |

**Stack (agreed):**
- Node 20, `three` (npm), Playwright (Chromium), ffmpeg.
- Python 3.12 with `uv`: `numpy`, `opencv-python-headless`, `scikit-image`, `jsonschema`, `jsonpatch`, `google-genai`, `pytest`.

---

## 5. P1 — Renderer (Three.js). Critical path: G1 by 12:00.

1. **`web/render/offaxis.js`:** Kooima generalized perspective projection per panel.
   - `vr = norm(pb-pa)`, `vu = norm(pc-pa)`, `vn = norm(cross(vr,vu))`.
   - `va = pa-e`, `vb = pb-e`, `vc = pc-e`, `d = -dot(va,vn)`.
   - `l = dot(vr,va)·n/d`, `r = dot(vr,vb)·n/d`, `b = dot(vu,va)·n/d`, `t = dot(vu,vc)·n/d`.
   - `P = frustum(l,r,b,t,n,f) · M^T(vr,vu,vn) · T(-e)`.
   - Set it as the camera's `projectionMatrix`, with the camera matrices held at identity. Assert the panel-faces-eye condition.
2. **`web/render/scene_builder.js`:** `scene.json` → Three.js objects (library in §3.3) with keyframe interpolation at time `t`. Backdrop room behind the panels (x<0, z<0).
3. **Panel render (ASSUMED spec):** render through each panel frustum from the assumed eye to an offscreen target at panel res → `L.png`, `R.png`.
4. **Street sim (TRUE spec):** a simple street scene (ground plane, building block) with two quads at the TRUE panel corners, textured with `L.png`/`R.png`, rendered from TRUE `ref_camera` → `street.png`.
5. **Reference render:** the scene rendered directly from TRUE `ref_camera` → `reference.png`.
6. **ID pass:** draw anchors as ID dots in the panel renders (assumed), then street-sim those → `idpass_street.png`. **Mask pass:** hero objects white, direct from TRUE eye → `mask_ref.png`. Antialiasing off for both.
7. **`headless/render.mjs`** (Playwright): loads a local page, calls `window.tangleRender(params)`, saves PNGs per time, then renders a frame sequence (fixed eye 2 s + walk-by ±2 m 2 s) → `street.mp4` via ffmpeg (H.264, `-preset veryfast`).
8. **`web/viewer/`:** an interactive view of the street sim (orbit + "stand at eye" button). This is the demo's visual centerpiece.

**G1 (with P2), by 12:00:** with assumed = true, `street.png` ≈ `reference.png` (P2 measures C2 mean < 0.05° and image SSIM > 0.95 inside the panel region). **If G1 fails at 12:00, the team decides go/no-go.**

---

## 6. P2 — Checker (Python, independent). Start immediately; C2 needs no images.

1. **`checker/geometry.py`:** re-implement the Kooima projection, ray–panel intersection, and the pinhole projection for `ref_camera` in numpy. **Do not port P1's JS.** Independence is the point.
2. **`checker/anchors.py`:** scene.json → anchors.json (§3.4).
3. **C2 reprojection (analytic):** for each anchor P:
   - Take the ray from the ASSUMED eye through P and intersect it with the assumed panels → (panel k, u, v).
   - Map (k, u, v) to the 3D point on the TRUE panel k → Q.
   - Project Q and P from the TRUE eye with `ref_camera`.
   - Error = angle between the two rays, in degrees.
   - Anchors behind the eye or hitting no panel count as C4 issues, not C2.
4. **C2 image cross-check:** find dot centroids in `idpass_street.png` by color id. Compare with the analytic Q projection, which should agree within ~2 px. Flag disagreements.
5. **C1 dims:** `L.png`/`R.png` match the panel `res` exactly.
6. **C3 seam:** compute the corner edge's projection in `ref_camera`.
   - FAIL if any text object's footprint crosses it.
   - Value = max difference in C2 error vectors between anchors within 0.3 m of the edge on the L side vs the R side, in degrees.
7. **C4 out-of-bounds:** project the TRUE panel union polygon into `ref_camera`. Value = fraction of white `mask_ref.png` pixels outside the polygon, per time, max over time.
8. **C5 readability:** text angular height from the TRUE eye = `2·atan(h/2/d)`, in arcmin.
9. **C6 (info, if time):** C2 mean at each `viewing_zone` grid point → `zone_heatmap.png`.
10. **`checker/run.py`:** writes `report.json` and `overall`. **`checker/certificate.py`:** on PASS, writes `certificate.json` with the true spec hash, scene hash, thresholds and every value.
11. **Tests:**
    - identity (C2 mean < 0.05°);
    - 95° vs 90° → C2 FAIL;
    - hero moved outside panel union → C4 FAIL;
    - text height ÷4 → C5 FAIL;
    - text across corner → C3 FAIL.

**G2 by 13:15:** all of the tests above behave as specified.

---

## 7. P3 — Argon, loop, UI, demo, repo hygiene

1. **10:30 repo setup:** `.gitignore`, `.env.example` (`GEMINI_API_KEY=`, `GEMINI_MODEL=gemini-4-argon`), `pyproject.toml`, `screens/` fixtures, `tests/fixtures/scene_test.json`, a README skeleton stating "design notes written before the event; all code written Oct 25". First commit and push.
2. **G0, by 10:50:**
   - one `gemini-4-argon` text call with a hard timeout;
   - decide how video reaches the model: a local MP4 via the SDK's file/inline input, or a fallback strip of ~12 PNG frames;
   - check the hackathon's *Gemini 4 Argon Hackathon Builder Guide* doc for the exact SDK call;
   - record the result in `reports/gates.md`.
3. **`agent/gemini.py`:** client wrapper. Timeout, fail fast on 429, cache, usage log.
4. **A1 `agent/generate.py`:** prompt = brief + screen description (volumes below) + schema + rules → `scene.json`. Validate against the schema; on failure, retry once with the validation error.
   - Inside volume: x∈[-8,0], z∈[-8,0], y∈[0,6].
   - Pop-out volume: x∈[0,3], z∈[0,3], y∈[1,5], near the eye→corner diagonal.
   - Text sits on ONE panel side, with `height_m` ≥ 0.6.
5. **A2 `agent/repair.py`:**
   - Input: `street.mp4` (or frames), `report.json`, current scene, thresholds.
   - Output `{"diagnosis": str, "patch": [RFC 6902 ops]}`.
6. **`agent/guard.py`:** reject a patch if it:
   - touches anything but `/objects/*/keyframes/*`, `/objects/*/scale`, `height_m` or `color`;
   - adds or removes objects;
   - has more than 6 ops;
   - puts positions outside the volumes.
7. **`loop.py`:** A1 (or `--scene`) → anchors → render → check → if FAIL, A2 → guard → apply → v+1. Up to 4 rounds. Everything goes to `runs/<id>/`.
8. **`web/app/`:** geometry form (corner angle 75–105°, eye height 1.5–2.0 m, eye distance) → `screens/live_*.json`. Results view: before/after street view side by side, the C1–C5 table with numbers, the certificate, and the C6 heatmap if present. Keep it visual, not dashboard-first.
9. **README, demo script (§9), 1-minute video, submission.**

**G3 by 13:15:** one Argon-generated scene rendered and checked end to end (PASS or FAIL is fine).
**G4 by 14:30:** a live geometry change → real FAIL → the loop reaches PASS in ≤ 4 rounds.

---

## 8. Timeline and sync points

| Time | Gate | Who |
|---|---|---|
| 10:30–10:45 | Contracts agreed, fixtures committed | All (P3 commits) |
| 10:50 | **G0** Argon works; video input path decided | P3 |
| 12:00 | **G1** identity test passes in JS and Python → **go/no-go** | P1 + P2 |
| 13:15 | **G2** checker mutation tests; **G3** Argon scene end to end | P2; P3 + P1 |
| 14:30 | **G4** live geometry change → FAIL → loop → PASS | All |
| 15:45 | Feature freeze; rehearse the demo twice | All |
| 16:20 | Record the 1-minute video | P3 |
| 16:50 | Submit (public repo, all 3 members on the submission) | P3 |

**Cut order if behind:** C6 heatmap → walk-by path (single eye frame) → C5 → `particles` type → image cross-check of C2.
**Never cut:** off-axis renderer, street sim, C2–C4, one real repair loop.

---

## 9. Demo (3 minutes, live, no slides)

1. **(20 s) Problem:** anamorphic ads only work from one spot on one exact screen, and studios calibrate them by hand for every screen and campaign.
2. **(30 s)** The judge types a brief. Argon generates the scene, the panels render, and the street view from the eye looks right.
3. **(40 s)** The judge changes the geometry (e.g. eye height 1.7 → 1.9 m, or corner 90° → 85°). The old creative is checked against the new geometry: C2/C3/C4 turn red with real numbers.
4. **(50 s)** Argon watches the street-view clip, says what breaks, and patches. Re-render, and the checks go green, with before/after numbers.
5. **(20 s)** Certificate plus the sweet-spot map.
6. **(20 s) Who it's for:** DOOH media owners and 3D studios. One creative, many screens, each with a measured certificate before the media buy.

**Pitch lines:** "Existing tools make the 3D content. Tangle measures whether the illusion actually holds from the street, and fixes it." / "Argon proposes; the geometry checker decides."

---

## 10. Research context (for the README and Q&A; facts as of Oct 24, 2026)

- Anamorphic content is rendered with a virtual camera matched to the screen's exact geometry and one viewing angle, and is not a resize of a normal ad. It suits single big moments, not broad always-on plans. (seeblindspot.com/anamorphic-3d-billboards)
- Production cost ranges published by vendors run from ~$2k–$5k tiers (coper.kz) to $10k–$200k+ (linsnled.com), and renders repeat for every campaign (zorkotechnologies.com).
- Existing tool: the aescripts *Naked-Eye 3D* After Effects panel already does camera matching and flat output for connected corner screens. **Tangle's difference is measured verification plus repair, not generation.**
- Off-axis perspective per screen and eye is the established method for seamless multi-screen images (CAVE VR literature; Kooima, *Generalized Perspective Projection*).
- **Not verified, do not cite:** VisionWrap, Reference, OneVision and Attention Insight capability claims.
- Limitation to state openly: results come from simulation, not footage of a real billboard.
