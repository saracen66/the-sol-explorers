// Live space weather at Mars from NASA's DONKI (Space Weather Database Of Notifications, Knowledge,
// Information), run by the Community Coordinated Modeling Center at NASA Goddard.
//
// Every coronal mass ejection (CME) the forecasters fit is run through the WSA-ENLIL solar-wind model;
// each run lists the planets and spacecraft the CME is predicted to hit, Mars included, with an arrival
// time. We read the last 30 days of runs and keep the latest forecast for each CME that reaches Mars.
//
// Fetch order: our Netlify Function (/api/space-weather, holds a free NASA API key server-side and is
// cached at the CDN), then api.nasa.gov directly with DEMO_KEY. Offline, the check says "not checked";
// nothing else in the app depends on it.

const CACHE_KEY = 'sol-atlas-donki';
const CACHE_MS = 30 * 60 * 1000;
const H = 3600 * 1000;

const day = (t) => new Date(t).toISOString().slice(0, 10);

/** Latest WSA-ENLIL forecast per CME that reaches Mars, plus the ones arriving around now. */
export function summariseEnlil(sims, now = Date.now()) {
  const byCme = new Map();
  for (const s of sims || []) {
    const hit = (s.impactList || []).find((i) => i.location === 'Mars');
    if (!hit) continue;
    const cme = (s.cmeInputs || [])[0] || {};
    const id = cme.CMEID || s.simulationID;
    const run = Date.parse(s.modelCompletionTime);
    const prev = byCme.get(id);
    if (prev && prev.run >= run) continue;
    byCme.set(id, {
      id, run, arrival: Date.parse(hit.arrivalTime), glancing: !!hit.isGlancingBlow,
      launched: Date.parse(cme.cmeStartTime), speed: cme.speed ?? null, link: s.link || null,
    });
  }
  const all = [...byCme.values()].sort((a, b) => a.arrival - b.arrival);
  // "around now": arrived in the last day (may still be passing) or due within three days
  const window = all.filter((c) => c.arrival > now - 24 * H && c.arrival < now + 72 * H);
  return { checked: now, total: all.length, window };
}

function readCache() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.at < CACHE_MS) return c;
  } catch { /* storage blocked */ }
  return null;
}

async function getJSON(u, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** { ok, source, summary } or { ok: false, error }. Never throws. */
export async function fetchSpaceWeather() {
  const c = readCache();
  if (c) return { ok: true, source: c.source, summary: summariseEnlil(c.sims) };
  const end = Date.now(), start = end - 30 * 24 * H;
  const q = `startDate=${day(start)}&endDate=${day(end)}`;
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname); // dev servers have no function
  const tries = [
    ...(local ? [] : [['NASA DONKI via Sol Atlas', `api/space-weather?${q}`]]),
    ['NASA DONKI · api.nasa.gov', `https://api.nasa.gov/DONKI/WSAEnlilSimulations?${q}&api_key=DEMO_KEY`],
  ];
  let error = 'offline';
  for (const [source, u] of tries) {
    try {
      const sims = await getJSON(u);
      if (!Array.isArray(sims)) throw new Error('unexpected reply');
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), source, sims })); } catch { /* storage full or blocked */ }
      return { ok: true, source, summary: summariseEnlil(sims) };
    } catch (e) { error = e.name === 'AbortError' ? 'timed out' : e instanceof TypeError ? 'offline' : e.message; }
  }
  return { ok: false, error };
}

const fmtUTC = (t) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};
const fmtDay = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`; };

/** Short state for the orbit clock and the planner: { lvl: 'ok'|'warn'|'off'|'wait', short, long, link } */
export function describeSpaceWeather(sw, now = Date.now()) {
  if (!sw) return { lvl: 'wait', short: 'checking…', long: 'Checking NASA DONKI for solar storms heading to Mars…' };
  if (!sw.ok) return { lvl: 'off', short: 'not checked', long: `Not checked (${sw.error}). Before egress, check NASA's DONKI space-weather forecasts for CMEs heading to Mars.` };
  const { window, total } = sw.summary;
  if (!window.length) return { lvl: 'ok', short: 'no CME due', long: `No CME forecast to reach Mars in the next 3 days. NASA's model forecast ${total} reaching Mars in the last 30 days.` };
  const c = window.find((x) => x.arrival >= now) || window[window.length - 1];
  const past = c.arrival < now;
  const hrs = Math.round(Math.abs(c.arrival - now) / H);
  const when = past ? `${hrs} h ago, may still be passing` : hrs < 1 ? 'due now' : `due in ${hrs} h`;
  return {
    lvl: 'warn', short: past ? `CME ${hrs} h ago` : `CME ${when}`, link: c.link,
    long: `CME forecast to ${past ? 'have reached' : 'reach'} Mars ${fmtUTC(c.arrival)} (${when}${c.glancing ? ', glancing blow' : ''}), from a ${c.speed ? `${Math.round(c.speed)} km/s ` : ''}CME launched ${fmtDay(c.launched)}.${window.length > 1 ? ` ${window.length - 1} more around the same days.` : ''}`,
  };
}
