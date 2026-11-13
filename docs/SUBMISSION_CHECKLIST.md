# Submission checklist: Space Apps 2026, Bangladesh

Checked on 29 Oct 2026 against the **Bangladesh Participants Guide** (Local Leads, 2026) and the score sheet in it. Global judges see **only our NASA project page**, so this file is mostly about that page and the videos. Tick items as the team does them.

## Deadlines (Bangladesh time, BST = UTC+6)

| When | What | Where |
|---|---|---|
| Fri 13 Nov, 07:00 | Day 1 starts. Register on the NASA site at the 08:30 mentor slot if not done | spaceappschallenge.org |
| **Fri 13 Nov, 18:30** | **Video 2**: 240-second local-judging video, with the demo and the NASA datasets named out loud | YouTube link in the Google Form + file in the Local Lead's Google Drive folder |
| **Sat 14 Nov, 09:00** | Final upload of the 30-second video on the NASA site (run of show) | NASA project page |
| **Sat 14 Nov, 12:00** | **Video 3**: the 30-second global video | YouTube or Vimeo, linked in the Google Form **and** the NASA project page |
| Sat 14 Nov, end of event | Treat this as the real deadline for the NASA project page. The global close is 15 Nov (US Eastern) | spaceappschallenge.org → **Submit** |

The guide flags a clash for Video 2 (a "1 November" date vs the 13 Nov 18:30 run of show). Confirm with the Local Lead.

## Eligibility: miss one and we can't win anything

- [x] Answers an official 2026 challenge: *Interplanetary Survival Guide: Martian Map*. Named in the README and the app.
- [x] Public repository: https://github.com/saracen66/the-sol-explorers is public, and its default branch holds the current code. Still open it once in a private window before submitting.
- [x] Uses NASA open data: Viking, MGS MOLA, Mars Odyssey THEMIS, MRO CTX, MRO HiRISE, Mars 2020. See [SUBMISSION_DATA.md](SUBMISSION_DATA.md).
- [x] Open source: Apache 2.0 ([LICENSE](../LICENSE)).
- [ ] Every team member registered on the team's NASA page, **with a photo and their role** (Members tab), plus a team photo. The NASA page lists all four: S.M. Riasijtur Rahman (team owner), MD. Yemtias Jani Mishad, Md Rifat Hasan, Sayma Ferdousi Fariha. Roles still need adding there and in the README.

## The three single points (cheap, often lost)

- [ ] **Challenge category named** on the project page: *Interplanetary Survival Guide: Martian Map*.
- [ ] **Repository access**: the GitHub link opens for a stranger, no login.
- [ ] **Project page complete**: every field filled, then **Submit** pressed. An unsubmitted page is not judged.

## Rules that disqualify or cost marks

- [ ] **Under-18 rule:** no recognisable name, voice or face of anyone under 18 in any video or in the submission.
- [ ] Under-18 members are registered by a parent or guardian, who stays with them at the event.
- [ ] Videos name **every team member** (Video 2 and Video 3).
- [ ] Video 3 is **30 seconds or less**, has **English subtitles**, and is public (test the link in a private window). It cannot be uploaded to the NASA site directly.
- [ ] No NASA logos, insignia or mission patches in the videos or slides.
- [ ] Any AI-generated image, footage or voice in a video carries a visible watermark (see [AI_DISCLOSURE.md](../AI_DISCLOSURE.md)).
- [ ] Every third-party asset, template, music track or font in the videos is credited.

## Project page, field by field (drafts to adapt)

**High-Level Summary**
> Sol Atlas is a 3D Mars map that plans a walk on foot for the first crews and checks whether the astronaut gets home with oxygen to spare. It stacks data from five NASA missions (Viking, MGS MOLA, Mars Odyssey THEMIS, MRO CTX and HiRISE, Mars 2020), the USGS-NASA Geologic Map of Mars and ESA's Mars Express (HRSC) in one view, from the whole planet down to a 6 × 6 km zone of Jezero Crater at 25 cm per pixel, inside one of the Exploration Zones NASA proposed for the first human landings. Start from a science goal, or pick any point, and it finds the route that uses the least oxygen while avoiding slopes too steep to walk, using a published walking-effort model scaled to Mars gravity. It marks the point of no return and, if the plan is short, the exact spot where the suit runs dry, shows that a mayday would take about 14 minutes to reach Earth, and checks NASA's live space-weather forecasts for solar storms heading to Mars. Real Perseverance photos show each stop, and a helmet view lets you walk the real terrain. It runs in any browser, on phones too, with no install.
> 240-second video: *(link)* · Code: https://github.com/saracen66/the-sol-explorers · Live: https://sol-atlas.netlify.app

**Project Demo:** the 30-second video link.

**Final Project:** the GitHub link and the live site.

**Project Details**, three blocks:
1. *The why, the what, the how:* README sections "How it works" and "The science behind the numbers", and every dataset from [SUBMISSION_DATA.md](SUBMISSION_DATA.md).
2. *Community involvement and highlights:* who it helps (mission planners, crews, students), the highlighted features (oxygen-aware routing, point of no return, O₂-out point, helmet view with the real skyline, Perseverance's real drive path), and that it runs on a phone.
3. *Tools and technologies:* three.js, Vite, JavaScript and GLSL; Python with rasterio, NumPy, Pillow and SciPy; Netlify; Playwright for testing; Claude Code for code and documentation.

**GitHub or Drive access:** the repo link. Test it in a private window.

**Use of AI:** paste from [AI_DISCLOSURE.md](../AI_DISCLOSURE.md): the tools, why we used them, the prompts table, and where our own work went.

**NASA data sources used:** paste the "NASA Data" block from [SUBMISSION_DATA.md](SUBMISSION_DATA.md). Judges check it against what the app does, so keep it to what is really used.

**References:** paste the "Space Agency Partner & Other Data" block from [SUBMISSION_DATA.md](SUBMISSION_DATA.md) (software, fonts, papers, the waypoint archive).

## The challenge's Resources tab, compared on 13 Nov 2026

The Resources tab went live on 13 Nov (the team pasted it into the session). Our mentor added that NASA's data and APIs are public, no special Space Apps key is needed, and a free key comes from api.nasa.gov if one is wanted.

| NASA resource | Do we use it? | What to say on the page and in the video |
|---|---|---|
| **JPL's Mars Trek** (trek.nasa.gov) | Not as a source. We use the same Mars 2020 products Trek shows for Jezero (CTX 5 m mosaic and 20 m DEM, HiRISE 25 cm mosaic and 1 m DTM), at full resolution from the USGS archive, so the demo works offline | "Trek shows regional and global views; Sol Atlas goes down to the 6 × 6 km a crew would walk, which the challenge says Trek is not built for." Don't list Trek as a data source |
| **USGS-NASA Planetary Geologic Mapping Program**, geologic map of Mars | **Yes, since 13 Nov:** USGS SIM 3292, *Geologic Map of Mars* (Tanaka et al. 2014), globe layer 4, with the unit and age under the cursor | Name it exactly: "the USGS-NASA Planetary Geologic Mapping Program's Geologic Map of Mars, SIM 3292" |
| **Curiosity's proposed path up Mount Sharp** (example route map) | Our equivalent: the annotated route on the HiRISE map, numbered stops with photos, the point of no return and the O₂-out point. Curiosity's map shows where scientists want to go; ours also checks whether a person on foot gets back | Show the route map in the video next to the phrase "a route map that reaches the science targets" |
| **NASA Worldview** (Earthdata) | No: it is Earth imagery. Nothing on Mars to use | Leave it out |
| **Mars Perseverance raw images** | **Yes:** a raw image from each science stop (sols 16, 249, 502, 690), in the stop card and the photo gallery | "Real Perseverance raw images, so the crew knows what each stop looks like" |
| Mentor's list: **NASA API portal** (api.nasa.gov) | **Yes, since 13 Nov:** DONKI space weather, live, for CMEs forecast to reach Mars | "Live NASA space-weather forecasts in the go/no-go check" |
| Mentor's list: **data.nasa.gov**, **Earthdata** | No dataset there covers our Mars site better than what we use | — |
| Mentor's list: **NASA JPL** | Yes: the Mars 2020 maps (JPL), the MMGIS traverse feed, JPL planetary positions for the signal delay | Already listed |

Also new on 13 Nov, from the same USGS archive: NASA's 2015 proposed **human Exploration Zones**. Jezero sits inside the *Jezero-Isidis-Syrtis* zone: worth one sentence in the video ("a site NASA's own human-mission planners put forward").

- [x] Resource list compared with [SUBMISSION_DATA.md](SUBMISSION_DATA.md) (13 Nov). The geologic map, the Exploration Zones and DONKI were added to the app and the data list.
- [x] Every objective in the statement is answered in the app (see [CHALLENGE_FIT.md](CHALLENGE_FIT.md)).
- [ ] Say the exact names in Video 2 and on the project page: "USGS Geologic Map of Mars, SIM 3292", "NASA DONKI".

## Before the videos and the submission (13 Nov)

- [x] **Publish today's work.** Merged into `claude/busy-heisenberg-8gasem` (the default branch, which Netlify publishes) in https://github.com/saracen66/the-sol-explorers/pull/2.
- [ ] **NASA API key (optional, two minutes).** Get a free key at https://api.nasa.gov ("Generate API Key"). In Netlify: Project configuration → Environment variables → add `NASA_API_KEY`, then redeploy. Without it the live space-weather check uses NASA's `DEMO_KEY`, which allowed only 10 requests an hour per IP on 13 Nov; responses are cached for 30 minutes, so it still works for a small audience. **Never paste the key into the code or the repo.**
- [ ] Open https://sol-atlas.netlify.app on a phone after the deploy: press `4` (geologic map) and `Z` (Exploration Zones) on desktop, and check the "Space weather at Mars" line in the planner.
- [ ] Re-record any footage of the autopilot: it now shows the geologic map and the Exploration Zones (about 110 s).
