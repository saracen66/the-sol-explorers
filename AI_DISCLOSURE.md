# AI use disclosure

NASA Space Apps allows AI tools, as long as teams say where and how they were used. This file is that statement for **Sol Atlas** (The SOL Explorers, NASA Space Apps Challenge 2026). The same disclosure is in the README, in the page's metadata, in `package.json`, and on screen in the app's **DATA SOURCES** window.

## What AI was used for

| Part of the project | AI involvement |
|---|---|
| **Application code** (JavaScript, GLSL shaders, HTML, CSS in `src/` and `index.html`) | Written by an AI coding assistant, **Claude Code (Anthropic)**, following the team's instructions. The team set the goals and features, tested each version, and asked for fixes. |
| **Data-processing pipeline** (`scripts/build_data.py`) | Written by the AI assistant, which also ran it to convert the NASA files. The pipeline only resamples, crops and colour-maps NASA data; it does not invent values. |
| **Test scripts** (`scripts/smoke.cjs`) | Written by the AI assistant. |
| **Documentation** (README, AGENTS.md, PROJECT_LOG.md, this file, the in-app text and place descriptions) | Drafted by the AI assistant. The place descriptions summarise the published sources cited next to them. |
| **Pitch script and background research** | Drafted with the help of an AI assistant (Claude). |
| **Commit history** | Every commit written with the assistant ends with a `Co-Authored-By: Claude …` line, so the git history itself records AI involvement. |

## Why we used AI

A working 3D map on real NASA data is a lot of code for a student team in a short time. The AI assistant wrote that code, so the team's own time went into what the project is about: the survival question we answer (will the astronaut get home with oxygen to spare?), choosing the NASA data, the planning rules, and testing on our own phones and computers.

## The prompts we gave

The assistant worked from plain-language requests by the team, given over several sessions. Each request, and what came of it, is in [PROJECT_LOG.md](PROJECT_LOG.md). The main ones:

| Date | What we asked for (summarised) | What the AI worked on |
|---|---|---|
| 24 Sep 2026 | Build *Sol Atlas* from our pitch script: a rotating real-data Mars, zoom into Jezero Crater, then a game-style map where you plan a walk from a landing zone to the Three Forks sample depot and check the oxygen. Use real NASA data only. | NASA/USGS map files (Viking, MOLA, THEMIS, CTX, HiRISE), our pitch script |
| 24 Sep 2026 | The desktop lags in transitions and the phone freezes; make it run on phones and fix the phone layout. | The app code |
| 25 Sep 2026 | Review a teammate's prototype and take anything good; add more real data; make EV1 stop where the oxygen runs out; route to any point, like a maps app; add a first-person view; push each feature when it is done. | The teammate's prototype code, the Perseverance waypoint archive |
| 25 Sep 2026 | Fix the bugs we found in testing (autopilot would not stop, hidden hover cards, dead buttons), make the helmet view work on phones with joysticks, and keep a record another person or AI can pick up. | The app code, our bug reports |
| 28 Sep 2026 | Is all the data real and reliable? Is there newer data? Are we following NASA's guidelines? | Space Apps rules (via web search), the data links |
| 29 Oct 2026 | Check the project against the Participants Guide and the challenge, and do what is needed. | The Bangladesh Participants Guide, a build guide for the 14 challenges |

## Where our own work went

- **The idea and the story:** the survival question, the *Martian* hook, Jezero as the site and the walk to Three Forks came from our pitch script.
- **The choices:** which datasets to use, the suit and walking assumptions, the proposed crew landing zone LZ-A, what to show and what to cut, and when to hide a feature.
- **Testing and review:** we ran every build on our own computers and phones, reported the bugs, and decided whether each fix was right.
- **The pitch and the videos:** the script was drafted with AI help (see the table above), but we edit it, present it and record the videos ourselves.

## What is not AI-generated

- **All map data is real NASA mission data**: Viking, Mars Global Surveyor MOLA, Mars Odyssey THEMIS, MRO CTX, MRO HiRISE and Mars 2020 Perseverance. The full list, with the exact files, is in [docs/SUBMISSION_DATA.md](docs/SUBMISSION_DATA.md). No terrain, image or measurement in the app was produced by an AI model.
- **No AI-generated images, video or audio** are used anywhere in the app or the repository. The screenshots in `docs/screenshots/` are captures of the running app, which renders the NASA data. The sound effects are generated live by ordinary code (Web Audio oscillators and filtered noise), not by an AI audio model.
- **The app calls no AI service at runtime.** It works offline once loaded and needs no API key.
- **No NASA logos, insignia or mission patches** are used. Mission and instrument names appear only as data credits.

## Checklist for the team (pitch video and submission)

- [ ] In the submission form, point to this file (or paste its first table) wherever AI use is asked about.
- [ ] If the pitch video uses any **AI-generated images, footage or voice-over** (for example text-to-speech), add a **visible watermark** saying it is AI-generated, and mention AI generation in the video's description or metadata. Screen recordings of the app itself are not AI-generated imagery.
- [ ] If the teammate's early prototype or its images are shown anywhere, watermark those images: they are AI-generated. Some are also labelled as HiRISE photos, which they are not.
- [ ] Keep NASA logos and mission patches out of the video and the slides.
