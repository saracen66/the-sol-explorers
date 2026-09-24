# Sol Atlas: Marswalk Planner

**The SOL Explorers · NASA Space Apps Challenge 2026 · "Interplanetary Survival Guide: Martian Map"**

Sol Atlas is a layered, game-style map of Mars. It stacks data from several NASA missions on one 3D map and uses it to plan a safe Marswalk: a route an astronaut can walk, with the oxygen, daylight and slope limits worked out. Mark Watney had to do that maths in his head. Sol Atlas does it for you.

Start in orbit around a rotating Mars. Scroll in and the map locks onto **Jezero Crater**, then drops you onto a 3D model of the crater built from orbital stereo data. Zoom in again to reach the **Marswalk zone** around Perseverance's landing site and the Three Forks sample depot. There you can plan an EVA on foot using 25 cm/pixel HiRISE imagery on a 1 m elevation model.

> Phase-1 prototype for the local-judging video. Jezero is the only site unlocked; the others show as "phase 2".

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build (static files, works from any folder or USB stick):

```bash
npm run build        # → dist/
npm run preview      # serve dist/ at http://localhost:4173
```

`dist/` is plain static HTML/JS plus about 45 MB of data. Open it with any static server, or drop it on GitHub Pages or Netlify. Use a desktop browser with a real GPU (Chrome, Edge or Firefox). Add `?q=low` to the URL on a weak laptop; it turns off terrain shadows and high-DPI rendering.

### Controls

| | Orbit | Crater / Marswalk zone |
|---|---|---|
| Drag | spin the planet | orbit the camera |
| Right-drag / Shift-drag | | pan |
| Scroll | zoom (locks onto Jezero when close) | zoom to the cursor. Scroll past the limit to go up a level |
| Click | click Jezero / the lock-on to descend | click the Marswalk zone to enter it. In the planner, click the map to add a stop |
| Keys | `1-3` layers · `G` grid · `Space` rotation · `Enter` descend | `1-6` layers · `WASD` pan · `Enter` enter zone · `Esc` go up · `Space` run the EVA sim |
| Anywhere | `C` autopilot · `H` hide HUD · `K` captions on/off | |

### Recording the pitch video

Press **`C`** (or **▶ AUTOPILOT**) for a scripted fly-through of about 90 seconds. It runs orbit → layers → lock-on → descent → crater layers → Marswalk zone → safest route → EVA simulation → holo mode, with captions. Press `K` to hide the captions if you're doing your own voiceover, and `H` to hide the HUD for clean B-roll. Any click or scroll hands control back to you. `?autopilot` in the URL starts it automatically.

Record at 1920×1080 with OBS, or with the Xbox Game Bar (`Win+Alt+R`).

---

## What's on the map (all real NASA data)

| Level | Layer | Mission / instrument | Product |
|---|---|---|---|
| Orbit | Visible colour | Viking Orbiters | MDIM 2.1 global mosaic, NASA Ames colour (232 m) |
| Orbit | Topography + relief | Mars Global Surveyor · MOLA | MOLA 128/64 ppd merged DEM (463 m) |
| Orbit | Night thermal IR | Mars Odyssey · THEMIS | USGS controlled night-IR mosaic (100 m) |
| Crater | Visible | MRO · CTX | Mars 2020 Science Investigation CTX orthomosaic, 5 m (JPL) |
| Crater | Elevation · slope · contours | MRO · CTX stereo | Mars 2020 Science Investigation CTX DEM, 20 m (JPL) |
| Crater + zone | Thermal-inertia proxy | Mars Odyssey · THEMIS | Night-IR mosaic, 100 m |
| Marswalk zone | Visible | MRO · HiRISE | Mars 2020 Terrain-Relative-Navigation orthomosaic, 25 cm (USGS) |
| Marswalk zone | Elevation · slope · route | MRO · HiRISE stereo | Mars 2020 TRN DTM, 1 m (USGS) |
| Phase 2 | Minerals | MRO · CRISM | not yet |
| Phase 2 | Live weather | Perseverance · MEDA | not yet |

All data comes from the public USGS Astrogeology archive (`s3://asc-pds-services`). To rebuild every texture and heightmap from the original files:

```bash
pip install rasterio numpy pillow scipy
npm run data                 # = python3 scripts/build_data.py  (global | region | crater | site)
```

The script streams only the parts it needs from cloud-optimised GeoTIFFs. The largest source is a 3.4 GB HiRISE mosaic; the script reads about 5 km² of it.

## The science behind the numbers

- **Mars clock.** The mission sol, local mean and true solar time at Jezero, and Ls (season) use the NASA GISS **Mars24** algorithm (Allison & McEwen 2000). It is checked against the Mars24 reference date and Perseverance's landing (sol 0).
- **Earth link delay.** The live one-way signal time uses JPL's approximate planetary positions. It gives 11 min 22 s on landing day, 18 Feb 2021, which matches NASA's figure.
- **Sun and shadows.** The terrain is lit by the real Sun position for Jezero's latitude and season. Use the time-of-day slider to watch shadows move. Shadows are ray-marched through the elevation model on the GPU.
- **Safest route.** The route comes from A* pathfinding on the HiRISE 1 m DTM (512 × 512 grid). The cost of each step is **metabolic energy**, so the route minimises oxygen use, not distance. Cells whose fine-scale slope exceeds the walking limit are avoided. The straight-line path is drawn as red dashes for comparison.
- **Watney check (EVA budget).** Walking cost uses the **Pandolf et al. (1977)** load-carriage equation, scaled to Mars gravity (0.38 g) with a pressure-suit penalty. Speed vs. grade uses a Tobler-style hiking function, and 1 L of O₂ ≈ 20.1 kJ. The planner totals oxygen used, remaining margin, EVA time vs. an 8 h suit rating, and daylight left, then gives a GO / CAUTION / NO-GO call. You can edit the assumptions (suit O₂, slope limit, time per stop) in the planner.

## Places

| Place | Position | Notes |
|---|---|---|
| Octavia E. Butler Landing | 18.4447°N 77.4508°E | Perseverance touchdown, 18 Feb 2021 |
| Three Forks Sample Depot | ≈ 18.4391°N 77.4494°E | From published witness-tube coordinates. The CTX DEM gives −2,570 m here; the published figure is −2,568 m |
| LZ-A (crew landing zone) | 18.4500°N 77.4850°E | **Our proposal.** Flat Máaz floor, ≥ 2 km plume stand-off from the depot |
| Séítah, delta front, Belva, Neretva / Pliva Vallis, rim | approx. | Placed by eye on the CTX/HiRISE mosaics |
| Acidalia Planitia "Ares III" | 31.2°N 28.5°W | Fiction: *The Martian* (Andy Weir) |

## Code map

```
index.html              HUD skeleton
src/main.js             app, transitions (orbit ⇄ crater ⇄ zone), input, render loop
src/orbit/              Mars globe: custom planet shader (layers, decals, relief, lock-on rings), atmosphere, moons, stars
src/terrain/            TerrainView (heightfield mesh, layer shader, GPU shadows, contours, holo mode, camera),
                        Planner (waypoints, A*, budget, EVA playback), pathfinding.js, eva.js
src/ui/                 HUD panels, legends, elevation profile, 3D-anchored labels
src/lib/marstime.js     Mars24 + Earth–Mars light time
src/core/               asset loader, scene crossfade, autopilot director
scripts/build_data.py   NASA/USGS → web data pipeline
public/data/            generated textures + heightmaps (+ manifest.json)
```

Built with [three.js](https://threejs.org) and [Vite](https://vitejs.dev). NASA data is not copyrighted; no NASA logos are used.
