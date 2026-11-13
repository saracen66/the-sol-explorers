// Netlify Function: /api/space-weather
// Fetches NASA DONKI's WSA-ENLIL CME forecasts (the last 30 days) for src/lib/spaceweather.js.
// The NASA API key stays on the server: set NASA_API_KEY in Netlify (Site configuration →
// Environment variables); free from https://api.nasa.gov. Without it, DEMO_KEY is used.
// Replies are cached at Netlify's CDN for 30 min, so every visitor shares a few NASA requests.

const day = (t) => new Date(t).toISOString().slice(0, 10);

export default async () => {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const end = Date.now(), start = end - 30 * 86400e3;
  const u = `https://api.nasa.gov/DONKI/WSAEnlilSimulations?startDate=${day(start)}&endDate=${day(end)}&api_key=${key}`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`NASA API answered ${r.status}`);
    const sims = await r.json();
    return Response.json(Array.isArray(sims) ? sims : [], {
      headers: {
        'Cache-Control': 'public, max-age=600',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/api/space-weather' };
