# Credits and asset provenance

All code in this repository was written on Oct 25, 2026 during the hackathon (`CLAUDE.md` is a design note written before the event).

## Third-party code
- **three.js** (MIT, (c) three.js authors): vendored under `web/hero/vendor/three/` with its `LICENSE`; also used from `node_modules` for the renderer and tests.
- **Playwright** (Apache-2.0), **ffmpeg** (LGPL/GPL build installed locally), **numpy / opencv-python-headless / scikit-image / jsonschema / jsonpatch / google-genai / pytest** (their own open-source licences, installed from PyPI/npm, not vendored).
- UI: Tailwind CSS (CDN), Geist and JetBrains Mono fonts and Material Symbols (Google Fonts, loaded from their CDNs), built from the team's Stitch designs.

## Generated assets (Gemini image models; invented content, no real brands, people or places)
- `web/hero/assets/bg_corner*.png`, `scene.jpeg`: AI-generated night street photos with a blank corner screen. **AI-generated environment, not a real location.**
- `web/hero/assets/flare_label.png`, `argon_label.png`, `car_on_black.png`, `car_gp_*.png`, `race_*.png`: Nano Banana images (FLARE is an invented product; the Argon label uses the Gemini 4 Argon product name as an unofficial fan ad; no real team livery, sponsors, numbers or drivers).
- `web/hero/target_01.png`: a reference image for the art-direction critic only; not shown in any output.
- `web/app/assets/**`, `web/hero/hero_poster.jpg`, exported videos under `web/hero/exports/`: renders from this repository's own code, composited into the generated photos.

No downloaded 3D models are used; every 3D object is a procedural primitive.
