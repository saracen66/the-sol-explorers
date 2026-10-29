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
- [ ] Every team member registered on the team's NASA page, **with a photo and their role** (Members tab), plus a team photo.

## The three single points (cheap, often lost)

- [ ] **Challenge category named** on the project page: *Interplanetary Survival Guide: Martian Map*.
- [ ] **Repository access**: the GitHub link opens for a stranger, no login.
- [ ] **Project page complete**: every field filled, then **Submit** pressed. An unsubmitted page is not judged.

## Rules that disqualify or cost marks

- [ ] **Under-18 rule:** no recognisable name, voice or face of anyone under 18 in any video or in the submission. The repo names one teammate (Sayma) in the README, the code comments, AGENTS.md, PROJECT_LOG.md and AI_DISCLOSURE.md. If she is under 18, those names must come out before submission.
- [ ] Under-18 members are registered by a parent or guardian, who stays with them at the event.
- [ ] Videos name **every team member** (Video 2 and Video 3).
- [ ] Video 3 is **30 seconds or less**, has **English subtitles**, and is public (test the link in a private window). It cannot be uploaded to the NASA site directly.
- [ ] No NASA logos, insignia or mission patches in the videos or slides.
- [ ] Any AI-generated image, footage or voice in a video carries a visible watermark (see [AI_DISCLOSURE.md](../AI_DISCLOSURE.md)).
- [ ] Every third-party asset, template, music track or font in the videos is credited.

## Project page, field by field (drafts to adapt)

**High-Level Summary**
> Sol Atlas is a 3D Mars map that plans a walk on foot for the first crews and checks whether the astronaut gets home with oxygen to spare. It stacks data from five NASA missions (Viking, MGS MOLA, Mars Odyssey THEMIS, MRO CTX and HiRISE, Mars 2020) and ESA's Mars Express (HRSC) in one view, from the whole planet down to a 5 × 5 km zone of Jezero Crater at 25 cm per pixel. Pick any point and it finds the route that uses the least oxygen while avoiding slopes too steep to walk, using a published walking-effort model scaled to Mars gravity. It marks the point of no return and, if the plan is short, the exact spot where the suit runs dry, and shows that a mayday would take about 14 minutes to reach Earth. It runs in any browser, on phones too, with no install and no API key.
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

## Still to check against the full challenge statement

The full statement (with NASA's named datasets) came out on 28 Oct, but spaceappschallenge.org can't be reached from the build machine, so it hasn't been compared yet. Someone on the team should open the challenge page (set **Show Challenges From** to 2026) and:

- [ ] Compare its resource list with [SUBMISSION_DATA.md](SUBMISSION_DATA.md). Where NASA names a product we use, copy NASA's exact name into the form and say it in the video.
- [ ] Check that every objective in the statement is answered somewhere in the app or the pitch.
- [ ] If it names **NASA Mars Trek** (trek.nasa.gov) as the main resource: our CTX and HiRISE layers are the full-resolution Mars 2020 products, taken from the USGS archive instead of Trek's tile server so the demo works offline. Say that in the "NASA data sources used" field. Don't claim Trek as a source unless we actually use it.
