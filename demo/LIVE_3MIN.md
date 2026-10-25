# Tangle — 3-minute live demo run sheet

Path **B** (no certified run). Numbers from `demo/values.json` (run `g5_flare`, thresholds hash `ad64ffec…`).
App: `http://localhost:8000/web/app/` · Viewer: `http://localhost:8080` · Fallback run: `g5_flare` (6 versions, 525 s, recorded earlier today).

**Before you start (driver):** both servers running, browser full screen, tabs open in order:
1. `index.html` (landing, hero playing)
2. `new-test.html`
3. `street-view-test.html?run=g5_flare`
4. `repair.html?run=g5_flare`
5. `certificate.html?run=g5_flare`
6. `downloads.html?run=g5_flare`

---

## 0:00–0:30 · Landing page, hero playing
**Driver:** Tab 1. Let the hero play; click *Left*, then *Right*, then *Street (sweet spot)*.

**Presenter:**
> "Picture a brand that just paid for the most expensive corner in the city: a giant 3D screen wrapping around a building. Their studio spent weeks on a can that bursts out of the wall. Launch night, people walk past, and it looks flat and bent across the corner. The screen was installed a few degrees off the plan, and nobody checked, because there was nothing to check it with."

## 0:30–0:50 · New Test page, then the last good run
**Driver:** Tab 2. Point at the brief, the photo/brand drop zones and the screen types (Corner 90°, Flat roadside, Curved wall, Three-face). Then Tab 3.

**Presenter:**
> "Tangle is that check. You give a brief and the real screen. Gemini 4 Argon builds the 3D scene. We render the panels, simulate the street view from where people stand, and an independent geometric checker measures reprojection error, seams, clipping and readability. Argon never grades itself."

## 0:50–1:25 · Judge's turn
**Driver:** Tab 2. Hand the judge the screen form: they set *Corner apex angle* to 85° or 95°. Tick *Reuse the saved FLARE scene* (skips generation) and *Fast mode*, press **Generate with Gemini & verify**. The checker runs the saved scene against the new geometry, and the loop then continues into Argon repairs on its own. The page jumps to the Street-View Test when the run finishes; read the C2 max of v1 there.

**Presenter:**
> "Pick the real corner angle. … That's a real geometry change, not a staged bug. The checker reads ___ degrees *(read the C2 max off the screen)*, over the 0.28 limit, so it fails."
*(Only say "the seam check fails" if C3 shows FAIL on screen; in `g5_flare` v1 the seam check passed.)*

If the run is still going at 1:20: switch to Tab 3 (`g5_flare` v1: 95° corner, C2 max 1.5° against the 0.28° limit, FAIL).

## 1:25–2:10 · Repair
**Driver:** If the judge's run has reached v2 within 40 s, open its Repair page; otherwise (or if it fails) open Tab 4 (`g5_flare`). Click through REV v1 → v5; point at Gemini's diagnosis, the patch ops "accepted by guard", and the check deltas.

**Presenter:**
> "Argon watches the street-view video and the report and proposes a fix. Our guard rejects fixes that cheat, like shrinking the product until nothing gets measured. Then the checker runs again."

Fallback line:
> "Live calls are slow, so here's the same loop recorded earlier today: six versions in 525 seconds."

## 2:10–2:35 · Version strip, viewer, delivery pack
**Driver:** Tab 4 version strip → hero panel below it: *Stand at eye*, then the viewpoint slider (walk-by) → Tab 5 (NOT CERTIFIED sheet) → Tab 6 (downloads).

**Presenter:**
> "The error went from 1.5 to 0.48 degrees. Still over the limit, so it stays NOT CERTIFIED. That's the point: the certificate only exists when the checks pass."
> "You get per-panel video at native resolution, the street-view proof and the report."

## 2:35–3:00 · Landing page
**Driver:** Tab 1 (or `screens.html` while you say "any panel layout").

**Presenter:**
> "Out-of-home advertising was 54 billion dollars last year, and digital screens are now half of it. The most ambitious ads on those screens go live without proof. Tangle gives studios, screen owners and brands that proof before launch. The same checker runs on any panel layout; today we ran corner, three-face, curved wall and roadside screens. Thank you."

On screen at least once: **"Simulated street view, not camera footage."** (hero caption, Certificate sheet, video end card).

---

## Judge Q&A

- **Real footage?** No. A simulated street view from the real screen geometry; it says so on screen.
- **Argon vs checker?** Argon writes the scene, watches the video and proposes fixes. The checker is geometry code and is the only thing that decides PASS.
- **Why 0.28°?** Our identity test showed the renderer reproduces itself far below that, so a looser limit would let real errors pass. In reference-camera pixels (1080p, 60° FOV): about 5 px max, 1.4 px mean.
- **Built today?** Yes. Git history starts at the event.
- **What doesn't work yet?** Generation is tuned for the corner screen; other layouts are verify-only. Flat roadside screens get readability value, not a strong 3D illusion. The repair loop doesn't reliably reach PASS yet: in `g5_flare` the C2 max plateaued around 0.48° against 0.28°.
- **Market numbers?** WOO 2026 report: OOH 54.2 B USD in 2025; digital 25.5 B (47%), forecast 28 B (49%) in 2026.
- **Who pays?** Studios (check before delivery), screen owners (sell 3D-ready slots with proof), brands (certificate before airtime). Not proven yet; next step is showing it to three studios and two screen owners.
