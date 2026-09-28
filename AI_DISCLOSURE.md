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

## What is not AI-generated

- **All map data is real NASA mission data**: Viking, Mars Global Surveyor MOLA, Mars Odyssey THEMIS, MRO CTX, MRO HiRISE and Mars 2020 Perseverance. The full list, with the exact files, is in [docs/SUBMISSION_DATA.md](docs/SUBMISSION_DATA.md). No terrain, image or measurement in the app was produced by an AI model.
- **No AI-generated images, video or audio** are used anywhere in the app or the repository. The screenshots in `docs/screenshots/` are captures of the running app, which renders the NASA data. The sound effects are generated live by ordinary code (Web Audio oscillators and filtered noise), not by an AI audio model.
- **The app calls no AI service at runtime.** It works offline once loaded and needs no API key.
- **No NASA logos, insignia or mission patches** are used. Mission and instrument names appear only as data credits.

## Checklist for the team (pitch video and submission)

- [ ] In the submission form, point to this file (or paste its first table) wherever AI use is asked about.
- [ ] If the pitch video uses any **AI-generated images, footage or voice-over** (for example text-to-speech), add a **visible watermark** saying it is AI-generated, and mention AI generation in the video's description or metadata. Screen recordings of the app itself are not AI-generated imagery.
- [ ] If Sayma's prototype or its images are shown anywhere, watermark those images: they are AI-generated. Some are also labelled as HiRISE photos, which they are not.
- [ ] Keep NASA logos and mission patches out of the video and the slides.
