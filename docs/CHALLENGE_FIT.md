# How Sol Atlas answers the 2026 challenge

Challenge: **Interplanetary Survival Guide: Martian Map** (Intermediate · Human Exploration, Mars, Planets & Moons, Software, Space Exploration). Read from the official challenge page on 31 Oct 2026 (screenshots from the owner). The Resources tab opens on 13 Nov 2026.

**The ask, in NASA's words:** "create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful Marswalk while conducting new and exciting science along the way." The background adds that tools like JPL's Mars Trek "are built for regional and global views rather than the hyperlocalized areas astronauts will target on individual spacewalks."

That last line is our pitch: Sol Atlas goes from the whole planet down to a 5 × 5 km walk zone at 25 cm per pixel, which is exactly the "hyperlocalized" view NASA says is missing.

## Objectives

| What the statement asks | Sol Atlas today | Gap, and what we could add |
|---|---|---|
| A map, tool or interface an astronaut could use on a surface mission, built on NASA data and tools | Yes: 3D map from orbit to the walk zone, route planner, EVA check | None |
| Start from science goals, then pick a location that serves them | Partly. Each stop has a one-line science reason (Three Forks tubes, Séítah olivine, delta sediments), but the mission isn't framed around an explicit goal | **Mission-goal picker**: choose a goal (pick up the sample tubes, study Séítah's olivine, log delta sediments for biosignatures) and the plan, stops and reasons follow from it |
| A location a rover has studied well, or a less-studied one | Yes: Jezero, Perseverance's site, with its real drive path | None. "More sites" stays phase 2 |
| At least three kinds of data: optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, chemical | Optical (Viking, CTX, HiRISE), thermal (THEMIS), topographic (MOLA, HRSC, CTX DEM, HiRISE DTM): three kinds, layered. Atmosphere and radiation appear only as typical values | **Spectral layer (CRISM minerals)**, which also ties into the science goals. Needs a PDS host allowed in the network settings |
| Safety first: radiation and space weather | Typical radiation dose (Curiosity RAD) in the conditions panel only | **EVA radiation dose** in the go/no-go check, and **shelter time**: the longest it would take to get back to the airlock from any point of the route if a solar storm warning came in. Both use the existing route timeline |
| Spacesuit mobility, and carrying science equipment | The walking model includes the suit's mass and a suit penalty; the load can't be changed in the app | **Science-kit mass slider** (drill, sample bags) feeding the same walking model, so heavier kit shows up as more O₂ and a shorter range |
| A route map that reaches the science targets while avoiding big obstacles such as large rock formations | Yes: the least-O₂ route avoids slopes over the limit; the delta scarp is routed around | Boulders smaller than the ~5 m route grid aren't modelled. **Rock hazard from the 1 m HiRISE DTM** (surface roughness) could add a cost to rough ground |

## Potential considerations

| Consideration | Sol Atlas today | Idea |
|---|---|---|
| A display in the habitat, a tablet the crew carries, or a HUD on the helmet visor | All three: desktop layout, phone and tablet layout, and the helmet view with its suit HUD | Say this in the pitch: one tool, three of NASA's suggested forms |
| A static map, an interactive product, or a generator for other places and data | Interactive; Jezero only | More sites stay phase 2 |
| Inspiration from maps made for other worlds | Not mentioned | In the pitch: Apollo 14–17 traverse maps and the Apollo **walkback constraint** |
| Past, predicted or no specific time frame | Live Mars clock, real Sun and shadows with a time slider; Perseverance's past drive path | None |
| Point-of-view images from Mars surface missions, so the astronaut knows what to expect | The helmet view, computed from the real elevation model; no real rover photos | **Real Perseverance photos pinned at the stops** (Navcam / Mastcam-Z, public domain). Needs `mars.nasa.gov` allowed in the network settings |
| Rovers carrying crew and tools, or astronauts working in pairs | One astronaut on foot (EV1) | **Rover legs with a walkback limit**: the rover can only drive as far as the crew could walk home if it broke down, as on Apollo 15–17. **Two-person EVA**: EV1 and EV2, where the plan must work for both suits |

## What would make us stand out

Over a thousand teams picked this challenge, so most will show a layered map and a route. Ranked by how much each adds against how long it takes:

1. **Rover + walkback limit.** Real NASA practice from Apollo, it answers the rover consideration, and it fits our survival story (point of no return, O₂-out point). Few teams will think of it.
2. **Real Perseverance photos at the stops.** The strongest visual for the video, and a direct answer to the point-of-view consideration. Needs `mars.nasa.gov`.
3. **Mission-goal picker.** Small change; answers the first objective head-on.
4. **Safety numbers: science-kit mass, EVA radiation dose, shelter time.** Small changes, all in the go/no-go check NASA's "safety first" line asks for.
5. **CRISM spectral layer.** Fills the one data kind the statement lists first that we lack. Needs a PDS host.
6. **Rock hazard from the 1 m DTM.** Better routes, but less visible in a 30-second video.
