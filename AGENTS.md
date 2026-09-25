# AGENTS.md: handoff for people and AI assistants

Read this first. It explains what Sol Atlas is, how the code fits together, how to run and test it, how it deploys, and what the team expects. [PROJECT_LOG.md](PROJECT_LOG.md) has the dated history (what changed, why, and how it was checked). [README.md](README.md) is the user-facing description.

---

## 1. What this is

**Sol Atlas**, by team **The SOL Explorers** for the **NASA Space Apps Challenge 2026**. Challenge: *Interplanetary Survival Guide: Martian Map*.

A browser app (three.js + Vite, no framework) where you:
1. spin a real-data Mars;
2. dive into Jezero Crater;
3. plan a walk on foot (a "Marswalk") in a 5 × 5 km zone of HiRISE data.

The planner finds the least-oxygen route and checks the suit's O₂ budget: point of no return, and where the O₂ runs out. It simulates the EVA. You can also walk the terrain in first person (the "helmet view"). The skyline there is computed from the elevation model, not painted.

- **Live:** https://sol-atlas.netlify.app (Netlify project `sol-atlas`, team `saracen66`)
- **Repo:** https://github.com/saracen66/the-sol-explorers
- **Working branch:** `claude/busy-heisenberg-8gasem`. Netlify currently publishes **this branch** as production, and every push redeploys in about a minute. `main` has not been set up as the production branch yet (see open items).
- The deliverable it supports is a **240-second pitch video**. The built-in autopilot (`C`) and recorder (`R`) exist for that.

## 2. How the team wants work done

- **Real data only.** Every layer is real mission data, credited in DATA SOURCES and the README. Anything not real is labelled: "proposed" (LZ-A), "approx. position", "typical · not live", "phase 2", "fiction" (Ares III). Don't add AI-generated imagery or invented numbers.
- **One problem, one commit, one push.** The owner asked for a push after each feature or fix, not one big batch.
- **Keep the record.** After each piece of work, add to PROJECT_LOG.md (timeline entry and commit table) and keep this file current.
- **Phones matter.** The judges and team open the link on phones. Test phone layouts (iPhone 14 emulation, portrait and landscape) as well as desktop.
- **Plain, honest wording** in the UI and docs. Say what was checked and how.

## 3. Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run preview    # serve dist/ on http://localhost:4173
```

URL options:
- `?q=low|medium|high` forces a quality level.
- `?autopilot` starts the scripted demo after loading.

In the browser console, `window.solAtlas` is the App instance: `solAtlas.planner`, `solAtlas.site`, `solAtlas.fpv`, `solAtlas.director`, and so on.

Rebuilding the NASA data (`npm run data`) needs Python with rasterio, NumPy, Pillow and SciPy, plus internet access to the USGS S3 bucket `asc-pds-services`. The processed files are already committed in `public/data/` (48 MB), so normal work never needs it.

## 4. Architecture

Three **views**, each its own three.js scene, with a crossfade between them:

| Mode | Class | Scene units | Data |
|---|---|---|---|
| `orbit` | `OrbitView` (`src/orbit/`) | planet radius = 1 | Viking colour, MOLA, THEMIS globes |
| `crater` | `TerrainView` id `crater` | **km** (89 × 101 km tile) | CTX 5 m image, 20 m DEM |
| `site` | `TerrainView` id `site` | **km** (5 × 5 km tile) | HiRISE 25 cm image, 1 m DTM |

`src/main.js` holds the `App`: the renderer, quality tier, resize and compact layout, transitions (`descendToJezero`, `enterSite`, `exitUp`, `goTo`), input (mouse, touch, pinch, keys) and the frame loop. Per frame it updates the active view and the planner, then projects the DOM labels.

| File | What it does |
|---|---|
| `src/core/quality.js` | Picks the high / medium / low tier, plus `Governor` (adaptive pixel ratio) |
| `src/core/assets.js` | Loads textures (ImageBitmap, flipped on decode), RG-packed height PNGs and `m20_traverse.json` |
| `src/core/Crossfade.js` | Dissolve between scenes; the speed-streak canvas |
| `src/core/Director.js` | Autopilot script. `stop()` restores everything it changed (`snapshot`/`restore`). Every app transition is awaited through `step()` so a stop takes effect at once |
| `src/terrain/TerrainView.js` | Heightfield mesh (vertex shader displaces with `uExag`), layers, baked shadows, POI labels, route lines (`Line2`), the Perseverance traverse, `pick()` ray-march, `markerLift`/`routeLift` (these differ in the helmet view) |
| `src/terrain/shaders.js` | Terrain, wall, floor, shadow-bake, sky and horizon-ring shaders. The helmet haze and ground grain sit behind `uFpv` |
| `src/terrain/Planner.js` | Stops, A* routes (`pathfinding.js`), EVA budget (`eva.js`), point of no return, **O₂-out point** (`buildEvents`/`findO2`), EVA simulation (`startSim`/`update`/`die`) |
| `src/terrain/eva.js` | Pandolf metabolic model → O₂; walking speed vs grade; the verdict |
| `src/terrain/Pin.js` | Drop-a-pin card: ROUTE HERE / ADD STOP / STAND HERE |
| `src/terrain/FirstPerson.js` | Helmet view: sky, CTX skyline ring, walking with O₂ burn, helmet HUD, ride-along, death sequence, phone landscape and joysticks |
| `src/ui/hud.js` | All DOM panels: planner, layers, legends, wrist display, sources modal, sound, REC and panel-hide buttons |
| `src/ui/labels.js` | DOM labels pinned to 3D points; priority declutter; hover-card edge flipping |
| `src/ui/profile.js` | SVG elevation profile (PNR line, O₂-out band, live EV1 cursor) |
| `src/ui/sound.js` | Web Audio synth (no audio files) |
| `src/ui/recorder.js` | Tab capture → webm download |
| `src/ui/Joystick.js` | Touch thumb-stick |
| `src/lib/marstime.js` | Mars24 clock, sun position, Earth–Mars light time |
| `src/data/places.js` | Landing sites, POIs, the default plan `['lz','oeb','depot','seitah']` |
| `scripts/build_data.py` | NASA/USGS rasters → `public/data/` |
| `scripts/smoke.cjs` | Playwright smoke test (see §6) |

### Gotchas that already caused bugs

- **Never rebuild a button's DOM every frame.** The helmet time-warp buttons were re-rendered by `innerHTML` about 15×/s, so mouse clicks never landed (a quick tap did). Build interactive elements once and update text only.
- **Each `.mk` label is its own stacking context** (`will-change: transform`). Anything that must sit above other labels (hover cards, the pin card) needs a z-index on the `.mk` itself.
- **Per-frame work stays allocation-free** where possible. Shadows are baked only when the sun or exaggeration changes. In the helmet view, `setTime` runs only every ~1 Mars minute because each call re-bakes.
- **Layout classes on `<body>`:**
  - `compact`: screens ≤ 900 px wide, or touch with height ≤ 500.
  - `landscape`: a compact screen held sideways.
  - `touch`: touch device.
  - `tier-low|medium|high`: quality level.
  - `cine`: autopilot running.
  - `fpv`: helmet view.
  - `sheet-open`: the phone bottom sheet is open.
  - `hide-left` / `hide-right`: desktop panels tucked away.
- **Textures decoded with ImageBitmap are already flipped** (`userData.flippedBitmap`); `loadSlopeData` accounts for it.
- **Heights** are 16-bit values packed in PNG red and green (`R*256+G`), mapped to `[meta.min, meta.max]` metres.
- **Helmet view units:** eye height is `0.0018` km; the camera near plane is `0.0004` km. The route line is lifted 0.6 m there, versus `sizeX*0.0012` on the map.
- A dead EVA simulation stays in `planner.sim` with `dead: true` (EV1 frozen in red) until `stopSim()` or `compute()`.

## 5. Controls (for testing)

| | |
|---|---|
| Orbit | drag spins · scroll zooms and locks onto Jezero · `1-3` layers · `G` grid · `Space` spin · `Enter` descend |
| Crater / zone | drag orbits · right-drag or Shift pans · scroll zooms · `1-7` layers (7 = Perseverance traverse) · `Esc` goes up |
| Zone | click drops a pin · `Space` runs the EVA sim · `F` helmet view |
| Helmet | drag or right stick looks · `WASD` or left stick walks · `Shift` runs · click or tap walks there · `[` `]` time warp · `Esc` / `F` exits |
| Anywhere | `C` autopilot (`Esc` or ■ stops it) · `R` record · `M` sound · `H` hide HUD · `K` captions |

## 6. Testing

No unit-test framework. Everything is checked in headless Chromium through Playwright, with software WebGL:

```bash
npm run build && npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node scripts/smoke.cjs          # desktop
DEVICE="iPhone 14" NODE_PATH=$(npm root -g) node scripts/smoke.cjs
```

- Chromium flags: `--use-angle=swiftshader --enable-unsafe-swiftshader`. SwiftShader is slow, so frames take hundreds of ms. Set `solAtlas.maxDt = 2.5` to speed transitions, and use `?q=low`.
- For screenshots, inject `*{transition:none!important}`. CSS transitions barely advance under software rendering, so panels look half-faded otherwise.
- Two-finger joystick or pinch tests use the CDP `Input.dispatchTouchEvent` with two touch points; Playwright's `tap` is one finger only.
- Headless Chrome can't capture a tab. REC was verified by stubbing `getDisplayMedia` with a canvas stream.

## 7. Deploy

`netlify.toml` builds with `npm run build` and publishes `dist/`, with cache headers for `/data/*` and `/assets/*`. Netlify builds every push to the working branch. The Netlify MCP / API can report deploy state. The build sandbox used so far could not open `*.netlify.app`, so the live site was only confirmed through the Netlify API, not in a browser.

## 8. Current state and open items

Working and pushed:
- orbit → crater → zone;
- layers, including the real Perseverance traverse;
- A* planner with O₂ budget, PNR and O₂-out point;
- EVA simulation with death and mayday light-time;
- drop-a-pin routing;
- helmet view (desktop, and phones with joysticks and landscape);
- synthesised sound, REC, autopilot;
- collapsible panels, phone and tablet layouts.

Open (see PROJECT_LOG for the full list):
- Test on the team's real phones and GPUs, especially the helmet view.
- Open a PR into `main` and switch Netlify production to `main`.
- Record the pitch video (REC + autopilot).
- Team names and a licence in the README.
- Phase 2 ideas: CRISM minerals, live MEDA weather, more sites, dust-storm alerts, offline mode.

Rejected ideas and why:
- Sayma's images: AI-generated, some mislabelled as HiRISE.
- A Gemini dependency: the demo must run offline with no API key.
- A CAPCOM voice from `speechSynthesis`: voice quality varies too much between devices for a judged video.
