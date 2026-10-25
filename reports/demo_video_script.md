# 1-minute demo video: storyline (draft from P2, for P3 to record; record at 16:20)

**Main use case of Gemini Argon:** Argon is the part that *looks at what was rendered and fixes it*. It writes the 3D scene from a brief, then **watches the street-view video** of what a pedestrian would see, reads the checker's measured errors, says what is wrong, and returns a small patch. The track is "render it, watch it, critique it against the goal, fix it in a loop". The checker, not Argon, decides pass or fail.

**One-line message:** "Argon proposes. An independent geometry checker decides. Together they fix a 3D billboard ad until it measurably holds from the street."

## Beat sheet (about 60 s, about 150 spoken words)

| Time | On screen (existing asset) | Voice-over |
|---|---|---|
| 0–8 s | `runs/demo_live85/side_by_side.png`, left tile, or P1's photo composite (caption "AI-generated environment, not a real location" stays on) | "A 3D billboard ad is a picture that lines up perfectly from one spot, on one exact screen. Change the screen and the illusion breaks, and today studios fix that by hand." |
| 8–18 s | Type the brief into the app: "A glowing ARGON gas canister spins into the corner and bursts out toward the viewer…". Then `runs/extra_argon_label/v1/street.mp4` | "We give Gemini Argon a one-sentence brief. It writes the 3D scene, and we render what a pedestrian at the corner would see." |
| 18–30 s | Change the corner to 85° in the form. Show `runs/demo_live85/error_overlay.png` plus the numbers: C2 mean 0.415° / max 1.456°, C3 0.256°, FAIL | "Now the real corner turns out to be 85°, not 90°. A separate geometry checker measures it: the content is off by up to 1.5 degrees, and the seam breaks. These are measured angles, not opinions." |
| 30–46 s | Repair page: Argon's own diagnosis text, its patch (at most 6 operations), the guard accepting it, then the re-render. **Per-round numbers from the final verified run only** | "Argon watches the street-view clip with the checker's report, says what is wrong, and proposes a small patch. A guard checks the patch is allowed. We re-render and measure again. Round by round the error falls: [FILL FROM RUN]." |
| 46–54 s | Results view: all checks green, `certificate.json` with the thresholds hash. If the run did not pass: show the real final numbers instead and say so | "When every check passes, we issue a certificate stamped with the exact limits it was judged under." |
| 54–60 s | Title card: "Argon proposes. The checker decides." plus the line "Simulated verification, not a real billboard." | "One creative, many screens, each measured before the media buy. Argon proposes; the checker decides." |

## Numbers: where each one must come from
- **Slide 18–30 s (real today):** `runs/demo_live85/v1/report.json` (stamp `a9d314fa…`), the 85° geometry applied to `extra_argon_label` content. Mean error in the proof view 6.5 px, max 22.2 px.
- **Slide 30–46 s and 46–54 s (not available yet):** needs a finished geometry-change repair run on current `main` under the frozen limits. Until one exists, **no round-by-round number goes in the script.** `g4_final` (6 rounds) did not pass (C2 max 0.349° vs 0.28° at v6); `g4_final_b` stopped at v3. P2 verifies the final run's report and certificate before recording.
- **If no run passes by 16:20:** keep the same story but show the real final round and say it plainly ("after N rounds Argon brought the mean error from X to Y; the maximum is still over the limit, so no certificate"). That is a true story about a checker that does not let Argon grade itself.

## Rules for what we say and show
- Say "simulated" and keep the AI-generated caption on any composite photo. Never say we validated a real billboard.
- Do not say "first", "only", "works on any screen", or "only possible with Argon".
- The race car is a flat photo card and an extra example; leave it out of the 1-minute cut.
- Show only runs that exist in `runs/`. If a live repair is not reliable on the day, show the recorded run and label it "recorded".
- The limits are visible errors by design (1.4 px mean, 5 px max, 3.6 px seam in the proof view); don't call them invisible.

## What P2 will provide for the video
1. A verified table for the chosen run (every number checked against its own report and thresholds hash).
2. The error-arrow overlay for the final geometry, on the final run's frame, if you want a before and after pair.
3. The `gates.md` entry for that run, so the README and the video quote identical numbers.
