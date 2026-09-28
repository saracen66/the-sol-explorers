# Data used in Sol Atlas: for the Space Apps submission form

The project submission form has two data fields: **NASA Data**, and **Space Agency Partner & Other Data**. Every outside resource (data, code, text, images) must be listed. The two blocks below are ready to paste. Tables with more detail follow.

All NASA map files were read directly from the USGS Astrogeology Science Center's public cloud archive (`asc-pds-services`, on AWS). USGS processes and archives NASA's planetary maps. Every link below was checked and answered on 28 Sep 2026.

> **When the full challenge statement comes out (28 October 2026)**, compare this list with the datasets NASA names for the challenge, and reuse NASA's exact dataset names in the form and the video.

---

## Paste into "NASA Data"

```
- Viking Orbiter 1 & 2: Mars MDIM 2.1 global colour mosaic, recoloured by NASA Ames (232 m/px). Orbit view colour.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif
- Mars Global Surveyor, MOLA: 128/64 pixels-per-degree merged global elevation model (~463 m). Orbit view relief and elevation colours.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/MOLA/mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif
- Mars Odyssey, THEMIS: night-time infrared controlled mosaic, 100 m, v2 (2018). Night thermal layer and "ground firmness" layer.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif
- Mars Reconnaissance Orbiter, CTX: Mars 2020 Science Investigation orthomosaic of Jezero Crater, 5 m (NASA/JPL). Crater view imagery.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif
- Mars Reconnaissance Orbiter, CTX stereo: Mars 2020 Science Investigation elevation model of Jezero, 20 m (NASA/JPL). Crater 3D terrain, slope, contours.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif
- Mars Reconnaissance Orbiter, HiRISE: Mars 2020 Terrain-Relative-Navigation orthomosaic of the landing site, 25 cm. Marswalk zone imagery.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif
- Mars Reconnaissance Orbiter, HiRISE stereo: Mars 2020 Terrain-Relative-Navigation elevation model, 1 m. Marswalk zone 3D terrain, slope, route finding, elevation profile.
  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif
- Mars 2020 Perseverance: rover end-of-drive positions from NASA/JPL's "Where is Perseverance?" map (MMGIS waypoint feed), sol 0 to 1524. Perseverance traverse layer.
  https://mars.nasa.gov/maps/location/?mission=M20
- Mars 2020 Perseverance: landing site (Octavia E. Butler Landing, 18 Feb 2021) and Three Forks sample depot positions (NASA/JPL-Caltech).
- NASA GISS Mars24 sunclock algorithm (Allison & McEwen 2000): Mars time, sols, local solar time, Sun position.
  https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
- NASA JPL Solar System Dynamics, "Approximate Positions of the Planets" (Standish): Earth–Mars distance and signal delay.
  https://ssd.jpl.nasa.gov/planets/approx_pos.html
- Published NASA mission results used as typical values (labelled "not live" in the app): Perseverance MEDA weather ranges; Curiosity RAD surface radiation dose (Hassler et al. 2014, Science).
```

## Paste into "Space Agency Partner & Other Data"

```
- No data from other space agencies is used yet.
- USGS Astrogeology Science Center: hosting and processing of the NASA maps above (public "asc-pds-services" archive on AWS).
- stiles/mars-perseverance-waypoints (GitHub): a daily archive of NASA/JPL's Perseverance waypoint feed, used because the NASA site could not be reached from our build machine. The positions are NASA's, unchanged.
  https://github.com/stiles/mars-perseverance-waypoints
- Scientific references: Pandolf, Givoni & Goldman (1977), load-carriage metabolic equation, used for the EVA oxygen model; Tobler's hiking function (walking speed vs slope); Mangold et al. (2021), Science, Jezero delta geology.
- Software: three.js (MIT licence), Vite (MIT). Python: rasterio, NumPy, Pillow, SciPy. Fonts: Rajdhani, Orbitron, JetBrains Mono (SIL Open Font Licence, via Fontsource).
- AI tools: Claude Code (Anthropic) wrote the code and documentation under the team's direction. See AI_DISCLOSURE.md.
- Our own assumptions (labelled in the app): proposed crew landing zone LZ-A, suit oxygen capacity 0.60 kg with a 25 % reserve, 20° walking-slope limit, approximate positions of some named places.
```

---

## Detail: what each dataset does in the app

| App feature | NASA data | Processing (in `scripts/build_data.py`) |
|---|---|---|
| Globe colour | Viking MDIM 2.1 (NASA Ames colour) | Resampled to 2k / 4k / 8k by device |
| Globe relief, elevation colours | MGS MOLA 128/64 ppd DEM | Normal map (relief ×18), blue elevation ramp, 1024 × 512 elevation grid for readouts |
| Night thermal / ground firmness | Mars Odyssey THEMIS night IR 100 m | Clipped to ±54° (streaky edges), gentle contrast curve, orange ramp |
| Crater imagery | MRO CTX 5 m orthomosaic (JPL) | 4096 × 4658 px (~22 m/px), tinted with the Viking colour of the same ground |
| Crater terrain, slope, contours | MRO CTX 20 m DEM (JPL) | 1024 × 1164 height grid; slope from the full 20 m DEM |
| Marswalk zone imagery | MRO HiRISE 25 cm TRN orthomosaic | 5 × 5 km cut, 4096² px (~1.2 m/px), seams flattened, tinted |
| Marswalk zone terrain, slope, routes, profile | MRO HiRISE 1 m TRN DTM | 1024² height grid; slope at 2.4 m; A* route grid 512² |
| Perseverance traverse | Mars 2020 end-of-drive waypoints (NASA/JPL MMGIS) | 400 points, sol 0–1524, stored in `public/data/m20_traverse.json` |

## Newer data we know about (not used yet)

- **Perseverance positions after sol 1524:** NASA's live feed has them. Our archive copy stopped in June 2025. Refresh from `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json` when the build machine can reach mars.nasa.gov.
- **Minerals:** the MRO CRISM archive (NASA PDS) would fill the locked "Minerals" layer.
- **Weather:** Perseverance MEDA data is published on NASA's PDS Atmospheres Node, months after collection. There is no live public feed, so the app shows typical values labelled "not live".
