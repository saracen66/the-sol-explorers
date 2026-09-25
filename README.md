# Sol Atlas

**A layered, game-style Marswalk planner built on real NASA Mars data.**

The SOL Explorers · NASA Space Apps Challenge 2026 · challenge: *Interplanetary Survival Guide: Martian Map*

**Live demo:** https://sol-atlas.netlify.app · **Project log:** [PROJECT_LOG.md](PROJECT_LOG.md) · **Handoff for developers and AI assistants:** [AGENTS.md](AGENTS.md)

![Sol Atlas: Mars from orbit with landing sites and data layers](docs/screenshots/01-orbit.jpg)

In *The Martian*, Mark Watney survives by doing the maths himself: oxygen, distance, daylight, terrain. Sol Atlas does that maths for the first crews. It stacks data from five NASA missions on one 3D map, finds the safest route for a walk on foot to any point you pick, and checks whether the astronaut gets home with oxygen to spare. If the plan comes up short, the EVA simulation shows exactly where the suit runs dry. Then you can put on the helmet and walk the real terrain at eye height.

![Helmet view: the delta-front scarp in Jezero at true scale, from the HiRISE 1 m elevation model](docs/screenshots/08-helmet-view.jpg)

This is the **phase-1 prototype** made for the 240-second local-judging video. Jezero Crater is the only site unlocked; the other landing sites are marked "phase 2".

---

## Contents

- [How it works](#how-it-works)
- [What's new in the polish build](#whats-new-in-the-polish-build)
- [Data layers](#data-layers)
- [The science behind the numbers](#the-science-behind-the-numbers)
- [Places on the map](#places-on-the-map)
- [Controls](#controls)
- [Phones, tablets and performance](#phones-tablets-and-performance)
- [Recording the pitch video](#recording-the-pitch-video)
- [Run it locally](#run-it-locally)
- [Rebuild the NASA data](#rebuild-the-nasa-data)
- [Deploy](#deploy)
- [Project structure](#project-structure)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Credits](#credits)

---

## How it works

Sol Atlas has three levels. You move between them by scrolling, like zooming from a system map down to a planet surface in a space game.

### 1. Orbit

A rotating Mars with real Viking colour, MOLA relief, a thin dusty atmosphere, Phobos and Deimos. Ten landing sites are marked. Scroll in and the camera locks onto Jezero; scroll again, or click, to descend. A live mission clock shows the Perseverance sol, local time at Jezero, the Martian season and the current Earth–Mars signal delay.

### 2. Jezero Crater

The whole crater (89 × 101 km) as a 3D block, built from the orbital imagery and elevation model NASA prepared for Perseverance. The terrain is lit by the real Sun position, with shadows that move as you drag the time-of-day slider.

| Crater | Elevation + contours |
|---|---|
| ![Jezero crater in 3D](docs/screenshots/02-crater.jpg) | ![Elevation layer with contours](docs/screenshots/03-crater-elevation.jpg) |

The gold line is **Perseverance's real drive path**: 400 end-of-drive positions from NASA/JPL's mission waypoint feed, sol 0 to 1524 (34.96 km). It runs from the landing site, around Séítah, across the delta and up the crater rim. Layer `7` toggles it.

![Perseverance's real traverse across Jezero, with sol markers](docs/screenshots/13-perseverance-traverse.jpg)

### 3. Marswalk zone

A 5 × 5 km zone around Perseverance's landing site and the Three Forks sample depot, at 25 cm per pixel on a 1 m elevation model. This is where you plan the walk:

- **Route anywhere, like a maps app.** Click or tap any spot to drop a pin. The card shows its coordinates, elevation, slope class and distance from the airlock. **ROUTE HERE** plans the walk there and back; **ADD STOP** adds it to the plan; **STAND HERE** puts you there in the helmet view.
- **Safest route.** Sol Atlas finds the path that uses the least oxygen while avoiding slopes too steep to walk. A red dashed line shows the straight-line path for comparison.
- **The Watney check.** Distance, EVA time, oxygen used, oxygen left at the airlock, and daylight left, ending in **MARSWALK READY**, GO WITH CAUTION or NO-GO.
- **Point of no return.** If the suit can't carry enough oxygen, a red marker shows the last point where turning back still keeps the reserve.
- **EVA flyover.** Simulate the walk with a chase camera and a wrist display (next stop, oxygen left, dust). The wrist turns amber past the point of no return and red when the reserve is reached. The profile chart follows EV1 as it walks.
- **Where the oxygen runs out.** If the plan needs more O₂ than the suit holds, the planner marks the exact spot and time the tank runs dry, and draws the unreachable rest of the route as red dashes. In the simulation, EV1 stops there and its marker turns red. The wrist display then shows how long a mayday takes to reach Earth (about 14 minutes now) and when the earliest reply could arrive. Nobody on Earth can help in time, so the plan has to be right before the airlock opens.

| Planned route | Point of no return |
|---|---|
| ![Planned route through the landing site, Three Forks and Séítah](docs/screenshots/04-marswalk-route.jpg) | ![Red point-of-no-return marker with a 0.25 kg suit](docs/screenshots/05-point-of-no-return.jpg) |

| EVA flyover | Slope hazard |
|---|---|
| ![Wrist display during the EVA flyover](docs/screenshots/06-eva-wrist-display.jpg) | ![Slope-hazard layer](docs/screenshots/07-slope-hazard.jpg) |

| Drop a pin, route there | O₂ runs out: EV1 lost |
|---|---|
| ![Dropped-pin card with ROUTE HERE](docs/screenshots/12-drop-pin.jpg) | ![EV1 frozen in red where the suit ran out of oxygen, with the mayday light-time](docs/screenshots/11-o2-exhausted-map.jpg) |

### 4. Helmet view

Press **`F`**, **◉ HELMET VIEW**, or **STAND HERE** on a pin to stand on the terrain at 1.8 m eye height, with no vertical exaggeration.

- **Real horizon.** The skyline isn't painted. For every compass bearing, Sol Atlas marches the CTX crater elevation model outward (allowing for the curve of Mars) and keeps the highest angle. The crater rim and the delta sit exactly where they would for someone standing there.
- **Mars sky.** A dusty butterscotch sky with the Sun at its real position for the chosen local time. Around the Sun there is the blue glow Perseverance photographs at sunset, and distant ground fades into haze.
- **The suit is on the clock.** Walking speed follows the slope, and the suit burns O₂ by the same Pandolf metabolic model the planner uses, under a time warp shown on screen. The helmet HUD shows O₂ left, metabolic power, O₂ burn rate, position, slope underfoot and distance to the airlock, plus a compass with bearings to your stops.
- **Overlays still work.** Switch on slope hazard or contours and they paint onto the ground in front of you.
- **Ride along.** Start the EVA simulation in the helmet and you walk the route as EV1. If the plan runs out of oxygen, the view collapses where it happens.

| Slope hazard as a helmet overlay | O₂ exhausted, in the helmet |
|---|---|
| ![Slope-hazard layer seen from eye level](docs/screenshots/09-helmet-slope-overlay.jpg) | ![Helmet view after the suit runs out of oxygen](docs/screenshots/10-helmet-o2-exhausted.jpg) |

---

## What's new in the polish build

| Feature | Why it matters |
|---|---|
| **O₂-exhaustion point** on the route, in the profile and in the simulation | You see *where* a bad plan kills the astronaut, not just that it's NO-GO |
| **Mayday light-time** at the moment O₂ runs out | Shows why Mars crews must plan for themselves: Earth hears the call ~14 min later |
| **Drop a pin, route anywhere** | Plan to any point in the zone, not only named places |
| **Helmet view** with the real skyline | The only first-person view we know of that's built on the actual DTM and horizon |
| **Perseverance's real traverse** | More real mission data: 400 drive fixes over 1,524 sols |
| **Synthesised sound** (♪ / `M`) | Wind, lock-on, alarms, suit breathing. All generated in the browser, no audio files |
| **● REC** (`R`) | Records the tab (HUD and sound included) to a video file for the pitch |

Sound and REC came from ideas in teammate Sayma's prototype. Her images and several coordinates weren't reusable (AI-generated pictures, approximate positions), so only the ideas were carried over.

---

## Data layers

Every layer is real mission data. Nothing is hand-painted.

| Level | Layer | Mission / instrument | Product |
|---|---|---|---|
| Orbit | Visible colour | Viking Orbiters | MDIM 2.1 global mosaic, NASA Ames colour (232 m/px) |
| Orbit | Topography, relief | Mars Global Surveyor · MOLA | MOLA 128/64 ppd merged DEM (463 m/px) |
| Orbit | Night thermal IR | Mars Odyssey · THEMIS | USGS controlled night-IR mosaic (100 m/px) |
| Crater | Visible | MRO · CTX | Mars 2020 Science Investigation CTX orthomosaic, 5 m/px (JPL) |
| Crater | Elevation, slope, contours | MRO · CTX stereo | Mars 2020 Science Investigation CTX DEM, 20 m/px (JPL) |
| Crater + zone | Ground firmness | Mars Odyssey · THEMIS | Night-IR mosaic as a thermal-inertia proxy, 100 m/px |
| Marswalk zone | Visible | MRO · HiRISE | Mars 2020 Terrain-Relative-Navigation orthomosaic, 25 cm/px (USGS) |
| Marswalk zone | Elevation, slope, route | MRO · HiRISE stereo | Mars 2020 TRN DTM, 1 m/px (USGS) |
| Crater + zone | Perseverance traverse | Mars 2020 · rover localisation | NASA/JPL MMGIS "Where is Perseverance?" end-of-drive waypoints, sol 0–1524, archived by [stiles/mars-perseverance-waypoints](https://github.com/stiles/mars-perseverance-waypoints) |
| Helmet view | Skyline | MRO · CTX stereo | Computed from the 20 m crater DEM: highest angle per bearing, Mars curvature included |
| Phase 2 | Minerals | MRO · CRISM | not yet: shown as locked |
| Phase 2 | Live weather | Perseverance · MEDA | not yet: the conditions panel shows typical values, labelled "not live" |

"Ground firmness" works like this: rock and coarse grains stay warm through the night, while dust and fine sand cool fast. So night-time infrared brightness tells firm ground from loose ground.

---

## The science behind the numbers

| Feature | How it's calculated | Checked against |
|---|---|---|
| Mars clock | NASA GISS **Mars24** algorithm (Allison & McEwen 2000) | Mars24 reference date; Perseverance landing = sol 0 |
| Earth–Mars signal delay | JPL approximate planetary positions (Keplerian elements, 1800–2050) | 11 min 22 s on landing day, 18 Feb 2021, matching NASA's figure |
| Sun and shadows | Solar declination and hour angle for Jezero; shadows ray-marched through the elevation model on the GPU | Sunrise and sunset shown in the HUD |
| Safest route | A* search on a 512 × 512 grid from the HiRISE DTM. Step cost is **metabolic energy**, so the route minimises oxygen; cells steeper than the walking limit are avoided | Default loop solves in under 40 ms |
| Walking cost | **Pandolf et al. (1977)** load-carriage equation, scaled to Mars gravity (0.38 g) with a pressure-suit penalty; Tobler-style speed vs. grade; 1 L O₂ ≈ 20.1 kJ | Flat walking at 0.9 m/s ≈ 293 W ≈ 0.075 kg O₂ per hour, the same rate our 0.60 kg / 8 h suit assumption is sized on |
| Point of no return | First point on the way out where O₂ used so far + O₂ to walk straight back (plus a 25 % detour allowance) would eat into the reserve | 0.30 kg suit → PNR at Séítah; 0.25 kg → mid-route at 2.98 km |
| O₂ runs out | The EVA's walk/stop timeline carries cumulative O₂; the first moment it reaches the tank size gives the time and place | 0.20 kg suit on the default loop: O₂ out at 5.83 km, 2 h 50 min in, 1.21 km from the airlock |
| Mayday delay | One-way and round-trip light time from the same Earth–Mars model as the header clock | ~14 min one way on 25 Sep 2026 |
| Helmet skyline | For each of 360 bearings, march the CTX DEM from 2.6 to 46 km and keep the highest elevation angle, after subtracting the curvature drop d²/2R | Highest skyline 4.5° toward bearing 263° (the western rim and delta) |
| Elevations | Heights decoded from the DEMs | Three Forks: −2,570 m vs published −2,568 m |

Default EVA assumptions, all editable in the planner: 75 kg astronaut, 58 kg suit and backpack, 0.60 kg usable O₂ (about 8 h), 25 % reserve, 20° walking-slope limit, 20 min per science stop.

The default plan (LZ-A → Octavia E. Butler Landing → Three Forks → Séítah → LZ-A) comes out at **7.1 km, 3 h 13 min, 0.23 kg of O₂, 62 % margin: MARSWALK READY**.

---

## Places on the map

| Place | Position | Notes |
|---|---|---|
| Octavia E. Butler Landing | 18.4447°N 77.4508°E | Perseverance touchdown, 18 Feb 2021 |
| Three Forks Sample Depot | ≈ 18.4391°N 77.4494°E | 10 sample tubes laid Dec 2022 – Jan 2023. Position from published witness-tube coordinates |
| LZ-A, crew landing zone | 18.4500°N 77.4850°E | **Our proposal**, not a NASA site: flat lava floor, ≥ 2 km from the depot so engine blast can't reach it |
| Séítah, delta front, Belva crater, Neretva Vallis, Pliva Vallis, crater rim | approx. | Placed by eye on the CTX and HiRISE mosaics |
| Acidalia Planitia "Ares III" | 31.2°N 28.5°W | Fiction: Mark Watney's base in *The Martian* (Andy Weir) |

---

## Controls

| | Orbit | Crater / Marswalk zone |
|---|---|---|
| Drag | spin the planet | orbit the camera |
| Right-drag or Shift-drag | | pan |
| Scroll | zoom; locks onto Jezero when close | zoom toward the cursor. Keep scrolling out to go up a level |
| Click | Jezero, or the lock-on, to descend | the Marswalk zone to enter it. In the zone, click anywhere to **drop a pin** (ROUTE HERE / ADD STOP / STAND HERE), or click a named place to add it as a stop |
| Keys | `1`–`3` layers · `G` grid · `Space` rotation · `Enter` descend | `1`–`7` layers · `WASD` pan · `Enter` enter zone · `Esc` go up · `Space` run the EVA simulation · `F` helmet view |
| Anywhere | `C` autopilot · `H` hide HUD · `K` captions on/off · `M` sound · `R` record | |

**Helmet view:** drag to look · `WASD` / arrows to walk (`Shift` = faster) · `Q`/`E` turn · click or tap a spot to walk there · scroll or pinch to zoom · `[` `]` or the − / + buttons change the time warp · `Esc` or `F` to leave.

**Helmet view on phones:** turn the phone sideways (on Android it goes fullscreen and locks to landscape). The **left stick walks**: a light push is a slow walk, full push jogs. The **right stick looks around**. You can still tap a spot to walk there.
| Touch | drag to spin · pinch to zoom · tap Jezero to descend | drag to orbit · pinch to zoom · two-finger drag to pan · tap to select |

On desktop, each side panel has a small **‹ / ›** tab on its inner edge that tucks it away; the tab stays at the screen edge to bring it back, and the choice is remembered.

On phones and upright tablets, the side panels open as a sheet from the tabs at the bottom of the screen (**JEZERO / CRATER / PLANNER** and **LAYERS**). Tap the map to close the sheet.

---

## Phones, tablets and performance

Sol Atlas picks a quality level for each device when it loads. You can force one by adding it to the URL:

| Level | Chosen for | What changes | Force it with |
|---|---|---|---|
| High | desktops and laptops | 8k globe, full-resolution terrain, up to 2× sharpness | `?q=high` |
| Medium | tablets, 4-core or low-memory laptops | 4k globe, full terrain, up to 1.5× sharpness | `?q=medium` |
| Low | phones | half-resolution textures (about 11 MB download instead of 40 MB), terrain meshes with 4× fewer points, 30 fps cap, no screen overlays | `?q=low` |

On every level:
- **Adaptive resolution** lowers the render resolution when frames get slow and raises it again when there's headroom.
- **Shadows** are baked into a texture only when the sun or the relief changes, instead of being re-calculated for every pixel on every frame.
- Everything is decoded, compiled and uploaded behind the loading screen, so the zoom transitions never stall on first use.

---

## Recording the pitch video

Press **`C`** (or **▶ AUTOPILOT**) for a scripted fly-through of about two minutes, with captions. It follows the WHAT and SO WHAT sections of our pitch script:

1. Orbit, then the MOLA and THEMIS layers.
2. Lock onto Jezero and descend.
3. Crater: elevation and contours, ground firmness, slope hazard.
4. Marswalk zone: the safest route.
5. Perseverance's real drive path across the crater.
6. "What if the suit carried only 0.20 kg of O₂?" The point of no return appears and the call is NO-GO. "And if they walk anyway?" EV1 stops in red where the O₂ runs out, and the mayday light-time appears.
7. EVA flyover with the wrist display, then a few seconds riding along in the helmet view.
8. Pick Three Forks: the route draws and **MARSWALK READY** shows.
9. Holo-mode end card.

Tips:
- Press `K` to hide the captions if you're recording your own voiceover, and `H` to hide the HUD for clean B-roll.
- **■ STOP AUTOPILOT** (dimmed during the run), `Esc`, or any click or scroll on the map hands control back to you. Stopping puts back whatever the autopilot changed (O₂ setting, layers, plan).
- **Built-in recorder:** press **● REC** (or `R`), choose *this tab* and allow audio, then press `C`. The controls hide during the autopilot, so the take is clean. Press `R` again (or the browser's *Stop sharing*) and a `.webm` downloads. Desktop Chrome or Edge works best.
- Or record at 1920 × 1080 with OBS, or with the Xbox Game Bar (`Win + Alt + R`).

---

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer and a desktop browser with a graphics card (Chrome, Edge or Firefox).

```bash
git clone https://github.com/saracen66/the-sol-explorers
cd the-sol-explorers
npm install
npm run dev          # opens http://localhost:5173
```

The processed NASA data is already in the repo (`public/data/`, about 40 MB), so you don't need Python to run the app.

Quality is picked automatically; see [Phones, tablets and performance](#phones-tablets-and-performance) to force a level.

Production build:

```bash
npm run build        # static site in dist/
npm run preview      # serve dist/ at http://localhost:4173
```

---

## Rebuild the NASA data

`scripts/build_data.py` downloads the source data from the public USGS Astrogeology archive (`asc-pds-services` on AWS S3) and bakes the textures and heightmaps in `public/data/`. It streams only the parts it needs. For example, the largest source is a 3.4 GB HiRISE mosaic, and the script reads just the 5 × 5 km zone.

```bash
pip install rasterio numpy pillow scipy
npm run data                           # everything (a few minutes)
python3 scripts/build_data.py crater   # or one stage: global | region | crater | site | lite
```

Downloads are cached in `.cache/`, which is git-ignored. The `lite` stage writes the half-resolution phone textures to `public/data/lite/` and a 4k globe map for medium-quality devices. Heightmaps are stored as PNG images: each 16-bit height is split across the red and green channels (height = R × 256 + G), so any static web host can serve them without loss.

---

## Deploy

The site is set up for Netlify with [`netlify.toml`](netlify.toml): it builds with `npm run build` and publishes `dist/`.

**Netlify site:** `sol-atlas` → https://sol-atlas.netlify.app

To publish from GitHub, with automatic redeploys on every push:

1. Open https://app.netlify.com/projects/sol-atlas.
2. Go to **Project configuration → Build & deploy → Continuous deployment → Link repository**.
3. Choose GitHub → `saracen66/the-sol-explorers`.
4. Pick the branch to publish (`main` once the work is merged). Build settings are read from `netlify.toml`.

To deploy by hand from your own computer:

```bash
npm install -g netlify-cli
netlify login
netlify link --id 3cde891d-2654-4f7a-b31d-30e5ad235ca8
netlify deploy --build --prod
```

`dist/` also works on GitHub Pages or any other static host, because all paths are relative.

---

## Project structure

```
index.html              HUD skeleton (panels, loader, overlays)
netlify.toml            Netlify build + cache headers
vite.config.js          Vite config (relative base path)
src/
  main.js               app: level transitions (orbit ⇄ crater ⇄ zone), input, render loop
  styles.css            HUD styling
  orbit/                Mars globe: planet shader (layers, zoom-in detail, relief, lock-on rings),
                        atmosphere, moons, stars
  terrain/              TerrainView: 3D terrain, layer shader, GPU shadows, contours, holo mode, traverse, camera
                        Planner: stops, A* routes, EVA budget, point of no return, O₂-out point, EVA flyover
                        FirstPerson: helmet view (sky, real skyline, walking, suit HUD, ride-along)
                        Pin: drop a pin, route here / add stop / stand here
                        pathfinding.js (A*), eva.js (metabolic + O₂ model)
  ui/                   HUD panels and legends, elevation-profile chart, labels pinned to 3D points,
                        sound.js (Web Audio synth), recorder.js (tab → video)
  lib/                  marstime.js (Mars24, signal delay, sun position), geo.js
  core/                 asset loader, quality levels + adaptive resolution, scene crossfade, autopilot
  data/places.js        landing sites, points of interest, default Marswalk plan
scripts/build_data.py   NASA/USGS → web data pipeline
public/data/            processed textures + heightmaps + manifest.json (lite/ = phone versions),
                        m20_traverse.json (Perseverance end-of-drive waypoints, sol 0–1524)
docs/screenshots/       images used in this README
PROJECT_LOG.md          full record of how the project was built
AGENTS.md / CLAUDE.md   handoff: architecture, conventions, testing, deploy, open items
scripts/smoke.cjs       Playwright smoke test (desktop or DEVICE="iPhone 14")
```

---

## Limitations and roadmap

**Known limitations in phase 1**
- Only Jezero is unlocked.
- The CRISM mineral layer and live MEDA weather aren't in yet.
- Some place positions are approximate (see [Places](#places-on-the-map)).
- The EVA model is a planning estimate, not flight-certified. Its assumptions are listed in the planner.
- The helmet view's close-up pebbles and grain are procedural. HiRISE resolves 25 cm, so anything smaller is decoration, and the terrain mesh is sampled every ~5 m.
- The traverse data ends at sol 1524 (June 2025), when the public archive stopped updating.

**Next**
- More sites, including ice-rich plains from NASA's SWIM ice-mapping project.
- CRISM minerals.
- Live MEDA weather.
- Dust-storm alerts from orbit.
- An offline mode for suits and rovers.

---

## Credits

**Team:** The SOL Explorers, NASA Space Apps Challenge 2026.

**Data:**
- NASA / JPL-Caltech / University of Arizona (HiRISE)
- NASA / JPL-Caltech / MSSS (CTX)
- NASA / JPL-Caltech / Arizona State University (THEMIS)
- NASA / GSFC (MOLA)
- NASA / USGS (Viking MDIM 2.1, NASA Ames colour)
- USGS Astrogeology Science Center (mosaics and DTMs)
- Mars 2020 science maps: Mangold et al. (2021), *Science*
- Perseverance waypoints: NASA/JPL-Caltech MMGIS, archived daily in [stiles/mars-perseverance-waypoints](https://github.com/stiles/mars-perseverance-waypoints)

**Ideas:** synthesised sound design and in-app recording were inspired by Sayma's prototype for the team.

NASA imagery is not copyrighted. No NASA logos are used.

**Built with:** [three.js](https://threejs.org), [Vite](https://vitejs.dev) and Python ([rasterio](https://rasterio.readthedocs.io), NumPy, Pillow, SciPy). Fonts: Rajdhani, Orbitron, JetBrains Mono.
