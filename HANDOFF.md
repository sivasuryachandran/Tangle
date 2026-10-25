# HANDOFF — P3 (Argon + loop + UI), state as of Oct 25 2026 ~12:50

Read `CLAUDE.md` first (contracts, ownership, hard rules). This file is what P3 built, how to run it, what is in flight, and what is left.
Rules that matter most: **no secrets in git** (`.env` is local only), **never force-push / rewrite history**, **no `Co-Authored-By` trailers**, every number shown must come from a file in `runs/`, never claim more than the runs show, only the checker decides PASS.

## 1. Run it
```
uv sync --python 3.12                    # Python deps (venv at .venv; always use .venv/bin/python or `uv run`)
npm install                              # P1's renderer deps (playwright, three)
cp .env.example .env                     # then set GEMINI_API_KEY (ask the team; never commit it)
.venv/bin/python -m pytest -q tests      # ~86 tests, must stay green
python3 web/app/server.py                # UI at http://localhost:8000/web/app/index.html  (serves repo + /api/*)
node headless/server.mjs 8080            # P1's 3D viewer: /web/viewer/index.html?run=runs/<id>/v<N>
```
The real loop (renders with Playwright/Chromium + ffmpeg, checks with P2's `checker/`, repairs with Argon):
```
.venv/bin/python loop.py --scene tests/fixtures/scene_argon_v1.json \
  --assumed screens/corner_90_demo.json --true screens/regression_95deg.json --rounds 10 --run-id <id>
# other flags: --brief "..." (A1 generates the scene), --inputs inputs/<id> (photo+brand facts), --fast, --stub, --thresholds
```
Exit codes: 0 PASS, 1 FAIL after all rounds, 2 repair failed. Output: `runs/<id>/v<N>/` + `runs/<id>/loop_summary.json`. `runs/` is gitignored; evidence runs are committed with `git add -f runs/<id>`.

## 2. What exists (P3 owns: `agent/`, `loop.py`, `schemas/scene|patch.schema.json`, `web/app/`, `README.md`, `.gitignore`, `pyproject.toml`, `deploy/`)
| Path | Purpose |
|---|---|
| `agent/gemini.py` | Client wrapper: 120 s hard timeout, 429 stops (`RateLimited`), cache by request hash in `cache/`, usage log `reports/model_calls.jsonl`, `video_part()` inline-video guard (>15 MB → re-encode 720p/15fps/≤10 s, else raise), `generate_image()` for Nano Banana. |
| `agent/generate.py` | **A1**: brief (+ confirmed brand inputs + photos) → scene.json. Schema validate → volume rule → brand checks, one retry with the error message. |
| `agent/volumes.py` | Shared volume rule (A1 + guard): inside x,z∈[-8,0] y∈[0,6]; pop-out x,z∈[0,3] y∈[1,5]; text on L z∈[-0.5,0] / on R x∈[-0.5,0]. **Corner-90 only** (see §5). |
| `agent/repair.py` | **A2**: video (or note "no video this round") + report + scene → `{diagnosis, failure_timestamps_s, patch}`; guard-checked; retries once on rejection; on a 120 s timeout retries once with `thinking_level=low`. |
| `agent/guard.py` | Patch guard: ≤6 ops; only `/objects/N/keyframes/...`, `scale`, `height_m`, `color`; no add/remove objects; schema + volumes; **hero rule** (hero = object with `label_text`, else first can/box: every keyframe scale ≥0.9× its v1 scale, never 0, keep ≥1 pop-out keyframe, ≤1 *new* non-hero object vanishes per run). |
| `agent/timeline.py` | Checker failing times (from report `details`, or `failure_times_s` if P2 adds it) and Argon↔checker agreement (±0.5 s precision/recall). Stored in `repair.json`. |
| `agent/inputs.py` | Optional product photos (1–3 PNG/JPG ≤5 MB) + brand PDF/text → extracted object type, colors, label, tagline, forbidden words. Writes `inputs/<run_id>/{photo_*,brand.*,analysis.json,brand.json,confirmed.json}`. **`inputs/` is gitignored — judge photos are never committed.** No geometry ever comes from the model. |
| `agent/texture.py` | Nano Banana (`gemini-nano-banana-2.1`) label → `inputs/<id>/label.png` (2150×1024 ≈2.1:1, centred badge ≈30% wide, flat bg made transparent). `scene.objects[hero].label_image` = repo-relative PNG path (schema pattern: no `..`, no abs path, no URL). |
| `loop.py` | A1/`--scene` → anchors → render (`node headless/render.mjs … --times key`) → `checker.run` → if FAIL: A2 → guard → apply → v+1. `--fast`: render-free rounds via `checker.run --skip C1` (always FAIL by design, never certifies); a clean round = *candidate* → full render + full check (only that decides PASS/certificate), then v1 is rendered for before/after. `--stub` uses `tests/stubs/` fakes (every file labelled STUB, run id `STUB_*`). |
| `web/app/` | UI built from the Stitch export (Tailwind CDN, Geist + JetBrains Mono, tokens in `tokens.css`, amber accent). Pages: `index` (landing), `new-test`, `street-view-test`, `repair`, `certificate`, `screens`. `shell.js` = header/footer/provenance bar + run-data layer. `server.py` = static server + `/api/*` (screens, runs, run start, input analysis); `TANGLE_READONLY=1` disables POST. `web/app/design/` holds DESIGN.md (reference, **not served**). Every 3D viewport keeps `id="street-canvas"` (P1 mounts the real viewer there). |
| `deploy/stage.sh` | Stages a read-only cloud site (web/app + screens + config + chosen runs). |
| `tests/` | `test_guard.py` (guard, hero rule, timeline), `test_inputs.py` (uploads, brand checks, label), `stubs/`, fixtures. P2's checker tests live there too. |

Thresholds are in `config/thresholds.json` (P2 owns); README has the table. C2 is deliberately tighter (0.08° mean / 0.28° max) than CLAUDE.md's 0.25°/0.75° (reason in `reports/notes.md`).

## 3. Results so far (all in `reports/gates.md`; runs are local under `runs/`)
- G0 (Argon call, inline video) PASS. G4 rehearsal `g4_rehearsal` (no hero rule): PASS at v4, C2 mean 0.1215→0.0846→0.0427→0.0353°.
- With the hero rule, `g4_hero` (4 rounds) and `g4_final` (6 rounds) both ended FAIL (C2 *max* 0.327° vs 0.28° at v6, falling every round). The hero rule never blocked a repair. Argon's cited failure times matched the checker's exactly (precision = recall = 1.0 at ±0.5 s) on v1–v5.
- Medium-thinking A2 calls timed out at 120 s on 3 of 5 repairs in one run; the low-thinking retry fixed it. Cause: hard constraints (hero cannot shrink) make the model deliberate for minutes.

## 4. In flight / next (in this order)
1. **`g4_final` was re-launched with `--rounds 10`** (run id `g4_final`; earlier failed attempts are kept aside as `runs/g4_final_attempt*_*`, not committed). Check `runs/g4_final/loop_summary.json`. If PASS: `git add -f runs/g4_final && git commit && git push`; tell P1 the run id and the final version folder; put `g4_final` in the README as the source of the numbers (with the C2 sentence); record agreement precision/recall + total time in `reports/gates.md`. If it FAILS again, report it — do not retry silently.
2. Pull P1's `--hero` still (P1 sends the exact command; it writes `runs/g4_final/<final>/hero.png`). Use it as the landing fallback still.
3. **UI spec from the user (start only after g4_final is committed+pushed):** landing hero ≈70vh looping the real `runs/g4_final/<final>/street.mp4` (muted, autoplay, no controls, left dark scrim, headline “3D billboard ads that pass the street-view test.”, one accent button “Run a test”, line “Simulated street view, not camera footage.”, container `id="hero-media"`, last real frame as the still if the video fails — never a generated image); a proof strip under it bound to `report.json` (FAIL first version → PASS, C2 degrees from the files, no hard-coded numbers); New Test restyle (night-street look like P1's render, smaller geometry preview under a “Geometry” label, readable logo, fix clipped breadcrumb, dashed drop-zone file inputs, one type scale: labels 11 px mono, body 14 px); brand/presets → **FLARE** (blood-orange soda, can `#E8341C`, label_text `FLARE`, tagline “Light up the corner.”, nothing resembling a real brand). Note: earlier the user said "VOLT is fine" and the fixtures are VOLT; the latest instruction is FLARE — regenerate `tests/fixtures/scene_argon_v1.json` via A1 only if the user confirms. If P1's real render looks flat, tell P1; do not compensate in CSS. Tokens: bg `#000`, surface `#0E0E10`/`#17171A`, accent `#FFB340`, text `#F5F5F7/#8E8E93/#48484A`, pass `#3FB27F`, fail `#E5484D`, never `#767777`/cyan.
4. **Not started (user-queued):** (a) model settings: A1 + campaign `thinking_level=high` with `background=True` polling (cap 15 min), A2 medium (120 s), validation/extraction low, no temperature/top_p/top_k (none are set today; `generate()` has no `background` support yet); (b) `agent/campaign.py`: one Argon call (`background=True`, `max_output_tokens=200000`) with brief + photo + all screen presets → one scene per screen (volumes derived from each preset's panel geometry), checker per screen, UI grid of screens with check status; (c) tell P1/P2 about `label_image` (done in chat, schema field exists).

## 5. Known gaps / gotchas
- `screens/flat_roadside.json`, `curved_wall.json`, `three_face.json` do **not exist** (CLAUDE.md says add after G4). The UI picker greys them out. `agent/volumes.py`, the A1 prompt and the guard still assume the 90° corner (L/R text rules) — they must be generalised per screen before any other preset can run through A1/guard. Whoever adds presets must tell P1.
- Cloud: read-only results site is live at https://tangle-results-8928899370.us-west1.run.app (project `tangle-512718`, Cloud Run `tangle-results`, region us-west1, shows only `g4_rehearsal` so far). Redeploy: `deploy/stage.sh <run ids…>` → `docker build --platform linux/amd64 -t us-west1-docker.pkg.dev/tangle-512718/cloud-run-source-deploy/tangle-results:vN deploy/stage` → `docker push` → `gcloud run deploy tangle-results --image … --region us-west1 --allow-unauthenticated`. Cloud Build (`--source`) fails (default compute SA lacks permissions); granting IAM roles was declined, so the local-Docker path is the one that works. No API key is in the cloud; never stage `STUB_*` runs or `inputs/`.
- `git pull --rebase` fails if `reports/model_calls.jsonl` is modified: commit it first (it is tracked and appended by every model call).
- The UI server must be restarted after editing `server.py`. `server.py` runs under the system `python3`; anything needing `google-genai` is launched via `.venv/bin/python` subprocesses.
- Untracked junk in the working folder that must not be committed: `.vscode/`, `CLAUDE (1).md`, `stitch_*.zip`, `inputs/`, `deploy/stage/`, `cache/`.
- Stub runs (`STUB_*`, `tests/stubs/`) show an orange “STUB DATA” banner in the UI and must never be used as evidence.
- Model/API facts are in `reports/notes.md` (inline image/PDF input works; `{"type":"document"}` for PDFs) and `reports/gates.md`.
