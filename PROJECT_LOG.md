# Sol Atlas: project log

This is the team's running record of everything done on Sol Atlas: what was built, where the data came from, the decisions, the problems hit and how they were fixed, and what's still open. Add a new dated entry at the bottom of [Timeline](#timeline) whenever you change something, and update [Open items](#open-items).

---

## Quick reference

| What | Where |
|---|---|
| Live site (Netlify) | https://sol-atlas.netlify.app (auto-deploys from `claude/busy-heisenberg-8gasem` on every push) |
| Netlify project | https://app.netlify.com/projects/sol-atlas (site id `3cde891d-2654-4f7a-b31d-30e5ad235ca8`, team `saracen66`) |
| GitHub | https://github.com/saracen66/the-sol-explorers, branch `claude/busy-heisenberg-8gasem` |
| Hosted preview (Claude artifact, private) | https://claude.ai/artifact/Y112MaLBdtadbz3UQCbHu2 |
| Pitch script (Claude Doc) | https://claude.ai/code/artifact/42b26b5c-f253-41a3-b6bb-d10e2c07a389 |
| Challenge | NASA Space Apps Challenge 2026: *Interplanetary Survival Guide: Martian Map* |
| Stack | three.js 0.186 + Vite 8 (front end); Python 3 + rasterio (data pipeline) |

---

## Background

- **Team:** The SOL Explorers, entering NASA Space Apps Challenge 2026.
- **Challenge:** *Interplanetary Survival Guide: Martian Map.* Build a layered, integrated view of a Mars location or route, using data from several NASA missions, to help an astronaut plan a Marswalk and do new science along the way.
- **First stage:** a 240-second pitch video for local judging.
- **Earlier work (Claude Cowork session, before 2026-09-24):**
  - A 240-second pitch script (WHO → WHY → WHAT → SO WHAT NEXT) for a product called **Sol Atlas**. Demo site: Jezero Crater, from a landing zone to the Three Forks sample depot. Hook: *The Martian*, "doing Watney's survival maths for the astronaut".
  - A research sheet of past Bangladeshi Space Apps global winners (2018 Team Olik, 2021 Mohakash, 2022 Team Diamonds, 2023 TeamVoyagers).
  - Inspiration: last year's placing project "Asteroid Odyssey" (Team Odyssey), a 3D Three.js globe with a HUD.
- **Goal of this build:** a demo, not a finished product. It shows judges real effort: a rotating 3D Mars, scroll to zoom into Jezero, then a game-style map view (like the planetary view in Elite Dangerous).

---

## Timeline

### 2026-09-24: phase-1 prototype built (Claude Code session)

**1. Data sourcing.** Checked which NASA data sources were reachable from the build machine.
- Many NASA sites could not be reached from that sandbox: trek.nasa.gov, science.nasa.gov, astrogeology.usgs.gov, HiRISE and PDS hosts.
- The **public USGS Astrogeology bucket on AWS S3 (`asc-pds-services`)** was reachable and turned out to hold everything needed, including the Mars 2020 Jezero datasets.
- No CRISM mineral data was in that bucket, so the minerals layer stays in phase 2.

**2. Data pipeline: `scripts/build_data.py`.** It reads cloud-optimised GeoTIFFs straight from S3 and bakes web textures:

| Output | Source (in `asc-pds-services`) | Processing |
|---|---|---|
| `g_color_2k/8k.jpg` | `wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif` | 8192 × 4096; shifted so 0° longitude is centred |
| `g_normal_4k.jpg`, `g_topo_4k.jpg`, `g_elev.png` | `wms_basemaps/Mars/MOLA/mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif` | normal map (18× relief), blue elevation ramp + hillshade, 1024 × 512 elevation grid for cursor readout |
| `g_thermal_4k.jpg` | `wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif` | clipped to ±54° latitude (edges are streaky), gentle S-curve, orange ramp |
| `r_*.jpg` (regional detail patch) | same three sources | 12° × 12° around Jezero at 2048², blended in as you zoom closer |
| `c_visible.jpg`, `c_decal.jpg` | `mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif` | 4096 × 4658 (≈ 22 m/px), tinted with Viking colour |
| `c_height.png`, `c_normal.jpg`, `c_slope.png` | `…/M20_JezeroCrater_CTXDEM_20m.tif` | 1024 × 1164 terrain grid; normals and slope from the full 20 m DEM |
| `c_thermal.jpg` | THEMIS night IR | resampled onto the crater grid at 100 m |
| `s_visible.jpg` | `mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` (3.4 GB) | 5 × 5 km reprojected to 4096² (≈ 1.2 m/px); strip seams flattened; tinted |
| `s_height.png`, `s_normal.jpg`, `s_slope.png` | `…/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_…_blend40.tif` | 2048² at 2.4 m for normals and slope; 1024² terrain grid |
| `s_thermal.jpg` | THEMIS night IR | uses the crater-wide stretch, so colours mean the same thing at both scales |

- The terrain views use the same map projection JPL used for the Mars 2020 science maps (equirectangular, true scale at 18.4663°N), so latitude/longitude converts linearly.
- All processed data is about **40 MB**, committed in `public/data/`.

**3. App built** (Vite + three.js, about 4,200 lines including the pipeline).
- **Orbit view:** custom planet shader with three blendable layers, a 12° detail patch plus the Jezero crater texture that fade in as you zoom, relief from MOLA, graticule, lock-on rings, atmosphere rim, Phobos/Deimos (sizes exaggerated about 6×, orbits to scale), stars and Milky Way.
- **Crater and Marswalk zone views:** one shared terrain renderer.
  - Terrain height is set in the vertex shader, so vertical exaggeration changes instantly.
  - Layers: visible, elevation, slope hazard, ground firmness, contours, holo.
  - Shadows are ray-marched on the GPU from the real Sun position.
  - The terrain block has side walls and floats over a grid floor.
- **Transitions:** a dissolve between scenes that are matched at the handover height, so orbit → crater → zone reads as one continuous zoom.
- **Planner:** A* route search that minimises oxygen, using the Pandolf walking model at Mars gravity, plus the O₂ and daylight budget, elevation profile and EVA flyover.
- **HUD:** mission clock (Mars24), live Earth–Mars signal delay, layer legends, cursor readout, data-sources dialog, autopilot for recording.

**4. Verification.** Headless Chromium with software WebGL (no GPU on the build machine), plus Node tests of the planner.

| Check | Result |
|---|---|
| Mars24 reference (2000-01-06) | MSD 44795.9998, Ls 277.19°, matches the published reference |
| Perseverance landing | sol 0; signal delay 11.37 min (NASA: 11 min 22 s) |
| Three Forks elevation from CTX DEM | −2,570 m (published −2,568 m) |
| Globe elevation spot checks | Jezero −2,543 m, Olympus Mons +19,701 m, Hellas −6,100 m |
| Default route (LZ-A → OEB → Three Forks → Séítah → LZ-A) | 7.19 km in Node / 7.11 km in the app (smoothed path), 3 h 13 min, 0.23 kg O₂, 62 % margin: GO |
| A* speed | each leg under 40 ms on a 512 × 512 grid |
| Suit at 0.30 kg O₂ | NO-GO; point of no return at Séítah (3.67 km) |
| Suit at 0.25 kg O₂ | NO-GO; point of no return mid-route at 2.98 km |
| Height PNG decode in the browser | matches the source data exactly |
| Browser console | no errors on any of the three views |
| Frame time without a GPU (640 × 360) | orbit 1.0 s, crater 5.1 s, zone 4.4 s per frame. **Not yet measured on a real GPU.** |

**5. Matched the demo to the pitch script** (after reading the script doc):
- Added the red **point of no return** marker (map + elevation profile).
- Added the **MARSWALK READY / NO-GO** banner. Clicking a named place in the zone adds it as a stop ("click Three Forks → route draws → O₂ check passes").
- Gave each science stop a one-line reason; pinned LZ-A and Three Forks on the crater view.
- Renamed the THEMIS layer to **Ground firmness**, as the script calls it.
- Added a conditions panel with typical MEDA/RAD values, clearly labelled "typical · not live".
- Added a wrist-display overlay during the EVA flyover.
- Autopilot now follows the script: layers → descent → crater layers → route → 0.25 kg what-if → flyover → pick Three Forks → end card.

**6. Problems hit and fixes**

| Problem | Fix |
|---|---|
| HiRISE zone came out pink/magenta (Viking colour is magenta over dark basalt) | Colour tint pulled toward rover-seen butterscotch; saturation reduced for HiRISE |
| Global THEMIS layer looked flat, then noisy | THEMIS mosaics are normalised per image; settled on a clipped ±54° band with a gentle S-curve |
| Crater floor missing in 3D (grid floor at y = 0 cut through the terrain) | Floor moved below the terrain block |
| Rendering too dark | Custom shaders now convert colour space properly (sRGB textures are decoded to linear) |
| Labels piling up at crater scale | Labels hide by priority when they overlap |
| Stop labels hidden behind the LZ label | Short tags on the map; full reasons in hover cards and the stop list |
| Time slider re-ran the route search on every tick | The sun check now refreshes without re-running A* |
| Default EVA would end after sunset (live Jezero time was evening) | Marswalk zone defaults to a 09:15 start |
| Point of no return missed at 0.30 kg O₂ | The check now runs on every sample, including right after work at a stop |
| "0.07 kg left, 0.07 kg required" looked contradictory | Messages show 3 decimals (0.070 vs 0.075) |
| Claude artifacts refuse `.bin` files | Heights stored as lossless PNGs (height = R × 256 + G); smaller too |
| Loading screen said "Rajshahi" (from last year's team) | Location removed (script says DIU, Dhaka) |
| GitHub push refused (403) | Owner connected GitHub to Claude; pushed |
| Source zip too big to send in chat (39 MB > 30 MB) | Sent a code-only zip; full repo is on GitHub |
| Netlify upload blocked from the build sandbox (`api.netlify.com` denied) | Owner linked the GitHub repo in Netlify; Netlify now builds on every push |

**7. Commits on `claude/busy-heisenberg-8gasem`**

| Commit | Time (UTC) | Summary |
|---|---|---|
| `526a8fe` | 2026-09-24 17:04 | Add Sol Atlas: layered 3D Marswalk planner on real NASA Mars data |
| `8187bda` | 2026-09-24 17:11 | Match the demo to the pitch script's storyboard |
| `e52c2e5` | 2026-09-24 17:26 | Serve heightmaps as lossless PNGs and fix point-of-no-return sampling |
| `c3ce972` | 2026-09-24 17:49 | Add Netlify build config |
| `b3b2e6e` | 2026-09-24 17:52 | Rewrite README, add screenshots and a project log |

**8. Hosting**
- A Claude artifact preview was published (private link above).
- Netlify project `sol-atlas` was created on team `saracen66`.
- `netlify.toml` builds with `npm run build`, publishes `dist/`, and sets cache headers.

### 2026-09-24: live on Netlify

- The owner linked `saracen66/the-sol-explorers` to the Netlify project `sol-atlas`. Netlify detected Vite and used `netlify.toml`.
- First production deploy `6ab56524`, from commit `97b6bd4` on `claude/busy-heisenberg-8gasem`:
  - state **ready**, built in 46 s, published 18:00:55 UTC;
  - both header rules applied (cache headers for `/data/*` and `/assets/*`);
  - 25 files uploaded: `index.html`, the JS/CSS bundle and all 22 data files. The 16 font files were unchanged, so Netlify didn't re-upload them.
- URLs: https://sol-atlas.netlify.app (production) and https://claude-busy-heisenberg-8gasem--sol-atlas.netlify.app (branch).
- **Not yet checked in a browser:** the build machine's network policy blocks `*.netlify.app`, so the live page still needs someone to open it.
- From now on, every push to the branch redeploys the site automatically. The commit that added this entry is the first test of that.

### 2026-09-24: performance and phone polish

**Reported by the team:** desktop sometimes lagged during the zoom transitions; on a phone the whole phone froze; the phone layout scrolled sideways and the UI overlapped.

**Causes found**
- Terrain shadows were ray-marched 56 steps for every screen pixel on every frame. That was half of the terrain's render cost.
- Phones got the desktop data: an 8192 px globe texture (larger than many phone GPUs allow, so the browser resized it on the CPU), 4096 px terrain images, and terrain meshes of about 1.2 million points.
- Level transitions rendered two full scenes at 2× resolution with 4× multisampling.
- Large images were decoded on the main thread, and the 8k globe was swapped in mid-session (a stall that could land during a zoom).
- The panels used a backdrop blur, which re-blurs the moving 3D canvas every frame.
- On phones there was no pinch-zoom, the top bar was wider than the screen, the layers panel covered the planet, and the left panel (Descend button, planner) was hidden.

**Changes**
- **Baked shadows:** a small GPU pass writes sun visibility into a texture only when the sun or vertical exaggeration changes; the terrain shader reads one texel.
- **Quality levels** (`src/core/quality.js`): high, medium and low, picked from pointer type, screen size, memory, CPU cores and GPU texture limit; `?q=` overrides.
- **Adaptive resolution:** the render scale follows real frame times, down within about a second when slow, back up after a few good seconds.
- **Phone data:** new `lite` pipeline stage with half-resolution textures (≤ 2048 px, 6.5 MB) and a 4k globe map. Phones download about 11 MB instead of 40 MB.
- **Lighter phone rendering:** terrain meshes resampled to half resolution (4× fewer points), 30 fps cap, fewer stars and sphere segments, and scanline/vignette overlays turned off.
- **Transitions:** dissolve buffers at 1× resolution without multisampling.
- **Loading:** images decoded off the main thread (`createImageBitmap`). Everything is compiled, uploaded and baked behind the loading screen, including the route lines and the transition buffers.
- **Leaner per-frame work:** backdrop blur removed (solid panel tint instead), the effects canvas hidden when idle, the readout refreshed 10×/s, per-frame allocations reused.
- **Phone UI:**
  - A compact top bar, and the side panels became a bottom sheet with tabs (JEZERO / CRATER / PLANNER, LAYERS, DATA SOURCES, AUTOPILOT).
  - Held sideways, the sheet is a side panel.
  - Touch controls: pinch zoom, two-finger pan, tap to select or descend.
  - A wider field of view in portrait, safe-area insets for notched phones, touch-specific wording ("pinch or tap"), and browser page-zoom blocked on the 3D view.

**Verification** (headless Chromium, software rendering)

| Check | Before | After |
|---|---|---|
| Crater frame at 640×360, desktop settings | 5.13 s | 2.97 s (same as with shadows off) |
| Zone frame at 640×360, desktop settings | 4.41 s | 2.73 s |
| Crater / zone frame, phone settings | 5.13 / 4.41 s | 0.48 / 0.40 s (about 11× lighter) |
| One crater shadow bake (software) | n/a | 0.70 s high / 0.10 s low (a few ms on a real GPU, only when the sun moves) |
| iPhone 14 emulation (390 × 664): anything wider than the screen, on orbit, both sheets, crater, zone | top bar overflowed | nothing, on every screen |
| iPhone 14 sideways (750 × 340) | n/a | nothing overflows; sheet shows as a side panel |
| Shadow look vs the old per-pixel version, same sun time | n/a | matches (same rim and crater shadows) |
| Adaptive resolution under slow rendering | n/a | stepped 1.25 → 0.6 automatically |

Real-phone and real-GPU frame rates still need checking on the team's devices.

**Deployed:** commit `0817e6e` → Netlify deploy `6ab584ca`, ready at 20:15 UTC (19 new files: the phone textures, the 4k globe, the new bundle).

---

## Decisions and assumptions

| Decision | Why |
|---|---|
| USGS S3 data instead of the Mars Trek tile API | Full-resolution originals (CTX 5 m, HiRISE 25 cm, 1 m DTM), fully offline once processed, no dependency on a tile server during judging |
| Three levels (orbit → crater → zone) | Matches the "zoom from orbit to the ground" game feel, and each level uses the data at its natural resolution |
| Route cost = metabolic energy, not distance | The real constraint on a Marswalk is oxygen; flat detours are cheaper than climbs |
| EVA defaults: 75 kg crew, 58 kg suit, 0.60 kg usable O₂, 25 % reserve, 20° limit, 20 min stops | Planning numbers chosen to be plausible, and editable in the UI. Not flight values |
| LZ-A at 18.4500°N 77.4850°E | Flat lava floor, ≥ 2 km from the depot so engine plume can't hit the sample tubes. **Our proposal, not NASA's** |
| CRISM and live MEDA kept as "phase 2" | Data not available to the build. Showing them as locked is more honest than faking them |
| Colour: blue ramp for elevation, orange ramp for thermal, standard status colours (good/warning/serious/critical) for slope hazard | Each ramp stays one hue so it reads as low → high; status colours always come with a label |
| Heights as RG-packed PNGs | Lossless, works on every static host and in Claude artifacts |
| Shadows baked to a texture, not per pixel | Same look, a fraction of the cost; re-baked only when the sun or exaggeration changes |
| Automatic quality levels + adaptive resolution | One build that runs on a gaming PC and on a phone without manual settings |

---

## Open items

- [x] First Netlify deploy (repo linked, production deploy `6ab56524` from `97b6bd4`, 2026-09-24 18:00 UTC).
- [ ] Open https://sol-atlas.netlify.app in a desktop browser and click through orbit → crater → Marswalk zone. The build machine can't reach netlify.app, so the live page hasn't been checked in a browser yet.
- [ ] Open a pull request from `claude/busy-heisenberg-8gasem` into `main`, then switch Netlify's production branch to `main` (it currently publishes `claude/busy-heisenberg-8gasem`).
- [ ] Test on the team's real computers and phones after the performance update (the level is picked automatically; `?q=low|medium|high` forces one).
- [ ] Record the pitch video with the autopilot (`C`, `K`, `H`).
- [ ] Pitch script: change the CRISM voiceover line to future tense, e.g. "CRISM minerals are next".
- [ ] Add team member names and roles to README → Credits.
- [ ] Choose a licence for the code (none chosen yet).
- [ ] Phase 2: CRISM mineral layer, live MEDA weather, more sites (SWIM ice maps), dust-storm alerts, offline mode.

---

## How to update this log

Add a new section under **Timeline** with the date and a short title. Say what changed, why, and how you checked it. Add any new commits to the commit table, and tick or add items in **Open items**.
