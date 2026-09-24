// Marswalk EVA budget: the "Watney math".
//
// Metabolic rate: Pandolf et al. (1977) load-carriage equation
//   M = 1.5 W + 2.0 (W + L)(L / W)^2 + η (W + L)(1.5 V^2 + 0.35 V G)
// scaled for Mars gravity (0.378 g) on the load/locomotion terms, with a
// pressure-suit penalty on locomotion. Walking speed vs grade: Tobler-style.
// O2 use: 1 L O2 ≈ 20.1 kJ of metabolic energy; 1 L O2 = 1.429 g.
// All assumptions are editable in the planner and listed in the README.

export const EVA_DEFAULTS = {
  crewKg: 75,          // astronaut body mass
  suitKg: 58,          // suit + life-support backpack + tools
  terrain: 1.2,        // Pandolf terrain factor (1.0 road … 1.2 loose regolith … 1.5+ sand)
  suitPenalty: 1.35,   // pressurised-suit locomotion penalty
  gRatio: 3.71 / 9.81, // Mars surface gravity / Earth
  vFlat: 0.9,          // m/s on flat ground
  o2CapKg: 0.60,       // usable O2 in the suit (≈ 8 h at a nominal 0.075 kg/h)
  reservePct: 25,      // O2 that must remain at the end of the EVA
  maxSlope: 20,        // deg: hard limit for walking on foot
  stopMin: 20,         // minutes spent at each science stop
  stopW: 190,          // metabolic rate while working at a stop (W)
  evaMaxH: 8,          // suit consumables / crew-fatigue rating
};

const DEG = Math.PI / 180;

export function walkSpeed(gradeRad, p = EVA_DEFAULTS) {
  const v = p.vFlat * Math.exp(-3.5 * Math.abs(Math.tan(gradeRad) + 0.05)) / Math.exp(-3.5 * 0.05);
  return Math.max(0.12, v);
}

export function metabolicW(v, gradePct, p = EVA_DEFAULTS) {
  const W = p.crewKg, L = p.suitKg, eta = p.terrain;
  const rest = 1.5 * W;
  const load = 2.0 * (W + L) * (L / W) ** 2;
  const up = Math.max(gradePct, 0);
  const brake = Math.max(-gradePct, 0) * 0.3; // simplified downhill braking cost
  const loco = eta * (W + L) * (1.5 * v * v + 0.35 * v * (up + brake));
  return rest + (load + loco) * p.gRatio * p.suitPenalty;
}

export const o2KgPerSec = (watts) => (watts / 20100) * 1.429e-3; // J/s ÷ J/L × kg/L

/** Energy-weighted cost of one step (used by A* so the route minimises O2). */
export function stepCost(distM, dhM, p = EVA_DEFAULTS) {
  const g = Math.atan2(dhM, distM);
  const v = walkSpeed(g, p);
  const t = distM / v;
  return metabolicW(v, (dhM / distM) * 100, p) * t; // joules
}

/**
 * Budget a route.
 * @param {Array<{d:number, e:number}>} samples  cumulative distance (m) + elevation (m), dense
 * @param {number[]} stopAt  cumulative distances where science stops happen
 */
export function budget(samples, stopAt, p = EVA_DEFAULTS) {
  let t = 0, o2 = 0, gain = 0, loss = 0, maxSlope = 0;
  const timeline = [{ d: 0, t: 0, o2: 0 }];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dd = b.d - a.d;
    if (dd <= 0) continue;
    const dh = b.e - a.e;
    const g = Math.atan2(dh, dd);
    const v = walkSpeed(g, p);
    const dt = dd / v;
    t += dt;
    o2 += o2KgPerSec(metabolicW(v, (dh / dd) * 100, p)) * dt;
    if (dh > 0) gain += dh; else loss -= dh;
    maxSlope = Math.max(maxSlope, Math.abs(g) / DEG);
    timeline.push({ d: b.d, t, o2 });
  }
  const walkT = t;
  const stopT = stopAt.length * p.stopMin * 60;
  const stopO2 = stopAt.length * o2KgPerSec(p.stopW) * p.stopMin * 60;
  t += stopT;
  o2 += stopO2;
  const reserveKg = p.o2CapKg * p.reservePct / 100;
  const remaining = p.o2CapKg - o2;
  const marginPct = (remaining / p.o2CapKg) * 100;
  return {
    distance: samples.at(-1)?.d || 0, walkT, stopT, totalT: t, o2, remaining, marginPct, reserveKg,
    gain, loss, maxSlope, timeline, avgW: o2 / t / o2KgPerSec(1),
  };
}

export function verdict(b, sun, p = EVA_DEFAULTS) {
  const issues = [];
  if (b.remaining < b.reserveKg) issues.push({ lvl: 'nogo', msg: `O₂ reserve breached: ${Math.max(0, b.remaining).toFixed(3)} kg left at the airlock, ${b.reserveKg.toFixed(3)} kg required` });
  else if (b.marginPct < p.reservePct + 15) issues.push({ lvl: 'caution', msg: `Thin O₂ margin: ${b.marginPct.toFixed(0)} % left at return` });
  if (b.totalT / 3600 > p.evaMaxH) issues.push({ lvl: 'nogo', msg: `EVA ${(b.totalT / 3600).toFixed(1)} h exceeds the ${p.evaMaxH} h suit rating` });
  if (b.maxSlope > p.maxSlope) issues.push({ lvl: 'nogo', msg: `Route crosses ${b.maxSlope.toFixed(0)}° ground (limit ${p.maxSlope}°)` });
  else if (b.maxSlope > p.maxSlope * 0.75) issues.push({ lvl: 'caution', msg: `Steep sections up to ${b.maxSlope.toFixed(0)}°` });
  if (sun && sun.endMarginH < 0) issues.push({ lvl: 'nogo', msg: 'EVA ends after sunset' });
  else if (sun && sun.endMarginH < 0.75) issues.push({ lvl: 'caution', msg: 'Less than 45 min of daylight margin' });
  const lvl = issues.some((i) => i.lvl === 'nogo') ? 'nogo' : issues.length ? 'caution' : 'go';
  return { lvl, issues };
}
