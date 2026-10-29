# Validation report (2026-10-27)

Runtime: `npm run build` OK (tsc clean). Headless Chromium + SwiftShader (software GL, ~1-2 fps), so performance numbers there are not representative.
Draw calls after static batching: ~1.5k-2.7k depending on view (was 8.9k before batching). 583 colliders, 72 vehicles, 48 pedestrians.

Real-input checks (Playwright keyboard/mouse, rAF paused and stepped for software GL):
- Click "MASUK KOTA" enters walk mode (body.entered, HUD changes). OK
- W from SPAWN (226,162.5) walks through DOOR_L1_P01 into L1_LOBI. OK
- Wall S3 blocks at X=244 (door P04 at X 245.1-246.9). OK
- F at ANCHOR_WS_PC_03 shows the mission toast. OK
- E in L1_STAIR goes L1 -> L4, arriving in the L4 corridor; the corridor wall blocks. OK
- JPO: climb the north stair 0.15 -> 5.75 m, walk the deck south, the rail holds the player on the deck. OK
- All 10 nav buttons clicked; location text and active state update. OK

Visual review (my judgement): overview, Simpang, Hotel, Denah L1 cutaway, Lobi, Workshop, Server, Ruko/Pasar, Kampung, Taman, and narrow 390x844 were all captured and inspected.
Fixed after inspection:
- noisy carpet ceiling (added ceilings)
- overflowing sign text (auto-fit)
- toolbar overlapping the nav
- hero copy covering subjects (collapses on review views)
- white background pillars (darker, further away)
- an external font link that blocked all input while offline (removed)
- noisy workshop carpet

Known limits:
- Interiors are lit flat.
- Props are placeholders by design (Meshy later).
- Cars do not turn.
- Stairs and lift are floor teleports.
- Pointer-only orbit drag and wheel were not machine-verified.
- The embedded Page sandbox may block pointer lock and the GLB download (drag-look still works).
Status: ready for user review, not approved.
