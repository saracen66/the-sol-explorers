// Places shown in Sol Atlas. Coordinates are planetocentric latitude / east longitude (deg).
// `approx: true` marks positions we placed by eye on the CTX/HiRISE mosaics.

export const JEZERO_CENTER = { lat: 18.40, lon: 77.60 };

// Orbit view: landing sites. Only Jezero is unlocked in this first build.
export const LANDING_SITES = [
  {
    id: 'jezero', name: 'Jezero Crater', mission: 'Perseverance · Ingenuity', year: 2021,
    lat: 18.4447, lon: 77.4508, status: 'active',
    blurb: '45 km crater that once held a lake. River delta, carbonates, 10 sample tubes cached at Three Forks.',
  },
  { id: 'gale', name: 'Gale Crater', mission: 'Curiosity', year: 2012, lat: -4.5895, lon: 137.4417, status: 'locked' },
  { id: 'meridiani', name: 'Meridiani Planum', mission: 'Opportunity', year: 2004, lat: -1.9462, lon: -5.5266, status: 'locked' },
  { id: 'gusev', name: 'Gusev Crater', mission: 'Spirit', year: 2004, lat: -14.5684, lon: 175.4726, status: 'locked' },
  { id: 'elysium', name: 'Elysium Planitia', mission: 'InSight', year: 2018, lat: 4.502, lon: 135.623, status: 'locked' },
  { id: 'utopia', name: 'Utopia Planitia', mission: 'Zhurong', year: 2021, lat: 25.066, lon: 109.925, status: 'locked' },
  { id: 'chryse', name: 'Chryse Planitia', mission: 'Viking 1', year: 1976, lat: 22.27, lon: -47.95, status: 'locked' },
  { id: 'aresvallis', name: 'Ares Vallis', mission: 'Pathfinder', year: 1997, lat: 19.13, lon: -33.22, status: 'locked' },
  { id: 'phoenix', name: 'Vastitas Borealis', mission: 'Phoenix', year: 2008, lat: 68.22, lon: -125.75, status: 'locked' },
  {
    id: 'ares3', name: 'Acidalia Planitia', mission: 'Ares III Hab · The Martian (fiction)', year: 2035,
    lat: 31.2, lon: -28.5, status: 'fiction',
    blurb: 'Where Mark Watney got left behind in Andy Weir’s novel. Not a real site, but we plan for the same problem: get home on the oxygen you carry.',
  },
];

// Crater view (≈ 89 × 101 km tile)
export const CRATER_POIS = [
  {
    id: 'oeb', name: 'Octavia E. Butler Landing', kind: 'landing', lat: 18.4447, lon: 77.4508,
    reason: 'Check 5+ years of dust on Perseverance\u2019s landing site',
    text: 'Perseverance touched down here on 18 Feb 2021. The descent imagery, sky-crane and heat-shield debris were all mapped from orbit by HiRISE.',
    source: 'NASA/JPL-Caltech',
    photo: { file: 'photos/oeb.jpg', camera: 'Navcam', sol: 16, date: '7 Mar 2021', credit: 'NASA/JPL-Caltech' },
  },
  {
    id: 'depot', name: 'Three Forks Sample Depot', kind: 'science', lat: 18.45283, lon: 77.40821,
    reason: 'Collect sealed sample tubes for the trip home',
    text: '10 sealed sample tubes laid at the foot of the delta, sols 653–690 (Dec 2022 – Jan 2023), spaced 5–15 m apart in a zig-zag. The backup cache for Mars Sample Return.',
    source: 'NASA PDS Geosciences Node, Mars 2020 Three Forks Depot bundle (rover position at each tube drop)',
    photo: { file: 'photos/depot.jpg', camera: 'Mastcam-Z', sol: 690, date: '28 Jan 2023', credit: 'NASA/JPL-Caltech/ASU', note: 'the day the last tube went down, looking at the delta' },
  },
  {
    id: 'delta', name: 'Western Fan (delta)', kind: 'geology', lat: 18.505, lon: 77.37, approx: true,
    text: 'Layered river-delta sediments deposited ~3.5 billion years ago where Neretva Vallis emptied into the lake. The prime place to look for preserved biosignatures.',
    source: 'Mangold et al. 2021, Science',
  },
  {
    id: 'neretva', name: 'Neretva Vallis', kind: 'geology', lat: 18.545, lon: 77.255, approx: true,
    text: 'The inlet channel that cut through the western rim and fed the lake.',
    source: 'MRO CTX mosaic',
  },
  {
    id: 'pliva', name: 'Pliva Vallis (outlet)', kind: 'geology', lat: 18.71, lon: 78.10, approx: true,
    text: 'Outlet channel breaching the eastern rim. It shows the lake overflowed, so it was an open-basin lake.',
    source: 'MRO CTX mosaic',
  },
  {
    id: 'belva', name: 'Belva crater', kind: 'geology', lat: 18.485, lon: 77.379, approx: true,
    text: '~0.9 km impact crater on top of the delta. Its walls expose a natural cross-section through the delta layers.',
    source: 'MRO HiRISE / CTX',
  },
  {
    id: 'rim', name: 'Western crater rim', kind: 'geology', lat: 18.40, lon: 77.29, approx: true,
    text: 'The rim stands roughly 600 m above the floor and exposes the oldest rocks in the area. Perseverance started climbing it in late 2024.',
    source: 'Mars 2020 CTX DEM (JPL)',
  },
];

// Site (Marswalk zone, 6 × 6 km)
export const SITE_POIS = [
  {
    id: 'lz', name: 'LZ-A · Crew Landing Zone', kind: 'lz', lat: 18.4500, lon: 77.4850, proposed: true,
    reason: 'Airlock: EVA starts and ends here',
    text: 'Our proposed crew landing zone. It sits on flat Máaz lava floor, with a median slope under 3° in the HiRISE DTM, and keeps over 4 km of stand-off so engine plume ejecta cannot reach the sample depot.',
    source: 'Sol Atlas design (HiRISE DTM analysis)',
  },
  CRATER_POIS[0],
  CRATER_POIS[1],
  {
    id: 'seitah', name: 'Séítah', kind: 'geology', lat: 18.43394, lon: 77.44302,
    reason: 'Sample olivine-rich igneous bedrock',
    photo: { file: 'photos/seitah.jpg', camera: 'Navcam', sol: 249, date: '1 Nov 2021', credit: 'NASA/JPL-Caltech' },
    text: 'Ridges of olivine-rich igneous rock broken up by sand ripples. Perseverance parked here on Séítah\u2019s edge for sols 248–278 and cored Coulettes on sol 271, now one of the ten tubes at Three Forks. Tough walking, high science value.',
    source: 'NASA/JPL-Caltech MMGIS waypoints (rover position); PDS Three Forks Depot bundle (sample IDs)',
  },
  {
    id: 'front', name: 'Delta front', kind: 'geology', lat: 18.45887, lon: 77.40613,
    reason: 'Log layered lake sediments for biosignatures',
    photo: { file: 'photos/front.jpg', camera: 'Navcam', sol: 502, date: '19 Jul 2022', credit: 'NASA/JPL-Caltech', note: 'layered rock on the delta front' },
    text: 'The front of the delta: layered sandstone and mudstone laid down in the old lake. Perseverance parked here for sols 477–502 and cored Skyland on sol 495, now one of the ten tubes at Three Forks. The slope layer shows the steep edge to go around.',
    source: 'NASA/JPL-Caltech MMGIS waypoints (rover position); PDS Three Forks Depot bundle (sample IDs)',
  },
];

// Crater view: the two pins the walk connects, plus the big features
export const CRATER_VIEW_POIS = [SITE_POIS[0], ...CRATER_POIS.filter((p) => p.id !== 'oeb')];

// Default Marswalk plan (waypoint ids from SITE_POIS)
export const DEFAULT_PLAN = ['lz', 'oeb', 'depot', 'seitah'];

// Mission goals: start from a science question, and the plan follows from it.
export const MISSION_GOALS = [
  {
    id: 'tour', name: 'Grand tour', plan: DEFAULT_PLAN,
    why: 'The three things only this spot has: Perseverance\u2019s landing site, its sample depot and Séítah\u2019s olivine bedrock, in one loop.',
  },
  {
    id: 'samples', name: 'Bring the samples home', plan: ['lz', 'depot'],
    why: 'Three Forks holds 10 sealed tubes Perseverance left as the backup cache for Mars Sample Return (Dec 2022 – Jan 2023). A crew on foot could collect them: the shortest, safest science walk here. Source: NASA/JPL-Caltech.',
  },
  {
    id: 'igneous', name: 'Date the crater floor', plan: ['lz', 'seitah'],
    why: 'Séítah is olivine-rich igneous rock that settled out of a thick body of melt. Samples from it can date the crater floor, and so the lake that came after it (Liu et al. 2022, Science).',
  },
  {
    id: 'life', name: 'Look for signs of ancient life', plan: ['lz', 'front'],
    why: 'The delta front exposes layered lake sediments, the rocks most likely to have preserved signs of past life (Mangold et al. 2021, Science). The scarp is steep, so the route has to find a way around it.',
  },
];
