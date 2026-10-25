# Tangle — 3D billboard ads that pass the street-view test

> Argon designs an anamorphic 3D ad for a corner screen. Tangle renders it, simulates what a
> pedestrian sees, **measures** whether the illusion holds, lets Argon repair the scene, and issues
> a certificate. **Argon proposes; an independent geometry checker decides.**

**Hackathon disclosure:** `CLAUDE.md` is a design note written before the event (before 10:30).
All code in this repo was written on Oct 25, 2026 during the hacking window.

Track: Problem Statement Two — More Dimensions. Results come from simulation, not footage of a real billboard.

## Status
Work in progress. Every number reported here comes from a run in `runs/` (PASS / FAIL / NOT RUN).

| Gate | Status |
|---|---|
| G0 Argon call works | NOT RUN |
| G1 identity test | NOT RUN |
| G2 checker mutation tests | NOT RUN |
| G3 Argon scene end to end | NOT RUN |
| G4 live geometry change → loop → PASS | NOT RUN |
