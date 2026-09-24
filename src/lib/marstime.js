// Mars time + sun geometry.
// Mars24 algorithm: Allison & McEwen (2000), Planet. Space Sci. 48, 215–235,
// as published by NASA GISS (https://www.giss.nasa.gov/tools/mars24/help/algorithm.html).
// Earth–Mars distance: JPL "Approximate Positions of the Planets" (Standish), 1800–2050 AD elements.

const DEG = Math.PI / 180;
const TT_MINUS_UTC = 69.184; // seconds (32.184 + 37 leap seconds)
const SOL_SECONDS = 88775.244147;

export const JEZERO = { lat: 18.4447, lon: 77.4508 }; // Octavia E. Butler Landing (planetocentric, east)
// Perseverance touched down 2021-02-18 20:55 UTC (sol 0).
const PERSEVERANCE_LANDING_MS = Date.UTC(2021, 1, 18, 20, 55, 0);

function sinD(x) { return Math.sin(x * DEG); }
function mod(a, n) { return ((a % n) + n) % n; }

export function marsTime(ms = Date.now()) {
  const jdUT = ms / 86400000 + 2440587.5;
  const jdTT = jdUT + TT_MINUS_UTC / 86400;
  const dt = jdTT - 2451545.0;
  const M = mod(19.3871 + 0.52402073 * dt, 360);
  const alphaFMS = mod(270.3871 + 0.524038496 * dt, 360);
  const pbs = [
    [0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837],
    [0.0037, 15.7866, 21.736], [0.0021, 2.1354, 15.704], [0.0020, 2.4694, 95.528],
    [0.0018, 32.8493, 49.095],
  ].reduce((s, [A, tau, phi]) => s + A * Math.cos((0.985626 * dt / tau + phi) * DEG), 0);
  const nuM = (10.691 + 3.0e-7 * dt) * sinD(M) + 0.623 * sinD(2 * M) + 0.050 * sinD(3 * M)
    + 0.005 * sinD(4 * M) + 0.0005 * sinD(5 * M) + pbs;
  const Ls = mod(alphaFMS + nuM, 360);
  const eot = 2.861 * sinD(2 * Ls) - 0.071 * sinD(4 * Ls) + 0.002 * sinD(6 * Ls) - nuM; // degrees
  const msd = (dt - 4.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const mtc = mod(24 * msd, 24);
  const decl = Math.asin(0.42565 * sinD(Ls)) / DEG + 0.25 * sinD(Ls);
  const subsolarLonEast = mod(-(mtc * 15 + eot + 180), 360);
  return { ms, msd, mtc, Ls, eot, decl, subsolarLonEast };
}

export function localTime(mt, lonEast) {
  const lmst = mod(mt.mtc + lonEast / 15, 24);
  const ltst = mod(lmst + mt.eot / 15, 24);
  return { lmst, ltst };
}

export function perseveranceSol(ms = Date.now()) {
  const lmsd = (t) => marsTime(t).msd + JEZERO.lon / 360;
  return Math.floor(lmsd(ms)) - Math.floor(lmsd(PERSEVERANCE_LANDING_MS));
}

/** Sun elevation/azimuth (deg, azimuth clockwise from north) at lat, for a given local true solar time (hours). */
export function sunPosition(latDeg, ltstHours, declDeg) {
  const H = (ltstHours - 12) * 15 * DEG;
  const phi = latDeg * DEG;
  const d = declDeg * DEG;
  const sinEl = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const el = Math.asin(sinEl);
  const az = Math.atan2(-Math.sin(H), Math.tan(d) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { elevation: el / DEG, azimuth: mod(az / DEG, 360) };
}

/** Local solar time of sunrise/sunset (hours) for lat/decl. */
export function dayLength(latDeg, declDeg) {
  const c = -Math.tan(latDeg * DEG) * Math.tan(declDeg * DEG);
  if (c <= -1) return { rise: 0, set: 24 };
  if (c >= 1) return { rise: 12, set: 12 };
  const h = Math.acos(c) / DEG / 15;
  return { rise: 12 - h, set: 12 + h };
}

export function formatHM(h) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function season(Ls) {
  // Northern-hemisphere season (Jezero is at 18 N)
  if (Ls < 90) return 'N. Spring';
  if (Ls < 180) return 'N. Summer';
  if (Ls < 270) return 'N. Autumn';
  return 'N. Winter';
}

// --- Earth–Mars light time --------------------------------------------------
const ELEMENTS = {
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
};

function helio(el, T) {
  const [a0, e0, I0, L0, w0, O0, da, de, dI, dL, dw, dO] = el;
  const a = a0 + da * T, e = e0 + de * T, I = (I0 + dI * T) * DEG;
  const L = L0 + dL * T, wbar = w0 + dw * T, O = (O0 + dO * T) * DEG;
  const w = wbar * DEG - O;
  let M = mod(L - wbar + 180, 360) - 180;
  M *= DEG;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    (sw * sI) * xp + (cw * sI) * yp,
  ];
}

export function earthMarsLightTime(ms = Date.now()) {
  const jd = ms / 86400000 + 2440587.5 + TT_MINUS_UTC / 86400;
  const T = (jd - 2451545.0) / 36525;
  const e = helio(ELEMENTS.earth, T), m = helio(ELEMENTS.mars, T);
  const au = Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]);
  const km = au * 149597870.7;
  return { au, km, seconds: km / 299792.458 };
}

export { SOL_SECONDS };
